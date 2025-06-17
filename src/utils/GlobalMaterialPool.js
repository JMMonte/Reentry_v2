/**
 * Global material pool to prevent memory leaks by sharing materials
 * Focused on the biggest offenders: SpriteMaterial, MeshBasicMaterial, LineBasicMaterial
 */

import * as THREE from 'three';

class GlobalMaterialPool {
    constructor() {
        this.materials = new Map();
        this.textureCache = new Map();
        this.sharedTextures = new Map();
        
        // Create commonly used shared materials
        this.initCommonMaterials();
        
        // Create commonly used textures
        this.initCommonTextures();
    }

    initCommonMaterials() {
        // Default sprite material (reusable for text sprites)
        this.materials.set('sprite_default', new THREE.SpriteMaterial({
            transparent: true,
            sizeAttenuation: false
        }));

        // Default line material for axes, grids, etc.
        this.materials.set('line_default', new THREE.LineBasicMaterial({
            color: 0xffffff
        }));

        // Default mesh materials for common uses
        this.materials.set('mesh_basic_default', new THREE.MeshBasicMaterial({
            color: 0xffffff
        }));
    }

    initCommonTextures() {
        // Create shared circle texture for POI markers
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Draw a white circle
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        this.sharedTextures.set('poiCircle', texture);
    }

    /**
     * Get the shared circle texture for POI markers
     */
    getPoiCircleTexture() {
        return this.sharedTextures.get('poiCircle');
    }

