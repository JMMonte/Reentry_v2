// setupScene.js
import * as THREE from 'three';
import { Earth } from '../components/Earth.js';
import { Sun } from '../components/Sun.js';
import { Moon } from '../components/Moon.js';
import { Vectors } from '../components/Vectors.js';
import CannonDebugger from 'cannon-es-debugger';
import { BackgroundStars } from '../components/Background.js';
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
} from '../config/textures.js';

import {
    geojsonDataCities,
    geojsonDataAirports,
    geojsonDataSpaceports,
    geojsonDataGroundStations,
    geojsonDataObservatories
} from '../config/geojsonData.js';

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
    if (!app.scene || !app.renderer) {
        throw new Error('Scene or renderer not initialized');
    }

    try {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // soft white light
        ambientLight.name = 'ambientLight';
        app.scene.add(ambientLight);

        const world = app.physicsManager.getWorld();
        if (!world) {
            throw new Error('Physics world not initialized');
        }

        app.cannonDebugger = new CannonDebugger(app.scene, world, { autoUpdate: false });
        return app.scene;
    } catch (error) {
        console.error('Error setting up scene:', error);
        throw error;
    }
}

export async function setupSceneDetails(app) {
    if (!app.textureManager) {
        throw new Error('TextureManager not initialized');
    }

    try {
        const world = app.physicsManager.getWorld();
        if (!world) {
            throw new Error('Physics world not initialized');
        }

        // Initialize components that require textures
        new BackgroundStars(app.scene, app.camera);
        app.earth = new Earth(app.scene, world, app.renderer, app.timeUtils, app.textureManager, app);
        app.sun = new Sun(app.scene, app.timeUtils);
        app.moon = new Moon(app.scene, world, app.renderer, app.timeUtils, app.textureManager);
        app.vectors = new Vectors(app.earth, app.scene, app.timeUtils);
        
        // Add earth points after Earth is initialized
        addEarthPoints(app);

        // Apply initial display settings to components
        console.log('Applying initial display settings to scene components');
        if (app.displayManager?.settings) {
            Object.entries(app.displayManager.settings).forEach(([key, value]) => {
                switch (key) {
                    case 'showGrid':
                        if (app.radialGrid) {
                            app.radialGrid.setVisible(value);
                        }
                        break;
                    case 'showVectors':
                        if (app.vectors) {
                            app.vectors.setVisible(value);
                        }
                        break;
                    case 'showSurfaceLines':
                        if (app.earth?.setSurfaceLinesVisible) {
                            app.earth.setSurfaceLinesVisible(value);
                        }
                        break;
                    case 'showCities':
                        if (app.earth?.setCitiesVisible) {
                            app.earth.setCitiesVisible(value);
                        }
                        break;
                    case 'showAirports':
                        if (app.earth?.setAirportsVisible) {
                            app.earth.setAirportsVisible(value);
                        }
                        break;
                    case 'showSpaceports':
                        if (app.earth?.setSpaceportsVisible) {
                            app.earth.setSpaceportsVisible(value);
                        }
                        break;
                    case 'showObservatories':
                        if (app.earth?.setObservatoriesVisible) {
                            app.earth.setObservatoriesVisible(value);
                        }
                        break;
                    case 'showGroundStations':
                        if (app.earth?.setGroundStationsVisible) {
                            app.earth.setGroundStationsVisible(value);
                        }
                        break;
                    case 'showCountryBorders':
                        if (app.earth?.setCountryBordersVisible) {
                            app.earth.setCountryBordersVisible(value);
                        }
                        break;
                    case 'showStates':
                        if (app.earth?.setStatesVisible) {
                            app.earth.setStatesVisible(value);
                        }
                        break;
                    case 'showMoonOrbit':
                        if (app.moon?.setOrbitVisible) {
                            app.moon.setOrbitVisible(value);
                        }
                        break;
                    case 'showMoonTraces':
                        if (app.moon?.setTraceVisible) {
                            app.moon.setTraceVisible(value);
                        }
                        break;
                    case 'showMoonSurfaceLines':
                        if (app.moon?.setSurfaceDetailsVisible) {
                            app.moon.setSurfaceDetailsVisible(value);
                        }
                        break;
                }
            });
        }
    } catch (error) {
        console.error('Error setting up scene details:', error);
        throw error;
    }
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
