/**
 * LabelManager.js - Unified label management system for the 3D application
 * 
 * This manager provides a consistent interface for creating, updating, and managing
 * all types of labels in the 3D scene with standardized styling and behavior.
 * 
 * Features:
 * - Standardized label styles and configurations
 * - Automatic memory management and disposal
 * - Category-based organization and bulk operations
 * - Performance optimizations (batching, pooling, caching)
 * - Consistent update patterns
 */

import * as THREE from 'three';
import { WebGLLabels } from '../utils/WebGLLabels.js';
import { RENDER_ORDER } from '../components/planet/PlanetConstants.js';

export class LabelManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Category-based label storage
        this.labels = new Map(); // categoryId -> Set of labels
        this.labelsByType = new Map(); // type -> Set of labels

        // Performance tracking
        this.updateThreshold = 0.05; // 5% distance change threshold
        this.lastCameraPosition = new THREE.Vector3();
        this.framesSinceUpdate = 0;
        this.updateFrequency = 3; // Update every 3 frames

        // Label configurations by type
        this.labelTypes = {
            // Planet and celestial body labels
            PLANET_AXIS: {
                fontSize: 42,
                fontFamily: 'sans-serif',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: 4,
                pixelScale: 0.0002,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.PLANET_AXIS_LABELS,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                fadeDistance: { start: 0, end: Infinity }
            },

            // Radial grid distance markers
            DISTANCE_MARKER: {
                fontSize: 42,
                fontFamily: 'sans-serif',
                color: '#ffffff',
                backgroundColor: null,
                padding: 16,
                pixelScale: 0.00025,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.DISTANCE_MARKERS,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                fadeDistance: { start: 0, end: Infinity }
            },

            // Vector arrows and directional indicators
            VECTOR_LABEL: {
                fontSize: 36,
                fontFamily: 'sans-serif',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: 6,
                pixelScale: 0.0003,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.VECTOR_LABELS,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                fadeDistance: { start: 0, end: Infinity }
            },

            // Points of Interest on planet surfaces
            POI_LABEL: {
                fontSize: 48,
                fontFamily: 'sans-serif',
                color: '#5d6d7d',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: 16,
                pixelScale: 0.0002,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.POI_UI_LABELS,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                fadeDistance: { start: 0, end: Infinity }
            },

            // Satellite and vehicle labels
            SATELLITE_LABEL: {
                fontSize: 32,
                fontFamily: 'Arial',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: 8,
                pixelScale: 0.0003,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.SATELLITE_LABELS,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                fadeDistance: { start: 0, end: Infinity }
            },

            // Temporary/Ghost object labels
            GHOST_LABEL: {
                fontSize: 32,
                fontFamily: 'Arial',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: 8,
                pixelScale: 0.0003,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.GHOST_LABELS,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                fadeDistance: { start: 0, end: Infinity }
            },

            // Debug and development labels
            DEBUG_LABEL: {
                fontSize: 24,
                fontFamily: 'monospace',
                color: '#ffff00',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 4,
                pixelScale: 0.0002,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.DEBUG_LABELS,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                fadeDistance: { start: 0, end: Infinity }
            }
        };
    }

    /**
     * Create a label with consistent styling based on type
     * @param {string} text - Label text
     * @param {string} type - Label type from this.labelTypes
     * @param {Object} options - Additional options
     * @returns {Object} Label object with methods
     */
    createLabel(text, type, options = {}) {
        const {
            position = new THREE.Vector3(),
            category = 'default',
            visible = true,
            userData = {},
            configOverrides = {},
            renderOrderOverrides = null // Planet-specific render order overrides
        } = options;

        // Get base configuration for this type
        let baseConfig = this.labelTypes[type];
        if (!baseConfig) {
            console.warn(`[LabelManager] Unknown label type: ${type}. Using default configuration.`);
            baseConfig = this.labelTypes.DISTANCE_MARKER;
        }

        // Calculate planet-aware render order if overrides provided
        let finalConfig = { ...baseConfig, ...configOverrides };
        if (renderOrderOverrides) {
            const atmosphereOrder = renderOrderOverrides.ATMOSPHERE || 100;
            // Calculate label-specific offset above atmosphere
            const labelOffset = this.getLabelTypeOffset(type);
            finalConfig.renderOrder = atmosphereOrder + labelOffset;
        }

        // Merge configurations
        const config = finalConfig;

        // Create the sprite using WebGLLabels
        const sprite = WebGLLabels.createLabel(text, config);
        sprite.position.copy(position);
        sprite.visible = visible;

        // Enhanced userData for tracking
        sprite.userData = {
            ...userData,
            labelType: type,
            category,
            originalText: text,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
            fadeState: {
                targetOpacity: 1,
                currentOpacity: 1,
                animating: false
            }
        };

        // Create label object with methods
        const labelObj = {
            sprite,
            type,
            category,

            // Update text content
            updateText: (newText, styleOverrides = {}) => {
                WebGLLabels.updateLabel(sprite, newText, styleOverrides);
                sprite.userData.originalText = newText;
                sprite.userData.lastUpdate = Date.now();
            },

            // Update position
            setPosition: (newPosition) => {
                sprite.position.copy(newPosition);
            },

            // Set visibility with optional fade
            setVisible: (visible, fade = false) => {
                if (fade) {
                    this._animateFade(sprite, visible ? 1 : 0);
                } else {
                    sprite.visible = visible;
                    sprite.material.opacity = visible ? 1 : 0;
                }
            },

            // Dispose the label
            dispose: () => {
                this._removeLabel(labelObj);
            }
        };

        // Add to tracking collections
        this._addLabelToCategory(labelObj, category);
        this._addLabelToType(labelObj, type);

        // DON'T add to scene automatically - let components manage hierarchy
        // Components will add sprite to their appropriate groups/parents

        return labelObj;
    }

    /**
     * Get render order offset for label type relative to atmosphere
     * @param {string} type - Label type
     * @returns {number} Offset to add to atmosphere render order
     */
    getLabelTypeOffset(type) {
        const offsets = {
            DISTANCE_MARKER: 20,    // Distance markers slightly above atmosphere
            VECTOR_LABEL: 25,       // Vector labels higher than distance markers  
            PLANET_AXIS: 30,        // Planet axis labels higher still
            POI_LABEL: 35,          // POI labels very visible
            SATELLITE_LABEL: 40,    // Satellite labels prioritized
            GHOST_LABEL: 45,        // Ghost labels high priority
            DEBUG_LABEL: 50         // Debug labels highest priority
        };
        return offsets[type] || 50; // Default high priority for unknown types
    }

    /**
     * Create multiple labels efficiently
     * @param {Array} labelConfigs - Array of {text, type, options}
     * @returns {Array} Array of label objects
     */
    createLabels(labelConfigs) {
        return labelConfigs.map(config =>
            this.createLabel(config.text, config.type, config.options || {})
        );
    }

    /**
     * Update label to face camera (billboard effect)
     * @param {Object} labelObj - Label object
     */
    updateLabelOrientation(labelObj) {
        if (labelObj.sprite && this.camera) {
            labelObj.sprite.lookAt(this.camera.position);
        }
    }

    /**
     * Update all labels in a category to face camera
     * @param {string} category - Category name
     */
    updateCategoryOrientation(category) {
        const categoryLabels = this.labels.get(category);
        if (categoryLabels) {
            for (const labelObj of categoryLabels) {
                this.updateLabelOrientation(labelObj);
            }
        }
    }

    /**
     * Update all labels to face camera (call this in animation loop)
     */
        updateAllOrientations() {
        // Performance optimization: only update when camera moves significantly
        this.framesSinceUpdate++;
        
        if (this.framesSinceUpdate < this.updateFrequency) {
            return;
        }
        
        this.framesSinceUpdate = 0;
        
        if (!this.camera) return;
        
        const cameraDistance = this.camera.position.distanceTo(this.lastCameraPosition);
        const threshold = this.camera.position.length() * this.updateThreshold;
        
        if (cameraDistance < threshold) {
            return;
        }
        
        this.lastCameraPosition.copy(this.camera.position);
        
        // Update all labels to face camera
        for (const categoryLabels of this.labels.values()) {
            for (const labelObj of categoryLabels) {
                this.updateLabelOrientation(labelObj);
            }
        }
    }

    /**
     * Set visibility for all labels in a category
     * @param {string} category - Category name
     * @param {boolean} visible - Visibility state
     * @param {boolean} fade - Whether to fade transition
     */
    setCategoryVisible(category, visible, fade = false) {
        const categoryLabels = this.labels.get(category);
        if (categoryLabels) {
            for (const labelObj of categoryLabels) {
                labelObj.setVisible(visible, fade);
            }
        }
    }

    /**
     * Set visibility for all labels of a specific type
     * @param {string} type - Label type
     * @param {boolean} visible - Visibility state
     * @param {boolean} fade - Whether to fade transition
     */
    setTypeVisible(type, visible, fade = false) {
        const typeLabels = this.labelsByType.get(type);
        if (typeLabels) {
            for (const labelObj of typeLabels) {
                labelObj.setVisible(visible, fade);
            }
        }
    }

    /**
     * Get all labels in a category
     * @param {string} category - Category name
     * @returns {Set} Set of label objects
     */
    getLabelsInCategory(category) {
        return this.labels.get(category) || new Set();
    }

    /**
     * Get all labels of a specific type
     * @param {string} type - Label type
     * @returns {Set} Set of label objects
     */
    getLabelsByType(type) {
        return this.labelsByType.get(type) || new Set();
    }

    /**
     * Remove all labels in a category
     * @param {string} category - Category name
     */
    clearCategory(category) {
        const categoryLabels = this.labels.get(category);
        if (categoryLabels) {
            // Convert to array to avoid modification during iteration
            const labelsArray = Array.from(categoryLabels);
            for (const labelObj of labelsArray) {
                labelObj.dispose();
            }
        }
    }

    /**
     * Remove all labels of a specific type
     * @param {string} type - Label type
     */
    clearType(type) {
        const typeLabels = this.labelsByType.get(type);
        if (typeLabels) {
            // Convert to array to avoid modification during iteration
            const labelsArray = Array.from(typeLabels);
            for (const labelObj of labelsArray) {
                labelObj.dispose();
            }
        }
    }

    /**
     * Clear all labels
     */
    clearAll() {
        // Dispose all labels properly
        for (const categoryLabels of this.labels.values()) {
            const labelsArray = Array.from(categoryLabels);
            for (const labelObj of labelsArray) {
                this._removeLabelFromScene(labelObj);
            }
        }

        this.labels.clear();
        this.labelsByType.clear();
    }

    // Private methods

    _addLabelToCategory(labelObj, category) {
        if (!this.labels.has(category)) {
            this.labels.set(category, new Set());
        }
        this.labels.get(category).add(labelObj);
    }

    _addLabelToType(labelObj, type) {
        if (!this.labelsByType.has(type)) {
            this.labelsByType.set(type, new Set());
        }
        this.labelsByType.get(type).add(labelObj);
    }

    _removeLabel(labelObj) {
        // Remove from scene
        this._removeLabelFromScene(labelObj);

        // Remove from category tracking
        const category = labelObj.category;
        const categoryLabels = this.labels.get(category);
        if (categoryLabels) {
            categoryLabels.delete(labelObj);
            if (categoryLabels.size === 0) {
                this.labels.delete(category);
            }
        }

        // Remove from type tracking
        const type = labelObj.type;
        const typeLabels = this.labelsByType.get(type);
        if (typeLabels) {
            typeLabels.delete(labelObj);
            if (typeLabels.size === 0) {
                this.labelsByType.delete(type);
            }
        }
    }

    _removeLabelFromScene(labelObj) {
        if (labelObj.sprite) {
            // Remove from parent (could be scene, group, etc.)
            if (labelObj.sprite.parent) {
                labelObj.sprite.parent.remove(labelObj.sprite);
            }
            WebGLLabels.disposeLabel(labelObj.sprite);
        }
    }

    _animateFade(sprite, targetOpacity) {
        const fadeState = sprite.userData.fadeState;
        fadeState.targetOpacity = targetOpacity;
        fadeState.startOpacity = sprite.material.opacity;
        fadeState.startTime = Date.now();
        fadeState.animating = true;
        fadeState.duration = 300; // 300ms fade
    }

    /**
     * Update fade animations (call this in animation loop)
     */
        updateFadeAnimations() {
        for (const categoryLabels of this.labels.values()) {
            for (const labelObj of categoryLabels) {
                const sprite = labelObj.sprite;
                const fadeState = sprite.userData.fadeState;
                
                if (fadeState.animating) {
                    const elapsed = Date.now() - fadeState.startTime;
                    const progress = Math.min(elapsed / fadeState.duration, 1);
                    
                    // Smooth easing
                    const eased = this._easeInOutCubic(progress);
                    const currentOpacity = fadeState.startOpacity + 
                        (fadeState.targetOpacity - fadeState.startOpacity) * eased;
                    
                    sprite.material.opacity = currentOpacity;
                    sprite.visible = currentOpacity > 0.01;
                    
                    if (progress >= 1) {
                        fadeState.animating = false;
                        fadeState.currentOpacity = fadeState.targetOpacity;
                    }
                }
            }
        }
    }

    _easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.clearAll();
        this.scene = null;
        this.camera = null;
    }
} 