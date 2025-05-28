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
// import { LocalPhysicsProvider } from './providers/LocalPhysicsProvider.js';
// import { RemotePhysicsProvider } from './providers/RemotePhysicsProvider.js';
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

// Domain helpers
import { getVisibleLocationsFromOrbitalElements as computeVisibleLocations } from './components/Satellite/createSatellite.js';
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
        // Only use SatelliteManager, no provider
        this._satellites = new SatelliteManager(this);

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

            this._initPOIPicking();
            this._setupControls();

            // Initialize new physics system
            try {
                await this.physicsIntegration.initialize(this.timeUtils.getSimulatedTime());
                console.log('[App3D] Physics integration initialized successfully');
                
                // Initialize satellite orbit manager after physics is ready
                const { SatelliteOrbitManager } = await import('./managers/SatelliteOrbitManager.js');
                this.satelliteOrbitManager = new SatelliteOrbitManager(this);
                this.satelliteOrbitManager.initialize();
                console.log('[App3D] Satellite orbit manager initialized');
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
        console.log('[App3D] _toggleSatelliteLinks called with:', enabled);
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
        console.log('[App3D] _initLineOfSightWorker: creating worker');
        this._lineOfSightWorker = new Worker(
            new URL('./workers/lineOfSightWorker.js', import.meta.url),
            { type: 'module' }
        );
        this._lineOfSightWorker.onmessage = evt => {
            if (evt.data.type === 'CONNECTIONS_UPDATED') {
                console.log('[App3D] Worker CONNECTIONS_UPDATED:', evt.data.connections?.length);
                this._connections = evt.data.connections;
                this._updateSatelliteConnections(this._connections);
            }
        };
    }

    _syncConnectionsWorker() {
        if (!this._lineOfSightWorker || !this.physicsIntegration?.physicsEngine) return;
        const physicsEngine = this.physicsIntegration.physicsEngine;
        const sats = physicsEngine.getSatellitesForLineOfSight();
        const bodies = physicsEngine.getBodiesForLineOfSight();
        console.log('[App3D] _syncConnectionsWorker: sending', sats.length, 'sats and', bodies.length, 'bodies');
        this._lineOfSightWorker.postMessage({
            type: 'UPDATE_SCENE',
            satellites: sats,
            bodies: bodies
        });
    }

    _updateSatelliteConnections(connections) {
        console.log('[App3D] _updateSatelliteConnections called. showSatConnections:', this.displaySettingsManager.getSetting('showSatConnections'), 'connections:', connections.length);
        this._satelliteLinks.visible = true;
        this._satelliteLinks.clear();

        // if (!this.displaySettingsManager.getSetting('showSatConnections')) return; // COMMENTED OUT FOR DEBUGGING

        connections.forEach(cnx => {
            const material = new THREE.LineBasicMaterial({ color: cnx.color === 'red' ? 0xff0000 : 0x00ff00 });
            const verts = new Float32Array(cnx.points.flat().map(p => p));
            const geom = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(verts, 3));
            const line = new THREE.Line(geom, material);
            line.renderOrder = 9999;
            this._satelliteLinks.add(line);
        });

        console.log('[App3D] _satelliteLinks children after add:', this._satelliteLinks.children.length);

        if (this.sceneManager.scene && !this.sceneManager.scene.children.includes(this._satelliteLinks)) {
            this.sceneManager.scene.add(this._satelliteLinks);
            console.log('[App3D] _satelliteLinks added to scene');
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
     * Centralized per-frame update for animation loop.
     * @param {number} delta - Time since last frame in seconds
     */
    tick(delta) {
        // Get current physics state (physics is stepped by PhysicsIntegration.updateLoop)
        const latestPhysicsState = this.physicsIntegration?.physicsEngine?.getSimulationState?.();
        
        if (latestPhysicsState) {
            this.satellites.updateAllFromPhysicsState(latestPhysicsState);
            // Dispatch physics state update event for React components
            // Convert satellite states Map to object if needed
            let satelliteStates = latestPhysicsState.satellites || {};
            if (satelliteStates instanceof Map) {
                const satObj = {};
                for (const [id, sat] of satelliteStates) {
                    satObj[id] = sat;
                }
                satelliteStates = satObj;
            }
            window.dispatchEvent(new CustomEvent('physicsStateUpdate', {
                detail: {
                    satellites: satelliteStates
                }
            }));
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

        // Update satellite vectors if visible and using new implementation
        if (this.satelliteVectors?.update && this.displaySettings?.getSetting('showSatVectors')) {
            this.satelliteVectors.update();
        }
        
        this.labelRenderer?.render?.(this.scene, this.camera);
        this.stats?.end();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 12. EXPORT
// ──────────────────────────────────────────────────────────────────────────────
export default App3D;
