/**
 * SatelliteVectors.js
 * 
 * Refactored satellite vector visualization that properly shows all forces
 * affecting satellites from the physics engine
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class SatelliteVectors {
    constructor({
        scene,
        camera,
        app3d,
        satelliteManager,
        // Visual configuration
        baseLength = 500,           // Base arrow length in km
        velocityScale = 10,         // Scale factor for velocity arrows
        accelerationScale = 1000,   // Scale factor for acceleration arrows
        headLength = 0.2,          // Arrow head length as fraction of total
        headWidth = 0.1,           // Arrow head width as fraction of total
        fadeStart = 50000,         // Start fading labels at this distance
        fadeEnd = 100000          // Completely fade labels at this distance
    }) {
        this.scene = scene;
        this.camera = camera;
        this.app3d = app3d;
        this.satelliteManager = satelliteManager;
        
        // Configuration
        this.config = {
            baseLength,
            velocityScale,
            accelerationScale,
            headLength,
            headWidth,
            fadeStart,
            fadeEnd
        };
        
        // Track satellite vector objects
        this.satelliteVectors = new Map(); // satelliteId -> vector objects
        this.visible = false;
        
        // Vector colors
        this.colors = {
            velocity: 0x00ff00,        // Green
            totalAccel: 0xff0000,      // Red
            gravity: 0xffff00,         // Yellow
            drag: 0x00ffff,           // Cyan
            radiation: 0xff00ff,      // Magenta
            thrust: 0xffffff          // White
        };
    }

    /**
     * Update all satellite vectors
     */
    update() {
        if (!this.visible) return;
        
        const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
        if (!physicsEngine) return;
        
        const satellites = physicsEngine.satellites;
        
        // Update existing and add new satellites
        satellites.forEach((satData, satId) => {
            this._updateSatelliteVectors(satId, satData);
        });
        
        // Remove vectors for deleted satellites
        this.satelliteVectors.forEach((vectors, satId) => {
            if (!satellites.has(satId)) {
                this._removeSatelliteVectors(satId);
            }
        });
        
        // Update label visibility based on camera distance
        this._updateLabelVisibility();
    }

    /**
     * Update vectors for a single satellite
     */
    _updateSatelliteVectors(satId, satData) {
        // Get or create vector objects for this satellite
        let vectors = this.satelliteVectors.get(satId);
        if (!vectors) {
            vectors = this._createVectorObjects(satId);
            this.satelliteVectors.set(satId, vectors);
        }
        
        // Get the satellite mesh
        const satellite = this.satelliteManager._satellites.get(String(satId));
        if (!satellite?.visualizer?.mesh) return;
        
        const mesh = satellite.visualizer.mesh;
        
        // Get world position of satellite
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        
        // Position all vectors at satellite location
        vectors.group.position.copy(mesh.position);
        
        // Get camera distance for scaling
        const camDistance = worldPos.distanceTo(this.camera.position);
        const scale = Math.max(1, camDistance / 10000); // Dynamic scaling based on distance
        
        // Update velocity vector
        if (satData.velocity) {
            this._updateArrow(
                vectors.velocity, 
                satData.velocity, 
                this.config.velocityScale * scale,
                'Velocity'
            );
        }
        
        // Get detailed acceleration components from physics engine
        const accelComponents = this._getAccelerationComponents(satId, satData);
        
        // Update total acceleration vector
        if (accelComponents.total) {
            this._updateArrow(
                vectors.totalAccel,
                accelComponents.total,
                this.config.accelerationScale * scale,
                'Total Accel'
            );
        }
        
        // Update gravity vector (sum of all gravitational forces)
        if (accelComponents.gravity) {
            this._updateArrow(
                vectors.gravity,
                accelComponents.gravity,
                this.config.accelerationScale * scale,
                'Gravity'
            );
        }
        
        // Update drag vector
        if (accelComponents.drag && accelComponents.drag.length() > 1e-6) {
            this._updateArrow(
                vectors.drag,
                accelComponents.drag,
                this.config.accelerationScale * scale,
                'Drag'
            );
        } else {
            vectors.drag.arrow.visible = false;
            vectors.drag.label.visible = false;
        }
        
        // Update radiation pressure vector
        if (accelComponents.radiation && accelComponents.radiation.length() > 1e-6) {
            this._updateArrow(
                vectors.radiation,
                accelComponents.radiation,
                this.config.accelerationScale * scale,
                'Radiation'
            );
        } else {
            vectors.radiation.arrow.visible = false;
            vectors.radiation.label.visible = false;
        }
    }

    /**
     * Get acceleration components from physics engine
     */
    _getAccelerationComponents(satId, satData) {
        const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
        if (!physicsEngine) return {};
        
        // Get the last calculated accelerations from physics engine
        const components = {
            total: new THREE.Vector3(),
            gravity: new THREE.Vector3(),
            drag: new THREE.Vector3(),
            radiation: new THREE.Vector3()
        };
        
        // Total acceleration
        if (satData.acceleration) {
            components.total.fromArray(satData.acceleration);
        }
        
        // Get gravitational acceleration from all bodies
        if (satData.a_bodies) {
            Object.values(satData.a_bodies).forEach(accel => {
                if (Array.isArray(accel)) {
                    components.gravity.add(new THREE.Vector3().fromArray(accel));
                }
            });
        }
        
        // Get drag acceleration if available
        if (satData.a_drag) {
            components.drag.fromArray(satData.a_drag);
        }
        
        // Get radiation pressure if available
        if (satData.a_radiation) {
            components.radiation.fromArray(satData.a_radiation);
        }
        
        return components;
    }

    /**
     * Create vector objects for a satellite
     */
    _createVectorObjects(satId) {
        const group = new THREE.Group();
        group.name = `SatVectors_${satId}`;
        
        // Get the satellite's parent group
        const satellite = this.satelliteManager._satellites.get(String(satId));
        const parentGroup = satellite?.visualizer?.mesh?.parent || this.scene;
        parentGroup.add(group);
        
        const vectors = {
            group,
            velocity: this._createArrowWithLabel(this.colors.velocity, 'V'),
            totalAccel: this._createArrowWithLabel(this.colors.totalAccel, 'A'),
            gravity: this._createArrowWithLabel(this.colors.gravity, 'G'),
            drag: this._createArrowWithLabel(this.colors.drag, 'D'),
            radiation: this._createArrowWithLabel(this.colors.radiation, 'R')
        };
        
        // Add all arrows to the group
        Object.values(vectors).forEach(v => {
            if (v.arrow) {
                group.add(v.arrow);
                group.add(v.label);
            }
        });
        
        return vectors;
    }

    /**
     * Create an arrow with label
     */
    _createArrowWithLabel(color, text) {
        // Create arrow
        const dir = new THREE.Vector3(1, 0, 0);
        const origin = new THREE.Vector3(0, 0, 0);
        const length = this.config.baseLength;
        const arrow = new THREE.ArrowHelper(dir, origin, length, color);
        arrow.visible = this.visible;
        
        // Create label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'vector-label';
        labelDiv.textContent = text;
        labelDiv.style.color = `#${color.toString(16).padStart(6, '0')}`;
        labelDiv.style.fontSize = '12px';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.textShadow = '0 0 3px black';
        labelDiv.style.pointerEvents = 'none';
        
        const label = new CSS2DObject(labelDiv);
        label.visible = this.visible;
        
        return { arrow, label, div: labelDiv };
    }

    /**
     * Update arrow direction and length
     */
    _updateArrow(vectorObj, direction, scale, labelText) {
        const { arrow, label, div } = vectorObj;
        
        // Convert to Vector3 if needed
        const dir = direction instanceof THREE.Vector3 ? direction : new THREE.Vector3().fromArray(direction);
        
        if (dir.length() < 1e-10) {
            arrow.visible = false;
            label.visible = false;
            return;
        }
        
        arrow.visible = this.visible;
        label.visible = this.visible;
        
        // Set arrow direction and length
        const length = dir.length() * scale;
        arrow.setDirection(dir.normalize());
        arrow.setLength(
            length,
            length * this.config.headLength,
            length * this.config.headWidth
        );
        
        // Position label at arrow tip
        label.position.copy(dir.normalize().multiplyScalar(length * 1.1));
        
        // Update label text with magnitude
        const magnitude = direction instanceof THREE.Vector3 ? direction.length() : 
                         Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
        div.textContent = `${labelText}: ${magnitude.toExponential(2)}`;
    }

    /**
     * Update label visibility based on camera distance
     */
    _updateLabelVisibility() {
        this.satelliteVectors.forEach((vectors, satId) => {
            const worldPos = new THREE.Vector3();
            vectors.group.getWorldPosition(worldPos);
            const distance = worldPos.distanceTo(this.camera.position);
            
            // Calculate fade factor
            let opacity = 1;
            if (distance > this.config.fadeStart) {
                opacity = 1 - (distance - this.config.fadeStart) / (this.config.fadeEnd - this.config.fadeStart);
                opacity = Math.max(0, Math.min(1, opacity));
            }
            
            // Apply to all labels
            Object.values(vectors).forEach(v => {
                if (v.div) {
                    v.div.style.opacity = opacity;
                }
            });
        });
    }

    /**
     * Remove vectors for a satellite
     */
    _removeSatelliteVectors(satId) {
        const vectors = this.satelliteVectors.get(satId);
        if (!vectors) return;
        
        // Remove from scene
        if (vectors.group.parent) {
            vectors.group.parent.remove(vectors.group);
        }
        
        // Dispose of geometries and materials
        Object.values(vectors).forEach(v => {
            if (v.arrow) {
                v.arrow.line.geometry.dispose();
                v.arrow.line.material.dispose();
                v.arrow.cone.geometry.dispose();
                v.arrow.cone.material.dispose();
            }
        });
        
        this.satelliteVectors.delete(satId);
    }

    /**
     * Set visibility of all vectors
     */
    setVisible(visible) {
        this.visible = visible;
        
        this.satelliteVectors.forEach(vectors => {
            Object.values(vectors).forEach(v => {
                if (v.arrow) v.arrow.visible = visible;
                if (v.label) v.label.visible = visible;
            });
        });
        
        // Force update when making visible
        if (visible) {
            this.update();
        }
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.satelliteVectors.forEach((vectors, satId) => {
            this._removeSatelliteVectors(satId);
        });
        this.satelliteVectors.clear();
    }
}