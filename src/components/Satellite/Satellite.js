import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { OrbitPath } from './OrbitPath.js';
import { GroundTrackPath } from './GroundTrackPath.js';
import { SatelliteVisualizer } from './SatelliteVisualizer.js';

export class Satellite {
    constructor({ scene, position, velocity, id, color, mass = 100, size = 1, app3d, name }) {
        this.app3d = app3d;
        this.scene = scene;
        this.id = id;
        this.name = name;
        this.color = color;
        this.mass = mass;
        this.size = size;
        this.position = position.clone();
        this.velocity = velocity.clone();
        this.initialized = false;
        this.updateBuffer = [];
        this.landed = false;

        // Performance optimization: Update counters
        this.groundTrackUpdateCounter = 0;

        // Initialize orientation quaternion
        this.orientation = new THREE.Quaternion();
        if (velocity) {
            const upVector = new THREE.Vector3(0, 1, 0);
            const velocityDir = velocity.clone().normalize();
            this.orientation.setFromUnitVectors(upVector, velocityDir);
        }

        // Create debug window
        if (this.app3d.createDebugWindow) {
            this.app3d.createDebugWindow(this);
        }

        // Sequence counter for orbit worker messages
        this._seq = 0;

        // Smoothing for display to reduce visual oscillation
        this._smoothedScaled = null;

        this.initializeVisuals();

        // Subscribe to display options changes
        this.app3d.addEventListener('displaySettingChanged', (event) => {
            const { key, value } = event.detail;
            switch (key) {
                case 'showOrbits':
                    if (this.orbitPath) this.orbitPath.setVisible(value);
                    if (this.apsisVisualizer) this.apsisVisualizer.setVisible(value);
                    break;
                case 'showGroundTraces':
                    if (this.groundTrackPath) this.groundTrackPath.setVisible(value);
                    break;
                case 'showSatVectors':
                    if (this.velocityVector) this.velocityVector.visible = value;
                    if (this.orientationVector) this.orientationVector.visible = value;
                    break;
            }
        });
    }

