/**
 * Manages display settings and their application to the App3D scene and satellites.
 */
import { Planet } from '../components/Planet.js';
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
                const rg = app3d.sceneManager?.radialGrid;
                if (rg && typeof rg.setVisible === 'function') rg.setVisible(value);
                break;
            }
            case 'showVectors':
                // Toggle planet-centric vectors (now an array)
                if (Array.isArray(app3d.planetVectors)) {
                    app3d.planetVectors.forEach(v => v.setVisible(value));
                } else if (app3d.planetVectors) {
                    app3d.planetVectors.setVisible(value);
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
            case 'showStates':
                Planet.instances.forEach(p => {
                    if (typeof p.setStatesVisible === 'function') p.setStatesVisible(value);
                });
                break;
            case 'showMoonOrbit':
                if (app3d.moon?.setOrbitVisible) app3d.moon.setOrbitVisible(value);
                break;
            case 'showMoonTraces':
                if (app3d.moon?.setTraceVisible) app3d.moon.setTraceVisible(value);
                break;
            case 'showMoonSurfaceLines':
                if (app3d.moon?.setSurfaceDetailsVisible) app3d.moon.setSurfaceDetailsVisible(value);
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
            case 'showAxis': {
                if (app3d.axisHelper) {
                    app3d.axisHelper.visible = value;
                }
                break;
            }
            // Add more settings as needed
        }
    }
} 