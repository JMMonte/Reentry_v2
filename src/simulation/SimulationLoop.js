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
        // Update physics world (planets & satellites dynamics)
        this.app.physicsWorld.update();

        // SatelliteManager physics worker is deprecated: using PhysicsWorld dynamics
        // this.satellites.updateAll(currentTime, delta, warpedDelta);

        // Log before calling app.updateScene
        // console.log(`SimLoop: Calling app.updateScene at ${currentTime.toISOString()}`);
        this.app.updateScene();
        // Then sync camera to follow updated body position
        this.cameraControls.updateCameraPosition();

        // Update day/night material camera position uniform
        if (this.app.updateDayNightMaterials) {
            this.app.updateDayNightMaterials();
        }

        // Update atmosphere raymarching pass uniforms every frame
        if (this.app.atmosphereManager && this.sceneManager.composers.atmospherePass) {
            const arrays = this.app.atmosphereManager.buildUniformArrays(this.sceneManager.camera);
            const pass = this.sceneManager.composers.atmospherePass;
            for (const key in arrays) {
                if (pass.uniforms[key]) {
                    if (Array.isArray(arrays[key]) || ArrayBuffer.isView(arrays[key])) {
                        for (let i = 0; i < arrays[key].length; ++i) {
                            if (pass.uniforms[key].value[i]?.copy && arrays[key][i]?.copy) {
                                pass.uniforms[key].value[i].copy(arrays[key][i]);
                            } else if (typeof arrays[key][i] !== 'undefined') {
                                pass.uniforms[key].value[i] = arrays[key][i];
                            }
                        }
                    } else {
                        pass.uniforms[key].value = arrays[key];
                    }
                }
            }
        }

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