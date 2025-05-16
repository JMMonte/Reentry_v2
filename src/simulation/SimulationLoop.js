/**
 * Manages the animation and simulation update loop for the 3D app.
 */
import { Clock } from 'three';

export class SimulationLoop {
    /**
     * @param {Object} options
     * @param {App3D} options.app - Reference to the main App3D instance
     * @param {SatelliteManager} options.satellites
     * @param {SceneManager} options.sceneManager
     * @param {CameraControls} options.cameraControls
     * @param {TimeUtils} options.timeUtils
     * @param {Stats} [options.stats]
     */
    constructor({ app, satellites, sceneManager, cameraControls, timeUtils, stats }) {
        this.app = app;
        this.satellites = satellites;
        this.sceneManager = sceneManager;
        this.cameraControls = cameraControls;
        this.timeUtils = timeUtils;
        this.stats = stats;
        this.clock = new Clock();
        this._running = false;
        this._lastTime = performance.now();
        this._frameId = null;
        this._lastLabelTime = 0;
    }

    /** Start the animation/simulation loop. */
    start() {
        if (this._running) return;
        this._running = true;
        this.app.renderer.setAnimationLoop(this._animate.bind(this));
    }

    /** Stop the animation/simulation loop. */
    stop() {
        this._running = false;
        this.app.renderer.setAnimationLoop(null);
    }

    /** Dispose of the loop and cleanup. */
    dispose() {
        this.stop();
    }

    /** The main animation frame callback. */
    _animate() {
        const delta = this.clock.getDelta();
        this.app.tick?.(delta);

        // Update TimeUtils for smooth time progression
        if (this.timeUtils && typeof this.timeUtils.update === 'function') {
            this.timeUtils.update();
        }

        // Render scene
        if (this.sceneManager.composers.final) {
            this.sceneManager.composers.final.render();
        } else {
            this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);
        }
    }

    /** Update the satellite list and notify UI. */
    updateSatelliteList() {
        const list = Object.fromEntries(
            Object.entries(this.satellites.getSatellites())
                .filter(([, s]) => s && s.id != null && s.name)
                .map(([id, s]) => [id, { id: s.id, name: s.name }])
        );
        document.dispatchEvent(new CustomEvent('satelliteListUpdated', { detail: { satellites: list } }));
        if (this.app._connectionsEnabled) this.app._syncConnectionsWorker();
    }

    /** Update camera to follow a new body selection. */
    updateSelectedBody(value, suppressLog = false) {
        this.app.cameraControls?.follow(value, this.app, suppressLog);
    }

    /** Update display setting and propagate to relevant managers. */
    updateDisplaySetting(key, value) {
        this.app.displaySettingsManager.updateSetting(key, value);
        switch (key) {
            case 'showSatConnections':
                this.app._toggleSatelliteLinks(value);
                break;
            case 'physicsTimeStep':
                this.satellites.setPhysicsTimeStep(value);
                break;
            case 'sensitivityScale':
                this.satellites.setSensitivityScale(value);
                break;
            case 'usePhysics':
                // No specific action needed, physics is always on
                break;
            // case 'useAstronomy':
            //     // removed: physicsWorld not used
            //     break;
            case 'showAxis':
                if (Array.isArray(this.app.planetVectors)) {
                    this.app.planetVectors.forEach(v => v.setAxesVisible(value));
                } else if (this.app.planetVectors) {
                    this.app.planetVectors.setAxesVisible(value);
                }
                break;
            default:
                // Handle other cases if needed
                break;
        }
    }
} 