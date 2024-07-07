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
        this.initBodySelector(); // Initialize the body selector
        this.applyStatsStyle();
        this.animate();

        document.addEventListener('updateTimeWarp', (event) => {
            this.timeUtils.setTimeWarp(event.detail.value);
        });
    }

    setupGUI() {
        this.guiManager = new GUIManager(
            this.scene, this.world, this.earth, this.moon, this.sun,
            this.satellites, this.vectors, this.settings, this.timeUtils,
            this.cannonDebugger, this.physicsWorker, this.camera, this.controls
        );
    }

    initBodySelector() {
        const bodySelector = document.getElementById('body-selector');
    
        const updateSelectorOptions = () => {
            while (bodySelector.firstChild) {
                bodySelector.removeChild(bodySelector.firstChild);
            }
    
            const defaultOptions = [
                { value: 'none', text: 'None' },
                { value: 'earth', text: 'Earth' },
                { value: 'moon', text: 'Moon' }
            ];
    
            defaultOptions.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.text = option.text;
                bodySelector.appendChild(opt);
            });
    
            this.satellites.forEach((satellite, index) => {
                const opt = document.createElement('option');
                opt.value = `satellite-${index}`;
                opt.text = `Satellite ${index + 1}`;
                bodySelector.appendChild(opt);
            });
        };
    
        updateSelectorOptions();
    
        bodySelector.addEventListener('change', () => {
            const value = bodySelector.value;
            if (value === 'none') {
                this.cameraControls.clearCameraTarget();
            } else if (value === 'earth') {
                this.cameraControls.updateCameraTarget(this.earth);
            } else if (value === 'moon') {
                this.cameraControls.updateCameraTarget(this.moon);
            } else if (value.startsWith('satellite-')) {
                const index = parseInt(value.split('-')[1]);
                if (this.satellites[index]) {
                    this.cameraControls.updateCameraTarget(this.satellites[index]);
                }
            }
        });
    
        // Update the selector options whenever a satellite is added or removed
        document.addEventListener('satelliteAdded', updateSelectorOptions);
        document.addEventListener('satelliteRemoved', updateSelectorOptions);
    }

    animate = (timestamp) => {
        this.stats.begin();

        this.timeUtils.update(timestamp);
        const realDeltaTime = this.timeUtils.getDeltaTime();
        const warpedDeltaTime = realDeltaTime;
        const currentTime = this.timeUtils.getSimulatedTime();

        // Dispatch time update event
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

        // Dispatch satellite added event
        document.dispatchEvent(new CustomEvent('satelliteAdded'));
    }

    handleCreateSatelliteFromOrbitalElements = (data) => {
        console.log('Received createSatelliteFromOrbitalElements event with data:', data);
        const { semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly } = data;
        createSatelliteFromOrbitalElements(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly
        );

        // Dispatch satellite added event
        document.dispatchEvent(new CustomEvent('satelliteAdded'));
    }

    handleCreateSatelliteFromLatLonCircular = (data) => {
        console.log('Received createSatelliteFromLatLonCircular event with data:', data);
        const { latitude, longitude, altitude, azimuth } = data;
        createSatelliteFromLatLonCircular(
            this.scene, this.world, this.earth, this.moon, this.satellites,
            this.vectors, this.guiManager.gui, this.guiManager,
            latitude, longitude, altitude, azimuth
        );

        // Dispatch satellite added event
        document.dispatchEvent(new CustomEvent('satelliteAdded'));
    }

    applyStatsStyle() {
        this.stats.dom.style.cssText = 'position:absolute;bottom:0px;right:0px;';
    }
}

const app = new App();
app.init();
