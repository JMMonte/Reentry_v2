// app3d.js ─ refactored drop-in
// ──────────────────────────────────────────────────────────────────────────────
// 1. IMPORTS
// ──────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);                   // use Z-up globally

// Monkey-patch to debug NaN boundingSphere issues
const origComputeBoundingSphere = THREE.BufferGeometry.prototype.computeBoundingSphere;
THREE.BufferGeometry.prototype.computeBoundingSphere = function () {
    origComputeBoundingSphere.apply(this, arguments);
    if (this.boundingSphere && isNaN(this.boundingSphere.radius)) {
        // Log stack and geometry for debugging
        console.error('NaN boundingSphere detected!', this, new Error().stack);
    }
};

// External helpers
// import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Stats from 'stats.js';

// Core utilities & constants
import { Constants } from './utils/Constants.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/textureManager.js';

// Managers & engines
import { SatelliteManager } from './managers/SatelliteManager.js';
import { LocalPhysicsProvider } from './providers/LocalPhysicsProvider.js';
import { RemotePhysicsProvider } from './providers/RemotePhysicsProvider.js';
import { DisplaySettingsManager } from './managers/DisplaySettingsManager.js';
import { SceneManager } from './managers/SceneManager.js';
import { SimulationStateManager } from './managers/SimulationStateManager.js';
import { SimulationLoop } from './simulation/SimulationLoop.js';
import { SocketManager } from './managers/SocketManager.js';

// New physics system
import { PhysicsIntegration } from './physics/PhysicsIntegration.js';

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

import { initSimStream } from './simulation/simSocket.js';

// Domain helpers
import { getVisibleLocationsFromOrbitalElements as computeVisibleLocations } from './components/Satellite/createSatellite.js';
import { Planet } from './components/planet/Planet.js';
import { PlanetVectors } from './components/planet/PlanetVectors.js';

