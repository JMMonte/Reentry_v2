// setupComponents.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Constants } from './utils/Constants.js';

export function setupCamera() {
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

export function setupRenderer() {
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('three-canvas'),
        antialias: true,
        depth: true,
        logarithmicDepthBuffer: false,
        powerPreference: 'high-performance',
        precision: 'highp'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
    renderer.physicallyCorrectLights = true;
    renderer.autoClear = false;
    return renderer;
}

export function setupControls(camera, renderer) {
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 100 * Constants.metersToKm * Constants.scale * 2;
    controls.maxDistance = 50000000 * Constants.scale;
    return controls;
}

export function setupPhysicsWorld() {
    const world = new CANNON.World();
    world.gravity.set(0, 0, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
    return world;
}

export function setupSettings() {
    return {
        timeWarp: 1,
        startTime: new Date().toISOString(),
        simulatedTime: new Date().toISOString(),
        showGrid: false,
        showVectors: false,
        showSatVectors: true,
        showDebugger: false,
        showSurfaceLines: false,
        showOrbits: true,
        showTraces: true,
        showGroundTraces: true,
        showCities: false,
        showAirports: false,
        showSpaceports: false,
        showObservatories: false,
        showGroundStations: false,
        showCountryBorders: false,
        showStates: false,
        showMoonOrbit: false,
        showMoonTraces: false,
        showMoonSurfaceLines: false,
    };
}
