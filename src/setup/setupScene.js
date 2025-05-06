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

// Import AtmosphereManager (used in initScene)
import { AtmosphereManager } from '../managers/AtmosphereManager.js';

// Import new mesh shaders
import atmosphereMeshVertexShader from '../shaders/atmosphereMesh.vert?raw';
import atmosphereMeshFragmentShader from '../shaders/atmosphereMesh.frag?raw';

// Placeholder shaders REMOVED
// const atmosphereMeshVertexShader = /* glsl */` ... `;
// const atmosphereMeshFragmentShader = /* glsl */` ... `;

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
 * Retrieves the configuration for any celestial body by key.
 * @param {string} key - The body key in celestialBodiesConfig.
 * @param {object} timeUtils - Utility object for time calculations.
 * @returns {object} The body configuration.
 */
const getBodyConfig = (key, timeUtils) => {
    const baseConfig = celestialBodiesConfig[key];
    if (!baseConfig) throw new Error(`Configuration for '${key}' not found.`);
    // Dynamic adjustment for the Moon's argument of periapsis
    if (key === 'moon') {
        const moonConfig = { ...baseConfig };
        const JD = timeUtils.getJulianDate();
        const T = (JD - 2451545.0) / 36525;
        const lamPi = 83.353246 + 4069.0137287 * T - 0.01032 * T * T - T ** 3 / 80000;
        const argPerDeg = lamPi - THREE.MathUtils.radToDeg(Constants.ascendingNode) + 80; // empirical offset
        moonConfig.orbitElements = {
            ...moonConfig.orbitElements,
            argumentOfPeriapsis: THREE.MathUtils.degToRad(argPerDeg)
        };
        return moonConfig;
    }
    return baseConfig;
};

