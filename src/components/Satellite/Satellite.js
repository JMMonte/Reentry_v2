import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
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
        this.orbitUpdateCounter = 0;
        this.orbitUpdateInterval = this.app3d.getDisplaySetting('orbitUpdateInterval') || 30;
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

        this.initializeVisuals();

        // Subscribe to display options changes
        this.app3d.addEventListener('displaySettingChanged', (event) => {
            const { key, value } = event.detail;
            switch (key) {
                case 'showOrbits':
                    if (this.orbitPath) this.orbitPath.orbitLine.visible = value;
                    if (this.apsisVisualizer) this.apsisVisualizer.visible = value;
                    break;
                case 'showTraces':
                    if (this.tracePath) this.tracePath.traceLine.visible = value;
                    break;
                case 'showGroundTraces':
                    if (this.groundTrackPath) this.groundTrackPath.groundTrackLine.visible = value;
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

        // Update initial position
        if (this.position && this.velocity) {
            this.updatePosition(this.position, this.velocity);
        }
    }

    get groundTrackUpdateInterval() {
        return this.app3d.getDisplaySetting('groundTrackUpdateInterval') || 10;
    }

    updatePosition(position, velocity) {
        // Store current state (in meters)
        this.position = position.clone();
        this.velocity = velocity.clone();

        // Convert from meters to scaled kilometers for visualization
        const scaledPosition = new THREE.Vector3(
            position.x * Constants.metersToKm * Constants.scale,
            position.y * Constants.metersToKm * Constants.scale,
            position.z * Constants.metersToKm * Constants.scale
        );

        // Update mesh and vectors via visualizer
        this.visualizer.updatePosition(scaledPosition);
        this.visualizer.updateOrientation(this.orientation);
        this.visualizer.updateVectors(this.velocity, this.orientation);

        // Update trace via TracePath
        this.traceUpdateCounter++;
        if (this.traceUpdateCounter >= this.traceUpdateInterval) {
            this.traceUpdateCounter = 0;
            this.tracePath?.update(
                new THREE.Vector3(
                    position.x * Constants.metersToKm * Constants.scale,
                    position.y * Constants.metersToKm * Constants.scale,
                    position.z * Constants.metersToKm * Constants.scale
                ),
                this.id
            );
        }
        // Update orbit path via OrbitPath
        this.orbitUpdateCounter++;
        if (this.orbitUpdateCounter >= this.orbitUpdateInterval) {
            this.orbitUpdateCounter = 0;
            this.orbitPath?.update(
                new THREE.Vector3(
                    position.x / (Constants.metersToKm * Constants.scale),
                    position.y / (Constants.metersToKm * Constants.scale),
                    position.z / (Constants.metersToKm * Constants.scale)
                ),
                new THREE.Vector3(
                    velocity.x / (Constants.metersToKm * Constants.scale),
                    velocity.y / (Constants.metersToKm * Constants.scale),
                    velocity.z / (Constants.metersToKm * Constants.scale)
                ),
                this.id,
                {
                    G: Constants.G,
                    earthMass: Constants.earthMass,
                    scale: Constants.scale,
                    metersToKm: Constants.metersToKm
                }
            );
        }
        // Update ground track via GroundTrackPath (Earth-fixed frame, drifting with rotation)
        this.groundTrackUpdateCounter++;
        if (this.groundTrackUpdateCounter >= this.groundTrackUpdateInterval) {
            this.groundTrackUpdateCounter = 0;
            if (this.app3d.earth && this.app3d.earth.rotationGroup && this.app3d.earth.earthMesh) {
                // Transform satellite position to local Earth frame
                const earthCenter = this.app3d.earth.earthMesh.position;
                const relativePosition = position.clone().multiplyScalar(Constants.metersToKm).sub(earthCenter);
                const localPosition = relativePosition.clone().applyMatrix4(this.app3d.earth.rotationGroup.matrixWorld.clone().invert());
                const groundPoint = localPosition.clone().normalize().multiplyScalar(Constants.earthRadius * Constants.metersToKm * Constants.scale);
                this.groundTrackPath?.update(groundPoint);
            }
        }
        // Update orbit line if needed
        if (this.orbitPath && this.orbitPath.orbitLine.visible) {
            this.updateOrbitLine(position, velocity);
        }

        // Update apsis visualizer if needed
        if (this.apsisVisualizer && this.apsisVisualizer.visible) {
            this.apsisVisualizer.update(position, velocity);
        }

        // Notify debug window about position update, but don't force it open
        if (this.debugWindow?.onPositionUpdate) {
            this.debugWindow.onPositionUpdate();
        }
    }

    updateOrbitLine(position, velocity) {
        const mu = Constants.G * Constants.earthMass;
        const orbitalElements = PhysicsUtils.calculateOrbitalElements(position, velocity, mu);

        if (!orbitalElements) {
            console.warn('No orbital elements calculated');
            return;
        }

        // Compute orbit points
        const orbitPoints = PhysicsUtils.computeOrbit(orbitalElements, mu, 180);

        // Update orbit line geometry
        if (orbitPoints && orbitPoints.length > 0) {
            this.orbitPath.orbitLine.geometry.setFromPoints(orbitPoints);
            this.orbitPath.orbitLine.geometry.computeBoundingSphere();
        }

        // Update apsis visualizer
        if (this.apsisVisualizer && this.apsisVisualizer.visible) {
            this.apsisVisualizer.update(position, velocity);
        }

        // Force visibility update
        if (this.orbitPath) {
            this.orbitPath.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');
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
        if (!this.position || !this.velocity) return null;

        const mu = Constants.G * Constants.earthMass;
        const r = this.position.clone();
        const v = this.velocity.clone();

        // Calculate specific angular momentum
        const h = new THREE.Vector3().crossVectors(r, v);
        const h_mag = h.length();

        // Calculate specific orbital energy
        const v2 = v.lengthSq();
        const r_mag = r.length();
        const energy = (v2 / 2) - (mu / r_mag);

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
        if (this.visualizer) {
            this.visualizer.removeFromScene(this.scene);
            this.visualizer.dispose();
        }
        if (this.tracePath) {
            this.tracePath.dispose();
        }
        if (this.orbitPath) {
            this.orbitPath.dispose();
        }
        if (this.groundTrackPath) {
            this.groundTrackPath.dispose();
        }
        if (this.apsisVisualizer) {
            this.apsisVisualizer.dispose();
        }

        console.log('[Satellite.dispose] Disposing satellite', this.id);
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
}