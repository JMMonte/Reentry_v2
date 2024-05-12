import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Earth } from './Earth.js';
import { Sun } from './Sun.js';
import { Vectors } from './Vectors.js';
import { Constants } from './Constants.js';
import CannonDebugger from 'cannon-es-debugger';
import { TimeUtils } from './TimeUtils.js';
import { GUIManager } from './GUIManager.js';
import {ChartManager} from './ChartManager.js';
import {chartConfig} from './ChartConfig.js';

// Scene and Renderer Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, Constants.kmToMeters * 200000000);
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    depth: false,
    logarithmicDepthBuffer: false 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.gammaFactor = 2.2;
renderer.gammaOutput = true;
renderer.physicallyCorrectLights = true;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

// Camera and Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 100 * Constants.metersToKm * Constants.scale * 2;
controls.maxDistance = 10000000 * Constants.scale;
camera.position.set(1000, 7000, 20000).multiplyScalar(Constants.scale);
camera.lookAt(new THREE.Vector3(0, 0, 0));

// Physics World Setup
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 100;

// GUI and Time settings
const settings = {
    timeWarp: 1,
    simulatedTime: new Date().toISOString(),
    showGrid: true,
    showVectors: true,
    altitude: 500,
    showDebugger: false
};

// Time management
const timeUtils = new TimeUtils(settings);

// Main Components
const earth = new Earth(scene, world, renderer, timeUtils);
const sun = new Sun(scene, timeUtils);
const vectors = new Vectors(earth, scene, timeUtils);
const satellites = [];

// Instantiate the Cannon Debugger
const cannonDebugger = new CannonDebugger(scene, world, { autoUpdate: false });

// GUI Manager
new GUIManager(scene, world, earth, satellites, vectors, settings, timeUtils, cannonDebugger);

// Chart Configuration
// Assuming you have a canvas element with id 'dataChart'
const ctx = document.getElementById('dataChart').getContext('2d');
const myChartManager = new ChartManager(ctx, chartConfig);

// In your animation loop or update function
function updateSimulationData(time, altitude, velocity, acceleration) {
    const data = [altitude, velocity, acceleration]; // Ensure this matches the order in chartConfig
    myChartManager.updateData(time, data);
}

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

    // Update time utils with the high-resolution timestamp
    timeUtils.update(timestamp);

    // Calculate real and warped delta time
    const realDeltaTime = timeUtils.getDeltaTime();
    const warpedDeltaTime = realDeltaTime * settings.timeWarp;

    // Physics step - using real delta time for physics stability
    world.step(realDeltaTime, 10 * realDeltaTime, 3);

    // Update components
    satellites.forEach(satellite => {
        satellite.updateSatellite(timeUtils.getSimulatedTime(), realDeltaTime, warpedDeltaTime);
        // Update GUI with current data
        const altitude = satellite.getCurrentAltitude();
        const velocity = satellite.getCurrentVelocity();
        const acceleration = satellite.getCurrentAcceleration();
        const dragForce = satellite.getCurrentDragForce();
        satellite.altitudeController.setValue((altitude).toFixed(4));
        satellite.velocityController.setValue((velocity).toFixed(4));
        satellite.accelerationController.setValue((acceleration).toFixed(4));
        satellite.dragController.setValue((dragForce).toFixed(4));
        updateSimulationData(timestamp, altitude, velocity, acceleration, dragForce);
    });

    // Updating celestial and other vectors
    earth.updateRotation();
    sun.updatePosition(timeUtils.getSimulatedTime());
    vectors.updateVectors();

    // Debugger updates, if needed
    if (settings.showDebugger) {
        cannonDebugger.update();
    }

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

// Add the event listener
window.addEventListener('resize', onWindowResize);

requestAnimationFrame(animate);

// Stats for Monitoring
const stats = new Stats();
document.body.appendChild(stats.dom);
