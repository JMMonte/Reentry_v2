/**
 * SatelliteVectorVisualizer.js
 * 
 * Per-satellite vector visualization component that integrates with THREE.js hierarchy.
 * Follows the same pattern as SatelliteVisualizer for consistency.
 */

import * as THREE from 'three';
import { ArrowUtils } from '../../utils/ArrowUtils.js';
import { WebGLLabels } from '../../utils/WebGLLabels.js';

export class SatelliteVectorVisualizer {
    constructor(config = {}) {
        // Configuration with defaults
        this.config = {
            baseLength: config.baseLength || 25,
            velocityScale: config.velocityScale || 1,
            accelerationScale: config.accelerationScale || 50,
            maxVelocityLength: config.maxVelocityLength || 500,
            maxAccelLength: config.maxAccelLength || 500,
            headLength: config.headLength || 0.2,
            headWidth: config.headWidth || 0.1,
            fadeStart: config.fadeStart || 50000,
            fadeEnd: config.fadeEnd || 100000,
            ...config
        };

        // LabelManager integration - following PlanetVectors pattern
        this.labelManager = config.labelManager || null;
        this.labelCategory = `satellite_vectors_${config.satelliteId || 'unknown'}`;
        this.satelliteId = config.satelliteId;

        // THREE.js groups - separate arrows and labels for different scaling behavior
        this.arrowGroup = new THREE.Group();
        this.arrowGroup.name = 'SatelliteVectorArrows';
        this.labelGroup = new THREE.Group();
        this.labelGroup.name = 'SatelliteVectorLabels';
        
        // Main group contains both sub-groups
        this.group = new THREE.Group();
        this.group.name = 'SatelliteVectors';
        this.group.add(this.arrowGroup);
        this.group.add(this.labelGroup);

        // Vector colors
        this.colors = {
            velocity: 0x00ff00,        // Green
            totalAccel: 0xff0000,      // Red
            gravity: 0xffff00,         // Yellow
            j2: 0xff8800,             // Orange
            drag: 0x00ffff,           // Cyan
            sun: 0xffff88,            // Light yellow
            moon: 0xaaaaff,           // Light blue
            planet: 0xff88ff,         // Light magenta
            ...config.colors
        };

        // Which vector types to show
        this.vectorTypes = {
            velocity: true,
            totalAccel: true,
            gravity: true,
            j2: true,
            drag: true,
            individualBodies: true,
            ...config.vectorTypes
        };

        // Vector objects
        this.vectors = {
            velocity: null,
            totalAccel: null,
            gravity: null,
            j2: null,
            drag: null,
            bodyVectors: {} // Dynamic body vectors
        };

        // Label sprites storage - following PlanetVectors pattern
        this.labelSprites = [];

        // Visibility state
        this.visible = config.visible !== undefined ? config.visible : true;

        // Pre-allocated vectors for performance
        this._worldPos = new THREE.Vector3();

        // Initialize vector objects
        this._initializeVectors();
    }

    /**
     * Initialize all vector objects
     * @private
     */
    _initializeVectors() {
        // Create standard vectors
        this.vectors.velocity = this._createArrowWithLabel(this.colors.velocity, 'V');
        this.vectors.totalAccel = this._createArrowWithLabel(this.colors.totalAccel, 'Total');
        this.vectors.gravity = this._createArrowWithLabel(this.colors.gravity, 'Gravity');
        this.vectors.j2 = this._createArrowWithLabel(this.colors.j2, 'J2');
        this.vectors.drag = this._createArrowWithLabel(this.colors.drag, 'Drag');

        // Add arrows to arrow group, labels to label group
        Object.values(this.vectors).forEach(v => {
            if (v && v.arrow && v.label) {
                this.arrowGroup.add(v.arrow);
                this.labelGroup.add(v.label);
            }
        });
    }

