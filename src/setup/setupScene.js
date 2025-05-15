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
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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
    bloomConfig,
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

    // 3. Bloom Pass (kept)
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

/**
 * The only function you import elsewhere.
 * Handles: textures ➜ primitives ➜ planets ➜ post-processing.
 */
export async function initScene(app) {
    const { scene, renderer, camera, timeUtils, textureManager } = app;
    Planet.setCamera(camera);

    if (!scene || !renderer || !camera) throw new Error('Scene, camera, or renderer not set.');
    if (!textureManager) throw new Error('TextureManager not initialized.');

    // 1. Assets & background
    await loadTextures(textureManager);
    addAmbientLight(scene);
    new BackgroundStars(scene, camera);

    // --- Refactored Object Creation ---
    app.bodiesByNaifId = {};   // Map NAIF ID -> Object (Group, Star, Planet)
    app.stars = [];            // Array of Star instances
    app.celestialBodies = [];  // Array of all major bodies (planets, moons, Sun)

    // 2. Create all barycenters
    for (const cfg of Object.values(barycenters)) {
        const group = new THREE.Group();
        group.name = cfg.name;
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
        app.celestialBodies.push(planet);
        app.bodiesByNaifId[cfg.naif_id] = planet;
    }

    // Instantiate OrbitManager for planetary orbits
    app.orbitManager = new OrbitManager({ scene, app });
    console.log('[setupScene] OrbitManager instantiated:', !!app.orbitManager);

    // 3. Parent ALL bodies appropriately
    for (const cfg of Object.values(celestialBodiesConfig)) {
        if (!cfg.parent || typeof cfg.naif_id !== 'number') continue; // Skip if no parent or no ID

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
        let childAttachmentObject = childObject; // Default for Groups
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
        const cfg = celestialBodiesConfig[planet.nameLower];
        if (cfg && typeof cfg.naif_id === 'number') {
            app.planetsByNaifId[cfg.naif_id] = planet;
        }
    });

    // 5. Create PlanetVectors (only for planets/moons)
    app.planetVectors = app.celestialBodies
        .filter(p => p.getMesh && p.rotationGroup) // Ensure it's a Planet with needed groups
        .map(p => new PlanetVectors(p, scene, app.sun?.sun, { name: p.name }));

    // 6. Construct gravitySources correctly (planets/moons + stars)
    const gravitySources = [];
    // Add planets/moons and Sun
    app.celestialBodies.forEach(body => {
        const cfg = celestialBodiesConfig[body.nameLower];
        if (cfg) {
            let mesh = null;
            if (typeof body.getMesh === 'function') {
                mesh = body.getMesh();
            } else if (body.sun) {
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

    // 7. Display tuning & Post-processing
    if (app.displaySettingsManager) app.displaySettingsManager.applyAll();
    setupPostProcessing(app);

    // 8. Day/Night Material Update Helper
    app.updateDayNightMaterials = () => {
        if (!app.sun || !app.sun.sun) return; // Guard against missing sun
        const sunPos = new THREE.Vector3();
        app.sun.sun.getWorldPosition(sunPos);

        for (const planet of app.celestialBodies) { // Loop only over actual planets
            if (planet.surfaceMaterial && planet.surfaceMaterial.uniforms) {
                const uniforms = planet.surfaceMaterial.uniforms;
                if (uniforms.uCameraPosition) {
                    uniforms.uCameraPosition.value.copy(app.camera.position);
                }
                if (uniforms.sunDirection) {
                    const planetPos = new THREE.Vector3();
                    // Use getMesh() which should return the LOD or main mesh
                    const planetMesh = planet.getMesh();
                    if (planetMesh) {
                        planetMesh.getWorldPosition(planetPos);
                        const sunDir = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();
                        uniforms.sunDirection.value.copy(sunDir);
                    }
                }
            }
        }
    };

    return scene; // gives callers a fluent handle
}
