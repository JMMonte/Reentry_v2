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
        this.stats?.begin();

        const timestamp = performance.now();
        this.timeUtils.update(timestamp);
        const currentTime = this.timeUtils.getSimulatedTime();
        const delta = (timestamp - this._lastTime) / 1000;
        this._lastTime = timestamp;
        const warpedDelta = delta * this.timeUtils.timeWarp;

        // Update simulation bodies
        this.satellites.updateAll(currentTime, delta, warpedDelta);
        // Log before calling app.updateScene
        // console.log(`SimLoop: Calling app.updateScene at ${currentTime.toISOString()}`);
        this.app.updateScene(currentTime);
        // Then sync camera to follow updated body position
        this.cameraControls.updateCameraPosition();

        // Update planet vector label fading
        if (this.app?.planetVectors) {
            this.app.planetVectors.forEach(pv => pv.updateFading(this.sceneManager.camera));
        }

        // Preview node update (throttled to 10Hz)
        if (this.app.previewNode) {
            const now = performance.now();
            if (now - this._lastPreviewUpdateTime > 100) {
                this.app.previewNode.update();
                this._lastPreviewUpdateTime = now;
            }
            this.app.previewNode.predictedOrbit.setVisible(true);
        }

        // Bulk preview nodes update (for array of previewNodes)
        if (Array.isArray(this.app.previewNodes) && this.app.previewNodes.length) {
            const now2 = performance.now();
            this.app.previewNodes.forEach(node => {
                // throttle each preview update to 10Hz
                if ((node._lastPredTime ?? 0) < now2 - 100) {
                    node.update();
                    node._lastPredTime = now2;
                }
                // ensure preview orbit remains visible
                if (node.predictedOrbit) node.predictedOrbit.orbitLine.visible = true;
            });
        }

        // Throttle radial grid fading (10Hz)
        if (this.sceneManager.radialGrid && timestamp - this._lastFadingTime > 100) {
            this.sceneManager.radialGrid.updateFading(this.sceneManager.camera);
            this._lastFadingTime = timestamp;
        }

        // Render scene
        if (this.sceneManager.composers.final) {
            this.sceneManager.composers.final.render();
        } else {
            this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);
        }

        // Render CSS2D labels every frame for smooth updates
        if (this.sceneManager.labelRenderer) {
            this.sceneManager.labelRenderer.render(this.sceneManager.scene, this.sceneManager.camera);
        }

        this.stats?.end();
    }
} 