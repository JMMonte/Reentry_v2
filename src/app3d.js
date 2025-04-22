// app3d.js
import * as THREE from 'three';
import Stats from 'stats.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/textureManager.js';
import { CameraControls } from './managers/CameraControls.js';
import { RadialGrid } from './components/RadialGrid.js';
import { SatelliteManager } from './simulation/SatelliteManager.js';
import { DisplaySettingsManager } from './simulation/DisplaySettingsManager.js';
import { SceneManager } from './simulation/SceneManager.js';
import { SimulationStateManager } from './simulation/SimulationStateManager.js';
import { SimulationLoop } from './simulation/SimulationLoop.js';

// Hook in global app event listeners (bodySelected, displaySettings, etc.)
import { setupEventListeners as setupGlobalListeners } from './setup/setupListeners.js';
import { setupCamera, setupRenderer, setupControls, setupPhysicsWorld, setupSettings } from './setup/setupComponents.js';
import { loadTextures, setupSceneDetails, setupPostProcessing } from './setup/setupScene.js';
import { initTimeControls } from './controls/timeControls.js';
import { initializeBodySelector } from './controls/bodySelectorControls.js';
import { defaultSettings } from './components/ui/controls/DisplayOptions.jsx';
import { Constants } from './utils/Constants.js';
import { updateCameraTarget as selectBody } from './utils/BodySelectionUtils.js';
// Add satellite creation functions
import { createSatelliteFromLatLon, createSatelliteFromOrbitalElements, createSatelliteFromLatLonCircular } from './satellites/createSatellite.js';

// Utility to convert defaultSettings to {key: value}
function extractDefaultDisplaySettings(settingsObj) {
    return Object.fromEntries(Object.entries(settingsObj).map(([k, v]) => [k, v.value]));
}

class App3D extends EventTarget {
    /**
     * Core 3D application for simulation.
     */
    constructor() {
        super();
        // Make instance available globally
        console.log('App3D: Initializing...');
        
        // Set canvas early
        this._canvas = document.getElementById('three-canvas');
        if (!this._canvas) {
            throw new Error('Canvas element not found');
        }

        // Private properties (OOP encapsulation)
        this._isInitialized = false;
        this._controls = null;
        this._lineOfSightWorker = null;
        this._satelliteConnections = new THREE.Group();
        this._connections = [];
        this._connectionsEnabled = false;
        // throttle ground trace updates
        this._lastGroundTraceUpdateTime = 0;

        // Managers
        this._satellites = new SatelliteManager(this);
        this._displaySettingsManager = new DisplaySettingsManager(this, extractDefaultDisplaySettings(defaultSettings));
        this._textureManager = new TextureManager();

        // Other core state
        this._timeUtils = new TimeUtils({
            simulatedTime: new Date().toISOString()
        });
        this._stats = new Stats();

        // Simulation state manager
        this.simulationStateManager = new SimulationStateManager(this);

        // Simulation loop manager
        this.simulationLoop = null;

        // Global event listeners (bodySelected -> updateSelectedBody, etc.)
        setupGlobalListeners(this);
        // Local event handlers (e.g. resize)
        this._eventHandlers = {};
        this.setupEventListeners();

        // Scene manager
        this.sceneManager = new SceneManager(this);

        // Initialize the app
        // this.init();
    }

    /** @returns {boolean} */
    get isInitialized() { return this._isInitialized; }
    /** @returns {THREE.Scene} */
    get scene() { return this.sceneManager.scene; }
    /** @returns {THREE.Camera} */
    get camera() { return this.sceneManager.camera; }
    /** @returns {THREE.WebGLRenderer} */
    get renderer() { return this.sceneManager.renderer; }
    /** @returns {SatelliteManager} */
    get satellites() { return this._satellites; }
    /** @returns {DisplaySettingsManager} */
    get displaySettingsManager() { return this._displaySettingsManager; }
    /** @returns {TextureManager} */
    get textureManager() { return this._textureManager; }
    /** @returns {TimeUtils} */
    get timeUtils() { return this._timeUtils; }
    /** @returns {Stats} */
    get stats() { return this._stats; }
    /** @returns {HTMLCanvasElement} */
    get canvas() { return this._canvas; }
    /** @returns {CSS2DRenderer} */
    get labelRenderer() { return this.sceneManager.labelRenderer; }
    /** @returns {Object} */
    get composers() { return this.sceneManager.composers; }
    /** @returns {RadialGrid} */
    get radialGrid() { return this.sceneManager.radialGrid; }

