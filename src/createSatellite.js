import * as THREE from 'three';
import { Satellite } from './components/Satellite/Satellite.js';
import { PhysicsUtils } from './utils/PhysicsUtils.js';
import { Constants } from './utils/Constants.js';
import { createRoot } from 'react-dom/client';
import { SatelliteDebugWindow } from './components/ui/satellite/SatelliteDebugWindow';

export async function createSatellite(app, params) {
    const { scene, satellites, displaySettings } = app;
    
    // Generate new unique ID
    let id = 0;
    while (satellites[id]) {
        id++;
    }

    const brightColors = [
        0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,  // Bright primary
        0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,  // Bright secondary
        0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,  // Bright tertiary
        0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,  // Bright neon
        0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF   // Bright pastel
    ];
    
    const color = brightColors[Math.floor(Math.random() * brightColors.length)];
    const newSatellite = new Satellite({
        scene,
        position: params.position,
        velocity: params.velocity,
        id,
        color,
        mass: params.mass || 100, // kg
        size: params.size || 1, // meters
        app3d: app,
        name: params.name
    });
    // Apply display settings after creation
    const showOrbits = displaySettings.showOrbits;
    const showTraces = displaySettings.showTraces;
    const showGroundTraces = displaySettings.showGroundTraces;
    const showSatVectors = displaySettings.showSatVectors;

    newSatellite.orbitLine.visible = showOrbits;
    if (newSatellite.apsisVisualizer) {
        newSatellite.apsisVisualizer.visible = showOrbits;
    }
    newSatellite.traceLine.visible = showTraces;
    if (newSatellite.groundTrack) {
        newSatellite.groundTrack.visible = showGroundTraces;
    }
    if (newSatellite.velocityVector) {
        newSatellite.velocityVector.visible = showSatVectors;
    }
    if (newSatellite.orientationVector) {
        newSatellite.orientationVector.visible = showSatVectors;
    }

    // Force initial updates
    if (newSatellite.orbitLine && newSatellite.orbitLine.visible) {
        newSatellite.updateOrbitLine(params.position, params.velocity);
    }
    if (newSatellite.traceLine && newSatellite.traceLine.visible) {
        const scaledPosition = new THREE.Vector3(
            params.position.x * Constants.metersToKm * Constants.scale,
            params.position.y * Constants.metersToKm * Constants.scale,
            params.position.z * Constants.metersToKm * Constants.scale
        );
        newSatellite.tracePoints.push(scaledPosition.clone());
        newSatellite.traceLine.geometry.setFromPoints(newSatellite.tracePoints);
        newSatellite.traceLine.geometry.computeBoundingSphere();
    }

    // Create debug window
    if (app.createDebugWindow) {
        app.createDebugWindow(newSatellite);
    }

    // Add satellite to app.satellites
    app.satellites = { ...app.satellites, [newSatellite.id]: newSatellite };

    // Call updateSatelliteList explicitly
    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    } else {
        console.warn('updateSatelliteList not found on app');
    }

    // Initialize physics worker if needed and wait for it
    if (!app.physicsWorker || !app.workerInitialized) {
        app.checkPhysicsWorkerNeeded();
        // Wait for worker to be initialized
        await new Promise((resolve) => {
            const checkWorker = () => {
                if (app.workerInitialized) {
                    resolve();
                } else {
                    setTimeout(checkWorker, 50);
                }
            };
            checkWorker();
        });
    }

    // Now we can safely notify the physics worker
    if (app.physicsWorker && app.workerInitialized) {
        app.physicsWorker.postMessage({
            type: 'addSatellite',
            data: {
                id: newSatellite.id,
                position: {
                    x: newSatellite.position.x / (Constants.metersToKm * Constants.scale),
                    y: newSatellite.position.y / (Constants.metersToKm * Constants.scale),
                    z: newSatellite.position.z / (Constants.metersToKm * Constants.scale)
                },
                velocity: {
                    x: newSatellite.velocity.x / (Constants.metersToKm * Constants.scale),
                    y: newSatellite.velocity.y / (Constants.metersToKm * Constants.scale),
                    z: newSatellite.velocity.z / (Constants.metersToKm * Constants.scale)
                },
                mass: newSatellite.mass
            }
        });
    } else {
        console.error('Physics worker not initialized when creating satellite:', newSatellite.id);
    }

    return newSatellite;
}

export function createSatelliteFromLatLon(app, params) {
    const { earth, displaySettings } = app;
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
        earthQuaternion,
        tiltQuaternion
    );

    const scaledPosition = new THREE.Vector3(
        positionECEF.x * Constants.metersToKm * Constants.scale,
        positionECEF.y * Constants.metersToKm * Constants.scale,
        positionECEF.z * Constants.metersToKm * Constants.scale
    );

    const scaledVelocity = new THREE.Vector3(
        velocityECEF.x * Constants.metersToKm * Constants.scale,
        velocityECEF.y * Constants.metersToKm * Constants.scale,
        velocityECEF.z * Constants.metersToKm * Constants.scale
    );

    const satellite = createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });

    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    }

    return satellite;
}

export function createSatelliteFromLatLonCircular(app, params) {
    const { earth, displaySettings } = app;
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
        earthQuaternion,
        tiltQuaternion
    );

    const scaledPosition = new THREE.Vector3(
        positionECEF.x * Constants.metersToKm * Constants.scale,
        positionECEF.y * Constants.metersToKm * Constants.scale,
        positionECEF.z * Constants.metersToKm * Constants.scale
    );

    const scaledVelocity = new THREE.Vector3(
        velocityECEF.x * Constants.metersToKm * Constants.scale,
        velocityECEF.y * Constants.metersToKm * Constants.scale,
        velocityECEF.z * Constants.metersToKm * Constants.scale
    );

    const satellite = createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });

    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    }

    return satellite;
}

export function createSatelliteFromOrbitalElements(app, params) {
    const { displaySettings } = app;
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

    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        inclination * (-1), // Invert inclination
        raan,
        argumentOfPeriapsis,
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

    const satellite = createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });

    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    }

    return satellite;
}
