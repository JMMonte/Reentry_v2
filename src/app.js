// app.js
import * as THREE from 'three';
import Stats from 'stats.js';
import { Constants } from './utils/Constants.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { GUIManager } from './managers/GUIManager.js';
import PhysicsWorkerURL from 'url:./workers/physicsWorker.js';
import { TextureManager } from './managers/TextureManager.js';
import { CameraControls } from './managers/CameraControls.js'; // Import CameraControls

import {
    createSatelliteFromLatLon,
    createSatelliteFromOrbitalElements,
    createSatelliteFromLatLonCircular
} from './createSatellite.js';

import { io } from 'socket.io-client';
const socket = io('http://localhost:3000');

import { setupEventListeners, setupSocketListeners } from './setupListeners.js';
import { setupCamera, setupRenderer, setupControls, setupPhysicsWorld, setupSettings } from './setupComponents.js';
import { loadTextures, setupScene, setupPostProcessing, addEarthPoints } from './setupScene.js';
import { initTimeControls } from './timeControls.js';
import { initDisplayControls } from './displayControls.js'; // Import display controls
import { initializeSatelliteCreationPanel } from './createSatelliteControls.js'; // Import satellite controls
import { initializeBodySelector } from './bodySelectorControls.js'; // Import body selector controls

class App {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = setupCamera();
        this.renderer = setupRenderer();
        this.controls = setupControls(this.camera, this.renderer);
        this.world = setupPhysicsWorld();
        this.settings = setupSettings();
        this.timeUtils = new TimeUtils(this.settings);
        this.textureManager = new TextureManager();
        this.satellites = [];
        this.composers = {};
        this.stats = new Stats();
        this.physicsWorker = new Worker(PhysicsWorkerURL);
        this.cameraControls = new CameraControls(this.camera, this.controls); // Instantiate CameraControls
        this.workerInitialized = false;
    }

    async init() {
        console.log('Initializing App...');
        await loadTextures(this.textureManager);
        setupScene(this);
        this.setupGUI();
        setupPostProcessing(this);
        setupEventListeners(this);
        setupSocketListeners(this, socket);
        initTimeControls(this.timeUtils);
        initDisplayControls({
            scene: this.scene,
            earth: this.earth,
            moon: this.moon,
            satellites: this.satellites,
            vectors: this.vectors
        }); // Initialize display controls
        initializeBodySelector(this); // Initialize the body selector
        this.applyStatsStyle();
        this.animate();

        document.addEventListener('updateTimeWarp', (event) => {
            this.timeUtils.setTimeWarp(event.detail.value);
        });

        initializeSatelliteCreationPanel(this); // Initialize satellite creation controls

        document.addEventListener('createSatelliteFromLatLon', (event) => {
            this.handleCreateSatelliteFromLatLon(event.detail);
        });

        document.addEventListener('createSatelliteFromLatLonCircular', (event) => {
            this.handleCreateSatelliteFromLatLonCircular(event.detail);
        });

        document.addEventListener('createSatelliteFromOrbitalElements', (event) => {
            this.handleCreateSatelliteFromOrbitalElements(event.detail);
        });

        socket.emit('threejs-app-started');

        this.initializeWorker();
    }

    initializeWorker() {
        this.physicsWorker.postMessage({
            type: 'init',
            data: {
                earthMass: Constants.earthMass,
                moonMass: Constants.moonMass,
                satellites: []
            }
        });

        this.physicsWorker.onmessage = (event) => {
            if (event.data.type === 'initComplete') {
                this.workerInitialized = true;
            }
        };
    }

    setupGUI() {
        this.guiManager = new GUIManager(
            this.scene, this.world, this.earth, this.moon, this.sun,
            this.satellites, this.vectors, this.settings, this.timeUtils,
            this.cannonDebugger, this.physicsWorker, this.camera, this.controls
        );
    }

    animate = (timestamp) => {
        this.stats.begin();

        this.timeUtils.update(timestamp);
        const realDeltaTime = this.timeUtils.getDeltaTime();
        const warpedDeltaTime = realDeltaTime;
        const currentTime = this.timeUtils.getSimulatedTime();

        document.dispatchEvent(new CustomEvent('timeUpdate', { detail: { simulatedTime: currentTime } }));

        this.updatePhysics(warpedDeltaTime);
        this.updateSatellites(currentTime, realDeltaTime, warpedDeltaTime);
        this.updateScene(currentTime);

        this.render();

        this.stats.end();
        requestAnimationFrame(this.animate);
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

        if (this.guiManager) {
            this.guiManager.updateCamera();
        }

        this.cameraControls.updateCameraPosition(); // Ensure the camera controls are updated
    }

    render() {
        this.renderer.clear();
        this.composers.bloom.render();
        this.composers.final.render();
    }

    onWindowResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
        this.composers.bloom.setSize(window.innerWidth, window.innerHeight);
        this.composers.final.setSize(window.innerWidth, window.innerHeight);
    }

    handleCreateSatelliteFromLatLon = (data) => {
        console.log('Received createSatelliteFromLatLon event with data:', data);
        const { latitude, longitude, altitude, velocity, azimuth, angleOfAttack } = data;
        createSatelliteFromLatLon(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            latitude, longitude, altitude, velocity, azimuth, angleOfAttack
        );
    }

    handleCreateSatelliteFromOrbitalElements = (data) => {
        console.log('Received createSatelliteFromOrbitalElements event with data:', data);
        const { semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly } = data;
        createSatelliteFromOrbitalElements(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly
        );
    }

    handleCreateSatelliteFromLatLonCircular = (data) => {
        console.log('Received createSatelliteFromLatLonCircular event with data:', data);
        const { latitude, longitude, altitude, azimuth } = data;
        createSatelliteFromLatLonCircular(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            latitude, longitude, altitude, azimuth
        );
    }

    applyStatsStyle() {
        this.stats.dom.style.cssText = 'position:absolute;bottom:0px;right:0px;';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    const app = new App();
    app.init();

    // Notify server when the app is closed
    window.addEventListener('beforeunload', () => {
        socket.emit('threejs-app-stopped');
    });
});
