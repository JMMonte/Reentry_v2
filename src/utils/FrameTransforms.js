import * as THREE from 'three';
import { Constants } from './Constants.js';

/**
 * Convert an inertial state vector (ECI or similar) into world coordinates
 * for a given body in the scene, applying optional reference frame conversion.
 * @param {Object} body      - The body object (e.g. app.earth) with rotationGroup, tiltGroup, and optional position
 * @param {THREE.Vector3} posInertial   - Position in inertial frame (meters)
 * @param {THREE.Vector3} velInertial   - Velocity in inertial frame (m/s)
 * @param {Object} options 
 * @param {string} options.referenceFrame - 'equatorial' or 'ecliptic'
 * @param {number} options.scale         - Additional scale factor (default Constants.scale)
 * @returns {{ position: THREE.Vector3, velocity: THREE.Vector3 }} world coords in Three.js units
 */
export function inertialToWorld(body, posInertial, velInertial, options = {}) {
    const referenceFrame = options.referenceFrame || 'equatorial';
    const scale = options.scale != null ? options.scale : Constants.scale;

    // 1) scale from meters to kilometers and apply global scale
    const position = posInertial.clone().multiplyScalar(Constants.metersToKm * scale);
    const velocity = velInertial.clone().multiplyScalar(Constants.metersToKm * scale);

    // 2) inertial frame: only apply correction and translation, skip all other rotations
    if (referenceFrame === 'inertial') {
        const corrQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        position.applyQuaternion(corrQuat);
        velocity.applyQuaternion(corrQuat);
        // translate by body's position if any
        let bodyPos = new THREE.Vector3(0, 0, 0);
        if (body.position && body.position.isVector3) {
            bodyPos.copy(body.position);
        } else if (body.getMesh && body.getMesh().position) {
            bodyPos.copy(body.getMesh().position);
        }
        position.add(bodyPos);
        return { position, velocity };
    }

    // 2) optional ecliptic -> equatorial conversion for equatorial frame
    if (referenceFrame === 'equatorial') {
        const epsilon = THREE.MathUtils.degToRad(Constants.earthInclination);
        // rotate about Z by -ε to go from ecliptic plane into equatorial
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -epsilon);
        position.applyQuaternion(q);
        velocity.applyQuaternion(q);
    }

    // 3) apply fixed correction (-90° about X to match Three.js world horizontal plane)
    const corrQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    position.applyQuaternion(corrQuat);
    velocity.applyQuaternion(corrQuat);

    // 4 & 5) apply body's rotation and tilt only when using equatorial (body-fixed) reference
    if (referenceFrame === 'equatorial') {
        // apply body's rotation (ECEF)
        if (body.rotationGroup && body.rotationGroup.quaternion) {
            position.applyQuaternion(body.rotationGroup.quaternion);
            velocity.applyQuaternion(body.rotationGroup.quaternion);
        }
        // apply body's axial tilt
        if (body.tiltGroup && body.tiltGroup.quaternion) {
            position.applyQuaternion(body.tiltGroup.quaternion);
            velocity.applyQuaternion(body.tiltGroup.quaternion);
        }
    }

    // 6) translate by body's world position (if any)
    let bodyPos = new THREE.Vector3(0, 0, 0);
    if (body.position && body.position.isVector3) {
        bodyPos.copy(body.position);
    } else if (body.getMesh && body.getMesh().position) {
        bodyPos.copy(body.getMesh().position);
    }
    position.add(bodyPos);

    return { position, velocity };
} 