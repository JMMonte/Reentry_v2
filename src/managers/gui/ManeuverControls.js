class ManeuverControls {
    constructor(gui, settings, guiManager, satellites, mainGUIManager) {
        this.gui = gui;
        this.settings = settings;
        this.guiManager = guiManager;
        this.satellites = satellites;
        this.mainGUIManager = mainGUIManager;
        this.addManeuverControls();
    }

    addManeuverControls() {
        this.maneuverFolder = this.gui.addFolder('Maneuvers');
        this.biImpulseFolder = this.maneuverFolder.addFolder('Bi-Impulse Maneuver');

        this.biImpulseData = {
            semiMajorAxis: 7000,
            eccentricity: 0.1,
            inclination: 0,
            longitudeOfAscendingNode: 0,
            argumentOfPeriapsis: 0,
            maneuverMoment: 'Best Moment',
            selectedSatellite: 'None'
        };

        this.updateBiImpulseControls();
    }

    enableManeuverFolder() {
        this.maneuverFolder.open();
    }

    updateBiImpulseControls() {
        const satellitesList = this.satellites.reduce((acc, satellite) => {
            acc[`Satellite ${satellite.id}`] = satellite.id;
            return acc;
        }, { 'None': 'None' });

        if (this.selectedSatelliteController) {
            this.biImpulseFolder.remove(this.selectedSatelliteController);
        }

        this.selectedSatelliteController = this.biImpulseFolder.add(this.biImpulseData, 'selectedSatellite', satellitesList).name('Select Satellite');
        this.biImpulseFolder.add(this.biImpulseData, 'semiMajorAxis', 6578, 42000).name('Semi-Major Axis (km)').step(1);
        this.biImpulseFolder.add(this.biImpulseData, 'eccentricity', 0, 1).name('Eccentricity').step(0.01);
        this.biImpulseFolder.add(this.biImpulseData, 'inclination', 0, 180).name('Inclination (deg)').step(0.1);
        this.biImpulseFolder.add(this.biImpulseData, 'longitudeOfAscendingNode', 0, 360).name('Longitude of Asc. Node (deg)').step(0.1);
        this.biImpulseFolder.add(this.biImpulseData, 'argumentOfPeriapsis', 0, 360).name('Arg. of Periapsis (deg)').step(0.1);
        this.biImpulseFolder.add(this.biImpulseData, 'maneuverMoment', ['Best Moment', 'Periapsis', 'Apoapsis']).name('Maneuver Moment');

        this.biImpulseFolder.add({
            createManeuver: () => this.createBiImpulseManeuver(this.biImpulseData)
        }, 'createManeuver').name('Create Maneuver');

        this.biImpulseFolder.open();
    }

    createBiImpulseManeuver(biImpulseData) {
        const selectedSatellite = this.satellites.find(sat => `${sat.id}` === biImpulseData.selectedSatellite);
        if (!selectedSatellite) {
            console.error('No satellite selected for the maneuver.');
            return;
        }

        const targetElements = {
            semiMajorAxis: biImpulseData.semiMajorAxis * Constants.kmToMeters,
            eccentricity: biImpulseData.eccentricity,
            inclination: THREE.MathUtils.degToRad(biImpulseData.inclination),
            longitudeOfAscendingNode: THREE.MathUtils.degToRad(biImpulseData.longitudeOfAscendingNode),
            argumentOfPeriapsis: THREE.MathUtils.degToRad(biImpulseData.argumentOfPeriapsis),
            trueAnomaly: 0,
        };

        selectedSatellite.setTargetOrbit(targetElements);
        selectedSatellite.maneuverCalculator.setCurrentOrbit(selectedSatellite.maneuverCalculator.currentOrbitalElements);

        let maneuverTime = 0;
        switch (biImpulseData.maneuverMoment) {
            case 'Best Moment':
                const bestMoment = selectedSatellite.calculateBestMomentDeltaV(targetElements);
                maneuverTime = bestMoment.trueAnomaly;
                break;
            case 'Periapsis':
                maneuverTime = 0;
                break;
            case 'Apoapsis':
                maneuverTime = Math.PI;
                break;
        }

        const deltaV = selectedSatellite.calculateDeltaV();
        if (deltaV) {
            selectedSatellite.addManeuverNode(maneuverTime, deltaV.normalize(), deltaV.length());
            selectedSatellite.renderTargetOrbit(targetElements);
            selectedSatellite.renderManeuverNode(maneuverTime);
        }

        this.mainGUIManager.showUpdateAndRemoveButtons();
    }
}

export { ManeuverControls };
