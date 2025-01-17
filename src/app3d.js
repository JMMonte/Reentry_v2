// app3d.js
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import Stats from 'stats.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/TextureManager.js';
import { CameraControls } from './managers/CameraControls.js';
import { setupEventListeners, setupSocketListeners } from './setup/setupListeners.js';
import { setupCamera, setupRenderer, setupControls } from './setup/setupComponents.js';
import { initTimeControls } from './timeControls.js';
import { initializeBodySelector } from './bodySelectorControls.js';
import { SatelliteManager } from './managers/SatelliteManager.js';
import { PhysicsManager } from './managers/PhysicsManager.js';
import { SceneManager } from './managers/SceneManager.js';
import { ConnectionManager } from './managers/ConnectionManager.js';
import { DisplayManager } from './managers/DisplayManager.js';
import { APIManager } from './managers/APIManager.js';
import { SocketManager } from './managers/SocketManager.js';

class App3D extends EventTarget {
    constructor() {
        super();
        console.log('App3D: Initializing...');
        window.app3d = this;

        // Initialize core properties
        this.isInitialized = false;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.controls = null;
        this.composers = {};
        this.lastTime = performance.now();
        this.animationFrameId = null;
        this.canvas = document.getElementById('three-canvas');
        this.satellites = {};
        
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }

        // Initialize managers in dependency order
        this.textureManager = new TextureManager();
        this.displayManager = new DisplayManager(this);
        this.physicsManager = new PhysicsManager(this);
        this.sceneManager = new SceneManager(this);
        this.satelliteManager = new SatelliteManager(this);
        this.connectionManager = new ConnectionManager(this);
        this.apiManager = new APIManager(this);
        this.socketManager = new SocketManager(this);

        // Get scene reference
        this.scene = this.sceneManager.scene;

        // Initialize time utils and stats
        this.timeUtils = new TimeUtils({
            simulatedTime: new Date().toISOString()
        });
        this.stats = new Stats();

        // Initialize the app
        this.init();
    }

    async init() {
        console.log('Initializing App...');
        
        try {
            // Setup camera
            this.camera = setupCamera();
            if (!this.camera) {
                throw new Error('Failed to initialize camera');
            }
            this.camera.layers.enable(1);

            // Initialize renderer
            this.renderer = setupRenderer(this.canvas);
            if (!this.renderer) {
                throw new Error('Failed to initialize renderer');
            }

            // Initialize label renderer
            this.initializeLabelRenderer();

            // Initialize display settings before scene initialization
            this.displayManager.initializeSettings();

            // Initialize scene and managers
            await this.sceneManager.initialize();
            this.connectionManager.initialize();

            // Initialize controls
            this.controls = setupControls(this.camera, this.renderer);
            if (!this.controls) {
                throw new Error('Failed to initialize controls');
            }

            // Initialize camera controls
            this.cameraControls = new CameraControls(this.camera, this.controls);
            if (!this.cameraControls) {
                throw new Error('Failed to initialize camera controls');
            }

            // Initialize interface and controls
            setupEventListeners(this);
            setupSocketListeners(this, this.socketManager.getSocket());
            initTimeControls(this.timeUtils);
            initializeBodySelector(this);

            // Apply stats style
            this.applyStatsStyle();

            // Set initialization flag and start animation
            this.isInitialized = true;
            window.addEventListener('resize', this.onWindowResize.bind(this));
            this.onWindowResize();
            this.animate();

            // Dispatch ready event
            this.dispatchEvent(new Event('sceneReady'));
            console.log('App initialization complete');
        } catch (error) {
            console.error('Error during initialization:', error);
            this.dispose();
            throw error;
        }
    }

    initializeLabelRenderer() {
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.labelRenderer.domElement.style.zIndex = '1';
        document.body.appendChild(this.labelRenderer.domElement);
    }

    animate() {
        if (!this.isInitialized || !this.scene || !this.camera || !this.renderer) {
            console.warn('Essential components not initialized, skipping render');
            return;
        }

        this.animationFrameId = requestAnimationFrame(() => this.animate());

        try {
            if (this.stats) this.stats.begin();

            // Update time
            const timestamp = performance.now();
            this.timeUtils.update(timestamp);
            const currentTime = this.timeUtils.getSimulatedTime();
            const realDeltaTime = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;
            const warpedDeltaTime = realDeltaTime * this.timeUtils.timeWarp;

            // Update components
            if (this.controls?.update) this.controls.update();
            this.physicsManager.updatePhysics(realDeltaTime, this.timeUtils.timeWarp);
            this.connectionManager.updateConnections();

            // Update satellites
            Object.values(this.satellites).forEach(satellite => {
                if (satellite.updateSatellite) {
                    satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
                }
            });

            // Update scene and camera
            this.sceneManager.updateScene(currentTime);
            if (this.cameraControls?.updateCameraPosition) {
                this.cameraControls.updateCameraPosition();
            }

            // Render
            if (this.composers.final) {
                this.composers.final.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }

            if (this.labelRenderer) {
                this.labelRenderer.render(this.scene, this.camera);
            }

            if (this.stats) this.stats.end();
        } catch (error) {
            console.error('Error in animation loop:', error);
        }
    }

    onWindowResize = () => {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
            
            if (this.composers.bloom && this.composers.final) {
                this.composers.bloom.setSize(window.innerWidth, window.innerHeight);
                this.composers.final.setSize(window.innerWidth, window.innerHeight);
            }

            if (this.labelRenderer) {
                this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
            }
        }
    }

    updateTimeWarp(value) {
        if (this.timeUtils) {
            this.timeUtils.setTimeWarp(value);
        }
    }

    updateSelectedBody(value) {
        if (this.cameraControls) {
            if (!value || value === 'none') {
                this.cameraControls.clearCameraTarget();
            } else if (value === 'earth') {
                this.cameraControls.updateCameraTarget(this.sceneManager.earth);
            } else if (value === 'moon') {
                this.cameraControls.updateCameraTarget(this.sceneManager.moon);
            } else if (typeof value === 'string' && value.startsWith('satellite-')) {
                const satelliteId = parseInt(value.split('-')[1]);
                const satellite = this.satellites[satelliteId];
                if (satellite) {
                    this.cameraControls.updateCameraTarget(satellite);
                }
            }
        }
    }

    dispose() {
        console.log('Disposing App3D...');
        this.isInitialized = false;

        try {
            cancelAnimationFrame(this.animationFrameId);

            // Dispose of composers
            Object.values(this.composers).forEach(composer => {
                if (composer?.dispose) composer.dispose();
            });

            // Clean up managers
            this.sceneManager.dispose();
            this.satelliteManager.dispose();
            this.physicsManager.dispose();
            this.connectionManager.dispose();
            this.textureManager.dispose();
            this.displayManager.dispose();
            this.apiManager.dispose();
            this.socketManager.dispose();

            // Clean up renderer
            if (this.renderer) {
                this.renderer.dispose();
                this.renderer.forceContextLoss();
                this.renderer = null;
            }

            window.app3d = null;
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    applyStatsStyle() {
        if (this.stats?.dom) {
            this.stats.dom.style.cssText = 'position:fixed;bottom:16px;right:16px;cursor:pointer;opacity:0.9;z-index:10000;';
            document.body.appendChild(this.stats.dom);
        }
    }
}

export default App3D;
