import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'stats.js';
import { TimeUtils } from './utils/TimeUtils';
import { TextureManager } from './managers/textureManager';
import { CameraControls } from './managers/cameraControls';
import { setupEventListeners, setupSocketListeners } from './setup/setupListeners';
import { setupCamera, setupRenderer, setupControls } from './setup/setupComponents';
import { initTimeControls } from './timeControls';
import { initializeBodySelector } from './bodySelectorControls';
import { SatelliteManager } from './managers/satelliteManager';
import { PhysicsManager } from './managers/physicsManager';
import { SceneManager } from './managers/sceneManager';
import { ConnectionManager } from './managers/connectionManager';
import { DisplayManager } from './managers/displayManager';
import { APIManager } from './managers/apiManager';
import { SocketManager } from './managers/socketManager';
import { Satellite, SatelliteMap, Composers } from './types';

class App3D extends EventTarget {
    public isInitialized: boolean;
    public camera: THREE.PerspectiveCamera | null;
    public renderer: THREE.WebGLRenderer | null;
    public labelRenderer: CSS2DRenderer | null;
    public controls: OrbitControls | null;
    public composers: Composers;
    public lastTime: number;
    public animationFrameId: number | null;
    public canvas: HTMLCanvasElement;
    public satellites: SatelliteMap;
    public scene: THREE.Scene;
    public earth?: THREE.Object3D;
    public timeUtils: TimeUtils;
    public stats: Stats;
    public textureManager: TextureManager;
    public displayManager: DisplayManager;
    public physicsManager: PhysicsManager;
    public sceneManager: SceneManager;
    public satelliteManager: SatelliteManager;
    public connectionManager: ConnectionManager;
    public apiManager: APIManager;
    public socketManager: SocketManager;
    public cameraControls!: CameraControls;

    // Dynamic methods added at runtime
    public createDebugWindow?: (satellite: Satellite) => void;
    public updateSatelliteList?: () => void;
    public removeDebugWindow?: (satelliteId: number) => void;
    public updateDisplaySetting?: (key: string, value: any) => void;

    constructor() {
        super();
        console.log('App3D: Initializing...');
        (window as any).app3d = this;

        // Initialize core properties
        this.isInitialized = false;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.controls = null;
        this.composers = {};
        this.lastTime = performance.now();
        this.animationFrameId = null;
        this.canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
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

    async init(): Promise<void> {
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

    private initializeLabelRenderer(): void {
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.labelRenderer.domElement.style.zIndex = '1';
        document.body.appendChild(this.labelRenderer.domElement);
    }

    private animate(): void {
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

    private onWindowResize = (): void => {
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

    public updateTimeWarp(value: number): void {
        if (this.timeUtils) {
            this.timeUtils.setTimeWarp(value);
        }
    }

    public updateSelectedBody(value: string): void {
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

    public dispose(): void {
        console.log('Disposing App3D...');
        this.isInitialized = false;

        try {
            if (this.animationFrameId !== null) {
                cancelAnimationFrame(this.animationFrameId);
            }

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

            (window as any).app3d = null;
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    private applyStatsStyle(): void {
        if (this.stats?.dom) {
            this.stats.dom.style.cssText = 'position:fixed;bottom:16px;right:16px;cursor:pointer;opacity:0.9;z-index:10000;';
            document.body.appendChild(this.stats.dom);
        }
    }
}

export default App3D; 