import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { setupCamera, setupRenderer } from '../setup/setupComponents';
import { RadialGrid } from '../components/RadialGrid';
import { Constants } from '../utils/Constants';
import type { CelestialBody } from '../types';
import { setupScene, setupSceneDetails, setupPostProcessing, loadTextures } from '../setup/setupScene';
import App3D from '../app3d';

export class SceneManager {
    protected scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private composer: EffectComposer;
    protected earth: CelestialBody;
    protected moon: CelestialBody;
    private sun?: CelestialBody & { update: () => void };
    private radialGrid?: RadialGrid;
    private displaySettings: Record<string, boolean>;
    private initialized: boolean;

    constructor(app: App3D, canvas: HTMLCanvasElement) {
        // Initialize basic properties
        this.scene = new THREE.Scene();
        this.camera = setupCamera();
        this.renderer = setupRenderer(canvas);
        this.composer = new EffectComposer(this.renderer);
        this.initialized = false;
        this.displaySettings = {
            showGrid: true,
            showOrbits: true,
            showVectors: true,
            showLabels: true,
            showAtmosphere: true,
            showClouds: true,
            showStars: true
        };

        // Setup initial scene
        setupScene(this.scene);
        setupPostProcessing(this.scene, this.camera, this.renderer, this.composer);
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Load textures
            const textures = await loadTextures();

            // Setup scene details
            setupSceneDetails(this.scene);

            // Initialize celestial bodies
            await this.initializeCelestialBodies(textures);

            // Initialize radial grid
            this.radialGrid = new RadialGrid(this.scene);

            this.initialized = true;
        } catch (error) {
            console.error('Error initializing SceneManager:', error);
            throw error;
        }
    }

    private async initializeCelestialBodies(textures: Record<string, THREE.Texture>): Promise<void> {
        // This will be implemented when we have the celestial body classes ready
        // For now, it's a placeholder that will be expanded as we migrate more components
    }

    public updateScene(deltaTime: number): void {
        if (!this.initialized) {
            return;
        }

        // Update celestial bodies
        if (this.earth?.update) {
            this.earth.update();
        }
        if (this.sun?.update) {
            this.sun.update();
        }
        if (this.moon?.update) {
            this.moon.update();
        }

        // Update post-processing effects
        if (this.composer) {
            this.composer.render(deltaTime);
        }
    }

    public getDisplaySettings(): Record<string, boolean> {
        return { ...this.displaySettings };
    }

    public updateDisplaySettings(settings: Partial<Record<string, boolean>>): void {
        Object.assign(this.displaySettings, settings);
        this.applyDisplaySettings();
    }

    private applyDisplaySettings(): void {
        if (!this.initialized) {
            return;
        }

        if (this.radialGrid) {
            this.radialGrid.setVisible(this.displaySettings.showGrid);
        }
        // Additional display settings will be applied here
    }

    public dispose(): void {
        // Dispose of all resources
        this.scene.traverse((object: THREE.Object3D) => {
            if (object instanceof THREE.Mesh) {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });

        if (this.radialGrid) {
            this.radialGrid.dispose();
        }

        this.renderer.dispose();
        this.composer.dispose();
    }
} 