const setupPostProcessing = (app) => {
    const { scene, camera, renderer, sceneManager } = app;
    // Use default EffectComposer targets
    const composer = new EffectComposer(renderer);

    // Note: No need for separate depth textures IF the atmosphere is rendered
    // as a mesh within the main scene pass. We might still need depth for
    // other effects, but let's remove the setup specific to the old pass.
    // const size = renderer.getSize(new THREE.Vector2());
    // const depthTexture1 = new THREE.DepthTexture(size.width, size.height);
    // depthTexture1.type = THREE.UnsignedShortType;
    // const depthTexture2 = new THREE.DepthTexture(size.width, size.height);
    // depthTexture2.type = THREE.UnsignedShortType;
    // composer.renderTarget1.depthTexture = depthTexture1;
    // composer.renderTarget2.depthTexture = depthTexture2;

    // 1. Render the main scene (which will now include atmosphere meshes)
    composer.addPass(new RenderPass(scene, camera));

    // --- Atmosphere Pass REMOVED --- 
    // We will render atmospheres as meshes in the main scene pass.
    // app.atmosphereManager = new AtmosphereManager(physicsWorld);
    // const uniforms = { ... }; // Old uniforms removed
    // const atmosphereShader = { ... }; // Old shader pass removed
    // const atmospherePass = new ShaderPass(atmosphereShader);
    // composer.addPass(atmospherePass);
    // sceneManager.composers.atmospherePass = atmospherePass; // Remove reference

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

// ──────────────────────────────────────────────────────────────────────────────
// 4. PUBLIC API
// ──────────────────────────────────────────────────────────────────────────────
/**
 * The only function you import elsewhere.
 * Handles: textures ➜ primitives ➜ planets ➜ post-processing.
 */
export async function initScene(app) {
    const { scene, renderer, camera, timeUtils, textureManager, physicsWorld } = app;
    // Provide camera to Planet class for dynamic LOD updates
    Planet.setCamera(camera);

    if (!scene || !renderer || !camera) throw new Error('Scene, camera, or renderer not set.');
    if (!textureManager) throw new Error('TextureManager not initialized.');

    // 1. Assets & background
    await loadTextures(textureManager);
    addAmbientLight(scene);
    new BackgroundStars(scene, camera);

    // Create AtmosphereManager instance HERE, before planets and atmosphere meshes
    app.atmosphereManager = new AtmosphereManager(physicsWorld);

    // 2. Planetary bodies
    const bodyDefs = [
        { key: 'earth', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'sun', ctor: Sun, args: [scene, timeUtils] },
        { key: 'moon', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'emb', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'mercury', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'venus', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'mars', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'jupiter', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'saturn', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'uranus', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
        { key: 'neptune', ctor: Planet, args: [scene, renderer, timeUtils, textureManager] },
    ];
    for (const { key, ctor, args } of bodyDefs) {
        app[key] = new ctor(...args, getBodyConfig(key, timeUtils));
    }

    // 3. Helpers
    // gather all celestial bodies
    app.celestialBodies = [
        app.earth, app.moon, app.sun, app.emb,
        app.mercury, app.venus, app.mars,
        app.jupiter, app.saturn, app.uranus, app.neptune
    ];
    // create vectors only for planetary bodies (skip Sun)
    app.planetVectors = app.celestialBodies
        .filter(b => typeof b.getMesh === 'function' && b.rotationGroup)
        .map(b => new PlanetVectors(b, scene, timeUtils, { name: b.name }));

    // Unified gravitySources construction
    const gravitySources = app.celestialBodies.map(body => {
        let mesh;
        if (typeof body.getMesh === 'function') {
            mesh = body.getMesh();
        } else if (body.sun) {
            mesh = body.sun;
        } else if (body.sunLight) {
            mesh = body.sunLight;
        } else {
            mesh = body;
        }
        const keyLower = body.nameLower;
        const config = celestialBodiesConfig[keyLower];
        return config ? {
            name: keyLower,
            body,
            mesh,
            mass: body.mass ?? config.mass ?? 0
        } : null;
    }).filter(Boolean);

    app.satelliteVectors = new SatelliteVectors({
        scene,
        timeUtils,
        satelliteManager: app.satellites,
        gravitySources,
        camera
    });

    // 4. Display tuning
    if (app.displaySettingsManager) app.displaySettingsManager.applyAll();

    // 5. Create Atmosphere Meshes (NEW)
    app.atmosphereMeshes = [];
    if (app.atmosphereManager && app.atmosphereManager.atmospheres) {
        // DEBUG: Log the full list of atmospheres we're about to loop through
        console.log("[setupScene] Atmospheres to process:", app.atmosphereManager.atmospheres);

        for (const atmData of app.atmosphereManager.atmospheres) {
            // DEBUG: Log which planet this iteration is for
            console.log(`[setupScene] Processing atmosphere data for: ${atmData?.name}`);

            const planet = app[atmData.name]; // Get the corresponding planet object
            // CHECK 1
            if (!planet || !planet.getMesh) {
                console.warn(`[setupScene] Skipping atmosphere for ${atmData.name}: Planet object or getMesh method not found.`);
                continue;
            }

            const cfg = atmData.config;
            const atm = atmData.atmosphere;
            const radius = (cfg.radius || 0) + (atm.thickness || 0);
            // DEBUG: Log the calculated radius
            console.log(`[setupScene] Creating atmosphere mesh for ${atmData.name} with radius: ${radius}`);

            const geometry = new THREE.SphereGeometry(radius, 64, 64);
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    // Data from AtmosphereManager config
                    uPlanetPosition: { value: new THREE.Vector3() }, // Updated per frame
                    uPlanetRadius: { value: cfg.radius || 0 },
                    uPolarRadius: { value: (cfg.radius || 0) * (1.0 - (cfg.oblateness || 0.0)) },
                    uAtmosphereHeight: { value: atm.thickness || 0 },
                    uDensityScaleHeight: { value: atm.densityScaleHeight || 0 },
                    uRayleighScatteringCoeff: { value: new THREE.Vector3().fromArray(atm.rayleighScatteringCoeff || [0, 0, 0]) },
                    uMieScatteringCoeff: { value: atm.mieScatteringCoeff || 0 },
                    uMieAnisotropy: { value: atm.mieAnisotropy || 0 },
                    uNumLightSteps: { value: atm.numLightSteps || 4 },
                    uSunIntensity: { value: atm.sunIntensity || 1.0 }, // Base intensity, maybe scaled later
                    uPlanetFrame: { value: new THREE.Matrix3() }, // Updated per frame
                    // Updated per frame
                    uSunPosition: { value: new THREE.Vector3() },
                    uCameraPosition: { value: new THREE.Vector3() },
                },
                vertexShader: atmosphereMeshVertexShader,
                fragmentShader: atmosphereMeshFragmentShader,
                side: THREE.BackSide,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                blending: THREE.NormalBlending
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `atmosphere_${atmData.name}`;
            // PRODUCTION: Correct render order, culling, and blending for atmosphere
            mesh.renderOrder = 2;
            mesh.frustumCulled = true;
            material.depthTest = false;
            material.depthWrite = false;
            material.transparent = true;
            material.blending = THREE.NormalBlending;

            // CHECK 2: Log the rotationGroup before checking it
            console.log(`[setupScene] Checking rotationGroup for ${atmData.name}:`, planet.rotationGroup);
            if (planet.rotationGroup) { // Ensure rotationGroup exists
                console.log(`[setupScene] Adding atmosphere mesh to ${atmData.name}.rotationGroup...`);
                planet.rotationGroup.add(mesh);
                const addedMesh = planet.rotationGroup.children.find(c => c.name === mesh.name);
                console.log(`[setupScene] Mesh ${mesh.name} added to rotationGroup?`, !!addedMesh);
            } else {
                // Ensure this warning logs if rotationGroup is missing
                console.warn(`[setupScene] Planet ${atmData.name} missing rotationGroup, cannot add atmosphere mesh.`);
            }

            app.atmosphereMeshes.push({
                name: atmData.name,
                mesh: mesh,
                material: material
            });
        }
    } else {
        console.warn("[setupScene] AtmosphereManager or its atmospheres array not found.");
    }

    // 6. Post-processing (Now setup AFTER atmosphere meshes are added to planets)
    setupPostProcessing(app);

    // After all planets are created and added to app.celestialBodies
    // Add a helper to update day/night material camera position each frame
    app.updateDayNightMaterials = () => {
        const sunPos = new THREE.Vector3();
        app.sun.sun.getWorldPosition(sunPos);
        for (const planet of app.celestialBodies) {
            if (planet.surfaceMaterial && planet.surfaceMaterial.uniforms) {
                if (planet.surfaceMaterial.uniforms.uCameraPosition) {
                    planet.surfaceMaterial.uniforms.uCameraPosition.value.copy(app.camera.position);
                }
                if (planet.surfaceMaterial.uniforms.sunDirection) {
                    const planetPos = new THREE.Vector3();
                    planet.getMesh().getWorldPosition(planetPos);
                    const sunDir = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();
                    planet.surfaceMaterial.uniforms.sunDirection.value.copy(sunDir);
                }
            }
        }
    };

    return scene;  // gives callers a fluent handle
}
