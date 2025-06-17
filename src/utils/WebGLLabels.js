/**
 * WebGLLabels.js - Unified Three.js label creation utility
 * 
 * This utility provides consistent Three.js sprite-based label creation
 * matching the style used in RadialGrid.js for all labels in the application.
 * 
 * Features:
 * - Canvas-based text rendering to Three.js sprites
 * - Consistent styling across all labels
 * - Proper memory management and disposal
 * - No CSS2D/CSS3D dependencies (pure WebGL)
 */

import * as THREE from 'three';
import { RENDER_ORDER } from '../components/planet/PlanetConstants.js';

export class WebGLLabels {
    /**
     * Draw a rounded rectangle on canvas
     */
    static drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
    }
    /**
     * Default label configuration matching RadialGrid style
     */
    static DEFAULT_CONFIG = {
        fontSize: 48,
        fontFamily: 'sans-serif',
        color: '#ffffff',
        backgroundColor: null,  // No background by default
        padding: 16,
        pixelScale: 0.00025,
        sizeAttenuation: false,  // Critical for consistent size
        renderOrder: RENDER_ORDER.DISTANCE_MARKERS,
        transparent: true,
        depthWrite: false,
        depthTest: true
    };

    /**
     * Create a Three.js sprite label matching RadialGrid style
     * @param {string} text - The text to display
     * @param {Object} config - Configuration options
     * @returns {THREE.Sprite} The created sprite
     */
    static createLabel(text, config = {}) {
        const options = { ...WebGLLabels.DEFAULT_CONFIG, ...config };
        
        // Validate text
        if (!text || typeof text !== 'string') {
            console.warn('[WebGLLabels] Invalid text provided:', text);
            text = ' '; // Use space as fallback to ensure valid dimensions
        }
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const font = `${options.fontSize}px ${options.fontFamily}`;
        
        // Set font before measuring
        ctx.font = font;
        const metrics = ctx.measureText(text);
        const textWidth = Math.max(1, Math.ceil(metrics.width || 1)); // Ensure minimum width
        const textHeight = Math.max(1, options.fontSize || 42); // Ensure minimum height
        
        // Add padding if specified
        const padding = Math.max(0, options.padding || 0);
        const margin = 2; // Extra margin for rounded corners
        canvas.width = Math.max(1, textWidth + padding * 2 + margin * 2);
        canvas.height = Math.max(1, textHeight + padding * 2 + margin * 2);
        
        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background if specified
        if (options.backgroundColor) {
            ctx.save();
            ctx.fillStyle = options.backgroundColor;
            const radius = 20; // Very large radius to test if it's working
            // Draw inset by margin to avoid clipping
            WebGLLabels.drawRoundedRect(ctx, margin, margin, canvas.width - margin * 2, canvas.height - margin * 2, radius);
            ctx.restore();
        }
        
        // Draw text
        ctx.font = font;
        ctx.fillStyle = options.color;
        ctx.textBaseline = 'top';
        ctx.fillText(text, padding + margin, padding + margin);
        
        // Create texture with error handling
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // Disable mipmaps for dynamic textures to avoid WebGL errors
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        
        // Create sprite material without mipmaps for dynamically generated textures
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true, // Always transparent for proper alpha blending
            alphaTest: 0.01, // Help with edge rendering
            sizeAttenuation: options.sizeAttenuation,
            depthWrite: options.depthWrite,
            depthTest: options.depthTest
        });
        
        // Create sprite
        const sprite = new THREE.Sprite(material);
        // Use exact same scaling as RadialGrid for consistency
        sprite.scale.set(
            canvas.width * options.pixelScale,
            canvas.height * options.pixelScale,
            1
        );
        sprite.renderOrder = options.renderOrder;
        
        // Store original text and config for updates
        sprite.userData = {
            text,
            config: options,
            canvas,
            texture
        };
        
        return sprite;
    }

    /**
     * Update existing sprite label text
     * @param {THREE.Sprite} sprite - The sprite to update
     * @param {string} newText - The new text
     * @param {Object} config - Optional config overrides
     */
    static updateLabel(sprite, newText, config = {}) {
        if (!sprite.userData?.canvas) {
            console.warn('[WebGLLabels] Cannot update sprite without userData');
            return;
        }
        
        // Validate text
        if (!newText || typeof newText !== 'string') {
            console.warn('[WebGLLabels] Invalid text provided for update:', newText);
            newText = ' '; // Use space as fallback
        }
        
        const options = { ...sprite.userData.config, ...config };
        const canvas = sprite.userData.canvas;
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set font before measuring
        const font = `${options.fontSize}px ${options.fontFamily}`;
        ctx.font = font;
        const metrics = ctx.measureText(newText);
        const textWidth = Math.max(1, Math.ceil(metrics.width || 1));
        const textHeight = Math.max(1, options.fontSize || 42);
        
        // Resize canvas if needed
        const padding = Math.max(0, options.padding || 0);
        const requiredWidth = Math.max(1, textWidth + padding * 2);
        const requiredHeight = Math.max(1, textHeight + padding * 2);
        
        if (requiredWidth > canvas.width || requiredHeight > canvas.height) {
            canvas.width = Math.max(1, requiredWidth);
            canvas.height = Math.max(1, requiredHeight);
            
            // Update sprite scale
            sprite.scale.set(
                Math.max(0.001, canvas.width * options.pixelScale),
                Math.max(0.001, canvas.height * options.pixelScale),
                1
            );
        }
        
        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background if specified
        if (options.backgroundColor) {
            ctx.save();
            ctx.fillStyle = options.backgroundColor;
            const radius = Math.min(12, canvas.width * 0.3, canvas.height * 0.4); // Larger rounded corners
            WebGLLabels.drawRoundedRect(ctx, 0, 0, canvas.width, canvas.height, radius);
            ctx.restore();
        }
        
        // Draw text
        ctx.font = font;
        ctx.fillStyle = options.color;
        ctx.textBaseline = 'top';
        ctx.fillText(newText, padding, padding);
        
        // Update texture
        sprite.userData.texture.needsUpdate = true;
        sprite.userData.text = newText;
        
        // Update material properties if they changed
        if (options.sizeAttenuation !== undefined && 
            sprite.material.sizeAttenuation !== options.sizeAttenuation) {
            sprite.material.sizeAttenuation = options.sizeAttenuation;
            sprite.material.needsUpdate = true;
        }
    }

    /**
     * Create a label with fade-in/fade-out animation support
     * @param {string} text - The text to display
     * @param {Object} config - Configuration options
     * @returns {Object} {sprite, updateFading, dispose}
     */
    static createFadingLabel(text, config = {}) {
        const sprite = WebGLLabels.createLabel(text, config);
        
        // Add fading state
        sprite.userData.fadeAnimation = {
            targetOpacity: 1,
            currentOpacity: 1,
            startOpacity: 1,
            startTime: 0,
            animating: false,
            duration: 300, // 300ms fade duration matching RadialGrid
            baseOpacity: sprite.material.opacity || 1
        };
        
        // Update fading function
        const updateFading = (targetOpacity) => {
            const fadeState = sprite.userData.fadeAnimation;
            const currentTime = Date.now();
            
            if (targetOpacity !== fadeState.targetOpacity) {
                fadeState.targetOpacity = targetOpacity;
                fadeState.startOpacity = fadeState.currentOpacity;
                fadeState.startTime = currentTime;
                fadeState.animating = true;
            }
            
            if (fadeState.animating) {
                const elapsed = currentTime - fadeState.startTime;
                const progress = Math.min(elapsed / fadeState.duration, 1);
                
                // Use easing function for smooth animation
                const eased = WebGLLabels.easeInOutCubic(progress);
                fadeState.currentOpacity = fadeState.startOpacity + 
                    (fadeState.targetOpacity - fadeState.startOpacity) * eased;
                
                if (progress >= 1) {
                    fadeState.animating = false;
                    fadeState.currentOpacity = fadeState.targetOpacity;
                }
            }
            
            // Apply opacity
            sprite.material.opacity = fadeState.baseOpacity * fadeState.currentOpacity;
            sprite.visible = fadeState.currentOpacity > 0.01;
        };
        
        // Dispose function
        const dispose = () => {
            WebGLLabels.disposeLabel(sprite);
        };
        
        return { sprite, updateFading, dispose };
    }

    /**
     * Batch create multiple labels with consistent styling
     * @param {Array<Object>} labelConfigs - Array of {text, position, ...config}
     * @param {Object} commonConfig - Common configuration for all labels
     * @returns {Array<THREE.Sprite>} Array of created sprites
     */
    static createLabels(labelConfigs, commonConfig = {}) {
        return labelConfigs.map(labelConfig => {
            const { text, position, ...specificConfig } = labelConfig;
            const config = { ...commonConfig, ...specificConfig };
            const sprite = WebGLLabels.createLabel(text, config);
            
            if (position) {
                sprite.position.copy(position);
            }
            
            return sprite;
        });
    }

    /**
     * Dispose of a label and free resources
     * @param {THREE.Sprite} sprite - The sprite to dispose
     */
    static disposeLabel(sprite) {
        if (sprite.userData?.texture) {
            sprite.userData.texture.dispose();
        }
        if (sprite.material) {
            sprite.material.dispose();
        }
        if (sprite.parent) {
            sprite.parent.remove(sprite);
        }
    }

    /**
     * Dispose of multiple labels
     * @param {Array<THREE.Sprite>} sprites - Array of sprites to dispose
     */
    static disposeLabels(sprites) {
        sprites.forEach(sprite => WebGLLabels.disposeLabel(sprite));
    }

    /**
     * Easing function for smooth animations (matching RadialGrid)
     * @param {number} t - Progress value 0-1
     * @returns {number} Eased value
     */
    static easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
}