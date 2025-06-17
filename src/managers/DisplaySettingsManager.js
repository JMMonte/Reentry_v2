/**
 * Manages display settings and their application to the App3D scene and satellites.
 */
import { getPlanetManager } from './PlanetManager.js';

export class DisplaySettingsManager {
    /**
     * @param {App3D} app3d - Reference to the main App3D instance
     * @param {Object} defaults - Default display settings (plain object: {key: value})
     */
    constructor(app3d, defaults = {}) {
        this.app3d = app3d;
        this.settings = { ...defaults };
        this.listeners = new Map(); // key -> Set of callback functions
        
        // Advanced performance optimization: intelligent batching system
        this._pendingUpdates = new Set();
        this._updateTimeout = null;
        this._batchDelay = 100; // ms
        this._uniformUpdateQueue = new Map(); // material -> uniforms to update
        this._uniformUpdateTimeout = null;
        this._uniformBatchDelay = 16; // ~1 frame delay for uniform updates
        this._lastUniformUpdate = 0;
        
        // Track expensive operations to debounce them
        this._expensiveOperations = new Set([
            'orbitUpdateInterval',
            'orbitPredictionInterval', 
            'orbitPointsPerPeriod',
            'physicsTimeStep',
            'integrationMethod',
            'perturbationScale',
            'sensitivityScale'
        ]);
        
        // Store bound event handler for removal
        this._boundDisplaySettingsHandler = (event) => {
            if (event.detail) {
                Object.entries(event.detail).forEach(([key, value]) => {
                    this.updateSetting(key, value);
                });
            }
        };
        
        // Listen for display settings updates
        document.addEventListener('displaySettingsUpdate', this._boundDisplaySettingsHandler);
    }

    /**
     * Apply all settings to the scene and satellites.
     */
    applyAll() {
        if (!this.settings) {
            console.warn('[DisplaySettingsManager] No settings to apply');
            return;
        }
        Object.entries(this.settings).forEach(([key, value]) => {
            this._applySetting(key, value);
        });
    }

    /**
     * Update a single setting and apply it.
     * @param {string} key
     * @param {*} value
     */
    updateSetting(key, value) {
        if (this.settings[key] !== value) {
            this.settings[key] = value;
            
            // For expensive operations, batch them
            if (this._expensiveOperations.has(key)) {
                this._pendingUpdates.add(key);
                this._scheduleExpensiveUpdate();
            } else {
                // Apply immediately for cheap operations
                this._applySetting(key, value);
            }
            
            // Notify listeners
            const callbacks = this.listeners.get(key);
            if (callbacks) {
                callbacks.forEach(callback => {
                    try {
                        callback(value);
                    } catch (e) {
                        console.error(`Error in display setting listener for ${key}:`, e);
                    }
                });
            }
        }
    }

    /**
     * Schedule expensive updates to be batched
     * @private
     */
    _scheduleExpensiveUpdate() {
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }
        
