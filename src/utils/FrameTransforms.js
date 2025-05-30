import * as THREE from 'three';

/**
 * Convert an inertial state vector (ECI or similar) into world coordinates
 * for a given planet, applying reference frame and mesh transform chain.
 * @param {Object} planet      - The planet instance (must expose getRotationGroup, getEquatorialGroup, etc.)
 * @param {THREE.Vector3} posInertial   - Position in inertial frame (kilometers)
 * @param {THREE.Vector3} velInertial   - Velocity in inertial frame (km/s)
 * @param {Object} options 
 * @param {string} options.referenceFrame - 'equatorial' or 'ecliptic'
 * @param {number} options.scale         - Additional scale factor (default 1.0)
 * @returns {{ position: THREE.Vector3, velocity: THREE.Vector3 }} world coords in Three.js units
 */
export function inertialToWorld(planet, posInertial, velInertial, options = {}) {
    if (!planet?.getRotationGroup || !planet.getRotationGroup()) {
        throw new Error('inertialToWorld: planet must expose getRotationGroup().');
    }
    const referenceFrame = options.referenceFrame || 'equatorial';
    const inclination = planet?.inclination ?? 0;

    // 1) if equatorial frame, apply axial tilt about planet X-axis
    if (referenceFrame === 'equatorial') {
        const epsilon = THREE.MathUtils.degToRad(inclination);
        // rotate from ecliptic to equatorial
        const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), epsilon);
        posInertial.applyQuaternion(tiltQ);
        velInertial.applyQuaternion(tiltQ);

        // apply planet's spin (ECEF rotation)
        const rotationGroup = planet.getRotationGroup();
        if (rotationGroup?.quaternion) {
            posInertial.applyQuaternion(rotationGroup.quaternion);
            velInertial.applyQuaternion(rotationGroup.quaternion);
        }
    }

    // 2) translate by planet's world position (if any) for all frames
    let bodyPos = new THREE.Vector3(0, 0, 0);
    if (planet.getOrbitGroup && planet.getOrbitGroup()?.position) {
        bodyPos.copy(planet.getOrbitGroup().position);
    }
    posInertial.add(bodyPos);

    return { position: posInertial, velocity: velInertial };
}

/**
 * Transform a vector from SSB (solar system barycentric) to the planet's mesh Z-up frame.
 * @param {THREE.Vector3} vecSSB - Vector in SSB frame (kilometers)
 * @param {Object} planet - The planet instance
 * @returns {THREE.Vector3} Vector in planet mesh Z-up frame (Three.js world)
 */
export function toPlanetMeshFrame(vecSSB, planet) {
    if (!planet?.getEquatorialGroup || !planet.getRotationGroup) {
        throw new Error('toPlanetMeshFrame: planet must expose getEquatorialGroup() and getRotationGroup().');
    }
    // Step 1: Move to planet-centric frame (subtract planet barycenter position)
    const baryPos = planet.getOrbitGroup()?.position ?? new THREE.Vector3();
    const local = vecSSB.clone().sub(baryPos);
    // Step 2: Apply planet orientation (axial tilt, rotation, Y-up to Z-up)
    // Apply orientationGroup, equatorialGroup, and rotationGroup quaternions in order
    const eqGroup = planet.getEquatorialGroup();
    const rotGroup = planet.getRotationGroup();
    if (eqGroup?.quaternion) local.applyQuaternion(eqGroup.quaternion);
    if (rotGroup?.quaternion) local.applyQuaternion(rotGroup.quaternion);
    return local;
} 