import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'dat.gui';
import { Earth } from './Earth.js';
import { Sun } from './Sun.js';
import { Satellite } from './Satellite.js';
import { computeTimeAnomaly } from './timeAnomaly.js';
import { Vectors } from './Vectors.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 200000000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.gammaFactor = 2.2;
renderer.gammaOutput = true;
renderer.physicallyCorrectLights = true;
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 6371;
controls.maxDistance = 10000000;

// Lighting
scene.add(new THREE.AmbientLight(0x404040));

// GUI for control
const gui = new GUI();
const settings = { timeWarp: 1, simulatedTime: new Date().toISOString(), showGrid: true };
gui.add(settings, 'timeWarp', 1, 100000).name('Time Warp');
gui.add(settings, 'simulatedTime').name('Simulated Time').listen();
gui.add(settings, 'showGrid').name('Show Grid').onChange((value) => {
        gridHelper.visible = value;
    }
);

const gridHelper = new THREE.PolarGridHelper(60000, 100, 100, 64);
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.5;
scene.add(gridHelper);

// Physics world setup
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// Instantiate Earth, Sun, and Satellite
const earth = new Earth(scene, world);
const sun = new Sun(scene);
const satellite = new Satellite(scene, world, earth);
let vectors = new Vectors(earth, scene, sun);

// Camera setup
camera.position.set(0, 15000, 30000);
camera.lookAt(new THREE.Vector3(0, 0, 0));

// Function to handle window resizing
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize, false);

// Add a GUI element to display the time anomaly
const anomalyDisplay = { timeAnomaly: 0 };
gui.add(anomalyDisplay, 'timeAnomaly').name('Time Anomaly (s)').listen();

// Animation loop
let lastTime = (new Date()).getTime();
function animate() {
    requestAnimationFrame(animate);

    const currentTime = new Date();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    updateSimulation(deltaTime); // Updates simulation time and positions
    renderer.render(scene, camera);
}

function updateSimulation(deltaTime) {
    // Update the simulated time
    let currentSimulatedTime = new Date(settings.simulatedTime);
    settings.simulatedTime = new Date(currentSimulatedTime.getTime() + deltaTime * 1000 * settings.timeWarp).toISOString();

    // Update Sun and Earth positions
    const simulatedDate = new Date(settings.simulatedTime);
    const sunPosition = sun.getSunPosition(simulatedDate);
    sun.sun.position.copy(sunPosition);
    sun.sunLight.position.copy(sunPosition);

    earth.updateRotation(simulatedDate);
    satellite.updateTraceLine();

    earth.earthMesh.updateMatrixWorld(true);
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    vectors.updateVectors(currentSimulatedTime);
    anomalyDisplay.timeAnomaly = computeTimeAnomaly(settings, sun, earth);
    updatePhysics(deltaTime);
    controls.update();

}

function updatePhysics(deltaTime) {
    world.step(Math.min(deltaTime, 1/60)); // Use smaller steps, e.g., at most 1/60th of a second

    satellite.satelliteMesh.position.copy(satellite.satelliteBody.position);
    satellite.satelliteMesh.quaternion.copy(satellite.satelliteBody.quaternion);

    const earthToSatVec = satellite.satelliteBody.position.vsub(earth.earthBody.position);
    const distance = earthToSatVec.length();
    if (distance > 0) {
        const forceMagnitude = -CANNON.G * (earth.earthBody.mass * satellite.satelliteBody.mass) / (distance * distance);
        const force = earthToSatVec.normalize().scale(forceMagnitude);
        satellite.satelliteBody.applyForce(force, satellite.satelliteBody.position);
    }
    console.log('Satellite Position:', satellite.satelliteBody.position.toString());

}

animate(); // Start the animation loop
