import * as THREE from 'three';
import { RadialGrid } from '../components/RadialGrid.js';
import { setupScene, setupSceneDetails, setupPostProcessing, loadTextures } from '../setup/setupScene.js';

export class SceneManager {
    constructor(app) {
        this.app = app;
        this.scene = new THREE.Scene();
        this.radialGrid = null;
        this.vectors = null;
        this.earth = null;
        this.moon = null;
        this.sun = null;
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
            if (this.app.displayManager?.settings) {
                this.radialGrid.setVisible(this.app.displayManager.settings.showGrid);
            }

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

    updateDisplaySetting(key, value) {
        switch (key) {
            case 'showGrid':
                if (this.radialGrid) {
                    this.radialGrid.setVisible(value);
                }
                break;
            case 'showVectors':
                if (this.vectors) {
                    this.vectors.setVisible(value);
                }
                break;
            case 'showSurfaceLines':
                if (this.earth?.setSurfaceLinesVisible) {
                    this.earth.setSurfaceLinesVisible(value);
                }
                break;
            case 'showCities':
                if (this.earth?.setCitiesVisible) {
                    this.earth.setCitiesVisible(value);
                }
                break;
            case 'showAirports':
                if (this.earth?.setAirportsVisible) {
                    this.earth.setAirportsVisible(value);
                }
                break;
            case 'showSpaceports':
                if (this.earth?.setSpaceportsVisible) {
                    this.earth.setSpaceportsVisible(value);
                }
                break;
            case 'showObservatories':
                if (this.earth?.setObservatoriesVisible) {
                    this.earth.setObservatoriesVisible(value);
                }
                break;
            case 'showGroundStations':
                if (this.earth?.setGroundStationsVisible) {
                    this.earth.setGroundStationsVisible(value);
                }
                break;
            case 'showCountryBorders':
                if (this.earth?.setCountryBordersVisible) {
                    this.earth.setCountryBordersVisible(value);
                }
                break;
            case 'showStates':
                if (this.earth?.setStatesVisible) {
                    this.earth.setStatesVisible(value);
                }
                break;
            case 'showMoonOrbit':
                if (this.moon?.setOrbitVisible) {
                    this.moon.setOrbitVisible(value);
                }
                break;
            case 'showMoonTraces':
                if (this.moon?.setTraceVisible) {
                    this.moon.setTraceVisible(value);
                }
                break;
            case 'showMoonSurfaceLines':
                if (this.moon?.setSurfaceDetailsVisible) {
                    this.moon.setSurfaceDetailsVisible(value);
                }
                break;
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