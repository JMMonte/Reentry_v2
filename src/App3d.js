// app3d.js
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import Stats from 'stats.js';
import { TimeUtils } from './utils/TimeUtils.js';
import { TextureManager } from './managers/TextureManager.js';
import { CameraControls } from './managers/CameraControls.js';
import { setupEventListeners, setupSocketListeners } from './setup/SetupListeners.js';
import { setupCamera, setupRenderer, setupControls } from './setup/SetupComponents.js';
import { TimeControlManager } from './managers/TimeControlManager.js';
import { BodySelectorManager } from './managers/BodySelectorManager.js';
import { SatelliteManager } from './managers/SatelliteManager.js';
import { PhysicsManager } from './managers/PhysicsManager.js';
import { SceneManager } from './managers/SceneManager.js';
import { ConnectionManager } from './managers/ConnectionManager.js';
import { DisplayManager } from './managers/DisplayManager.js';
import { APIManager } from './managers/APIManager.js';
import { SocketManager } from './managers/SocketManager.js';
import { EventBus } from './utils/EventBus.js';

class App3D extends EventTarget {
    constructor(config = {}) {
        super();
        this.initialize(config);
    }

    async initialize(config) {
        try {
            await this.initializeCore(config);
            await this.initializeManagers();
            await this.initializeScene();
            await this.initializeControls();
            await this.initializeEvents();
            this.startRenderLoop();
            this.dispatchEvent(new Event('sceneReady'));
        } catch (error) {
            console.error('App3D: Initialization failed:', error);
            await this.dispose();
            throw error;
        }
    }

    async initializeCore(config) {
        // Core properties
        this.isInitialized = false;
        this.lastTime = performance.now();
        this.animationFrameId = null;
        this.canvas = document.getElementById('three-canvas');
        this.satellites = {};
        this.eventBus = new EventBus();
        this.composers = {};

        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }

        // Initialize core components
        this.camera = setupCamera();
        if (!this.camera) {
            throw new Error('Failed to initialize camera');
        }

        this.renderer = setupRenderer(this.canvas);
        if (!this.renderer) {
            throw new Error('Failed to initialize renderer');
        }

        this.initializeLabelRenderer();
        this.stats = new Stats();
        this.applyStatsStyle();

