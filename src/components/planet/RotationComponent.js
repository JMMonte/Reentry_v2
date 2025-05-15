// import { Planet } from './Planet.js';

export class RotationComponent {
    constructor(planet) {
        this.planet = planet;
    }

    setServerQuaternion(q) {
        this._serverQuaternion = q;
    }

    update() {
        if (this._serverQuaternion) {
            this.planet.orientationGroup.quaternion.copy(this._serverQuaternion);
        }
    }

    dispose() {
        // Nothing to dispose for rotation
    }

    /**
     * Applies the base orientation to the planet's rotationGroup.
     * This replaces the X rotations previously in Planet.js.
     * Call this after all meshes/components are added to rotationGroup.
     * @param {THREE.Group} rotationGroup
     * @param {Object} options - { applyBase: boolean, baseRotation: number }
     */
    static applyBaseOrientation(rotationGroup, options = {}) {
        // Default: rotate 90° about X to map Y-up to Z-up
        const { applyBase = true, baseRotation = Math.PI / 2 } = options;
        if (applyBase) {
            rotationGroup.rotation.set(0, 0, 0); // Reset
            rotationGroup.rotateX(baseRotation);
            // Uncomment below for other debug/test rotations:
            // rotationGroup.rotateX(-Math.PI / 2);
            // rotationGroup.rotateX(Math.PI);
        }
    }

    /**
     * Applies the server quaternion to the orientationGroup.
     * @param {THREE.Group} orientationGroup
     * @param {THREE.Quaternion} qServer
     * @param {Object} options - { applyServer: boolean }
     */
    static applyServerQuaternion(orientationGroup, qServer, options = {}) {
        const { applyServer = true } = options;
        if (applyServer && qServer) {
            orientationGroup.quaternion.copy(qServer);
        }
        // Uncomment for debug: do not apply server quaternion
        // if (!applyServer) orientationGroup.quaternion.identity();
    }
} 