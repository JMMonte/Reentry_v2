/**
 * SatelliteVectors.js
 * 
 * Refactored satellite vector visualization that properly shows all forces
 * affecting satellites from the physics engine
 */

import * as THREE from 'three';
import { ArrowUtils } from './ArrowUtils.js';

export class SatelliteVectors {
    constructor({
        scene,
        camera,
        app3d,
        satelliteManager,
        // Visual configuration
        baseLength = 25,           // Base arrow length in km
        velocityScale = 1,         // Scale factor for velocity arrows
        accelerationScale = 50,  // Scale factor for acceleration arrows (km/s² are very small)
        maxVelocityLength = 500,   // Maximum velocity arrow length in km
        maxAccelLength = 500,      // Maximum acceleration arrow length in km
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
            maxVelocityLength,
            maxAccelLength,
            headLength,
            headWidth,
            fadeStart,
            fadeEnd
        };

        // Track satellite vector objects
        this.satelliteVectors = new Map(); // satelliteId -> vector objects
        this.visible = false;

        // Vector colors and configuration
        this.colors = {
            velocity: 0x00ff00,        // Green
            totalAccel: 0xff0000,      // Red
            gravity: 0xffff00,         // Yellow
            j2: 0xff8800,             // Orange
            drag: 0x00ffff,           // Cyan
            sun: 0xffff88,            // Light yellow
            moon: 0xaaaaff,           // Light blue
            planet: 0xff88ff          // Light magenta
        };
        
        // Which vectors to show
        this.vectorTypes = {
            velocity: true,
            totalAccel: true,
            gravity: true,
            j2: true,
            drag: true,
            individualBodies: true    // Show individual body contributions
        };
        
        // Listen for satellite deletion events
        this._onSatelliteDeleted = (e) => {
            if (e.detail?.id) {
                this._removeSatelliteVectors(String(e.detail.id));
            }
        };
        document.addEventListener('satelliteDeleted', this._onSatelliteDeleted);
    }

