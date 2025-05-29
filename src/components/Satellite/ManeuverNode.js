import * as THREE from 'three';
import { integrateRK45 } from '../../physics/integrators/OrbitalIntegrators.js';
import { GravityCalculator } from '../../physics/core/GravityCalculator.js';
import { Constants } from '../../utils/Constants.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';

export class ManeuverNode {
    constructor({ satellite, time, deltaV }) {
        this.satellite = satellite;
        this.time = time; // Date instance for maneuver execution
        this.deltaV = deltaV.clone();
        this.scene = satellite.scene;
        this.app3d = satellite.app3d;
        this._initVisual();
        this._initPredictionOrbit();
    }

    _initPredictionOrbit() {
        // Create a predicted orbit path post-maneuver
        ManeuverNode._predCount = (ManeuverNode._predCount || 0) + 1;
        this.predictionId = `${this.satellite.id}-maneuverPred-${ManeuverNode._predCount}`;
        
        // Create orbit line geometry
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineDashedMaterial({
            color: this.satellite.color,
            dashSize: 5,
            gapSize: 5,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });
        
        this.predictedOrbitLine = new THREE.Line(geometry, material);
        this.predictedOrbitLine.frustumCulled = false;
        this.predictedOrbitLine.computeLineDistances();
        this.scene.add(this.predictedOrbitLine);
        
        // Atmosphere crossing markers
        this._atmMarkers = [];
        this._atmMarkerGroup = new THREE.Group();
        this.scene.add(this._atmMarkerGroup);
        
        // Store predicted orbit points
        this._predictedOrbitPoints = [];
        
        // Create our own worker for prediction
        this._predictionWorker = new Worker(
            new URL('../../workers/orbitPropagationWorker.js', import.meta.url),
            { type: 'module' }
        );
        
        // Handle worker messages
        this._predictionWorker.onmessage = (event) => {
            const { type, points, isComplete } = event.data;
            
            if (type === 'chunk') {
                // Accumulate points
                this._predictedOrbitPoints.push(...points);
                
                // Update visualization
                this._updatePredictedOrbitVisualization();
                
                if (isComplete) {
                    // Final update with atmosphere markers
                    this._updateAtmosphereMarkers();
                }
            } else if (type === 'error') {
                console.error('Maneuver prediction error:', event.data.error);
            }
        };
        
        // Update worker physics state when available
        if (this.app3d?.physicsIntegration?.physicsEngine) {
            const state = this.app3d.physicsIntegration.physicsEngine.getSimulationState();
            const simplifiedBodies = {};
            
            for (const [id, body] of Object.entries(state.bodies)) {
                simplifiedBodies[id] = {
                    position: body.position,
                    velocity: body.velocity,
                    mass: body.mass,
                    soiRadius: body.soiRadius
                };
            }
            
            this._predictionWorker.postMessage({
                type: 'updatePhysicsState',
                data: {
                    bodies: simplifiedBodies,
                    hierarchy: state.hierarchy
                }
            });
        }
        
        // Sync visibility with showOrbits setting
        this._predVisibilityHandler = (e) => {
            if (e.detail.key === 'showOrbits') {
                this.predictedOrbitLine.visible = e.detail.value;
                this._atmMarkerGroup.visible = e.detail.value;
            }
        };
        this.app3d.addEventListener('displaySettingChanged', this._predVisibilityHandler);
        
        const showOrbits = this.app3d.getDisplaySetting('showOrbits');
        this.predictedOrbitLine.visible = showOrbits;
        this._atmMarkerGroup.visible = showOrbits;
        
        // Update predicted orbit when user changes prediction parameters
        this._paramChangeHandler = (e) => {
            if (e.detail.key === 'orbitPredictionInterval' || e.detail.key === 'orbitPointsPerPeriod') {
                this.update();
            }
        };
        this.app3d.addEventListener('displaySettingChanged', this._paramChangeHandler);
    }

