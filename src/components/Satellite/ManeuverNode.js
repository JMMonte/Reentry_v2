import * as THREE from 'three';
import { adaptiveIntegrate } from '../../utils/OrbitIntegrator.js';
import { Constants } from '../../utils/Constants.js';
import { OrbitPath } from './OrbitPath.js';

export class ManeuverNode {
    constructor({ satellite, time, deltaV }) {
        this.satellite = satellite;
        this.time = time; // Date instance for maneuver execution
        this.deltaV = deltaV.clone();
        this.scene = satellite.scene;
        this.app3d = satellite.app3d;
        this.orbitPath = satellite.orbitPath;
        this._initVisual();
        this._initPredictionOrbit();
    }

    _initPredictionOrbit() {
        // Create a predicted orbit path post-maneuver
        ManeuverNode._predCount = (ManeuverNode._predCount || 0) + 1;
        this.predictionId = `${this.satellite.id}-maneuverPred-${ManeuverNode._predCount}`;
        this.predictedOrbit = new OrbitPath(this.satellite.color);
        this.scene.add(this.predictedOrbit.orbitLine);
        // Make predicted orbit line dashed
        this.predictedOrbit.orbitLine.material = new THREE.LineDashedMaterial({
            color: this.satellite.color,
            dashSize: 5,
            gapSize: 5,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });
        // Recompute dashed-line distances whenever the predicted orbit updates
        this._predOrbitHandler = (e) => {
            if (e.detail.id === this.predictionId) {
                const geom = this.predictedOrbit.orbitLine.geometry;
                const posAttr = geom.attributes.position;
                const count = posAttr.count;
                const lineDistances = new Float32Array(count);
                for (let i = 0; i < count; i++) {
                    if (i === 0) {
                        lineDistances[i] = 0;
                    } else {
                        const x1 = posAttr.getX(i - 1), y1 = posAttr.getY(i - 1), z1 = posAttr.getZ(i - 1);
                        const x2 = posAttr.getX(i),     y2 = posAttr.getY(i),     z2 = posAttr.getZ(i);
                        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
                        lineDistances[i] = lineDistances[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
                    }
                }
                geom.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));
                geom.attributes.lineDistance.needsUpdate = true;
            }
        };
        document.addEventListener('orbitDataUpdate', this._predOrbitHandler);
        // Sync visibility with showOrbits setting
        this._predVisibilityHandler = (e) => {
            if (e.detail.key === 'showOrbits') {
                this.predictedOrbit.setVisible(e.detail.value);
            }
        };
        this.app3d.addEventListener('displaySettingChanged', this._predVisibilityHandler);
        this.predictedOrbit.setVisible(this.app3d.getDisplaySetting('showOrbits'));
        // Update predicted orbit when user changes prediction parameters
        this._paramChangeHandler = (e) => {
            if (e.detail.key === 'orbitPredictionInterval' || e.detail.key === 'orbitPointsPerOrbit') {
                this.update();
            }
        };
        this.app3d.addEventListener('displaySettingChanged', this._paramChangeHandler);
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
        const saturation = 10;     // saturation constant for ΔV (m/s)
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
        const dir = this.deltaV.clone().lengthSq() > 0 ? this.deltaV.clone().normalize() : new THREE.Vector3(1,0,0);
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
        const factor = 1 / (Constants.metersToKm * Constants.scale);
        // Gravity bodies in MKS
        const earthBody = { position: { x: 0, y: 0, z: 0 }, mass: Constants.earthMass };
        const moonBody = (() => {
            const b = { position: { x: 0, y: 0, z: 0 }, mass: Constants.moonMass };
            if (this.app3d.moon) {
                const m = new THREE.Vector3();
                (this.app3d.moon.getMesh ? this.app3d.moon.getMesh() : this.app3d.moon.moonMesh).getWorldPosition(m);
                b.position = { x: m.x * factor, y: m.y * factor, z: m.z * factor };
            }
            return b;
        })();
        const sunBody = (() => {
            const b = { position: { x: 0, y: 0, z: 0 }, mass: Constants.sunMass };
            if (this.app3d.sun) {
                const s = new THREE.Vector3();
                (this.app3d.sun.getMesh ? this.app3d.sun.getMesh() : this.app3d.sun.sunLight).getWorldPosition(s);
                b.position = { x: s.x * factor, y: s.y * factor, z: s.z * factor };
            }
            return b;
        })();
        const bodiesAll = [earthBody, moonBody, sunBody];
        const pertScale = window.app3d?.getDisplaySetting('perturbationScale') ?? 1.0;
        // Initial MKS state arrays from current satellite state
        let prevTime = simTime;
        let posArr = [this.satellite.position.x, this.satellite.position.y, this.satellite.position.z];
        let velArr = [this.satellite.velocity.x, this.satellite.velocity.y, this.satellite.velocity.z];
        // Collect maneuvers up to this one (including preview node)
        const allNodes = [...this.satellite.maneuverNodes];
        if (!allNodes.includes(this)) allNodes.push(this);
        allNodes.sort((a, b) => a.time - b.time);
        // Integrate forward and apply each burn
        for (const nd of allNodes) {
            if (nd.time.getTime() > this.time.getTime()) break;
            const dtSeg = (nd.time.getTime() - prevTime.getTime()) / 1000;
            if (dtSeg > 0) {
                const result = adaptiveIntegrate(posArr, velArr, dtSeg, bodiesAll, pertScale);
                posArr = result.pos;
                velArr = result.vel;
            }
            // Apply ΔV in m/s
            velArr[0] += nd.deltaV.x;
            velArr[1] += nd.deltaV.y;
            velArr[2] += nd.deltaV.z;
            prevTime = nd.time;
        }
        // Update node position in Three.js units
        const scaleK = Constants.metersToKm * Constants.scale;
        this.group.position.set(posArr[0] * scaleK, posArr[1] * scaleK, posArr[2] * scaleK);
        // Predict post-burn orbit via shared worker
        const velVec = new THREE.Vector3(velArr[0], velArr[1], velArr[2]);
        const posVec = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
        const bodiesForWorker = bodiesAll.map(b => ({ position: new THREE.Vector3(b.position.x, b.position.y, b.position.z), mass: b.mass }));
        // Compute period window: try Keplerian period after burn, then original, then one-day fallback
        const mu = Constants.G * Constants.earthMass;
        const rMag = posVec.length();
        const vMag = velVec.length();
        const energy = 0.5 * vMag * vMag - mu / rMag;
        let keplerPeriod = 0;
        if (energy < 0) {
            const a = -mu / (2 * energy);
            if (a > 0) keplerPeriod = 2 * Math.PI * Math.sqrt(a * a * a / mu);
        }
        const origPeriod = this.satellite.getOrbitalElements()?.period;
        let basePeriod;
        if (keplerPeriod > 0) {
            basePeriod = keplerPeriod;
        } else if (typeof origPeriod === 'number' && origPeriod > 0) {
            basePeriod = origPeriod;
        } else {
            basePeriod = 24 * 3600; // one-day fallback in seconds
        }
        const predPeriods = this.app3d.getDisplaySetting('orbitPredictionInterval');
        const periodFactor = (typeof predPeriods === 'number' && predPeriods > 0) ? predPeriods : 1;
        const windowSeconds = basePeriod * periodFactor;
        const ptsPerPeriod = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
        const numPts = Math.ceil(ptsPerPeriod * periodFactor);
        // Issue path update
        this.predictedOrbit.update(
            posVec,
            velVec,
            this.predictionId,
            bodiesForWorker,
            windowSeconds,
            numPts
        );
        // Arrow orientation along deltaV direction
        const dvMag = this.deltaV.length();
        if (dvMag > 0) {
            const dvHat = this.deltaV.clone().normalize();
            this.arrow.visible = true;
            this.arrow.setDirection(dvHat);
        } else {
            this.arrow.visible = false;
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
        if (this.predictedOrbit) {
            this.scene.remove(this.predictedOrbit.orbitLine);
            this.predictedOrbit.dispose();
            // Remove listeners
            document.removeEventListener('orbitDataUpdate', this._predOrbitHandler);
            this.app3d.removeEventListener('displaySettingChanged', this._predVisibilityHandler);
            this.app3d.removeEventListener('displaySettingChanged', this._paramChangeHandler);
        }
    }
} 