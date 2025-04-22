import * as THREE from 'three';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';

// Add a session-wide unique ID counter
let nextSatelliteId = 0;

/**
 * Reset the session-wide satellite ID counter (useful for HMR or page reload cleanup).
 */
export function resetSatelliteIdCounter() {
    nextSatelliteId = 0;
}

export async function createSatellite(app, params) {
    // Assign a unique session-wide ID (never reused)
    const id = nextSatelliteId++;

    const brightColors = [
        0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,  // Bright primary
        0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,  // Bright secondary
        0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,  // Bright tertiary
        0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,  // Bright neon
        0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF   // Bright pastel
    ];
    const color = brightColors[Math.floor(Math.random() * brightColors.length)];

    // Compose satellite params
    const satParams = {
        ...params,
        id,
        color,
        mass: params.mass || 100,
        size: params.size || 1,
        name: params.name,
    };

    // Add satellite via SatelliteManager
    const newSatellite = app.satellites.addSatellite(satParams);

    // Apply display settings after creation
    const displaySettings = app.displaySettingsManager?.settings || app.displaySettings || {};
    const showOrbits = displaySettings.showOrbits;
    const showGroundTraces = displaySettings.showGroundTraces;
    const showSatVectors = displaySettings.showSatVectors;

    if (newSatellite.orbitLine) newSatellite.orbitLine.visible = showOrbits;
    if (newSatellite.apsisVisualizer) newSatellite.apsisVisualizer.visible = showOrbits;
    if (newSatellite.groundTrackPath) newSatellite.groundTrackPath.setVisible(showGroundTraces);
    if (newSatellite.velocityVector) newSatellite.velocityVector.visible = showSatVectors;
    if (newSatellite.orientationVector) newSatellite.orientationVector.visible = showSatVectors;

    // Force initial updates
    if (newSatellite.orbitLine && newSatellite.orbitLine.visible) {
        newSatellite.updateOrbitLine(params.position, params.velocity);
    }

    // Create debug window
    if (app.createDebugWindow) {
        app.createDebugWindow(newSatellite);
    }

    // Call updateSatelliteList explicitly if available
    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    }

    return newSatellite;
}

export function createSatelliteFromLatLon(app, params) {
    const { earth } = app;
    const {
        latitude,
        longitude,
        altitude,
        velocity,
        azimuth,
        angleOfAttack = 0,
        mass,
        size,
        name
    } = params;

    const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
    const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

    const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
        latitude,
        longitude,
        altitude * Constants.kmToMeters,
        velocity * Constants.kmToMeters,
        azimuth,
        angleOfAttack,
        tiltQuaternion,
        earthQuaternion
    );

    // Scale ECEF coordinates for Three.js world space
    const finalPosition = new THREE.Vector3(
        positionECEF.x * Constants.metersToKm * Constants.scale,
        positionECEF.y * Constants.metersToKm * Constants.scale,
        positionECEF.z * Constants.metersToKm * Constants.scale
    );
    const finalVelocity = new THREE.Vector3(
        velocityECEF.x * Constants.metersToKm * Constants.scale,
        velocityECEF.y * Constants.metersToKm * Constants.scale,
        velocityECEF.z * Constants.metersToKm * Constants.scale
    );

    return createSatellite(app, { position: finalPosition, velocity: finalVelocity, mass, size, name });
}

export function createSatelliteFromLatLonCircular(app, params) {
    const { earth } = app;
    const {
        latitude,
        longitude,
        altitude,
        azimuth,
        angleOfAttack = 0,
        mass,
        size,
        name
    } = params;

    const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
    const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

    // Calculate the radius from the center of the Earth to the satellite
    const radius = Constants.earthRadius + (altitude * Constants.kmToMeters);

    // Calculate the orbital velocity for a circular orbit
    const orbitalVelocity = PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, radius);

    const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
        latitude,
        longitude,
        altitude * Constants.kmToMeters,
        orbitalVelocity,
        azimuth,
        angleOfAttack,
        tiltQuaternion,
        earthQuaternion
    );

    // Scale ECEF coordinates for Three.js world space
    const finalPosition = new THREE.Vector3(
        positionECEF.x * Constants.metersToKm * Constants.scale,
        positionECEF.y * Constants.metersToKm * Constants.scale,
        positionECEF.z * Constants.metersToKm * Constants.scale
    );
    const finalVelocity = new THREE.Vector3(
        velocityECEF.x * Constants.metersToKm * Constants.scale,
        velocityECEF.y * Constants.metersToKm * Constants.scale,
        velocityECEF.z * Constants.metersToKm * Constants.scale
    );

    return createSatellite(app, { position: finalPosition, velocity: finalVelocity, mass, size, name });
}

export function createSatelliteFromOrbitalElements(app, params) {
    const { earth } = app;
    const {
        semiMajorAxis,
        eccentricity,
        inclination,
        raan,
        argumentOfPeriapsis,
        trueAnomaly,
        mass,
        size,
        name
    } = params;

    // Calculate position/velocity in ECI frame using true orbital elements
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        inclination, // Use actual inclination for prograde/retrograde
        argumentOfPeriapsis,
        raan,
        trueAnomaly
    );

    const scaledPosition = new THREE.Vector3(
        positionECI.x * Constants.metersToKm * Constants.scale,
        positionECI.y * Constants.metersToKm * Constants.scale,
        positionECI.z * Constants.metersToKm * Constants.scale
    );

    const scaledVelocity = new THREE.Vector3(
        velocityECI.x * Constants.metersToKm * Constants.scale,
        velocityECI.y * Constants.metersToKm * Constants.scale,
        velocityECI.z * Constants.metersToKm * Constants.scale
    );

    // single declaration for both quaternions:
    const tiltQuat = earth?.tiltGroup?.quaternion || new THREE.Quaternion();
    const earthQuat = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
    const correctionQuat = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI/2);

    const finalPosition = scaledPosition.clone()
        .applyQuaternion(correctionQuat)
        .applyQuaternion(earthQuat)
        .applyQuaternion(tiltQuat);

    const finalVelocity = scaledVelocity.clone()
        .applyQuaternion(correctionQuat)
        .applyQuaternion(earthQuat)
        .applyQuaternion(tiltQuat);

    return createSatellite(app, {
        position: finalPosition,
        velocity: finalVelocity,
        mass,
        size,
        name
    });
}
