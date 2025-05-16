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
        // Batch all planet-related settings into a single loop
        const planetSettings = [
            'showGrid', 'showSurfaceLines', 'showCities', 'showAirports', 'showSpaceports',
            'showObservatories', 'showGroundStations', 'showMissions', 'showCountryBorders',
            'showTopographicIsolines', 'showSOI'
        ];
        // Collect the current values for each planet-related setting
        const settingValues = {};
        planetSettings.forEach(key => {
            if (key in this.settings) settingValues[key] = this.settings[key];
        });
        // Batch apply all planet-related settings in one loop
        Planet.instances.forEach(planet => {
            if ('showGrid' in settingValues && planet.radialGrid && typeof planet.setRadialGridVisible === 'function') {
                planet.setRadialGridVisible(settingValues['showGrid']);
            }
            if ('showSurfaceLines' in settingValues && typeof planet.setSurfaceLinesVisible === 'function') {
                planet.setSurfaceLinesVisible(settingValues['showSurfaceLines']);
            }
            if ('showCities' in settingValues && typeof planet.setCitiesVisible === 'function') {
                planet.setCitiesVisible(settingValues['showCities']);
            }
            if ('showAirports' in settingValues && typeof planet.setAirportsVisible === 'function') {
                planet.setAirportsVisible(settingValues['showAirports']);
            }
            if ('showSpaceports' in settingValues && typeof planet.setSpaceportsVisible === 'function') {
                planet.setSpaceportsVisible(settingValues['showSpaceports']);
            }
            if ('showObservatories' in settingValues && typeof planet.setObservatoriesVisible === 'function') {
                planet.setObservatoriesVisible(settingValues['showObservatories']);
            }
            if ('showGroundStations' in settingValues && typeof planet.setGroundStationsVisible === 'function') {
                planet.setGroundStationsVisible(settingValues['showGroundStations']);
            }
            if ('showMissions' in settingValues && typeof planet.setMissionsVisible === 'function') {
                planet.setMissionsVisible(settingValues['showMissions']);
            }
            if ('showCountryBorders' in settingValues && typeof planet.setCountryBordersVisible === 'function') {
                planet.setCountryBordersVisible(settingValues['showCountryBorders']);
            }
            if ('showTopographicIsolines' in settingValues && typeof planet.setStatesVisible === 'function') {
                planet.setStatesVisible(settingValues['showTopographicIsolines']);
            }
            if ('showSOI' in settingValues && typeof planet.setSOIVisible === 'function') {
                planet.setSOIVisible(settingValues['showSOI']);
            }
        });
        // Apply all other settings as before
        Object.entries(this.settings).forEach(([key, value]) => {
            if (!planetSettings.includes(key)) {
                this._applySetting(key, value);
            }
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
            case 'showOrbits':
                Object.values(app3d.satellites.getSatellites()).forEach(sat => {
                    if (sat.orbitPath?.setVisible) sat.orbitPath.setVisible(value);
                    if (sat.apsisVisualizer?.setVisible) sat.apsisVisualizer.setVisible(value);
                });
                break;
            case 'showAxis': {
                // Toggle axis helpers on all planets via PlanetVectors
                if (Array.isArray(app3d.planetVectors)) {
                    app3d.planetVectors.forEach(v => v.setAxesVisible(value));
                } else if (app3d.planetVectors) {
                    app3d.planetVectors.setAxesVisible(value);
                }
                break;
            }
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
            // Add more settings as needed
        }
    }
} 