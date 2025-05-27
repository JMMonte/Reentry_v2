import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class SatelliteVisualizer {
    /** Shared geometry and base material to reduce allocations */
    static _sharedGeometry = new THREE.ConeGeometry(0.5, 2, 3);
    static _sharedMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    constructor(color, orientation, app3d) {
        this.color = color;
        this.orientation = orientation ? orientation.clone() : new THREE.Quaternion();
        this.app3d = app3d;
        this.baseScale = Constants.satelliteRadius;
        this._createMesh();
    }

    _createMesh() {
        // Use shared geometry and clone material for per-instance customization
        const geometry = SatelliteVisualizer._sharedGeometry;
        const material = SatelliteVisualizer._sharedMaterial.clone();
        material.color = new THREE.Color(this.color);
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(Constants.satelliteRadius);
        // Maintain relative size and orientation
        const targetSize = 0.005;
        this.mesh.onBeforeRender = (renderer, scene, camera) => {
            if (this.mesh.visible) {
                // Get world position of mesh and camera
                const meshWorldPos = new THREE.Vector3();
                this.mesh.getWorldPosition(meshWorldPos);
                const cameraWorldPos = new THREE.Vector3();
                camera.getWorldPosition(cameraWorldPos);

                // Calculate distance
                const distance = cameraWorldPos.distanceTo(meshWorldPos);

                // Compensate for parent scale
                const parentWorldScale = new THREE.Vector3(1, 1, 1);
                if (this.mesh.parent) {
                    this.mesh.parent.getWorldScale(parentWorldScale);
                }

                // Set scale so apparent size is constant
                const scale = distance * targetSize;
                this.mesh.scale.set(
                    scale / (parentWorldScale.x || 1),
                    scale / (parentWorldScale.y || 1),
                    scale / (parentWorldScale.z || 1)
                );

                this.mesh.quaternion.copy(this.orientation);
            }
        };
    }

    addToScene(scene) {
        scene.add(this.mesh);
    }

    removeFromScene(scene) {
        scene.remove(this.mesh);
    }

    updatePosition(scaledPosition) {
        this.mesh.position.copy(scaledPosition);
    }

    updateOrientation(orientation) {
        this.orientation.copy(orientation);
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
    }
} 