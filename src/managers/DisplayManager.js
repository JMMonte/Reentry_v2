import { defaultSettings } from '../components/ui/controls/DisplayOptions.jsx';

export class DisplayManager {
    constructor(app) {
        this.app = app;
        this.settings = {};
        this.initializeSettings();
        this.initializeListener();
    }

    initializeSettings() {
        Object.entries(defaultSettings).forEach(([key, setting]) => {
            this.settings[key] = setting.value;
        });
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
        
        // Update scene-related settings
        if (this.app.sceneManager) {
            this.app.sceneManager.updateDisplaySetting(key, value);
        }

        // Update satellite-related settings
        if (['showOrbits', 'showTraces', 'showGroundTraces', 'showSatVectors'].includes(key)) {
            if (this.app.satelliteManager) {
                Object.values(this.app.satellites).forEach(satellite => {
                    if (satellite) {
                        this.app.satelliteManager.applyDisplaySettings(satellite, this.settings);
                    }
                });
            }
        }

        // Update connection settings
        if (key === 'showSatConnections' && this.app.connectionManager) {
            this.app.connectionManager.setEnabled(value);
        }
    }

    dispose() {
        document.removeEventListener('displaySettingsUpdate', this.updateSetting);
    }
} 