    _updatePredictedOrbitVisualization() {
        if (this._predictedOrbitPoints.length < 2) return;
        
        // Convert points to positions array
        const positions = [];
        for (const point of this._predictedOrbitPoints) {
            positions.push(point.position[0], point.position[1], point.position[2]);
        }
        
        // Update geometry
        this.predictedOrbitLine.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.predictedOrbitLine.geometry.computeBoundingSphere();
        this.predictedOrbitLine.computeLineDistances();
    }
    
    _updateAtmosphereMarkers() {
        // Clear previous markers
        this._atmMarkers.forEach(m => {
            this._atmMarkerGroup.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        });
        this._atmMarkers = [];
        
        // Find atmosphere crossings (100km above surface)
        const boundary = Constants.earthRadius + 100000;
        let inside = false;
        let entryPos, exitPos;
        
        for (let i = 1; i < this._predictedOrbitPoints.length; i++) {
            const p0 = new THREE.Vector3(...this._predictedOrbitPoints[i - 1].position);
            const p1 = new THREE.Vector3(...this._predictedOrbitPoints[i].position);
            const r0 = p0.length();
            const r1 = p1.length();
            
            if (!inside && r0 > boundary && r1 <= boundary) {
                entryPos = p1.clone();
                inside = true;
            }
            if (inside && r0 <= boundary && r1 > boundary) {
                exitPos = p1.clone();
                break;
            }
        }
        
        // Create markers
        [entryPos, exitPos].forEach(pos => {
            if (pos) {
                const sphereGeom = new THREE.SphereGeometry(1, 8, 8);
                const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                const marker = new THREE.Mesh(sphereGeom, sphereMat);
                marker.position.copy(pos);
                this._atmMarkerGroup.add(marker);
                this._atmMarkers.push(marker);
            }
        });
    }