    /**
     * Update vectors from satellite physics data
     * @param {Object} satelliteState - Physics state from satellite engine
     * @param {THREE.Camera} camera - Camera for distance-based scaling and fading
     */
    updateFromPhysics(satelliteState, camera = null) {
        if (!this.visible) {
            // When vectors are not visible, explicitly hide all arrows and labels
            this._hideAllVectors();
            return;
        }

        // Update distance-based scaling and fading if camera provided
        if (camera) {
            this.group.getWorldPosition(this._worldPos);
            
            // Use centralized distance cache for better performance
            const satelliteId = `satellite_${this.satelliteId || 'unknown'}`;
            let distance = window.app3d?.distanceCache?.getDistance?.(satelliteId);
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                distance = camera.position.distanceTo(this._worldPos);
            }
            
            // Apply scaling only to arrows, not labels
            const targetSize = 0.0024;
            const scale = distance * targetSize;
            this.arrowGroup.scale.set(scale, scale, scale);
            
            // Apply distance-based fading to labels (like PlanetVectors)
            this._updateFading(distance);
        }

        // Update velocity vector
        if (satelliteState.velocity && Array.isArray(satelliteState.velocity) && this.vectorTypes.velocity) {
            this._updateArrow(this.vectors.velocity, satelliteState.velocity, 'V');
        } else {
            this._hideVector(this.vectors.velocity);
        }

        // Update acceleration vectors using global frame components for correct orientation
        if (satelliteState.a_total && this.vectorTypes.totalAccel) {
            this._updateArrow(this.vectors.totalAccel, satelliteState.a_total, 'Total');
        } else {
            this._hideVector(this.vectors.totalAccel);
        }

        if (satelliteState.a_gravity_total && this.vectorTypes.gravity) {
            this._updateArrow(this.vectors.gravity, satelliteState.a_gravity_total, 'Gravity');
        } else {
            this._hideVector(this.vectors.gravity);
        }

        if (satelliteState.a_j2 && this.vectorTypes.j2) {
            this._updateArrow(this.vectors.j2, satelliteState.a_j2, 'J2');
        } else {
            this._hideVector(this.vectors.j2);
        }

        if (satelliteState.a_drag && this.vectorTypes.drag) {
            this._updateArrow(this.vectors.drag, satelliteState.a_drag, 'Drag');
        } else {
            this._hideVector(this.vectors.drag);
        }

