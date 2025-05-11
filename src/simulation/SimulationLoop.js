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
        this.satellites = satellites;
        this.sceneManager = sceneManager;
        this.cameraControls = cameraControls;
        this.timeUtils = timeUtils;
        this.stats = stats;
        this._running = false;
        this._lastTime = performance.now();
        this._frameId = null;
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

        // Unified preview node(s) update (throttled to 10Hz)
        const previewNodes = [];
        if (this.app.previewNode) previewNodes.push(this.app.previewNode);
        if (Array.isArray(this.app.previewNodes)) previewNodes.push(...this.app.previewNodes);
        const now = timestamp;
        for (const node of previewNodes) {
            this._updatePreviewNode(node, now);
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

    /** Update time warp in timeUtils and physicsWorld. */
    updateTimeWarp(value) {
        this.app.timeUtils.setTimeWarp(value);
        this.app.physicsWorld.setTimeWarp(value);
    }

    /** Update camera to follow a new body selection. */
    updateSelectedBody(value) {
        this.app.cameraControls?.follow(value, this.app);
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
            case 'useAstronomy':
                this.app.physicsWorld.setUseAstronomy(value);
                break;
            case 'useRemoteCompute':
                this.app.physicsWorld.setUseRemote(value);
                break;
            case 'showAxis':
                this.app.Planet.instances.forEach(p => p.setAxisVisible(value));
                break;
        }
    }
} 