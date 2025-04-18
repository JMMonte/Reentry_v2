import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class SatelliteVisualizer {
    constructor(color, orientation, app3d) {
        this.color = color;
        this.orientation = orientation ? orientation.clone() : new THREE.Quaternion();
        this.app3d = app3d;
        this.baseScale = Constants.satelliteRadius;
        this._createMesh();
        this._createVectors();
    }

    _createMesh() {
        const geometry = new THREE.ConeGeometry(0.5, 2, 3);
        const material = new THREE.MeshBasicMaterial({
            color: this.color,
            side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(Constants.satelliteRadius);
        // Maintain relative size and orientation
        const targetSize = 0.005;
        this.mesh.onBeforeRender = (renderer, scene, camera) => {
            if (this.mesh.visible) {
                const distance = camera.position.distanceTo(this.mesh.position);
                const scale = distance * targetSize;
                this.mesh.scale.set(scale, scale, scale);
                this.mesh.quaternion.copy(this.orientation);
                if (this.velocityVector && this.velocityVector.visible) {
                    this.velocityVector.setLength(scale * 20);
                }
                if (this.orientationVector && this.orientationVector.visible) {
                    this.orientationVector.setLength(scale * 20);
                }
            }
        };
    }

    _createVectors() {
        // Velocity vector (red)
        this.velocityVector = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            this.mesh.position,
            this.baseScale * 3,
            0xff0000
        );
        this.velocityVector.visible = false;
        // Orientation vector (blue)
        const bodyZAxis = new THREE.Vector3(0, 1, 0);
        bodyZAxis.applyQuaternion(this.orientation);
        this.orientationVector = new THREE.ArrowHelper(
            bodyZAxis,
            this.mesh.position,
            this.baseScale * 3,
            0x0000ff
        );
        this.orientationVector.visible = false;
    }

    addToScene(scene) {
        scene.add(this.mesh);
        scene.add(this.velocityVector);
        scene.add(this.orientationVector);
    }

    removeFromScene(scene) {
        scene.remove(this.mesh);
        scene.remove(this.velocityVector);
        scene.remove(this.orientationVector);
    }

    updatePosition(scaledPosition) {
        this.mesh.position.copy(scaledPosition);
        if (this.velocityVector && this.velocityVector.visible) {
            this.velocityVector.position.copy(scaledPosition);
        }
        if (this.orientationVector && this.orientationVector.visible) {
            this.orientationVector.position.copy(scaledPosition);
        }
    }

    updateOrientation(orientation) {
        this.orientation.copy(orientation);
    }

    updateVectors(velocity, orientation) {
        if (this.velocityVector && this.velocityVector.visible) {
            const normalizedVelocity = velocity.clone().normalize();
            this.velocityVector.setDirection(normalizedVelocity);
        }
        if (this.orientationVector && this.orientationVector.visible) {
            const bodyZAxis = new THREE.Vector3(0, 1, 0);
            bodyZAxis.applyQuaternion(orientation);
            this.orientationVector.setDirection(bodyZAxis);
        }
    }

    setVectorsVisible(visible) {
        if (this.velocityVector) {
            this.velocityVector.visible = visible;
        }
        if (this.orientationVector) {
            this.orientationVector.visible = visible;
        }
    }

    setColor(color) {
        this.color = color;
        if (this.mesh?.material) {
            this.mesh.material.color.set(color);
            if (this.mesh.material.emissive) {
                this.mesh.material.emissive.copy(new THREE.Color(color).multiplyScalar(0.2));
            }
        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.velocityVector) {
            this.velocityVector.dispose();
        }
        if (this.orientationVector) {
            this.orientationVector.dispose();
        }
    }
} 