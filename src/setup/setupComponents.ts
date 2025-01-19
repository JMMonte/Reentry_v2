import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Constants } from '../utils/Constants';

interface Settings {
    timeWarp: number;
    startTime: string;
    simulatedTime: string;
}

interface App3D {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    world: CANNON.World;
    settings: Settings;
}

export function setupCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
        42,
        window.innerWidth / window.innerHeight,
        10,
        Constants.kmToMeters * 4e6
    );
    camera.position.set(1000, 7000, 20000).multiplyScalar(Constants.scale);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    return camera;
}

export function setupRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    if (!canvas) {
        console.error('No canvas provided to setupRenderer');
        throw new Error('No canvas provided');
    }

    try {
        // Create WebGL context first
        const contextAttributes: WebGLContextAttributes = {
            alpha: true,
            depth: true,
            stencil: true,
            antialias: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
        };

        const gl = canvas.getContext('webgl2', contextAttributes) || 
                  canvas.getContext('webgl', contextAttributes);

        if (!gl) {
            throw new Error('WebGL not supported');
        }

        // Create renderer with existing context
        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            context: gl,
            ...contextAttributes
        });

        // Check if context was created successfully
        if (!renderer || !renderer.getContext()) {
            throw new Error('Failed to initialize WebGL renderer');
        }

        // Configure renderer
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Use the new color management system
        THREE.ColorManagement.enabled = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        return renderer;
    } catch (error) {
        console.error('Error creating WebGL renderer:', error);
        throw error;
    }
}

export function setupControls(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): OrbitControls {
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 100 * Constants.metersToKm * Constants.scale * 2;
    controls.maxDistance = 50000000 * Constants.scale;
    return controls;
}

export function setupPhysicsWorld(): CANNON.World {
    const world = new CANNON.World();
    world.gravity.set(0, 0, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    (world.solver as any).iterations = 10; // Type assertion needed for CANNON.js solver
    return world;
}

export function setupSettings(): Settings {
    return {
        timeWarp: 1,
        startTime: new Date().toISOString(),
        simulatedTime: new Date().toISOString()
    };
}

export async function setupScene(app: App3D): Promise<THREE.Scene> {
    if (!app.scene || !app.renderer) {
        throw new Error('Scene or renderer not initialized');
    }

    try {
        // Initialize basic scene components that don't need textures
        app.controls = setupControls(app.camera, app.renderer);
        app.world = setupPhysicsWorld();
        app.settings = setupSettings();

        return app.scene;
    } catch (error) {
        console.error('Error setting up scene:', error);
        throw error;
    }
} 