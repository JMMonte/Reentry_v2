// app3d.js ─ refactored drop-in
// ──────────────────────────────────────────────────────────────────────────────
// 1. IMPORTS
// ──────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);                   // use Z-up globally

// External helpers
// import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Stats from 'stats.js';

// Core utilities & constants
import { Constants } from './utils/Constants.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/textureManager.js';

// Managers & engines
import { SatelliteManager } from './managers/SatelliteManager.js';
import { DisplaySettingsManager } from './managers/DisplaySettingsManager.js';
import { SceneManager } from './managers/SceneManager.js';
import { SimulationStateManager } from './managers/SimulationStateManager.js';
import { SimulationLoop } from './simulation/SimulationLoop.js';
import { SocketManager } from './managers/SocketManager.js';

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

import { celestialBodiesConfig } from './config/celestialBodiesConfig.js';
// import { setupSocketListeners } from './setup/setupListeners.js'; // removed socket.io listener setup
import { initSimStream } from './simulation/simSocket.js';

// Domain helpers
import {
    createSatelliteFromLatLon,
    createSatelliteFromOrbitalElements,
    createSatelliteFromLatLonCircular,
    getVisibleLocationsFromOrbitalElements as computeVisibleLocations
}
    from './components/Satellite/createSatellite.js';
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

    constructor() {
        super();
        console.log('[App3D] constructor');

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
        this._satellites = new SatelliteManager(this);
        this.sceneManager = new SceneManager(this);
        this.simulationStateManager = new SimulationStateManager(this);
        this.socketManager = new SocketManager(this);

        // — Misc util — --------------------------------------------------------
        this._timeUtils = new TimeUtils({ simulatedTime: new Date().toISOString() });
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
        this.celestialBodiesConfig = celestialBodiesConfig;
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

    // ──────────────────────────────────────────────────────────────────────────
    // 4. LIFE-CYCLE
    // ──────────────────────────────────────────────────────────────────────────
    /**
     * Bootstrap the entire 3-D stack.
     * Call exactly once right after constructing `App3D`.
     */
    async init() {
        console.log('[App3D] init start');
        try {
            this._setupCameraAndRenderer();
            await this.sceneManager.init();

            this._initPOIPicking();
            this._setupControls();

            // Physics worker (latency-hiding)
            this.satellites._initPhysicsWorker?.();

            // Time controls

            this._injectStatsPanel();
            this._wireResizeListener();
            // Live sim stream: planetary & simulation state from backend
            await initSimStream(this, 'ECLIPJ2000');

            // Enable axis and vector visualization for all planets
            this.planetVectors = [];
            if (this.celestialBodies) {
                for (const planet of this.celestialBodies) {
                    if (planet && typeof planet.setAxisVisible === 'function') {
                        planet.setAxisVisible(true);
                    }
                    // Only add vectors for planets with a mesh and rotationGroup
                    if (planet && planet.getMesh && planet.rotationGroup && this._scene) {
                        const vec = new PlanetVectors(planet, this._scene, { name: planet.name, scale: planet.radius * 2 });
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

            this._isInitialized = true;
            this._dispatchSceneReady();
            console.log('[App3D] init done');
        } catch (err) {
            console.error('App3D init failed:', err);
            this.dispose();
            throw err;
        }
    }

    /** Release workers, Three.js resources, and DOM artefacts. */
    dispose() {
        console.log('[App3D] dispose');
        this._isInitialized = false;

        // Workers
        this._lineOfSightWorker?.terminate?.();
        this._lineOfSightWorker = null;

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
        if (!this._lineOfSightWorker) return;
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

        if (!this.scene.children.includes(this._satelliteLinks)) {
            this.scene.add(this._satelliteLinks);
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
        this.orbitManager?.onResize();

        this._resizePOIs();
    }

    // ───────── SATELLITE/STATE API (delegates to SimulationStateManager) ─────
    createSatellite(p) { return this.simulationStateManager.createSatellite(p); }
    removeSatellite(i) { return this.simulationStateManager.removeSatellite(i); }
    importSimulationState(s) { return this.simulationStateManager.importState(s); }
    exportSimulationState() { return this.simulationStateManager.exportState(); }

    // Satellite creation helpers
    createSatelliteFromLatLon(p) { return createSatelliteFromLatLon(this, p); }
    createSatelliteFromOrbitalElements(p) { return createSatelliteFromOrbitalElements(this, p); }
    createSatelliteFromLatLonCircular(p) { return createSatelliteFromLatLonCircular(this, p); }

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
    updateSelectedBody(value) {
        this.simulationLoop?.updateSelectedBody(value);
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
        this.stats?.begin();
        this.sceneManager.updateFrame?.(delta);
        this.cameraControls?.updateCameraPosition?.(delta);
        if (Array.isArray(this.celestialBodies)) {
            this.celestialBodies.forEach(planet => planet.update?.(delta));
        }
        // Preview nodes update (if any)
        if (this.previewNode) this.previewNode.update?.(delta);
        if (Array.isArray(this.previewNodes)) {
            this.previewNodes.forEach(node => node.update?.(delta));
        }
        // Render CSS2D labels (if present)
        this.labelRenderer?.render?.(this.scene, this.camera);
        this.stats?.end();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 12. EXPORT
// ──────────────────────────────────────────────────────────────────────────────
export default App3D;