        // Initialize time utils
        this.timeUtils = new TimeUtils({
            simulatedTime: config.initialTime || new Date().toISOString()
        });
    }

    async initializeManagers() {
        try {
            // Define manager initialization order based on dependencies
            const managerInitOrder = [
                'texture',    // TextureManager must be first as others depend on it
                'physics',    // PhysicsManager is relatively independent
                'socket',    // SocketManager is relatively independent
                'display',   // DisplayManager depends on textures
                'scene',     // SceneManager depends on textures and display
                'satellite', // SatelliteManager depends on scene
                'api',       // APIManager depends on SatelliteManager for satellites getter
                'connection' // ConnectionManager depends on satellites
            ];

            // Create manager instances with necessary dependencies
            this.managers = {
                texture: new TextureManager(),
                physics: new PhysicsManager(this),
                scene: new SceneManager(this, this.renderer), // Pass renderer explicitly
                satellite: new SatelliteManager(this),
                display: new DisplayManager(this),
                connection: new ConnectionManager(this),
                api: new APIManager(this),
                socket: new SocketManager(this)
            };

            // Set up direct references to critical managers
            this.textureManager = this.managers.texture;
            this.scene = this.managers.scene.scene;

            if (!this.scene) {
                throw new Error('Scene not created by SceneManager');
            }

            // Initialize managers in the correct order
            for (const managerName of managerInitOrder) {
                const manager = this.managers[managerName];
                if (!manager) {
                    throw new Error(`Manager ${managerName} not found`);
                }

                try {
                    if (manager.initialize) {
                        await manager.initialize();
                    }
                } catch (error) {
                    console.error(`Failed to initialize ${managerName} manager:`, error);
                    throw error;
                }
            }

        } catch (error) {
            console.error('Failed to initialize managers:', error);
            throw error;
        }
    }

    async initializeScene() {
        try {
            // Ensure required components are initialized
            if (!this.managers.texture || !this.managers.texture.isInitialized) {
                throw new Error('TextureManager not properly initialized');
            }
            if (!this.scene || !this.renderer) {
                throw new Error('Scene or renderer not properly initialized');
            }

            // Enable camera layers
            this.camera.layers.enable(1);

            // Initialize display settings
            await this.managers.display.initializeSettings();

            // No need to initialize scene again as it's done in initializeManagers
            await this.managers.connection.initialize();
        } catch (error) {
            console.error('Scene initialization failed:', error);
            throw error;
        }
    }

    async initializeControls() {
        try {
            // Initialize controls
            this.controls = setupControls(this.camera, this.renderer);
            this.cameraControls = new CameraControls(this.camera, this.controls);

            // Initialize managers that depend on controls
            this.timeControlManager = new TimeControlManager(this.timeUtils);
            new BodySelectorManager(this);
        } catch (error) {
            console.error('Controls initialization failed:', error);
            throw error;
        }
    }

    initializeEvents() {
        setupEventListeners(this);
        setupSocketListeners(this, this.managers.socket.getSocket());
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.onWindowResize();
    }

    startRenderLoop() {
        this.isInitialized = true;
        this.animate();
    }

    animate() {
        if (!this.validateRenderState()) return;

        this.animationFrameId = requestAnimationFrame(() => this.animate());

        try {
            this.stats?.begin();
            this.updateTime();
            this.updateScene();
            this.render();
            this.stats?.end();
        } catch (error) {
            console.error('Error in animation loop:', error);
        }
    }

    validateRenderState() {
        if (!this.isInitialized || !this.scene || !this.camera || !this.renderer) {
            console.warn('Essential components not initialized, skipping render');
            return false;
        }
        return true;
    }

    updateTime() {
        const timestamp = performance.now();
        this.timeUtils.update(timestamp);
        const currentTime = this.timeUtils.getSimulatedTime();
        const realDeltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        const warpedDeltaTime = realDeltaTime * this.timeUtils.timeWarp;

        return { currentTime, realDeltaTime, warpedDeltaTime };
    }

    updateScene() {
        const { currentTime, realDeltaTime, warpedDeltaTime } = this.updateTime();

        // Update controls and physics
        this.controls?.update();
        this.managers.physics.updatePhysics(realDeltaTime, this.timeUtils.timeWarp);
        this.managers.connection.updateConnections();

        // Update satellites
        Object.values(this.satellites).forEach(satellite => {
            if (satellite.updateSatellite) {
                satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            }
        });

        // Update scene and camera
        this.managers.scene.updateScene(currentTime);
        this.cameraControls?.updateCameraPosition();
    }

    render() {
        // Render scene
        if (this.composers.final) {
            this.composers.final.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }

        // Render labels
        if (this.labelRenderer) {
            this.labelRenderer.render(this.scene, this.camera);
        }
    }

    onWindowResize = () => {
        if (!this.camera || !this.renderer) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelRatio = Math.min(window.devicePixelRatio, 1.3);

        // Update camera
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Update renderers
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(pixelRatio);
        this.labelRenderer?.setSize(width, height);

        // Update composers
        if (this.composers.bloom && this.composers.final) {
            this.composers.bloom.setSize(width, height);
            this.composers.final.setSize(width, height);
        }
    }

    updateTimeWarp(value) {
        this.timeUtils?.setTimeWarp(value);
    }

    updateSelectedBody(value) {
        if (!this.cameraControls) return;

        if (!value || value === 'none') {
            this.cameraControls.clearCameraTarget();
        } else if (value === 'earth') {
            this.cameraControls.updateCameraTarget(this.managers.scene.earth);
        } else if (value === 'moon') {
            this.cameraControls.updateCameraTarget(this.managers.scene.moon);
        } else if (typeof value === 'string' && value.startsWith('satellite-')) {
            const satelliteId = parseInt(value.split('-')[1]);
            const satellite = this.satellites[satelliteId];
            if (satellite) {
                this.cameraControls.updateCameraTarget(satellite);
            }
        }
    }

    async dispose() {
        this.isInitialized = false;

        try {
            // Stop animation
            cancelAnimationFrame(this.animationFrameId);

            // Dispose composers
            Object.values(this.composers || {}).forEach(composer => {
                composer?.dispose?.();
            });

            // Dispose managers
            for (const manager of Object.values(this.managers || {})) {
                await manager.dispose?.();
            }

            // Clean up renderer
            if (this.renderer) {
                this.renderer.dispose();
                this.renderer.forceContextLoss();
                this.renderer = null;
            }

            // Clean up event listeners
            window.removeEventListener('resize', this.onWindowResize);
            this.eventBus.dispose();

            // Clean up reference
            window.app3d = null;
        } catch (error) {
            console.error('Error during cleanup:', error);
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

    applyStatsStyle() {
        if (this.stats?.dom) {
            this.stats.dom.style.cssText = 'position:fixed;bottom:16px;right:16px;cursor:pointer;opacity:0.9;z-index:10000;';
            document.body.appendChild(this.stats.dom);
        }
    }
}

export default App3D;