// ──────────────────────────────────────────────────────────────────────────────
// 2. SMALL UTILITIES
// ──────────────────────────────────────────────────────────────────────────────
const KM = Constants.metersToKm;
const toKm = v => v * KM;

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
     * @param {'local' | 'remote'} [options.satellitePhysicsSource='local'] - Source for satellite physics.
     */
    constructor({ simulatedTime, satellitePhysicsSource = 'local' } = {}) {
        super();

        // Bootstrapping flag to prevent premature settings application
        this._isBootstrapping = true;

        // — Canvas & DOM — -----------------------------------------------------
        this._canvas = document.getElementById('three-canvas');
        if (!this._canvas) throw new Error('Canvas element #three-canvas not found');

        // — Internal state — ---------------------------------------------------
        /** @type {boolean} */        this._isInitialized = false;
        /** @type {THREE.Group} */    this._satelliteLinks = new THREE.Group();

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
        this.physicsIntegration = new PhysicsIntegration(this);

        // Instantiate the chosen physics provider for satellites
        let physicsProviderInstance;
        if (satellitePhysicsSource === 'remote') {
            // Pass `this` (app3d). Provider constructor will get satelliteManager via app3d.satellites.
            physicsProviderInstance = new RemotePhysicsProvider(this);
            console.log("[App3D] Using RemotePhysicsProvider for satellites.");
        } else {
            physicsProviderInstance = new LocalPhysicsProvider(this);
            console.log("[App3D] Using LocalPhysicsProvider for satellites.");
        }

        this._satellites = new SatelliteManager(this, { physicsProviderInstance });

        // At this point, if physicsProviderInstance needs a direct reference to the satelliteManager,
        // and if its constructor didn't set it up via app3d.satellites, SatelliteManager could call:
        // physicsProviderInstance.setSatelliteManager(this._satellites); // (Requires a setter on providers)
        // However, the cleaner way is for providers to use `this.app3d.satellites` in their methods.

        this.sceneManager = new SceneManager(this);
        this.simulationStateManager = new SimulationStateManager(this);
        this.socketManager = new SocketManager(this);

        // — Misc util — --------------------------------------------------------
        // Always use UTC time - new Date().toISOString() gives us UTC
        this._timeUtils = new TimeUtils({ simulatedTime: simulatedTime || new Date().toISOString() });
        this._stats = new Stats();

        // — Workers & helpers — -----------------------------------------------
        this._lineOfSightWorker = null;
        this._connectionsEnabled = false;
        this._connections = [];

        // — Event storage — ----------------------------------------------------
        this._eventHandlers = {};

        // Global listeners (bodySelected, displaySettings, …)
        setupGlobalListeners(this);

        // Attach core modules for SceneManager access
        this.Constants = Constants;
        this.Planet = Planet;
        this.THREE = THREE;

        // For animation loop optimization
        this._lastCameraPos = new THREE.Vector3();
        this._lastSunPos = new THREE.Vector3();
        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        // Frame counter for throttling UI updates
        this._frameCount = 0;

        // Listen for remote physics failure to implement fail-safe
        this._handleRemotePhysicsFailure = () => {
            // Check if the current active provider is remote before switching
            if (this.satellites?.physicsProvider instanceof RemotePhysicsProvider) {
                console.warn("[App3D] Remote physics failed. Switching to local physics as a fail-safe.");
                this.setPhysicsSource('local');
                // Optionally, inform the user via a toast or UI message that this automatic switch has occurred.
                window.dispatchEvent(new CustomEvent('showToast', { detail: 'Remote physics failed. Switched to local simulation.' }));
                // Update the UI switch to reflect the change
                if (this.displaySettingsManager) {
                    this.displaySettingsManager.updateSetting('useRemoteCompute', false);
                    // This will also trigger the _applySetting in DisplaySettingsManager,
                    // but setPhysicsSource will see the provider is already local (or becoming local)
                    // and should ideally handle this gracefully (e.g. not re-switching if already the target type).
                    // The current setPhysicsSource implementation should be fine.
                }
            } else {
                console.log("[App3D] Remote physics failure event received, but current provider is not remote. No action taken.")
            }
        };
        window.addEventListener('remotePhysicsFailed', this._handleRemotePhysicsFailure);
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
    get physicsProviderType() {
        if (this.satellites?.physicsProvider instanceof LocalPhysicsProvider) {
            return 'local';
        } else if (this.satellites?.physicsProvider instanceof RemotePhysicsProvider) {
            return 'remote';
        }
        return 'unknown';
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

            this._initPOIPicking();
            this._setupControls();

            // Initialize new physics system
            try {
                await this.physicsIntegration.initialize(this.timeUtils.getSimulatedTime());
                console.log('[App3D] Physics integration initialized successfully');
            } catch (physicsError) {
                console.warn('[App3D] Physics integration failed to initialize:', physicsError);
                // Continue without physics integration - fallback to existing systems
            }

            // Physics worker (latency-hiding)
            this.satellites._initPhysicsWorker?.();

            this._injectStatsPanel();
            this._wireResizeListener();
            
            // Try to initialize live sim stream, but don't fail if backend is unavailable
            // Skip server connection when using LocalPhysicsProvider to avoid overriding local physics
            const usingLocalPhysics = this._satellites.physicsProvider instanceof LocalPhysicsProvider;
            if (usingLocalPhysics) {
                console.log('[App3D] Using local physics, skipping server connection');
                // Initialize scene objects locally
                await this._initializeLocalScene();
            } else {
                try {
                    await initSimStream(this, 'ECLIPJ2000');
                    console.log('[App3D] Backend connection established');
                } catch (streamError) {
                    console.warn('[App3D] Backend connection failed, using local physics only:', streamError);
                    // Initialize scene objects locally as fallback
                    await this._initializeLocalScene();
                }
            }

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

            // SocketManager init & socket.io listeners disabled; using sim stream only

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
        this._lineOfSightWorker?.terminate?.();
        this._lineOfSightWorker = null;

        // Physics integration cleanup
        this.physicsIntegration?.cleanup?.();

        // Time utilities cleanup
        this._timeUtils?.dispose?.();

        // Satellites & loops
        this._satellites?.dispose?.();
        this.simulationLoop?.dispose?.();

        // Scene graph
        this.sceneManager?.dispose?.();

        // Listeners
        this._removeWindowResizeListener();
        window.removeEventListener('remotePhysicsFailed', this._handleRemotePhysicsFailure);
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
    // 8. SATELLITE CONNECTIONS WORKER
    // ──────────────────────────────────────────────────────────────────────────
    _toggleSatelliteLinks(enabled) {
        this._connectionsEnabled = enabled;
        if (enabled) {
            this._initLineOfSightWorker();
            this._syncConnectionsWorker();
        } else {
            this._lineOfSightWorker?.terminate?.();
            this._lineOfSightWorker = null;
            this._connections = [];
            this._updateSatelliteConnections([]);
        }
    }

    _initLineOfSightWorker() {
        if (this._lineOfSightWorker) return;
        this._lineOfSightWorker = new Worker(
            new URL('./workers/lineOfSightWorker.js', import.meta.url),
            { type: 'module' }
        );
        this._lineOfSightWorker.onmessage = evt => {
            if (evt.data.type === 'CONNECTIONS_UPDATED') {
                this._connections = evt.data.connections;
                this._updateSatelliteConnections(this._connections);
            }
        };
    }

    _syncConnectionsWorker() {
        if (!this._lineOfSightWorker || !this.satellites) return;
        const sats = Object.values(this.satellites.getSatellites())
            .filter(s => s?.position && s.id != null)
            .map(s => ({
                id: s.id, position: {
                    x: toKm(s.position.x), y: toKm(s.position.y), z: toKm(s.position.z)
                }
            }));
        this._lineOfSightWorker.postMessage({ type: 'UPDATE_SATELLITES', satellites: sats });
    }

    _updateSatelliteConnections(connections) {
        this._satelliteLinks.visible = true;
        this._satelliteLinks.clear();

        if (!this.displaySettingsManager.getSetting('showSatConnections')) return;

        connections.forEach(cnx => {
            const material = new THREE.LineBasicMaterial({ color: cnx.color === 'red' ? 0xff0000 : 0x00ff00 });
            const verts = new Float32Array(cnx.points.flat().map(p => p));
            const geom = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(verts, 3));
            const line = new THREE.Line(geom, material);
            line.renderOrder = 9999;
            this._satelliteLinks.add(line);
        });

        if (this.sceneManager.scene && !this.sceneManager.scene.children.includes(this._satelliteLinks)) {
            this.sceneManager.scene.add(this._satelliteLinks);
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
        // Debug log for lookup
        console.log('[App3D.createSatelliteFromLatLon] Looking up planetNaifId', p.planetNaifId, 'in', Object.keys(this.bodiesByNaifId));
        if (p.planetNaifId && this.bodiesByNaifId?.[naifIdKey]) {
            selectedBody = this.bodiesByNaifId[naifIdKey];
        }
        console.log('[App3D.createSatelliteFromLatLon] called with selectedBody:', selectedBody, 'params:', p);
        // Step 2: Call SatelliteManager
        return this.satellites.createSatelliteFromLatLon(this, p, selectedBody);
    }
    createSatelliteFromOrbitalElements(p) {
        // Step 1: Use selectedBody or fallback
        const selectedBody = p.selectedBody || this.selectedBody || { naifId: 399 };
        console.log('[App3D.createSatelliteFromOrbitalElements] called with selectedBody:', selectedBody, 'params:', p);
        // Step 2: Call SatelliteManager
        return this.satellites.createSatelliteFromOrbitalElements(this, { ...p, selectedBody });
    }
    createSatelliteFromLatLonCircular(p) {
        // Step 1: Use selectedBody or fallback
        const selectedBody = p.selectedBody || this.selectedBody || { naifId: 399 };
        console.log('[App3D.createSatelliteFromLatLonCircular] called with selectedBody:', selectedBody, 'params:', p);
        // Step 2: Call SatelliteManager
        return this.satellites.createSatelliteFromLatLonCircular(this, p, selectedBody);
    }

    getVisibleLocationsFromOrbitalElements(p) {
        const { locations, numPoints, numPeriods, ...orbit } = p;
        return computeVisibleLocations(this, orbit, locations, { numPoints, numPeriods });
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
     * Switches the physics provider between 'local' and 'remote'.
     * This will reset the current satellite simulation.
     * @param {'local' | 'remote'} source
     */
    async setPhysicsSource(source) {
        if (!source || (source !== 'local' && source !== 'remote')) {
            console.error('[App3D] Invalid physics source specified:', source);
            return;
        }

        // Check if we're already using the requested physics source
        const currentSource = this.physicsProviderType;
        if (currentSource === source) {
            console.log(`[App3D] Physics source is already set to ${source}, skipping switch`);
            return;
        }

        console.log(`[App3D] Attempting to switch physics source to: ${source}`);

        // 1. Get current state from the existing provider (if any)
        let handoverState = undefined;
        if (this.satellites?.physicsProvider?.getCurrentState) {
            handoverState = this.satellites.physicsProvider.getCurrentState();
        }

        // 2. Dispose current SatelliteManager and its provider
        this.satellites?.dispose();
        // this._satellites will be redefined below

        // 3. Instantiate the new physics provider
        let newPhysicsProviderInstance;
        if (source === 'remote') {
            newPhysicsProviderInstance = new RemotePhysicsProvider(this);
            console.log("[App3D] Using RemotePhysicsProvider for satellites.");
        } else {
            newPhysicsProviderInstance = new LocalPhysicsProvider(this);
            console.log("[App3D] Using LocalPhysicsProvider for satellites.");
        }

        // 4. If we have handover state, initialize the new provider with it
        if (handoverState && newPhysicsProviderInstance.initializeWithState) {
            newPhysicsProviderInstance.initializeWithState(handoverState);
        }

        // 5. Create a new SatelliteManager with the new provider
        this._satellites = new SatelliteManager(this, { physicsProviderInstance: newPhysicsProviderInstance });

        // 6. Update SimulationLoop with the new SatelliteManager
        if (!this._isBootstrapping) {
            if (this.simulationLoop) {
                this.simulationLoop.setSatelliteManager(this._satellites);
            } else {
                console.warn("[App3D] SimulationLoop not found during physics source switch.");
            }
        }
        // 7. Re-initialize physics worker if local provider is chosen and it needs it.
        if (source === 'local' && this.satellites._initPhysicsWorker) { // Check if the method exists on SatelliteManager
            this.satellites._initPhysicsWorker();
        }

        // Notify UI or other components that the simulation has effectively reset
        // This could involve clearing UI satellite lists, etc.
        this.updateSatelliteList(); // To clear the list if satellites are gone

        console.log(`[App3D] Physics source switched to ${source}. Satellite simulation reset.`);
        // Potentially dispatch an event or show a toast message to the user
        window.dispatchEvent(new CustomEvent('showToast', { detail: `Physics switched to ${source}. Satellites reset.` }));
    }

    /**
     * Centralized per-frame update for animation loop.
     * @param {number} delta - Time since last frame in seconds
     */
    tick(delta) {
        // Step physics and sync satellites every frame
        if (this.physicsIntegration?.stepSimulation) {
            this.physicsIntegration.stepSimulation(delta);
        }
        this.stats?.begin();
        
        this.sceneManager.updateFrame?.(delta);

        if (Array.isArray(this.celestialBodies)) {
            this.celestialBodies.forEach(planet => planet.update?.(delta));
        }

        if (this.previewNode) this.previewNode.update?.(delta);
        if (Array.isArray(this.previewNodes)) {
            this.previewNodes.forEach(node => node.update?.(delta));
        }

        this.cameraControls?.updateCameraPosition?.(delta);

        // --- Optimized per-frame updates ---
        // Track camera and sun movement
        const cameraMoved = !this._lastCameraPos.equals(this.camera.position);
        this._lastCameraPos.copy(this.camera.position);
        let sunMoved = false;
        if (this.sun && this.sun.getWorldPosition) {
            const sunPos = new THREE.Vector3();
            this.sun.getWorldPosition(sunPos);
            sunMoved = !this._lastSunPos.equals(sunPos);
            this._lastSunPos.copy(sunPos);
        }

        // Update frustum
        this._projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._projScreenMatrix);

        // Helper to check if a mesh is visible in the frustum
        const isVisible = mesh => {
            if (!mesh) return false;
            mesh.updateWorldMatrix?.(true, false);
            // Only check frustum for Meshes with geometry
            if (mesh.isMesh && mesh.geometry) {
                const pos = mesh.geometry.attributes.position;
                if (!pos || !pos.count || isNaN(pos.array[0])) {
                    // Defensive: skip meshes with invalid geometry
                    console.warn('Skipping mesh with invalid geometry for frustum check:', mesh, mesh.geometry);
                    return false;
                }
                if (!mesh.geometry.boundingSphere) {
                    mesh.geometry.computeBoundingSphere();
                }
                return this._frustum.intersectsObject(mesh);
            }
            // For Groups or objects without geometry, assume visible (or skip)
            return true;
        };

        // Throttle UI-only updates to every 3rd frame
        this._frameCount = (this._frameCount + 1) % 3;
        const shouldUpdateUI = this._frameCount === 0;

        // Only update if camera, sun, or planet moved, and if visible
        if (Array.isArray(this.celestialBodies)) {
            this.celestialBodies.forEach(body => {
                // Track if planet moved (compare world position)
                if (!body.getMesh) return;
                const mesh = body.getMesh();
                if (!mesh) return;
                if (!isVisible(mesh)) return;
                // Track last world position on the mesh
                if (!mesh._lastWorldPos) mesh._lastWorldPos = new THREE.Vector3();
                const worldPos = new THREE.Vector3();
                mesh.getWorldPosition(worldPos);
                const planetMoved = !mesh._lastWorldPos.equals(worldPos);
                mesh._lastWorldPos.copy(worldPos);

                // Atmosphere uniforms
                if (typeof body.updateAtmosphereUniforms === 'function') {
                    if (cameraMoved || sunMoved || planetMoved) {
                        body.updateAtmosphereUniforms(this.camera, this.sun);
                    }
                }
                // Radial grid fading
                if (shouldUpdateUI && typeof body.updateRadialGridFading === 'function') {
                    if (cameraMoved || planetMoved) {
                        body.updateRadialGridFading(this.camera);
                    }
                }
                // Surface fading
                if (shouldUpdateUI && typeof body.updateSurfaceFading === 'function') {
                    if (cameraMoved || planetMoved) {
                        body.updateSurfaceFading(this.camera);
                    }
                }
            });
        }
        // Preview node(s)
        const previewNodes = [this.previewNode, ...(Array.isArray(this.previewNodes) ? this.previewNodes : [])].filter(Boolean);
        previewNodes.forEach(node => {
            if (!node.getMesh) return;
            const mesh = node.getMesh();
            if (!mesh) return;
            if (!isVisible(mesh)) return;
            if (!mesh._lastWorldPos) mesh._lastWorldPos = new THREE.Vector3();
            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);
            const nodeMoved = !mesh._lastWorldPos.equals(worldPos);
            mesh._lastWorldPos.copy(worldPos);
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

        this.labelRenderer?.render?.(this.scene, this.camera);
        this.stats?.end();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 12. EXPORT
// ──────────────────────────────────────────────────────────────────────────────
export default App3D;
