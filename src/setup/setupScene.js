// setupScene.js
// ──────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ──────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

// 3-D assets ───────────────────────────────────────────────────────────────────
import { Planet } from '../components/planet/Planet.js';
import { BackgroundStars } from '../components/planet/background.js';
import { Sun } from '../components/planet/Sun.js';

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
import { textureDefinitions } from '../config/textureRegistry.js';

import { CelestialOrbitManager } from '../components/orbit/CelestialOrbitManager.js';
import { solarSystemDataManager } from '../physics/PlanetaryDataManager.js';
import { SolarSystemHierarchy } from '../physics/SolarSystemHierarchy.js';

// Scene-wide rendering settings (moved from celestialBodiesConfig.js)
export const ambientLightConfig = { color: 0xffffff, intensity: 0.1 };
export const bloomConfig = { strength: 0.3, radius: 0.999, threshold: 0.99 };

const addAmbientLight = (scene) => {
    const light = new THREE.AmbientLight(
        ambientLightConfig.color,
        ambientLightConfig.intensity
    );
    light.name = 'ambientLight';
    scene.add(light);
};

const loadTextures = async (textureManager) => {
    // Emit progress for texture loading start
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loadingProgress', {
            detail: { progress: 10, stage: 'Loading 4.5 Billion Years...' }
        }));
    }

    await textureManager.loadAllTextures(textureDefinitions.map(({ key, src }) => ({ name: key, url: src })));

    // Emit progress for texture loading complete
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loadingProgress', {
            detail: { progress: 30, stage: 'Collapsing Primordial Gas Cloud...' }
        }));
    }
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

