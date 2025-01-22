import { Manager } from '../types';

interface DisplayProperty {
    value: boolean | number;
    name: string;
    icon: string;
    type?: 'range';
    min?: number;
    max?: number;
    step?: number;
}

interface DisplayProperties {
    [key: string]: DisplayProperty;
}

interface DisplaySettings {
    [key: string]: boolean | number;
}

interface DisplayPropertiesCollection {
    common?: { [key: string]: DisplayProperty };
    earth?: { [key: string]: DisplayProperty };
    moon?: { [key: string]: DisplayProperty };
    sun?: { [key: string]: DisplayProperty };
    satellites?: { [key: string]: DisplayProperty };
}

interface DisplaySettingsUpdateEvent extends CustomEvent<DisplaySettings> {
    detail: DisplaySettings;
}

interface App3D {
    sceneManager?: {
        constructor: { displayProperties: DisplayProperties };
        updateDisplaySetting: (key: string, value: boolean | number) => void;
    };
    earth?: {
        constructor: { displayProperties: DisplayProperties };
        updateDisplaySetting: (key: string, value: boolean | number) => void;
    };
    moon?: {
        constructor: { displayProperties: DisplayProperties };
        updateDisplaySetting: (key: string, value: boolean | number) => void;
    };
    sun?: {
        constructor: { displayProperties: DisplayProperties };
        updateDisplaySetting: (key: string, value: boolean | number) => void;
    };
    satelliteManager?: {
        constructor: { displayProperties: DisplayProperties };
        updateDisplaySetting: (key: string, value: boolean | number) => void;
    };
}

export class DisplayManager implements Manager {
    private app: App3D;
    private settings: DisplaySettings;
    private displayProperties: DisplayPropertiesCollection;
    private boundUpdateSettingsHandler: (event: DisplaySettingsUpdateEvent) => void;

    constructor(app: App3D) {
        this.app = app;
        this.settings = {};
        this.displayProperties = {};
        this.boundUpdateSettingsHandler = this.handleDisplaySettingsUpdate.bind(this);
        this.initializeListener();
    }

    public async initialize(): Promise<void> {
        this.initializeSettings();
        return Promise.resolve();
    }

    private initializeSettings(): void {
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

    public collectDisplayProperties(): DisplayPropertiesCollection {
        const displayProperties: DisplayPropertiesCollection = {};

        // Common display properties from SceneManager
        if (this.app.sceneManager) {
            displayProperties.common = Object.entries(this.app.sceneManager.constructor.displayProperties).reduce<{ [key: string]: DisplayProperty }>((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Earth display properties
        if (this.app.earth) {
            displayProperties.earth = Object.entries(this.app.earth.constructor.displayProperties).reduce<{ [key: string]: DisplayProperty }>((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Moon display properties
        if (this.app.moon) {
            displayProperties.moon = Object.entries(this.app.moon.constructor.displayProperties).reduce<{ [key: string]: DisplayProperty }>((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Sun display properties
        if (this.app.sun) {
            displayProperties.sun = Object.entries(this.app.sun.constructor.displayProperties).reduce<{ [key: string]: DisplayProperty }>((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        // Satellite display properties
        if (this.app.satelliteManager) {
            displayProperties.satellites = Object.entries(this.app.satelliteManager.constructor.displayProperties).reduce<{ [key: string]: DisplayProperty }>((acc, [key, prop]) => {
                acc[key] = { ...prop, value: this.settings[key] };
                return acc;
            }, {});
        }

        this.displayProperties = displayProperties;
        return displayProperties;
    }

    private handleDisplaySettingsUpdate(event: DisplaySettingsUpdateEvent): void {
        if (event.detail) {
            Object.entries(event.detail).forEach(([key, value]) => {
                this.updateSetting(key, value);
            });
        }
    }

    private initializeListener(): void {
        document.addEventListener('displaySettingsUpdate', this.boundUpdateSettingsHandler as EventListener);
    }

    public updateSetting(key: string, value: boolean | number): void {
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

    public dispose(): void {
        document.removeEventListener('displaySettingsUpdate', this.boundUpdateSettingsHandler as EventListener);
    }
} 