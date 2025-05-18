// setupScene.js
// ──────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ──────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

// 3-D assets ───────────────────────────────────────────────────────────────────
import { Planet } from '../components/planet/Planet.js';
import { BackgroundStars } from '../components/background.js';
import { Sun } from '../components/Sun.js';

// Post-processing ───────────────────────────────────────────────────────────────
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'; // Re-enabled
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Domain utilities ─────────────────────────────────────────────────────────────
import { SatelliteVectors } from '../utils/SatelliteVectors.js';
import { PlanetVectors } from '../components/planet/PlanetVectors.js';

// Config ───────────────────────────────────────────────────────────────────────
import {
    celestialBodiesConfig,
    textureDefinitions,
    ambientLightConfig,
    bloomConfig, // Re-enabled
    barycenters,
    planets,
    moons,
    stars
} from '../config/celestialBodiesConfig.js';

import { OrbitManager } from '../managers/OrbitManager.js';

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

const setupPostProcessing = (app) => {
    const { scene, camera, renderer, sceneManager } = app;
    // Use default EffectComposer targets
    const composer = new EffectComposer(renderer);

    // 1. Render the main scene
    composer.addPass(new RenderPass(scene, camera));

    // 2. FXAA Pass (kept)
    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms.resolution.value.set(
        1 / (window.innerWidth * renderer.getPixelRatio()),
        1 / (window.innerHeight * renderer.getPixelRatio())
    );
    composer.addPass(fxaaPass);
    sceneManager.composers.fxaaPass = fxaaPass;

    // 3. Bloom Pass (re-enabled with potentially adjusted settings)
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        bloomConfig.strength, // We will use the existing config values for now
        bloomConfig.radius,
        bloomConfig.threshold
    );
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2); // Using half resolution is good for perf
    bloomPass.renderToScreen = true;
    composer.addPass(bloomPass);

    sceneManager.composers.final = composer;

    // If bloom is re-enabled, FXAA should not render to screen itself.
    // The final pass in the composer (which is now bloom) will render to screen.
    fxaaPass.renderToScreen = false;

};

/**
 * Creates and initializes all celestial bodies and related managers.
 * This function is called AFTER the first data from the backend is received.
 */
