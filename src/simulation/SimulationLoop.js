/**
 * Manages the animation and simulation update loop for the 3D app.
 * Enhanced to coordinate multiple update systems efficiently.
 */
import { Clock } from 'three';

export class SimulationLoop {
    /**
     * @param {Object} options
     * @param {App3D} options.app - Reference to the main App3D instance
     * @param {SatelliteManager} options.satellites
     * @param {SceneManager} options.sceneManager
     * @param {SmartCamera} options.cameraControls
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

        // Advanced update coordination with adaptive scheduling
        this._frameCount = 0;
        this._uiUpdateFrequency = 3; // Update UI every 3rd frame (~20Hz at 60fps)
        this._physicsUpdateFrequency = 1; // Update physics every frame (60Hz at 60fps) - PHYSICS MUST RUN EVERY FRAME
        this._satelliteInterpolationFrequency = 2; // Update satellite interpolation every 2nd frame (30Hz at 60fps) to reduce CPU load
        this._lastUIUpdate = 0;
        this._physicsAccumulator = 0;

        // Micro-task scheduling for performance-critical operations
        this._microTaskQueue = [];
        this._criticalTaskQueue = [];
        this._maxMicroTasksPerFrame = 3; // Limit non-critical tasks per frame
        this._frameTimeTarget = 16.67; // Target 60fps (16.67ms per frame)

        // Tab visibility handling for performance
        this._isVisible = !document.hidden;
        this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this._handleVisibilityChange);

        // Performance throttling when tab is not visible
        this._backgroundThrottle = 10; // Run at 6fps when tab is hidden to prevent CPU overheating

        // Physics integration tracking
        this._lastPhysicsStep = performance.now();
        this._physicsInterpolationFactor = 0;

        // Time update tracking for UI synchronization
        this._lastDispatchedTime = 0;
        this._lastDispatchedWarp = 1;
    }

    /** Start the animation/simulation loop. */
    start() {
        if (this._running) return;
        this._running = true;

        this._startTime = performance.now();
        this.sceneManager.renderer.setAnimationLoop(this._animate.bind(this));
    }

    /** Stop the animation/simulation loop. */
    stop() {
        this._running = false;
        this.sceneManager.renderer.setAnimationLoop(null);
    }

    /** Dispose of the loop and cleanup. */
    dispose() {
        this.stop();

        // Remove event listeners
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);

