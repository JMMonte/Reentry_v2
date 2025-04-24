/**
 * Manages the animation and simulation update loop for the 3D app.
 */
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
        // Timestamp for throttling preview node updates
        this._lastPreviewUpdateTime = 0;
        this.satellites = satellites;
        this.sceneManager = sceneManager;
        this.cameraControls = cameraControls;
        this.timeUtils = timeUtils;
        this.stats = stats;
        this._running = false;
        this._lastTime = performance.now();
        this._frameId = null;
        // Timestamps for throttling UI updates
        this._lastFadingTime = 0;
        this._lastLabelTime = 0;
    }

    /** Start the animation/simulation loop. */
    start() {
        if (this._running) return;
        this._running = true;
        this._lastTime = performance.now();
        this._animate();
    }

    /** Stop the animation/simulation loop. */
    stop() {
        this._running = false;
        if (this._frameId) {
            cancelAnimationFrame(this._frameId);
            this._frameId = null;
        }
    }

    /** Dispose of the loop and cleanup. */
    dispose() {
        this.stop();
    }

    /** The main animation frame callback. */
    _animate() {
        if (!this._running) return;
        this._frameId = requestAnimationFrame(() => this._animate());
        if (this.stats) this.stats.begin();

        const timestamp = performance.now();
        this.timeUtils.update(timestamp);
        const currentTime = this.timeUtils.getSimulatedTime();
        const realDeltaTime = (timestamp - this._lastTime) / 1000;
        this._lastTime = timestamp;
        const warpedDeltaTime = realDeltaTime * this.timeUtils.timeWarp;

        // Update controls
        if (this.app._controls && typeof this.app._controls.update === 'function') {
            this.app._controls.update();
        }

        // Update satellites
        this.satellites.updateAll(currentTime, realDeltaTime, warpedDeltaTime);

        // Update scene
        if (typeof this.app.updateScene === 'function') {
            this.app.updateScene(currentTime);
        }

        // Preview node: update its position, arrow, and predicted orbit if present
        if (this.app.previewNode) {
            const nowPv = performance.now();
            // Throttle preview updates to 10 Hz
            if (!this._lastPreviewUpdateTime || nowPv - this._lastPreviewUpdateTime > 100) {
                try {
                    this.app.previewNode.update();
                } catch (e) {
                    console.warn('Preview node update error:', e);
                }
                this._lastPreviewUpdateTime = nowPv;
            }
            // Always ensure it's visible
            this.app.previewNode.predictedOrbit.setVisible(true);
        }

        // Update camera controls
        if (this.cameraControls && typeof this.cameraControls.updateCameraPosition === 'function') {
            this.cameraControls.updateCameraPosition();
        }

        // Throttle fading of radial grid labels (max ~10Hz)
        if (this.sceneManager.radialGrid && typeof this.sceneManager.radialGrid.updateFading === 'function') {
            if (!this._lastFadingTime || timestamp - this._lastFadingTime > 100) {
                this.sceneManager.radialGrid.updateFading(this.sceneManager.camera);
                this._lastFadingTime = timestamp;
            }
        }

        // Render scene
        if (this.sceneManager.composers.final) {
            this.sceneManager.composers.final.render();
        } else if (this.sceneManager.renderer && this.sceneManager.scene && this.sceneManager.camera) {
            this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);
        }

        // Throttle label rendering (max ~10Hz)
        if (this.sceneManager.labelRenderer) {
            if (!this._lastLabelTime || timestamp - this._lastLabelTime > 100) {
                this.sceneManager.labelRenderer.render(this.sceneManager.scene, this.sceneManager.camera);
                this._lastLabelTime = timestamp;
            }
        }

        if (this.stats) this.stats.end();
    }
} 