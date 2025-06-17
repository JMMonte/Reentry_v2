/**
 * ArrowUtils.js - Consolidated utilities for arrow and label creation
 * 
 * This utility class consolidates duplicate arrow and label creation patterns 
 * found across SatelliteVectors.js, PlanetVectors.js, and ManeuverNodeRenderer.js.
 * 
 * Provides:
 * - Standardized arrow creation with THREE.ArrowHelper
 * - Custom cone/cylinder arrow creation for complex shapes  
 * - Canvas-based text sprite creation
 * - CSS2D label creation for UI overlays
 * - 3D text geometry label creation
 * - Material and resource management
 */

import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { WebGLLabels } from './WebGLLabels.js';

export class ArrowUtils {
    
    /**
     * Create a standard THREE.ArrowHelper with consistent styling
     * @param {Object} config Configuration object
     * @returns {Object} {arrow, dispose} where arrow is THREE.ArrowHelper and dispose is cleanup function
     */
    static createArrowHelper(config = {}) {
        const {
            direction = new THREE.Vector3(1, 0, 0),
            origin = new THREE.Vector3(0, 0, 0),
            length = 25,
            color = 0xffffff,
            headLength = null, // Will be calculated as fraction of length
            headWidth = null,  // Will be calculated as fraction of length
            headLengthRatio = 0.2,
            headWidthRatio = 0.1,
            visible = true,
            opacity = 1.0,
            transparent = false,
            depthTest = true,
            depthWrite = true
        } = config;

        // Calculate head dimensions
        const actualHeadLength = headLength || length * headLengthRatio;
        const actualHeadWidth = headWidth || length * headWidthRatio;

        // Create arrow
        const arrow = new THREE.ArrowHelper(direction, origin, length, color);
        arrow.setLength(length, actualHeadLength, actualHeadWidth);
        arrow.visible = visible;

        // Apply material properties to both line and cone
        if (arrow.line && arrow.line.material) {
            arrow.line.material.transparent = transparent || opacity < 1.0;
            arrow.line.material.opacity = opacity;
            arrow.line.material.depthTest = depthTest;
            arrow.line.material.depthWrite = depthWrite;
        }
        if (arrow.cone && arrow.cone.material) {
            arrow.cone.material.transparent = transparent || opacity < 1.0;
            arrow.cone.material.opacity = opacity;
            arrow.cone.material.depthTest = depthTest;
            arrow.cone.material.depthWrite = depthWrite;
        }

        // Disposal function
        const dispose = () => {
            if (arrow.line) {
                if (arrow.line.geometry) arrow.line.geometry.dispose();
                if (arrow.line.material) arrow.line.material.dispose();
            }
            if (arrow.cone) {
                if (arrow.cone.geometry) arrow.cone.geometry.dispose();
                if (arrow.cone.material) arrow.cone.material.dispose();
            }
        };

        return { arrow, dispose };
    }

    /**
     * Create a custom arrow using cylinder shaft and cone head
     * @param {Object} config Configuration object
     * @returns {Object} {arrow: THREE.Group, dispose: Function}
     */
    static createCustomArrow(config = {}) {
        const {
            direction = new THREE.Vector3(1, 0, 0),
            origin = new THREE.Vector3(0, 0, 0),
            length = 25,
            shaftRadius = 1,
            coneRadius = 4,
            coneHeight = 10,
            color = 0xffffff,
            opacity = 1.0,
            transparent = false,
            visible = true,
            segments = 8
        } = config;

        const arrowGroup = new THREE.Group();
        arrowGroup.position.copy(origin);
        arrowGroup.visible = visible;

        const shaftLength = Math.max(0, length - coneHeight);
        const materials = [];

        // Create shaft if length is sufficient
        if (shaftLength > 0) {
            const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, segments);
            const shaftMaterial = new THREE.MeshBasicMaterial({
                color,
                transparent: transparent || opacity < 1.0,
                opacity: opacity * 0.9
            });
            materials.push(shaftMaterial);

            const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
            shaft.position.y = shaftLength / 2;
            arrowGroup.add(shaft);
        }

