// app3d.js
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import Stats from 'stats.js';
import { Constants } from './utils/Constants.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/textureManager.js';
import { CameraControls } from './managers/CameraControls.js';
import { defaultSettings } from './components/ui/controls/DisplayOptions.jsx';
import { RadialGrid } from './components/RadialGrid.js';
import {
    createSatelliteFromLatLon,
    createSatelliteFromOrbitalElements,
    createSatelliteFromLatLonCircular
} from './createSatellite.js';
import { Satellite } from './components/Satellite/Satellite.js';

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
        this._satellites = {};
        this.lastTime = performance.now();
        this.animationFrameId = null;
        this.lineOfSightWorker = null;
        this.satelliteConnections = new THREE.Group();
        this._satelliteArray = [];
        this._satelliteConnectionArray = [];
        this._frameCount = 0;
        this._satelliteAddQueue = [];

        // Initialize display settings from defaults
        this.displaySettings = {};
        Object.entries(defaultSettings).forEach(([key, setting]) => {
            this.displaySettings[key] = setting.value;
        });

        // Listen for display settings updates
        document.addEventListener('displaySettingsUpdate', (event) => {
            if (event.detail) {
                Object.entries(event.detail).forEach(([key, value]) => {
                    this.updateDisplaySetting(key, value);
                });
            }
        });

        // Initialize the API for external use
        window.api = {
            createSatellite: async (params) => {
                try {
                    let satellite;
                    switch (params.mode) {
                        case 'latlon':
                            satellite = await this.createSatelliteLatLon(params);
                            break;
                        case 'orbital':
                            satellite = await this.createSatelliteOrbital(params);
                            break;
                        case 'circular':
                            satellite = await this.createSatelliteCircular(params);
                            break;
                        default:
                            throw new Error(`Unknown satellite mode: ${params.mode}`);
                    }

                    if (!satellite) {
                        throw new Error('Failed to create satellite');
                    }

                    // Wait for the satellite to be fully initialized
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // Generate default name if none provided
                    const name = satellite.name || `Satellite ${satellite.id}`;
                    satellite.name = name;

                    // Dispatch an event to trigger state updates
                    const updateEvent = new CustomEvent('satelliteCreated', {
                        detail: {
                            id: satellite.id,
                            name: name,
                            mode: params.mode,
                            params: params
                        }
                    });
                    document.dispatchEvent(updateEvent);

                    // Return only safe JSON data
                    return {
                        id: satellite.id,
                        name: name,
                        mode: params.mode,
                        params: params,
                        success: true
                    };
                } catch (error) {
                    console.error('Error creating satellite:', error);
                    return {
                        success: false,
                        error: error.message
                    };
                }
            },
            getMoonOrbit: async () => {
                // TODO: Implement moon orbit retrieval
                return {
                    success: true,
                    data: {}
                };
            }
        };

        // Add satellites getter/setter
        Object.defineProperty(this, 'satellites', {
            get: function () {
                return this._satellites;
            },
            set: function (value) {
                this._satellites = value;
                this.updateSatelliteList();
            }
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
        const socketServerUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';
        console.log('App3D connecting to socket server:', socketServerUrl);
        this.socket = io(socketServerUrl, {
            reconnectionDelayMax: 10000,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            secure: socketServerUrl.startsWith('https'),
            withCredentials: true
        });

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

            // Add connections group
            this.scene.add(this.satelliteConnections);

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

            // Dispatch scene ready event
            const sceneReadyEvent = new Event('sceneReady');
            this.dispatchEvent(sceneReadyEvent);

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

        this.animationFrameId = requestAnimationFrame(() => this.animate());

        try {
            if (this.stats) {
                this.stats.begin();
            }

            const timestamp = performance.now();
            this.timeUtils.update(timestamp);
            const currentTime = this.timeUtils.getSimulatedTime();
            const realDeltaTime = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;
            const warpedDeltaTime = realDeltaTime * this.timeUtils.timeWarp;

            if (this.controls && typeof this.controls.update === 'function') {
                this.controls.update();
            }

            // --- Reuse arrays for satellites ---
            this._satelliteArray.length = 0;
            for (const sat of Object.values(this._satellites)) {
                this._satelliteArray.push({
                    id: sat.id,
                    position: sat.position,
                    velocity: sat.velocity
                });
            }

            this.updatePhysics(realDeltaTime);
            Object.values(this._satellites).forEach(satellite => {
                if (satellite.updateSatellite) {
                    satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
                }
            });

            this.updateScene(currentTime);
            if (this.cameraControls && typeof this.cameraControls.updateCameraPosition === 'function') {
                this.cameraControls.updateCameraPosition();
            }

            if (this.composers.final) {
                this.composers.final.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }

            if (this.labelRenderer) {
                this.labelRenderer.render(this.scene, this.camera);
            }

            if (this.stats) {
                this.stats.end();
            }
        } catch (error) {
            console.error('Error in animation loop:', error);
        }
    }

    checkPhysicsWorkerNeeded() {
        const satelliteCount = Object.keys(this._satellites).length;
        if (satelliteCount > 0 && !this.physicsWorker) {
            this.initPhysicsWorker();
        } else if (satelliteCount === 0 && this.physicsWorker) {
            this.cleanupPhysicsWorker();
        }
    }

    cleanupPhysicsWorker() {
        if (this.physicsWorker) {
            console.log('Cleaning up physics worker...');
            this.physicsWorker.terminate();
            this.physicsWorker = null;
            this.workerInitialized = false;
        }
    }

    initPhysicsWorker() {
        console.log('Initializing physics worker...');
        this.physicsWorker = new Worker(new URL('./workers/physicsWorker.js', import.meta.url), { type: 'module' });

        this.physicsWorker.onmessage = (event) => {
            const { type, data } = event.data;

            switch (type) {
                case 'satellitesUpdate':
                    // Update all satellites with new positions/velocities
                    data.forEach(update => {
                        const satellite = this._satellites[update.id];
                        if (satellite) {
                            // Convert arrays to THREE.Vector3
                            const position = new THREE.Vector3(update.position[0], update.position[1], update.position[2]);
                            const velocity = new THREE.Vector3(update.velocity[0], update.velocity[1], update.velocity[2]);
                            satellite.updatePosition(position, velocity);
                        }
                    });
                    break;
                case 'satelliteUpdate':
                    // (Legacy, can be removed if not used elsewhere)
                    break;
                case 'satelliteAdded':
                    // Optionally handle confirmation
                    break;
                case 'initialized':
                    console.log('Physics worker initialized successfully');
                    this.workerInitialized = true;
                    // Add any queued satellites
                    if (this._satelliteAddQueue.length > 0) {
                        this._satelliteAddQueue.forEach(sat => this._addSatelliteToWorker(sat));
                        this._satelliteAddQueue = [];
                        console.log('Queued satellites sent to worker after initialization.');
                    }
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
        // REMOVE: Per-frame step message to physics worker
        // if (this.workerInitialized && Object.keys(this._satellites).length > 0 && this.earth && this.moon) {
        //     const satelliteData = {};
        //     Object.entries(this._satellites).forEach(([id, satellite]) => {
        //         satelliteData[id] = {
        //             id: satellite.id,
        //             position: {
        //                 x: satellite.position.x,
        //                 y: satellite.position.y,
        //                 z: satellite.position.z
        //             },
        //             velocity: {
        //                 x: satellite.velocity.x,
        //                 y: satellite.velocity.y,
        //                 z: satellite.velocity.z
        //             },
        //             mass: satellite.mass
        //         };
        //     });
        //
        //     this.physicsWorker.postMessage({
        //         type: 'step',
        //         data: {
        //             realDeltaTime,
        //             timeWarp: this.timeUtils.timeWarp,
        //             satellites: satelliteData,
        //             earthPosition: {
        //                 x: this.earth.earthBody.position.x / (Constants.metersToKm * Constants.scale),
        //                 y: this.earth.earthBody.position.y / (Constants.metersToKm * Constants.scale),
        //                 z: this.earth.earthBody.position.z / (Constants.metersToKm * Constants.scale)
        //             },
        //             earthRadius: Constants.earthRadius,
        //             moonPosition: {
        //                 x: this.moon.moonBody.position.x / (Constants.metersToKm * Constants.scale),
        //                 y: this.moon.moonBody.position.y / (Constants.metersToKm * Constants.scale),
        //                 z: this.moon.moonBody.position.z / (Constants.metersToKm * Constants.scale)
        //             }
        //         }
        //     });
        // }
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

    updateSatelliteConnections(connections) {

        // Clear existing connections
        while (this.satelliteConnections.children.length > 0) {
            const line = this.satelliteConnections.children[0];
            line.geometry.dispose();
            line.material.dispose();
            this.satelliteConnections.remove(line);
        }

        // Create new connections if enabled
        if (this.displaySettings.showSatConnections) {
            connections.forEach(conn => {
                const material = new THREE.LineBasicMaterial({
                    color: conn.color === 'red' ? 0xff0000 : 0x00ff00,
                    opacity: conn.color === 'red' ? 0.8 : 0.5, // Make red lines more visible
                    transparent: true
                });

                const geometry = new THREE.BufferGeometry();
                const vertices = new Float32Array(conn.points.flat());
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

                const line = new THREE.Line(geometry, material);
                this.satelliteConnections.add(line);
            });
        }
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
        // Notify the physics worker of the new timeWarp
        if (this.physicsWorker && this.workerInitialized) {
            this.physicsWorker.postMessage({ type: 'setTimeWarp', data: { value } });
        }
    }

    updateSelectedBody(value) {
        if (this.cameraControls) {
            if (!value || value === 'none') {
                this.cameraControls.clearCameraTarget();
            } else if (value === 'earth') {
                this.cameraControls.updateCameraTarget(this.earth);
            } else if (value === 'moon') {
                this.cameraControls.updateCameraTarget(this.moon);
            } else if (typeof value === 'string' && value.startsWith('satellite-')) {
                const satelliteId = parseInt(value.split('-')[1]);
                const satellite = this._satellites[satelliteId];
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
        if (this.displaySettings[key] !== value) {
            this.displaySettings[key] = value;

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
                    Object.values(this._satellites).forEach(satellite => {
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
                    Object.values(this._satellites).forEach(satellite => {
                        if (satellite.orbitLine) {
                            satellite.orbitLine.visible = value;
                        }
                        if (satellite.apsisVisualizer?.setVisible) {
                            satellite.apsisVisualizer.setVisible(value);
                        }
                    });
                    break;
                case 'showTraces':
                    Object.values(this._satellites).forEach(satellite => {
                        if (satellite.traceLine) {
                            satellite.traceLine.visible = value;
                        }
                    });
                    break;
                case 'showGroundTraces':
                    Object.values(this._satellites).forEach(satellite => {
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
                    if (value) {
                        // Initialize worker when enabled
                        if (!this.lineOfSightWorker) {
                            console.log('Initializing line of sight worker');
                            this.lineOfSightWorker = new Worker(new URL('./workers/lineOfSightWorker.js', import.meta.url), { type: 'module' });
                            this.lineOfSightWorker.onmessage = (e) => {
                                if (e.data.type === 'CONNECTIONS_UPDATED') {
                                    this.updateSatelliteConnections(e.data.connections);
                                }
                            };
                        }
                        // Trigger initial connection update
                        this.lineOfSightWorker.postMessage({
                            type: 'UPDATE_SATELLITES',
                            satellites: Object.values(this._satellites).map(sat => ({
                                id: sat.id,
                                position: sat.position
                            }))
                        });
                    } else {
                        // Clean up worker when disabled
                        if (this.lineOfSightWorker) {
                            this.lineOfSightWorker.terminate();
                            this.lineOfSightWorker = null;
                        }
                        // Clear existing connections
                        while (this.satelliteConnections.children.length > 0) {
                            const line = this.satelliteConnections.children[0];
                            line.geometry.dispose();
                            line.material.dispose();
                            this.satelliteConnections.remove(line);
                        }
                    }
                    break;
            }
        }
    }

    updateSatelliteList() {

        // Create a clean object with only necessary satellite data
        const satelliteData = Object.fromEntries(
            Object.entries(this._satellites)
                .filter(([_, sat]) => sat && sat.id != null && sat.name)
                .map(([id, sat]) => [id, {
                    id: sat.id,
                    name: sat.name
                }])
        );

        // Dispatch an event to notify React components about the satellite list update
        document.dispatchEvent(new CustomEvent('satelliteListUpdated', {
            detail: {
                satellites: satelliteData
            }
        }));

        // Update the window.app3d reference
        if (window.app3d) {
            window.app3d.satellites = this._satellites;
        }
    }

    removeSatellite(satelliteId) {
        const satellite = this._satellites[satelliteId];
        if (satellite) {
            // Store the satellite info before disposal
            const satelliteInfo = {
                id: satellite.id,
                name: satellite.name
            };

            // Dispose of the satellite
            satellite.dispose();
            delete this._satellites[satelliteId];

            // Dispatch satellite deleted event
            document.dispatchEvent(new CustomEvent('satelliteDeleted', {
                detail: satelliteInfo
            }));

            // Update the satellite list
            this.updateSatelliteList();
        }
    }

    // Methods for satellite creation
    async createSatelliteLatLon(params) {
        const satellite = await createSatelliteFromLatLon(this, params);
        this._satellites[satellite.id] = satellite;
        this.checkPhysicsWorkerNeeded();
        this.updateSatelliteList();
        return satellite;
    }

    async createSatelliteOrbital(params) {
        const satellite = await createSatelliteFromOrbitalElements(this, params);
        this._satellites[satellite.id] = satellite;
        this.checkPhysicsWorkerNeeded();
        this.updateSatelliteList();
        return satellite;
    }

    async createSatelliteCircular(params) {
        const satellite = await createSatelliteFromLatLonCircular(this, params);
        this._satellites[satellite.id] = satellite;
        this.checkPhysicsWorkerNeeded();
        this.updateSatelliteList();
        return satellite;
    }

    // Socket event handlers for satellite creation
    setupSatelliteAPI() {
        this.socket.on('createSatelliteFromLatLon', (params) => {
            this.createSatelliteLatLon(params);
        });

        this.socket.on('createSatelliteFromOrbitalElements', (params) => {
            this.createSatelliteOrbital(params);
        });

        this.socket.on('createSatelliteFromLatLonCircular', (params) => {
            this.createSatelliteCircular(params);
        });
    }

    dispose() {
        if (this.lineOfSightWorker) {
            this.lineOfSightWorker.terminate();
            this.lineOfSightWorker = null;
        }
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
            Object.values(this._satellites).forEach(satellite => {
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

    createSatelliteFromState({ name, mass, size, color, position, velocity, id }) {
        console.log('createSatelliteFromState called', { name, mass, size, color, position, velocity, id });
        const satellite = new Satellite({
            scene: this.scene,
            position,
            velocity,
            id,
            color,
            mass,
            size,
            app3d: this,
            name
        });
        // Apply current display settings
        const showOrbits = this.displaySettings.showOrbits;
        const showTraces = this.displaySettings.showTraces;
        const showGroundTraces = this.displaySettings.showGroundTraces;
        const showSatVectors = this.displaySettings.showSatVectors;
        if (satellite.orbitLine) satellite.orbitLine.visible = showOrbits;
        if (satellite.apsisVisualizer) satellite.apsisVisualizer.visible = showOrbits;
        if (satellite.traceLine) satellite.traceLine.visible = showTraces;
        if (satellite.groundTrack) satellite.groundTrack.setVisible(showGroundTraces);
        if (satellite.velocityVector) satellite.velocityVector.visible = showSatVectors;
        if (satellite.orientationVector) satellite.orientationVector.visible = showSatVectors;
        console.log('Satellite instance created:', satellite);
        this._satellites[satellite.id] = satellite;
        console.log('Satellite added to _satellites:', this._satellites);
        this.checkPhysicsWorkerNeeded();
        this.updateSatelliteList();
        // Queue or send to worker
        if (this.physicsWorker && this.workerInitialized) {
            this._addSatelliteToWorker(satellite);
        } else {
            // Queue for later
            this._satelliteAddQueue.push(satellite);
            console.log('Satellite queued for worker:', satellite);
        }
        // Check if mesh is in the scene
        if (this.scene && satellite.mesh && this.scene.children.includes(satellite.mesh)) {
            console.log('Satellite mesh is in the scene.');
        } else {
            console.warn('Satellite mesh is NOT in the scene!');
        }
        return satellite;
    }

    _addSatelliteToWorker(satellite) {
        if (!this.physicsWorker || !this.workerInitialized) return;
        this.physicsWorker.postMessage({
            type: 'addSatellite',
            data: {
                id: satellite.id,
                position: {
                    x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                    y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                    z: satellite.position.z / (Constants.metersToKm * Constants.scale)
                },
                velocity: {
                    x: satellite.velocity.x / (Constants.metersToKm * Constants.scale),
                    y: satellite.velocity.y / (Constants.metersToKm * Constants.scale),
                    z: satellite.velocity.z / (Constants.metersToKm * Constants.scale)
                },
                mass: satellite.mass
            }
        });
        console.log('Satellite sent to worker:', satellite.id);
    }
}

// Ensure this is immediately after the class definition
App3D.prototype.createSatellite = App3D.prototype.createSatelliteFromState;

export default App3D;
