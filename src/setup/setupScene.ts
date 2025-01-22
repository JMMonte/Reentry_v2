import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { TextureManager } from '../managers/textureManager';

interface TextureEntry {
    url: string;
    name: string;
}

export async function loadTextures(): Promise<Record<string, THREE.Texture>> {
    const textureManager = new TextureManager();
    const textureList: TextureEntry[] = [
        { url: '/textures/earth/earth_texture.jpg', name: 'earthTexture' },
        { url: '/textures/earth/earth_spec.jpg', name: 'earthSpecTexture' },
        { url: '/textures/earth/earth_normal.jpg', name: 'earthNormalTexture' },
        { url: '/textures/earth/clouds.jpg', name: 'cloudTexture' },
        { url: '/textures/moon/moon_texture.jpg', name: 'moonTexture' },
        { url: '/textures/moon/moon_bump.jpg', name: 'moonBump' }
    ];
    try {
        await textureManager.loadAllTextures(textureList);
        return textureManager.getLoadedTextures();
    } catch (error) {
        console.error('Failed to load all textures:', error);
        throw error;
    }
}

export function setupScene(scene: THREE.Scene): void {
    try {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // soft white light
        ambientLight.name = 'ambientLight';
        scene.add(ambientLight);
    } catch (error) {
        console.error('Error setting up scene:', error);
        throw error;
    }
}

export function setupSceneDetails(scene: THREE.Scene): void {
    try {
        // Scene details will be added here as we migrate the components
    } catch (error) {
        console.error('Error setting up scene details:', error);
        throw error;
    }
}

export function setupPostProcessing(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    composer: EffectComposer
): void {
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3,
        0.999,
        0.99
    );
    bloomPass.renderToScreen = true;
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
} 