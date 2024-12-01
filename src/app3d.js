// app3d.js
import { io } from 'socket.io-client';
import * as THREE from 'three';
import Stats from 'stats.js';
import { Constants } from './utils/Constants.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { GUIManager } from './managers/GUIManager.js';
import { TextureManager } from './managers/TextureManager.js';
import { CameraControls } from './managers/CameraControls.js';
import { defaultSettings } from './components/ui/controls/DisplayOptions.jsx';

import {
    createSatelliteFromLatLon,
    createSatelliteFromOrbitalElements,
    createSatelliteFromLatLonCircular
} from './createSatellite.js';

import { setupEventListeners, setupSocketListeners } from './setup/setupListeners.js';
import { setupCamera, setupRenderer, setupControls, setupPhysicsWorld, setupSettings } from './setup/setupComponents.js';
import { loadTextures, setupScene, setupPostProcessing } from './setup/setupScene.js';
import { initTimeControls } from './timeControls.js';
import { initializeSatelliteCreationPanel } from './createSatelliteControls.js';
import { initializeBodySelector } from './bodySelectorControls.js';

class App3D {
    constructor() {
        // Make instance available globally
        window.app3d = this;

        // Initialize the Socket.IO client
        this.socket = io('http://localhost:3000');
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('connect_error', (err) => {
            console.error('Error connecting to server:', err.message);
        });

        // Get the canvas element
        this.canvas = document.getElementById('three-canvas');
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }

        // Initialize physics worker
        this.physicsWorker = new Worker(new URL('./workers/physicsWorker.js', import.meta.url), { type: 'module' });
        this.workerInitialized = false;

        // Initialize core components
        this.scene = new THREE.Scene();
        this.timeUtils = new TimeUtils({
            simulatedTime: new Date().toISOString() // Current time as default
        });
        this.textureManager = new TextureManager();
        this.satellites = [];
        this.composers = {};
        this.stats = new Stats();
        
        // Initialize display settings with default values
        this.displaySettings = {};
        Object.entries(defaultSettings).forEach(([key, { value }]) => {
            this.displaySettings[key] = value;
        });