// Using singleton solarSystemDataManager imported from PlanetaryDataManager.js

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

    // Cleanup old moon groups
    if (app.moonGroups && Array.isArray(app.moonGroups)) {
        app.moonGroups.forEach(moonGroup => {
            if (scene.children.includes(moonGroup)) {
                scene.remove(moonGroup);
            }
        });
        app.moonGroups = [];
    }

    // --- Refactored Object Creation ---
    app.bodiesByNaifId = {};   // Map NAIF ID -> Object (Group, Star, Planet)
    app.stars = [];            // Array of Star instances
    app.celestialBodies = [];  // Array of all major bodies (planets, moons, Sun)

    // --- Create background stars ---
    app.backgroundStars = new BackgroundStars(scene, camera);

    // 1. Initialize solar system data
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loadingProgress', {
            detail: { progress: 55, stage: 'Accreting Stellar Disk...' }
        }));
    }
    await solarSystemDataManager.initialize();

    // 2. Build hierarchy from config data
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loadingProgress', {
            detail: { progress: 65, stage: 'Spinning Up Magnetospheres...' }
        }));
    }
    const hierarchy = new SolarSystemHierarchy(solarSystemDataManager.naifToBody);
    app.hierarchy = hierarchy;

    // 3. Create all celestial bodies from config
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loadingProgress', {
            detail: { progress: 75, stage: 'Igniting Fusion Core...' }
        }));
    }

    for (const [, config] of solarSystemDataManager.naifToBody.entries()) {
        let bodyObj = null;
        if (config.type === 'star') {
            bodyObj = new Sun(scene, timeUtils, config, textureManager);
            app.stars.push(bodyObj);
            if (config.name.toLowerCase() === 'sun') app.sun = bodyObj;
        } else {
            bodyObj = new Planet(scene, renderer, timeUtils, textureManager, config);
        }
        bodyObj.naifId = config.naifId;
        app.celestialBodies.push(bodyObj);
        app.bodiesByNaifId[config.naifId] = bodyObj;
    }

    // --- Establish Parent-Child Relationships for Hierarchical Orbit Rendering ---
    for (const [naifId, node] of Object.entries(hierarchy.hierarchy)) {
        const childId = Number(naifId);
        const parentId = node.parent;
        if (parentId === null || parentId === 0) continue;
        const childBody = app.bodiesByNaifId[childId];
        const parentBody = app.bodiesByNaifId[parentId];
        if (childBody && parentBody && childBody instanceof Planet && parentBody instanceof Planet) {
            const childOrbitGroup = childBody.getOrbitGroup();
            const parentOrbitGroup = parentBody.getOrbitGroup();
            if (childOrbitGroup && parentOrbitGroup) {
                if (childOrbitGroup.parent === scene) {
                    scene.remove(childOrbitGroup);
                }
                parentOrbitGroup.add(childOrbitGroup);

                // --- Fix: For single-planet barycenter systems, set planet's local position to (0,0,0) ---
                // Check if parent is a barycenter and has only one child (the planet)
                const parentNode = hierarchy.hierarchy[parentId];
                const siblings = Object.entries(hierarchy.hierarchy).filter(([, n]) => n.parent === parentId);
                if (parentNode && parentNode.type === 'barycenter' && siblings.length === 1) {
                    childOrbitGroup.position.set(0, 0, 0);
                }
            }
        }
    }

    // --- Initialize Physics Engine with high precision orbital mechanics ---
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loadingProgress', {
            detail: { progress: 85, stage: 'Calibrating Orbital Resonances...' }
        }));
    }

    // Create CelestialOrbitManager for all celestial body orbits
    // It uses the existing app.hierarchy and app.bodiesByNaifId
    app.orbitManager = new CelestialOrbitManager(scene, app);

    // Generate all planetary and moon orbits after establishing hierarchy
    // Note: CelestialOrbitManager will automatically initialize when physics engine is ready

    app.orbitManager.renderAllOrbits();

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loadingProgress', {
            detail: { progress: 95, stage: 'Synchronizing Cosmic Clocks...' }
        }));
    }

    // Add top-level objects (those with no parent in the config, or whose parent wasn't found) to the scene
    for (const bodyObject of Object.values(app.bodiesByNaifId)) {
        if (!bodyObject) continue;
        let object3DForScene;
        if (bodyObject instanceof Planet && bodyObject.getOrbitGroup) {
            object3DForScene = bodyObject.getOrbitGroup();
        } else if (bodyObject instanceof Sun) {
            // Use orbitGroup for Sun, consistent with Planet objects
            if (bodyObject.orbitGroup && !bodyObject.orbitGroup.parent) {
                scene.add(bodyObject.orbitGroup);
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

    // 4. Populate mapping for planets/moons
    app.planetsByNaifId = {};
    app.celestialBodies.forEach(planet => {
        if (planet instanceof Planet && typeof planet.naifId === 'number') {
            app.planetsByNaifId[planet.naifId] = planet;
        }
    });

    // 5. Create PlanetVectors (for planets, moons, and barycenters)
    app.planetVectors = app.celestialBodies
        .filter(p => p instanceof Planet && p.getMesh)
        .map(p => new PlanetVectors(p, scene, app.sun?.sun, { name: p.name }));

    // 6. Construct gravitySources correctly (planets/moons + stars)
    const gravitySources = [];
    app.celestialBodies.forEach(body => {
        let mesh = null;
        if (body instanceof Planet && typeof body.getMesh === 'function') {
            mesh = body.getMesh();
        } else if (body instanceof Sun && body.sun) {
            mesh = body.sun;
        }
        gravitySources.push({
            name: body.nameLower,
            body,
            mesh,
            mass: body.mass ?? 0
        });
    });

    // Ensure no null/undefined entries
    // const validGravitySources = gravitySources.filter(Boolean);

    // Use refactored satellite vectors implementation
    app.satelliteVectors = new SatelliteVectors({
        scene,
        camera,
        app3d: app,
        satelliteManager: app.satellites
    });

    // --- Parent moons to their barycenter's orbitGroup ---
    for (const [, config] of solarSystemDataManager.naifToBody.entries()) {
        if (config.type === 'moon') {
            const moonObj = app.bodiesByNaifId[config.naifId];
            const parentBarycenter = app.bodiesByNaifId[config.parent];
            if (moonObj && parentBarycenter && parentBarycenter.getOrbitGroup) {
                // Place moons at barycenter level, same as their orbit lines
                // This ensures consistent coordinate systems between moon positions and orbit visualization
                parentBarycenter.getOrbitGroup().add(moonObj.getOrbitGroup());
            }
        }
    }

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
