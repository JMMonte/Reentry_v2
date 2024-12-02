// app3d.js
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import Stats from 'stats.js';
import { Constants } from './utils/Constants.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/TextureManager.js';
import { CameraControls } from './managers/CameraControls.js';
import { defaultSettings } from './components/ui/controls/DisplayOptions.jsx';
import { Satellite } from './components/Satellite/Satellite.js';
import { RadialGrid } from './components/RadialGrid.js';
import {
    createSatelliteFromLatLon,
    createSatelliteFromOrbitalElements,
    createSatelliteFromLatLonCircular
} from './createSatellite.js';

import { setupEventListeners, setupSocketListeners } from './setup/setupListeners.js';
import { setupCamera, setupRenderer, setupControls, setupPhysicsWorld, setupSettings } from './setup/setupComponents.js';
import { loadTextures, setupScene, setupSceneDetails, setupPostProcessing, addEarthPoints } from './setup/setupScene.js';
import { initTimeControls } from './timeControls.js';
import { initializeBodySelector } from './bodySelectorControls.js';

class App3D extends EventTarget {
    constructor() {
        super();
        // Make instance available globally
        console.log('App3D: Initializing...');
        window.app3d = this;

        // Initialize properties
        this.isInitialized = false;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;  // Add CSS2D renderer
        this.controls = null;
        this.composers = {};
        this.satellites = {};
        this.lastTime = performance.now();
        this.animationFrameId = null;

        // Initialize display settings from defaults
        this.displaySettings = {};
        Object.entries(defaultSettings).forEach(([key, setting]) => {
            this.displaySettings[key] = setting.value;
        });

        // Initialize managers
        this.textureManager = new TextureManager();

        // Initialize event listeners
        document.addEventListener('createSatelliteFromLatLon', (event) => {
            const satellite = createSatelliteFromLatLon(this, event.detail);
        });

        document.addEventListener('createSatelliteFromOrbital', (event) => {
            const satellite = createSatelliteFromOrbitalElements(this, event.detail);
        });

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
        this.initPhysicsWorker();

        // Initialize core components
        this.timeUtils = new TimeUtils({
            simulatedTime: new Date().toISOString() // Current time as default
        });
        this.stats = new Stats();
        
        // Initialize the app
        this.init();
    }

    async init() {
        console.log('Initializing App...');
        
        try {
            // Setup camera first
            this.camera = setupCamera();
            if (!this.camera) {
                throw new Error('Failed to initialize camera');
            }
            this.camera.layers.enable(1);  // Enable layer 1 for labels
            
            // Initialize renderer
            this.renderer = setupRenderer(this.canvas);
            if (!this.renderer) {
                throw new Error('Failed to initialize renderer');
            }
            
            // Initialize CSS2D renderer for labels
            this.labelRenderer = new CSS2DRenderer();
            this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
            this.labelRenderer.domElement.style.position = 'absolute';
            this.labelRenderer.domElement.style.top = '0';
            this.labelRenderer.domElement.style.pointerEvents = 'none';  // Disable pointer events on container
            this.labelRenderer.domElement.style.zIndex = '1';  // Ensure labels are above 3D scene
            document.body.appendChild(this.labelRenderer.domElement);
            
            // Create scene and initialize basic components
            this.scene = new THREE.Scene();
            if (!this.scene) {
                throw new Error('Failed to create scene');
            }
            
            // Initialize basic scene components
            this.controls = setupControls(this.camera, this.renderer);
            if (!this.controls) {
                throw new Error('Failed to initialize controls');
            }

            // Initialize camera controls
            this.cameraControls = new CameraControls(this.camera, this.controls);
            if (!this.cameraControls) {
                throw new Error('Failed to initialize camera controls');
            }
            
            this.world = setupPhysicsWorld();
            this.settings = setupSettings();
            await setupScene(this);

            // Load textures
            await loadTextures(this.textureManager);

            // Setup scene details after textures are loaded
            await setupSceneDetails(this);
            await setupPostProcessing(this);

            // Initialize radial grid
            this.radialGrid = new RadialGrid(this.scene);
            this.radialGrid.setVisible(this.displaySettings.showGrid);

            // Apply initial display settings
            const simpleSettings = {};
            Object.entries(defaultSettings).forEach(([key, setting]) => {
                simpleSettings[key] = setting.value;
            });
            Object.entries(simpleSettings).forEach(([key, value]) => {
                this.updateDisplaySetting(key, value);
            });

            // Initialize interface and controls
            setupEventListeners(this);
            setupSocketListeners(this, this.socket);
            this.setupSatelliteAPI();
            
            // Initialize time and body controls
            initTimeControls(this.timeUtils);
            initializeBodySelector(this);

            // Apply stats style
            this.applyStatsStyle();
            
            // Set initialization flag
            this.isInitialized = true;
            
            // Add window resize listener
            window.addEventListener('resize', this.onWindowResize.bind(this));
            this.onWindowResize(); // Initial resize
            
            // Start animation loop
            this.animate();
            
            console.log('App initialization complete');
        } catch (error) {
            console.error('Error during initialization:', error);
            this.dispose();
            throw error;
        }
    }

