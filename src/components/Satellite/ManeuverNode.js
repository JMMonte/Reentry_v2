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
        // Atmosphere crossing markers
        this._atmMarkers = [];
        this._atmMarkerGroup = new THREE.Group();
        this.scene.add(this._atmMarkerGroup);
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
                        const x2 = posAttr.getX(i), y2 = posAttr.getY(i), z2 = posAttr.getZ(i);
                        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
                        lineDistances[i] = lineDistances[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
                    }
                }
                geom.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));
                geom.attributes.lineDistance.needsUpdate = true;
                // Detect atmosphere entry/exit (100 km above surface)
                const flatPts = e.detail.orbitPoints;
                const pts = [];
                if (flatPts && flatPts.length > 0) {
                    for (let i = 0; i < flatPts.length; i += 3) {
                        if (i + 2 < flatPts.length) { // Ensure we have x, y, and z
                            pts.push(new THREE.Vector3(flatPts[i], flatPts[i + 1], flatPts[i + 2]));
                        }
                    }
                }
                const boundary = (Constants.earthRadius + 100000) * Constants.metersToKm * Constants.scale;
                // clear previous markers
                this._atmMarkers.forEach(m => { this._atmMarkerGroup.remove(m); m.geometry.dispose(); m.material.dispose(); });
                this._atmMarkers = [];
                let inside = false;
                let entryPos, exitPos;
                for (let i = 1; i < pts.length; i++) {
                    const r0 = pts[i - 1].length();
                    const r1 = pts[i].length();
                    if (!inside && r0 > boundary && r1 <= boundary) {
                        entryPos = pts[i].clone(); inside = true;
                    }
                    if (inside && r0 <= boundary && r1 > boundary) {
                        exitPos = pts[i].clone(); break;
                    }
                }
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
            if (e.detail.key === 'orbitPredictionInterval' || e.detail.key === 'orbitPointsPerPeriod') {
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
                const res = adaptiveIntegrate(posArr, velArr, dtSeg, bodiesAll, pertScale);
                posArr = res.pos;
                velArr = res.vel;
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
            basePeriod = Constants.secondsInDay * 10; // thirty-day fallback in seconds
        }
        const predPeriods = this.app3d.getDisplaySetting('orbitPredictionInterval');
        const periodFactor = (typeof predPeriods === 'number' && predPeriods > 0) ? predPeriods : 1;
        const windowSeconds = basePeriod * periodFactor;
        const ptsPerPeriod = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
        const numPts = Math.ceil(ptsPerPeriod * periodFactor);
        // Update predicted orbit from post-burn state (throttled)
        const nowPerf = performance.now();
        if (!this._lastPredTime || nowPerf - this._lastPredTime > 100) {
            // Store orbital period and velocity for UI consumption
            this.predictedOrbit._orbitPeriod = basePeriod;
            this.predictedOrbit._currentVelocity = velVec.clone();
            this.predictedOrbit.update(
                posVec,
                velVec,
                this.predictionId,
                bodiesForWorker,
                windowSeconds,
                numPts
            );
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
        if (this.predictedOrbit) {
            this.scene.remove(this.predictedOrbit.orbitLine);
            this.predictedOrbit.dispose();
            // Remove atmosphere markers
            if (this._atmMarkerGroup) {
                this.scene.remove(this._atmMarkerGroup);
                this._atmMarkers.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
            }
            // Remove listeners
            document.removeEventListener('orbitDataUpdate', this._predOrbitHandler);
            this.app3d.removeEventListener('displaySettingChanged', this._predVisibilityHandler);
            this.app3d.removeEventListener('displaySettingChanged', this._paramChangeHandler);
        }
    }
} 