        // Clear references
        this.app = null;
        this.satellites = null;
        this.sceneManager = null;
        this.cameraControls = null;
        this.timeUtils = null;
        this.stats = null;
    }

    /** The main animation frame callback. */
    async _animate() {
        if (!this._running) return;

        try {

            // Throttle updates when tab is not visible
            if (!this._isVisible) {
                // Reduced frequency when not visible
                this._frameCount++;
                if (this._frameCount % this._backgroundThrottle !== 0) {
                    return;
                }
            }

            const delta = this.clock.getDelta();

            // Validate delta to prevent extreme time steps
            const maxDelta = 1.0; // Maximum 1 second per frame
            const safeDelta = Math.min(delta, maxDelta);

            // Coordinate updates more efficiently
            this._frameCount++;

            // Physics system - run physics every frame for accurate simulation
            if (this.app.physicsIntegration?.stepPhysicsExternal) {
                const timeWarp = this.timeUtils?.getTimeWarp?.() || 1;

                // Run physics every frame for accurate orbital mechanics
                if (this._frameCount % this._physicsUpdateFrequency === 0) {
                    // Run physics with current delta time
                    await this.app.physicsIntegration.stepPhysicsExternal(
                        safeDelta * this._physicsUpdateFrequency,
                        timeWarp
                    );

                    this._physicsAccumulator = 0;
                } else {
                    // Accumulate time for next physics update
                    this._physicsAccumulator += safeDelta;
                }
            }

            // App tick for essential updates every frame
            this.app.tick?.(safeDelta, 0);

            // Since physics runs every frame, no interpolation needed
            // Satellite positions are updated directly from physics state

            // Throttled UI updates (20Hz instead of 60Hz to reduce CPU load)
            if (this._frameCount % this._uiUpdateFrequency === 0) {
                this._updateUI();

                // Schedule line of sight connections as micro-task
                if (this.app.lineOfSightManager?.isEnabled()) {
                    this._scheduleMicroTask(() => {
                        this.app._syncConnectionsWorker();
                    }, 'lineOfSight');
                }
            }

            // Process micro-tasks with frame time budget
            this._processMicroTasks(performance.now());

            // Render scene
            if (this.sceneManager?.composers?.final) {
                this.sceneManager.composers.final.render();
            } else if (this.sceneManager?.renderer && this.sceneManager?.scene && this.sceneManager?.camera) {
                this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);
            }

        } catch (error) {
            console.error('[SimulationLoop] Animation error:', error);
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
        if (this.app.lineOfSightManager?.isEnabled()) this.app._syncConnectionsWorker();
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
            case 'losUpdateInterval':
            case 'losMinElevation':
            case 'losAtmosphericRefraction':
                // Update LineOfSightManager configuration when LOS settings change
                if (this.app.lineOfSightManager) {
                    const config = {};
                    if (key === 'losUpdateInterval') config.UPDATE_INTERVAL = value;
                    if (key === 'losMinElevation') config.MIN_ELEVATION_ANGLE = value;
                    if (key === 'losAtmosphericRefraction') config.ATMOSPHERIC_REFRACTION = value;
                    this.app.lineOfSightManager.updateSettings(config);
                    this.app.lineOfSightManager.forceUpdate(); // Force immediate recalculation
                }
                break;
            case 'physicsTimeStep':
                this.app3d?.physicsIntegration?.physicsEngine?.satelliteEngine?.setPhysicsTimeStep(value);
                break;
            case 'integrationMethod':
                this.app3d?.physicsIntegration?.physicsEngine?.satelliteEngine?.setIntegrationMethod(value);
                break;
            case 'sensitivityScale':
                this.app3d?.physicsIntegration?.physicsEngine?.satelliteEngine?.setSensitivityScale(value);
                break;
            case 'perturbationScale':
                this.app3d?.physicsIntegration?.physicsEngine?.satelliteEngine?.setPerturbationScale(value);
                break;
        }
    }

    /**
     * Allows updating the satellites manager at runtime (for switching physics providers).
     * @param {SatelliteManager} satellites
     */
    setSatelliteManager(satellites) {
        this.satellites = satellites;
    }

    /**
     * Handle tab visibility changes for performance optimization
     */
    _handleVisibilityChange() {
        this._isVisible = !document.hidden;

        if (this._isVisible) {
            // Reset clock when becoming visible to prevent huge delta
            this.clock.getDelta();
        }
    }

    /**
     * Schedule a micro-task for non-critical operations
     */
    _scheduleMicroTask(task, priority = 'normal') {
        const taskObj = { task, priority, id: Math.random() };

        if (priority === 'critical') {
            this._criticalTaskQueue.push(taskObj);
        } else {
            this._microTaskQueue.push(taskObj);
        }
    }

    /**
     * Process micro-tasks with frame time budget management
     */
    _processMicroTasks(frameStartTime) {
        const frameTimeUsed = performance.now() - frameStartTime;
        const remainingTime = this._frameTimeTarget - frameTimeUsed;

        // Always process critical tasks
        while (this._criticalTaskQueue.length > 0) {
            const { task } = this._criticalTaskQueue.shift();
            try {
                task();
            } catch (error) {
                console.warn('[SimulationLoop] Critical micro-task error:', error);
            }
        }

        // Process regular micro-tasks only if we have time budget
        if (remainingTime > 2) { // At least 2ms remaining
            let tasksProcessed = 0;
            while (this._microTaskQueue.length > 0 &&
                tasksProcessed < this._maxMicroTasksPerFrame &&
                (performance.now() - frameStartTime) < (this._frameTimeTarget - 1)) {

                const { task } = this._microTaskQueue.shift();
                try {
                    task();
                    tasksProcessed++;
                } catch (error) {
                    console.warn('[SimulationLoop] Micro-task error:', error);
                }
            }
        }

        // Clear old micro-tasks if queue gets too large
        if (this._microTaskQueue.length > 100) {
            this._microTaskQueue.splice(0, this._microTaskQueue.length - 50);
        }
    }

        /**
     * Throttled UI updates - called every 3rd frame (~20Hz)
     */
    _updateUI() {
        // Emit time update event for React components
        if (this.timeUtils?.getSimulatedTime) {
            const currentTime = this.timeUtils.getSimulatedTime();
            const currentTimeMs = currentTime?.getTime?.() || 0;
            const currentWarp = this.timeUtils.getTimeWarp?.() || 1;

            // Always dispatch timeWarp changes immediately for responsiveness
            const warpChanged = currentWarp !== this._lastDispatchedWarp;

            // For time changes, be more lenient - dispatch if time advanced by at least 1 second
            // This ensures regular physics progression updates the UI
            const timeChanged = Math.abs(currentTimeMs - this._lastDispatchedTime) >= 1000;

            if (timeChanged || warpChanged) {
                this._lastDispatchedTime = currentTimeMs;
                this._lastDispatchedWarp = currentWarp;

                document.dispatchEvent(new CustomEvent('timeUpdate', {
                    detail: {
                        simulatedTime: currentTime,
                        timeWarp: currentWarp
                    }
                }));
            }
        }

        // Update satellite list periodically
        const satelliteListUpdateFrequency = this._uiUpdateFrequency * 5; // Every ~2.5 seconds
        if (this._frameCount % satelliteListUpdateFrequency === 0) {
            this.updateSatelliteList();
        }
    }


}
