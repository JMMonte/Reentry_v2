import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class SatelliteVisualizer {
    /** Shared geometry and base material to reduce allocations */
    static _sharedGeometry = new THREE.ConeGeometry(0.5, 2, 3);
    static _sharedMaterial = null;
    
    static getSharedMaterial() {
        if (!SatelliteVisualizer._sharedMaterial) {
            // Create a single shared material with vertex colors enabled
            SatelliteVisualizer._sharedMaterial = new THREE.MeshBasicMaterial({ 
                side: THREE.DoubleSide,
                vertexColors: true
            });
        }
        return SatelliteVisualizer._sharedMaterial;
    }
    constructor(color, orientation, app3d) {
        this.color = color;
        this.orientation = orientation ? orientation.clone() : new THREE.Quaternion();
        this.app3d = app3d;
        this.baseScale = Constants.satelliteRadius;
        
        // Pre-allocate vectors for onBeforeRender to avoid GC pressure
        this._meshWorldPos = new THREE.Vector3();
        this._cameraWorldPos = new THREE.Vector3();
        this._parentWorldScale = new THREE.Vector3(1, 1, 1);
        
        this._createMesh();
    }

    _createMesh() {
        // Clone shared geometry to add per-instance colors
        const geometry = SatelliteVisualizer._sharedGeometry.clone();
        
        // Set vertex colors for this instance
        const colors = [];
        const color = new THREE.Color(this.color);
        for (let i = 0; i < geometry.attributes.position.count; i++) {
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        // Use the shared material (no cloning needed)
        const material = SatelliteVisualizer.getSharedMaterial();
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(Constants.satelliteRadius);
        // Maintain relative size and orientation
        const targetSize = 0.005;
        this.mesh.onBeforeRender = (renderer, scene, camera) => {
            if (this.mesh.visible) {
                // Get world position of mesh and camera using pre-allocated vectors
                this.mesh.getWorldPosition(this._meshWorldPos);
                camera.getWorldPosition(this._cameraWorldPos);

                // Calculate distance
                const distance = this._cameraWorldPos.distanceTo(this._meshWorldPos);

                // Compensate for parent scale
                this._parentWorldScale.set(1, 1, 1);
                if (this.mesh.parent) {
                    this.mesh.parent.getWorldScale(this._parentWorldScale);
                }

                // Set scale so apparent size is constant
                const scale = distance * targetSize;
                this.mesh.scale.set(
                    scale / (this._parentWorldScale.x || 1),
                    scale / (this._parentWorldScale.y || 1),
                    scale / (this._parentWorldScale.z || 1)
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
        if (this.mesh?.geometry) {
            // Update vertex colors
            const newColor = new THREE.Color(color);
            const colorAttribute = this.mesh.geometry.attributes.color;
            if (colorAttribute) {
                for (let i = 0; i < colorAttribute.count; i++) {
                    colorAttribute.setXYZ(i, newColor.r, newColor.g, newColor.b);
                }
                colorAttribute.needsUpdate = true;
            }
        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            // Don't dispose the shared material
        }
    }
    
    setVisible(visible) {
        if (this.mesh) {
            this.mesh.visible = visible;
        }
    }
} 