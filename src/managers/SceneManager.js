import * as THREE from 'three';
import { RadialGrid } from '../components/RadialGrid.js';
import { setupScene, setupSceneDetails, setupPostProcessing, loadTextures } from '../setup/setupScene.js';

export class SceneManager {
    // Define common display properties
    static displayProperties = {
        showGrid: { value: true, name: 'Grid', icon: 'Grid' },
        ambientLight: { value: 0.1, name: 'Ambient Light', icon: 'Settings2', type: 'range', min: 0, max: 1, step: 0.05 }
    };

    constructor(app) {
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
    getDisplaySettings() {
        return this.displaySettings;
    }

    // Method to update a display setting
    updateDisplaySetting(key, value) {
        if (key in this.displaySettings) {
            this.displaySettings[key] = value;
            switch (key) {
                case 'showGrid':
                    if (this.radialGrid) {
                        this.radialGrid.setVisible(value);
                    }
                    break;
                case 'ambientLight':
                    // Handle ambient light changes
                    break;
            }
        }
    }

    async initialize() {
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
            this.radialGrid.setVisible(this.displaySettings.showGrid);

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

    updateScene(currentTime) {
        if (this.earth) {
            this.earth.updateRotation();
            this.earth.updateLightDirection();
        }
        if (this.sun) {
            this.sun.updatePosition(currentTime);
        }
        if (this.moon) {
            this.moon.updatePosition(currentTime);
            this.moon.updateRotation(currentTime);
        }
        if (this.vectors) {
            this.vectors.updateVectors();
        }
    }

    dispose() {
        // Dispose of scene objects
        if (this.scene) {
            this.scene.traverse((object) => {
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => {
                            if (material.dispose) material.dispose();
                        });
                    } else if (object.material.dispose) {
                        object.material.dispose();
                    }
                }
                if (object.geometry && object.geometry.dispose) {
                    object.geometry.dispose();
                }
            });
        }

        // Clear references
        this.scene = null;
        this.radialGrid = null;
        this.vectors = null;
        this.earth = null;
        this.moon = null;
        this.sun = null;
    }
} 