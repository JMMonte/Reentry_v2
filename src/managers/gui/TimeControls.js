//TimeControls.js
import { Constants } from '../../utils/Constants.js';

class TimeControls {
    constructor(gui, settings, timeUtils, world) {
        this.gui = gui;
        this.settings = settings;
        this.timeUtils = timeUtils;
        this.world = world;
        this.currentTimeWarpIndex = Constants.timeWarpOptions.indexOf(1); // Start at 1x

        this.updateSimulatedTime();
        setInterval(() => this.updateSimulatedTime(), 1);

        this.addTimeControls();
        this.addSimulationDisplay();
        this.setupHTMLControls();
    }

    addTimeControls() {
        const timeWarpLabels = {
            0: 'Paused',
            1: 'Normal (1x)',
            3: 'Fast (3x)',
            10: 'Faster (10x)',
            30: 'Ludicrous (30x)',
            100: 'Thanos (100x)',
            300: 'Mr. Spock (300x)',
            1000: 'Dr. Strange (1000x)',
            3000: 'Godspeed (3000x)',
            10000: 'Plaid (10000x)',
            30000: 'Harambe (30000x)',
            100000: 'Multiverse (100000x)',
        };

        const timeWarpObject = {};
        Constants.timeWarpOptions.forEach(value => {
            timeWarpObject[timeWarpLabels[value] || value] = value;
        });

        this.gui.add(this.settings, 'timeWarp', timeWarpObject)
            .name('Time Warp')
            .onChange(this.updateTimeWarp.bind(this));
    }

    updateTimeWarp(value) {
        this.timeUtils.setTimeWarp(value);
        this.world.timeScale = value;
        this.world.solver.iterations = value * 2;
        this.updateHTMLDisplay();
    }

    addSimulationDisplay() {
        this.gui.add(this.settings, 'simulatedTime').name('Simulated Time').listen();
    }

    setupHTMLControls() {
        document.getElementById('decrease-time-warp').addEventListener('click', () => this.changeTimeWarp(-1));
        document.getElementById('increase-time-warp').addEventListener('click', () => this.changeTimeWarp(1));
        document.getElementById('reset-time-warp').addEventListener('click', () => this.resetTimeWarp());

        document.addEventListener('updateTimeWarp', (event) => {
            const newValue = event.detail.value;
            this.updateTimeWarp(newValue);
        });

        this.updateHTMLDisplay();
    }

    changeTimeWarp(direction) {
        this.currentTimeWarpIndex = Math.max(0, Math.min(this.currentTimeWarpIndex + direction, Constants.timeWarpOptions.length - 1));
        const newValue = Constants.timeWarpOptions[this.currentTimeWarpIndex];
        this.updateTimeWarp(newValue);
    }

    resetTimeWarp() {
        this.currentTimeWarpIndex = Constants.timeWarpOptions.indexOf(1);
        this.updateTimeWarp(1);
    }

    updateHTMLDisplay() {
        const currentValue = Constants.timeWarpOptions[this.currentTimeWarpIndex];
        document.getElementById('current-time-warp').textContent = currentValue + 'x';
        this.settings.timeWarp = currentValue;
    }
    
    updateSimulatedTime() {
        const simulatedTime = this.timeUtils.getSimulatedTime();
        this.settings.simulatedTime = simulatedTime.toISOString();
        
        // Emit a custom event with the updated time
        document.dispatchEvent(new CustomEvent('timeUpdate', {
            detail: { simulatedTime: simulatedTime.toISOString() }
        }));
    }
}

export { TimeControls };