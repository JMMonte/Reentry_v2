export class DisplayManager {
    constructor(app) {
        this.app = app;
        this.settings = {};
        this.displayProperties = {};
        this.initializeListener();
    }

    initializeSettings() {
        // Initialize with scene-level settings
        if (this.app.sceneManager) {
            Object.entries(this.app.sceneManager.constructor.displayProperties).forEach(([key, prop]) => {
                this.settings[key] = prop.value;
            });
        }

        // Update settings from object-defined properties
        if (this.app.earth) {
            Object.entries(this.app.earth.constructor.displayProperties).forEach(([key, prop]) => {
                this.settings[key] = prop.value;
            });
        }
        if (this.app.moon) {
            Object.entries(this.app.moon.constructor.displayProperties).forEach(([key, prop]) => {
                this.settings[key] = prop.value;
            });
        }
        if (this.app.sun) {
            Object.entries(this.app.sun.constructor.displayProperties).forEach(([key, prop]) => {
                this.settings[key] = prop.value;
            });
        }
        if (this.app.satelliteManager) {
            Object.entries(this.app.satelliteManager.constructor.displayProperties).forEach(([key, prop]) => {
                this.settings[key] = prop.value;
            });
        }
    }

    collectDisplayProperties() {
        const displayProperties = {};

        // Common display properties from SceneManager
        if (this.app.sceneManager) {
            displayProperties.common = Object.entries(this.app.sceneManager.constructor.displayProperties).reduce((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Earth display properties
        if (this.app.earth) {
            displayProperties.earth = Object.entries(this.app.earth.constructor.displayProperties).reduce((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Moon display properties
        if (this.app.moon) {
            displayProperties.moon = Object.entries(this.app.moon.constructor.displayProperties).reduce((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Sun display properties
        if (this.app.sun) {
            displayProperties.sun = Object.entries(this.app.sun.constructor.displayProperties).reduce((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Satellite display properties
        if (this.app.satelliteManager) {
            displayProperties.satellites = Object.entries(this.app.satelliteManager.constructor.displayProperties).reduce((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        this.displayProperties = displayProperties;
        return displayProperties;
    }

    initializeListener() {
        document.addEventListener('displaySettingsUpdate', (event) => {
            if (event.detail) {
                Object.entries(event.detail).forEach(([key, value]) => {
                    this.updateSetting(key, value);
                });
            }
        });
    }

    updateSetting(key, value) {
        if (this.settings[key] === value) return;
        
        this.settings[key] = value;

        // Update object-specific settings
        if (this.app.earth?.updateDisplaySetting) {
            this.app.earth.updateDisplaySetting(key, value);
        }
        if (this.app.moon?.updateDisplaySetting) {
            this.app.moon.updateDisplaySetting(key, value);
        }
        if (this.app.satelliteManager?.updateDisplaySetting) {
            this.app.satelliteManager.updateDisplaySetting(key, value);
        }
        
        // Update scene-related settings
        if (this.app.sceneManager) {
            this.app.sceneManager.updateDisplaySetting(key, value);
        }
    }

    dispose() {
        document.removeEventListener('displaySettingsUpdate', this.updateSetting);
    }
} 