export async function createSceneObjects(app) {
    const { scene, renderer, camera, timeUtils, textureManager } = app;

    // --- REMOVE ALL SCENE CHILDREN ---
    // Dispose of background stars if present
    if (app.backgroundStars) {
        app.backgroundStars.dispose();
        app.backgroundStars = null;
    }
    if (scene && scene.children) {
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
    }

    // --- CLEANUP OLD BODIES ---
    if (app.celestialBodies && Array.isArray(app.celestialBodies)) {
        app.celestialBodies.forEach(body => body.dispose?.());
        app.celestialBodies.length = 0;
    }
    if (app.bodiesByNaifId && typeof app.bodiesByNaifId === 'object') {
        Object.values(app.bodiesByNaifId).forEach(body => body.dispose?.());
        Object.keys(app.bodiesByNaifId).forEach(k => { delete app.bodiesByNaifId[k]; });
    }
    if (window.Planet && Array.isArray(window.Planet.instances)) {
        window.Planet.instances.forEach(p => p.dispose?.());
        window.Planet.instances.length = 0;
    }

    // --- Refactored Object Creation ---
    app.bodiesByNaifId = {};   // Map NAIF ID -> Object (Group, Star, Planet)
    app.stars = [];            // Array of Star instances
    app.celestialBodies = [];  // Array of all major bodies (planets, moons, Sun)

    // --- Create background stars ---
    app.backgroundStars = new BackgroundStars(scene, camera);

    // 2. Create all barycenters as lightweight Planet objects
    for (const cfg of Object.values(barycenters)) {
        // Use Mercury's radius as fallback
        const baryConfig = {
            ...cfg,
            type: 'barycenter',
            radius: celestialBodiesConfig.mercury.radius,
            meshRes: 8, // minimal mesh
            materials: {
                surfaceConfig: {
                    materialType: 'basic',
                    params: { color: 0xffff00 }
                }
            }
        };
        const barycenter = new Planet(scene, renderer, timeUtils, textureManager, baryConfig);
        barycenter.naif_id = cfg.naif_id;
        app.celestialBodies.push(barycenter);
        app.bodiesByNaifId[cfg.naif_id] = barycenter;
    }

    // 3. Create all stars
    app.stars = [];
    for (const cfg of Object.values(stars)) {
        const star = new Sun(scene, timeUtils, cfg);
        star.naif_id = cfg.naif_id;
        app.stars.push(star);
        if (cfg.name.toLowerCase() === 'sun') app.sun = star; // legacy convenience
        app.bodiesByNaifId[cfg.naif_id] = star;
        // Add the Sun to celestialBodies for unified handling
        if (cfg.name.toLowerCase() === 'sun') {
            app.celestialBodies.push(star);
        }
    }

    // --- Solar System Order for Planets and Moons ---
    const planetMoonOrder = [
        // Mercury
        { planet: 'mercury', moons: [] },
        // Venus
        { planet: 'venus', moons: [] },
        // Earth
        { planet: 'earth', moons: ['moon'] },
        // Mars
        { planet: 'mars', moons: ['phobos', 'deimos'] },
        // Jupiter
        { planet: 'jupiter', moons: ['io', 'europa', 'ganymede', 'callisto'] },
        // Saturn
        { planet: 'saturn', moons: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'] },
        // Uranus
        { planet: 'uranus', moons: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'] },
        // Neptune
        { planet: 'neptune', moons: ['triton', 'proteus', 'nereid'] },
        // Pluto
        { planet: 'pluto', moons: ['charon', 'nix', 'hydra', 'kerberos', 'styx'] },
    ];

    // 4. Create all planets and moons (in correct order)
    for (const entry of planetMoonOrder) {
        // Create planet
        const planetCfg = planets[entry.planet];
        if (
            planetCfg &&
            typeof planetCfg.radius === 'number' && isFinite(planetCfg.radius) && planetCfg.radius > 0
        ) {
            const planet = new Planet(scene, renderer, timeUtils, textureManager, planetCfg);
            planet.naif_id = planetCfg.naif_id;
            app.celestialBodies.push(planet);
            app.bodiesByNaifId[planetCfg.naif_id] = planet;
        } else if (planetCfg) {
            console.warn(`Skipping planet ${planetCfg.name} due to missing/invalid data`, planetCfg);
        }
        // Create moons
        for (const moonName of entry.moons) {
            const moonCfg = moons[moonName];
            if (
                moonCfg &&
                typeof moonCfg.radius === 'number' && isFinite(moonCfg.radius) && moonCfg.radius > 0
            ) {
                const moon = new Planet(scene, renderer, timeUtils, textureManager, moonCfg);
                moon.naif_id = moonCfg.naif_id;
                app.celestialBodies.push(moon);
                app.bodiesByNaifId[moonCfg.naif_id] = moon;
            } else if (moonCfg) {
                console.warn(`Skipping moon ${moonCfg.name} due to missing/invalid data`, moonCfg);
            }
        }
    }

    // Instantiate OrbitManager for planetary orbits
    app.orbitManager = new OrbitManager({ scene, app });

    // Add top-level objects (those with no parent in the config, or whose parent wasn't found) to the scene
    for (const cfg of Object.values(celestialBodiesConfig)) {
        if (typeof cfg.naif_id !== 'number') continue;
        const bodyObject = app.bodiesByNaifId[cfg.naif_id];
        if (!bodyObject) continue;
        // Determine the actual THREE.Object3D to consider for scene addition
        let object3DForScene;
        if (bodyObject instanceof Planet && bodyObject.getOrbitGroup) {
            object3DForScene = bodyObject.getOrbitGroup();
        } else if (bodyObject instanceof Sun) {
            if (bodyObject.sun && !bodyObject.sun.parent) {
                scene.add(bodyObject.sun);
                if (bodyObject.sunLight && !bodyObject.sunLight.parent) {
                    scene.add(bodyObject.sunLight);
                }
            }
            continue;
        } else if (bodyObject instanceof THREE.Group) {
            object3DForScene = bodyObject;
        } else {
            continue;
        }
        if (object3DForScene instanceof THREE.Object3D && !object3DForScene.parent) {
            scene.add(object3DForScene);
        }
    }

    // --- Refactored Helper Population ---

    // 4. Populate mapping for planets/moons needed by simSocket
    app.planetsByNaifId = {}; // ONLY planets/moons for simulation updates
    app.celestialBodies.forEach(planet => {
        // Ensure we are dealing with Planet instances for planetsByNaifId
        if (planet instanceof Planet) {
            const cfg = celestialBodiesConfig[planet.nameLower] || Object.values(celestialBodiesConfig).find(c => c.naif_id === planet.naif_id);
            if (cfg && typeof cfg.naif_id === 'number') {
                app.planetsByNaifId[cfg.naif_id] = planet;
            }
        }
    });

    // 5. Create PlanetVectors (for planets, moons, and barycenters)
    app.planetVectors = app.celestialBodies
        .filter(p => p instanceof Planet && p.getMesh)
        .map(p => new PlanetVectors(p, scene, app.sun?.sun, { name: p.name }));

    // 6. Construct gravitySources correctly (planets/moons + stars)
    const gravitySources = [];
    // Add planets/moons and Sun
    app.celestialBodies.forEach(body => {
        const cfg = celestialBodiesConfig[body.nameLower] || Object.values(celestialBodiesConfig).find(c => c.naif_id === body.naif_id);
        if (cfg) {
            let mesh = null;
            if (body instanceof Planet && typeof body.getMesh === 'function') {
                mesh = body.getMesh();
            } else if (body instanceof Sun && body.sun) { // Check if body is an instance of Sun
                mesh = body.sun;
            }
            gravitySources.push({
                name: body.nameLower,
                body,
                mesh,
                mass: cfg.mass ?? 0
            });
        }
    });

    // Ensure no null/undefined entries
    const validGravitySources = gravitySources.filter(Boolean);

    app.satelliteVectors = new SatelliteVectors({
        scene,
        timeUtils,
        satelliteManager: app.satellites,
        gravitySources: validGravitySources,
        camera
    });

    // 7. Display tuning
    if (app.displaySettingsManager) app.displaySettingsManager.applyAll();
}


/**
 * The only function you import elsewhere.
 * Handles: textures ➜ primitives ➜ planets ➜ post-processing.
 */
export async function initScene(app) {
    const { scene, renderer, camera, textureManager } = app;

    app.sceneObjectsInitialized = false; // Flag to track initialization

    Planet.setCamera(camera);

    if (!scene || !renderer || !camera) throw new Error('Scene, camera, or renderer not set.');
    if (!textureManager) throw new Error('TextureManager not initialized.');

    // 1. Assets & background (these can be set up before backend data)
    await loadTextures(textureManager);
    addAmbientLight(scene);

    // Post-processing can also be set up early
    setupPostProcessing(app);

    // Signal that all assets are loaded
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('assetsLoaded'));
    }

    // Note: Celestial bodies and related managers (OrbitManager, PlanetVectors, etc.)
    // will be created by createSceneObjects(app) once the first backend message arrives.

    return scene; // gives callers a fluent handle
}
