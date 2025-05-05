// setupComponents.js ───────────────────────────────────────────────────────────
// Centralised helpers that create Three.js primitives with sensible defaults.
// Public surface:
//
//   setupCamera()                   → THREE.PerspectiveCamera
//   setupRenderer(canvas)           → THREE.WebGLRenderer
//   setupControls(camera, renderer) → OrbitControls
//   setupPhysicsWorld()             → minimal stub (keeps legacy code happy)
//
// All functions throw with a clear message if they cannot fulfil their contract.
// ──────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Constants } from '../utils/Constants.js';

// ──────────────────────────────────────────────────────────────────────────────
// 1. CAMERA
// ──────────────────────────────────────────────────────────────────────────────
const CAMERA_OPTS = {
    fov: 42,
    near: 0.1,
    farKm: 4e10                       // expressed in kilometres
};
export function setupCamera() {
    const cam = new THREE.PerspectiveCamera(
        CAMERA_OPTS.fov,
        window.innerWidth / window.innerHeight,
        CAMERA_OPTS.near,
        CAMERA_OPTS.farKm * Constants.kmToMeters      // convert to metres
    );

    cam.up.set(0, 0, 1);                              // global Z-up
    cam.position.set(1000, 20000, 7000);      // north-pole vantage
    cam.lookAt(0, 0, 0);
    cam.logarithmicDepthBuffer = true;

    return cam;
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. RENDERER
// ──────────────────────────────────────────────────────────────────────────────
const WEBGL_ATTRS = Object.freeze({
    alpha: true,
    depth: true,
    stencil: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false
});

export function setupRenderer(canvas) {
    if (!canvas) throw new Error('setupRenderer: <canvas> not supplied');

    // Prefer WebGL2 but gracefully fall back
    const gl =
        canvas.getContext('webgl2', WEBGL_ATTRS) ??
        canvas.getContext('webgl', WEBGL_ATTRS);

    if (!gl) throw new Error('WebGL not supported by this browser / driver');

    const renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        logarithmicDepthBuffer: true,
        ...WEBGL_ATTRS          // carry over settings (no MSAA)
    });

    // Runtime sanity check
    if (!renderer.getContext())
        throw new Error('setupRenderer: context initialisation failed');

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));

    renderer.physicallyCorrectLights = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    renderer.shadowMap.enabled = false;

    return renderer;
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. ORBIT CONTROLS
// ──────────────────────────────────────────────────────────────────────────────
export function setupControls(camera, renderer) {
    const controls = new OrbitControls(camera, renderer.domElement);

    controls.minDistance = 1;
    controls.maxDistance = 500_000_000_000;

    return controls;
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. PHYSICS WORLD (stub keeps legacy api compile-time happy)
// ──────────────────────────────────────────────────────────────────────────────
export function setupPhysicsWorld() {
    return { addBody: () => {/* no-op for now */ } };
}
