// DisplayOptions.js
class DisplayOptions {
    constructor(gui, settings, guiManager) {
        this.gui = gui;
        this.settings = settings;
        this.guiManager = guiManager;
        this.addDisplayOptions();
    }

    addDisplayOptions() {
        const displayFolder = this.gui.addFolder('Display Options');

        const options = [
            { key: 'showGrid', name: 'Grid', method: this.toggleGridVisibility.bind(this) },
            { key: 'showVectors', name: 'Vectors', method: this.toggleVectorVisibility.bind(this) },
            { key: 'showSatVectors', name: 'Sat Vectors', method: this.toggleSatelliteVectorsVisibility.bind(this) },
            { key: 'showSurfaceLines', name: 'Surface Lines', method: this.toggleSurfaceLinesVisibility.bind(this) },
            { key: 'showOrbits', name: 'Sat Orbits', method: this.toggleOrbitVisibility.bind(this) },
            { key: 'showTraces', name: 'Sat Traces', method: this.toggleSatTracesVisibility.bind(this) },
            { key: 'showGroundTraces', name: 'Ground Traces', method: this.toggleGroundTracesVisibility.bind(this) },
            { key: 'showCities', name: 'Cities', method: this.toggleCitiesVisibility.bind(this) },
            { key: 'showAirports', name: 'Airports', method: this.toggleAirportsVisibility.bind(this) },
            { key: 'showSpaceports', name: 'Spaceports', method: this.toggleSpaceportsVisibility.bind(this) },
            { key: 'showObservatories', name: 'Observatories', method: this.toggleObservatoriesVisibility.bind(this) },
            { key: 'showGroundStations', name: 'Ground Stations', method: this.toggleGroundStationsVisibility.bind(this) },
            { key: 'showCountryBorders', name: 'Country Borders', method: this.toggleCountryBordersVisibility.bind(this) },
            { key: 'showStates', name: 'States', method: this.toggleStatesVisibility.bind(this) },
            { key: 'showMoonOrbit', name: 'Moon Orbit', method: this.toggleMoonOrbitVisibility.bind(this) },
            { key: 'showMoonTraces', name: 'Moon Trace Lines', method: this.toggleMoonTraceLinesVisibility.bind(this) },
            { key: 'showMoonSurfaceLines', name: 'Moon Surface Lines', method: this.toggleMoonSurfaceLinesVisibility.bind(this) }
        ];

        options.forEach(option => {
            displayFolder.add(this.settings, option.key).name(option.name).onChange(option.method);
        });
    }

    toggleGridVisibility(value) {
        this.guiManager.gridHelper.visible = value;
    }

    toggleVectorVisibility(value) {
        this.guiManager.vectors.setVisible(value);
    }

    toggleSatelliteVectorsVisibility(value) {
        this.guiManager.vectors.setSatVisible(value);
    }

    toggleSurfaceLinesVisibility(value) {
        this.guiManager.earth.setSurfaceLinesVisible(value);
    }

    toggleOrbitVisibility(value) {
        this.guiManager.satellites.forEach(satellite => {
            satellite.setOrbitVisible(value);
        });
    }

    toggleSatTracesVisibility(value) {
        this.guiManager.satellites.forEach(satellite => {
            satellite.setTraceVisible(value);
        });
    }

    toggleGroundTracesVisibility(value) {
        this.guiManager.satellites.forEach(satellite => {
            satellite.setGroundTraceVisible(value);
        });
    }

    toggleMoonOrbitVisibility(value) {
        this.guiManager.moon.setOrbitVisible(value);
    }

    toggleMoonSurfaceLinesVisibility(value) {
        this.guiManager.moon.setSurfaceDetailsVisible(value);
    }

    toggleMoonTraceLinesVisibility(value) {
        this.guiManager.moon.setTraceVisible(value);
    }

    toggleCitiesVisibility(value) {
        this.guiManager.earth.setCitiesVisible(value);
    }

    toggleAirportsVisibility(value) {
        this.guiManager.earth.setAirportsVisible(value);
    }

    toggleSpaceportsVisibility(value) {
        this.guiManager.earth.setSpaceportsVisible(value);
    }

    toggleObservatoriesVisibility(value) {
        this.guiManager.earth.setObservatoriesVisible(value);
    }

    toggleGroundStationsVisibility(value) {
        this.guiManager.earth.setGroundStationsVisible(value);
    }

    toggleCountryBordersVisibility(value) {
        this.guiManager.earth.setCountryBordersVisible(value);
    }

    toggleStatesVisibility(value) {
        this.guiManager.earth.setStatesVisible(value);
    }

    update() {
        this.guiManager.update();
    }

    applyInitialSettings() {
        this.toggleGridVisibility(this.settings.showGrid);
        this.toggleVectorVisibility(this.settings.showVectors);
        this.toggleSatelliteVectorsVisibility(this.settings.showSatVectors);
        this.toggleSurfaceLinesVisibility(this.settings.showSurfaceLines);
        this.toggleOrbitVisibility(this.settings.showOrbits);
        this.toggleSatTracesVisibility(this.settings.showTraces);
        this.toggleGroundTracesVisibility(this.settings.showGroundTraces); // New line
        this.toggleCitiesVisibility(this.settings.showCities);
        this.toggleAirportsVisibility(this.settings.showAirports);
        this.toggleSpaceportsVisibility(this.settings.showSpaceports);
        this.toggleObservatoriesVisibility(this.settings.showObservatories);
        this.toggleGroundStationsVisibility(this.settings.showGroundStations);
        this.toggleCountryBordersVisibility(this.settings.showCountryBorders);
        this.toggleStatesVisibility(this.settings.showStates);
        this.toggleMoonOrbitVisibility(this.settings.showMoonOrbit);
        this.toggleMoonTraceLinesVisibility(this.settings.showMoonTraces);
        this.toggleMoonSurfaceLinesVisibility(this.settings.showMoonSurfaceLines);
    }
}

export { DisplayOptions };
