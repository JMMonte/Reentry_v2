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
        
        // Enhanced update coordination
        this._frameCount = 0;
        this._uiUpdateFrequency = 3; // Update UI every 3rd frame (~20Hz at 60fps)
        this._lastUIUpdate = 0;
        this._performanceMetrics = {
            frameTime: 0,
            renderTime: 0,
            updateTime: 0
        };
        
        // Tab visibility handling for performance
        this._isVisible = !document.hidden;
        this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this._handleVisibilityChange);
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
    _animate() {
        if (!this._running) return;
        
        const frameStart = performance.now();
        
        try {
            // Throttle updates when tab is not visible
            if (!this._isVisible) {
                // Reduced frequency when not visible
                this._frameCount++;
                if (this._frameCount % 10 !== 0) {
                    return;
                }
            }
            
            const delta = this.clock.getDelta();
            
            // Validate delta to prevent extreme time steps
            const maxDelta = 1.0; // Maximum 1 second per frame
            const safeDelta = Math.min(delta, maxDelta);
            
            // Delta validation without logging
            
            // Coordinate updates more efficiently
            this._frameCount++;
            const updateStart = performance.now();
            
            // App tick for essential updates every frame
            this.app.tick?.(safeDelta);
            
            // Throttled UI updates (20Hz instead of 60Hz)
            if (this._frameCount % this._uiUpdateFrequency === 0) {
                this._updateUI();
            }
            
            this._performanceMetrics.updateTime = performance.now() - updateStart;

            // Render scene
            const renderStart = performance.now();
            if (this.sceneManager?.composers?.final) {
                this.sceneManager.composers.final.render();
            } else if (this.sceneManager?.renderer && this.sceneManager?.scene && this.sceneManager?.camera) {
                this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);
            }
            this._performanceMetrics.renderTime = performance.now() - renderStart;
            
        } catch (error) {
            // Silent error handling to keep the animation loop running
        }
        
        // Track frame performance
        this._performanceMetrics.frameTime = performance.now() - frameStart;
        
        // Emit performance metrics periodically
        if (this._frameCount % 300 === 0) { // Every 5 seconds at 60fps
            this._emitPerformanceMetrics();
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
                this.satellites.setPhysicsTimeStep(value);
                break;
            case 'sensitivityScale':
                this.satellites.setSensitivityScale(value);
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
     * Throttled UI updates - called every 3rd frame (~20Hz)
     */
    _updateUI() {
        // Emit time update event for React components
        if (this.timeUtils?.getSimulatedTime) {
            const currentTime = this.timeUtils.getSimulatedTime();
            document.dispatchEvent(new CustomEvent('timeUpdate', {
                detail: { 
                    simulatedTime: currentTime,
                    timeWarp: this.timeUtils.getTimeWarp?.()
                }
            }));
        }
        
        // Update satellite list periodically
        if (this._frameCount % (this._uiUpdateFrequency * 20) === 0) { // Every ~1 second
            this.updateSatelliteList();
        }
    }
    
    /**
     * Emit performance metrics for monitoring
     */
    _emitPerformanceMetrics() {
        document.dispatchEvent(new CustomEvent('performance-update', {
            detail: {
                ...this._performanceMetrics,
                fps: Math.round(1000 / this._performanceMetrics.frameTime),
                frameCount: this._frameCount,
                isVisible: this._isVisible
            }
        }));
    }
    
    /**
     * Get current performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this._performanceMetrics,
            fps: Math.round(1000 / this._performanceMetrics.frameTime),
            frameCount: this._frameCount,
            isVisible: this._isVisible
        };
    }
} 