    async init() {
        console.log('Initializing App...');
        try {
            // Setup camera and renderer (still needed for SceneManager)
            this._setupCamera();
            this._setupRenderer();
            // Delegate all scene/camera/renderer/radialGrid setup to SceneManager
            await this.sceneManager.init();
            this._addConnectionsGroup();
            // --- start point picking setup ---
            this.raycaster = new THREE.Raycaster();
            this.raycaster.params.Points.threshold = 1;
            this.pickablePoints = [];
            const pts = this.earth?.earthSurface?.points;
            if (pts) Object.values(pts).forEach(arr => arr.forEach(p => this.pickablePoints.push(p)));
            // throttle pointermove: only one raycast per animation frame
            this._pickScheduled = false;
            this._throttledOnPointerMove = (event) => {
                if (this._pickScheduled) return;
                this._pickScheduled = true;
                requestAnimationFrame(() => {
                    this._onPointerMove(event);
                    this._pickScheduled = false;
                });
            };
            this.canvas.addEventListener('pointermove', this._throttledOnPointerMove);
            this.canvas.addEventListener('pointerdown', this._onPointerDown.bind(this));
            // --- end point picking setup ---
            // Controls and other setup
            this._setupControls();
            this._setupCameraControls();
            this._setupPhysicsWorld();
            // Pre-initialize physics worker so it's ready before any satellite creation
            if (this.satellites && typeof this.satellites._initPhysicsWorker === 'function') {
                this.satellites._initPhysicsWorker();
            }
            this._setupSettings();
            this._setupEventAndSocketListeners();
            this._setupTimeAndBodyControls();
            this._applyStatsStyle();
            this._isInitialized = true;
            this._addWindowResizeListener();
            this.onWindowResize();
            // Ensure connections are enabled on load if toggle is on
            if (this.displaySettingsManager.getSetting('showSatConnections')) {
                this._handleShowSatConnectionsChange(true);
                this._updateConnectionsWorkerSatellites();
            }
            // Start simulation loop
            this.simulationLoop = new SimulationLoop({
                app: this,
                satellites: this.satellites,
                sceneManager: this.sceneManager,
                cameraControls: this.cameraControls,
                timeUtils: this.timeUtils,
                stats: this.stats
            });
            this.simulationLoop.start();
            this._dispatchSceneReadyEvent();
            this._applyDisplaySettings();
            console.log('App initialization complete');
        } catch (error) {
            console.error('Error during initialization:', error);
            this.dispose();
            throw error;
        }
    }

