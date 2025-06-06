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
import { LineOfSightManager } from './managers/LineOfSightManager.js';
import { SatelliteCommsManager } from './managers/SatelliteCommsManager.js';

// Controls
import { CameraControls } from './controls/CameraControls.js';
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

        // active pick-state
        this._poiIndicator = null;
        this._highlightedPOI = null;
        this._hoveredPOI = null;
        this._hoverSnapshot = { scale: new THREE.Vector3(), color: new THREE.Color() };
        this._poiWindowOpen = false;

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
        this.satelliteCommsManager = new SatelliteCommsManager();

        this.sceneManager = new SceneManager(this);
        this.simulationStateManager = new SimulationStateManager(this);
        
        // LineOfSightManager will be initialized after scene is ready
        this.lineOfSightManager = null;

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
        
        // Caching for performance
        this._lastFrustumUpdateFrame = -1;
        this._visibleBodies = new Set();
        this._bodyWorldPositions = new Map(); // Cache world positions
        this._lastUpdateFrame = new Map(); // Track when each body was last updated
        this._updateThreshold = 0.1; // Min distance change to trigger update (km)
        this._maxCacheEntries = 100; // Safety limit for position cache
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

            // Initialize LineOfSightManager after scene is ready
            this.lineOfSightManager = new LineOfSightManager(
                this.sceneManager.scene,
                this._displaySettingsManager,
                this.physicsIntegration
            );

            this._initPOIPicking();
            this._setupControls();

            // Initialize simulation controller for centralized time/state management
            const { SimulationController } = await import('./simulation/SimulationController.js');
            this.simulationController = new SimulationController(this);
            await this.simulationController.initialize();

            // Initialize new physics system
            try {
                await this.physicsIntegration.initialize(this.timeUtils.getSimulatedTime());
                console.log('[App3D] Physics integration initialized successfully');
                
                // Initialize satellite orbit manager after physics is ready
                const { SatelliteOrbitManager } = await import('./managers/SatelliteOrbitManager.js');
                this.satelliteOrbitManager = new SatelliteOrbitManager(this);
                this.satelliteOrbitManager.initialize();
                console.log('[App3D] Satellite orbit manager initialized');
                
                // Set up satellite communication system integration
                this._setupSatelliteCommsIntegration();
            } catch (physicsError) {
                console.warn('[App3D] Physics integration failed to initialize:', physicsError);
                // Continue without physics integration - fallback to existing systems
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
                        const vec = new PlanetVectors(planet, this.sceneManager.scene, { name: planet.name, scale: planet.radius * 2 });
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
            const { createSceneObjects } = await import('./setup/setupScene.js');
            await createSceneObjects(this);
            this.sceneObjectsInitialized = true;
            
            if (this.cameraControls && typeof this.cameraControls.follow === 'function') {
                this.cameraControls.follow('Earth', this, true);
            }
            
            // Dispatch scene ready event
            window.dispatchEvent(new CustomEvent('sceneReadyFromBackend'));
            console.log('[App3D] Scene initialized locally');
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

        // Physics integration cleanup
        this.physicsIntegration?.cleanup?.();

        // Time utilities cleanup
        this._timeUtils?.dispose?.();

        // Satellites & loops
        this._satellites?.dispose?.();
        this.simulationLoop?.dispose?.();
        
        // Satellite orbit manager
        this.satelliteOrbitManager?.dispose?.();
        
        // Satellite communications manager
        this.satelliteCommsManager?.dispose?.();
        
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
        import('./components/Satellite/GroundtrackPath.js').then(module => {
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
        this.cameraControls = new CameraControls(this._camera, this._controls);
    }

    _initPOIPicking() {
        // collect every pickable point once planets exist
        this.pickablePoints = [];
        Planet.instances?.forEach(p => {
            const pts = p.surface?.points;
            if (pts) Object.values(pts).flat().forEach(m => this.pickablePoints.push(m));
        });

        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 1;

        // event throttling
        let pending = false;
        const onMove = evt => {
            if (pending) return;
            pending = true;
            requestAnimationFrame(() => {
                this._handlePointerMove(evt);
                pending = false;
            });
        };
        this.canvas.addEventListener('pointermove', onMove);
        this.canvas.addEventListener('pointerdown', this._handlePointerDown.bind(this));
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
        console.log('[App3D] _toggleSatelliteLinks called with:', enabled);
        this.lineOfSightManager.setEnabled(enabled);
        if (enabled) {
            this._syncConnectionsWorker();
        }
    }

    _syncConnectionsWorker() {
        if (!this.physicsIntegration?.physicsEngine) {
            console.log('[App3D] No physics engine available');
            return;
        }
        
        const physicsEngine = this.physicsIntegration.physicsEngine;
        const sats = physicsEngine.getSatellitesForLineOfSight();
        const bodies = physicsEngine.getBodiesForLineOfSight();
        
        if (this.lineOfSightManager) {
            this.lineOfSightManager.updateConnections(sats, bodies, []);
        } else {
            console.log('[App3D] LineOfSightManager not initialized');
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. POINTER INTERACTION WITH POIs
    // ──────────────────────────────────────────────────────────────────────────
    _handlePointerMove(evt) {
        if (this._poiWindowOpen) { document.body.style.cursor = ''; return; }

        const mouse = this._getMouseNDC(evt);
        this.raycaster.setFromCamera(mouse, this.camera);

        const hit = this.pickablePoints.find(m => m.visible &&
            this.raycaster.intersectObject(m, false).length);

        // restore previous
        if (this._hoveredPOI && this._hoveredPOI !== hit) {
            this._hoveredPOI.scale.copy(this._hoverSnapshot.scale);
            this._hoveredPOI.material.color.copy(this._hoverSnapshot.color);
        }

        // apply new hover
        if (hit && this._hoveredPOI !== hit) {
            this._hoverSnapshot = { scale: hit.scale.clone(), color: hit.material.color.clone() };
            hit.scale.multiplyScalar(1.2);
            hit.material.color.offsetHSL(0, 0, 0.3);
        }
        this._hoveredPOI = hit;
        document.body.style.cursor = hit ? 'pointer' : '';
    }

    _handlePointerDown(evt) {
        const mouse = this._getMouseNDC(evt);
        this.raycaster.setFromCamera(mouse, this.camera);

        for (const mesh of this.pickablePoints) {
            if (!mesh.visible) continue;
            if (this.raycaster.intersectObject(mesh, false).length) {
                const { feature, category } = mesh.userData;
                window.dispatchEvent(new CustomEvent('earthPointClick', { detail: { feature, category } }));
                break;
            }
        }
    }

    _getMouseNDC(evt) {
        const { left, top, width, height } = this.canvas.getBoundingClientRect();
        return new THREE.Vector2(
            ((evt.clientX - left) / width) * 2 - 1,
            -((evt.clientY - top) / height) * 2 + 1
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10.  UI SCALES
    // ──────────────────────────────────────────────────────────────────────────
    _resizePOIs() {
        if (!this.pickablePoints?.length) return;

        const pixelSize = 8;
        const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
        const halfH = window.innerHeight;

        const tmp = new THREE.Vector3();
        const scaleFor = dist =>
            (2 * Math.tan(vFOV / 2) * dist) * (pixelSize / halfH);

        this.pickablePoints.forEach(mesh => {
            if (!mesh.visible) return;
            mesh.getWorldPosition(tmp);
            const s = scaleFor(tmp.distanceTo(this.camera.position));
            mesh.scale.set(s, s, 1);
        });

        if (this._poiIndicator) {
            this._poiIndicator.getWorldPosition(tmp);
            const s = scaleFor(tmp.distanceTo(this.camera.position)) * 1.2;
            this._poiIndicator.scale.set(s, s, 1);
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

    // ───────── SATELLITE/STATE API (delegates to SimulationStateManager) ─────
    createSatellite(p) { return this.simulationStateManager.createSatellite(p); }
    removeSatellite(i) { return this.simulationStateManager.removeSatellite(i); }
    importSimulationState(s) { return this.simulationStateManager.importState(s); }
    exportSimulationState() { return this.simulationStateManager.exportState(); }

    // Satellite creation helpers
    createSatelliteFromLatLon(p) {
        // Use planetNaifId from p if present, otherwise fallback
        let selectedBody = this.selectedBody || { naifId: 399 };
        const naifIdKey = String(p.planetNaifId);
        if (p.planetNaifId && this.bodiesByNaifId?.[naifIdKey]) {
            selectedBody = this.bodiesByNaifId[naifIdKey];
        }
        // Step 2: Call SatelliteManager
        return this.satellites.createSatelliteFromLatLon(this, p, selectedBody);
    }
    createSatelliteFromOrbitalElements(p) {
        // Step 1: Use selectedBody or fallback
        const selectedBody = p.selectedBody || this.selectedBody || { naifId: 399 };
        // Step 2: Call SatelliteManager
        return this.satellites.createSatelliteFromOrbitalElements(this, { ...p, selectedBody });
    }
    createSatelliteFromLatLonCircular(p) {
        // Step 1: Use selectedBody or fallback
        const selectedBody = p.selectedBody || this.selectedBody || { naifId: 399 };
        // Step 2: Call SatelliteManager
        return this.satellites.createSatelliteFromLatLonCircular(this, p, selectedBody);
    }

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

        // Helper to check if a mesh is visible in the frustum
        const isVisible = mesh => {
            if (!mesh) return false;
            mesh.updateWorldMatrix?.(true, false);
            // Only check frustum for Meshes with geometry
            if (mesh.isMesh && mesh.geometry) {
                const pos = mesh.geometry.attributes.position;
                if (!pos || !pos.count || isNaN(pos.array[0])) {
                    // Skip invalid geometry silently in production
                    return false;
                }
                if (!mesh.geometry.boundingSphere) {
                    mesh.geometry.computeBoundingSphere();
                }
                return this._frustum.intersectsObject(mesh);
            }
            // For Groups or objects without geometry, assume visible
            return true;
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
                        if (mesh && isVisible(mesh)) {
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

        // Update satellite vectors if visible and using new implementation
        if (this.satelliteVectors?.update && this.displaySettings?.getSetting('showSatVectors')) {
            this.satelliteVectors.update();
        }
        
        this.labelRenderer?.render?.(this.scene, this.camera);
        this.stats?.end();
        } catch (error) {
            console.error('[App3D] tick() error:', error);
            this.stats?.end();
            // Don't re-throw to prevent animation loop from stopping
        }
    }
    
    /**
     * Set up integration between PhysicsEngine satellite events and SatelliteCommsManager
     */
    _setupSatelliteCommsIntegration() {
        if (!this.physicsIntegration?.physicsEngine || !this.satelliteCommsManager) {
            console.warn('[App3D] Cannot set up comms integration - missing physics or comms manager');
            return;
        }
        
        // Listen for satellite added events from PhysicsEngine
        window.addEventListener('satelliteAdded', (event) => {
            const satellite = event.detail;
            console.log(`[App3D] Setting up communications for satellite ${satellite.id}`);
            
            // Get communication config from satellite if available
            const commsConfig = satellite.commsConfig || { preset: 'cubesat' };
            
            // Create communication system in SatelliteCommsManager
            this.satelliteCommsManager.createCommsSystem(satellite.id, commsConfig);
        });
        
        // Listen for satellite removed events
        window.addEventListener('satelliteRemoved', (event) => {
            const satelliteId = event.detail.id;
            console.log(`[App3D] Removing communications for satellite ${satelliteId}`);
            
            // Remove communication system from SatelliteCommsManager
            this.satelliteCommsManager.removeCommsSystem(satelliteId);
        });
        
        console.log('[App3D] Satellite communications integration set up successfully');
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 12. EXPORT
// ──────────────────────────────────────────────────────────────────────────────
export default App3D;
