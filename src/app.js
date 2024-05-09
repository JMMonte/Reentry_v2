import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';
import { GUI } from 'dat.gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Earth } from './Earth.js';
import { Sun } from './Sun.js';
import { Satellite } from './Satellite.js';
import { Vectors } from './Vectors.js';
import { Constants } from './constants.js';
import CannonDebugger from 'cannon-es-debugger';
import { TimeUtils } from './TimeUtils.js';

// GUI and Time settings
const settings = {
    timeWarp: 1,
    simulatedTime: new Date().toISOString(),
    showGrid: true,
    showVectors: true,
    altitude: 50,
};

// Time management
const timeUtils = new TimeUtils(settings);

// Scene and Renderer Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 200000000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.gammaFactor = 2.2;
renderer.gammaOutput = true;
renderer.physicallyCorrectLights = true;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

// Camera and Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = Constants.earthRadius;
controls.maxDistance = 10000000;
camera.position.set(1000, 1000, 6000);
camera.lookAt(0, 0, 0);

// Lighting
scene.add(new THREE.AmbientLight(0x404040));

// Physics World Setup
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 1;

// Cannon Debugger
const cannonDebugger = new CannonDebugger(scene, world);
const debugSettings = {
    showDebugger: false
};
// Main Components
const earth = new Earth(scene, world, renderer, timeUtils);
const sun = new Sun(scene, timeUtils);
const vectors = new Vectors(earth, scene, timeUtils);  // Updated to use TimeUtils

// Satellite Management
const satellites = [];

function createSatellite(altitude) {
    const radius = Constants.earthRadius + altitude;
    const speed = -Math.sqrt(Constants.G * Constants.earthMass / radius) * settings.timeWarp;
    const position = new CANNON.Vec3(radius, 0, 0);
    const velocity = new CANNON.Vec3(0, 0, speed / (100/3));
    
    const newSatellite = new Satellite(scene, world, earth, position, velocity);
    satellites.push(newSatellite);
    updateSatelliteDisplay(newSatellite);
}

function updateSatelliteVelocities() {
    satellites.forEach(satellite => {
        const radius = satellite.body.position.length();
        const speed = -Math.sqrt(Constants.G * Constants.earthMass / radius) * settings.timeWarp;
        satellite.body.velocity.set(0, 0, speed / (100/3));
    });
}

function updateSatelliteDisplay(newSatellite) {
    if (!newSatellite || !newSatellite.mesh || !newSatellite.mesh.material) {
        console.error('Invalid or incomplete satellite object:', newSatellite);
        return;
    }
    const satelliteFolder = gui.addFolder(`Satellite ${satellites.length}`);
    satelliteFolder.addColor(newSatellite.mesh.material, 'color').name('Color').onChange(value => {
        newSatellite.mesh.material.color.set(value);
    });
    satelliteFolder.add(newSatellite.mesh.scale, 'x', 0.1, 10, 0.1).name('Size').onChange(value => {
        newSatellite.mesh.scale.set(value, value, value);
    });

    // Compute altitude only if position is defined and valid
    if (newSatellite.mesh.position && !isNaN(newSatellite.mesh.position.length())) {
        const altitude = (newSatellite.mesh.position.length() - Constants.earthRadius) / 1000;
        satelliteFolder.add({altitude}, 'altitude').name('Altitude (km)').listen();
    }
}

// GUI Setup
const gui = new GUI();
// GUI Setup Function
function setupGUI() {
    // Time Warp Settings
    gui.add(settings, 'timeWarp', { 'Paused': 0, 'Normal (1x)': 1, 'Fast (10)': 10, 'Faster (100)': 100 })
        .name('Time Warp')
        .onChange(value => {
            timeUtils.setTimeWarp(value);
            world.timeScale = value;
            updateSatelliteVelocities(); // Ensure satellite velocities are updated
        });

    // Simulated Time Display
    gui.add(settings, 'simulatedTime').name('Simulated Time').listen();

    // Satellite Launch Control
    gui.add({createSatellite: () => createSatellite(settings.altitude)}, 'createSatellite').name('Launch Satellite');

    // Display Options
    const displayFolder = gui.addFolder('Display Options');
    displayFolder.add(settings, 'showGrid').name('Show Grid').onChange(value => gridHelper.visible = value);
    displayFolder.add(settings, 'showVectors').name('Show Vectors').onChange(value => vectors.setVisible(value));

    // Debug Settings
    const debugFolder = gui.addFolder('Debugging');
    debugFolder.add(debugSettings, 'showDebugger').name('Show Physics Debug').onChange(value => cannonDebugger.enabled = value);

    displayFolder.open(); // Open the Display Options by default
    debugFolder.open(); // Open the Debugging folder by default
}

// Initialize the GUI
setupGUI();


const gridHelper = new THREE.PolarGridHelper(6000, 20, 40, 64, 0x404040, 0x404040);
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.2;
scene.add(gridHelper);

// Post-processing
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 1.4, 0.99);
const bloomComposer = new EffectComposer(renderer);
bloomComposer.addPass(renderPass);
bloomComposer.addPass(bloomPass);
const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderPass);
finalComposer.addPass(bloomComposer);

// Animation Loop
function animate(timestamp) {
    stats.begin();

    const currentTime = Date.now() / 1000; // Current time in seconds for trace update purposes

    // Update time utils with the high-resolution timestamp
    timeUtils.update(timestamp);

    // Cannon.js world step: step size, deltaTime (corrected for time warp), max sub steps
    world.step(1 / 60, timeUtils.getDeltaTime(), 3);

    // Update each satellite
    satellites.forEach(satellite => satellite.updateSatellite(timeUtils.getSimulatedTime(), settings.timeWarp));

    earth.updateRotation();
    sun.updatePosition(timeUtils.getSimulatedTime());
    vectors.updateVectors();
    if (debugSettings.showDebugger) cannonDebugger.update();

    renderer.clear();
    renderer.render(scene, camera);
    bloomComposer.render();
    finalComposer.render();

    stats.end();

    requestAnimationFrame(animate);
}


requestAnimationFrame(animate);

// Stats for Monitoring
const stats = new Stats();
document.body.appendChild(stats.dom);
