class DebugOptions {
    constructor(gui, settings, worldDebugger) {
        this.gui = gui;
        this.settings = settings;
        this.worldDebugger = worldDebugger;
        this.addDebugOptions();
    }

    addDebugOptions() {
        const debugFolder = this.gui.addFolder('Debugging');
        debugFolder.add(this.settings, 'showDebugger').name('Show Physics Debug').onChange(this.toggleDebuggerVisibility.bind(this));
    }

    toggleDebuggerVisibility(value) {
        this.worldDebugger.enabled = value;
    }
}

export { DebugOptions };
