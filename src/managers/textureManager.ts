import * as THREE from 'three';

export interface TextureEntry {
    url: string;
    name: string;
}

export class TextureManager {
    private textures: Map<string, THREE.Texture>;

    constructor() {
        this.textures = new Map();
    }

    public async loadTexture(url: string, name: string): Promise<void> {
        try {
            const texture = await new THREE.TextureLoader().loadAsync(url);
            this.textures.set(name, texture);
        } catch (error) {
            console.error(`Error loading texture ${name} from ${url}:`, error);
            throw error;
        }
    }

    public getTexture(name: string): THREE.Texture | undefined {
        return this.textures.get(name);
    }

    public async loadAllTextures(textureList: TextureEntry[]): Promise<void> {
        try {
            await Promise.all(
                textureList.map(({ url, name }) => this.loadTexture(url, name))
            );
        } catch (error) {
            console.error('Error loading textures:', error);
            throw error;
        }
    }

    public getLoadedTextures(): Record<string, THREE.Texture> {
        const textureRecord: Record<string, THREE.Texture> = {};
        this.textures.forEach((texture, name) => {
            textureRecord[name] = texture;
        });
        return textureRecord;
    }

    public dispose(): void {
        this.textures.forEach(texture => texture.dispose());
        this.textures.clear();
    }
} 