    /**
     * Get or create a sprite material with specific properties
     */
    getSpriteMaterial(texture = null, options = {}) {
        const {
            transparent = true,
            sizeAttenuation = false,
            opacity = 1.0,
            color = 0xffffff
        } = options;

        // Create a key based on properties
        const textureId = texture ? texture.uuid : 'notexture';
        const key = `sprite_${textureId}_${transparent}_${sizeAttenuation}_${opacity}_${color}`;

        if (!this.materials.has(key)) {
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent,
                sizeAttenuation,
                opacity,
                color
            });
            this.materials.set(key, material);
        }

        return this.materials.get(key);
    }

    /**
     * Get or create a canvas texture for text sprites (shared across similar text)
     */
    getTextTexture(text, options = {}) {
        const {
            fontSize = 42,
            fontFamily = 'sans-serif',
            color = '#ffffff',
            backgroundColor = null
        } = options;

        const key = `text_${text}_${fontSize}_${fontFamily}_${color}_${backgroundColor}`;

        if (!this.textureCache.has(key)) {
            // Create canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const font = `${fontSize}px ${fontFamily}`;
            
            // Measure text
            ctx.font = font;
            const metrics = ctx.measureText(text);
            const textWidth = Math.ceil(metrics.width);
            const textHeight = fontSize;
            
            // Size canvas
            canvas.width = textWidth;
            canvas.height = textHeight;
            
            // Draw background if specified
            if (backgroundColor) {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, textWidth, textHeight);
            }
            
            // Draw text
            ctx.font = font;
            ctx.fillStyle = color;
            ctx.textBaseline = 'top';
            ctx.fillText(text, 0, 0);

            // Create texture
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            
            this.textureCache.set(key, texture);
        }

        return this.textureCache.get(key);
    }

    /**
     * Get or create a line material with specific properties
     */
    getLineMaterial(options = {}) {
        const {
            color = 0xffffff,
            opacity = 1.0,
            transparent = false,
            linewidth = 1,
            vertexColors = false,
            dashed = false,
            dashSize = 10,
            gapSize = 5
        } = options;

        const materialType = dashed ? 'dashed' : 'basic';
        const key = `line_${materialType}_${color}_${opacity}_${transparent}_${linewidth}_${vertexColors}_${dashSize}_${gapSize}`;

        if (!this.materials.has(key)) {
            if (dashed) {
                this.materials.set(key, new THREE.LineDashedMaterial({
                    color,
                    opacity,
                    transparent: transparent || opacity < 1.0,
                    linewidth,
                    vertexColors,
                    dashSize,
                    gapSize
                }));
            } else {
                this.materials.set(key, new THREE.LineBasicMaterial({
                    color,
                    opacity,
                    transparent: transparent || opacity < 1.0,
                    linewidth,
                    vertexColors
                }));
            }
        }

        return this.materials.get(key);
    }

    /**
     * Get or create a mesh basic material with specific properties
     */
    getMeshBasicMaterial(options = {}) {
        const {
            color = 0xffffff,
            opacity = 1.0,
            transparent = false,
            wireframe = false,
            side = THREE.FrontSide,
            map = null
        } = options;

        // Include texture UUID in key if texture is provided
        const textureId = map ? map.uuid : 'notexture';
        const key = `meshbasic_${color}_${opacity}_${transparent}_${wireframe}_${side}_${textureId}`;

        if (!this.materials.has(key)) {
            this.materials.set(key, new THREE.MeshBasicMaterial({
                color,
                opacity,
                transparent: transparent || opacity < 1.0,
                wireframe,
                side,
                map
            }));
        }

        return this.materials.get(key);
    }

    getRadialGridMaterial(opacity = 1.0, transparent = false) {
        return this.getLineMaterial({
            color: 0x44aaff,
            opacity,
            transparent: transparent || opacity < 1.0,
            vertexColors: true // Support vertex colors
        });
    }

    getApsisMaterials(color) {
        const colorStr = typeof color === 'number' ? color.toString() : color;
        const key = `apsis_${colorStr}`;
        
        if (!this.materials.has(key)) {
            const materials = {
                peri: this.getMeshBasicMaterial({ color }),
                apo: this.getMeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
                apoRings: [
                    this.getMeshBasicMaterial({ color, transparent: true, opacity: 0.6 }),
                    this.getMeshBasicMaterial({ color, transparent: true, opacity: 0.6 }),
                    this.getMeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
                ]
            };
            this.materials.set(key, materials);
        }
        
        return this.materials.get(key);
    }

    getManeuverNodeMaterial(color) {
        return this.getMeshBasicMaterial({ color });
    }

    getGhostPlanetMaterials() {
        const key = 'ghost_planet';
        
        if (!this.materials.has(key)) {
            const materials = {
                wireframe: this.getMeshBasicMaterial({
                    color: 0x888888,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.3
                }),
                soi: this.getMeshBasicMaterial({
                    color: 0x444444,
                    transparent: true,
                    opacity: 0.1,
                    side: THREE.DoubleSide
                })
            };
            this.materials.set(key, materials);
        }
        
        return this.materials.get(key);
    }

    /**
     * Create a shared text sprite that reuses materials
     */
    createSharedTextSprite(text, options = {}) {
        const {
            fontSize = 42,
            fontFamily = 'sans-serif',
            color = '#ffffff',
            backgroundColor = null,
            position = new THREE.Vector3(0, 0, 0),
            pixelScale = 0.0002,
            sizeAttenuation = false,
            renderOrder = 999
        } = options;

        // Get shared texture
        const texture = this.getTextTexture(text, { fontSize, fontFamily, color, backgroundColor });
        
        // Get shared material
        const material = this.getSpriteMaterial(texture, { sizeAttenuation });
        
        // Create sprite
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(texture.image.width * pixelScale, texture.image.height * pixelScale, 1);
        sprite.position.copy(position);
        sprite.renderOrder = renderOrder;

        return {
            sprite,
            texture,
            material,
            dispose: () => {
                // Don't dispose shared resources, just remove from parent
                if (sprite.parent) {
                    sprite.parent.remove(sprite);
                }
            }
        };
    }

    releaseMaterial(material) {
        // Don't dispose shared materials - they're reused
        // This is just a stub for compatibility
    }

    /**
     * Get material statistics for debugging
     */
    getStats() {
        const materialTypes = {};
        
        for (const [key, material] of this.materials.entries()) {
            if (material.constructor) {
                const type = material.constructor.name;
                materialTypes[type] = (materialTypes[type] || 0) + 1;
            } else if (typeof material === 'object' && !material.constructor) {
                // Handle composite material objects (like apsis materials)
                for (const subMat of Object.values(material)) {
                    if (Array.isArray(subMat)) {
                        subMat.forEach(m => {
                            if (m.constructor) {
                                const type = m.constructor.name;
                                materialTypes[type] = (materialTypes[type] || 0) + 1;
                            }
                        });
                    } else if (subMat && subMat.constructor) {
                        const type = subMat.constructor.name;
                        materialTypes[type] = (materialTypes[type] || 0) + 1;
                    }
                }
            }
        }
        
        return {
            totalMaterials: this.materials.size,
            totalTextures: this.textureCache.size,
            materialTypes,
            efficiency: {
                sharedSpriteMaterials: materialTypes.SpriteMaterial || 0,
                sharedMeshMaterials: materialTypes.MeshBasicMaterial || 0,
                sharedLineMaterials: materialTypes.LineBasicMaterial || 0
            }
        };
    }

    dispose() {
        // Dispose all cached textures
        for (const texture of this.textureCache.values()) {
            texture.dispose();
        }
        this.textureCache.clear();

        // Dispose all shared textures
        for (const texture of this.sharedTextures.values()) {
            texture.dispose();
        }
        this.sharedTextures.clear();

        // Dispose all materials
        for (const material of this.materials.values()) {
            if (material.dispose) {
                material.dispose();
            } else if (typeof material === 'object') {
                // Handle material objects with multiple materials
                for (const subMat of Object.values(material)) {
                    if (Array.isArray(subMat)) {
                        subMat.forEach(m => m.dispose?.());
                    } else {
                        subMat.dispose?.();
                    }
                }
            }
        }
        this.materials.clear();
    }
}

const globalMaterialPool = new GlobalMaterialPool();
export default globalMaterialPool;