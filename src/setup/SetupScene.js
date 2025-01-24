// setupScene.js
import * as THREE from 'three';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';

import {
    earthTexture,
    earthSpecTexture,
    earthNormalTexture,
    cloudTexture,
    moonTexture,
    moonBump
} from '../config/Textures.js';

export async function loadTextures(textureManager) {
    const textureList = [
        { url: earthTexture, name: 'earthTexture' },
        { url: earthSpecTexture, name: 'earthSpecTexture' },
        { url: earthNormalTexture, name: 'earthNormalTexture' },
        { url: cloudTexture, name: 'cloudTexture' },
        { url: moonTexture, name: 'moonTexture' },
        { url: moonBump, name: 'moonBump' }
    ];
    try {
        await textureManager.loadAllTextures(textureList);
    } catch (error) {
        console.error('Failed to load all textures:', error);
        throw error;
    }
}

export function setupPostProcessing(app) {
    if (!app.scene || !app.camera || !app.renderer) {
        throw new Error('Required components not initialized');
    }

    const renderPass = new RenderPass(app.scene, app.camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3,
        0.999,
        0.99
    );

    const composer = new EffectComposer(app.renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    return composer;
}
