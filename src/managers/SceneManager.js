import * as THREE from 'three';
import { RadialGrid } from '../components/RadialGrid.js';
import { loadTextures, setupPostProcessing } from '../setup/SetupScene.js';
import { Earth } from '../components/Earth.js';
import { Sun } from '../components/Sun.js';
import { Moon } from '../components/Moon.js';
import { Vectors } from '../components/Vectors.js';
import { BackgroundStars } from '../components/BackgroundStars.js';

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
        this.initialized = false;
        this.components = new Map();

        // Initialize display settings from static properties
        this.displaySettings = {};
        Object.entries(SceneManager.displayProperties).forEach(([key, prop]) => {
            this.displaySettings[key] = prop.value;
        });

        // Add ambient light in constructor
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.ambientLight);
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
                    if (this.ambientLight) {
                        this.ambientLight.intensity = value;
                    }
                    break;
            }
        }
    }

    async initialize() {
        try {
            if (this.initialized) {
                console.warn('SceneManager already initialized');
                return;
            }

            console.log('Initializing SceneManager...');

            // Emit initialization event for SceneManager itself first
            this.app.eventBus.emit('componentInitialized', this);

            // Load textures first
            await loadTextures(this.app.textureManager);

            // Initialize background stars
            if (!this.components.get('backgroundStars')) {
                console.log('Creating BackgroundStars...');
                const stars = new BackgroundStars(this.scene, this.app.camera);
                this.components.set('backgroundStars', stars);
                this.app.eventBus.emit('componentInitialized', stars);
            }

            // Create components only if they don't exist
            if (!this.app.earth) {
                console.log('Creating Earth...');
                this.app.earth = new Earth(this.scene, null, this.app.renderer, this.app.timeUtils, this.app.textureManager, this.app);
                this.components.set('earth', this.app.earth);
                this.app.eventBus.emit('componentInitialized', this.app.earth);
            }

            if (!this.app.sun) {
                console.log('Creating Sun...');
                this.app.sun = new Sun(this.scene, this.app.timeUtils);
                this.components.set('sun', this.app.sun);
                this.app.eventBus.emit('componentInitialized', this.app.sun);
            }

            if (!this.app.moon) {
                console.log('Creating Moon...');
                this.app.moon = new Moon(this.scene, null, this.app.renderer, this.app.timeUtils, this.app.textureManager);
                this.components.set('moon', this.app.moon);
                this.app.eventBus.emit('componentInitialized', this.app.moon);
            }

            if (!this.app.vectors) {
                console.log('Creating Vectors...');
                this.app.vectors = new Vectors(this.app.earth, this.scene, this.app.timeUtils);
                this.components.set('vectors', this.app.vectors);
                this.app.eventBus.emit('componentInitialized', this.app.vectors);
            }

            // Initialize radial grid
            if (!this.radialGrid) {
                console.log('Creating RadialGrid...');
                this.radialGrid = new RadialGrid(this.scene);
                this.components.set('radialGrid', this.radialGrid);
                this.app.eventBus.emit('componentInitialized', this.radialGrid);
            }

            this.initialized = true;
            console.log('SceneManager initialization complete');
        } catch (error) {
            console.error('Error initializing SceneManager:', error);
            throw error;
        }
    }

    updateScene(currentTime) {
        if (this.app.earth) {
            this.app.earth.updateRotation();
            this.app.earth.updateLightDirection();
        }
        if (this.app.sun) {
            this.app.sun.updatePosition(currentTime);
        }
        if (this.app.moon) {
            this.app.moon.updatePosition(currentTime);
            this.app.moon.updateRotation(currentTime);
        }
        if (this.app.vectors) {
            this.app.vectors.updateVectors();
        }
    }

    dispose() {
        console.log('Disposing SceneManager...');

        // Dispose of all components
        this.components.forEach((component, key) => {
            if (component.dispose) {
                console.log(`Disposing ${key}...`);
                component.dispose();
            }
        });

        this.components.clear();

        // Clear the scene
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }

        this.initialized = false;
    }
} 