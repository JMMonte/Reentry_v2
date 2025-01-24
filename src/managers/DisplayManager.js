export class DisplayManager {
    constructor(app) {
        this.app = app;
        this.displaySettings = new Map();
        this.initialized = false;
        this.initialize();
    }

    initialize() {
        if (this.initialized) {
            console.warn('DisplayManager already initialized');
            return;
        }

        console.log('Initializing DisplayManager...');

        // Listen for component initialization events
        this.app.eventBus.on('componentInitialized', (component) => {
            console.log(`Component initialized: ${component.constructor.name}`);
            this.handleComponentInitialization(component);
        });

        // Listen for display setting updates from internal events
        this.app.eventBus.on('displaySettingChanged', ({ component, key, value }) => {
            this.updateComponentSetting(component, key, value);
        });

        // Listen for individual setting toggles from UI
        document.addEventListener('displaySettingToggled', (event) => {
            if (!event.detail) return;
            const { key, value } = event.detail;
            this.handleUISettingToggle(key, value);
        });

        // Listen for bulk settings updates from UI
        document.addEventListener('displaySettingsUpdate', (event) => {
            if (!event.detail) return;
            this.handleUISettingsUpdate(event.detail);
        });

        this.initialized = true;
    }

    handleComponentInitialization(component) {
        if (!component) return;

        // Get display properties if they exist
        const displayProperties = component.constructor.displayProperties;
        if (!displayProperties) return;

        // Store the initial settings
        this.displaySettings.set(component, new Map(
            Object.entries(displayProperties).map(([key, prop]) => [key, prop.value])
        ));

        // Apply initial settings
        Object.entries(displayProperties).forEach(([key, prop]) => {
            this.updateComponentSetting(component, key, prop.value);
        });

        // Emit updated display properties to UI
        this.emitDisplayProperties();
    }

    updateComponentSetting(component, key, value) {
        if (!component || !this.displaySettings.has(component)) return;

        const componentSettings = this.displaySettings.get(component);
        if (!componentSettings.has(key)) return;

        componentSettings.set(key, value);

        // Update the component if it has an update method
        if (component.updateDisplaySetting) {
            component.updateDisplaySetting(key, value);
        }

        // Emit updated display properties to UI
        this.emitDisplayProperties();
    }

    formatDisplayProperties() {
        const displayProperties = {
            common: {},
            earth: {},
            moon: {},
            sun: {},
            satellites: {}
        };

        this.displaySettings.forEach((settings, component) => {
            const componentName = component.constructor.name;
            const componentProps = component.constructor.displayProperties;

            if (!componentProps) return;

            let targetSection;
            switch (componentName) {
                case 'SceneManager':
                    targetSection = displayProperties.common;
                    break;
                case 'Earth':
                    targetSection = displayProperties.earth;
                    break;
                case 'Moon':
                    targetSection = displayProperties.moon;
                    break;
                case 'Sun':
                    targetSection = displayProperties.sun;
                    break;
                case 'SatelliteManager':
                    targetSection = displayProperties.satellites;
                    break;
                default:
                    return;
            }

            Object.entries(componentProps).forEach(([key, prop]) => {
                targetSection[key] = {
                    ...prop,
                    value: settings.get(key),
                    name: prop.name || key,
                    icon: prop.icon || 'Settings2'
                };
            });
        });

        return displayProperties;
    }

    emitDisplayProperties() {
        const props = this.formatDisplayProperties();
        if (Object.values(props).some(section => Object.keys(section).length > 0)) {
            console.log('Emitting display properties update:', props);
            document.dispatchEvent(new CustomEvent('displayPropertiesUpdate', {
                detail: props
            }));
        }
    }

    getDisplaySettings(component) {
        return this.displaySettings.get(component);
    }

    getAllDisplaySettings() {
        const allSettings = {};
        this.displaySettings.forEach((settings, component) => {
            allSettings[component.constructor.name] = Object.fromEntries(settings);
        });
        return allSettings;
    }

    handleUISettingToggle(key, value) {
        console.log('Display setting toggled:', key, value);
        
        // Find the component that owns this setting
        let targetComponent = null;
        
        // Check SceneManager first for common settings
        if (this.app.managers.scene?.constructor.displayProperties?.[key]) {
            targetComponent = this.app.managers.scene;
        }
        // Check Earth settings
        else if (this.app.earth?.constructor.displayProperties?.[key]) {
            targetComponent = this.app.earth;
        }
        // Check Moon settings
        else if (this.app.moon?.constructor.displayProperties?.[key]) {
            targetComponent = this.app.moon;
        }
        // Check Sun settings
        else if (this.app.sun?.constructor.displayProperties?.[key]) {
            targetComponent = this.app.sun;
        }
        // Check Satellite settings
        else if (this.app.managers.satellite?.constructor.displayProperties?.[key]) {
            targetComponent = this.app.managers.satellite;
        }

        if (targetComponent) {
            this.updateComponentSetting(targetComponent, key, value);
        }
    }

    handleUISettingsUpdate(settings) {
        console.log('Handling UI settings update:', settings);
        
        Object.entries(settings).forEach(([key, value]) => {
            // Find the component that owns this setting
            let targetComponent = null;
            
            // Check SceneManager first for common settings
            if (this.app.managers.scene?.constructor.displayProperties?.[key]) {
                targetComponent = this.app.managers.scene;
            }
            // Check Earth settings
            else if (this.app.earth?.constructor.displayProperties?.[key]) {
                targetComponent = this.app.earth;
            }
            // Check Moon settings
            else if (this.app.moon?.constructor.displayProperties?.[key]) {
                targetComponent = this.app.moon;
            }
            // Check Sun settings
            else if (this.app.sun?.constructor.displayProperties?.[key]) {
                targetComponent = this.app.sun;
            }
            // Check Satellite settings
            else if (this.app.managers.satellite?.constructor.displayProperties?.[key]) {
                targetComponent = this.app.managers.satellite;
            }

            if (targetComponent) {
                this.updateComponentSetting(targetComponent, key, value);
            }
        });
    }

    dispose() {
        this.app.eventBus.off('componentInitialized');
        this.app.eventBus.off('displaySettingChanged');
        document.removeEventListener('displaySettingsUpdate', this.handleUISettingsUpdate);
        document.removeEventListener('displaySettingToggled', this.handleUISettingToggle);
        this.displaySettings.clear();
        this.initialized = false;
    }
} 