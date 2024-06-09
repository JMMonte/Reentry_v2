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
import { BackgroundStars } from './components/background.js';
import { createSatelliteFromLatLon, createSatelliteFromOrbitalElements } from './createSatellite.js'; // Importing both functions

// import textures
import earthTexture from '../public/assets/texture/8k_earth_daymap.jpg';
import earthSpecTexture from '../public/assets/texture/8k_earth_specular_map.png';
import earthNormalTexture from '../public/assets/texture/8k_earth_normal_map.jpg';
import cloudTexture from '../public/assets/texture/cloud_combined_8192.png';
import moonTexture from '../public/assets/texture/lroc_color_poles_8k.jpg';
import moonBump from '../public/assets/texture/ldem_16_uint.jpg';
import geojsonDataCities from './config/ne_110m_populated_places.json';
import geojsonDataAirports from './config/ne_10m_airports.json';
import geojsonDataSpaceports from './config/spaceports.json';
import geojsonDataGroundStations from './config/ground_stations.json';
import geojsonDataObservatories from './config/observatories.json';

import { io } from "socket.io-client";
const socket = io('http://localhost:3000');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    42, 
    window.innerWidth / window.innerHeight, 
    10, 
    Constants.kmToMeters * 4e6 
);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('three-canvas'), 
    antialias: true,
    depth: true,
    logarithmicDepthBuffer: false,
    powerPreference: 'high-performance',
    precision: 'highp'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
renderer.gammaFactor = 2.2;
renderer.gammaOutput = true;
renderer.physicallyCorrectLights = true;
renderer.autoClear = false;

const backgroundStars = new BackgroundStars(scene, camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 100 * Constants.metersToKm * Constants.scale * 2;
controls.maxDistance = 50000000 * Constants.scale;
camera.position.set(1000, 7000, 20000).multiplyScalar(Constants.scale);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

const settings = {
    timeWarp: 1,
    startTime: new Date().toISOString(),
    simulatedTime: new Date().toISOString(),
    showGrid: false,
    showVectors: false,
    showSatVectors: true,
    showDebugger: false,
    showSurfaceLines: false,
    showOrbits: true,
    showTraces: true,
    showCities: false,
    showAirports: false,
    showSpaceports: false,
    showObservatories: false,
    showGroundStations: false,
    showCountryBorders: false,
    showStates: false,
    showMoonOrbit: false,
    showMoonTraces: false,
    showMoonSurfaceLines: false,
};

const timeUtils = new TimeUtils(settings);

const textureManager = new TextureManager();
const textureList = [
    { url: earthTexture, name: 'earthTexture' },
    { url: earthSpecTexture, name: 'earthSpecTexture' },
    { url: earthNormalTexture, name: 'earthNormalTexture' },
    { url: cloudTexture, name: 'cloudTexture' },
    { url: moonTexture, name: 'moonTexture' },
    { url: moonBump, name: 'moonBump' }
];

let earth, sun, moon, vectors, guiManager, cannonDebugger;
const satellites = [];

async function init() {
    try {
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

    earth.earthSurface.addPoints(geojsonDataCities, earth.earthSurface.materials.cityPoint, 'cities');
    earth.earthSurface.addPoints(geojsonDataAirports, earth.earthSurface.materials.airportPoint, 'airports');
    earth.earthSurface.addPoints(geojsonDataSpaceports, earth.earthSurface.materials.spaceportPoint, 'spaceports');
    earth.earthSurface.addPoints(geojsonDataGroundStations, earth.earthSurface.materials.groundStationPoint, 'groundStations');
    earth.earthSurface.addPoints(geojsonDataObservatories, earth.earthSurface.materials.observatoryPoint, 'observatories');

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3, 
        0.999, 
        0.99 
    );
    bloomPass.renderToScreen = true;
    bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2); 
    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.addPass(renderPass);
    bloomComposer.addPass(bloomPass);
    const finalComposer = new EffectComposer(renderer);
    finalComposer.addPass(renderPass);
    finalComposer.addPass(bloomComposer);

    const stats = new Stats();
    document.body.appendChild(stats.dom);

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
            console.log('Physics worker initialization complete');
        }
    }

    physicsWorker.postMessage({
        type: 'init',
        data: {
            earthMass: Constants.earthMass,
            moonMass: Constants.moonMass,
            satellites: []
        }
    });

    guiManager = new GUIManager(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, cannonDebugger, physicsWorker, camera, controls);

    socket.on('createSatelliteFromLatLon', (data) => {
        console.log('Received createSatelliteFromLatLon event with data:', data);
        const { latitude, longitude, altitude, velocity, azimuth, angleOfAttack } = data;
        createSatelliteFromLatLon(scene, world, earth, moon, satellites, vectors, guiManager.gui, guiManager, latitude, longitude, altitude, velocity, azimuth, angleOfAttack);
    });

    socket.on('createSatelliteFromOrbitalElements', (data) => {
        console.log('Received createSatelliteFromOrbitalElements event with data:', data);
        const { semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly } = data;
        createSatelliteFromOrbitalElements(scene, world, earth, moon, satellites, vectors, guiManager.gui, guiManager, semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly);
    });

    function animate(timestamp) {
        stats.begin();

        timeUtils.update(timestamp);

        const realDeltaTime = timeUtils.getDeltaTime();
        const warpedDeltaTime = realDeltaTime;
        const currentTime = timeUtils.getSimulatedTime();

        if (satellites.length > 0) {
            physicsWorker.postMessage({
                type: 'step',
                data: {
                    warpedDeltaTime,
                    earthPosition: earth.earthBody.position,
                    earthRadius: Constants.earthRadius,
                    moonPosition: moon.moonBody.position
                }
            });
        }

        satellites.forEach(satellite => {
            satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            satellite.applyBufferedUpdates();

            const altitude = satellite.getCurrentAltitude();
            const velocity = satellite.getCurrentVelocity();
            const earthGravityForce = satellite.getCurrentEarthGravityForce();
            const moonGravityForce = satellite.getCurrentMoonGravityForce();
            const dragForce = satellite.getCurrentDragForce();

            satellite.altitudeController.setValue(parseFloat(altitude)).updateDisplay();
            satellite.velocityController.setValue(parseFloat(velocity)).updateDisplay();
            satellite.earthGravityForceController.setValue(parseFloat(earthGravityForce)).updateDisplay();
            satellite.moonGravityForceController.setValue(parseFloat(moonGravityForce)).updateDisplay();
            satellite.dragController.setValue(parseFloat(dragForce)).updateDisplay();
        });

        earth.updateRotation();
        earth.updateLightDirection();
        sun.updatePosition(currentTime);
        moon.updatePosition(currentTime);
        moon.updateRotation(currentTime);
        vectors.updateVectors();

        if (settings.showDebugger) {
            cannonDebugger.update();
        }

        guiManager.updateCamera();

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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
        bloomComposer.setSize(window.innerWidth, window.innerHeight);
        finalComposer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener('resize', onWindowResize);

    requestAnimationFrame(animate);
}

init();
