import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneCamera {
    constructor(renderer, initialPosition, initialTarget) {
        this.camera = new THREE.PerspectiveCamera(
            42, // Field of view
            window.innerWidth / window.innerHeight, // Aspect ratio
            1, // Near clipping plane
            400000000 * 1000 // Far clipping plane
        );
        this.camera.position.copy(initialPosition);

        this.orbitControls = new OrbitControls(this.camera, renderer.domElement);
        this.orbitControls.minDistance = 100 * 1000 * 2;
        this.orbitControls.maxDistance = 50000000 * 1;
        this.orbitControls.enablePan = true; // Ensure panning is enabled
        this.orbitControls.target.copy(initialTarget);
        this.orbitControls.update();

        // Spherical coordinates
        this.spherical = new THREE.Spherical();
        this.updateSphericalFromCamera();

        // Listen to orbit control changes to update the spherical coordinates
        this.orbitControls.addEventListener('change', () => {
            this.updateSphericalFromCamera();
        });

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }

    update() {
        if (this.needsSmoothTransition) {
            this.orbitControls.target.lerp(this.targetPosition, 0.05); // Adjust the lerp factor as needed
            if (this.orbitControls.target.distanceTo(this.targetPosition) < 0.01) {
                this.orbitControls.target.copy(this.targetPosition);
                this.needsSmoothTransition = false;
            }
        }
        this.orbitControls.update();
    }

    focusOnObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);
        this.targetPosition = center;
        this.needsSmoothTransition = true;
    }

    updateOrbitTarget(position) {
        this.orbitControls.target.copy(position);
        const newPosition = new THREE.Vector3().setFromSpherical(this.spherical).add(this.orbitControls.target);
        this.camera.position.copy(newPosition);
        this.orbitControls.update();
    }

    updateSphericalFromCamera() {
        this.spherical.setFromVector3(this.camera.position.clone().sub(this.orbitControls.target));
    }
}
