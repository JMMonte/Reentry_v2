import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { OrbitPath } from './OrbitPath.js';
import { GroundTrackPath } from './GroundTrackPath.js';
import { SatelliteVisualizer } from './SatelliteVisualizer.js';
import { ManeuverNode } from './ManeuverNode.js';

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

        // Smoothing for display to reduce visual oscillation
        this._smoothedScaled = null;

        this.initializeVisuals();
        this.maneuverNodes = [];
        this.maneuverGroup = new THREE.Group();
        this.scene.add(this.maneuverGroup);

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

    updatePosition(position, velocity, debug) {
        // Store latest debug data if provided
        if (debug) {
            this.debug = debug;
        }
        // Mark that we've received real physics state
        this.initialized = true;
        // Lazy-init only the needed scratch vector
        if (!this._scratchScaled) {
            this._scratchScaled = new THREE.Vector3();
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

        // Update maneuver nodes positions
        this.maneuverNodes.forEach(node => node.update());
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
        // Rely on apsisData computed by the physics worker
        return this.debug?.apsisData || null;
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
        // Dispose maneuver nodes
        if (this.maneuverNodes) {
            this.maneuverNodes.forEach(node => node.dispose());
            this.maneuverNodes = [];
        }
        if (this.maneuverGroup) {
            this.scene.remove(this.maneuverGroup);
        }

        // Only dispatch satelliteDeleted event after cleanup
        document.dispatchEvent(new CustomEvent('satelliteDeleted', { detail: { id: this.id } }));
    }

    setColor(color) {
        this.color = color;

        this.visualizer.setColor(color);
        if (this.orbitPath?.orbitLine) {
            this.orbitPath.orbitLine.material.color.set(color);
        }
        this.groundTrackPath?.setColor(color);
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
     * Add a maneuver node to this satellite
     * @param {Date} time for maneuver execution
     * @param {THREE.Vector3} deltaV vector in m/s
     */
    addManeuverNode(time, deltaV) {
        const node = new ManeuverNode({ satellite: this, time, deltaV });
        this.maneuverNodes.push(node);
        return node;
    }

    /**
     * Remove a maneuver node
     * @param {ManeuverNode} node
     */
    removeManeuverNode(node) {
        node.dispose();
        this.maneuverNodes = this.maneuverNodes.filter(n => n !== node);
    }
}