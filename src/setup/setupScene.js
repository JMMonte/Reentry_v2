// setupScene.js
// ──────────────────────────────────────────────────────────────────────────────
// 1. IMPORTS
// ──────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

// 3-D assets ───────────────────────────────────────────────────────────────────
import { Planet } from '../components/Planet.js';
import { Sun } from '../components/Sun.js';
import { BackgroundStars } from '../components/background.js';

// Post-processing ───────────────────────────────────────────────────────────────
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Domain utilities ─────────────────────────────────────────────────────────────
import { Constants } from '../utils/Constants.js';
import { SatelliteVectors } from '../utils/SatelliteVectors.js';
import { PlanetVectors } from '../utils/PlanetVectors.js';

// Config ───────────────────────────────────────────────────────────────────────
import {
    celestialBodiesConfig,
    textureDefinitions,
    ambientLightConfig,
    bloomConfig
} from '../config/celestialBodiesConfig.js';

// ──────────────────────────────────────────────────────────────────────────────
// 2. STATIC CONFIGURATION - Moved to celestialBodiesConfig.js
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// 3. HELPERS
// ──────────────────────────────────────────────────────────────────────────────
const addAmbientLight = (scene) => {
    const light = new THREE.AmbientLight(
        ambientLightConfig.color,
        ambientLightConfig.intensity
    );
    light.name = 'ambientLight';
    scene.add(light);
};

const loadTextures = async (textureManager) => {
    const tasks = textureDefinitions.map(({ key, src }) => ({
        name: key,
        url: src,
        fallbackUrl: `${src}?url`
    }));
    await textureManager.loadAllTextures(tasks);
};

/**
 * Retrieves the Earth configuration object.
 * @returns {object} The Earth configuration.
 */
const getEarthConfig = () => {
    return celestialBodiesConfig.earth;
};

/**
 * Creates the Moon configuration object, dynamically calculating argument of periapsis.
 * @param {object} timeUtils - Utility object for time calculations.
 * @returns {object} The Moon configuration.
 */
const createMoonConfig = (timeUtils) => {
    // Get base config
    const moonConfig = { ...celestialBodiesConfig.moon }; // Clone to avoid modifying original

    // --- derive argument of periapsis at runtime
    const JD = timeUtils.getJulianDate();
    const T = (JD - 2451545.0) / 36525;
    const lamPi = 83.353246 + 4069.0137287 * T - 0.01032 * T * T - T ** 3 / 80000;
    const argPerDeg = lamPi - THREE.MathUtils.radToDeg(Constants.ascendingNode) + 80; // empirical offset

    // Update the argument of periapsis in the copied config
    moonConfig.orbitElements = {
        ...moonConfig.orbitElements,
        argumentOfPeriapsis: THREE.MathUtils.degToRad(argPerDeg)
    };

    return moonConfig;
};

const setupPostProcessing = (app) => {
    const { scene, camera, renderer, sceneManager } = app;
    const composer = new EffectComposer(renderer);

    composer.addPass(new RenderPass(scene, camera));

    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms.resolution.value.set(
        1 / (window.innerWidth * pixelRatio),
        1 / (window.innerHeight * pixelRatio)
    );
    composer.addPass(fxaaPass);
    sceneManager.composers.fxaaPass = fxaaPass;

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        bloomConfig.strength,
        bloomConfig.radius,
        bloomConfig.threshold
    );
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);
    bloomPass.renderToScreen = true;
    composer.addPass(bloomPass);
    sceneManager.composers.final = composer;
};

// ──────────────────────────────────────────────────────────────────────────────
// 4. PUBLIC API
// ──────────────────────────────────────────────────────────────────────────────
/**
 * The only function you import elsewhere.
 * Handles: textures ➜ primitives ➜ planets ➜ post-processing.
 */
export async function initScene(app) {
    const { scene, renderer, camera, timeUtils, textureManager } = app;
    // Provide camera to Planet class for dynamic LOD updates
    Planet.setCamera(camera);

    if (!scene || !renderer || !camera) throw new Error('Scene, camera, or renderer not set.');
    if (!textureManager) throw new Error('TextureManager not initialized.');

    // 1. Assets & background
    await loadTextures(textureManager);
    addAmbientLight(scene);
    new BackgroundStars(scene, camera);

    // 2. Planetary bodies
    app.earth = new Planet(scene, renderer, timeUtils, textureManager, getEarthConfig());
    app.sun = new Sun(scene, timeUtils, celestialBodiesConfig.sun); // Pass sun config
    app.moon = new Planet(scene, renderer, timeUtils, textureManager, createMoonConfig(timeUtils));

    // 3. Helpers
    // gather all celestial bodies (earth, moon, sun)
    app.celestialBodies = [app.earth, app.moon, app.sun];
    // create vectors only for planetary bodies (skip Sun)
    app.planetVectors = app.celestialBodies
        .filter(b => typeof b.getMesh === 'function' && b.rotationGroup)
        .map(b => new PlanetVectors(b, scene, timeUtils, { name: b.name }));

    const gravitySources = [];
    for (const planet of app.celestialBodies ?? []) {
        const mesh = planet.getMesh?.();
        if (!mesh) continue;
        const config = celestialBodiesConfig[planet.name.toLowerCase()];
        if (!config) continue; // Skip if no config found

        gravitySources.push({
            name: planet.name.toLowerCase(),
            body: planet,
            mesh: mesh,
            mass: config.mass ?? 0 // Use mass from config
        });
    }
    // add Sun as gravity source
    const sunMesh = app.sun.sun ?? app.sun.sunLight ?? app.sun;
    const sunConfig = celestialBodiesConfig.sun;
    if (sunConfig) { // Check if sun config exists
        gravitySources.push({
            name: 'sun',
            body: app.sun,
            mesh: sunMesh,
            mass: sunConfig.mass ?? Constants.sunMass // Fallback just in case
        });
    }

    app.satelliteVectors = new SatelliteVectors({
        scene,
        timeUtils,
        satelliteManager: app.satellites,
        gravitySources,
        camera
    });

    // 4. Display tuning
    if (app.displaySettingsManager) app.displaySettingsManager.applyAll();

    // 5. Post-processing
    setupPostProcessing(app);

    return scene;  // gives callers a fluent handle
}
