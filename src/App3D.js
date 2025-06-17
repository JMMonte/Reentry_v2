// app3d.js ─ refactored drop-in
// ──────────────────────────────────────────────────────────────────────────────
// 1. IMPORTS
// ──────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);                   // use Z-up globally

// Monkey-patch to debug and fix NaN boundingSphere issues
const origComputeBoundingSphere = THREE.BufferGeometry.prototype.computeBoundingSphere;
THREE.BufferGeometry.prototype.computeBoundingSphere = function () {
    try {
        origComputeBoundingSphere.apply(this, arguments);
        if (this.boundingSphere && isNaN(this.boundingSphere.radius)) {
            console.error('NaN boundingSphere detected!', this, new Error().stack);
            // Fix by setting a default bounding sphere
            const positions = this.attributes.position;
            if (positions && positions.count > 0) {
                // Try to compute a valid bounding sphere
                const center = new THREE.Vector3();
                let radius = 0;
                let validPoints = 0;
                for (let i = 0; i < positions.count; i++) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);
                    const z = positions.getZ(i);
                    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                        center.add(new THREE.Vector3(x, y, z));
                        validPoints++;
                    }
                }
                if (validPoints > 0) {
                    center.divideScalar(validPoints);
                    for (let i = 0; i < positions.count; i++) {
                        const x = positions.getX(i);
                        const y = positions.getY(i);
                        const z = positions.getZ(i);
                        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                            const dist = center.distanceTo(new THREE.Vector3(x, y, z));
                            radius = Math.max(radius, dist);
                        }
                    }
                    this.boundingSphere = new THREE.Sphere(center, radius);
                } else {
                    // Fallback to a unit sphere at origin
                    this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
                }
            } else {
                // Fallback to a unit sphere at origin
                this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
            }
        }
    } catch (error) {
        console.error('Error computing bounding sphere:', error);
        // Fallback to a unit sphere at origin
        this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
    }
};

// External helpers
// import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Stats from 'stats.js';

// Core utilities
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/textureManager.js';
// Removed atmosphere fixing imports - simplified material handles depth properly

// Managers & engines
import { SatelliteManager } from './managers/SatelliteManager.js';
// import { LocalPhysicsProvider } from './providers/LocalPhysicsProvider.js';
import { DisplaySettingsManager } from './managers/DisplaySettingsManager.js';
import { SceneManager } from './managers/SceneManager.js';
import { SimulationStateManager } from './managers/SimulationStateManager.js';
import { SimulationLoop } from './simulation/SimulationLoop.js';
// SocketManager removed - socket handled directly by chat components

// New physics system
import { PhysicsManager } from './physics/PhysicsManager.js';
import { PhysicsConstants } from './physics/core/PhysicsConstants.js';
import { LineOfSightManager } from './managers/LineOfSightManager.js';
import { SatelliteCommsManager } from './managers/SatelliteCommsManager.js';
import { CommunicationsService } from './services/CommunicationsService.js';
import Physics from './physics/PhysicsAPI.js';
import GroundStationService from './services/GroundStationService.js';
import { LabelManager } from './managers/LabelManager.js';

// Controls
import { SmartCamera } from './controls/SmartCamera.js';
import {
    setupCamera,
    setupRenderer,
    setupControls
} from './setup/setupComponents.js';

// Global listeners & UI
import { setupEventListeners as setupGlobalListeners }
    from './setup/setupListeners.js';
import { defaultSettings } from './components/ui/controls/DisplayOptions.jsx';

// Domain helpers
import { Planet } from './components/planet/Planet.js';
import { PlanetVectors } from './components/planet/PlanetVectors.js';

// ──────────────────────────────────────────────────────────────────────────────
// 2. SMALL UTILITIES
// ──────────────────────────────────────────────────────────────────────────────

const getDefaultDisplaySettings = src =>
    Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.value]));

// ──────────────────────────────────────────────────────────────────────────────
// 3. MAIN CLASS
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Core 3-D application and master orchestrator.
 * Emits:  'sceneReady'  – once the scene graph & simulation loop are live.
 */
class App3D extends EventTarget {

