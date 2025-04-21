import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { TracePath } from './TracePath.js';
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
        this.traceUpdateCounter = 0;
        this.traceUpdateInterval = this.app3d.getDisplaySetting('traceUpdateInterval') || 5;

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

        this.initializeVisuals();

        // Subscribe to display options changes
        this.app3d.addEventListener('displaySettingChanged', (event) => {
            const { key, value } = event.detail;
            switch (key) {
                case 'showOrbits':
                    if (this.orbitPath) this.orbitPath.setVisible(value);
                    if (this.apsisVisualizer) this.apsisVisualizer.setVisible(value);
                    break;
                case 'showTraces':
                    if (this.tracePath) this.tracePath.setVisible(value);
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

        // Replace trace line/worker with TracePath
        this.tracePath = new TracePath(this.color);
        this.scene.add(this.tracePath.traceLine);
        this.tracePath.traceLine.visible = this.app3d.getDisplaySetting('showTraces');

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
        this.apsisVisualizer.visible = false;
    }

    get groundTrackUpdateInterval() {
        return this.app3d.getDisplaySetting('groundTrackUpdateInterval') || 10;
    }

    updatePosition(position, velocity) {
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

        // Update mesh and vectors via visualizer
        this.visualizer.updatePosition(this._scratchScaled);
        this.visualizer.updateOrientation(this.orientation);
        this.visualizer.updateVectors(this.velocity, this.orientation);

        // Update trace via TracePath
        this.traceUpdateCounter++;
        if (this.traceUpdateCounter >= this.traceUpdateInterval) {
            this.traceUpdateCounter = 0;
            if (this.tracePath && this.tracePath.traceLine.visible) {
                this.tracePath.update(this._scratchScaled, this.id);
            }
        }

        // Update apsis visualizer if needed
        if (this.apsisVisualizer && this.apsisVisualizer.visible) {
            this.apsisVisualizer.update(position, velocity);
        }

        // Notify debug window about position update
        if (this.debugWindow?.onPositionUpdate) {
            this.debugWindow.onPositionUpdate();
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
        this.tracePath?.setVisible(visible && window.app3d.getDisplaySetting('showTraces'));
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
        // Gravitational parameter
        const mu = Constants.G * Constants.earthMass;
        // Debug: log intermediate orbital variables
        const r_mag = this.position.length();
        const v2 = this.velocity.lengthSq();
        const energy = (v2 / 2) - (mu / r_mag);
        // Prepare vectors
        const r = this.position.clone();
        const v = this.velocity.clone();

        // Calculate specific angular momentum
        const h = new THREE.Vector3().crossVectors(r, v);
        const h_mag = h.length();

        // Calculate semi-major axis (in meters)
        const sma = -mu / (2 * energy);

        // Calculate eccentricity vector
        const ev = new THREE.Vector3()
            .crossVectors(v, h)
            .divideScalar(mu)
            .sub(r.clone().divideScalar(r_mag));

        const ecc = ev.length();

        // Calculate inclination
        const inc = Math.acos(h.z / h_mag) * (180 / Math.PI);

        // Calculate node vector (points to ascending node)
        const n = new THREE.Vector3(0, 0, 1).cross(h);
        const n_mag = n.length();

        // Calculate longitude of ascending node (Ω)
        let lan = Math.acos(n.x / n_mag) * (180 / Math.PI);
        if (n.y < 0) lan = 360 - lan;

        // Calculate argument of periapsis (ω)
        let aop = Math.acos(n.dot(ev) / (n_mag * ecc)) * (180 / Math.PI);
        if (ev.z < 0) aop = 360 - aop;

        // Calculate true anomaly (ν)
        let ta = Math.acos(ev.dot(r) / (ecc * r_mag)) * (180 / Math.PI);
        if (r.dot(v) < 0) ta = 360 - ta;

        // Calculate orbital period
        const period = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);

        // Calculate periapsis and apoapsis distances (in meters)
        const periapsis = sma * (1 - ecc);
        const apoapsis = sma * (1 + ecc);

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
            periapsisAltitude: (periapsis - Constants.earthRadius) * Constants.metersToKm,
            apoapsisAltitude: (apoapsis - Constants.earthRadius) * Constants.metersToKm,
            periapsisRadial: periapsis * Constants.metersToKm,
            apoapsisRadial: apoapsis * Constants.metersToKm
        };
    }

    dispose() {
        // Remove and dispose visualizer
        if (this.visualizer) {
            this.visualizer.removeFromScene(this.scene);
            this.visualizer.dispose();
        }
        // Remove and dispose trace path
        if (this.tracePath) {
            this.scene.remove(this.tracePath.traceLine);
            this.tracePath.dispose();
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
        if (this.tracePath?.traceLine) {
            this.tracePath.traceLine.material.color.set(color);
        }
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
}