    /**
     * Update all satellite vectors
     */
    update() {
        const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
        if (!physicsEngine) return;

        // Get satellite states from the same source as debug window
        const simulationState = physicsEngine.getSimulationState();
        const satelliteStates = simulationState.satellites || {};

        // Update existing and add new satellites
        Object.entries(satelliteStates).forEach(([satId, satState]) => {
            this._updateSatelliteVectors(satId, satState);
        });

        // Remove vectors for deleted satellites
        this.satelliteVectors.forEach((vectors, satId) => {
            if (!satelliteStates[satId]) {
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

        // Position vectors at origin since they're now children of the satellite mesh
        // The satellite mesh position will automatically position the vectors
        vectors.group.position.set(0, 0, 0);

        // Update velocity vector
        if (satData.velocity && Array.isArray(satData.velocity)) {
            this._updateArrow(
                vectors.velocity,
                satData.velocity,
                'V'
            );
        }

        // Update total acceleration vector
        if (satData.a_total && this.vectorTypes.totalAccel) {
            this._updateArrow(
                vectors.totalAccel,
                satData.a_total,
                'Total'
            );
        } else {
            vectors.totalAccel.arrow.visible = false;
            vectors.totalAccel.label.visible = false;
        }

        // Update gravity vector (total gravitational force from physics engine)
        if (satData.a_gravity_total && this.vectorTypes.gravity) {
            // Pass array directly, no conversion
            this._updateArrow(
                vectors.gravity,
                satData.a_gravity_total,
                'Gravity'
            );
        } else {
            vectors.gravity.arrow.visible = false;
            vectors.gravity.label.visible = false;
        }

        // Update J2 perturbation vector
        if (satData.a_j2 && this.vectorTypes.j2) {
            this._updateArrow(
                vectors.j2,
                satData.a_j2,
                'J2'
            );
        } else {
            vectors.j2.arrow.visible = false;
            vectors.j2.label.visible = false;
        }

        // Update drag vector
        if (satData.a_drag && this.vectorTypes.drag) {
            this._updateArrow(
                vectors.drag,
                satData.a_drag,
                'Drag'
            );
        } else {
            vectors.drag.arrow.visible = false;
            vectors.drag.label.visible = false;
        }

        // Update individual body vectors if enabled
        // Use direct accelerations for intuitive vector display, fall back to tidal perturbations
        const bodyAccelerations = satData.a_bodies_direct || satData.a_bodies;
        if (bodyAccelerations && this.vectorTypes.individualBodies) {
            this._updateBodyVectors(vectors, bodyAccelerations);
        } else {
            // Hide all body vectors
            if (vectors.bodyVectors) {
                Object.values(vectors.bodyVectors).forEach(v => {
                    v.arrow.visible = false;
                    v.label.visible = false;
                });
            }
        }
    }

    /**
     * Update vectors for individual gravitating bodies
     */
    _updateBodyVectors(vectors, a_bodies) {
        if (!vectors.bodyVectors) {
            vectors.bodyVectors = {};
        }
        
        // Get physics engine to look up body names
        const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
        if (!physicsEngine) return;
        
        Object.entries(a_bodies).forEach(([bodyId, accel]) => {
            if (!Array.isArray(accel)) return;
            
            const magnitude = Math.sqrt(accel[0] ** 2 + accel[1] ** 2 + accel[2] ** 2);
            if (magnitude < 1e-10) return;
            
            // Get or create vector for this body
            if (!vectors.bodyVectors[bodyId]) {
                const body = physicsEngine.bodies[bodyId];
                const color = this._getBodyColor(bodyId);
                const vectorObj = this._createArrowWithLabel(color, body?.name || `Body ${bodyId}`);
                vectors.group.add(vectorObj.arrow);
                vectors.group.add(vectorObj.label);
                vectors.bodyVectors[bodyId] = vectorObj;
            }
            
            // Update the vector - pass array directly
            const body = physicsEngine.bodies[bodyId];
            this._updateArrow(
                vectors.bodyVectors[bodyId],
                accel,
                body?.name || `Body ${bodyId}`
            );
        });
    }
    
    /**
     * Get color for a specific body
     */
    _getBodyColor(bodyId) {
        const id = parseInt(bodyId);
        if (id === 10) return this.colors.sun;        // Sun
        if (id === 301) return this.colors.moon;      // Moon
        if (id === 399) return this.colors.planet;    // Earth
        if (id === 599) return 0xcc8844;              // Jupiter (brownish)
        if (id === 499) return 0xff4444;              // Mars (reddish)
        return 0x888888;                               // Default gray
    }

    /**
     * Create vector objects for a satellite
     */
    _createVectorObjects(satId) {
        const group = new THREE.Group();
        group.name = `SatVectors_${satId}`;

        // Add vectors as children of the satellite mesh
        // This ensures they move with the satellite automatically
        const satellite = this.satelliteManager._satellites.get(String(satId));
        if (satellite?.visualizer?.mesh) {
            satellite.visualizer.mesh.add(group);
        } else {
            // Fallback: add to scene if satellite mesh not found
            this.scene.add(group);
        }

        const vectors = {
            group,
            velocity: this._createArrowWithLabel(this.colors.velocity, 'V'),
            totalAccel: this._createArrowWithLabel(this.colors.totalAccel, 'A'),
            gravity: this._createArrowWithLabel(this.colors.gravity, 'G'),
            j2: this._createArrowWithLabel(this.colors.j2, 'J2'),
            drag: this._createArrowWithLabel(this.colors.drag, 'D'),
            bodyVectors: {} // Will be populated dynamically
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
     * Create an arrow with label using consolidated ArrowUtils
     */
    _createArrowWithLabel(color, text) {
        const result = ArrowUtils.createArrowWithLabel({
            direction: new THREE.Vector3(1, 0, 0),
            origin: new THREE.Vector3(0, 0, 0),
            length: this.config.baseLength,
            color,
            text,
            labelType: 'css2d',
            visible: this.visible,
            headLengthRatio: this.config.headLength,
            headWidthRatio: this.config.headWidth,
            fontSize: '12px',
            fontWeight: 'bold',
            textShadow: '0 0 3px black',
            pointerEvents: 'none'
        });

        return { 
            arrow: result.arrow, 
            label: result.label, 
            div: result.div,
            dispose: result.dispose 
        };
    }

    /**
     * Update arrow direction with fixed length
     */
    _updateArrow(vectorObj, direction, labelText) {
        const { arrow, label, div } = vectorObj;

        // Handle both Vector3 and array inputs
        let magnitude;
        let dirNormalized;
        
        if (direction instanceof THREE.Vector3) {
            magnitude = direction.length();
            dirNormalized = direction.clone().normalize();
        } else if (Array.isArray(direction)) {
            magnitude = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
            dirNormalized = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize();
        } else {
            console.error('[SatelliteVectors._updateArrow] Invalid direction format:', direction);
            arrow.visible = false;
            label.visible = false;
            return;
        }

        if (magnitude < 1e-10) {
            arrow.visible = false;
            label.visible = false;
            return;
        }

        arrow.visible = this.visible;
        label.visible = this.visible;

        // Use fixed length for all vectors
        const length = this.config.baseLength;
        
        ArrowUtils.updateArrowDirection(
            arrow, 
            dirNormalized, 
            length, 
            length * this.config.headLength, 
            length * this.config.headWidth
        );

        // Position label at arrow tip
        label.position.copy(dirNormalized.multiplyScalar(length * 1.1));
        
        // Format the label to match debug window exactly
        if (labelText === 'V' || labelText === 'Velocity') {
            // Velocity: show in km/s with 2 decimal places
            div.textContent = `${labelText}: ${magnitude.toFixed(2)} km/s`;
        } else {
            // Acceleration: show in scientific notation km/s²
            div.textContent = `${labelText}: ${magnitude.toExponential(2)} km/s²`;
        }
    }

    /**
     * Update label visibility based on camera distance
     */
    _updateLabelVisibility() {
        this.satelliteVectors.forEach((vectors) => {
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

        // Dispose of all vector objects
        const disposeVectorObject = (v) => {
            if (!v) return;
            
            // Use ArrowUtils disposal if available, otherwise fallback to manual disposal
            if (v.dispose) {
                v.dispose();
            } else {
                // Fallback disposal for legacy objects
                if (v.arrow) {
                    if (v.arrow.line?.geometry) v.arrow.line.geometry.dispose();
                    if (v.arrow.line?.material) v.arrow.line.material.dispose();
                    if (v.arrow.cone?.geometry) v.arrow.cone.geometry.dispose();
                    if (v.arrow.cone?.material) v.arrow.cone.material.dispose();
                }
                
                // Remove label div from DOM - CRITICAL!
                if (v.div && v.div.parentNode) {
                    v.div.parentNode.removeChild(v.div);
                }
            }
        };

        // Dispose standard vectors
        ['velocity', 'totalAccel', 'gravity', 'j2', 'drag'].forEach(key => {
            if (vectors[key]) {
                disposeVectorObject(vectors[key]);
            }
        });

        // Dispose body vectors
        if (vectors.bodyVectors) {
            Object.values(vectors.bodyVectors).forEach(v => disposeVectorObject(v));
        }

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
     * Toggle individual vector types
     */
    setVectorTypeVisible(vectorType, visible) {
        if (Object.prototype.hasOwnProperty.call(this.vectorTypes, vectorType)) {
            this.vectorTypes[vectorType] = visible;
            // Force update to apply changes
            if (this.visible) {
                this.update();
            }
        }
    }
    
    /**
     * Get current vector visibility settings
     */
    getVectorTypes() {
        return { ...this.vectorTypes };
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Remove event listener
        if (this._onSatelliteDeleted) {
            document.removeEventListener('satelliteDeleted', this._onSatelliteDeleted);
        }
        
        // Remove all satellite vectors
        this.satelliteVectors.forEach((vectors, satId) => {
            this._removeSatelliteVectors(satId);
        });
        this.satelliteVectors.clear();
    }
}