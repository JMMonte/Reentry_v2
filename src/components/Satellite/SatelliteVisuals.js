import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class SatelliteVisuals {
    constructor(satellite) {
        this.satellite = satellite;
        this.scene = satellite.scene;
        this.color = satellite.color;
        this.baseScale = satellite.baseScale;
        this.mesh = null;
        this.velocityVector = null;
        this.orientationVector = null;
        this.traceLine = null;
        this.tracePoints = [];

        this.initialize();
    }

    initialize() {
        // Satellite mesh - pyramid shape (cone with 3 segments)
        const geometry = new THREE.ConeGeometry(0.5, 2, 3); // radius: 0.5, height: 2, segments: 3 (minimum)
        // Point along +Z axis (no rotation needed - ConeGeometry already points up)
        const material = new THREE.MeshBasicMaterial({
            color: this.color,
            side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(Constants.satelliteRadius);

        // Add to scene
        this.scene.add(this.mesh);

        // Add onBeforeRender callback to maintain relative size and orientation
        const targetSize = 0.005;
        this.mesh.onBeforeRender = (renderer, scene, camera) => {
            // Only update scale and orientation if visible
            if (this.mesh.visible) {
                const distance = camera.position.distanceTo(this.mesh.position);
                const scale = distance * targetSize;
                this.mesh.scale.set(scale, scale, scale);

                // Update mesh orientation
                this.mesh.quaternion.copy(this.satellite.orientation);

                // Scale vectors with camera distance - only if they exist and are visible
                if (this.velocityVector && this.velocityVector.visible) {
                    this.velocityVector.setLength(scale * 20);
                }
                if (this.orientationVector && this.orientationVector.visible) {
                    this.orientationVector.setLength(scale * 20);
                }
            }
        };

        this.initializeVectors();
        this.initializeTraceLine();
    }

    initializeVectors() {
        // Velocity vector (red)
        this.velocityVector = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            this.mesh.position,
            this.baseScale * 3,
            0xff0000
        );
        this.velocityVector.visible = false;
        this.scene.add(this.velocityVector);

        // Orientation vector (blue) - represents body frame z-axis
        const bodyZAxis = new THREE.Vector3(0, 1, 0);
        bodyZAxis.applyQuaternion(this.satellite.orientation);
        this.orientationVector = new THREE.ArrowHelper(
            bodyZAxis,
            this.mesh.position,
            this.baseScale * 3,
            0x0000ff
        );
        this.orientationVector.visible = false;
        this.scene.add(this.orientationVector);
    }

    initializeTraceLine() {
        // Initialize trace line
        const traceGeometry = new THREE.BufferGeometry();
        const traceMaterial = new THREE.LineBasicMaterial({
            color: this.color,
            linewidth: 2,
            transparent: true,
            opacity: 0.5
        });
        this.traceLine = new THREE.Line(traceGeometry, traceMaterial);
        this.traceLine.frustumCulled = false;

        // Set initial visibility based on display settings
        this.traceLine.visible = this.satellite.app3d.getDisplaySetting('showTraces');

        this.scene.add(this.traceLine);
        this.tracePoints = [];
    }

    updatePosition(scaledPosition, velocity) {
        // Update satellite mesh position
        this.mesh.position.copy(scaledPosition);

        // Update vectors only if they're visible
        if (this.velocityVector && this.velocityVector.visible) {
            const normalizedVelocity = velocity.clone().normalize();
            this.velocityVector.position.copy(scaledPosition);
            this.velocityVector.setDirection(normalizedVelocity);
        }

        if (this.orientationVector && this.orientationVector.visible) {
            const bodyZAxis = new THREE.Vector3(0, 1, 0);
            bodyZAxis.applyQuaternion(this.satellite.orientation);
            this.orientationVector.position.copy(scaledPosition);
            this.orientationVector.setDirection(bodyZAxis);
        }

        // Update trace line
        if (this.traceLine && this.traceLine.visible && this.tracePoints) {
            this.satellite.traceUpdateCounter++;
            if (this.satellite.traceUpdateCounter >= this.satellite.traceUpdateInterval) {
                this.satellite.traceUpdateCounter = 0;
                this.tracePoints.push(scaledPosition.clone());
                if (this.tracePoints.length > 1000) {
                    this.tracePoints.shift();
                }
                this.traceLine.geometry.setFromPoints(this.tracePoints);
                this.traceLine.geometry.computeBoundingSphere();
            }
        }
    }

    setVisible(visible) {
        this.mesh.visible = visible;
        this.traceLine.visible = visible && this.satellite.app3d.getDisplaySetting('showTraces');
    }

    setVectorsVisible(visible) {
        if (this.velocityVector) {
            this.velocityVector.visible = visible;
        }
        if (this.orientationVector) {
            this.orientationVector.visible = visible;
        }
    }

    updateVectors() {
        const scaledPosition = this.mesh.position;

        if (this.velocityVector && this.velocityVector.visible) {
            this.velocityVector.position.copy(scaledPosition);
            const normalizedVelocity = this.satellite.velocity.clone().normalize();
            this.velocityVector.setDirection(normalizedVelocity);
            this.velocityVector.setLength(this.baseScale * 20);
        }

        if (this.orientationVector && this.orientationVector.visible) {
            this.orientationVector.position.copy(scaledPosition);
            const bodyZAxis = new THREE.Vector3(0, 1, 0);
            bodyZAxis.applyQuaternion(this.satellite.orientation);
            this.orientationVector.setDirection(bodyZAxis);
            this.orientationVector.setLength(this.baseScale * 20);
        }
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
    }

    dispose() {
        // Remove from scene
        if (this.mesh) {
            this.mesh.removeFromParent();
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.traceLine) {
            this.scene.remove(this.traceLine);
            this.traceLine.geometry.dispose();
            this.traceLine.material.dispose();
        }
        if (this.velocityVector) {
            this.velocityVector.dispose();
        }
        if (this.orientationVector) {
            this.orientationVector.dispose();
        }
    }
}
