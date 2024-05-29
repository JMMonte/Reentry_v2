class TimeControls {
    constructor(gui, settings, timeUtils, world) {
        this.gui = gui;
        this.settings = settings;
        this.timeUtils = timeUtils;
        this.addTimeControls();
        this.addSimulationDisplay();
        this.world = world;
    }

    addTimeControls() {
        this.gui.add(this.settings, 'timeWarp', {
            'Paused': 0,
            'Normal (1x)': 1,
            'Fast (3)': 3,
            'Faster (10)': 10,
            'Ludicrous (30)': 30,
            'Thanos (100)': 100,
            'Mr. Spock (300)': 300,
            'Dr. Strange (1000)': 1000,
            'Godspeed (3000)': 3000,
            'Plaid (10000)': 10000,
            'Harambe (30000)': 30000,
            'Multiverse (100000)': 100000,
        }).name('Time Warp').onChange(this.updateTimeWarp.bind(this));
    }

    updateTimeWarp(value) {
        this.timeUtils.setTimeWarp(value);
        this.world.timeScale = value;
        this.world.solver.iterations = value * 2;
    }

    addSimulationDisplay() {
        this.gui.add(this.settings, 'simulatedTime').name('Simulated Time').listen();
    }
}

export { TimeControls };
