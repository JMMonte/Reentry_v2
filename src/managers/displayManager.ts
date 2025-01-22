import * as THREE from 'three';
import { CelestialBodyType } from '../enums/CelestialBodyType';
import type { 
    App3D, 
    CelestialBody,
    DisplayPropertyDefinition,
    DisplayPropertyDefinitions,
    DisplayPropertyValue,
    DisplayPropertyValues
} from '../types';

interface DisplaySettingsUpdateEvent extends CustomEvent {
    detail: Record<string, any>;
}

interface Constructor<T> {
    new (...args: any[]): T;
    displayProperties?: DisplayPropertyDefinitions;
}

export class DisplayManager {
    private app: App3D;
    private _settings: Record<string, any>;
    private displayProperties: DisplayPropertyValues;
    private boundUpdateHandler: (event: Event) => void;
    private celestialBodies: Map<string, CelestialBody & { updateDisplaySetting?: (key: string, value: any) => void }>;
    private bodiesByType: Map<CelestialBodyType, Array<CelestialBody & { updateDisplaySetting?: (key: string, value: any) => void }>>;

    constructor(app: App3D) {
        this.app = app;
        this._settings = {};
        this.displayProperties = {};
        this.celestialBodies = new Map();
        this.bodiesByType = new Map();
        this.boundUpdateHandler = this.handleDisplaySettingsUpdate.bind(this);
        this.initializeListener();
    }

    public get settings(): Record<string, any> {
        return { ...this._settings };
    }

    private findCelestialBodies(): void {
        this.celestialBodies.clear();
        this.bodiesByType.clear();

        // Initialize bodiesByType with empty arrays for each type
        Object.values(CelestialBodyType).forEach(type => {
            this.bodiesByType.set(type, []);
        });

        this.app.scene.traverse((object: THREE.Object3D) => {
            const celestialBody = object as unknown as CelestialBody & { constructor: Constructor<CelestialBody> };
            if (celestialBody.name && celestialBody.mass && celestialBody.type && celestialBody.constructor.displayProperties) {
                this.celestialBodies.set(celestialBody.name, celestialBody);
                const typeArray = this.bodiesByType.get(celestialBody.type) || [];
                typeArray.push(celestialBody);
                this.bodiesByType.set(celestialBody.type, typeArray);
            }
        });
    }

    public initializeSettings(): void {
        // Find all celestial bodies in the scene
        this.findCelestialBodies();

        // Initialize with scene-level settings
        const sceneManagerConstructor = this.app.sceneManager?.constructor as Constructor<unknown>;
        if (sceneManagerConstructor?.displayProperties) {
            Object.entries(sceneManagerConstructor.displayProperties).forEach(([key, prop]) => {
                this._settings[key] = prop.value;
            });
        }

        // Update settings from all celestial bodies
        this.celestialBodies.forEach(body => {
            const bodyConstructor = body.constructor as Constructor<unknown>;
            if (bodyConstructor.displayProperties) {
                Object.entries(bodyConstructor.displayProperties).forEach(([key, prop]) => {
                    this._settings[key] = prop.value;
                });
            }
        });

        // Add satellite manager settings
        const satelliteManagerConstructor = this.app.satelliteManager?.constructor as Constructor<unknown>;
        if (satelliteManagerConstructor?.displayProperties) {
            Object.entries(satelliteManagerConstructor.displayProperties).forEach(([key, prop]) => {
                this._settings[key] = prop.value;
            });
        }
    }

    public collectDisplayProperties(): DisplayPropertyValues {
        const displayProperties: DisplayPropertyValues = {};

        // Common display properties from SceneManager
        const sceneManagerConstructor = this.app.sceneManager?.constructor as Constructor<unknown>;
        if (sceneManagerConstructor?.displayProperties) {
            displayProperties.common = Object.entries(sceneManagerConstructor.displayProperties).reduce((acc, [key, prop]) => {
                acc[key] = { ...(prop as DisplayPropertyDefinition), value: this._settings[key] };
                return acc;
            }, {} as Record<string, DisplayPropertyDefinition>);
        }

        // Collect display properties by celestial body type
        this.bodiesByType.forEach((bodies, type) => {
            if (bodies.length > 0) {
                const typeKey = type.toLowerCase();
                displayProperties[typeKey] = {};
                bodies.forEach(body => {
                    const bodyConstructor = body.constructor as Constructor<unknown>;
                    if (bodyConstructor.displayProperties) {
                        const nameKey = body.name.toLowerCase();
                        displayProperties[typeKey][nameKey] = 
                            Object.entries(bodyConstructor.displayProperties).reduce((acc, [key, prop]) => {
                                acc[key] = { ...(prop as DisplayPropertyDefinition), value: this._settings[key] };
                                return acc;
                            }, {} as Record<string, DisplayPropertyDefinition>);
                    }
                });
            }
        });

        // Satellite display properties
        const satelliteManagerConstructor = this.app.satelliteManager?.constructor as Constructor<unknown>;
        if (satelliteManagerConstructor?.displayProperties) {
            displayProperties.satellites = Object.entries(satelliteManagerConstructor.displayProperties).reduce((acc, [key, prop]) => {
                acc[key] = { ...(prop as DisplayPropertyDefinition), value: this._settings[key] };
                return acc;
            }, {} as Record<string, DisplayPropertyDefinition>);
        }

        this.displayProperties = displayProperties;
        return displayProperties;
    }

    private initializeListener(): void {
        document.addEventListener('displaySettingsUpdate', this.boundUpdateHandler);
    }

    private handleDisplaySettingsUpdate(event: Event): void {
        const customEvent = event as DisplaySettingsUpdateEvent;
        if (customEvent.detail) {
            Object.entries(customEvent.detail).forEach(([key, value]) => {
                this.updateSetting(key, value);
            });
        }
    }

    public updateSetting(key: string, value: any): void {
        if (this._settings[key] === value) return;
        
        this._settings[key] = value;

        // Update all celestial bodies
        this.celestialBodies.forEach(body => {
            if (body.updateDisplaySetting) {
                body.updateDisplaySetting(key, value);
            }
        });

        // Update satellite manager settings
        if (this.app.satelliteManager?.updateDisplaySetting) {
            this.app.satelliteManager.updateDisplaySetting(key, value);
        }
        
        // Update scene-related settings
        if (this.app.sceneManager?.updateDisplaySetting) {
            this.app.sceneManager.updateDisplaySetting(key, value);
        }
    }

    public dispose(): void {
        document.removeEventListener('displaySettingsUpdate', this.boundUpdateHandler);
        this.celestialBodies.clear();
    }
} 