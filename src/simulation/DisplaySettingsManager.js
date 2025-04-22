/**
 * Manages display settings and their application to the App3D scene and satellites.
 */
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
            case 'showGrid':
                if (app3d.radialGrid) app3d.radialGrid.setVisible(value);
                break;
            case 'showVectors':
                if (app3d.vectors) app3d.vectors.setVisible(value);
                break;
            case 'showSatVectors':
                Object.values(app3d.satellites.getSatellites()).forEach(sat => {
                    if (sat.setVectorsVisible) sat.setVectorsVisible(value);
                });
                break;
            case 'showSurfaceLines':
                if (app3d.earth?.setSurfaceLinesVisible) app3d.earth.setSurfaceLinesVisible(value);
                break;
            case 'showOrbits':
                Object.values(app3d.satellites.getSatellites()).forEach(sat => {
                    if (sat.orbitPath?.setVisible) sat.orbitPath.setVisible(value);
                    if (sat.apsisVisualizer?.setVisible) sat.apsisVisualizer.setVisible(value);
                });
                break;
            case 'showGroundTraces':
                Object.values(app3d.satellites.getSatellites()).forEach(sat => {
                    if (sat.groundTrackPath?.setVisible) sat.groundTrackPath.setVisible(value);
                });
                break;
            case 'showCities':
                if (app3d.earth?.setCitiesVisible) app3d.earth.setCitiesVisible(value);
                break;
            case 'showAirports':
                if (app3d.earth?.setAirportsVisible) app3d.earth.setAirportsVisible(value);
                break;
            case 'showSpaceports':
                if (app3d.earth?.setSpaceportsVisible) app3d.earth.setSpaceportsVisible(value);
                break;
            case 'showObservatories':
                if (app3d.earth?.setObservatoriesVisible) app3d.earth.setObservatoriesVisible(value);
                break;
            case 'showGroundStations':
                if (app3d.earth?.setGroundStationsVisible) app3d.earth.setGroundStationsVisible(value);
                break;
            case 'showCountryBorders':
                if (app3d.earth?.setCountryBordersVisible) app3d.earth.setCountryBordersVisible(value);
                break;
            case 'showStates':
                if (app3d.earth?.setStatesVisible) app3d.earth.setStatesVisible(value);
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
            // Add more settings as needed
        }
    }
} 