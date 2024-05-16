import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Earth } from './components/Earth.js';
import { Sun } from './components/Sun.js';
import { Vectors } from './utils/Vectors.js';
import { Constants } from './utils/Constants.js';
import CannonDebugger from 'cannon-es-debugger';
import { TimeUtils } from './utils/TimeUtils.js';
import { GUIManager } from './managers/GUIManager.js';
import PhysicsWorkerURL from 'url:./workers/physicsWorker.js'; // Import worker URL

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

// Add ambient light
const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.1);
scene.add(ambientLight);

// Physics World Setup
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

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

// Post-processing
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 1.4, 0.99);
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
    }
}

// GUI Manager
new GUIManager(scene, world, earth, satellites, vectors, settings, timeUtils, cannonDebugger, physicsWorker);

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
                earthRadius: Constants.earthRadius
            }
        });
    }

    // Update satellites
    satellites.forEach(satellite => {
        satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
        const altitude = satellite.getCurrentAltitude();
        const velocity = satellite.getCurrentVelocity();
        const acceleration = satellite.getCurrentAcceleration();
        const dragForce = satellite.getCurrentDragForce();
        satellite.altitudeController.setValue(parseFloat(altitude));
        satellite.velocityController.setValue(parseFloat(velocity));
        satellite.accelerationController.setValue(parseFloat(acceleration));
        satellite.dragController.setValue(parseFloat(dragForce));
    });

    earth.updateRotation();
    sun.updatePosition(currentTime);
    vectors.updateVectors();

    if (settings.showDebugger) {
        cannonDebugger.update();
    }

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
