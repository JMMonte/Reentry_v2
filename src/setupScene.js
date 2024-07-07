// setupScene.js
import * as THREE from 'three';
import { Earth } from './components/Earth.js';
import { Sun } from './components/Sun.js';
import { Moon } from './components/Moon.js';
import { Vectors } from './utils/Vectors.js';
import CannonDebugger from 'cannon-es-debugger';
import { BackgroundStars } from './components/Background.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
//import { DisplayManager } from './managers/DisplayManager.js';

import {
    earthTexture,
    earthSpecTexture,
    earthNormalTexture,
    cloudTexture,
    moonTexture,
    moonBump
} from './config/textures.js';

import {
    geojsonDataCities,
    geojsonDataAirports,
    geojsonDataSpaceports,
    geojsonDataGroundStations,
    geojsonDataObservatories
} from './config/geojsonData.js';

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

export function setupScene(app) {
    new BackgroundStars(app.scene, app.camera);
    app.earth = new Earth(app.scene, app.world, app.renderer, app.timeUtils, app.textureManager);
    app.sun = new Sun(app.scene, app.timeUtils);
    app.moon = new Moon(app.scene, app.world, app.renderer, app.timeUtils, app.textureManager);
    app.vectors = new Vectors(app.earth, app.scene, app.timeUtils);
    app.cannonDebugger = new CannonDebugger(app.scene, app.world, { autoUpdate: false });
    addEarthPoints(app);
    //app.displayManager = new DisplayManager(app.scene, app.earth, app.moon, app.satellites, app.vectors);
}

export function addEarthPoints(app) {
    app.earth.earthSurface.addPoints(geojsonDataCities, app.earth.earthSurface.materials.cityPoint, 'cities');
    app.earth.earthSurface.addPoints(geojsonDataAirports, app.earth.earthSurface.materials.airportPoint, 'airports');
    app.earth.earthSurface.addPoints(geojsonDataSpaceports, app.earth.earthSurface.materials.spaceportPoint, 'spaceports');
    app.earth.earthSurface.addPoints(geojsonDataGroundStations, app.earth.earthSurface.materials.groundStationPoint, 'groundStations');
    app.earth.earthSurface.addPoints(geojsonDataObservatories, app.earth.earthSurface.materials.observatoryPoint, 'observatories');
}

export function setupPostProcessing(app) {
    const renderPass = new RenderPass(app.scene, app.camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3,
        0.999,
        0.99
    );
    bloomPass.renderToScreen = true;
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);

    app.composers.bloom = new EffectComposer(app.renderer);
    app.composers.bloom.addPass(renderPass);
    app.composers.bloom.addPass(bloomPass);

    app.composers.final = new EffectComposer(app.renderer);
    app.composers.final.addPass(renderPass);
    app.composers.final.addPass(app.composers.bloom);
}
