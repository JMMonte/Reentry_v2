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

    /**
     * Throttled update for preview nodes: calls update() no more than 10Hz, and ensures predictedOrbit is visible.
     * @param {Object} node
     * @param {number} timestamp
     */
    _updatePreviewNode(node, timestamp) {
        if ((node._lastPredTime ?? 0) < timestamp - 100) {
            node.update();
            node._lastPredTime = timestamp;
        }
        if (node.predictedOrbit) {
            if (node.predictedOrbit.setVisible) {
                node.predictedOrbit.setVisible(true);
            } else if (node.predictedOrbit.orbitLine) {
                node.predictedOrbit.orbitLine.visible = true;
            }
        }
    }

    /** The main animation frame callback. */
    _animate() {

        if (!this._running) return;
        this._frameId = requestAnimationFrame(() => this._animate());
        this.stats?.begin();

        const timestamp = performance.now();
        this.timeUtils.update(timestamp);
        // First update scene (physics, visuals, and rebasing)
        this.sceneManager.updateFrame();
        // Then update camera to follow the new positions
        this.cameraControls.updateCameraPosition();

        // Update day/night material camera position uniform
        if (this.app.updateDayNightMaterials) {
            this.app.updateDayNightMaterials();
        }

        // Update planet vector label fading
        if (this.app?.planetVectors) {
            this.app.planetVectors.forEach(pv => pv.updateFading(this.sceneManager.camera));
        }

        // Unified preview node(s) update (throttled to 10Hz)
        const previewNodes = [];
        if (this.app.previewNode) previewNodes.push(this.app.previewNode);
        if (Array.isArray(this.app.previewNodes)) previewNodes.push(...this.app.previewNodes);
        const now = performance.now();
        for (const node of previewNodes) {
            this._updatePreviewNode(node, now);
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

        // Render CSS2D labels (throttled to 30Hz)
        if (this.sceneManager.labelRenderer) {
            if (timestamp - this._lastLabelTime > 33) {
                this.sceneManager.labelRenderer.render(this.sceneManager.scene, this.sceneManager.camera);
                this._lastLabelTime = timestamp;
            }
        }

        this.stats?.end();

    }
} 