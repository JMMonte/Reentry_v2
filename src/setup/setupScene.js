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

// Import new raymarching shaders (assuming Vite/Rollup raw import)
import atmosphereVertexShader from '../shaders/atmosphereRaymarch.vert?raw';
import atmosphereFragmentShader from '../shaders/atmosphereRaymarch.frag?raw';

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

// Import AtmosphereManager and the new constant
import { AtmosphereManager, MAX_ATMOS } from '../managers/AtmosphereManager.js';

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
    const { scene, camera, renderer, sceneManager, physicsWorld } = app;
    const composer = new EffectComposer(renderer);

    // 1. Render the main scene
    composer.addPass(new RenderPass(scene, camera));

    // --- Multi-atmosphere support ---
    app.atmosphereManager = new AtmosphereManager(physicsWorld);
    // app.atmosphereManager.linkPhysicsBodies(); // Moved to App3D.init
    // Build initial uniform arrays
    const arrays = app.atmosphereManager.buildUniformArrays(camera);
    // Initialize all array uniforms as arrays of correct type/length
    const uniforms = {
        tDiffuse: { value: null },
        uNumAtmospheres: { value: arrays.uNumAtmospheres },
        uPlanetPosition: { value: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()) },
        uPlanetRadius: { value: new Float32Array(MAX_ATMOS) },
        uAtmosphereHeight: { value: new Float32Array(MAX_ATMOS) },
        uDensityScaleHeight: { value: new Float32Array(MAX_ATMOS) },
        uRayleighScatteringCoeff: { value: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()) },
        uMieScatteringCoeff: { value: new Float32Array(MAX_ATMOS) },
        uMieAnisotropy: { value: new Float32Array(MAX_ATMOS) },
        uNumLightSteps: { value: new Int32Array(MAX_ATMOS) },
        uSunIntensity: { value: new Float32Array(MAX_ATMOS) },
        uRelativeCameraPos: { value: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()) },
        uEquatorialRadius: { value: new Float32Array(MAX_ATMOS) },
        uPolarRadius: { value: new Float32Array(MAX_ATMOS) },
        uPlanetFrame: { value: Array(MAX_ATMOS).fill().map(() => new THREE.Matrix3()) },
        uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uInverseProjectionMatrix: { value: new THREE.Matrix4() },
        uInverseViewMatrix: { value: new THREE.Matrix4() },
        uCameraDistance: { value: new Float32Array(MAX_ATMOS) },
        // Screen-space culling
        uPlanetScreenPos: { value: Array(MAX_ATMOS).fill().map(() => new THREE.Vector2()) },
        uPlanetScreenRadius: { value: new Float32Array(MAX_ATMOS) },
        // Elliptical culling
        uEllipseCenter: { value: Array(MAX_ATMOS).fill().map(() => new THREE.Vector2()) },
        uEllipseAxisA: { value: new Float32Array(MAX_ATMOS) },
        uEllipseAxisB: { value: new Float32Array(MAX_ATMOS) },
        uEllipseAngle: { value: new Float32Array(MAX_ATMOS) },
    };
    // Copy initial values from arrays
    for (const key in arrays) {
        if (uniforms[key]) {
            if (Array.isArray(arrays[key]) || ArrayBuffer.isView(arrays[key])) {
                for (let i = 0; i < arrays[key].length; ++i) {
                    if (uniforms[key].value[i]?.copy && arrays[key][i]?.copy) {
                        uniforms[key].value[i].copy(arrays[key][i]);
                    } else if (typeof arrays[key][i] !== 'undefined') {
                        uniforms[key].value[i] = arrays[key][i];
                    }
                }
            } else {
                uniforms[key].value = arrays[key];
            }
        }
    }

    // 2. Atmosphere Raymarching Pass (multi-atmosphere)
    const atmosphereShader = {
        uniforms,
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader
    };
    const atmospherePass = new ShaderPass(atmosphereShader);
    composer.addPass(atmospherePass);
    sceneManager.composers.atmospherePass = atmospherePass; // Store reference

    // 3. FXAA Pass
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
    app.earth = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('earth', timeUtils));
    app.sun = new Sun(scene, timeUtils, getBodyConfig('sun', timeUtils)); // Pass sun config
    app.moon = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('moon', timeUtils));
    app.emb = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('emb', timeUtils));
    app.mercury = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('mercury', timeUtils));
    app.venus = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('venus', timeUtils));
    app.mars = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('mars', timeUtils));
    app.jupiter = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('jupiter', timeUtils));
    app.saturn = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('saturn', timeUtils));
    app.uranus = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('uranus', timeUtils));
    app.neptune = new Planet(scene, renderer, timeUtils, textureManager, getBodyConfig('neptune', timeUtils));

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
    // add Sun as gravity source - now uses the mass getter
    const sunMesh = app.sun.sun ?? app.sun.sunLight ?? app.sun;
    gravitySources.push({
        name: 'sun',
        body: app.sun,
        mesh: sunMesh,
        mass: app.sun.mass // Use the getter from Sun class
    });

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
