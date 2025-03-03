// App3D.js
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import Stats from 'stats.js';

import { Constants } from './utils/Constants.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/TextureManager.js';
import { CameraControls } from './managers/CameraControls.js';
import { defaultSettings } from './components/ui/controls/DisplayOptions.jsx';
import { RadialGrid } from './components/RadialGrid.js';

import {
    createSatellite,
    createSatelliteFromLatLon,
    createSatelliteFromOrbitalElements,
    createSatelliteInCircularOrbit
} from './utils/CreateSatellite.js';

import {
    setupEventListeners,
    setupSocketListeners
} from './setup/SetupListeners.js';
import {
    setupCamera,
    setupRenderer,
    setupControls,
    setupPhysicsWorld,
    setupSettings
} from './setup/SetupComponents.js';
import {
    loadTextures,
    setupScene,
    setupSceneDetails,
    setupPostProcessing
} from './setup/SetupScene.js';
import { initTimeControls } from './utils/TimeControls.js';
import { initializeBodySelector } from './utils/BodySelectorControls.js';

/**
 * Main 3D application class responsible for setting up THREE.js scene,
 * physics workers, user interactions, and real-time data handling.
 */
class App3D extends EventTarget {
    constructor() {
        super();
        console.log('App3D: Initializing...');
        window.app3d = this; // Make instance globally available if needed

        // Core flags and placeholders
        this.isInitialized = false;
        this.animationFrameId = null;
        this.workerInitialized = false;
        this.lastTime = performance.now();

        // THREE.js scene elements
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null; // CSS2D renderer for labels
        this.controls = null;
        this.composers = {};
        this.stats = new Stats();
        this.satelliteConnections = new THREE.Group();

        // Physics worker references
        this.physicsWorker = null;
        this.lineOfSightWorker = null;

        // Core application data
        this._satellites = {};
        this.displaySettings = {};

        // Populate display settings from defaults
        this._initializeDisplaySettings();

        // Event: handle displaySettingsUpdate from UI
        document.addEventListener('displaySettingsUpdate', (event) => {
            if (event.detail) {
                Object.entries(event.detail).forEach(([key, value]) => {
                    this.updateDisplaySetting(key, value);
                });
            }
        });

        // Provide external API on window
        this._exposeSatelliteAPI();

        // Setup property intercept for satellites
        Object.defineProperty(this, 'satellites', {
            get: () => this._satellites,
            set: (value) => {
                this._satellites = value;
                this.updateSatelliteList();
            }
        });

        // Initialize managers
        this.textureManager = new TextureManager();

        // Initialize local event listeners for satellite creation
        document.addEventListener('createSatelliteFromLatLon', (event) => {
            createSatelliteFromLatLon(this, event.detail);
        });
        document.addEventListener('createSatelliteFromOrbital', (event) => {
            createSatelliteFromOrbitalElements(this, event.detail);
        });

        // Initialize Socket.IO client
        this._initializeSocket();

        // Get the canvas element
        this.canvas = document.getElementById('three-canvas');
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }

        // Initialize time utilities
        this.timeUtils = new TimeUtils({
            simulatedTime: new Date().toISOString() // default: current time
        });