    initializeVisuals() {
        // Use SatelliteVisualizer for mesh and vectors
        this.visualizer = new SatelliteVisualizer(this.color, this.orientation, this.app3d);
        this.visualizer.addToScene(this.scene);


        // Replace orbit line/worker with OrbitPath
        this.orbitPath = new OrbitPath(this.color);
        this.scene.add(this.orbitPath.orbitLine);
        this.orbitPath.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');

        // Replace ground track with GroundTrackPath
        this.groundTrackPath = new GroundTrackPath(this.color, this.id);
        this.app3d.earth.rotationGroup.add(this.groundTrackPath.groundTrackLine);
        this.groundTrackPath.groundTrackLine.visible = this.app3d.getDisplaySetting('showGroundTraces');

        // Initialize apsis visualizer
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);
        // Initial visibility from display options
        this.apsisVisualizer.setVisible(this.app3d.getDisplaySetting('showOrbits'));
    }

    get groundTrackUpdateInterval() {
        return this.app3d.getDisplaySetting('groundTrackUpdateInterval') || 10;
    }

    updatePosition(position, velocity, debug) {
        // Store latest debug data if provided
        if (debug) {
            this.debug = debug;
        }
        // Mark that we've received real physics state
        this.initialized = true;
        // Lazy-init scratch vectors to avoid allocations
        if (!this._scratchScaled) {
            this._scratchScaled = new THREE.Vector3();
            this._scratchScaled2 = new THREE.Vector3();
            this._scratchVelScaled = new THREE.Vector3();
            this._scratchRelative = new THREE.Vector3();
            this._scratchLocal = new THREE.Vector3();
            this._lastOrbitPos = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
            this._lastOrbitVel = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
        }
        // Store current state (in meters)
        this.position = position.clone();
        this.velocity = velocity.clone();

        // Convert from meters to scaled kilometers for visualization (reuse scratch vector)
        const k = Constants.metersToKm * Constants.scale;
        this._scratchScaled.set(
            position.x * k,
            position.y * k,
            position.z * k
        );

        // Exponential smoothing for visual display
        const alpha = 0.7;
        if (!this._smoothedScaled) {
            this._smoothedScaled = this._scratchScaled.clone();
        } else {
            this._smoothedScaled.lerp(this._scratchScaled, alpha);
        }

        // Update mesh and vectors via visualizer
        this.visualizer.updatePosition(this._smoothedScaled);
        this.visualizer.updateOrientation(this.orientation);
        this.visualizer.updateVectors(this.velocity, this.orientation);

        // Update apsis visualizer using worker-provided apsisData
        if (this.apsisVisualizer) {
            this.apsisVisualizer.update(position, velocity, this.debug?.apsisData);
        }

        // Notify debug window about position update
        if (this.debugWindow?.onPositionUpdate) {
            this.debugWindow.onPositionUpdate();
        }

        // Dispatch simulation data update with drag and perturbation info
        try {
            // Use debug data from physics worker attached earlier
            const dbg = debug || this.debug || {};
            const drag = dbg.dragData || { altitude: null, density: null, relativeVelocity: null, dragAcceleration: null };
            // Perturbation data supplied by physics worker
            const pert = dbg.perturbation || null;
            const elements = this.getOrbitalElements();
            const altitude = drag.altitude ?? this.getSurfaceAltitude();
            const velocityVal = this.getSpeed();
            // Compute latitude and longitude (approximate)
            const rNorm = this.position.clone().normalize();
            const lat = Math.asin(rNorm.y) * (180 / Math.PI);
            const lon = Math.atan2(this.position.z, this.position.x) * (180 / Math.PI);
            const simTime = this.app3d.timeUtils.getSimulatedTime().toISOString();
            document.dispatchEvent(new CustomEvent('simulationDataUpdate', {
                detail: { id: this.id, simulatedTime: simTime, altitude, velocity: velocityVal, lat, lon, elements, dragData: drag, perturbation: pert }
            }));
        } catch (err) {
            console.error('Error dispatching simulationDataUpdate with debug:', err);
        }
    }

    updateSatellite() {
        // Process any buffered physics updates
        while (this.updateBuffer.length > 0) {
            const update = this.updateBuffer.shift();
            if (update) {
                const position = new THREE.Vector3(
                    update.position[0],
                    update.position[1],
                    update.position[2]
                );
                const velocity = new THREE.Vector3(
                    update.velocity[0],
                    update.velocity[1],
                    update.velocity[2]
                );
                this.updatePosition(position, velocity);
            }
        }
    }

    setVisible(visible) {
        this.visualizer.setVisible(visible);
        this.orbitPath?.setVisible(visible && window.app3d.getDisplaySetting('showOrbits'));
        this.groundTrackPath?.setVisible(visible && window.app3d.getDisplaySetting('showGroundTraces'));
        // Show apsis markers only if orbit is visible
        this.apsisVisualizer.setVisible(visible && window.app3d.getDisplaySetting('showOrbits'));
    }

    setVectorsVisible(visible) {
        this.visualizer.setVectorsVisible(visible);
    }

    getSpeed() {
        return this.velocity ? this.velocity.length() : 0;
    }

    getRadialAltitude() {
        return this.position ? (this.position.length() * Constants.metersToKm) : 0;
    }

    getSurfaceAltitude() {
        if (!this.position) return 0;
        return (this.position.length() - Constants.earthRadius) * Constants.metersToKm;
    }

    getOrbitalElements() {
        // Only compute after receiving first physics update
        if (!this.initialized) return null;
        if (!this.position || !this.velocity) return null;
        // Use orbital elements from physics worker debug if available
        if (this.debug?.apsisData) {
            return this.debug.apsisData;
        }
        const mu = Constants.G * Constants.earthMass;
        const r_mag = this.position.length();
        const v2 = this.velocity.lengthSq();
        const energy = (v2 / 2) - (mu / r_mag);
        const r = this.position.clone();
        const v = this.velocity.clone();
        const h = new THREE.Vector3().crossVectors(r, v);
        const h_mag = h.length();
        const sma = -mu / (2 * energy);
        const ev = new THREE.Vector3()
            .crossVectors(v, h)
            .divideScalar(mu)
            .sub(r.clone().divideScalar(r_mag));
        const ecc = ev.length();
        const inc = Math.acos(h.z / h_mag) * (180 / Math.PI);
        const n = new THREE.Vector3(0, 0, 1).cross(h);
        const n_mag = n.length();
        let lan = Math.acos(n.x / n_mag) * (180 / Math.PI);
        if (n.y < 0) lan = 360 - lan;
        let aop = Math.acos(n.dot(ev) / (n_mag * ecc)) * (180 / Math.PI);
        if (ev.z < 0) aop = 360 - aop;
        let ta = Math.acos(ev.dot(r) / (ecc * r_mag)) * (180 / Math.PI);
        if (r.dot(v) < 0) ta = 360 - ta;
        const period = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);
        // Centralize apsis calculation
        const apsides = PhysicsUtils.calculateApsidesFromElements({ h: h_mag, e: ecc }, mu) || {};
        const rPeriapsis = apsides.rPeriapsis;
        const rApoapsis = apsides.rApoapsis;

        return {
            semiMajorAxis: sma * Constants.metersToKm,
            eccentricity: ecc,
            inclination: inc,
            longitudeOfAscendingNode: lan,
            argumentOfPeriapsis: aop,
            trueAnomaly: ta,
            period: period,
            specificAngularMomentum: h_mag,
            specificOrbitalEnergy: energy,
            periapsisAltitude: (rPeriapsis - Constants.earthRadius) * Constants.metersToKm,
            apoapsisAltitude: rApoapsis !== null ? (rApoapsis - Constants.earthRadius) * Constants.metersToKm : null,
            periapsisRadial: rPeriapsis * Constants.metersToKm,
            apoapsisRadial: rApoapsis !== null ? rApoapsis * Constants.metersToKm : null
        };
    }

    dispose() {
        // Remove and dispose visualizer
        if (this.visualizer) {
            this.visualizer.removeFromScene(this.scene);
            this.visualizer.dispose();
        }
        // Remove and dispose orbit path
        if (this.orbitPath) {
            this.scene.remove(this.orbitPath.orbitLine);
            this.orbitPath.dispose();
        }
        // Remove and dispose ground track path
        if (this.groundTrackPath) {
            this.app3d.earth.rotationGroup.remove(this.groundTrackPath.groundTrackLine);
            this.groundTrackPath.dispose();
        }
        // Dispose apsis visualizer
        if (this.apsisVisualizer) {
            this.apsisVisualizer.dispose();
        }

        // Only dispatch satelliteDeleted event after cleanup
        document.dispatchEvent(new CustomEvent('satelliteDeleted', { detail: { id: this.id } }));
    }

    getAltitude(earth) {
        if (!earth || !this.position) return 0;
        return (this.position.length() - earth.radius) * Constants.metersToKm;
    }

    setColor(color) {
        this.color = color;

        this.visualizer.setColor(color);
        if (this.orbitPath?.orbitLine) {
            this.orbitPath.orbitLine.material.color.set(color);
        }
        this.groundTrackPath?.setColor(color);
    }

    setGroundTraceVisible(visible) {
        this.groundTrackPath?.setVisible(visible);
    }

    updateVectors() {
        this.visualizer.updateVectors(this.velocity, this.orientation);
    }

    delete() {
        if (this.app3d && this.app3d.satellites && typeof this.app3d.satellites.removeSatellite === 'function') {
            this.app3d.satellites.removeSatellite(this.id);
        } else {
            this.dispose();
        }
    }

    /**
     * Update ground track after earth rotation (called from App3D.updateScene)
     */
    updateGroundTrack() {
        if (!this.groundTrackPath || !this.groundTrackPath.groundTrackLine.visible) return;
        if (this.app3d.earth && this.app3d.earth.rotationGroup && this.app3d.earth.earthMesh) {
            // Compute current ground point
            const rel = this.position.clone().multiplyScalar(Constants.metersToKm);
            const earthCenter = this.app3d.earth.earthMesh.position;
            const local = rel.sub(earthCenter)
                .applyMatrix4(this.app3d.earth.rotationGroup.matrixWorld.clone().invert())
                .normalize()
                .multiplyScalar(Constants.earthRadius * Constants.metersToKm * Constants.scale);
            this.groundTrackPath.update(local);
        }
    }

    /**
     * Provide mesh for camera targeting (used by CameraControls.getBodyPosition)
     */
    getMesh() {
        return this.visualizer?.mesh || null;
    }

    /**
     * Compute current gravitational acceleration and force on this satellite.
     * @returns {{acceleration: THREE.Vector3, force: THREE.Vector3}}
     */
    getPerturbation() {
        if (!this.position) return null;
        // positions are in meters
        const G = Constants.G;
        const r = this.position.clone();
        // Earth acceleration
        const muE = G * Constants.earthMass;
        const rMagE = r.length();
        const aEarth = r.clone().multiplyScalar(-muE / Math.pow(rMagE, 3));
        // Moon acceleration
        let aMoon = new THREE.Vector3();
        if (this.app3d.moon) {
            const moonMesh = this.app3d.moon.getMesh ? this.app3d.moon.getMesh() : this.app3d.moon.moonMesh;
            // Use world position to get absolute coordinates
            const moonWorldPos = new THREE.Vector3();
            moonMesh.getWorldPosition(moonWorldPos);
            // Convert from Three.js units (km*scale) to meters
            const moonPosM = moonWorldPos.multiplyScalar(1 / (Constants.scale * Constants.metersToKm));
            const relM = moonPosM.clone().sub(r);
            const rMagM = relM.length();
            if (rMagM > 0) {
                const muM = G * Constants.moonMass;
                aMoon = relM.multiplyScalar(muM / Math.pow(rMagM, 3));
            }
        }
        // Sun acceleration
        let aSun = new THREE.Vector3();
        if (this.app3d.sun) {
            const sunMesh = this.app3d.sun.sun ? this.app3d.sun.sun : this.app3d.sun.sunLight;
            // Use world position for absolute coordinates
            const sunWorldPos = new THREE.Vector3();
            sunMesh.getWorldPosition(sunWorldPos);
            // Convert from Three.js units (km*scale) to meters
            const sunPosM = sunWorldPos.multiplyScalar(1 / (Constants.scale * Constants.metersToKm));
            const relS = sunPosM.clone().sub(r);
            const rMagS = relS.length();
            if (rMagS > 0) {
                const muS = G * Constants.sunMass;
                aSun = relS.multiplyScalar(muS / Math.pow(rMagS, 3));
            }
        }
        // Total acceleration (do not mutate individual vectors)
        const totalAcc = new THREE.Vector3()
            .add(aEarth)
            .add(aMoon)
            .add(aSun);
        // Forces per body
        const forceEarth = aEarth.clone().multiplyScalar(this.mass);
        const forceMoon = aMoon.clone().multiplyScalar(this.mass);
        const forceSun = aSun.clone().multiplyScalar(this.mass);
        const totalForce = new THREE.Vector3()
            .add(forceEarth)
            .add(forceMoon)
            .add(forceSun);
        // Return breakdown
        return {
            acc: {
                total: totalAcc,
                earth: aEarth,
                moon: aMoon,
                sun: aSun
            },
            force: {
                total: totalForce,
                earth: forceEarth,
                moon: forceMoon,
                sun: forceSun
            }
        };
    }
}