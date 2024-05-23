// app.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Earth } from './components/Earth.js';
import { Sun } from './components/Sun.js';
import { Moon } from './components/Moon.js';
import { Vectors } from './utils/Vectors.js';
import { Constants } from './utils/Constants.js';
import CannonDebugger from 'cannon-es-debugger';
import { TimeUtils } from './utils/TimeUtils.js';
import { GUIManager } from './managers/GUIManager.js';
import PhysicsWorkerURL from 'url:./workers/physicsWorker.js';
import { TextureManager } from './managers/textureManager.js';
// import textures
import earthTexture from '../public/assets/texture/8k_earth_daymap.jpg';
import earthSpecTexture from '../public/assets/texture/8k_earth_specular_map.png';
import earthNormalTexture from '../public/assets/texture/8k_earth_normal_map.png';
import cloudTexture from '../public/assets/texture/cloud_combined_8192.png';
import moonTexture from '../public/assets/texture/lroc_color_poles_8k.jpg';
import moonBump from '../public/assets/texture/ldem_16_uint.jpg';

// Scene and Renderer Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    42, // Field of view
    window.innerWidth / window.innerHeight, // Aspect ratio
    10, // Near clipping plane
    Constants.kmToMeters * 400000000 // Far clipping plane
);
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    depth: true,
    logarithmicDepthBuffer: false ,
    powerPreference: 'high-performance',
    precision: 'highp'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.gammaFactor = 2.2;
renderer.gammaOutput = true;
renderer.physicallyCorrectLights = true;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

// Background Stars
// addStars(scene);

// Camera and Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 100 * Constants.metersToKm * Constants.scale * 2;
controls.maxDistance = 50000000 * Constants.scale;
camera.position.set(1000, 7000, 20000).multiplyScalar(Constants.scale);
camera.lookAt(new THREE.Vector3(0, 0, 0));

// Add ambient light
const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.05);
scene.add(ambientLight);

// Physics World Setup
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// GUI and Time settings
const settings = {
    timeWarp: 1,
    startTime: new Date().toISOString(),
    simulatedTime: new Date().toISOString(),
    showGrid: false,
    showVectors: false,
    showSatVectors: true,
    showDebugger: false
};

// Time management
const timeUtils = new TimeUtils(settings);

// Texture Manager
const textureManager = new TextureManager();
const textureList = [
    { url: earthTexture, name: 'earthTexture' },
    { url: earthSpecTexture, name: 'earthSpecTexture' },
    { url: earthNormalTexture, name: 'earthNormalTexture' },
    { url: cloudTexture, name: 'cloudTexture' },
    { url: moonTexture, name: 'moonTexture' },
    { url: moonBump, name: 'moonBump' }
];

// Main Components
let earth, sun, moon, vectors, guiManager, cannonDebugger;
const satellites = [];

async function init() {
    try {
        // Load all textures before starting the simulation
        await textureManager.loadAllTextures(textureList);
    } catch (error) {
        console.error('Failed to load all textures:', error);
        return;
    }

    earth = new Earth(scene, world, renderer, timeUtils, textureManager);
    sun = new Sun(scene, timeUtils);
    moon = new Moon(scene, world, renderer, timeUtils, textureManager);
    vectors = new Vectors(earth, scene, timeUtils);
    cannonDebugger = new CannonDebugger(scene, world, { autoUpdate: false });
    
    // Post-processing
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.4, 0.99);
    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.addPass(renderPass);
    bloomComposer.addPass(bloomPass);
    const finalComposer = new EffectComposer(renderer);
    finalComposer.addPass(renderPass);
    finalComposer.addPass(bloomComposer);

    // Stats for Monitoring
    const stats = new Stats();
    document.body.appendChild(stats.dom);

    // Initialize the physics worker
    const physicsWorker = new Worker(PhysicsWorkerURL);
    physicsWorker.onmessage = handlePhysicsWorkerMessage;

    function handlePhysicsWorkerMessage(event) {
        const { type, data } = event.data;
        if (type === 'stepComplete') {
            const satellite = satellites.find(sat => sat.id === data.id);
            if (satellite) {
                satellite.updateFromSerialized(data);
            }
        } else if (type === 'initComplete') {
            // Handle initialization complete, e.g., enable satellite creation
            console.log('Physics worker initialization complete');
        }
    }

    // Initialize physics worker with necessary data
    physicsWorker.postMessage({
        type: 'init',
        data: {
            earthMass: Constants.earthMass,
            moonMass: Constants.moonMass,
            satellites: []
        }
    });

    // GUI Manager
    guiManager = new GUIManager(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, cannonDebugger, physicsWorker, camera, controls);

    // Main animation loop
    function animate(timestamp) {
        stats.begin();

        timeUtils.update(timestamp);

        const realDeltaTime = timeUtils.getDeltaTime();
        const warpedDeltaTime = realDeltaTime;
        const currentTime = timeUtils.getSimulatedTime();

        // Step physics world
        if (satellites.length > 0) {
            physicsWorker.postMessage({
                type: 'step',
                data: {
                    warpedDeltaTime,
                    earthPosition: earth.earthBody.position,
                    earthRadius: Constants.earthRadius,
                    moonPosition: moon.moonBody.position // Include Moon's position
                }
            });
        }

        // Update satellites
        satellites.forEach(satellite => {
            satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            satellite.applyBufferedUpdates(); // Apply buffered updates
    
            const altitude = satellite.getCurrentAltitude();
            const velocity = satellite.getCurrentVelocity();
            const acceleration = satellite.getCurrentAcceleration();
            const dragForce = satellite.getCurrentDragForce();
    
            // Update GUI controllers with the new values
            satellite.altitudeController.setValue(parseFloat(altitude)).updateDisplay();
            satellite.velocityController.setValue(parseFloat(velocity)).updateDisplay();
            satellite.accelerationController.setValue(parseFloat(acceleration)).updateDisplay();
            satellite.dragController.setValue(parseFloat(dragForce)).updateDisplay();
        });

        // Update Earth rotation and light direction
        earth.updateRotation();
        earth.updateLightDirection();

        // Update sun position
        sun.updatePosition(currentTime);

        // Update moon position and rotation
        moon.updatePosition(currentTime);
        moon.updateRotation();

        // Update vectors (if applicable)
        vectors.updateVectors();

        if (settings.showDebugger) {
            cannonDebugger.update();
        }

        // Update camera position
        guiManager.updateCameraPosition();

        // Render scene with post-processing
        renderer.clear();
        bloomComposer.render();
        finalComposer.render();

        stats.end();
        requestAnimationFrame(animate);
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        bloomComposer.setSize(window.innerWidth, window.innerHeight);
        finalComposer.setSize(window.innerWidth, window.innerHeight);
    }

    // Add the event listener for window resize
    window.addEventListener('resize', onWindowResize);

    // Kickstart the animation loop
    requestAnimationFrame(animate);
}

// Initialize the application
init();