        // Create cone
        const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, segments);
        const coneMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: transparent || opacity < 1.0,
            opacity
        });
        materials.push(coneMaterial);

        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.y = shaftLength + coneHeight / 2;
        arrowGroup.add(cone);

        // Orient arrow along direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        arrowGroup.quaternion.copy(quaternion);

        // Disposal function
        const dispose = () => {
            arrowGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            materials.forEach(material => material.dispose());
        };

        return { arrow: arrowGroup, dispose };
    }

    /**
     * Create a canvas-based text sprite using WebGLLabels
     * @param {Object} config Configuration object
     * @returns {Object} {sprite: THREE.Sprite, dispose: Function}
     */
    static createTextSprite(config = {}) {
        const {
            text,
            fontSize = 42,
            fontFamily = 'sans-serif',
            color = '#ffffff',
            backgroundColor = null,
            position = new THREE.Vector3(0, 0, 0),
            pixelScale = 0.0002,
            sizeAttenuation = false,
            renderOrder = 999,
            visible = true,
            padding = backgroundColor ? 16 : 0,
            labelManager = null,
            category = null
        } = config;

        let sprite;
        let dispose;

        if (labelManager && category) {
            // Use LabelManager for consistent styling
            const label = labelManager.createLabel(text, 'VECTOR_LABEL', {
                category,
                position,
                userData: { 
                    context: 'arrow_label',
                    originalConfig: config
                }
            });
            sprite = label.sprite;
            
            // Disposal function for LabelManager
            dispose = () => {
                labelManager.removeLabel(label.id);
            };
        } else {
            // Fallback to WebGLLabels for consistent implementation
            const labelConfig = {
                fontSize,
                fontFamily,
                color,
                backgroundColor,
                padding,
                pixelScale,
                sizeAttenuation,
                renderOrder
            };
            
            sprite = WebGLLabels.createLabel(text, labelConfig);
            sprite.position.copy(position);
            sprite.visible = visible;

            // Disposal function for WebGLLabels
            dispose = () => {
                WebGLLabels.disposeLabel(sprite);
            };
        }

        return { sprite, dispose };
    }

    /**
     * Create a CSS2D label overlay
     * @param {Object} config Configuration object
     * @returns {Object} {label: CSS2DObject, dispose: Function, div: HTMLElement}
     */
    static createCSS2DLabel(config = {}) {
        const {
            text,
            className = 'vector-label',
            color = '#ffffff',
            fontSize = '12px',
            fontWeight = 'bold',
            textShadow = '0 0 3px black',
            backgroundColor = null,
            padding = null,
            position = new THREE.Vector3(0, 0, 0),
            visible = true,
            pointerEvents = 'none'
        } = config;

        // Create DOM element
        const div = document.createElement('div');
        div.className = className;
        div.textContent = text;
        
        // Apply styles
        div.style.color = color;
        div.style.fontSize = fontSize;
        div.style.fontWeight = fontWeight;
        div.style.textShadow = textShadow;
        div.style.pointerEvents = pointerEvents;
        
        if (backgroundColor) {
            div.style.backgroundColor = backgroundColor;
        }
        if (padding) {
            div.style.padding = padding;
        }

        // Create CSS2DObject
        const label = new CSS2DObject(div);
        label.position.copy(position);
        label.visible = visible;

        // Disposal function
        const dispose = () => {
            if (div.parentNode) {
                div.parentNode.removeChild(div);
            }
        };

        return { label, dispose, div };
    }

    /**
     * Create a 3D text geometry label
     * @param {Object} config Configuration object
     * @returns {Object} {label: THREE.Mesh, dispose: Function}
     */
    static create3DTextLabel(config = {}) {
        const {
            text,
            font, // Required: THREE.js font object
            size = 10,
            height = 0.1,
            curveSegments = 4,
            color = 0xffffff,
            opacity = 1.0,
            transparent = false,
            position = new THREE.Vector3(0, 0, 0),
            visible = true
        } = config;

        if (!font) {
            console.warn('[ArrowUtils.create3DTextLabel] Font is required for 3D text labels');
            return { label: null, dispose: () => {} };
        }

        // Create text geometry
        const textGeometry = new TextGeometry(text, {
            font,
            size,
            height,
            curveSegments
        });

        // Create material
        const textMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: transparent || opacity < 1.0,
            opacity
        });

        // Create mesh
        const label = new THREE.Mesh(textGeometry, textMaterial);
        label.position.copy(position);
        label.visible = visible;

        // Disposal function
        const dispose = () => {
            if (textGeometry) textGeometry.dispose();
            if (textMaterial) textMaterial.dispose();
        };

        return { label, dispose };
    }

    /**
     * Update arrow direction and length
     * @param {THREE.ArrowHelper} arrow THREE.ArrowHelper instance
     * @param {THREE.Vector3|Array} direction Direction vector or array [x,y,z]
     * @param {number} length New length (optional)
     * @param {number} headLength Head length (optional)
     * @param {number} headWidth Head width (optional)
     */
    static updateArrowDirection(arrow, direction, length = null, headLength = null, headWidth = null) {
        if (!arrow || !arrow.setDirection) {
            console.warn('[ArrowUtils.updateArrowDirection] Invalid arrow object');
            return;
        }

        // Convert direction to Vector3 if needed
        let dirVector;
        if (direction instanceof THREE.Vector3) {
            dirVector = direction.clone().normalize();
        } else if (Array.isArray(direction) && direction.length >= 3) {
            dirVector = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize();
        } else {
            console.warn('[ArrowUtils.updateArrowDirection] Invalid direction format');
            return;
        }

        // Update direction
        arrow.setDirection(dirVector);

        // Update length if provided
        if (length !== null) {
            const currentLength = arrow.line?.geometry?.parameters?.height || length;
            const finalHeadLength = headLength || currentLength * 0.2;
            const finalHeadWidth = headWidth || currentLength * 0.1;
            arrow.setLength(length, finalHeadLength, finalHeadWidth);
        }
    }

    /**
     * Update sprite label text using WebGLLabels
     * @param {THREE.Sprite} sprite Sprite object with canvas texture
     * @param {string} newText New text content
     * @param {Object} styleConfig Optional style overrides
     */
    static updateSpriteText(sprite, newText, styleConfig = {}) {
        WebGLLabels.updateLabel(sprite, newText, styleConfig);
    }

    /**
     * Create a complete arrow with label combination
     * @param {Object} config Configuration object
     * @returns {Object} {arrow, label, dispose} containing both arrow and label with cleanup
     */
    static createArrowWithLabel(config = {}) {
        const {
            // Arrow config
            direction = new THREE.Vector3(1, 0, 0),
            origin = new THREE.Vector3(0, 0, 0),
            length = 25,
            color = 0xffffff,
            arrowType = 'helper', // 'helper' or 'custom'
            
            // Label config
            text,
            labelType = 'sprite', // 'sprite', 'css2d', or '3d'
            labelOffset = 1.1, // Multiplier for label position along direction
            font = null, // Required for 3D text labels
            labelManager = null, // LabelManager instance for unified styling
            category = null, // Label category for organization
            
            // Common config
            visible = true
        } = config;

        const results = {};
        const disposeFunctions = [];

        // Create arrow
        if (arrowType === 'custom') {
            const arrowResult = ArrowUtils.createCustomArrow({
                direction, origin, length, color, visible, ...config
            });
            results.arrow = arrowResult.arrow;
            disposeFunctions.push(arrowResult.dispose);
        } else {
            const arrowResult = ArrowUtils.createArrowHelper({
                direction, origin, length, color, visible, ...config
            });
            results.arrow = arrowResult.arrow;
            disposeFunctions.push(arrowResult.dispose);
        }

        // Create label if text provided
        if (text) {
            const labelPosition = direction.clone().multiplyScalar(length * labelOffset).add(origin);
            
            let labelResult;
            if (labelType === 'css2d') {
                labelResult = ArrowUtils.createCSS2DLabel({
                    text, position: labelPosition, visible,
                    color: `#${color.toString(16).padStart(6, '0')}`,
                    ...config
                });
                results.label = labelResult.label;
                results.div = labelResult.div;
            } else if (labelType === '3d' && font) {
                labelResult = ArrowUtils.create3DTextLabel({
                    text, font, position: labelPosition, color, visible, ...config
                });
                results.label = labelResult.label;
            } else {
                // Default to sprite using WebGLLabels
                labelResult = ArrowUtils.createTextSprite({
                    text, position: labelPosition, visible,
                    color: `#${color.toString(16).padStart(6, '0')}`,
                    labelManager,
                    category,
                    ...config
                });
                results.label = labelResult.sprite;
            }
            
            if (labelResult?.dispose) {
                disposeFunctions.push(labelResult.dispose);
            }
        }

        // Combined disposal function
        results.dispose = () => {
            disposeFunctions.forEach(dispose => dispose());
        };

        return results;
    }
}