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
            this._applySetting(key, value);
            
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
                if (ambientLight) ambientLight.intensity = value;
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
                // Toggle satellite-centric velocity/gravity arrows only
                if (app3d.satelliteVectors) {
                    app3d.satelliteVectors.setVisible(value);
                    // If using new implementation, force update
                    if (value && app3d.satelliteVectors.update) {
                        app3d.satelliteVectors.update();
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
            // Force immediate orbit path recalculation when prediction/points/interval change
            case 'orbitUpdateInterval':
            case 'orbitPredictionInterval':
            case 'orbitPointsPerPeriod':
                // Just update visualization - don't clear cache
                if (app3d.satelliteOrbitManager) {
                    if (app3d.physicsIntegration?.physicsEngine?.satellites) {
                        for (const satelliteId of app3d.physicsIntegration.physicsEngine.satellites.keys()) {
                            app3d.satelliteOrbitManager.updateSatelliteOrbit(satelliteId);
                        }
                    }
                }
                // Fallback to old system if it exists
                else if (app3d.satellites?.refreshOrbitPaths) {
                    app3d.satellites.refreshOrbitPaths();
                }
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
                this._updateApsisVisibility(app3d);
                break;
            case 'showApsis':
                // Update apsis marker visibility
                this._updateApsisVisibility(app3d);
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
     * Update apsis marker visibility for all satellites
     * @private
     */
    _updateApsisVisibility(app3d) {
        const showOrbits = this.getSetting('showOrbits');
        const showApsis = this.getSetting('showApsis');
        const visible = showOrbits && showApsis;
        
        // Update satellite apsis visualizers
        if (app3d.satellites?.satellites) {
            app3d.satellites.satellites.forEach(satellite => {
                if (satellite.apsisVisualizer) {
                    satellite.apsisVisualizer.setVisible(visible);
                }
            });
        }
    }

    /**
     * Clean up resources and remove event listeners
     */
    dispose() {
        // Remove event listener
        if (this._boundDisplaySettingsHandler) {
            document.removeEventListener('displaySettingsUpdate', this._boundDisplaySettingsHandler);
            this._boundDisplaySettingsHandler = null;
        }
        
        // Clear all listener callbacks
        this.listeners.clear();
        
        // Clear references
        this.app3d = null;
        this.settings = null;
    }
} 