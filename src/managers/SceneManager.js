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

    /** Per-frame update: physics, visuals, UI, and display settings. */
    updateFrame() {
        this._syncBodiesAndPhysics();
        this._updateVectors();
        this._updateSatelliteLinks();
        this._resizePOIs();
        this._updateLensFlare();
        this._applyDisplaySettings();
    }

    _syncBodiesAndPhysics() {
        const { physicsWorld, sun, satellites, camera } = this.app;
        physicsWorld.update();
        if (sun && physicsWorld?.bodies) {
            const sunBody = physicsWorld.bodies.find(b => b.nameLower === 'sun');
            if (sunBody?.position) {
                // Store previous sun position for interpolation
                if (!sunBody.prevPosition) {
                    sunBody.prevPosition = sunBody.position.clone();
                } else {
                    sunBody.prevPosition.copy(sun.position || sunBody.position);
                }
                sun.setPosition(sunBody.position);
            }
        }
        const kmToM = 1 / this.app.Constants.metersToKm;
        physicsWorld.satellites.forEach((psat, id) => {
            const satVis = satellites.getSatellites()[id];
            if (satVis && psat.position && psat.velocity) {
                const posM = psat.position.clone().multiplyScalar(kmToM);
                const velM = psat.velocity.clone().multiplyScalar(kmToM);
                satVis.updatePosition(posM, velM, psat.debug);
            }
        });
        const bodiesByKey = new Map(physicsWorld.bodies.map(b => [b.name.toLowerCase(), b]));
        const alpha = 1;
        const cam = camera;
        for (const p of this.app.Planet.instances) {
            const bodyKey = p.name.toLowerCase();
            // Render EMB orbit for Earth (IAU standard)
            // const orbitKey = (bodyKey === 'earth') ? 'emb' : bodyKey;
            // if (this.app.orbitManager) {
            //     this.app.orbitManager.updateOrbitPath(orbitKey);
            // }
            const body = bodiesByKey.get(bodyKey);
            if (body?.position) {
                let x, y, z;
                if (body.prevPosition) {
                    x = body.prevPosition.x + (body.position.x - body.prevPosition.x) * alpha;
                    y = body.prevPosition.y + (body.position.y - body.prevPosition.y) * alpha;
                    z = body.prevPosition.z + (body.position.z - body.prevPosition.z) * alpha;
                } else {
                    ({ x, y, z } = body.position);
                }
                const cfg = this.app.celestialBodiesConfig[p.nameLower];
                // Only apply parent-relative offset for bodies other than the Moon
                if (cfg.parent && cfg.parent !== 'barycenter' && bodyKey !== 'moon') {
                    const parent = bodiesByKey.get(cfg.parent);
                    if (parent?.position) {
                        x -= parent.position.x;
                        y -= parent.position.y;
                        z -= parent.position.z;
                    }
                }
                p.getOrbitGroup().position.set(x, y, z);
            }
            p.updateAxisHelperPosition?.();
            p.radialGrid?.updatePosition();
            p.radialGrid?.updateFading(cam);
            p.getOrbitGroup().updateMatrixWorld(true);
            p.update();
        }
        // Interpolated sun position for atmosphere update
        let interpolatedSunPos = null;
        if (sun && physicsWorld?.bodies) {
            const sunBody = physicsWorld.bodies.find(b => b.nameLower === 'sun');
            if (sunBody?.position && sunBody.prevPosition) {
                interpolatedSunPos = sunBody.prevPosition.clone().lerp(sunBody.position, alpha);
                sun.sun.getWorldPosition = (target) => {
                    if (target) target.copy(interpolatedSunPos);
                    return interpolatedSunPos.clone();
                };
            }
        }
        for (const p of this.app.Planet.instances) {
            p.atmosphereComponent?.update();
        }
    }

    _updateVectors() {
        const { displaySettingsManager, planetVectors, satelliteVectors, camera } = this.app;
        if (displaySettingsManager.getSetting('showVectors')) {
            planetVectors?.forEach(v => {
                v.updateVectors?.();
                v.updateFading?.(camera);
            });
        }
        if (displaySettingsManager.getSetting('showSatVectors')) {
            satelliteVectors?.updateSatelliteVectors?.();
        }
    }

    _updateSatelliteLinks() {
        if (this.app._connectionsEnabled) this.app._syncConnectionsWorker();
    }

    _resizePOIs() {
        if (!this.app.pickablePoints?.length) return;
        const { camera } = this.app;
        const pixelSize = 8;
        const vFOV = this.app.THREE.MathUtils.degToRad(camera.fov);
        const halfH = window.innerHeight;
        const tmp = new this.app.THREE.Vector3();
        const scaleFor = dist => (2 * Math.tan(vFOV / 2) * dist) * (pixelSize / halfH);
        this.app.pickablePoints.forEach(mesh => {
            if (!mesh.visible) return;
            mesh.getWorldPosition(tmp);
            const s = scaleFor(tmp.distanceTo(camera.position));
            mesh.scale.set(s, s, 1);
        });
        if (this.app._poiIndicator) {
            this.app._poiIndicator.getWorldPosition(tmp);
            const s = scaleFor(tmp.distanceTo(camera.position)) * 1.2;
            this.app._poiIndicator.scale.set(s, s, 1);
        }
    }

    _updateLensFlare() {
        if (this.app.sun) {
            this.app.sun.updateLensFlare(this.app.camera);
        }
    }

    _applyDisplaySettings() {
        this.app.displaySettingsManager.applyAll();
    }
}