    /**
     * @param {Object} [options]
     * @param {string} [options.simulatedTime] - Initial simulated time ISO string.
     */
    constructor({ simulatedTime } = {}) {
        super();

        // Bootstrapping flag to prevent premature settings application
        this._isBootstrapping = true;

        // — Canvas & DOM — -----------------------------------------------------
        this._canvas = document.getElementById('three-canvas');
        if (!this._canvas) throw new Error('Canvas element #three-canvas not found');

        // — Internal state — ---------------------------------------------------
        /** @type {boolean} */        this._isInitialized = false;



        // — Managers & engines — ----------------------------------------------
        this._textureManager = new TextureManager();

        this._displaySettingsManager = new DisplaySettingsManager(
            this,
            getDefaultDisplaySettings(defaultSettings)
        );

        // Initialize new physics system
        this.physicsIntegration = new PhysicsManager(this);
        // Only use SatelliteManager, no provider
        this._satellites = new SatelliteManager(this);

        // Initialize satellite communications manager
        this.satelliteCommsManager = new SatelliteCommsManager(this.physicsIntegration.physicsEngine);

        // Initialize unified communications service
        this.communicationsService = new CommunicationsService();

        this.sceneManager = new SceneManager(this);
        this.simulationStateManager = new SimulationStateManager(this);

        // LineOfSightManager will be initialized after scene is ready
        this.lineOfSightManager = null;
        
        // LabelManager will be initialized after scene and camera are ready
        this.labelManager = null;

        // Ground stations data - now managed by GroundStationService (accessed via getter)

        // — Misc util — --------------------------------------------------------
        // Always use UTC time - new Date().toISOString() gives us UTC
        this._timeUtils = new TimeUtils({ simulatedTime: simulatedTime || new Date().toISOString() });
        this._stats = new Stats();

        // — Workers & helpers — -----------------------------------------------
        this._lineOfSightManager = null; // Will be initialized after SceneManager

        // — Event storage — ----------------------------------------------------
        this._eventHandlers = {};

        // Global listeners (bodySelected, displaySettings, …)
        this._cleanupGlobalListeners = setupGlobalListeners(this);

        // Attach core modules for SceneManager access
        this.Planet = Planet;
        this.THREE = THREE;

        // For animation loop optimization
        this._lastCameraPos = new THREE.Vector3();
        this._lastSunPos = new THREE.Vector3();
        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        // Frame counter for throttling UI updates
        this._frameCount = 0;

        // Pre-allocated vectors for tick() to avoid GC pressure
        this._tempWorldPos = new THREE.Vector3();
        this._tempSunPos = new THREE.Vector3();

        // Advanced caching for performance
        this._lastFrustumUpdateFrame = -1;
        this._visibleBodies = new Set();
        this._bodyWorldPositions = new Map(); // Cache world positions
        this._lastUpdateFrame = new Map(); // Track when each body was last updated
        this._updateThreshold = 0.1; // Min distance change to trigger update (km)
        this._maxCacheEntries = 100; // Safety limit for position cache
        
        // Centralized distance cache system - MASSIVE performance optimization
        this._distanceCache = new Map(); // objectId -> { distance, distanceSquared, lastUpdate }
        this._lastCameraPosition = new THREE.Vector3();
        this._cameraMovementThreshold = 1.0; // km - only recalc distances when camera moves significantly
        this._distanceCacheFrameId = 0;
        
        // GPU-accelerated visibility system
        this._visibilityCache = new Map(); // bodyId -> { visible, lastCheck, boundingSphere }
        this._frustumCacheTimeout = 500; // ms - cache frustum results
        this._hierarchicalCulling = true; // Enable hierarchical culling for nested objects
        this._adaptiveUpdateRates = new Map(); // bodyId -> updateRate based on distance/importance
        
        // Advanced frame timing
        this._frameTimeBuffer = new Array(60).fill(16.67); // Rolling average of frame times
        this._frameTimeIndex = 0;
        this._adaptiveThrottling = true; // Dynamically adjust update rates based on performance
    }

    // ───── Properties (read-only public) ──────────────────────────────────────
    get isInitialized() { return this._isInitialized; }
    get scene() { return this.sceneManager.scene; }
    get camera() { return this.sceneManager.camera; }
    get renderer() { return this.sceneManager.renderer; }
    get satellites() { return this._satellites; }
    get displaySettingsManager() { return this._displaySettingsManager; }
    get textureManager() { return this._textureManager; }
    get timeUtils() { return this._timeUtils; }
    get stats() { return this._stats; }
    get canvas() { return this._canvas; }
    get labelRenderer() { return this.sceneManager.labelRenderer; }
    get composers() { return this.sceneManager.composers; }
    get physicsEngine() { return this.physicsIntegration; }
    
