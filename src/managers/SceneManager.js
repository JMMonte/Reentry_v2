// SceneManager.js ─ drop-in
// Manages the Three.js scene, camera, renderer, physics and post-processing.
// One public method:  await sceneManager.init();

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
// import { RadialGrid } from '../components/RadialGrid.js'; // Removed import
import { initScene } from '../setup/setupScene.js';         // new API
import { setupPhysicsWorld } from '../setup/setupComponents.js';

/**
 * @typedef {import('../app/App3D').App3D} App3D
 */

/** Central owner of all scene-graph resources. */
export class SceneManager {
    /**
     * @param {App3D} app – reference to the root App3D object
     */
    constructor(app) {
        this.app = app;

        // 3-D primitives
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // UI helpers
        this.labelRenderer = null;
        // this.radialGrid = null; // Removed property

        // EffectComposer instances
        this.composers = {};
    }

    /** Initialise scene, physics, post-processing and helpers. */
    async init() {
        /* 1 ─ link camera & renderer supplied by App3D */
        this.camera = this.app._camera;
        this.renderer = this.app._renderer;

        /* 2 ─ create a fresh scene and expose it back to the app */
        this.scene = new THREE.Scene();
        this.app._scene = this.scene;

        /* 3 ─ overlay renderer for HTML (CSS2D) labels */
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        Object.assign(this.labelRenderer.domElement.style, {
            position: 'absolute',
            top: '0',
            pointerEvents: 'none',
            zIndex: '1'
        });
        document.body.appendChild(this.labelRenderer.domElement);

        /* 4 ─ physics world (must exist before vectors use it) */
        this.app.world = setupPhysicsWorld();

        /* 5 ─ one call sets up textures, lights, bodies, bloom, etc. */
        await initScene(this.app);

        /* 6 ─ optional ecliptic-plane helper grid (REMOVED - now handled per-planet) */
        // this.radialGrid = new RadialGrid(this.scene);
        // if (this.app.displaySettingsManager) {
        //     this.radialGrid.setVisible(
        //         this.app.displaySettingsManager.getSetting('showGrid')
        //     );
        // }
    }

    /** Dispose of WebGL resources and DOM side-effects. */
    dispose() {
        // 2-D overlay
        if (this.labelRenderer?.domElement?.parentNode) {
            this.labelRenderer.domElement.parentNode.removeChild(
                this.labelRenderer.domElement
            );
        }
        this.labelRenderer = null;

        // Scene graph
        if (this.scene) {
            this.scene.traverse(obj => {
                // dispose materials
                if (obj.material) {
                    const mats = Array.isArray(obj.material)
                        ? obj.material
                        : [obj.material];
                    mats.forEach(m => m?.dispose?.());
                }
                // dispose geometry
                obj.geometry?.dispose?.();
            });
            this.scene = null;
        }

        // Renderer
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer = null;
        }

        // Post-processing
        Object.values(this.composers).forEach(c => c?.dispose?.());
        this.composers = {};

        // Grid helper (REMOVED)
        // this.radialGrid = null;
    }
}
