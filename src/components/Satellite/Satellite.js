import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { SatelliteVisuals } from './SatelliteVisuals.js';
import { SatelliteOrbit } from './SatelliteOrbit.js';
import { SatellitePhysics } from './SatellitePhysics.js';

export class Satellite {
    constructor({ scene, position, velocity, id, color, mass = 100, size = 1, app3d, name }) {
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
        this.app3d = app3d;
        this.baseScale = 4;

        // Performance optimization: Update counters
        this.traceUpdateCounter = 0;
        this.traceUpdateInterval = 5; // Update trace every 5 frames

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

        // Initialize components
        this.visuals = new SatelliteVisuals(this);
        this.orbit = new SatelliteOrbit(this);
        this.physics = new SatellitePhysics(this);

        // Subscribe to display options changes
        this.app3d.addEventListener('displaySettingChanged', (event) => {
            const { key, value } = event.detail;
            switch (key) {
                case 'showOrbits':
                    if (this.orbit) this.orbit.setVisible(this.visuals.mesh.visible);
                    break;
                case 'showTraces':
                    if (this.visuals.traceLine) this.visuals.traceLine.visible = this.visuals.mesh.visible && value;
                    break;
                case 'showGroundTraces':
                    if (this.orbit) this.orbit.setGroundTraceVisible(value);
                    break;
                case 'showSatVectors':
                    if (this.visuals) this.visuals.setVectorsVisible(value);
                    break;
            }
        });
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

        // Update satellite components
        this.visuals.updatePosition(scaledPosition, velocity);
        this.orbit.update(position, velocity, scaledPosition);

        // Notify debug window about position update, but don't force it open
        if (this.debugWindow?.onPositionUpdate) {
            this.debugWindow.onPositionUpdate();
        }
    }

    updateSatellite(currentTime, realDeltaTime, warpedDeltaTime) {
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
        this.visuals.setVisible(visible);
        this.orbit.setVisible(visible);
    }

    setVectorsVisible(visible) {
        this.visuals.setVectorsVisible(visible);
    }

    getSpeed() {
        return this.physics.getSpeed();
    }

    getRadialAltitude() {
        return this.physics.getRadialAltitude();
    }

    getSurfaceAltitude() {
        return this.physics.getSurfaceAltitude();
    }

    getOrbitalElements() {
        return this.physics.getOrbitalElements();
    }

    dispose() {
        // Reset cursor if this was the hovered object
        if (this.visuals.mesh && window.app3d && window.app3d.hoveredObject === this.visuals.mesh) {
            document.body.style.cursor = 'default';
            window.app3d.hoveredObject = null;
        }

        // Dispose components
        this.visuals.dispose();
        this.orbit.dispose();

        // Remove from app3d satellites list
        if (this.app3d && this.app3d.satellites) {
            delete this.app3d.satellites[this.id];
            // Update satellite list in UI
            if (this.app3d.updateSatelliteList) {
                this.app3d.updateSatelliteList();
            }
        }
    }

    getAltitude(earth) {
        return this.physics.getAltitude(earth);
    }

    setColor(color) {
        this.color = color;
        this.visuals.setColor(color);
        this.orbit.setColor(color);
    }

    setGroundTraceVisible(visible) {
        this.orbit.setGroundTraceVisible(visible);
    }

    updateVectors() {
        this.visuals.updateVectors();
    }
}