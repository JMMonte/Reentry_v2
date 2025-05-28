/**
 * Manages display settings and their application to the App3D scene and satellites.
 */
import { Planet } from '../components/planet/Planet.js';
export class DisplaySettingsManager {
    /**
     * @param {App3D} app3d - Reference to the main App3D instance
     * @param {Object} defaults - Default display settings (plain object: {key: value})
     */
    constructor(app3d, defaults = {}) {
        this.app3d = app3d;
        this.settings = { ...defaults };
        this.listeners = new Map(); // key -> Set of callback functions
        
        // Listen for display settings updates
        document.addEventListener('displaySettingsUpdate', (event) => {
            if (event.detail) {
                Object.entries(event.detail).forEach(([key, value]) => {
                    this.updateSetting(key, value);
                });
            }
        });
    }

    /**
     * Apply all settings to the scene and satellites.
     */
    applyAll() {
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
                Planet.instances.forEach(planet => {
                    if (planet.radialGrid && typeof planet.setRadialGridVisible === 'function') {
                        planet.setRadialGridVisible(value);
                    }
                });
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
                console.log(`[DisplaySettingsManager] Setting satellite vectors visibility to ${value}`);
                if (app3d.satelliteVectors) {
                    app3d.satelliteVectors.setVisible(value);
                    // If using new implementation, force update
                    if (value && app3d.satelliteVectors.update) {
                        console.log('[DisplaySettingsManager] Forcing satellite vectors update');
                        app3d.satelliteVectors.update();
                    }
                }
                break;
            case 'showSurfaceLines':
                Planet.instances.forEach(p => {
                    if (typeof p.setSurfaceLinesVisible === 'function') p.setSurfaceLinesVisible(value);
                });
                break;
            // Removed duplicate showOrbits case - handled below
            case 'showCities':
                Planet.instances.forEach(p => {
                    if (typeof p.setCitiesVisible === 'function') p.setCitiesVisible(value);
                });
                break;
            case 'showAirports':
                Planet.instances.forEach(p => {
                    if (typeof p.setAirportsVisible === 'function') p.setAirportsVisible(value);
                });
                break;
            case 'showSpaceports':
                Planet.instances.forEach(p => {
                    if (typeof p.setSpaceportsVisible === 'function') p.setSpaceportsVisible(value);
                });
                break;
            case 'showObservatories':
                Planet.instances.forEach(p => {
                    if (typeof p.setObservatoriesVisible === 'function') p.setObservatoriesVisible(value);
                });
                break;
            case 'showGroundStations':
                Planet.instances.forEach(p => {
                    if (typeof p.setGroundStationsVisible === 'function') p.setGroundStationsVisible(value);
                });
                break;
            case 'showMissions':
                Planet.instances.forEach(p => {
                    if (typeof p.setMissionsVisible === 'function') p.setMissionsVisible(value);
                });
                break;
            case 'showCountryBorders':
                Planet.instances.forEach(p => {
                    if (typeof p.setCountryBordersVisible === 'function') p.setCountryBordersVisible(value);
                });
                break;
            case 'showTopographicIsolines':
                // Toggle topographic isolines (state-style geo features) on all planets
                Planet.instances.forEach(p => {
                    if (typeof p.setStatesVisible === 'function') p.setStatesVisible(value);
                });
                break;
            case 'showSOI':
                // Toggle sphere of influence rim glow on all planets
                Planet.instances.forEach(p => {
                    if (typeof p.setSOIVisible === 'function') p.setSOIVisible(value);
                });
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
                if (app3d.satellites?.refreshOrbitPaths) {
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
            case 'useRemoteCompute':
                // No longer supported: only local physics is used
                break;
        }
    }
} 