        // Update individual body vectors using global frame components
        const bodyAccelerations = satelliteState.a_bodies_direct || satelliteState.a_bodies;
        if (bodyAccelerations && this.vectorTypes.individualBodies) {
            this._updateBodyVectors(bodyAccelerations, satelliteState);
        } else {
            this._hideBodyVectors();
        }
    }

    /**
     * Update distance-based fading for labels - following PlanetVectors pattern
     * @private
     */
    _updateFading(distance) {
        // Use same fade logic as other components
        const fadeStart = this.config.fadeStart;
        const fadeEnd = this.config.fadeEnd;
        let opacity = 1;
        
        if (distance > fadeStart) {
            opacity = distance >= fadeEnd ? 0 : 1 - (distance - fadeStart) / (fadeEnd - fadeStart);
            opacity = Math.max(0, Math.min(1, opacity));
        }

        // Apply fading to all labels - same pattern as PlanetVectors
        if (this.labelSprites) {
            this.labelSprites.forEach(item => {
                const sprite = item.sprite || item;
                if (sprite && sprite.material) {
                    sprite.material.opacity = opacity;
                    sprite.visible = opacity > 0.01;
                }
            });
        }
    }

    /**
     * Create an arrow with label - refactored to follow PlanetVectors pattern
     * @private
     */
    _createArrowWithLabel(color, text) {
        const result = ArrowUtils.createArrowWithLabel({
            direction: new THREE.Vector3(1, 0, 0),
            origin: new THREE.Vector3(0, 0, 0),
            length: this.config.baseLength,
            color,
            text,
            labelType: 'sprite',
            visible: this.visible,
            headLengthRatio: this.config.headLength,
            headWidthRatio: this.config.headWidth,
            sizeAttenuation: false
        });

        // Create label using same pattern as PlanetVectors
        const label = this._createLabel(text, new THREE.Vector3(0, 0, 0), `#${color.toString(16).padStart(6, '0')}`);

        return {
            arrow: result.arrow,
            label: label,
            dispose: result.dispose
        };
    }

    /**
     * Create label using same pattern as PlanetVectors
     * @private
     */
    _createLabel(text, position, color = '#ffffff') {
        let sprite;
        
        if (this.labelManager) {
            // Use LabelManager - following PlanetVectors pattern exactly
            const label = this.labelManager.createLabel(text, 'VECTOR_LABEL', {
                position: position.clone(),
                category: this.labelCategory,
                color: color,
                userData: { satellite: this.satelliteId }
            });
            sprite = label.sprite;
            this.labelSprites.push(label); // Store label object
        } else {
            // Fallback to WebGLLabels - use same config as LabelManager VECTOR_LABEL
            const labelConfig = {
                fontSize: 36,
                fontFamily: 'sans-serif',
                color: color,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: 6,
                pixelScale: 0.0003,
                sizeAttenuation: false,
                transparent: true,
                renderOrder: 1000,    // High render order
                depthWrite: false,    // Critical for rendering in front
                depthTest: true
            };
            
            sprite = WebGLLabels.createLabel(text, labelConfig);
            sprite.position.copy(position);
            this.labelSprites.push(sprite); // Store sprite directly
        }
        
        // Force render properties - same as PlanetVectors
        sprite.renderOrder = 9999;
        sprite.material.depthWrite = false;
        sprite.material.depthTest = true;
        sprite.material.transparent = true;

        return sprite;
    }

    /**
     * Update arrow direction and magnitude
     * @private
     * 
     * NOTE: Acceleration vectors are in satellite local reference frame:
     * - X component: Radial (outward from central body)
     * - Y component: Along-track (prograde, direction of velocity)
     * - Z component: Cross-track (normal to orbital plane)
     */
    _updateArrow(vectorObj, direction, labelText) {
        if (!vectorObj) return;

        const { arrow, label } = vectorObj;

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
            console.error('[SatelliteVectorVisualizer] Invalid direction format:', direction);
            this._hideVector(vectorObj);
            return;
        }

        if (magnitude < 1e-10) {
            this._hideVector(vectorObj);
            return;
        }

        // Show vector
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

        // Position label at arrow tip - account for arrow scaling
        // Since arrows are in arrowGroup which scales with distance, but labels are in labelGroup which doesn't scale,
        // we need to apply the same scaling factor to the label position to keep it at the arrow tip
        const arrowScale = this.arrowGroup.scale.x || 1; // Get current arrow scaling
        const scaledLength = length * arrowScale;
        label.position.copy(dirNormalized.clone().multiplyScalar(scaledLength * 1.1));

        // Format the label
        let labelTextWithValue;
        if (labelText === 'V' || labelText === 'Velocity') {
            labelTextWithValue = `${labelText}: ${magnitude.toFixed(2)} km/s`;
        } else {
            labelTextWithValue = `${labelText}: ${magnitude.toExponential(2)} km/s²`;
        }

        // Update label text - following PlanetVectors pattern
        if (this.labelManager) {
            const labelObj = this.labelSprites.find(l => l.sprite === label);
            if (labelObj?.updateText) {
                labelObj.updateText(labelTextWithValue);
            }
        } else {
            WebGLLabels.updateLabel(label, labelTextWithValue, {
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: 4,
                sizeAttenuation: false
            });
        }
    }

    /**
     * Hide a vector
     * @private
     */
    _hideVector(vectorObj) {
        if (!vectorObj) return;
        if (vectorObj.arrow) vectorObj.arrow.visible = false;
        if (vectorObj.label) vectorObj.label.visible = false;
    }

    /**
     * Update individual body vectors
     * @private
     */
    _updateBodyVectors(bodyAccelerations, satelliteState) {
        // Get physics engine for body names
        const physicsEngine = satelliteState._physicsEngine; // Will be set by caller
        
        Object.entries(bodyAccelerations).forEach(([bodyId, accel]) => {
            if (!Array.isArray(accel)) return;
            
            const magnitude = Math.sqrt(accel[0] ** 2 + accel[1] ** 2 + accel[2] ** 2);
            if (magnitude < 1e-10) return;
            
            // Get or create vector for this body
            if (!this.vectors.bodyVectors[bodyId]) {
                const body = physicsEngine?.bodies?.[bodyId];
                const color = this._getBodyColor(bodyId);
                const vectorObj = this._createArrowWithLabel(color, body?.name || `Body ${bodyId}`);
                this.arrowGroup.add(vectorObj.arrow);
                this.labelGroup.add(vectorObj.label);
                this.vectors.bodyVectors[bodyId] = vectorObj;
            }
            
            // Update the vector
            const body = physicsEngine?.bodies?.[bodyId];
            this._updateArrow(
                this.vectors.bodyVectors[bodyId],
                accel,
                body?.name || `Body ${bodyId}`
            );
        });
    }

    /**
     * Hide all body vectors
     * @private
     */
    _hideBodyVectors() {
        Object.values(this.vectors.bodyVectors).forEach(v => {
            this._hideVector(v);
        });
    }

    /**
     * Hide all vectors and labels when satellite vectors are disabled
     * @private
     */
    _hideAllVectors() {
        // Hide standard vectors
        Object.values(this.vectors).forEach(v => {
            if (v && typeof v === 'object' && v !== this.vectors.bodyVectors) {
                this._hideVector(v);
            }
        });

        // Hide body vectors
        this._hideBodyVectors();
    }

    /**
     * Get color for a specific body
     * @private
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
     * Set overall visibility
     */
    setVisible(visible) {
        this.visible = visible;
        this.group.visible = visible;

        // Also update individual vector visibility
        Object.values(this.vectors).forEach(v => {
            if (v && typeof v === 'object') {
                if (v.arrow) v.arrow.visible = visible;
                if (v.label) v.label.visible = visible;
            }
        });

        Object.values(this.vectors.bodyVectors).forEach(v => {
            if (v.arrow) v.arrow.visible = visible;
            if (v.label) v.label.visible = visible;
        });
    }

    /**
     * Set visibility for specific vector types
     */
    setVectorTypeVisible(vectorType, visible) {
        if (Object.prototype.hasOwnProperty.call(this.vectorTypes, vectorType)) {
            this.vectorTypes[vectorType] = visible;
        }
    }

    /**
     * Get current vector type visibility settings
     */
    getVectorTypes() {
        return { ...this.vectorTypes };
    }

    /**
     * Add to a parent object (usually satellite's orbit group)
     */
    addToParent(parent) {
        if (parent && this.group) {
            parent.add(this.group);
        }
    }

    /**
     * Remove from parent
     */
    removeFromParent() {
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }

    /**
     * Dispose of all resources - following PlanetVectors pattern
     */
    dispose() {
        // Dispose label sprites using LabelManager or fallback
        if (this.labelManager) {
            this.labelManager.clearCategory(this.labelCategory);
        } else if (this.labelSprites) {
            // For backward compatibility, handle mixed arrays
            this.labelSprites.forEach(item => {
                if (item) {
                    if (item.sprite) {
                        // Label object from LabelManager
                        WebGLLabels.disposeLabel(item.sprite);
                    } else if (item.isSprite || item.material) {
                        // Direct sprite
                        WebGLLabels.disposeLabel(item);
                    }
                }
            });
        }
        this.labelSprites = [];

        // Dispose standard vectors
        Object.values(this.vectors).forEach(v => {
            if (v && v.dispose) {
                v.dispose();
            }
        });

        // Dispose body vectors
        Object.values(this.vectors.bodyVectors).forEach(v => {
            if (v && v.dispose) {
                v.dispose();
            }
        });

        // Remove from parent
        this.removeFromParent();

        // Clear references
        this.vectors = {};
        this.arrowGroup = null;
        this.labelGroup = null;
        this.group = null;
        this.labelManager = null;
    }
} 