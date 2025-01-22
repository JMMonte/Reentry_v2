import * as THREE from 'three';
import { Manager } from '../types';

interface TextureInfo {
    url: string;
    name: string;
}

export class TextureManager implements Manager {
    private loader: THREE.TextureLoader;
    private textures: { [key: string]: THREE.Texture };

    constructor() {
        this.loader = new THREE.TextureLoader();
        this.textures = {};
    }

    public loadTexture(url: string, name: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                (texture: THREE.Texture) => {
                    this.textures[name] = texture;
                    resolve(texture);
                },
                undefined,
                (error: unknown) => {
                    console.error(`Error loading texture ${name} from ${url}:`, error);
                    reject(new Error(`Error loading texture ${name} from ${url}`));
                }
            );
        });
    }

    public getTexture(name: string): THREE.Texture | undefined {
        return this.textures[name];
    }

    public async loadAllTextures(textureList: TextureInfo[]): Promise<THREE.Texture[]> {
        const promises = textureList.map(texture => this.loadTexture(texture.url, texture.name));
        return Promise.all(promises);
    }

    public initialize(): void {
        // No initialization needed for TextureManager
    }

    public dispose(): void {
        // Dispose of all textures
        Object.values(this.textures).forEach(texture => {
            if (texture.dispose) {
                texture.dispose();
            }
        });
        this.textures = {};
    }
} 