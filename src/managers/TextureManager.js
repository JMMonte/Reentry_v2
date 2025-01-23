// textureManager.js
import * as THREE from 'three';

export class TextureManager {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.textures = {};
        this.isInitialized = false;
    }

    async initialize() {
        // Basic initialization is just setting up the loader
        // We don't load textures here as they are loaded on demand
        this.isInitialized = true;
    }

    loadTexture(url, name) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                texture => {
                    this.textures[name] = texture;
                    resolve(texture);
                },
                undefined,
                error => {
                    console.error(`Error loading texture ${name} from ${url}:`, error);
                    reject(new Error(`Error loading texture ${name} from ${url}`));
                }
            );
        });
    }

    getTexture(name) {
        return this.textures[name];
    }

    async loadAllTextures(textureList) {
        if (!this.isInitialized) {
            throw new Error('TextureManager not initialized');
        }
        const promises = textureList.map(texture => this.loadTexture(texture.url, texture.name));
        return Promise.all(promises);
    }

    dispose() {
        // Dispose of all textures
        Object.values(this.textures).forEach(texture => {
            if (texture.dispose) {
                texture.dispose();
            }
        });
        this.textures = {};
        this.isInitialized = false;
    }
}
