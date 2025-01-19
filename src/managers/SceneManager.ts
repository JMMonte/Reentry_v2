import * as THREE from 'three';
import { RadialGrid } from '../components/RadialGrid';
import { setupScene, setupSceneDetails, setupPostProcessing, loadTextures } from '../setup/setupScene';
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

interface CelestialBody {
    updateRotation(): void;
    updateLightDirection?(): void;
    updatePosition?(currentTime: Date): void;
}

interface VectorSystem {
    updateVectors(): void;
}

interface App3D {
    earth: CelestialBody;
    moon: CelestialBody;
    sun: CelestialBody;
    vectors: VectorSystem;
    textureManager: {
        loadTexture(url: string, name: string): Promise<THREE.Texture>;
    };
}

export class SceneManager implements Manager {
    // Define common display properties
    static displayProperties: DisplayProperties = {
        showGrid: { value: true, name: 'Grid', icon: 'Grid' },
        ambientLight: {
            value: 0.1,
            name: 'Ambient Light',
            icon: 'Settings2',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.05
        }
    };

    private app: App3D;
    public scene: THREE.Scene;
    private radialGrid: RadialGrid | null;
    private vectors: VectorSystem | null;
    private earth: CelestialBody | null;
    private moon: CelestialBody | null;
    private sun: CelestialBody | null;
    private displaySettings: DisplaySettings;

    constructor(app: App3D) {
        this.app = app;
        this.scene = new THREE.Scene();
        this.radialGrid = null;
        this.vectors = null;
        this.earth = null;
        this.moon = null;
        this.sun = null;

        // Initialize display settings from static properties
        this.displaySettings = {};
        Object.entries(SceneManager.displayProperties).forEach(([key, prop]) => {
            this.displaySettings[key] = prop.value;
        });
    }

    // Method to get current display settings
    public getDisplaySettings(): DisplaySettings {
        return this.displaySettings;
    }

    // Method to update a display setting
    public updateDisplaySetting(key: string, value: boolean | number): void {
        if (key in this.displaySettings) {
            this.displaySettings[key] = value;
            switch (key) {
                case 'showGrid':
                    if (this.radialGrid) {
                        this.radialGrid.setVisible(value as boolean);
                    }
                    break;
                case 'ambientLight':
                    // Handle ambient light changes
                    break;
            }
        }
    }

    public async initialize(): Promise<void> {
        try {
            // Setup basic scene first
            await setupScene(this.app);

            // Load textures
            await loadTextures(this.app.textureManager);

            // Setup scene details after textures are loaded
            await setupSceneDetails(this.app);
            await setupPostProcessing(this.app);

            // Initialize radial grid
            this.radialGrid = new RadialGrid(this.scene);
            this.radialGrid.setVisible(this.displaySettings.showGrid as boolean);

            // Store references to celestial bodies
            this.earth = this.app.earth;
            this.moon = this.app.moon;
            this.sun = this.app.sun;
            this.vectors = this.app.vectors;
        } catch (error) {
            console.error('Error initializing scene:', error);
            throw error;
        }
    }

    public updateScene(currentTime: Date): void {
        if (this.earth) {
            this.earth.updateRotation();
            this.earth.updateLightDirection?.();
        }
        if (this.sun) {
            this.sun.updatePosition?.(currentTime);
        }
        if (this.moon) {
            this.moon.updatePosition?.(currentTime);
            this.moon.updateRotation();
        }
        if (this.vectors) {
            this.vectors.updateVectors();
        }
    }

    public dispose(): void {
        // Dispose of scene objects
        if (this.scene) {
            this.scene.traverse((object: THREE.Object3D) => {
                if ('material' in object) {
                    const obj = object as THREE.Mesh;
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(material => {
                            if (material.dispose) material.dispose();
                        });
                    } else if (obj.material.dispose) {
                        obj.material.dispose();
                    }
                }
                if ('geometry' in object) {
                    const obj = object as THREE.Mesh;
                    if (obj.geometry?.dispose) {
                        obj.geometry.dispose();
                    }
                }
            });
        }

        // Clear references
        this.scene = null!;
        this.radialGrid = null;
        this.vectors = null;
        this.earth = null;
        this.moon = null;
        this.sun = null;
    }
} 