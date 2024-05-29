class BodySelector {
    constructor(gui, guiManager, satellites, earth, moon) {
        this.gui = gui;
        this.guiManager = guiManager;
        this.satellites = satellites;
        this.earth = earth;
        this.moon = moon;
        this.addBodySelector();
    }

    addBodySelector() {
        this.bodySelectorFolder = this.gui.addFolder('Body Selector');
        const bodies = {
            None: null,
            Earth: this.earth,
            Moon: this.moon,
            ...this.satellites.reduce((acc, satellite) => {
                acc[`Satellite ${satellite.id}`] = satellite;
                return acc;
            }, {})
        };

        this.bodySelector = this.bodySelectorFolder.add({
            selectedBody: 'None'
        }, 'selectedBody', Object.keys(bodies)).name('Select Body');

        this.bodySelector.onChange((value) => {
            this.selectedBody = bodies[value];
            this.guiManager.updateCameraTarget(this.selectedBody);
        });

        this.bodySelectorFolder.open();
    }

    updateBodySelector() {
        const bodies = {
            None: null,
            Earth: this.earth,
            Moon: this.moon,
            ...this.satellites.reduce((acc, satellite) => {
                acc[`Satellite ${satellite.id}`] = satellite;
                return acc;
            }, {})
        };

        this.bodySelector.remove();
        this.bodySelector = this.bodySelectorFolder.add({
            selectedBody: 'None'
        }, 'selectedBody', Object.keys(bodies)).name('Select Body');

        this.bodySelector.onChange((value) => {
            this.selectedBody = bodies[value];
            this.guiManager.updateCameraTarget(this.selectedBody);
        });
    }
}

export { BodySelector };
