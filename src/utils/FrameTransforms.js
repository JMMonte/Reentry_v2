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

    // 2) if equatorial frame, apply axial tilt about Earth X-axis
    if (referenceFrame === 'equatorial') {
        const epsilon = THREE.MathUtils.degToRad(Constants.earthInclination);
        // rotate from ecliptic to equatorial
        const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), epsilon);
        position.applyQuaternion(tiltQ);
        velocity.applyQuaternion(tiltQ);

        // apply Earth's spin (ECEF rotation)
        if (body.rotationGroup?.quaternion) {
            position.applyQuaternion(body.rotationGroup.quaternion);
            velocity.applyQuaternion(body.rotationGroup.quaternion);
        }
    }

    // 3) translate by Earth's world position (if any) for all frames
    let bodyPos = new THREE.Vector3(0, 0, 0);
    if (body.position && body.position.isVector3) {
        bodyPos.copy(body.position);
    } else if (body.getMesh && body.getMesh().position) {
        bodyPos.copy(body.getMesh().position);
    }
    position.add(bodyPos);

    return { position, velocity };
} 