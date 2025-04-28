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
import { PlanetVectors } from '../utils/PlanetVectors.js';
import { SatelliteVectors } from '../utils/SatelliteVectors.js';

// Data layers ──────────────────────────────────────────────────────────────────
import geojsonDataSovereignty from '../config/ne_50m_admin_0_sovereignty.json';
import geojsonDataStates from '../config/ne_110m_admin_1_states_provinces.json';
import {
    geojsonDataCities,
    geojsonDataAirports,
    geojsonDataSpaceports,
    geojsonDataGroundStations,
    geojsonDataObservatories,
    geojsonDataMissions
} from '../config/geojsonData.js';

// Textures ─────────────────────────────────────────────────────────────────────
import {
    earthTexture, earthSpecTexture, earthNormalTexture,
    cloudTexture, moonTexture, moonBump
} from '../config/textures.js';

// ──────────────────────────────────────────────────────────────────────────────
// 2. STATIC CONFIGURATION
// ──────────────────────────────────────────────────────────────────────────────
const TEXTURE_DEFINITIONS = [
    { key: 'earthTexture', src: earthTexture },
    { key: 'earthSpecTexture', src: earthSpecTexture },
    { key: 'earthNormalTexture', src: earthNormalTexture },
    { key: 'cloudTexture', src: cloudTexture },
    { key: 'moonTexture', src: moonTexture },
    { key: 'moonBump', src: moonBump },
];

const AMBIENT_LIGHT_CONFIG = { color: 0xffffff, intensity: 0.1 };

const BLOOM_CONFIG = { strength: 0.3, radius: 0.999, threshold: 0.99 };

// ──────────────────────────────────────────────────────────────────────────────
// 3. HELPERS
// ──────────────────────────────────────────────────────────────────────────────
const addAmbientLight = (scene) => {
    const light = new THREE.AmbientLight(
        AMBIENT_LIGHT_CONFIG.color,
        AMBIENT_LIGHT_CONFIG.intensity
    );
    light.name = 'ambientLight';
    scene.add(light);
};

const loadTextures = async (textureManager) => {
    const tasks = TEXTURE_DEFINITIONS.map(({ key, src }) => ({
        name: key,
        url: src,
        fallbackUrl: `${src}?url`
    }));
    await textureManager.loadAllTextures(tasks);
};

const createEarthConfig = () => ({
    name: 'earth',
    symbol: '♁',
    radius: Constants.earthRadius * Constants.scale * Constants.metersToKm,
    tilt: Constants.earthInclination,
    meshRes: 64,
    atmosphereThickness: 10,
    cloudThickness: 0.1,
    addSurface: true,
    surfaceOptions: {
        addLatitudeLines: true, latitudeStep: 10,
        addLongitudeLines: true, longitudeStep: 10,
        addCountryBorders: true,
        addStates: true, addCities: true,
        addAirports: true, addSpaceports: true,
        addGroundStations: true, addObservatories: true,
    },
    primaryGeojsonData: geojsonDataSovereignty,
    stateGeojsonData: geojsonDataStates,
    cityData: geojsonDataCities,
    airportsData: geojsonDataAirports,
    spaceportsData: geojsonDataSpaceports,
    groundStationsData: geojsonDataGroundStations,
    observatoriesData: geojsonDataObservatories,
    addLight: true,
    lightOptions: { color: 0x6699ff, intensity: 5000.5, helper: true },
});

const createMoonConfig = (timeUtils) => {
    // --- derive argument of periapsis at runtime
    const JD = timeUtils.getJulianDate();
    const T = (JD - 2451545.0) / 36525;
    const lamPi = 83.353246 + 4069.0137287 * T - 0.01032 * T * T - T ** 3 / 80000;
    const argPerDeg =
        lamPi - THREE.MathUtils.radToDeg(Constants.ascendingNode) + 80; // empirical offset

    return {
        name: 'moon',
        symbol: '☾',
        radius: Constants.moonRadius * Constants.metersToKm * Constants.scale,
        rotationPeriod: 29.53058867 * Constants.secondsInDay, // synodic
        meshRes: 128,
        tilt: 0,
        addSurface: true,
        surfaceOptions: {
            addLatitudeLines: true, latitudeStep: 10,
            addLongitudeLines: true, longitudeStep: 10,
            addMissions: true
        },
        missionsData: geojsonDataMissions,
        addLight: true,
        lightOptions: { color: 0x6699ff, intensity: 1000.5, helper: true },
        orbitalPeriod: 27.321661, // sidereal days
        orbitElements: {
            semiMajorAxis: Constants.semiMajorAxis,
            eccentricity: Constants.eccentricity,
            inclination: Constants.inclination,
            longitudeOfAscendingNode: Constants.ascendingNode,
            argumentOfPeriapsis: THREE.MathUtils.degToRad(argPerDeg),
            mu: Constants.earthGravitationalParameter,
        },
        materials: {
            createSurfaceMaterial: (tm, anisotropy) => {
                const mat = new THREE.MeshPhongMaterial({
                    map: tm.getTexture('moonTexture'),
                    bumpMap: tm.getTexture('moonBump'),
                    bumpScale: 3.9
                });
                if (mat.map) mat.map.anisotropy = anisotropy;
                if (mat.bumpMap) mat.bumpMap.anisotropy = anisotropy;
                return mat;
            },
            createCloudMaterial: () => null,
            createGlowMaterial: () => null
        }
    };
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
        BLOOM_CONFIG.strength,
        BLOOM_CONFIG.radius,
        BLOOM_CONFIG.threshold
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
    if (!scene || !renderer || !camera) throw new Error('Scene, camera, or renderer not set.');
    if (!textureManager) throw new Error('TextureManager not initialized.');

    // 1. Assets & background
    await loadTextures(textureManager);
    addAmbientLight(scene);
    new BackgroundStars(scene, camera);

    // 2. Planetary bodies
    app.earth = new Planet(scene, renderer, timeUtils, textureManager, createEarthConfig());
    app.sun = new Sun(scene, timeUtils);
    app.moon = new Planet(scene, renderer, timeUtils, textureManager, createMoonConfig(timeUtils));

    // 3. Helpers
    app.planets = Planet.instances;
    app.planetVectors = app.planets.map(
        p => new PlanetVectors(p, scene, timeUtils, { name: p.name })
    );
    const gravitySources = [
        { name: 'earth', body: app.earth, mesh: app.earth.getMesh(), mass: Constants.earthMass },
        { name: 'moon',  body: app.moon,  mesh: app.moon.getMesh(),  mass: Constants.moonMass },
        { name: 'sun',   body: app.sun,   mesh: app.sun.sun,      mass: Constants.sunMass }
    ];
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
