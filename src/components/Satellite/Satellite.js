import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { ManeuverCalculator } from './ManeuverCalculator.js';
import { GroundTrack } from './GroundTrack.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';

export class Satellite {
    constructor({ scene, position, velocity, id, color, mass = 100, size = 1, app3d, name }) {
        this.scene = scene;
        this.id = id;
        this.name = name;
        this.color = color;
        this.mass = mass;
        this.size = size;
        this.position = position;
        this.velocity = velocity;
        this.initialized = false;
        this.updateBuffer = [];
        this.landed = false;
        this.maneuverNodes = [];
        this.maneuverCalculator = new ManeuverCalculator();
        this.app3d = app3d;

        // Create debug window
        if (this.app3d.createDebugWindow) {
            this.app3d.createDebugWindow(this);
        }

        this.initializeVisuals();
    }

    initializeVisuals() {
        const geometry = new THREE.ConeGeometry(Constants.satelliteRadius, Constants.satelliteRadius * 2, 3, 1);
        const material = new THREE.MeshBasicMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);

        // Initialize trace line
        const traceGeometry = new THREE.BufferGeometry();
        const traceMaterial = new THREE.LineBasicMaterial({ color: this.color });
        this.traceLine = new THREE.Line(traceGeometry, traceMaterial);
        this.scene.add(this.traceLine);
        this.tracePoints = [];

        // Initialize orbit line
        const orbitGeometry = new THREE.BufferGeometry();
        const orbitMaterial = new THREE.LineBasicMaterial({ 
            color: this.color,
            transparent: true,
            opacity: 0.5
        });
        this.orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        this.scene.add(this.orbitLine);

        // Initialize ground track
        this.groundTrack = new GroundTrack(this.app3d.earth, this.color);

        // Initialize apsis visualizer
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);

        // Update initial position
        this.updatePosition(this.position, this.velocity);
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

        // Update satellite mesh position
        this.mesh.position.copy(scaledPosition);

        // Update trace line
        this.tracePoints.push(scaledPosition.clone());
        if (this.tracePoints.length > 1000) {
            this.tracePoints.shift();
        }
        this.traceLine.geometry.setFromPoints(this.tracePoints);

        // Update orbit line and apsides
        if (!this.landed) {
            this.updateOrbitLine(position, velocity);
            // Update apsis visualizer with unscaled position and velocity (in meters)
            const apsisData = this.apsisVisualizer.update(position, velocity);
            if (apsisData) {
                this.periapsisAltitude = apsisData.periapsisAltitude;
                this.apoapsisAltitude = apsisData.apoapsisAltitude;
            }
        }

        // Update ground track
        this.groundTrack.update(this.mesh.position);
    }

    updateOrbitLine(position, velocity) {
        // Calculate orbital elements
        const mu = Constants.earthGravitationalParameter;
        const orbitalElements = PhysicsUtils.calculateOrbitalElements(position, velocity, mu);
        
        if (!orbitalElements) {
            console.warn('No orbital elements calculated');
            return;
        }

        // Use the same orbital elements to compute the orbit points
        const orbitPoints = PhysicsUtils.computeOrbit(orbitalElements, mu, 360);
        this.orbitLine.geometry.setFromPoints(orbitPoints);
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

        // Update maneuver nodes if any
        this.maneuverNodes.forEach(node => {
            node.update(currentTime);
        });

        // Clean up completed maneuver nodes
        this.maneuverNodes = this.maneuverNodes.filter(node => !node.isComplete);
    }

    setVisible(visible) {
        this.mesh.visible = visible;
        this.traceLine.visible = visible && window.app3d.getDisplaySetting('showTraces');
        this.orbitLine.visible = visible && window.app3d.getDisplaySetting('showOrbits');
        this.groundTrack.setVisible(visible && window.app3d.getDisplaySetting('showGroundTraces'));
        // Show apsis markers only if orbit is visible
        this.apsisVisualizer.setVisible(visible && window.app3d.getDisplaySetting('showOrbits'));
    }

    dispose() {
        // Remove and dispose of all geometries and materials
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        if (this.traceLine) {
            this.scene.remove(this.traceLine);
            this.traceLine.geometry.dispose();
            this.traceLine.material.dispose();
        }

        if (this.orbitLine) {
            this.scene.remove(this.orbitLine);
            this.orbitLine.geometry.dispose();
            this.orbitLine.material.dispose();
        }

        if (this.groundTrack) {
            this.groundTrack.dispose();
        }

        if (this.apsisVisualizer) {
            this.apsisVisualizer.dispose();
        }

        // Clear arrays
        this.tracePoints = [];
    }

    setColor(color) {
        this.color = color;

        // Update mesh color
        if (this.mesh?.material) {
            this.mesh.material.color.set(color);
            // Only set emissive if the material supports it
            if (this.mesh.material.emissive) {
                this.mesh.material.emissive.copy(new THREE.Color(color).multiplyScalar(0.2));
            }
        }

        // Update trace line color
        if (this.traceLine?.material) {
            this.traceLine.material.color.set(color);
        }

        // Update orbit line color
        if (this.orbitLine?.material) {
            this.orbitLine.material.color.set(color);
        }
        this.groundTrack.setColor(color);
    }

    setGroundTraceVisible(visible) {
        this.groundTrack.setVisible(visible);
    }
}