    animate() {
        if (!this.isInitialized || !this.scene || !this.camera || !this.renderer) {
            console.warn('Essential components not initialized, skipping render');
            return;
        }

        // Request next frame first to ensure smooth animation even if there's an error
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        try {
            if (this.stats) {
                this.stats.begin();
            }
            
            // Update time
            const timestamp = performance.now();
            this.timeUtils.update(timestamp);
            const currentTime = this.timeUtils.getSimulatedTime();
            const realDeltaTime = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;
            const warpedDeltaTime = realDeltaTime * this.timeUtils.timeWarp;

            // Update controls if available
            if (this.controls && typeof this.controls.update === 'function') {
                this.controls.update();
            }

            // Update physics and objects
            this.updatePhysics(realDeltaTime);
            Object.values(this.satellites).forEach(satellite => {
                if (satellite.updateSatellite) {
                    satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
                }
            });
            
            // Update scene and camera
            this.updateScene(currentTime);
            if (this.cameraControls && typeof this.cameraControls.updateCameraPosition === 'function') {
                this.cameraControls.updateCameraPosition();
            }

            // Render the scene
            if (this.composers.final) {
                this.composers.final.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }

            // Render labels
            if (this.labelRenderer) {
                this.labelRenderer.render(this.scene, this.camera);
            }

            if (this.stats) {
                this.stats.end();
            }
        } catch (error) {
            console.error('Error in animation loop:', error);
            // Don't rethrow to keep animation going
        }
    }

