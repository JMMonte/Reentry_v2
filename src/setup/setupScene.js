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

    // --- Refactored Object Creation ---
    app.bodiesByNaifId = {};   // Map NAIF ID -> Object (Group, Star, Planet)
    app.stars = [];            // Array of Star instances
    app.celestialBodies = [];  // Array of all major bodies (planets, moons, Sun)

    // 2. Create all barycenters
    for (const cfg of Object.values(barycenters)) {
        const group = new THREE.Group();
        group.name = cfg.name;
        group.naif_id = cfg.naif_id;
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.2 })
        );
        group.add(marker);
        app.bodiesByNaifId[cfg.naif_id] = group;
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

    // 4. Create all planets and moons
    for (const cfg of [...Object.values(planets), ...Object.values(moons)]) {
        const planet = new Planet(scene, renderer, timeUtils, textureManager, cfg);
        planet.naif_id = cfg.naif_id;
        app.celestialBodies.push(planet);
        app.bodiesByNaifId[cfg.naif_id] = planet;
    }

    // Instantiate OrbitManager for planetary orbits
    app.orbitManager = new OrbitManager({ scene, app });
    console.log('[createSceneObjects] OrbitManager instantiated:', !!app.orbitManager);

    // 3. Parent ALL bodies appropriately
    for (const cfg of Object.values(celestialBodiesConfig)) {
        if (!cfg.parent || typeof cfg.naif_id !== 'number') continue; // Skip if no parent or no ID
        if (cfg.type === 'barycenter') continue; // Do not parent barycenters under each other
        const childObject = app.bodiesByNaifId[cfg.naif_id];
        if (!childObject) {
            console.warn(`Child object not found for NAIF ID: ${cfg.naif_id} (${cfg.name})`);
            continue;
        }
        // Find parent config and object
        const parentCfg = celestialBodiesConfig[cfg.parent] || Object.values(celestialBodiesConfig).find(c => c.name === cfg.parent);
        if (!parentCfg || typeof parentCfg.naif_id !== 'number') {
            console.warn(`Parent config not found or invalid for child: ${cfg.name} (parent key: ${cfg.parent})`);
            continue;
        }
        const parentObject = app.bodiesByNaifId[parentCfg.naif_id];
        if (!parentObject) {
            console.warn(`Parent object not found for NAIF ID: ${parentCfg.naif_id} (${parentCfg.name})`);
            continue;
        }
        // Determine the actual THREE object to parent under
        let parentAttachmentPoint = parentObject; // Default for Groups or Stars
        if (parentObject instanceof Planet && parentObject.getOrbitGroup) {
            parentAttachmentPoint = parentObject.getOrbitGroup(); // Planets have an orbit group
        }
        // Determine the actual THREE object to attach
        let childAttachmentObject = childObject;
        if (childObject instanceof Planet && childObject.getOrbitGroup) {
            childAttachmentObject = childObject.getOrbitGroup(); // Planets attach their orbit group
        } else if (childObject instanceof Sun && childObject.sun) {
            // Attach BOTH the mesh and the light for Stars
            console.log(`Parenting Sun (${childObject.name}, NAIF ${cfg.naif_id}) under Parent (${parentObject.name}, NAIF ${parentCfg.naif_id})`);
            parentAttachmentPoint.add(childObject.sun);
            parentAttachmentPoint.add(childObject.sunLight);
            console.log(` - Sun mesh parented: ${!!childObject.sun.parent}`);
            console.log(` - Sun light parented: ${!!childObject.sunLight.parent}`);
            continue; // Skip default attachment below for stars
        }
        // Perform the parenting
        if (childAttachmentObject instanceof THREE.Object3D) { // Ensure it's something addable
            parentAttachmentPoint.add(childAttachmentObject);
        } else {
            console.warn(`Cannot parent child object for ${cfg.name}, it's not an Object3D?`, childObject);
        }
    }

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
            // For Sun, we consider its mesh. The light is handled with the mesh.
            // If sun mesh already has a parent (e.g. SSB), it's already handled.
            if (bodyObject.sun && !bodyObject.sun.parent) {
                scene.add(bodyObject.sun);
                if (bodyObject.sunLight && !bodyObject.sunLight.parent) { // Add light if also unparented
                    scene.add(bodyObject.sunLight);
                }
            }
            continue; // Sun handled, move to next body
        } else if (bodyObject instanceof THREE.Group) {
            object3DForScene = bodyObject;
        } else {
            // Potentially other types or unhandled cases
            console.warn(`Unhandled body type for scene addition: ${cfg.name}`, bodyObject);
            continue;
        }

        // Add to scene if it's a valid Object3D and doesn't already have a parent
        // (meaning it wasn't parented in the previous loop)
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
    
    // 5. Create PlanetVectors (only for planets/moons)
    app.planetVectors = app.celestialBodies
        .filter(p => p instanceof Planet && p.getMesh && p.rotationGroup) // Ensure it's a Planet with needed groups
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
    
    console.log('[createSceneObjects] Scene objects created and configured.');
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
    new BackgroundStars(scene, camera);
    
    // Post-processing can also be set up early
    setupPostProcessing(app);
    
    // Note: Celestial bodies and related managers (OrbitManager, PlanetVectors, etc.)
    // will be created by createSceneObjects(app) once the first backend message arrives.

    return scene; // gives callers a fluent handle
}
