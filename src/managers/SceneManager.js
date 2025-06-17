// SceneManager.js ─ drop-in
// Manages the Three.js scene, camera, renderer, physics and post-processing.
// One public method:  await sceneManager.init();

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
// import { RadialGrid } from '../components/RadialGrid.js'; // Removed import
import { initScene } from '../setup/setupScene.js';         // new API
// Removed legacy setupPhysicsWorld import; physics handled by backend sim stream

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

        this._lastOrbitUpdateJD = null;
        this._orbitUpdateThreshold = 0.01; // days
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

        /* 4 ─ physics handled via backend sim stream; frontend physics world removed */
        // this.app.world = setupPhysicsWorld();

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

    /** Per-frame update: physics, visuals, UI, and display settings. */
    updateFrame() {
        this._syncBodiesAndPhysics();
        this._updateVectors();
        this._resizePOIs();
        this._updateLensFlare();
    }

    _syncBodiesAndPhysics() {
        // PhysicsWorld and orbitManager loops are now disabled.
        // All planetary and satellite state is updated via local physics engine only.
    }

    _updateVectors() {
        const { displaySettingsManager, planetVectors, camera } = this.app;
        const showPlanetVectors = displaySettingsManager.getSetting('showPlanetVectors');

        // Early exit if planet vectors are hidden
        if (planetVectors && showPlanetVectors) {
            planetVectors.forEach(v => {
                if (v.setPlanetVectorsVisible) {
                    v.setPlanetVectorsVisible(true);
                }
                v.updateVectors?.();
                v.updateFading?.(camera);
            });
        } else if (planetVectors && !showPlanetVectors) {
            // Just hide them, no updates needed
            planetVectors.forEach(v => {
                if (v.setPlanetVectorsVisible) {
                    v.setPlanetVectorsVisible(false);
                }
            });
        }

        // Satellite vectors are now handled by individual SatelliteVectorVisualizer instances
        // No global update needed - each satellite manages its own vectors
    }

    _resizePOIs() {
        // Early return if POI picking is disabled or no pickable points exist
        if (!this.app.pickablePoints?.length) return;
        const { camera } = this.app;
        
        // Cache FOV calculations - only recalculate when FOV or window size changes
        if (!this._cachedPOIScale || 
            this._lastFOV !== camera.fov || 
            this._lastWindowHeight !== window.innerHeight) {
            
            const pixelSize = 8;
            const vFOV = this.app.THREE.MathUtils.degToRad(camera.fov);
            const halfH = window.innerHeight;
            this._cachedPOIScale = (2 * Math.tan(vFOV / 2)) * (pixelSize / halfH);
            this._lastFOV = camera.fov;
            this._lastWindowHeight = window.innerHeight;
            
            if (!this._poiTempVec) {
                this._poiTempVec = new this.app.THREE.Vector3();
            }
        }
        
        const tmp = this._poiTempVec;
        const baseScale = this._cachedPOIScale;
        
        // Only update visible POIs - use centralized distance cache for massive performance gain
        this.app.pickablePoints.forEach((mesh, index) => {
            if (!mesh.visible) return;
            
            // Try to use cached distance first
            const poiId = `poi_${index}`;
            let distance = this.app.distanceCache.getDistance(poiId);
            
            // Fallback to direct calculation if not cached
            if (!distance || distance === 0) {
                mesh.getWorldPosition(tmp);
                distance = tmp.distanceTo(camera.position);
            }
            
            const s = baseScale * distance;
            mesh.scale.set(s, s, 1);
        });
        
        if (this.app._poiIndicator && this.app._poiIndicator.visible) {
            // Use cached distance for POI indicator
            let distance = this.app.distanceCache.getDistance('poi_indicator');
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                this.app._poiIndicator.getWorldPosition(tmp);
                distance = tmp.distanceTo(camera.position);
            }
            
            const s = baseScale * distance * 1.2;
            this.app._poiIndicator.scale.set(s, s, 1);
        }
    }

    _updateLensFlare() {
        if (this.app.sun) {
            this.app.sun.updateLensFlare(this.app.camera);
        }
    }
}