    initPhysicsWorker() {
        console.log('Initializing physics worker...');
        this.physicsWorker = new Worker(new URL('./workers/physicsWorker.js', import.meta.url), { type: 'module' });
        
        this.physicsWorker.onmessage = (event) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'satelliteUpdate':
                    const satellite = this.satellites[data.id];
                    if (satellite) {
                        satellite.updateBuffer.push(data);
                    }
                    break;
                case 'initialized':
                    console.log('Physics worker initialized successfully');
                    this.workerInitialized = true;
                    break;
                case 'error':
                    console.error('Physics worker error:', data);
                    break;
            }
        };

        // Initialize the physics worker
        this.physicsWorker.postMessage({
            type: 'init',
            data: {
                earthMass: Constants.earthMass,
                moonMass: Constants.moonMass,
                G: Constants.G,
                scale: Constants.scale
            }
        });
    }

    updatePhysics(realDeltaTime) {
        // Only send physics updates if we have satellites and the worker is initialized
        if (this.workerInitialized && Object.keys(this.satellites).length > 0 && this.earth && this.moon) {
            const satelliteData = {};
            Object.entries(this.satellites).forEach(([id, satellite]) => {
                satelliteData[id] = {
                    id: satellite.id,
                    position: {
                        x: satellite.position.x,
                        y: satellite.position.y,
                        z: satellite.position.z
                    },
                    velocity: {
                        x: satellite.velocity.x,
                        y: satellite.velocity.y,
                        z: satellite.velocity.z
                    },
                    mass: satellite.mass
                };
            });
            
            this.physicsWorker.postMessage({
                type: 'step',
                data: {
                    realDeltaTime,
                    timeWarp: this.timeUtils.timeWarp,
                    satellites: satelliteData,
                    earthPosition: {
                        x: this.earth.earthBody.position.x / (Constants.metersToKm * Constants.scale),
                        y: this.earth.earthBody.position.y / (Constants.metersToKm * Constants.scale),
                        z: this.earth.earthBody.position.z / (Constants.metersToKm * Constants.scale)
                    },
                    earthRadius: Constants.earthRadius,
                    moonPosition: {
                        x: this.moon.moonBody.position.x / (Constants.metersToKm * Constants.scale),
                        y: this.moon.moonBody.position.y / (Constants.metersToKm * Constants.scale),
                        z: this.moon.moonBody.position.z / (Constants.metersToKm * Constants.scale)
                    }
                }
            });
        }
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

            if (this.labelRenderer) {
                this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
            }
        }
    }

    onDocumentClick(event) {
        // Empty function - kept for potential future use
    }

    onDocumentMouseMove(event) {
        // Empty function - kept for potential future use
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
                const satelliteId = parseInt(value.split('-')[1]);
                const satellite = this.satellites[satelliteId];
                if (satellite) {
                    this.cameraControls.updateCameraTarget(satellite);
                }
            }
        }
    }

    getDisplaySetting(key) {
        return this.displaySettings[key];
    }

    updateDisplaySetting(key, value) {
        if (this.displaySettings.hasOwnProperty(key)) {
            this.displaySettings[key] = value;
            
            // Update visibility based on the setting
            switch (key) {
                case 'ambientLight':
                    const ambientLight = this.scene?.getObjectByName('ambientLight');
                    if (ambientLight) {
                        ambientLight.intensity = value;
                    }
                    break;
                case 'showGrid':
                    if (this.radialGrid) {
                        this.radialGrid.setVisible(value);
                    }
                    break;
                case 'showVectors':
                    if (this.vectors) {
                        this.vectors.setVisible(value);
                    }
                    break;
                case 'showSatVectors':
                    Object.values(this.satellites).forEach(satellite => {
                        if (satellite.setVectorsVisible) {
                            satellite.setVectorsVisible(value);
                        }
                    });
                    break;
                case 'showSurfaceLines':
                    if (this.earth?.setSurfaceLinesVisible) {
                        this.earth.setSurfaceLinesVisible(value);
                    }
                    break;
                case 'showOrbits':
                    Object.values(this.satellites).forEach(satellite => {
                        if (satellite.orbitLine) {
                            satellite.orbitLine.visible = value;
                        }
                        if (satellite.apsisVisualizer?.setVisible) {
                            satellite.apsisVisualizer.setVisible(value);
                        }
                    });
                    break;
                case 'showTraces':
                    Object.values(this.satellites).forEach(satellite => {
                        if (satellite.traceLine) {
                            satellite.traceLine.visible = value;
                        }
                    });
                    break;
                case 'showGroundTraces':
                    Object.values(this.satellites).forEach(satellite => {
                        if (satellite.groundTrack?.setVisible) {
                            satellite.groundTrack.setVisible(value);
                        }
                    });
                    break;
                case 'showCities':
                    if (this.earth?.setCitiesVisible) {
                        this.earth.setCitiesVisible(value);
                    }
                    break;
                case 'showAirports':
                    if (this.earth?.setAirportsVisible) {
                        this.earth.setAirportsVisible(value);
                    }
                    break;
                case 'showSpaceports':
                    if (this.earth?.setSpaceportsVisible) {
                        this.earth.setSpaceportsVisible(value);
                    }
                    break;
                case 'showObservatories':
                    if (this.earth?.setObservatoriesVisible) {
                        this.earth.setObservatoriesVisible(value);
                    }
                    break;
                case 'showGroundStations':
                    if (this.earth?.setGroundStationsVisible) {
                        this.earth.setGroundStationsVisible(value);
                    }
                    break;
                case 'showCountryBorders':
                    if (this.earth?.setCountryBordersVisible) {
                        this.earth.setCountryBordersVisible(value);
                    }
                    break;
                case 'showStates':
                    if (this.earth?.setStatesVisible) {
                        this.earth.setStatesVisible(value);
                    }
                    break;
                case 'showMoonOrbit':
                    if (this.moon?.setOrbitVisible) {
                        this.moon.setOrbitVisible(value);
                    }
                    break;
                case 'showMoonTraces':
                    if (this.moon?.setTraceVisible) {
                        this.moon.setTraceVisible(value);
                    }
                    break;
                case 'showMoonSurfaceLines':
                    if (this.moon?.setSurfaceDetailsVisible) {
                        this.moon.setSurfaceDetailsVisible(value);
                    }
                    break;
                case 'showSatConnections':
                    Object.values(this.satellites).forEach(satellite => {
                        if (satellite.connections?.setVisible) {
                            satellite.connections.setVisible(value);
                        }
                    });
                    break;
            }
        }
    }

    // Methods for satellite creation
    createSatelliteLatLon(params) {
        const satellite = createSatelliteFromLatLon(this, params);
        this.satellites[satellite.id] = satellite;
        this.dispatchEvent(new Event('satellitesChanged'));
        return satellite;
    }

    createSatelliteOrbital(params) {
        const satellite = createSatelliteFromOrbitalElements(this, params);
        this.satellites[satellite.id] = satellite;
        this.dispatchEvent(new Event('satellitesChanged'));
        return satellite;
    }

    createSatelliteCircular(params) {
        const satellite = createSatelliteFromLatLonCircular(this, params);
        this.satellites[satellite.id] = satellite;
        this.dispatchEvent(new Event('satellitesChanged'));
        return satellite;
    }

    removeSatellite(satelliteId) {
        if (!this.satellites[satelliteId]) return;

        // If this satellite is the current camera target, switch to none
        if (this.cameraControls?.target === this.satellites[satelliteId]) {
            this.updateSelectedBody('none');
            document.dispatchEvent(new CustomEvent('bodySelected', {
                detail: { body: 'none' }
            }));
        }

        // Remove the satellite
        this.satellites[satelliteId].dispose();
        delete this.satellites[satelliteId];
        
        // Update the satellite list in the navbar
        this.updateSatelliteList();
    }

    updateSatelliteList() {
        const satellites = Object.values(this.satellites).map(satellite => ({
            value: `satellite-${satellite.id}`,
            text: satellite.name || `Satellite ${satellite.id}`
        }));
        document.dispatchEvent(new CustomEvent('updateBodyOptions', {
            detail: { satellites }
        }));
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
        console.log('Disposing App3D...');
        this.isInitialized = false;

        try {
            // Stop animation loop
            cancelAnimationFrame(this.animationFrameId);

            // Dispose of composers
            if (this.composers) {
                Object.values(this.composers).forEach(composer => {
                    if (composer && composer.dispose) {
                        composer.dispose();
                    }
                });
            }

            // Dispose of scene objects
            if (this.scene) {
                this.scene.traverse((object) => {
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => {
                                if (material.dispose) material.dispose();
                            });
                        } else if (object.material.dispose) {
                            object.material.dispose();
                        }
                    }
                    if (object.geometry && object.geometry.dispose) {
                        object.geometry.dispose();
                    }
                });
            }

            // Dispose of controls
            if (this.controls && this.controls.dispose) {
                this.controls.dispose();
            }

            // Clean up satellites
            Object.values(this.satellites).forEach(satellite => {
                if (satellite.dispose) {
                    satellite.dispose();
                }
            });

            // Clean up renderer
            if (this.renderer) {
                this.renderer.dispose();
                this.renderer.forceContextLoss();
                this.renderer = null;
            }

            // Clean up other resources
            if (this.physicsWorker) {
                this.physicsWorker.terminate();
            }
            if (this.socket) {
                this.socket.close();
            }

            window.app3d = null;
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    applyStatsStyle() {
        if (this.stats && this.stats.dom) {
            this.stats.dom.style.cssText = 'position:fixed;bottom:16px;right:16px;cursor:pointer;opacity:0.9;z-index:10000;';
            document.body.appendChild(this.stats.dom);
        }
    }
}

export default App3D;
