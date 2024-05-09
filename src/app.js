import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'dat.gui';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Earth } from './Earth.js';
import { Sun } from './Sun.js';
import { Satellite } from './Satellite.js';
import { Vectors } from './Vectors.js';
import { Constants } from './constants.js';
import CannonDebugger from 'cannon-es-debugger';

const satellites = []; // Array to store satellite instances

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
controls.minDistance = Constants.earthRadius;
controls.maxDistance = 10000000;

// Lighting
scene.add(new THREE.AmbientLight(0x404040));

// GUI for control
const gui = new GUI();
const settings = { timeWarp: 1, simulatedTime: new Date().toISOString(), showGrid: true };
gui.add(settings, 'timeWarp', 1, 100000).name('Time Warp');
gui.add(settings, 'simulatedTime').name('Simulated Time').listen();
gui.add(settings, 'showGrid').name('Show Grid').onChange(value => {
    gridHelper.visible = value;
});
const gridHelper = new THREE.PolarGridHelper(6000, 20, 40, 64);
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.2;
scene.add(gridHelper);

// Physics world setup
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 1;


// Initialize the debugger
const cannonDebugger = new CannonDebugger(scene, world, {
    color: 0xff0000, // Color of the wireframes
    scale: 1.0, // Scale of the wireframes
});

// Save the original update function
cannonDebugger.originalUpdate = cannonDebugger.update;

// Redefine the update method to include an enabled check
cannonDebugger.update = function() {
    if (this.enabled) {
        this.originalUpdate(); // Call the original update method only if enabled
    } else {
        this.clear(); // Clear the scene if not enabled
    }
};

// GUI control for Cannon Debugger visibility
const debugSettings = {
    showDebugger: false // Initially disabled
};

gui.add(debugSettings, 'showDebugger').name('Show Physics Debug').onChange(value => {
    cannonDebugger.enabled = value; // Toggle the enabled state of the debugger
});

// Instantiate Earth, Sun, and Satellite
const earth = new Earth(scene, world, renderer);
const sun = new Sun(scene, earth);
const vectors = new Vectors(earth, scene, sun);
sun.sun.layers.enable(1); // Add the sun to bloom layer
sun.sunLight.layers.enable(1); // Add the sun light to bloom layer

// camera position (in relation to earth's dimensions)
camera.position.set(Constants.earthRadius, 1 * Constants.earthRadius, 5 * Constants.earthRadius);
camera.lookAt(earth.earthMesh.position);

function updateSatelliteDisplay(newSatellite) {
    const satelliteFolder = gui.addFolder(`Satellite ${satellites.length + 1}`);
    satelliteFolder.addColor(newSatellite, 'color').name('Color').onChange(value => {
        newSatellite.mesh.material.color.set(value);
    });
    satelliteFolder.add(newSatellite, 'size').min(0.1).max(10).step(0.1).name('Size').onChange(value => {
        newSatellite.mesh.scale.set(value, value, value);
    });

    // Accessing position and velocity from the mesh and body, respectively
    const altitude = (newSatellite.mesh.position.length() - Constants.earthRadius) * 10 ;
    console.log(altitude);
    satelliteFolder.add({altitude: altitude.toFixed(2)}, 'altitude').name('Altitude (km)').listen();

    const velocityMagnitude = newSatellite.body.velocity.length() * (3/100); // Adjust for units
    satelliteFolder.add({velocity: velocityMagnitude.toFixed(2)}, 'velocity').name('Velocity (km/s)').listen();

    satelliteFolder.open();
}

// Adjusted satellite creation logic
const satelliteParams = {
    altitude: 50, // default altitude in km
    createSatellite: function() {
        const radius = Constants.earthRadius + (this.altitude); // Convert altitude to meters
        const speed = -Math.sqrt(Constants.G * Constants.earthMass / radius);
        const position = new CANNON.Vec3(radius, 0, 0);
        const velocity = new CANNON.Vec3(0, 0, speed / (100/3)); // Adjust speed for units
        const newSatellite = new Satellite(scene, world, earth, position, velocity);
        satellites.push(newSatellite);
        updateSatelliteDisplay(newSatellite);
    }
};

gui.add(satelliteParams, 'altitude').min(0).max(2000).step(1).name('Satellite Altitude (km)');
gui.add(satelliteParams, 'createSatellite').name('Launch Satellite');


// Post-processing setup
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.9;
bloomPass.strength = 0.7;
bloomPass.radius = 1.0;

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderPass);
bloomComposer.addPass(bloomPass);

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderPass);
finalComposer.addPass(bloomComposer);

// Function to handle window resizing
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize, false);

// Animation loop
const fixedTimeStep = 1 / 60;  // Fixed physics time step in seconds
let lastTime = performance.now() * 0.001;  // Initialize lastTime in seconds

function animate(timestamp) {
    requestAnimationFrame(animate);

    const now = timestamp * 0.001; // Convert timestamp to seconds
    let deltaTime = now - lastTime;
    lastTime = now;

    // Scale delta time according to the time warp setting
    deltaTime *= settings.timeWarp;

    // Perform physics integration for the frame
    world.step(fixedTimeStep, deltaTime, 3);

    // Update satellites and other simulation elements
    satellites.forEach(satellite => satellite.updateSatellite(new Date(settings.simulatedTime)));

    // Update Earth and Sun position and rotation based on simulated time
    earth.updateRotation(new Date(settings.simulatedTime));
    sun.updatePosition(new Date(settings.simulatedTime));
    vectors.updateVectors(new Date(settings.simulatedTime));

    // Conditionally update visual components like debugging tools
    if (debugSettings.showDebugger) {
        cannonDebugger.update();
    }

    // Render the scene
    renderer.clear();
    bloomComposer.render();
    finalComposer.render();
}

requestAnimationFrame(animate);