    // Expose distance cache methods for global use
    get distanceCache() { 
        return {
            getDistance: this.getDistanceToCamera.bind(this),
            getDistanceSquared: this.getDistanceToCameraSquared.bind(this),
            isValid: () => this._distanceCacheFrameId > 0
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. LIFE-CYCLE
    // ──────────────────────────────────────────────────────────────────────────
    /**
     * Bootstrap the entire 3-D stack.
     * Call exactly once right after constructing `App3D`.
     */
    async init() {
        try {


            // Dispose previous sceneManager if it exists
            if (this.sceneManager) {
                this.sceneManager.dispose();
                this.sceneManager = new SceneManager(this); // Recreate for clean state
            }
            this._setupCameraAndRenderer();
            await this.sceneManager.init();

            // Initialize LabelManager after scene and camera are ready
            this.labelManager = new LabelManager(this.sceneManager.scene, this.sceneManager.camera);

            // Initialize LineOfSightManager after scene is ready
            this.lineOfSightManager = new LineOfSightManager(
                this.sceneManager.scene,
                this._displaySettingsManager,
                this.physicsIntegration
            );

            // Initialize communications service with managers
            this.communicationsService.initialize(
                this.lineOfSightManager,
                this.satelliteCommsManager,
                this.physicsIntegration.physicsEngine
            );

            // Create physics API for React components - direct access to unified API
            this.physicsAPI = {
                ...Physics,
                isReady: () => this.physicsIntegration?.isInitialized || false,
                waitForReady: () => Promise.resolve(true), // Always ready (static API)
                markReady: () => { }, // No-op since Physics API is always ready
                dispose: () => { }, // No cleanup needed for static API
                // Provide access to physics engine for advanced operations
                getPhysicsEngine: () => this.physicsIntegration.physicsEngine,
                // Legacy compatibility methods
                getAllBodies: () => {
                    const engine = this.physicsIntegration.physicsEngine;
                    if (!engine || !engine.bodies) return [];

                    // Convert bodies object to array format expected by components
                    return Object.values(engine.bodies).map(body => ({
                        id: body.naifId || body.id,
                        naifId: body.naifId || body.id,
                        name: body.name,
                        position: body.position,
                        ...body
                    }));
                },
                getAllSatelliteUIData: () => {
                    const engine = this.physicsIntegration.physicsEngine;
                    if (!engine || !engine.satellites) return [];

                    return Array.from(engine.satellites.values()).map(sat => ({
                        id: sat.id,
                        position: sat.position,
                        velocity: sat.velocity,
                        ...sat
                    }));
                }
            };

            // Expose on window for components that expect it
            if (window.app3d === this) {
                window.app3d.physicsAPI = this.physicsAPI;
            }

            // DISABLED: POI picking system
            // this._initPOIPicking();
            this._setupControls();

            // Initialize simulation controller for centralized time/state management
            const { SimulationController } = await import('./simulation/SimulationController.js');
            this.simulationController = new SimulationController(this);
            await this.simulationController.initialize();

            // Initialize new physics system
            try {
                await this.physicsIntegration.initialize(this.timeUtils.getSimulatedTime());

                // Initialize simple satellite orbit visualizer after physics is ready
                const { SimpleSatelliteOrbitVisualizer } = await import('./managers/SimpleSatelliteOrbitVisualizer.js');
                this.satelliteOrbitManager = new SimpleSatelliteOrbitVisualizer(this);

                // Initialize maneuver preview system
                // DISABLED: Using SimpleManeuverPreview instead
                // const { getManeuverPreviewSystem } = await import('./managers/ManeuverPreviewSystem.js');
                // this.maneuverPreviewSystem = getManeuverPreviewSystem(this);

                // Set up satellite communication system integration
                this._setupSatelliteCommsIntegration();

                // Physics API is always ready (static functions)
            } catch (physicsError) {
                console.warn('[App3D] Physics integration failed to initialize:', physicsError);
                // Continue without physics integration - fallback to existing systems
                // Physics API remains available as static functions
                console.log('[App3D] Physics API available in fallback mode');
            }

            // Physics worker (latency-hiding)
            this.satellites._initPhysicsWorker?.();

            this._injectStatsPanel();
            this._wireResizeListener();

            // Only initialize scene objects locally (no backend connection)
            await this._initializeLocalScene();

            // Atmospheres now use simplified depth handling in PlanetMaterials.js

            // Enable axis and vector visualization for all planets
            this.planetVectors = [];
            if (this.celestialBodies) {
                for (const planet of this.celestialBodies) {
                    // Only add vectors for planets with a mesh and rotationGroup
                    if (planet && planet.getMesh && planet.rotationGroup && this.sceneManager.scene) {
                        const vec = new PlanetVectors(planet, this.sceneManager.scene, this.sun, { name: planet.name, scale: planet.radius * 2 }, this.labelManager);
                        this.planetVectors.push(vec);
                    }
                }
            }

            // Socket manager is available for chat functionality but not initialized here
            // Chat components will initialize their own socket connections as needed

            // Simulation heartbeat
            this.simulationLoop = new SimulationLoop({
                app: this,
                satellites: this.satellites,
                sceneManager: this.sceneManager,
                cameraControls: this.cameraControls,
                timeUtils: this.timeUtils,
                stats: this.stats
            });
            this.simulationLoop.start();

            // Now bootstrapping is done
            this._isBootstrapping = false;
            // Re-apply display settings to ensure all are set with simulationLoop present
            this.displaySettingsManager?.applyAll?.();

            this._isInitialized = true;
            this._dispatchSceneReady();
        } catch (err) {
            console.error('App3D init failed:', err);
            this.dispose();
            throw err;
        }
    }

    /**
     * Initialize scene objects locally when backend is not available
     * @private
     */
    async _initializeLocalScene() {
        try {
            const { initScene, createSceneObjects } = await import('./setup/setupScene.js');

            // First initialize the basic scene (textures, lighting, post-processing)
            // This will dispatch the 'assetsLoaded' event

            await initScene(this);


            // Then create the celestial objects

            await createSceneObjects(this);

            this.sceneObjectsInitialized = true;

            // Only default to Earth if no body is currently being followed
            // This preserves the user's current camera target and offset
            if (this.cameraControls && typeof this.cameraControls.follow === 'function') {
                if (!this.cameraControls.followTarget) {
                    // No body currently being followed, default to Earth
                    this.cameraControls.follow('earth', this, true);
                    
                    // Dispatch bodySelected event to sync React state
                    document.dispatchEvent(new CustomEvent('bodySelected', {
                        detail: { body: 'earth' }
                    }));
                }
                // If a body is already being followed, preserve that selection and camera offset
            }

            // Dispatch scene ready event
            window.dispatchEvent(new CustomEvent('sceneReadyFromBackend'));
        } catch (sceneError) {
            console.error('[App3D] Failed to initialize local scene:', sceneError);
            throw sceneError;
        }
    }

    /** Release workers, Three.js resources, and DOM artefacts. */
    dispose() {
        this._isInitialized = false;

        // Workers
        this.lineOfSightManager?.dispose();

        // LabelManager cleanup
        this.labelManager?.dispose?.();

        // Physics integration cleanup
        this.physicsIntegration?.cleanup?.();

        // Time utilities cleanup
        this._timeUtils?.dispose?.();

        // Satellites & loops
        this._satellites?.dispose?.();
        this.simulationLoop?.dispose?.();

        // Satellite orbit manager
        this.satelliteOrbitManager?.dispose?.();

        // Communications cleanup
        this.communicationsService?.dispose?.();
        this.satelliteCommsManager?.dispose?.();
        this.physicsAPI?.dispose?.();

        // Remove satellite event listeners to prevent memory leaks
        if (this._handleSatelliteAdded) {
            window.removeEventListener('satelliteAdded', this._handleSatelliteAdded);
            this._handleSatelliteAdded = null;
        }
        if (this._handleSatelliteRemoved) {
            window.removeEventListener('satelliteRemoved', this._handleSatelliteRemoved);
            this._handleSatelliteRemoved = null;
        }

        // Simulation controller
        this.simulationController?.dispose?.();

        // Display settings manager
        this._displaySettingsManager?.dispose?.();

        // Texture manager
        this._textureManager?.dispose?.();

        // Planet vectors
        if (Array.isArray(this.planetVectors)) {
            this.planetVectors.forEach(vec => vec.dispose?.());
            this.planetVectors = [];
        }

        // Scene graph
        this.sceneManager?.dispose?.();

        // Socket cleanup
        import('./socket.js').then(module => {
            if (module.closeSocket) {
                module.closeSocket();
            }
        }).catch(() => {
            // Socket module might not be loaded, that's ok
        });

        // Cleanup shared GroundtrackPath worker
        import('./services/GroundtrackPath.js').then(module => {
            if (module.GroundtrackPath && module.GroundtrackPath.forceCleanup) {
                module.GroundtrackPath.forceCleanup();
            }
        }).catch(() => {
            // Module might not be loaded, that's ok
        });

        // Simulation state manager
        this.simulationStateManager?.dispose?.();

        // Remove stats panel from DOM
        if (this._stats?.dom?.parentNode) {
            this._stats.dom.parentNode.removeChild(this._stats.dom);
        }

        // Listeners
        this._removeWindowResizeListener();



        // Clean up global event listeners
        if (this._cleanupGlobalListeners) {
            this._cleanupGlobalListeners();
            this._cleanupGlobalListeners = null;
        }

        // Clear all references to help GC
        this.celestialBodies = null;
        this.bodiesByNaifId = null;
        this.planetsByNaifId = null;
        this._satellites = null;
        this._camera = null;
        this._renderer = null;
        this._controls = null;
        this.cameraControls = null;

        // Clear performance caches
        this._bodyWorldPositions.clear();
        this._lastUpdateFrame.clear();
        this._visibleBodies.clear();
        this._distanceCache.clear();
        this._visibilityCache.clear();


    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. INIT HELPERS
    // ──────────────────────────────────────────────────────────────────────────
    _setupCameraAndRenderer() {
        this._camera = setupCamera();
        this._renderer = setupRenderer(this.canvas);
        this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
    }

    _setupControls() {
        this._controls = setupControls(this._camera, this._renderer);
        this.cameraControls = new SmartCamera(this._camera, this._controls);
    }



    _injectStatsPanel() {
        if (!this.stats?.dom) return;
        Object.assign(this.stats.dom.style, {
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            left: 'auto',
            top: 'auto',
            cursor: 'pointer',
            opacity: '0.9',
            zIndex: 10000
        });
        document.body.appendChild(this.stats.dom);
    }

    _wireResizeListener() {
        this._eventHandlers.resize = this._onWindowResize.bind(this);
        window.addEventListener('resize', this._eventHandlers.resize);
        this._onWindowResize();  // run once at startup
    }
    _removeWindowResizeListener() {
        window.removeEventListener('resize', this._eventHandlers.resize);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. DISPLAY SETTINGS (delegated to DisplaySettingsManager)
    // ──────────────────────────────────────────────────────────────────────────
    updateDisplaySetting(key, value) {
        this.simulationLoop?.updateDisplaySetting(key, value);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. SATELLITE CONNECTIONS WORKER (Delegated to LineOfSightManager)
    // ──────────────────────────────────────────────────────────────────────────
    _toggleSatelliteLinks(enabled) {
        this.lineOfSightManager.setEnabled(enabled);
        if (enabled) {
            this._syncConnectionsWorker();
        }
    }

    _syncConnectionsWorker() {
        if (!this.physicsIntegration?.physicsEngine) {

            return;
        }

        this.physicsIntegration.physicsEngine;
        const sats = this.physicsIntegration.getSatellitesForLineOfSight();
        const bodies = this.physicsIntegration.getBodiesForLineOfSight();


        if (this.lineOfSightManager) {
            this.lineOfSightManager.updateConnections(sats, bodies);
        } else {
            console.log('[App3D] LineOfSightManager not initialized');
        }
    }







    // ──────────────────────────────────────────────────────────────────────────
    // 11. MISC
    // ──────────────────────────────────────────────────────────────────────────
    _dispatchSceneReady() {
        const evt = new Event('sceneReady');
        this.dispatchEvent(evt);
        document.dispatchEvent(evt);
        this.onSceneReady?.();
    }

    _onWindowResize() {
        if (!this._camera || !this._renderer) return;
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(window.innerWidth, window.innerHeight);

        this.sceneManager.composers.bloom?.setSize(window.innerWidth, window.innerHeight);
        this.sceneManager.composers.final?.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer?.setSize(window.innerWidth, window.innerHeight);

        // Update orbit lines resolution
        this.sceneManager.orbitManager?.onResize();

        // Update line of sight rendering resolution for Line2 materials
        this.lineOfSightManager?.updateResolution?.(window.innerWidth, window.innerHeight);

        this._resizePOIs();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10.  UI SCALES
    // ──────────────────────────────────────────────────────────────────────────
    _resizePOIs() {
        if (!this.pickablePoints?.length) return;

        const pixelSize = PhysicsConstants.RENDERING.STANDARD_PIXEL_SIZE;
        const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
        const halfH = window.innerHeight;

        const tmp = new THREE.Vector3();
        const scaleFor = dist =>
            (2 * Math.tan(vFOV / 2) * dist) * (pixelSize / halfH);

        this.pickablePoints.forEach((mesh, index) => {
            if (!mesh.visible) return;
            
            // Use cached distance for POI scaling
            const poiId = `poi_${index}`;
            let distance = this.distanceCache.getDistance(poiId);
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                mesh.getWorldPosition(tmp);
                distance = tmp.distanceTo(this.camera.position);
            }
            
            const s = scaleFor(distance);
            mesh.scale.set(s, s, 1);
        });

        if (this._poiIndicator) {
            // Use cached distance for POI indicator scaling
            let distance = this.distanceCache.getDistance('poi_indicator');
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                this._poiIndicator.getWorldPosition(tmp);
                distance = tmp.distanceTo(this.camera.position);
            }
            
            const s = scaleFor(distance) * 1.2;
            this._poiIndicator.scale.set(s, s, 1);
        }
    }

    // ───────── SATELLITE/STATE API (delegates to SimulationStateManager) ─────
    removeSatellite(i) { return this.simulationStateManager.removeSatellite(i); }
    importSimulationState(s) { return this.simulationStateManager.importState(s); }
    exportSimulationState() { return this.simulationStateManager.exportState(); }

    // Display-linked getters / setters
    getDisplaySetting(k) { return this.displaySettingsManager.getSetting(k); }

    /**
     * Update camera to follow a new body selection (string or object).
     * Called by React/App3DController on selectedBody changes.
     */
    updateSelectedBody(value, suppressLog = false) {
        this.simulationLoop?.updateSelectedBody(value, suppressLog);
    }

    /** Notify React UI about updated satellite roster. */
    updateSatelliteList() {
        this.simulationLoop?.updateSatelliteList();
    }

    /**
     * Centralized per-frame update for animation loop.
     * @param {number} delta - Time since last frame in seconds
     * @param {number} interpolationFactor - Physics interpolation factor (0-1)
     */
    tick(delta, interpolationFactor = 0) {
        try {
            // Physics state is now updated by SimulationLoop, so we just need to handle visuals
            // The physics state update events are already dispatched by PhysicsManager


            this.stats?.begin();

            this.sceneManager.updateFrame?.(delta);

            // Update LabelManager for all labels to face camera and handle fade animations
            if (this.labelManager) {
                this.labelManager.updateAllOrientations();
                this.labelManager.updateFadeAnimations();
            }

            if (Array.isArray(this.celestialBodies)) {
                this.celestialBodies.forEach(planet => planet.update?.(delta, interpolationFactor));
            }

            if (this.previewNode) this.previewNode.update?.(delta);
            if (Array.isArray(this.previewNodes)) {
                this.previewNodes.forEach(node => node.update?.(delta));
            }

            this.cameraControls?.updateCameraPosition?.(delta);

            // --- Optimized per-frame updates ---
            // Track camera and sun movement with threshold
            const cameraMoved = this.camera &&
                this._lastCameraPos.distanceTo(this.camera.position) > this._updateThreshold;
            if (cameraMoved) {
                this._lastCameraPos.copy(this.camera.position);
                
                // Update centralized distance cache when camera moves significantly
                this._updateDistanceCache();
            }

            let sunMoved = false;
            if (this.sun && typeof this.sun.getWorldPosition === 'function') {
                this.sun.getWorldPosition(this._tempSunPos);
                sunMoved = this._lastSunPos.distanceTo(this._tempSunPos) > this._updateThreshold;
                if (sunMoved) {
                    this._lastSunPos.copy(this._tempSunPos);
                }
            }

            // Update frustum only when camera moves (not every frame)
            if (cameraMoved && this.camera && this.camera.projectionMatrix && this.camera.matrixWorldInverse) {
                this._projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
                this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
                this._lastFrustumUpdateFrame = this._frameCount;
            }

            // GPU-accelerated visibility checking with hierarchical culling
            const isVisible = (mesh, bodyId) => {
                if (!mesh) return false;
                
                // Check visibility cache first
                const now = performance.now();
                const cached = this._visibilityCache.get(bodyId);
                if (cached && (now - cached.lastCheck) < this._frustumCacheTimeout) {
                    return cached.visible;
                }
                
                // Update world matrix only when needed
                if (mesh.matrixWorldNeedsUpdate) {
                    mesh.updateWorldMatrix?.(true, false);
                }
                
                let visible = true;
                
                // Hierarchical culling: check parent visibility first
                if (this._hierarchicalCulling && mesh.parent) {
                    const parentVisible = this._checkParentVisibility(mesh.parent);
                    if (!parentVisible) {
                        visible = false;
                    }
                }
                
                if (visible && mesh.isMesh && mesh.geometry) {
                    const pos = mesh.geometry.attributes.position;
                    if (!pos || !pos.count || isNaN(pos.array[0])) {
                        visible = false;
                    } else {
                        // Use cached bounding sphere when possible
                        if (!mesh.geometry.boundingSphere) {
                            mesh.geometry.computeBoundingSphere();
                        }
                        
                        // Fast sphere-frustum test first, then detailed intersection
                        const sphere = mesh.geometry.boundingSphere;
                        if (sphere && sphere.radius > 0) {
                            const center = sphere.center.clone().applyMatrix4(mesh.matrixWorld);
                            const radius = sphere.radius * mesh.scale.length();
                            
                            // Quick distance check before frustum test - use cached distance if available
                            let distanceToCamera = this.distanceCache.getDistance(bodyId);
                            if (!distanceToCamera || distanceToCamera === 0) {
                                distanceToCamera = center.distanceTo(this.camera.position);
                            }
                            if (distanceToCamera > radius * 100) { // If very far, assume not visible
                                visible = false;
                            } else {
                                visible = this._frustum.intersectsSphere({ center, radius });
                            }
                        } else {
                            visible = this._frustum.intersectsObject(mesh);
                        }
                    }
                }
                
                // Cache the result
                this._visibilityCache.set(bodyId, {
                    visible,
                    lastCheck: now,
                    boundingSphere: mesh.geometry?.boundingSphere
                });
                
                return visible;
            };

            // Throttle UI-only updates to every 3rd frame
            this._frameCount = (this._frameCount + 1) % 3;
            const shouldUpdateUI = this._frameCount === 0;

            // Only update visible bodies when camera, sun, or planet moved
            if (Array.isArray(this.celestialBodies)) {
                // Pre-filter visible bodies to avoid checking every frame
                if (cameraMoved || this._visibleBodies.size === 0) {
                    this._visibleBodies.clear();
                    this.celestialBodies.forEach(body => {
                        if (body.getMesh) {
                            const mesh = body.getMesh();
                            const bodyId = body.name || body.id || Math.random().toString(36);
                            if (mesh && isVisible(mesh, bodyId)) {
                                this._visibleBodies.add(body);
                            }
                        }
                    });
                }

                // Only process visible bodies
                for (const body of this._visibleBodies) {
                    const mesh = body.getMesh();
                    if (!mesh) continue;

                    // Cache world position with smart update
                    const bodyId = body.name || body.id;
                    let cachedPos = this._bodyWorldPositions.get(bodyId);
                    if (!cachedPos) {
                        // Check cache size limit before adding new entries
                        if (this._bodyWorldPositions.size >= this._maxCacheEntries) {
                            // Remove oldest entry (first one in Map)
                            const firstKey = this._bodyWorldPositions.keys().next().value;
                            this._bodyWorldPositions.delete(firstKey);
                        }
                        cachedPos = new THREE.Vector3();
                        this._bodyWorldPositions.set(bodyId, cachedPos);
                    }

                    mesh.getWorldPosition(this._tempWorldPos);
                    const planetMoved = cachedPos.distanceTo(this._tempWorldPos) > this._updateThreshold;
                    if (planetMoved) {
                        cachedPos.copy(this._tempWorldPos);
                    }

                    // Only update uniforms if something changed
                    if (typeof body.updateAtmosphereUniforms === 'function') {
                        if (cameraMoved || sunMoved || planetMoved) {
                            body.updateAtmosphereUniforms(this.camera, this.sun);
                        }
                    }

                    // UI updates remain throttled
                    if (shouldUpdateUI) {
                        if (typeof body.updateRadialGridFading === 'function' && (cameraMoved || planetMoved)) {
                            body.updateRadialGridFading(this.camera);
                        }
                        if (typeof body.updateSurfaceFading === 'function' && (cameraMoved || planetMoved)) {
                            body.updateSurfaceFading(this.camera);
                        }
                    }
                }
            }
            // Preview node(s)
            const previewNodes = [this.previewNode, ...(Array.isArray(this.previewNodes) ? this.previewNodes : [])].filter(Boolean);
            previewNodes.forEach(node => {
                if (!node.getMesh) return;
                const mesh = node.getMesh();
                if (!mesh) return;
                if (!isVisible(mesh)) return;
                if (!mesh._lastWorldPos) mesh._lastWorldPos = new THREE.Vector3();
                mesh.getWorldPosition(this._tempWorldPos);
                const nodeMoved = !mesh._lastWorldPos.equals(this._tempWorldPos);
                mesh._lastWorldPos.copy(this._tempWorldPos);
                if (typeof node.updateAtmosphereUniforms === 'function') {
                    if (cameraMoved || sunMoved || nodeMoved) {
                        node.updateAtmosphereUniforms(this.camera, this.sun);
                    }
                }
                if (shouldUpdateUI && typeof node.updateRadialGridFading === 'function') {
                    if (cameraMoved || nodeMoved) {
                        node.updateRadialGridFading(this.camera);
                    }
                }
                if (shouldUpdateUI && typeof node.updateSurfaceFading === 'function') {
                    if (cameraMoved || nodeMoved) {
                        node.updateSurfaceFading(this.camera);
                    }
                }
            });

            // Satellite vectors are now handled by individual SatelliteVectorVisualizer instances
            // No global update needed - each satellite manages its own vectors

            // Update satellite communications connections if enabled (throttled)
            if (this.lineOfSightManager?.isEnabled()) {
                // Only update every 10 frames (about 6 times per second at 60fps)
                if (this._frameCount % 10 === 0) {
                    // Use requestIdleCallback to avoid blocking main thread
                    if (window.requestIdleCallback) {
                        window.requestIdleCallback(() => {
                            this._syncConnectionsWorker();
                        }, { timeout: 16 }); // Max 16ms delay
                    } else {
                        this._syncConnectionsWorker();
                    }
                }
            }

            // Update background stars to handle FOV changes
            if (this.backgroundStars?.update) {
                this.backgroundStars.update();
            }

            this.labelRenderer?.render?.(this.scene, this.camera);
            
            // Advanced frame timing for adaptive performance
            if (this._adaptiveThrottling) {
                this._updateFrameTimingMetrics(delta);
                
                // Feed performance data to display settings manager for auto-quality
                if (this._displaySettingsManager?.monitorPerformance) {
                    this._displaySettingsManager.monitorPerformance(delta * 1000);
                }
            }
            
            this.stats?.end();
        } catch (error) {
            console.error('[App3D] tick() error:', error);
            this.stats?.end();
            // Don't re-throw to prevent animation loop from stopping
        }
    }

    /**
     * Helper method for hierarchical culling
     */
    _checkParentVisibility(parent) {
        // Traverse up the hierarchy to check if any parent is invisible
        let current = parent;
        while (current) {
            if (current.visible === false) {
                return false;
            }
            current = current.parent;
        }
        return true;
    }

    /**
     * Update frame timing metrics for adaptive performance
     */
    _updateFrameTimingMetrics(delta) {
        const frameTime = delta * 1000; // Convert to ms
        this._frameTimeBuffer[this._frameTimeIndex] = frameTime;
        this._frameTimeIndex = (this._frameTimeIndex + 1) % this._frameTimeBuffer.length;
        
        // Calculate average frame time
        const avgFrameTime = this._frameTimeBuffer.reduce((a, b) => a + b, 0) / this._frameTimeBuffer.length;
        
        // Adjust update thresholds based on performance
        if (avgFrameTime > 20) { // Above 60fps target
            this._updateThreshold = Math.min(this._updateThreshold * 1.1, 1.0); // Increase threshold to reduce updates
            this._frustumCacheTimeout = Math.min(this._frustumCacheTimeout * 1.1, 1000);
        } else if (avgFrameTime < 14) { // Well above 60fps
            this._updateThreshold = Math.max(this._updateThreshold * 0.9, 0.05); // Decrease threshold for better quality
            this._frustumCacheTimeout = Math.max(this._frustumCacheTimeout * 0.9, 100);
        }
    }

    /**
     * Centralized distance cache system - MASSIVE performance optimization
     * Calculates all camera-to-object distances once per frame when camera moves
     */
    _updateDistanceCache() {
        if (!this.camera) return;
        
        this._distanceCacheFrameId++;
        const cameraPos = this.camera.position;
        
        // Check if camera moved significantly
        const cameraMovement = this._lastCameraPosition.distanceTo(cameraPos);
        if (cameraMovement < this._cameraMovementThreshold && this._distanceCache.size > 0) {
            return; // Skip update if camera hasn't moved much
        }
        
        this._lastCameraPosition.copy(cameraPos);
        
        // Clear old cache entries
        this._distanceCache.clear();
        
        // Pre-calculate distances for all scene objects
        const tempPos = new THREE.Vector3();
        
        // Cache distances for celestial bodies
        if (Array.isArray(this.celestialBodies)) {
            this.celestialBodies.forEach(body => {
                if (body.getMesh) {
                    const mesh = body.getMesh();
                    if (mesh) {
                        mesh.getWorldPosition(tempPos);
                        const distanceSquared = cameraPos.distanceToSquared(tempPos);
                        const distance = Math.sqrt(distanceSquared);
                        const bodyId = body.name || body.id || 'unknown';
                        
                        this._distanceCache.set(bodyId, {
                            distance,
                            distanceSquared,
                            position: tempPos.clone(),
                            frameId: this._distanceCacheFrameId
                        });
                    }
                }
            });
        }
        
        // Cache distances for satellites
        if (this.satellites?.getSatellitesMap) {
            const satelliteMap = this.satellites.getSatellitesMap();
            for (const [satId, satellite] of satelliteMap) {
                if (satellite.mesh) {
                    satellite.mesh.getWorldPosition(tempPos);
                    const distanceSquared = cameraPos.distanceToSquared(tempPos);
                    const distance = Math.sqrt(distanceSquared);
                    
                    this._distanceCache.set(`satellite_${satId}`, {
                        distance,
                        distanceSquared,
                        position: tempPos.clone(),
                        frameId: this._distanceCacheFrameId
                    });
                }
            }
        }
        
        // Cache distance for the sun
        if (this.sun && this.sun.sun) {
            this.sun.sun.getWorldPosition(tempPos);
            const distanceSquared = cameraPos.distanceToSquared(tempPos);
            const distance = Math.sqrt(distanceSquared);
            
            this._distanceCache.set('sun', {
                distance,
                distanceSquared,
                position: tempPos.clone(),
                frameId: this._distanceCacheFrameId
            });
        }
        
        // Cache distance for POI indicator if it exists
        if (this._poiIndicator) {
            this._poiIndicator.getWorldPosition(tempPos);
            const distanceSquared = cameraPos.distanceToSquared(tempPos);
            const distance = Math.sqrt(distanceSquared);
            
            this._distanceCache.set('poi_indicator', {
                distance,
                distanceSquared,
                position: tempPos.clone(),
                frameId: this._distanceCacheFrameId
            });
        }
        
        // Cache distances for other scene objects (POIs, etc.)
        if (this.pickablePoints?.length) {
            this.pickablePoints.forEach((mesh, index) => {
                if (mesh.visible) {
                    mesh.getWorldPosition(tempPos);
                    const distanceSquared = cameraPos.distanceToSquared(tempPos);
                    const distance = Math.sqrt(distanceSquared);
                    
                    this._distanceCache.set(`poi_${index}`, {
                        distance,
                        distanceSquared,
                        position: tempPos.clone(),
                        frameId: this._distanceCacheFrameId
                    });
                }
            });
        }
    }

    /**
     * Get cached distance to camera for an object
     * @param {string} objectId - Unique identifier for the object
     * @param {THREE.Vector3} [fallbackPosition] - Fallback position if not cached
     * @returns {number} Distance to camera
     */
    getDistanceToCamera(objectId, fallbackPosition = null) {
        const cached = this._distanceCache.get(objectId);
        if (cached && cached.frameId === this._distanceCacheFrameId) {
            return cached.distance;
        }
        
        // Fallback: calculate directly if not cached
        if (fallbackPosition && this.camera) {
            return this.camera.position.distanceTo(fallbackPosition);
        }
        
        return 0;
    }

    /**
     * Get cached squared distance to camera (avoids sqrt for comparisons)
     * @param {string} objectId - Unique identifier for the object
     * @param {THREE.Vector3} [fallbackPosition] - Fallback position if not cached
     * @returns {number} Squared distance to camera
     */
    getDistanceToCameraSquared(objectId, fallbackPosition = null) {
        const cached = this._distanceCache.get(objectId);
        if (cached && cached.frameId === this._distanceCacheFrameId) {
            return cached.distanceSquared;
        }
        
        // Fallback: calculate directly if not cached  
        if (fallbackPosition && this.camera) {
            return this.camera.position.distanceToSquared(fallbackPosition);
        }
        
        return 0;
    }

    /**
     * Set up integration between PhysicsEngine satellite events and SatelliteCommsManager
     */
    _setupSatelliteCommsIntegration() {
        if (!this.physicsIntegration || !this.satelliteCommsManager) {
            console.warn('[App3D] Cannot set up comms integration - missing physics or comms manager');
            return;
        }

        // Create bound event handlers for proper cleanup
        this._handleSatelliteAdded = (event) => {
            const satellite = event.detail;

            // Get communication config from satellite if available
            const commsConfig = satellite.commsConfig || { preset: 'cubesat', enabled: true };

            // Create communication system in SatelliteCommsManager
            this.satelliteCommsManager.createCommsSystem(satellite.id, commsConfig);
        };

        this._handleSatelliteRemoved = (event) => {
            const satelliteId = event.detail.id;

            // Remove communication system from SatelliteCommsManager
            this.satelliteCommsManager.removeCommsSystem(satelliteId);
        };

        // Listen for satellite added/removed events from PhysicsEngine
        window.addEventListener('satelliteAdded', this._handleSatelliteAdded);
        window.addEventListener('satelliteRemoved', this._handleSatelliteRemoved);

    }

    /**
     * Get ground stations (delegated to GroundStationService)
     * @returns {Array} Array of ground station objects
     */
    get groundStations() {
        return GroundStationService.getAllGroundStations();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 12. EXPORT
// ──────────────────────────────────────────────────────────────────────────────
export default App3D;
