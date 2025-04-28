import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class SatelliteVisualizer {
    constructor(color, orientation, app3d) {
        this.color = color;
        this.orientation = orientation ? orientation.clone() : new THREE.Quaternion();
        this.app3d = app3d;
        this.baseScale = Constants.satelliteRadius;
        this._createMesh();
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