        // Initialize the app
        this.init();
    }

    async init() {
        console.log('Initializing App...');
        
        // Setup basic components
        this.camera = setupCamera();
        this.renderer = setupRenderer(this.canvas);
        this.controls = setupControls(this.camera, this.renderer);
        this.world = setupPhysicsWorld();
        this.settings = setupSettings();
        this.cameraControls = new CameraControls(this.camera, this.controls);

        // Load textures and setup scene
        await loadTextures(this.textureManager);
        setupScene(this);
        setupPostProcessing(this);

        // Initialize interface and controls
        setupEventListeners(this);
        setupSocketListeners(this, this.socket);
        this.setupSatelliteAPI();
        initTimeControls(this.timeUtils);

        // Initialize interface components
        initializeBodySelector(this);
        initializeSatelliteCreationPanel(this);
        this.applyStatsStyle();

        // Initialize physics worker
        this.initializeWorker();

        // Wait a frame to ensure all objects are properly initialized
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Apply initial display settings
        Object.entries(this.displaySettings).forEach(([key, value]) => {
            if (typeof value === 'boolean') {
                this.updateDisplaySetting(key, value);
            }
        });
        
        // Start animation loop
        this.animate();

        // Setup window resize handler
        window.addEventListener('resize', this.onWindowResize);

        // Notify server
        this.socket.emit('threejs-app-started');
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
            this.scene,
            this.world,
            this.earth,
            this.moon,
            this.sun,
            this.satellites,
            this.vectors,
            this.settings,
            this.timeUtils,
            this.cannonDebugger,
            this.physicsWorker,
            this.camera,
            this.controls
        );
    }

    animate = () => {
        try {
            // Request next frame first to ensure smooth animation even if there's an error
            this.animationFrameId = requestAnimationFrame(this.animate);
            
            // Start performance monitoring
            this.stats.begin();

            // Update time with timestamp
            const timestamp = performance.now();
            this.timeUtils.update(timestamp);
            const currentTime = this.timeUtils.getSimulatedTime();
            const realDeltaTime = this.timeUtils.getDeltaTime();
            const warpedDeltaTime = realDeltaTime * this.timeUtils.timeWarp;

            // Single controls update
            if (this.controls) {
                this.controls.update();
            }

            // Update components with error handling
            try {
                this.updatePhysics(warpedDeltaTime);
            } catch (error) {
                console.error('Error in physics update:', error);
            }

            try {
                this.updateSatellites(currentTime, realDeltaTime, warpedDeltaTime);
            } catch (error) {
                console.error('Error in satellite update:', error);
            }

            try {
                this.updateScene(currentTime);
            } catch (error) {
                console.error('Error in scene update:', error);
            }

            try {
                if (this.cameraControls) {
                    this.cameraControls.updateCameraPosition();
                }
            } catch (error) {
                console.error('Error in camera update:', error);
            }

            // Render with error handling
            try {
                if (this.composers.final) {
                    this.composers.bloom.render();
                    this.composers.final.render();
                } else if (this.renderer && this.scene && this.camera) {
                    this.renderer.render(this.scene, this.camera);
                }
            } catch (error) {
                console.error('Error in render:', error);
            }

            // End performance monitoring
            this.stats.end();
        } catch (error) {
            console.error('Critical error in animation loop:', error);
            // Cancel animation frame to prevent infinite error loops
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
        }
    }

    updatePhysics(warpedDeltaTime) {
        // Only send physics updates if we have satellites and the worker is initialized
        if (this.workerInitialized && this.satellites.length > 0 && this.earth && this.moon) {
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
        });
    }

    updateScene(currentTime) {
        if (this.earth) {
            this.earth.updateRotation();
            this.earth.updateLightDirection();
        }
        if (this.sun) this.sun.updatePosition(currentTime);
        if (this.moon) {
            this.moon.updatePosition(currentTime);
            this.moon.updateRotation(currentTime);
        }
        if (this.vectors) this.vectors.updateVectors();
    }

    onWindowResize = () => {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
            
            if (this.composers.bloom && this.composers.final) {
                this.composers.bloom.setSize(window.innerWidth, window.innerHeight);
                this.composers.final.setSize(window.innerWidth, window.innerHeight);
            }
        }
    }

    // Methods for React integration
    updateTimeWarp(value) {
        if (this.timeUtils) {
            this.timeUtils.setTimeWarp(value);
        }
    }

    updateSelectedBody(value) {
        if (this.cameraControls) {
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
        }
    }

    getDisplaySetting(key) {
        return this.displaySettings[key];
    }

    updateDisplaySetting(key, value) {
        if (!(key in this.displaySettings) || typeof value !== 'boolean') return;
        this.displaySettings[key] = value;
        
        // Update visibility based on setting
        switch (key) {
            case 'showGrid':
                const gridHelper = this.scene.getObjectByName('gridHelper');
                if (gridHelper) {
                    gridHelper.visible = value;
                }
                break;
            case 'showVectors':
                if (this.vectors) {
                    this.vectors.setVisible(value);
                }
                break;
            case 'showSatVectors':
                if (this.satellites) {
                    this.satellites.forEach(satellite => {
                        if (satellite.vectors) satellite.vectors.setVisible(value);
                    });
                }
                break;
            case 'showSurfaceLines':
                if (this.earth) {
                    this.earth.setSurfaceLinesVisible(value);
                }
                break;
            case 'showOrbits':
                if (this.satellites) {
                    this.satellites.forEach(satellite => {
                        if (satellite.orbit) satellite.orbit.setVisible(value);
                    });
                }
                break;
            case 'showTraces':
                if (this.satellites) {
                    this.satellites.forEach(satellite => {
                        if (satellite.trace) satellite.trace.setVisible(value);
                    });
                }
                break;
            case 'showGroundTraces':
                if (this.satellites) {
                    this.satellites.forEach(satellite => {
                        if (satellite.groundTrace) satellite.groundTrace.setVisible(value);
                    });
                }
                break;
            case 'showCities':
                if (this.earth) {
                    this.earth.setCitiesVisible(value);
                }
                break;
            case 'showAirports':
                if (this.earth) {
                    this.earth.setAirportsVisible(value);
                }
                break;
            case 'showSpaceports':
                if (this.earth) {
                    this.earth.setSpaceportsVisible(value);
                }
                break;
            case 'showObservatories':
                if (this.earth) {
                    this.earth.setObservatoriesVisible(value);
                }
                break;
            case 'showGroundStations':
                if (this.earth) {
                    this.earth.setGroundStationsVisible(value);
                }
                break;
            case 'showCountryBorders':
                if (this.earth) {
                    this.earth.setCountryBordersVisible(value);
                }
                break;
            case 'showStates':
                if (this.earth) {
                    this.earth.setStatesVisible(value);
                }
                break;
            case 'showMoonOrbit':
                if (this.moon) {
                    this.moon.setOrbitVisible(value);
                }
                break;
            case 'showMoonTraces':
                if (this.moon) {
                    this.moon.setTraceVisible(value);
                }
                break;
            case 'showMoonSurfaceLines':
                if (this.moon) {
                    this.moon.setSurfaceDetailsVisible(value);
                }
                break;
            case 'showSatConnections':
                if (this.satellites) {
                    this.satellites.forEach(satellite => {
                        if (satellite.connections) satellite.connections.setVisible(value);
                    });
                }
                break;
        }
    }

    // Methods for satellite creation
    createSatelliteLatLon(params) {
        createSatelliteFromLatLon(this, params);
    }

    createSatelliteOrbital(params) {
        createSatelliteFromOrbitalElements(this, params);
    }

    createSatelliteCircular(params) {
        createSatelliteFromLatLonCircular(this, params);
    }

    // Socket event handlers for satellite creation
    setupSatelliteAPI() {
        this.socket.on('createSatelliteFromLatLon', (params) => {
            console.log('Received createSatelliteFromLatLon:', params);
            this.createSatelliteLatLon(params);
        });

        this.socket.on('createSatelliteFromOrbitalElements', (params) => {
            console.log('Received createSatelliteFromOrbitalElements:', params);
            this.createSatelliteOrbital(params);
        });

        this.socket.on('createSatelliteFromLatLonCircular', (params) => {
            console.log('Received createSatelliteFromLatLonCircular:', params);
            this.createSatelliteCircular(params);
        });
    }

    dispose() {
        // Cancel any pending animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Remove event listeners
        window.removeEventListener('resize', this.onWindowResize);

        // Clean up Three.js resources
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer.domElement = null;
            this.renderer = null;
        }

        if (this.scene) {
            this.scene.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => {
                            if (material.map) material.map.dispose();
                            if (material.lightMap) material.lightMap.dispose();
                            if (material.bumpMap) material.bumpMap.dispose();
                            if (material.normalMap) material.normalMap.dispose();
                            if (material.specularMap) material.specularMap.dispose();
                            if (material.envMap) material.envMap.dispose();
                            material.dispose();
                        });
                    } else {
                        if (object.material.map) object.material.map.dispose();
                        if (object.material.lightMap) object.material.lightMap.dispose();
                        if (object.material.bumpMap) object.material.bumpMap.dispose();
                        if (object.material.normalMap) object.material.normalMap.dispose();
                        if (object.material.specularMap) object.material.specularMap.dispose();
                        if (object.material.envMap) object.material.envMap.dispose();
                        object.material.dispose();
                    }
                }
            });
            this.scene = null;
        }

        // Clean up composers
        if (this.composers) {
            Object.values(this.composers).forEach(composer => {
                if (composer) {
                    composer.dispose();
                }
            });
            this.composers = {};
        }

        // Clean up physics worker
        if (this.physicsWorker) {
            this.physicsWorker.terminate();
            this.physicsWorker = null;
        }

        // Clean up socket connection
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // Clean up references
        this.camera = null;
        this.controls = null;
        this.earth = null;
        this.moon = null;
        this.sun = null;
        this.satellites = [];
        this.vectors = null;
        this.timeUtils = null;
        this.textureManager = null;
        this.cameraControls = null;

        // Remove stats
        if (this.stats && this.stats.dom && this.stats.dom.parentNode) {
            this.stats.dom.parentNode.removeChild(this.stats.dom);
        }
        this.stats = null;
    }

    applyStatsStyle() {
        this.stats.dom.style.cssText = 'position:absolute;bottom:0px;right:0px;';
        document.body.appendChild(this.stats.dom);
    }
}

export default App3D;
