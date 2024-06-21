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
import { createSatelliteFromLatLon, createSatelliteFromOrbitalElements, createSatelliteFromLatLonCircular } from './createSatellite.js'; // Importing both functions

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

class App {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = this.setupCamera();
        this.renderer = this.setupRenderer();
        this.controls = this.setupControls();
        this.world = this.setupPhysicsWorld();
        this.settings = this.setupSettings();
        this.timeUtils = new TimeUtils(this.settings);
        this.textureManager = new TextureManager();
        this.satellites = [];
        this.composers = {};
        this.stats = new Stats();
        this.physicsWorker = new Worker(PhysicsWorkerURL);
    }

    setupCamera() {
        const camera = new THREE.PerspectiveCamera(
            42,
            window.innerWidth / window.innerHeight,
            10,
            Constants.kmToMeters * 4e6
        );
        camera.position.set(1000, 7000, 20000).multiplyScalar(Constants.scale);
        camera.lookAt(new THREE.Vector3(0, 0, 0));
        return camera;
    }

    setupRenderer() {
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
        renderer.physicallyCorrectLights = true;
        renderer.autoClear = false;
        return renderer;
    }

    setupControls() {
        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.minDistance = 100 * Constants.metersToKm * Constants.scale * 2;
        controls.maxDistance = 50000000 * Constants.scale;
        return controls;
    }

    setupPhysicsWorld() {
        const world = new CANNON.World();
        world.gravity.set(0, 0, 0);
        world.broadphase = new CANNON.NaiveBroadphase();
        world.solver.iterations = 10;
        return world;
    }

    setupSettings() {
        return {
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
            showGroundTraces: true,
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
    }

    async init() {
        await this.loadTextures();
        this.setupScene();
        this.setupPostProcessing();
        this.setupEventListeners();
        this.setupPhysicsWorker();
        this.setupGUI();
        this.setupSocketListeners();
        this.animate();
    }

    async loadTextures() {
        const textureList = [
            { url: earthTexture, name: 'earthTexture' },
            { url: earthSpecTexture, name: 'earthSpecTexture' },
            { url: earthNormalTexture, name: 'earthNormalTexture' },
            { url: cloudTexture, name: 'cloudTexture' },
            { url: moonTexture, name: 'moonTexture' },
            { url: moonBump, name: 'moonBump' }
        ];
        try {
            await this.textureManager.loadAllTextures(textureList);
        } catch (error) {
            console.error('Failed to load all textures:', error);
            throw error;
        }
    }

    setupScene() {
        new BackgroundStars(this.scene, this.camera);
        this.earth = new Earth(this.scene, this.world, this.renderer, this.timeUtils, this.textureManager);
        this.sun = new Sun(this.scene, this.timeUtils);
        this.moon = new Moon(this.scene, this.world, this.renderer, this.timeUtils, this.textureManager);
        this.vectors = new Vectors(this.earth, this.scene, this.timeUtils);
        this.cannonDebugger = new CannonDebugger(this.scene, this.world, { autoUpdate: false });

        this.addEarthPoints();
    }

    addEarthPoints() {
        this.earth.earthSurface.addPoints(geojsonDataCities, this.earth.earthSurface.materials.cityPoint, 'cities');
        this.earth.earthSurface.addPoints(geojsonDataAirports, this.earth.earthSurface.materials.airportPoint, 'airports');
        this.earth.earthSurface.addPoints(geojsonDataSpaceports, this.earth.earthSurface.materials.spaceportPoint, 'spaceports');
        this.earth.earthSurface.addPoints(geojsonDataGroundStations, this.earth.earthSurface.materials.groundStationPoint, 'groundStations');
        this.earth.earthSurface.addPoints(geojsonDataObservatories, this.earth.earthSurface.materials.observatoryPoint, 'observatories');
    }

    setupPostProcessing() {
        const renderPass = new RenderPass(this.scene, this.camera);
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.3,
            0.999,
            0.99
        );
        bloomPass.renderToScreen = true;
        bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);

        this.composers.bloom = new EffectComposer(this.renderer);
        this.composers.bloom.addPass(renderPass);
        this.composers.bloom.addPass(bloomPass);

        this.composers.final = new EffectComposer(this.renderer);
        this.composers.final.addPass(renderPass);
        this.composers.final.addPass(this.composers.bloom);
    }

    setupEventListeners() {
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.body.appendChild(this.stats.dom);
    }

    setupPhysicsWorker() {
        this.physicsWorker.onmessage = this.handlePhysicsWorkerMessage.bind(this);
        this.physicsWorker.postMessage({
            type: 'init',
            data: {
                earthMass: Constants.earthMass,
                moonMass: Constants.moonMass,
                satellites: []
            }
        });
    }

    handlePhysicsWorkerMessage(event) {
        const { type, data } = event.data;
        if (type === 'stepComplete') {
            const satellite = this.satellites.find(sat => sat.id === data.id);
            if (satellite) {
                satellite.updateFromSerialized(data);
            }
        } else if (type === 'initComplete') {
            console.log('Physics worker initialization complete');
        }
    }

    setupGUI() {
        this.guiManager = new GUIManager(
            this.scene, this.world, this.earth, this.moon, this.sun,
            this.satellites, this.vectors, this.settings, this.timeUtils,
            this.cannonDebugger, this.physicsWorker, this.camera, this.controls
        );
    }

    setupSocketListeners() {
        socket.on('createSatelliteFromLatLon', this.handleCreateSatelliteFromLatLon.bind(this));
        socket.on('createSatelliteFromOrbitalElements', this.handleCreateSatelliteFromOrbitalElements.bind(this));
        socket.on('createSatelliteFromLatLonCircular', this.handleCreateSatelliteFromLatLonCircular.bind(this));
    }

    handleCreateSatelliteFromLatLon(data) {
        console.log('Received createSatelliteFromLatLon event with data:', data);
        const { latitude, longitude, altitude, velocity, azimuth, angleOfAttack } = data;
        createSatelliteFromLatLon(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            latitude, longitude, altitude, velocity, azimuth, angleOfAttack
        );
    }

    handleCreateSatelliteFromOrbitalElements(data) {
        console.log('Received createSatelliteFromOrbitalElements event with data:', data);
        const { semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly } = data;
        createSatelliteFromOrbitalElements(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly
        );
    }

    handleCreateSatelliteFromLatLonCircular(data) {
        console.log('Received createSatelliteFromLatLonCircular event with data:', data);
        const { latitude, longitude, altitude, azimuth } = data;
        createSatelliteFromLatLonCircular(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            latitude, longitude, altitude, azimuth
        );
    }

    animate(timestamp) {
        this.stats.begin();

        this.timeUtils.update(timestamp);
        const realDeltaTime = this.timeUtils.getDeltaTime();
        const warpedDeltaTime = realDeltaTime;
        const currentTime = this.timeUtils.getSimulatedTime();

        this.updatePhysics(warpedDeltaTime);
        this.updateSatellites(currentTime, realDeltaTime, warpedDeltaTime);
        this.updateScene(currentTime);

        this.render();

        this.stats.end();
        requestAnimationFrame(this.animate.bind(this));
    }

    updatePhysics(warpedDeltaTime) {
        if (this.satellites.length > 0) {
            this.physicsWorker.postMessage({
                type: 'step',
                data: {
                    warpedDeltaTime,
                    earthPosition: this.earth.earthBody.position,
                    earthRadius: Constants.earthRadius,
                    moonPosition: this.moon.moonBody.position
                }
            });
        }
    }

    updateSatellites(currentTime, realDeltaTime, warpedDeltaTime) {
        this.satellites.forEach(satellite => {
            satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            satellite.applyBufferedUpdates();
            this.updateSatelliteGUI(satellite);
        });
    }

    updateSatelliteGUI(satellite) {
        const altitude = satellite.getCurrentAltitude();
        const velocity = satellite.getCurrentVelocity();
        const earthGravityForce = satellite.getCurrentEarthGravityForce();
        const moonGravityForce = satellite.getCurrentMoonGravityForce();
        const dragForce = satellite.getCurrentDragForce();
        const periapsisAltitude = satellite.getPeriapsisAltitude();
        const apoapsisAltitude = satellite.getApoapsisAltitude();

        satellite.altitudeController.setValue(parseFloat(altitude)).updateDisplay();
        satellite.velocityController.setValue(parseFloat(velocity)).updateDisplay();
        satellite.earthGravityForceController.setValue(parseFloat(earthGravityForce)).updateDisplay();
        satellite.moonGravityForceController.setValue(parseFloat(moonGravityForce)).updateDisplay();
        satellite.dragController.setValue(parseFloat(dragForce)).updateDisplay();
        satellite.periapsisAltitudeController.setValue(parseFloat(periapsisAltitude)).updateDisplay();
        satellite.apoapsisAltitudeController.setValue(parseFloat(apoapsisAltitude)).updateDisplay();
    }

    updateScene(currentTime) {
        this.earth.updateRotation();
        this.earth.updateLightDirection();
        this.sun.updatePosition(currentTime);
        this.moon.updatePosition(currentTime);
        this.moon.updateRotation(currentTime);
        this.vectors.updateVectors();

        if (this.settings.showDebugger) {
            this.cannonDebugger.update();
        }

        this.guiManager.updateCamera();
    }

    render() {
        this.renderer.clear();
        this.composers.bloom.render();
        this.composers.final.render();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
        this.composers.bloom.setSize(window.innerWidth, window.innerHeight);
        this.composers.final.setSize(window.innerWidth, window.innerHeight);
    }
}

const app = new App();
app.init();