        this._updateTimeout = setTimeout(() => {
            const updates = Array.from(this._pendingUpdates);
            this._pendingUpdates.clear();
            this._updateTimeout = null;
            
            // Apply all pending expensive updates at once
            this._applyExpensiveUpdates(updates);
        }, this._batchDelay);
    }

    /**
     * Apply batched expensive updates
     * @private
     */
    _applyExpensiveUpdates(keys) {
        const hasOrbitChanges = keys.some(key => 
            ['orbitUpdateInterval', 'orbitPredictionInterval', 'orbitPointsPerPeriod'].includes(key)
        );
        
        const hasPhysicsChanges = keys.some(key => 
            ['physicsTimeStep', 'integrationMethod', 'perturbationScale', 'sensitivityScale'].includes(key)
        );
        
        // Apply individual settings first
        keys.forEach(key => {
            if (!['orbitUpdateInterval', 'orbitPredictionInterval', 'orbitPointsPerPeriod'].includes(key)) {
                this._applySetting(key, this.settings[key]);
            }
        });
        
        // Then batch the expensive orbit updates
        if (hasOrbitChanges) {
            this._updateAllOrbits();
        }
        
        // Batch physics updates if needed
        if (hasPhysicsChanges) {
            this._updatePhysicsSettings();
        }
    }

    /**
     * Batch update all satellite orbits
     * @private
     */
    _updateAllOrbits() {
        // Force update of orbit display parameters in physics engine
        // IMPORTANT: Only apply global settings to satellites WITHOUT custom local settings
        // Satellite debug window (local) settings should override display options (global) settings
        if (this.app3d.physicsIntegration?.physicsEngine?.satelliteEngine) {
            const satelliteEngine = this.app3d.physicsIntegration.physicsEngine.satelliteEngine;
            for (const satelliteId of satelliteEngine.satellites.keys()) {
                const satellite = satelliteEngine.satellites.get(satelliteId);
                
                // Only apply global settings if satellite doesn't have custom local settings
                if (!satellite?.orbitSimProperties || 
                    (satellite.orbitSimProperties.periods === undefined && satellite.orbitSimProperties.pointsPerPeriod === undefined)) {
                    // Satellite has NO custom settings, apply global display settings
                    satelliteEngine.forceOrbitExtension(satelliteId, {
                        periods: this.settings.orbitPredictionInterval,
                        pointsPerPeriod: this.settings.orbitPointsPerPeriod
                    });
                } else {
                    // Satellite HAS custom settings, force refresh with current parameters (don't override)
                    satelliteEngine.forceOrbitExtension(satelliteId);
                }
            }
        }
        
        // Also update centralized orbit visualizer if available
        if (this.app3d.satelliteOrbitManager) {
            this.app3d.satelliteOrbitManager.updateAllVisibility();
        }
    }

    /**
     * Update physics settings
     * @private
     */
    _updatePhysicsSettings() {
        // Notify physics system of setting changes
        if (this.app3d.physicsIntegration?.updateSettings) {
            this.app3d.physicsIntegration.updateSettings({
                physicsTimeStep: this.settings.physicsTimeStep,
                integrationMethod: this.settings.integrationMethod,
                perturbationScale: this.settings.perturbationScale,
                sensitivityScale: this.settings.sensitivityScale
            });
        }
    }

    /**
     * Get a display setting value.
     * @param {string} key
     */
    getSetting(key) {
        return this.settings[key];
    }

    /**
     * Add a listener for a specific setting
     * @param {string} key - Setting key to listen for
     * @param {Function} callback - Function to call when setting changes
     */
    addListener(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
    }

    /**
     * Remove a listener for a specific setting
     * @param {string} key - Setting key
     * @param {Function} callback - Function to remove
     */
    removeListener(key, callback) {
        const callbacks = this.listeners.get(key);
        if (callbacks) {
            callbacks.delete(callback);
        }
    }

    /**
     * Internal: apply a single setting to the scene/satellites.
     */
    _applySetting(key, value) {
        const app3d = this.app3d;
        switch (key) {
            case 'ambientLight': {
                const ambientLight = app3d.scene?.getObjectByName('ambientLight');
                if (ambientLight) {
                    // Batch uniform updates for better performance
                    this._queueUniformUpdate(ambientLight, 'intensity', value);
                }
                break;
            }
            case 'showGrid': {
                // Iterate through planets and set grid visibility
                getPlanetManager().updateVisibilitySetting(key, value);
                break;
            }
            case 'showPlanetVectors':
                // Toggle both vectors and axes helpers for all planets
                if (Array.isArray(app3d.planetVectors)) {
                    app3d.planetVectors.forEach(v => {
                        v.setVisible(value);
                        v.setAxesVisible(value);
                    });
                } else if (app3d.planetVectors) {
                    app3d.planetVectors.setVisible(value);
                    app3d.planetVectors.setAxesVisible(value);
                }
                break;
            case 'showSatVectors':
                // Toggle satellite vector visibility for all satellites
                if (app3d.satellites?.getSatellitesMap) {
                    const satelliteMap = app3d.satellites.getSatellitesMap();
                    for (const satellite of satelliteMap.values()) {
                        if (satellite.vectorVisualizer) {
                            satellite.vectorVisualizer.setVisible(value);
                        }
                    }
                }
                break;
            case 'showSurfaceLines':
                getPlanetManager().forEach(p => {
                    if (typeof p.setSurfaceLinesVisible === 'function') p.setSurfaceLinesVisible(value);
                });
                break;
            // Removed duplicate showOrbits case - handled below
            case 'showCities':
            case 'showAirports':
            case 'showSpaceports':
            case 'showObservatories':
            case 'showGroundStations':
            case 'showMissions':
            case 'showCountryBorders':
                // Use PlanetManager for better performance and memory management
                getPlanetManager().updateVisibilitySetting(key, value);
                break;
            case 'showTopographicIsolines':
                // Toggle topographic isolines (state-style geo features) on all planets
                getPlanetManager().forEach(p => {
                    if (typeof p.setStatesVisible === 'function') p.setStatesVisible(value);
                });
                break;
            case 'showSOI':
                // Toggle sphere of influence rim glow on all planets
                getPlanetManager().updateVisibilitySetting(key, value);
                break;
            case 'showPlanetOrbits':
                if (app3d.orbitManager) {
                    app3d.orbitManager.setVisible(value);
                    // Force regeneration if turning on orbits
                    if (value) {
                        app3d.orbitManager.forceUpdate();
                    }
                }
                break;
            case 'realTimePlanetOrbits':
                // This setting controls the update frequency, no immediate action needed
                // The OrbitManager checks this setting during its update cycle
                if (app3d.orbitManager && value) {
                    // Force an immediate update when enabling real-time updates
                    app3d.orbitManager.forceUpdate();
                }
                break;
            case 'enableFXAA':
                // Enable or disable the FXAA pass
                if (app3d.sceneManager?.composers?.fxaaPass) {
                    app3d.sceneManager.composers.fxaaPass.enabled = value;
                }
                break;
            // Orbit settings are now handled by batched updates
            case 'orbitUpdateInterval':
            case 'orbitPredictionInterval':
            case 'orbitPointsPerPeriod':
                // These are handled by _updateAllOrbits() when batched
                // No immediate action needed here
                break;
            case 'showOrbits':
                // Update satellite orbit visibility for both old and new systems
                if (app3d.satelliteOrbitManager) {
                    app3d.satelliteOrbitManager.updateVisibility(value);
                }
                // Also update old orbit system if it exists
                if (app3d.satellites?.setOrbitVisibility) {
                    app3d.satellites.setOrbitVisibility(value);
                }
                // Update apsis visibility (depends on showOrbits)
                this._updateOrbitVisibility(app3d);
                break;
            case 'showApsis':
                // Update apsis marker visibility
                this._updateOrbitVisibility(app3d);
                break;
            case 'pixelRatio': {
                // Update renderer pixel ratio
                if (app3d.renderer) {
                    app3d.renderer.setPixelRatio(value);
                }
                // Update FXAA resolution uniform
                const fxaaPass = app3d.sceneManager?.composers?.fxaaPass;
                if (fxaaPass) {
                    fxaaPass.material.uniforms.resolution.value.set(
                        1 / (window.innerWidth * value),
                        1 / (window.innerHeight * value)
                    );
                }
                break;
            }
            case 'showSatelliteConnections':
                // Enable/disable satellite line-of-sight connections
                if (app3d.lineOfSightManager) {
                    app3d.lineOfSightManager.setEnabled(value);
                }
                break;
        }
    }
    
    /**
     * Update orbit visibility for all satellites
     * @private
     */
    _updateOrbitVisibility(app3d) {
        // Use centralized SimpleSatelliteOrbitVisualizer for all orbit visibility
        if (app3d.satelliteOrbitManager) {
            app3d.satelliteOrbitManager.updateAllVisibility();
        }
    }

    /**
     * Cleanup and remove all listeners/timeouts
     */
    dispose() {
        // Clear all batching timeouts
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
            this._updateTimeout = null;
        }
        
        if (this._uniformUpdateTimeout) {
            clearTimeout(this._uniformUpdateTimeout);
            this._uniformUpdateTimeout = null;
        }
        
        // Clear all pending updates
        this._pendingUpdates.clear();
        this._uniformUpdateQueue.clear();
        
        // Remove document event listener
        document.removeEventListener('displaySettingsUpdate', this._boundDisplaySettingsHandler);
        
        // Clear all setting listeners
        this.listeners.clear();
        
        // Clear references to prevent memory leaks
        this.app3d = null;
        this.settings = null;
        this._boundDisplaySettingsHandler = null;
    }

    /**
     * Queue uniform updates for batching
     * @private
     */
    _queueUniformUpdate(object, property, value) {
        if (!this._uniformUpdateQueue.has(object)) {
            this._uniformUpdateQueue.set(object, new Map());
        }
        this._uniformUpdateQueue.get(object).set(property, value);
        
        // Schedule batch update
        if (this._uniformUpdateTimeout) {
            clearTimeout(this._uniformUpdateTimeout);
        }
        
        this._uniformUpdateTimeout = setTimeout(() => {
            this._flushUniformUpdates();
        }, this._uniformBatchDelay);
    }

    /**
     * Apply all queued uniform updates in a single batch
     * @private
     */
    _flushUniformUpdates() {
        const now = performance.now();
        
        // Prevent excessive updates
        if (now - this._lastUniformUpdate < this._uniformBatchDelay) {
            return;
        }
        
        try {
            for (const [object, updates] of this._uniformUpdateQueue) {
                for (const [property, value] of updates) {
                    if (object && typeof object[property] !== 'undefined') {
                        object[property] = value;
                    }
                }
            }
        } finally {
            this._uniformUpdateQueue.clear();
            this._uniformUpdateTimeout = null;
            this._lastUniformUpdate = now;
        }
    }
} 