    _setupCamera() {
        this._camera = setupCamera();
        if (!this._camera) throw new Error('Failed to initialize camera');
        this._camera.layers.enable(1);
    }
    _setupRenderer() {
        this._renderer = setupRenderer(this.canvas);
        if (!this._renderer) throw new Error('Failed to initialize renderer');
    }
    _setupControls() {
        this._controls = setupControls(this._camera, this._renderer);
        if (!this._controls) throw new Error('Failed to initialize controls');
    }
    _setupCameraControls() {
        this.cameraControls = new CameraControls(this._camera, this._controls);
        if (!this.cameraControls) throw new Error('Failed to initialize camera controls');
    }
    _setupPhysicsWorld() {
        this.world = setupPhysicsWorld();
    }
    _setupSettings() {
        this.settings = setupSettings();
    }
    async _setupTextures() {
        await loadTextures(this.textureManager);
    }
    async _setupSceneDetails() {
        await setupSceneDetails(this);
    }
    _setupPostProcessing() {
        setupPostProcessing(this);
    }
    _setupRadialGrid() {
        this.radialGrid = new RadialGrid(this._scene);
        this.radialGrid.setVisible(this.displaySettingsManager.getSetting('showGrid'));
    }
    _addConnectionsGroup() {
        this._scene.add(this._satelliteConnections);
    }
    _setupEventAndSocketListeners() {
        setupGlobalListeners(this);
    }
    _setupTimeAndBodyControls() {
        initTimeControls(this.timeUtils);
        initializeBodySelector(this);
    }
    _applyStatsStyle() {
        if (this.stats && this.stats.dom) {
            this.stats.dom.style.cssText = 'position:fixed;bottom:16px;right:16px;cursor:pointer;opacity:0.9;z-index:10000;';
            document.body.appendChild(this.stats.dom);
        }
    }
    _addWindowResizeListener() {
        this._eventHandlers.resize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this._eventHandlers.resize);
    }
    _startAnimationLoop() {
        this.animate();
    }
    _dispatchSceneReadyEvent() {
        const sceneReadyEvent = new Event('sceneReady');
        this.dispatchEvent(sceneReadyEvent);
        if (typeof this.onSceneReady === 'function') {
            this.onSceneReady();
        }
    }
    _applyDisplaySettings() {
        if (this.displaySettingsManager) {
            this.displaySettingsManager.applyAll();
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
        // Update vectors only if traced on screen
        if (this.vectors && this.displaySettingsManager.getSetting('showVectors')) {
            this.vectors.updateVectors();
        }
        // Throttled ground trace updates
        const showGT = this.displaySettingsManager.getSetting('showGroundTraces');
        const gtIntervalMs = this.displaySettingsManager.getSetting('groundTrackUpdateInterval') * 1000;
        const nowGT = performance.now();
        if (showGT && this.satellites &&
            (!this._lastGroundTraceUpdateTime || nowGT - this._lastGroundTraceUpdateTime >= gtIntervalMs)) {
            Object.values(this.satellites.getSatellites()).forEach(sat => {
                if (sat.updateGroundTrack) sat.updateGroundTrack();
            });
            this._lastGroundTraceUpdateTime = nowGT;
        }
        // Update satellite connections every frame if enabled
        if (this._connectionsEnabled) {
            this._updateConnectionsWorkerSatellites();
        }
    }

    updateSatelliteConnections(connections) {
        this._satelliteConnections.visible = true;
        // Clear existing connections
        while (this._satelliteConnections.children.length > 0) {
            const line = this._satelliteConnections.children[0];
            line.geometry.dispose();
            line.material.dispose();
            this._satelliteConnections.remove(line);
        }
        // Create new connections if enabled
        if (this.displaySettingsManager.getSetting('showSatConnections')) {
            connections.forEach(conn => {
                const material = new THREE.LineBasicMaterial({
                    color: conn.color === 'red' ? 0xff0000 : 0x00ff00,
                    opacity: 1.0,
                    transparent: false,
                    linewidth: 5 // Note: linewidth only works in some environments
                });
                const geometry = new THREE.BufferGeometry();
                // Convert connection points from km to simulation units (km * scale)
                const vertices = new Float32Array(
                    conn.points.flat().map(v => v * Constants.scale)
                );
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                const line = new THREE.Line(geometry, material);
                line.renderOrder = 9999;
                this._satelliteConnections.add(line);
            });
        }
    }

    onWindowResize = () => {
        if (this._camera && this._renderer) {
            this._camera.aspect = window.innerWidth / window.innerHeight;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(window.innerWidth, window.innerHeight);
            this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));

            if (this.sceneManager.composers.bloom && this.sceneManager.composers.final) {
                this.sceneManager.composers.bloom.setSize(window.innerWidth, window.innerHeight);
                this.sceneManager.composers.final.setSize(window.innerWidth, window.innerHeight);
            }

            if (this.labelRenderer) {
                this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
            }
        }
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
        // Delegate to BodySelectionUtils for all body types
        if (this.cameraControls) {
            selectBody(value, this, false);
        }
    }

    getDisplaySetting(key) {
        return this.displaySettingsManager.getSetting(key);
    }

    updateDisplaySetting(key, value) {
        this.displaySettingsManager.updateSetting(key, value);
        if (key === 'showSatConnections') {
            this._handleShowSatConnectionsChange(value);
        } else if (key === 'physicsTimeStep') {
            // Update physics worker integration step
            this.satellites.setPhysicsTimeStep(value);
        }
    }

    updateSatelliteList() {
        // Create a clean object with only necessary satellite data
        const satelliteData = Object.fromEntries(
            Object.entries(this.satellites.getSatellites())
                .filter(([, sat]) => sat && sat.id != null && sat.name)
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
        // Update connections worker if enabled
        if (this._connectionsEnabled && this._lineOfSightWorker) {
            this._updateConnectionsWorkerSatellites();
        }
    }

    // Delegate satellite/state methods to SimulationStateManager
    createSatellite(params) {
        return this.simulationStateManager.createSatellite(params);
    }
    removeSatellite(satelliteId) {
        return this.simulationStateManager.removeSatellite(satelliteId);
    }
    importSimulationState(state) {
        return this.simulationStateManager.importState(state);
    }
    exportSimulationState() {
        return this.simulationStateManager.exportState();
    }

    // Satellite creation methods
    createSatelliteFromLatLon(params) {
        return createSatelliteFromLatLon(this, params);
    }
    createSatelliteFromOrbitalElements(params) {
        return createSatelliteFromOrbitalElements(this, params);
    }
    createSatelliteFromLatLonCircular(params) {
        return createSatelliteFromLatLonCircular(this, params);
    }

    // Methods for satellite creation
    // Remove direct satellite creation methods (now handled by SimulationStateManager)
    // async createSatelliteLatLon(params) { ... }
    // async createSatelliteOrbital(params) { ... }
    // async createSatelliteCircular(params) { ... }
    // createSatelliteFromState(params) { ... }

    // --- SATELLITE CONNECTIONS WORKER LOGIC ---
    _initLineOfSightWorker() {
        if (this._lineOfSightWorker) return;
        this._lineOfSightWorker = new Worker(new URL('./workers/lineOfSightWorker.js', import.meta.url), { type: 'module' });
        this._lineOfSightWorker.onmessage = (e) => {
            if (e.data.type === 'CONNECTIONS_UPDATED') {
                this._connections = e.data.connections;
                this.updateSatelliteConnections(this._connections);
            }
        };
    }
    _terminateLineOfSightWorker() {
        if (this._lineOfSightWorker) {
            this._lineOfSightWorker.terminate();
            this._lineOfSightWorker = null;
        }
        this._connections = [];
        this.updateSatelliteConnections([]);
    }
    _updateConnectionsWorkerSatellites() {
        if (!this._lineOfSightWorker) return;
        const satellitesRaw = Object.values(this.satellites.getSatellites())
            .filter(sat => sat && sat.position && sat.id != null)
            .map(sat => ({
                id: sat.id,
                position: { ...sat.position }
            }));
        const satellites = satellitesRaw.map(sat => ({
            id: sat.id,
            position: {
                x: sat.position.x * Constants.metersToKm,
                y: sat.position.y * Constants.metersToKm,
                z: sat.position.z * Constants.metersToKm
            }
        }));
        this._lineOfSightWorker.postMessage({ type: 'UPDATE_SATELLITES', satellites });
    }
    _handleShowSatConnectionsChange(enabled) {
        this._connectionsEnabled = enabled;
        if (enabled) {
            this._initLineOfSightWorker();
            this._updateConnectionsWorkerSatellites();
        } else {
            this._terminateLineOfSightWorker();
        }
    }

    setupEventListeners() {
        // Store handler references for cleanup
        // Window resize
        this._eventHandlers.resize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this._eventHandlers.resize);
    }

    // handle pointer hover to change cursor over points
    _onPointerMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, this.camera);
        let hit = false;
        this.pickablePoints.forEach(points => {
            const intersects = this.raycaster.intersectObject(points, false);
            if (intersects.length) hit = true;
        });
        document.body.style.cursor = hit ? 'pointer' : '';
    }

    // handle pointer click to dispatch point info event
    _onPointerDown(event) {
        const rect = this.canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(mouse, this.camera);
        for (const points of this.pickablePoints) {
            const intersects = this.raycaster.intersectObject(points, false);
            if (intersects.length) {
                const intersect = intersects[0];
                const idx = intersect.index;
                const { features, category } = points.userData;
                const feature = features[idx];
                window.dispatchEvent(new CustomEvent('earthPointClick', { detail: { feature, category } }));
                break;
            }
        }
    }

    removeEventListeners() {
        if (!this._eventHandlers) return;
        window.removeEventListener('resize', this._eventHandlers.resize);
    }

    dispose() {
        if (this._lineOfSightWorker) {
            this._lineOfSightWorker.terminate();
            this._lineOfSightWorker = null;
        }
        // Dispose all satellites and their workers (including physics and shared orbit workers)
        if (this._satellites) {
            this._satellites.dispose();
        }
        console.log('Disposing App3D...');
        this._isInitialized = false;

        // Remove all event listeners
        this.removeEventListeners();

        // Dispose simulation loop
        if (this.simulationLoop) {
            this.simulationLoop.dispose();
        }
        // Dispose scene manager
        if (this.sceneManager) {
            this.sceneManager.dispose();
        }
        try {
            // Removed: Stop animation loop, composers, scene, renderer, controls cleanup (now handled by managers)
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

/**
 * @class App3D
 * @extends EventTarget
 * Core 3D application for simulation.
 * Public API:
 * - init()
 * - dispose()
 * - updateTimeWarp(value)
 * - updateSelectedBody(value)
 * - getDisplaySetting(key)
 * - updateDisplaySetting(key, value)
 * - updateSatelliteList()
 * - createSatellite(params)
 * - removeSatellite(satelliteId)
 * - importSimulationState(state)
 * - exportSimulationState()
 */

export default App3D;
