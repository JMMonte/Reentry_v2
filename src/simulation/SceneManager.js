import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { RadialGrid } from '../components/RadialGrid.js';
import { setupScene, setupSceneDetails, setupPostProcessing, loadTextures } from '../setup/setupScene.js';
import { setupPhysicsWorld } from '../setup/setupComponents.js';

/**
 * Manages the Three.js scene, camera, renderer, and post-processing for the simulation.
 */
export class SceneManager {
    /**
     * @param {App3D} app - Reference to the main App3D instance
     */
    constructor(app) {
        this.app = app;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.composers = {};
        this.radialGrid = null;
    }

    /**
     * Initialize the scene, camera, renderer, and post-processing.
     * @returns {Promise<void>}
     */
    async init() {
        // Camera
        this.camera = this.app._camera;
        // Renderer
        this.renderer = this.app._renderer;
        // Scene
        this.scene = new THREE.Scene();
        this.app._scene = this.scene;
        // Label renderer
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.labelRenderer.domElement.style.zIndex = '1';
        document.body.appendChild(this.labelRenderer.domElement);
        // Load textures
        await loadTextures(this.app.textureManager);
        // Physics world (must be before scene details)
        this.app.world = setupPhysicsWorld();
        // Setup scene basics (lights, etc.)
        setupScene(this.app);
        // Setup scene details (Earth, Sun, Moon, etc.)
        await setupSceneDetails(this.app);
        // Setup optimized post-processing
        setupPostProcessing(this.app);
        // Radial grid
        this.radialGrid = new RadialGrid(this.scene);
        this.radialGrid.setVisible(this.app.displaySettingsManager.getSetting('showGrid'));
    }

    /**
     * Dispose of all scene resources.
     */
    dispose() {
        if (this.labelRenderer) {
            if (this.labelRenderer.domElement && this.labelRenderer.domElement.parentNode) {
                this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
            }
            this.labelRenderer = null;
        }
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
            this.scene = null;
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer = null;
        }
        if (this.composers) {
            Object.values(this.composers).forEach(composer => {
                if (composer && composer.dispose) composer.dispose();
            });
            this.composers = {};
        }
        if (this.radialGrid) {
            this.radialGrid = null;
        }
    }
} 