        // Start the core initialization process
        this.init();
    }

    /**
     * Performs the main initialization steps for the 3D application:
     *  - camera, renderer, scene setup
     *  - controls & event listeners
     *  - post-processing, radial grid, background assets
     *  - animation loop
     */
    async init() {
        console.log('Initializing App3D...');
        try {
            // Setup fundamental scene components
            this._initCamera();
            this._initRenderer();
            this._initLabelRenderer();
            this._initScene();

            // Additional scene extras and post-processing
            await this._initControlsAndSceneDetails();

            // Initialize user interface and external events
            this._initUIandEvents();

            // Mark as initialized and start rendering
            this.isInitialized = true;
            this.onWindowResize();
            window.addEventListener('resize', this.onWindowResize.bind(this));
            this.animate();

            // Notify listeners that scene is ready
            const sceneReadyEvent = new Event('sceneReady');
            this.dispatchEvent(sceneReadyEvent);

            console.log('App3D initialization complete');
        } catch (error) {
            console.error('Error during initialization:', error);
            this.dispose();
            throw error;
        }
    }

    /**
     * Continuously updates & renders the scene. Runs on the browser's animation frames.
     */
    animate() {
        if (!this.isInitialized || !this.scene || !this.camera || !this.renderer) {
            console.warn('Essential components not initialized; skipping render');
            return;
        }

        // Request the next frame at the start (better for consistency)
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        try {
            if (this.stats) this.stats.begin();

            const timestamp = performance.now();
            const realDeltaTime = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;

            // Update time warp system
            this.timeUtils.update(timestamp);
            const currentTime = this.timeUtils.getSimulatedTime();
            const warpedDeltaTime = realDeltaTime * this.timeUtils.timeWarp;

            // Update camera controls
            if (this.controls && typeof this.controls.update === 'function') {
                this.controls.update();
            }

            // Update camera tracking for selected body
            if (this.cameraControls) {
                this.cameraControls.updateCameraPosition();
            }

            // Step physics & line of sight checks
            this._updatePhysics(realDeltaTime);
            this._updateLineOfSight();

            // Update satellites and other planetary bodies
            this._updateSatellites(currentTime, realDeltaTime, warpedDeltaTime);
            this._updateScene(currentTime);

            // Render the scene
            if (this.composers.final) {
                // If a final composer is present, it means post-processing is in effect
                this.composers.final.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }

            // Render labels
            if (this.labelRenderer) {
                this.labelRenderer.render(this.scene, this.camera);
            }

            if (this.stats) this.stats.end();

        } catch (error) {
            console.error('Error in animation loop:', error);
            // We swallow the error to keep the animation loop going;
            // remove the try/catch if you prefer letting the app crash in dev mode.
        }
    }

    /**
     * Disposes of all allocated resources and stops the rendering loop.
     */
    dispose() {
        console.log('Disposing App3D...');
        this.isInitialized = false;

        try {
            // Stop animation
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }

            // Dispose composers
            if (this.composers) {
                Object.values(this.composers).forEach((composer) => {
                    if (composer?.dispose) {
                        composer.dispose();
                    }
                });
            }

            // Dispose scene objects
            if (this.scene) {
                this.scene.traverse((object) => {
                    if (object.material) {
                        // In case of multi-material objects
                        if (Array.isArray(object.material)) {
                            object.material.forEach((mat) => mat.dispose && mat.dispose());
                        } else {
                            object.material.dispose && object.material.dispose();
                        }
                    }
                    if (object.geometry?.dispose) {
                        object.geometry.dispose();
                    }
                });
            }

            // Dispose controls
            if (this.controls?.dispose) {
                this.controls.dispose();
            }

            // Dispose satellites
            Object.values(this._satellites).forEach((sat) => {
                if (sat.dispose) sat.dispose();
            });

            // Dispose renderer
            if (this.renderer) {
                this.renderer.dispose();
                if (this.renderer.forceContextLoss) {
                    this.renderer.forceContextLoss();
                }
            }

            // Terminate workers
            if (this.physicsWorker) {
                this.physicsWorker.terminate();
            }
            if (this.lineOfSightWorker) {
                this.lineOfSightWorker.terminate();
            }

            // Close socket
            if (this.socket) {
                this.socket.close();
            }

            // Remove global reference
            window.app3d = null;
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    /**
     * Initializes camera settings and layers.
     */
    _initCamera() {
        this.camera = setupCamera();
        if (!this.camera) {
            throw new Error('Failed to initialize camera');
        }
        // Enable additional layers if needed
        this.camera.layers.enable(1); // layer 1 for labels
    }

    /**
     * Initializes the WebGL renderer.
     */
    _initRenderer() {
        this.renderer = setupRenderer(this.canvas);
        if (!this.renderer) {
            throw new Error('Failed to initialize renderer');
        }
    }

    /**
     * Initializes the CSS2D renderer (used for 2D labels in 3D scene).
     */
    _initLabelRenderer() {
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        const labelDom = this.labelRenderer.domElement;
        labelDom.style.position = 'absolute';
        labelDom.style.top = '0';
        labelDom.style.pointerEvents = 'none';
        labelDom.style.zIndex = '1';
        document.body.appendChild(labelDom);
    }

    /**
     * Creates the main scene and configures the underlying physics world (if needed).
     */
    _initScene() {
        this.scene = new THREE.Scene();
        if (!this.scene) {
            throw new Error('Failed to create scene');
        }
        this.world = setupPhysicsWorld();
        this.settings = setupSettings();
        this.scene.add(this.satelliteConnections);
    }

    /**
     * Loads textures, sets up post-processing, radial grid, etc.
     */
    async _initControlsAndSceneDetails() {
        this.controls = setupControls(this.camera, this.renderer);
        if (!this.controls) {
            throw new Error('Failed to initialize controls');
        }

        // Additional camera controls wrapper
        this.cameraControls = new CameraControls(this.camera, this.controls);
        if (!this.cameraControls) {
            throw new Error('Failed to initialize camera controls');
        }

        // Load scene
        await setupScene(this);

        // Load textures
        await loadTextures(this.textureManager);

        // Scene details and post-processing pipeline
        await setupSceneDetails(this);
        await setupPostProcessing(this);

        // Radial Grid
        this.radialGrid = new RadialGrid(this.scene);
        this.radialGrid.setVisible(this.displaySettings.showGrid);
    }

    /**
     * Sets up user interface interactions, event listeners, time controls, and body selector UI.
     */
    _initUIandEvents() {
        setupEventListeners(this);
        setupSocketListeners(this, this.socket);
        this._setupSatelliteAPI();

        // Initialize time controls
        initTimeControls(this.timeUtils);

        // Initialize body selection (Earth, Moon, or satellites)
        initializeBodySelector(this);

        // Style stats UI
        this._applyStatsStyle();
    }

    /**
     * Checks for changes in the number of satellites to decide if the physics worker is needed.
     */
    _checkPhysicsWorkerNeeded() {
        const satelliteCount = Object.keys(this._satellites).length;
        if (satelliteCount > 0 && !this.physicsWorker) {
            this._initPhysicsWorker();
        } else if (satelliteCount === 0 && this.physicsWorker) {
            this._cleanupPhysicsWorker();
        }
    }

    /**
     * Initializes the physics worker for advanced orbital calculations, if not already set up.
     */
    _initPhysicsWorker() {
        console.log('Initializing physics worker...');
        this.physicsWorker = new Worker(
            new URL('./workers/physicsWorker.js', import.meta.url),
            { type: 'module' }
        );

        this.physicsWorker.onmessage = (event) => {
            const { type, data } = event.data;
            switch (type) {
                case 'satelliteUpdate': {
                    const sat = this._satellites[data.id];
                    if (sat) {
                        sat.updateBuffer.push(data);
                    }
                    break;
                }
                case 'initialized':
                    console.log('Physics worker initialized successfully');
                    this.workerInitialized = true;
                    break;
                case 'error':
                    console.error('Physics worker error:', data);
                    break;
                default:
                    break;
            }
        };

        // Send initialization data
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

    /**
     * Cleans up the physics worker when no satellites are present.
     */
    _cleanupPhysicsWorker() {
        console.log('Cleaning up physics worker...');
        if (this.physicsWorker) {
            this.physicsWorker.terminate();
            this.physicsWorker = null;
            this.workerInitialized = false;
        }
    }

    /**
     * Sends updated satellite positions to the physics worker and processes returned positions.
     */
    _updatePhysics(realDeltaTime) {
        if (!this.workerInitialized || Object.keys(this._satellites).length === 0) {
            return;
        }
        if (!this.earth || !this.moon) {
            return;
        }

        // Collect data for the worker
        const satelliteData = {};
        for (const [id, sat] of Object.entries(this._satellites)) {
            satelliteData[id] = {
                id: sat.id,
                position: { x: sat.position.x, y: sat.position.y, z: sat.position.z },
                velocity: { x: sat.velocity.x, y: sat.velocity.y, z: sat.velocity.z },
                mass: sat.mass
            };
        }

        // Post to physics worker
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

    /**
     * If showSatConnections is enabled, updates the satellite line-of-sight worker.
     */
    _updateLineOfSight() {
        if (
            this.displaySettings.showSatConnections &&
            this.lineOfSightWorker &&
            Object.keys(this._satellites).length > 0
        ) {
            this.lineOfSightWorker.postMessage({
                type: 'UPDATE_SATELLITES',
                satellites: Object.values(this._satellites).map((sat) => ({
                    id: sat.id,
                    position: sat.position
                }))
            });
        }
    }

    /**
     * Updates each satellite's logic, including ephemeral states like position or orientation.
     */
    _updateSatellites(currentTime, realDeltaTime, warpedDeltaTime) {
        Object.values(this._satellites).forEach((satellite) => {
            if (satellite.updateSatellite) {
                satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            }
        });
    }

    /**
     * Updates planet (Earth, Moon, etc.) rotation/orbit, sun position, etc.
     */
    _updateScene(currentTime) {
        if (this.earth) {
            this.earth.updateRotation();
            this.earth.updateLightDirection();
        }
        if (this.sun) {
            this.sun.updatePosition(currentTime);
        }
        if (this.moon) {
            this.moon.updatePosition(currentTime);
            this.moon.updateRotation(currentTime);
        }
        if (this.vectors) {
            this.vectors.updateVectors();
        }
    }

    /**
     * Removes existing lines and creates new lines for satellite connections.
     * Called by line-of-sight worker once it recalculates connections.
     */
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
            connections.forEach((conn) => {
                const colorVal = conn.color === 'red' ? 0xff0000 : 0x00ff00;
                const opacityVal = conn.color === 'red' ? 0.8 : 0.5;
                const material = new THREE.LineBasicMaterial({
                    color: colorVal,
                    opacity: opacityVal,
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

    /**
     * Responsive window resize handling.
     */
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
    };

    /**
     * Handle time warp changes from UI or external calls.
     */
    updateTimeWarp(value) {
        if (this.timeUtils) {
            this.timeUtils.setTimeWarp(value);
        }
    }

    /**
     * Updates the 'tracking target' for the camera based on user selection (Earth, Moon, or a satellite).
     */
    updateSelectedBody(value) {
        if (!this.cameraControls) return;

        if (!value || value === 'none') {
            this.cameraControls.clearCameraTarget();
        } else if (value === 'earth') {
            this.cameraControls.updateCameraTarget(this.earth);
        } else if (value === 'moon') {
            this.cameraControls.updateCameraTarget(this.moon);
        } else if (typeof value === 'string' && value.startsWith('satellite-')) {
            const satelliteId = parseInt(value.split('-')[1], 10);
            const sat = this._satellites[satelliteId];
            if (sat) {
                this.cameraControls.updateCameraTarget(sat);
            }
        }
    }

    /**
     * Gets a display setting (e.g., "showGrid") from the internal map.
     */
    getDisplaySetting(key) {
        return this.displaySettings[key];
    }

    /**
     * Updates a display setting and performs any side-effects (e.g., toggling grid, updating materials).
     */
    updateDisplaySetting(key, value) {
        if (this.displaySettings[key] === value) return; // No change

        this.displaySettings[key] = value;

        // Dispatch event to notify components that a display setting has changed
        this.dispatchEvent(new CustomEvent('displaySettingChanged', {
            detail: { key, value }
        }));

        switch (key) {
            case 'ambientLight': {
                const ambientLight = this.scene?.getObjectByName('ambientLight');
                if (ambientLight) {
                    ambientLight.intensity = value;
                }
                break;
            }
            case 'showGrid': {
                if (this.radialGrid) {
                    this.radialGrid.setVisible(value);
                }
                break;
            }
            case 'showVectors': {
                if (this.vectors) {
                    this.vectors.setVisible(value);
                }
                break;
            }
            case 'showSatVectors': {
                Object.values(this._satellites).forEach((sat) => {
                    if (sat.setVectorsVisible) sat.setVectorsVisible(value);
                });
                break;
            }
            case 'showSurfaceLines': {
                if (this.earth?.setSurfaceLinesVisible) {
                    this.earth.setSurfaceLinesVisible(value);
                }
                break;
            }
            case 'showOrbits': {
                Object.values(this._satellites).forEach((sat) => {
                    if (sat.orbit && sat.orbit.orbitLine) sat.orbit.orbitLine.visible = value && sat.visuals.mesh.visible;
                    if (sat.orbit && sat.orbit.apsisVisualizer && sat.orbit.apsisVisualizer.setVisible) {
                        sat.orbit.apsisVisualizer.setVisible(value && sat.visuals.mesh.visible);
                    }
                });
                break;
            }
            case 'showTraces': {
                Object.values(this._satellites).forEach((sat) => {
                    if (sat.visuals && sat.visuals.traceLine) sat.visuals.traceLine.visible = value && sat.visuals.mesh.visible;
                });
                break;
            }
            case 'showGroundTraces': {
                Object.values(this._satellites).forEach((sat) => {
                    if (sat.orbit && sat.orbit.groundTrack) {
                        sat.orbit.groundTrack.setVisible(value);
                    }
                });
                break;
            }
            case 'showCities': {
                if (this.earth?.setCitiesVisible) {
                    this.earth.setCitiesVisible(value);
                }
                break;
            }
            case 'showAirports': {
                if (this.earth?.setAirportsVisible) {
                    this.earth.setAirportsVisible(value);
                }
                break;
            }
            case 'showSpaceports': {
                if (this.earth?.setSpaceportsVisible) {
                    this.earth.setSpaceportsVisible(value);
                }
                break;
            }
            case 'showObservatories': {
                if (this.earth?.setObservatoriesVisible) {
                    this.earth.setObservatoriesVisible(value);
                }
                break;
            }
            case 'showGroundStations': {
                if (this.earth?.setGroundStationsVisible) {
                    this.earth.setGroundStationsVisible(value);
                }
                break;
            }
            case 'showCountryBorders': {
                if (this.earth?.setCountryBordersVisible) {
                    this.earth.setCountryBordersVisible(value);
                }
                break;
            }
            case 'showStates': {
                if (this.earth?.setStatesVisible) {
                    this.earth.setStatesVisible(value);
                }
                break;
            }
            case 'showMoonOrbit': {
                if (this.moon?.setOrbitVisible) {
                    this.moon.setOrbitVisible(value);
                }
                break;
            }
            case 'showMoonTraces': {
                if (this.moon?.setTraceVisible) {
                    this.moon.setTraceVisible(value);
                }
                break;
            }
            case 'showMoonSurfaceLines': {
                if (this.moon?.setSurfaceDetailsVisible) {
                    this.moon.setSurfaceDetailsVisible(value);
                }
                break;
            }
            case 'showSatConnections': {
                this._handleSatConnectionsToggle(value);
                break;
            }
            default:
                break;
        }
    }

    /**
     * Updates the satellite list data structure and dispatches an event to the UI with the new data.
     */
    updateSatelliteList() {
        const satelliteData = Object.fromEntries(
            Object.entries(this._satellites)
                .filter(([, sat]) => sat && sat.id != null && sat.name)
                .map(([id, sat]) => [
                    id,
                    { id: sat.id, name: sat.name }
                ])
        );

        document.dispatchEvent(
            new CustomEvent('satelliteListUpdated', { detail: { satellites: satelliteData } })
        );

        // Keep the global reference in sync
        if (window.app3d) {
            window.app3d.satellites = this._satellites;
        }
    }

    /**
     * Removes a satellite by ID and disposes its assets.
     */
    removeSatellite(satelliteId) {
        const satellite = this._satellites[satelliteId];
        if (!satellite) return;

        // Keep info for deletion event
        const satelliteInfo = { id: satellite.id, name: satellite.name };
        satellite.dispose();
        delete this._satellites[satelliteId];

        document.dispatchEvent(
            new CustomEvent('satelliteDeleted', { detail: satelliteInfo })
        );
        this.updateSatelliteList();
    }

    /**
     * Creates a satellite from lat/lon parameters.
     */
    async createSatelliteLatLon(params) {
        const sat = await createSatelliteFromLatLon(this, params);
        this._satellites[sat.id] = sat;
        this._checkPhysicsWorkerNeeded();
        this.updateSatelliteList();
        return sat;
    }

    /**
     * Creates a satellite from orbital elements.
     */
    async createSatelliteOrbital(params) {
        const sat = await createSatelliteFromOrbitalElements(this, params);
        this._satellites[sat.id] = sat;
        this._checkPhysicsWorkerNeeded();
        this.updateSatelliteList();
        return sat;
    }

    /**
     * Creates a satellite in a circular orbit around Earth, with altitude/inclination set via params.
     */
    async createSatelliteCircular(params) {
        const altitude = Math.max(160, Number(params.altitude) || 500); // min safe orbital alt ~160km
        const sat = await createSatelliteInCircularOrbit(this, {
            altitude,
            inclination: Number(params.inclination) || 0,
            longitudeOfAscendingNode: Number(params.longitudeOfAscendingNode) || 0,
            argumentOfPeriapsis: Number(params.argumentOfPeriapsis) || 0,
            trueAnomaly: Number(params.trueAnomaly) || 0,
            mass: Number(params.mass) || 100,
            size: Number(params.size) || 1,
            name: params.name || `Satellite at ${altitude}km`
        });

        this._satellites[sat.id] = sat;
        this._checkPhysicsWorkerNeeded();
        this.updateSatelliteList();
        return sat;
    }

    /**
     * Internal initialization for the client Socket.IO connection.
     */
    _initializeSocket() {
        const serverUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';
        console.log('App3D connecting to socket server:', serverUrl);
        this.socket = io(serverUrl);

        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('connect_error', (err) => {
            console.error('Error connecting to server:', err.message);
        });
    }

    /**
     * Exposes a globally accessible satellite creation API at window.api (for external scripts or debug).
     */
    _exposeSatelliteAPI() {
        window.api = {
            createSatellite: async (params) => {
                try {
                    let sat;
                    switch (params.mode) {
                        case 'latlon':
                            sat = await this.createSatelliteLatLon(params);
                            break;
                        case 'orbital':
                            sat = await this.createSatelliteOrbital(params);
                            break;
                        case 'circular':
                            sat = await this.createSatelliteCircular(params);
                            break;
                        default:
                            throw new Error(`Unknown satellite mode: ${params.mode}`);
                    }

                    if (!sat) throw new Error('Failed to create satellite');
                    await new Promise((resolve) => setTimeout(resolve, 100));

                    // Generate default name if none provided
                    const name = sat.name || `Satellite ${sat.id}`;
                    sat.name = name;

                    // Dispatch event for state updates
                    document.dispatchEvent(
                        new CustomEvent('satelliteCreated', {
                            detail: {
                                id: sat.id,
                                name: sat.name,
                            },
                        })
                    );

                    return sat.id;
                } catch (error) {
                    console.error('Error creating satellite:', error);
                    throw error;
                }
            },
            removeSatellite: (id) => this.removeSatellite(id),
            getDisplaySetting: (key) => this.getDisplaySetting(key),
            updateDisplaySetting: (key, value) => this.updateDisplaySetting(key, value),
            updateSelectedBody: (value) => this.updateSelectedBody(value),
            updateTimeWarp: (value) => this.updateTimeWarp(value),
            // Add save and load methods
            saveSimulationState: () => this.saveSimulationState(),
            loadSimulationState: async (fileOrData) => await this.loadSimulationState(fileOrData)
        };

        // Expose the API to the web worker
        if (this.physicsWorker) {
            this.physicsWorker.api = window.api;
        }
    }

    /**
     * Socket-based satellite creation events, bridging back to the internal creation methods.
     */
    _setupSatelliteAPI() {
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

    /**
     * Public method to check and initialize the physics worker if needed
     */
    checkPhysicsWorkerNeeded() {
        this._checkPhysicsWorkerNeeded();
    }

    /**
     * Toggles line-of-sight workers and connection lines based on user display settings.
     */
    _handleSatConnectionsToggle(value) {
        if (value) {
            // Initialize worker if not already
            if (!this.lineOfSightWorker) {
                console.log('Initializing line-of-sight worker');
                this.lineOfSightWorker = new Worker(
                    new URL('./workers/lineOfSightWorker.js', import.meta.url),
                    { type: 'module' }
                );
                this.lineOfSightWorker.onmessage = (e) => {
                    if (e.data.type === 'CONNECTIONS_UPDATED') {
                        this.updateSatelliteConnections(e.data.connections);
                    }
                };
            }
            // Trigger an immediate connection update
            this.lineOfSightWorker.postMessage({
                type: 'UPDATE_SATELLITES',
                satellites: Object.values(this._satellites).map((sat) => ({
                    id: sat.id,
                    position: sat.position
                }))
            });
        } else {
            // Clean up the worker if toggled off
            if (this.lineOfSightWorker) {
                this.lineOfSightWorker.terminate();
                this.lineOfSightWorker = null;
            }
            // Clear any existing lines
            while (this.satelliteConnections.children.length > 0) {
                const line = this.satelliteConnections.children[0];
                line.geometry.dispose();
                line.material.dispose();
                this.satelliteConnections.remove(line);
            }
        }
    }

    /**
     * Initializes the displaySettings object from defaultSettings.
     */
    _initializeDisplaySettings() {
        Object.entries(defaultSettings).forEach(([key, setting]) => {
            this.displaySettings[key] = setting.value;
        });
    }

    /**
     * Applies custom styling to the stats panel.
     */
    _applyStatsStyle() {
        // If stats panel exists, apply styling
        if (this.stats && this.stats.dom) {
            const dom = this.stats.dom;
            dom.style.cssText = 'position:fixed;bottom:16px;right:16px;cursor:pointer;opacity:0.9;z-index:10000;';

            // Ensure the stats DOM element is attached to the document body
            if (!document.body.contains(dom)) {
                document.body.appendChild(dom);
            }
        }
    }

    /**
     * Saves the current simulation state to a JSON file and triggers download
     */
    saveSimulationState() {
        // Create state object with all relevant simulation data
        const state = {
            // Basic simulation data
            timestamp: Date.now(),
            simulationTime: this.simulationTime,
            timeWarp: this.timeWarp,

            // Display settings
            displaySettings: { ...this.displaySettings },

            // Camera state
            camera: {
                position: this.camera.position.toArray(),
                quaternion: this.camera.quaternion.toArray(),
                zoom: this.camera.zoom
            },

            // Earth state
            earth: this.earth ? {
                rotation: this.earth.rotationGroup?.rotation.toArray() || [0, 0, 0]
            } : null,

            // Satellites - store creation parameters for each satellite
            satellites: Object.values(this._satellites).map(sat => {
                // Get basic properties
                const { id, name, mass, size, color } = sat;

                // Get position and velocity (in meters for accuracy)
                const position = sat.position.toArray();
                const velocity = sat.velocity.toArray();

                return {
                    id,
                    name,
                    mass,
                    size,
                    color,
                    position,
                    velocity
                };
            })
        };

        // Convert to JSON and create download link
        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create and trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = `sim-state-${new Date().toISOString().replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);

        return state;
    }

    /**
     * Loads simulation state from a JSON file
     * @param {File|string} fileOrJSON - Either a File object from file input or a JSON string
     * @returns {Promise<boolean>} - Success status
     */
    async loadSimulationState(fileOrJSON) {
        try {
            let stateData;

            // Handle different input types
            if (typeof fileOrJSON === 'string') {
                // Parse JSON string
                stateData = JSON.parse(fileOrJSON);
            } else if (fileOrJSON instanceof File) {
                // Read file contents
                const text = await fileOrJSON.text();
                stateData = JSON.parse(text);
            } else {
                console.error('Invalid input format for loadSimulationState');
                return false;
            }

            // Validate state data
            if (!stateData || !stateData.satellites) {
                console.error('Invalid simulation state data');
                return false;
            }

            // First, clear existing satellites
            Object.keys(this._satellites).forEach(id => {
                this.removeSatellite(id);
            });

            // Set simulation time
            if (stateData.simulationTime !== undefined) {
                this.simulationTime = stateData.simulationTime;
            }

            // Set time warp
            if (stateData.timeWarp !== undefined) {
                this.updateTimeWarp(stateData.timeWarp);
            }

            // Restore display settings
            if (stateData.displaySettings) {
                Object.entries(stateData.displaySettings).forEach(([key, value]) => {
                    this.updateDisplaySetting(key, value);
                });
            }

            // Restore camera position if available
            if (stateData.camera) {
                if (stateData.camera.position) {
                    this.camera.position.fromArray(stateData.camera.position);
                }
                if (stateData.camera.quaternion) {
                    this.camera.quaternion.fromArray(stateData.camera.quaternion);
                }
                if (stateData.camera.zoom) {
                    this.camera.zoom = stateData.camera.zoom;
                    this.camera.updateProjectionMatrix();
                }
            }

            // Restore earth rotation if available
            if (stateData.earth && this.earth && this.earth.rotationGroup) {
                this.earth.rotationGroup.rotation.fromArray(stateData.earth.rotation);
            }

            // Recreate all satellites
            for (const satData of stateData.satellites) {
                // Create a new satellite with the saved parameters
                const position = new THREE.Vector3().fromArray(satData.position);
                const velocity = new THREE.Vector3().fromArray(satData.velocity);

                // Apply proper scaling - positions and velocities are stored in meters
                // but need to be scaled for visualization
                const scaledPosition = new THREE.Vector3(
                    position.x * Constants.metersToKm * Constants.scale,
                    position.y * Constants.metersToKm * Constants.scale,
                    position.z * Constants.metersToKm * Constants.scale
                );

                const scaledVelocity = new THREE.Vector3(
                    velocity.x * Constants.metersToKm * Constants.scale,
                    velocity.y * Constants.metersToKm * Constants.scale,
                    velocity.z * Constants.metersToKm * Constants.scale
                );

                // Create the satellite
                const sat = await createSatellite(this, {
                    position: scaledPosition,
                    velocity: scaledVelocity,
                    mass: satData.mass,
                    size: satData.size,
                    name: satData.name,
                    color: satData.color
                });

                this._satellites[sat.id] = sat;
            }

            // Update satellite list in UI
            this.updateSatelliteList();

            // Check if physics worker is needed
            this._checkPhysicsWorkerNeeded();

            return true;
        } catch (error) {
            console.error('Error loading simulation state:', error);
            return false;
        }
    }
}

export default App3D;