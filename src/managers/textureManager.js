// textureManager.js
import * as THREE from 'three';

export class TextureManager {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.textures = {};
        this._loadingPromises = new Map(); // Track loading promises to avoid duplicates
    }

    loadTexture(url, name) {
        // Check if texture already exists
        if (this.textures[name]) {
            return Promise.resolve(this.textures[name]);
        }
        
        // Check if already loading
        if (this._loadingPromises.has(name)) {
            return this._loadingPromises.get(name);
        }
        
        // Create new loading promise
        const loadPromise = new Promise((resolve, reject) => {
            this.loader.load(
                url,
                texture => {
                    this.textures[name] = texture;
                    this._loadingPromises.delete(name);
                    resolve(texture);
                },
                undefined,
                error => {
                    console.error(`Error loading texture ${name} from ${url}:`, error);
                    this._loadingPromises.delete(name);
                    reject(new Error(`Error loading texture ${name} from ${url}`));
                }
            );
        });
        
        this._loadingPromises.set(name, loadPromise);
        return loadPromise;
    }

    getTexture(name) {
        return this.textures[name];
    }

    async loadAllTextures(textureList) {
        const promises = textureList.map(texture => this.loadTexture(texture.url, texture.name));
        return Promise.all(promises);
    }
    
    /**
     * Dispose of a specific texture
     * @param {string} name - Name of the texture to dispose
     */
    disposeTexture(name) {
        const texture = this.textures[name];
        if (texture) {
            texture.dispose();
            delete this.textures[name];
        }
    }
    
    /**
     * Dispose of all loaded textures
     */
    dispose() {
        // Cancel any pending loads
        this._loadingPromises.clear();
        
        // Dispose all textures
        for (const name in this.textures) {
            const texture = this.textures[name];
            if (texture && typeof texture.dispose === 'function') {
                texture.dispose();
            }
        }
        
        // Clear texture cache
        this.textures = {};
        
        // Clear loader reference
        this.loader = null;
    }
}
