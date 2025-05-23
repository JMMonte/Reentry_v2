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
                if (app3d.satelliteVectors) app3d.satelliteVectors.setVisible(value);
                break;
            case 'showSurfaceLines':
                Planet.instances.forEach(p => {
                    if (typeof p.setSurfaceLinesVisible === 'function') p.setSurfaceLinesVisible(value);
                });
                break;
            case 'showOrbits':
                Object.values(app3d.satellites.getSatellites()).forEach(sat => {
                    if (sat.orbitPath?.setVisible) sat.orbitPath.setVisible(value);
                    if (sat.apsisVisualizer?.setVisible) sat.apsisVisualizer.setVisible(value);
                });
                break;
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
                if (app3d.setPhysicsSource) {
                    app3d.setPhysicsSource(value ? 'remote' : 'local');
                } else {
                    console.warn("[DisplaySettingsManager] app3d.setPhysicsSource method not found. Cannot switch physics provider.");
                }
                break;
        }
    }
} 