    _initVisual() {
        // Create marker sphere (unit size)
        const sphereGeom = new THREE.SphereGeometry(1, 8, 8);
        // semi-transparent sphere, same size principle as SatelliteVisualizer
        const sphereMat = new THREE.MeshBasicMaterial({ color: this.satellite.color, transparent: true, opacity: 0.5, depthWrite: false });
        this.mesh = new THREE.Mesh(sphereGeom, sphereMat);
        // camera-relative scaling for sphere and arrow length (constant screen-based)
        const targetSize = 0.005;  // matched to SatelliteVisualizer
        const arrowScale = 20;     // arrow length on screen units
        const saturation = 10;     // saturation constant for ΔV (km/s)
        this.mesh.onBeforeRender = (renderer, scene, camera) => {
            const dist = camera.position.distanceTo(this.mesh.position);
            const scale = dist * targetSize;
            this.mesh.scale.set(scale, scale, scale);
            const mag = this.deltaV.length();
            if (mag > 0) {
                const factor = mag / (mag + saturation);
                this.arrow.setLength(scale * arrowScale * factor);
                this.arrow.visible = true;
            } else {
                this.arrow.visible = false;
            }
        };

        // Create arrow for deltaV direction (unit length)
        const dir = this.deltaV.clone().lengthSq() > 0 ? this.deltaV.clone().normalize() : new THREE.Vector3(1, 0, 0);
        this.arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), 1, this.satellite.color);

        // Group mesh and arrow for positioning
        this.group = new THREE.Group();
        this.group.add(this.mesh);
        this.group.add(this.arrow);
        // attach to the satellite's maneuver group
        this.satellite.maneuverGroup.add(this.group);
    }

    update() {
        // Compute current integration state through all burns up to this node
        const simTime = this.app3d.timeUtils.getSimulatedTime();
        // Gravity bodies in MKS
        const earthBody = { position: { x: 0, y: 0, z: 0 }, mass: Constants.earthMass };
        const moonBody = (() => {
            const b = { position: { x: 0, y: 0, z: 0 }, mass: Constants.moonMass };
            if (this.app3d.moon) {
                const m = new THREE.Vector3();
                (this.app3d.moon.getMesh ? this.app3d.moon.getMesh() : this.app3d.moon.moonMesh).getWorldPosition(m);
                b.position = { x: m.x, y: m.y, z: m.z };
            }
            return b;
        })();
        const sunBody = (() => {
            const b = { position: { x: 0, y: 0, z: 0 }, mass: Constants.sunMass };
            if (this.app3d.sun) {
                const s = new THREE.Vector3();
                (this.app3d.sun.getMesh ? this.app3d.sun.getMesh() : this.app3d.sun.sunLight).getWorldPosition(s);
                b.position = { x: s.x, y: s.y, z: s.z };
            }
            return b;
        })();
        const bodiesAll = [earthBody, moonBody, sunBody];
        const pertScale = window.app3d?.getDisplaySetting('perturbationScale') ?? 1.0;
        // Initial state vectors (in km*scale)
        let prevTime = simTime;
        let posArr = [this.satellite.position.x, this.satellite.position.y, this.satellite.position.z];
        let velArr = [this.satellite.velocity.x, this.satellite.velocity.y, this.satellite.velocity.z];
        // Process all maneuver burns up to this node in order
        const allNodes = [...this.satellite.maneuverNodes];
        if (!allNodes.includes(this)) allNodes.push(this);
        allNodes.sort((a, b) => a.time - b.time);
        let dvWorldThis = new THREE.Vector3();
        for (const nd of allNodes) {
            if (nd.time.getTime() > this.time.getTime()) break;
            // Integrate orbital motion until this burn
            const dtSeg = (nd.time.getTime() - prevTime.getTime()) / 1000;
            if (dtSeg > 0) {
                // Simple integration to burn time - we'll use RK45 for accuracy
                const pos = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
                const vel = new THREE.Vector3(velArr[0], velArr[1], velArr[2]);
                const accelFunc = (p, v) => {
                    return GravityCalculator.computeAcceleration(p, bodiesAll, {
                        perturbationScale: pertScale
                    });
                };
                const result = integrateRK45(pos, vel, accelFunc, dtSeg);
                posArr = [result.position.x, result.position.y, result.position.z];
                velArr = [result.velocity.x, result.velocity.y, result.velocity.z];
            }
            // Compute instantaneous orbital frame at burn time
            const posVec = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
            const velVec = new THREE.Vector3(velArr[0], velArr[1], velArr[2]);
            const vHat = velVec.clone().normalize();    // prograde
            const rHat = posVec.clone().normalize();    // radial
            const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize(); // normal
            // Use user-defined localDV at this node
            const localDV = nd.localDV ? nd.localDV.clone() : new THREE.Vector3();
            // Convert local DV to world DV
            const dvWorld = new THREE.Vector3()
                .addScaledVector(vHat, localDV.x)
                .addScaledVector(rHat, localDV.y)
                .addScaledVector(hHat, localDV.z);
            // Apply burn to velocity
            velArr[0] += dvWorld.x;
            velArr[1] += dvWorld.y;
            velArr[2] += dvWorld.z;
            prevTime = nd.time;
            // If this is the current node, store its world DV for arrow
            if (nd === this) dvWorldThis.copy(dvWorld);
            // Also copy to node.deltaV for consistent world DV
            nd.deltaV.copy(dvWorld);
        }
        // Update node position in Three.js units
        this.group.position.set(posArr[0], posArr[1], posArr[2]);
        
        // Predict post-burn orbit via shared worker
        const posVec = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
        const velVec = new THREE.Vector3(velArr[0], velArr[1], velArr[2]);
        const bodiesForWorker = bodiesAll.map(b => ({ position: new THREE.Vector3(b.position.x, b.position.y, b.position.z), mass: b.mass }));
        
        // --- Calculate POST-BURN orbital elements for period calculation --- 
        const postBurnOE = PhysicsUtils.calculateDetailedOrbitalElements(
            posVec, 
            velVec, 
            Constants.earthGravitationalParameter
        );
        const isHyperbolic = postBurnOE && postBurnOE.eccentricity >= 1;
        const isNearParabolic = postBurnOE && !isHyperbolic && postBurnOE.eccentricity >= 0.99; // Check for near-parabolic

        // UI settings
        const fallbackDays = this.app3d.getDisplaySetting('nonKeplerianFallbackDays') ?? 30;
        const hyperMultiplier = this.app3d.getDisplaySetting('hyperbolicPointsMultiplier') ?? 1;
        let periodSec, numPts;
        
        // Use fixed window for hyperbolic AND near-parabolic orbits
        if (isHyperbolic || isNearParabolic) {
            periodSec = fallbackDays * Constants.secondsInDay;
            const ptsPer = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
            // Use hyperMultiplier for near-parabolic as well for denser sampling near Earth
            numPts = Math.ceil(ptsPer * fallbackDays * hyperMultiplier); 
        } else {
            // Normal Elliptical: use POST-BURN orbital period scaled by prediction periods
            const predPeriods = this.app3d.getDisplaySetting('orbitPredictionInterval');
            const periodFactor = (typeof predPeriods === 'number' && predPeriods > 0) ? predPeriods : 1;
            // Use computed POST-BURN period or fallback
            const basePeriod = (postBurnOE && postBurnOE.period > 0 && isFinite(postBurnOE.period))
                ? postBurnOE.period
                : (fallbackDays * Constants.secondsInDay);
            periodSec = basePeriod * periodFactor;
            const ptsPer = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
            numPts = Math.ceil(ptsPer * periodFactor);
        }
        // Update predicted orbit from post-burn state (throttled)
        const nowPerf = performance.now();
        if (!this._lastPredTime || nowPerf - this._lastPredTime > 100) {
            // Clear previous points
            this._predictedOrbitPoints = [];
            
            // Send propagation request to worker
            const timeStep = periodSec / numPts;
            this._predictionWorker.postMessage({
                type: 'propagate',
                data: {
                    satelliteId: this.predictionId,
                    position: [posVec.x, posVec.y, posVec.z],
                    velocity: [velVec.x, velVec.y, velVec.z],
                    centralBodyNaifId: this.satellite.centralBodyNaifId || 399, // Earth by default
                    duration: periodSec,
                    timeStep: timeStep
                }
            });
            
            this._lastPredTime = nowPerf;
        }
        // Arrow orientation: use the computed world ΔV vector for this node
        const mag = dvWorldThis.length();
        this.arrow.visible = mag > 0;
        if (mag > 0) {
            this.arrow.setDirection(dvWorldThis.clone().normalize());
        }
    }

    dispose() {
        if (this.mesh) {
            this.group.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.arrow) {
            this.group.remove(this.arrow);
            if (this.arrow.line) {
                this.arrow.line.geometry.dispose();
                this.arrow.line.material.dispose();
            }
            if (this.arrow.cone) {
                this.arrow.cone.geometry.dispose();
                this.arrow.cone.material.dispose();
            }
        }
        this.scene.remove(this.group);
        // Dispose predicted orbit line
        if (this.predictedOrbitLine) {
            this.scene.remove(this.predictedOrbitLine);
            this.predictedOrbitLine.geometry.dispose();
            this.predictedOrbitLine.material.dispose();
        }
        
        // Remove atmosphere markers
        if (this._atmMarkerGroup) {
            this.scene.remove(this._atmMarkerGroup);
            this._atmMarkers.forEach(m => { 
                m.geometry.dispose(); 
                m.material.dispose(); 
            });
        }
        
        // Clean up worker
        if (this._predictionWorker) {
            this._predictionWorker.terminate();
        }
        
        // Remove listeners
        if (this._predVisibilityHandler) {
            this.app3d.removeEventListener('displaySettingChanged', this._predVisibilityHandler);
        }
        if (this._paramChangeHandler) {
            this.app3d.removeEventListener('displaySettingChanged', this._paramChangeHandler);
        }
    }
} 