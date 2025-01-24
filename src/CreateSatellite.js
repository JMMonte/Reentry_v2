import * as THREE from 'three';
import { Satellite } from './components/Satellite/Satellite.js';
import { PhysicsUtils } from './utils/PhysicsUtils.js';
import { Constants } from './utils/Constants.js';
import { SatelliteDebugWindow } from './components/ui/satellite/SatelliteDebugWindow.js';

/**
 * A curated list of colors to give satellites a unique bright color upon creation.
 */
const BRIGHT_COLORS = [
    0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,  // Bright primary
    0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,  // Bright secondary
    0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,  // Bright tertiary
    0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,  // Bright neon
    0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF   // Bright pastel
];

/**
 * Returns a random color from BRIGHT_COLORS.
 */
function getRandomBrightColor() {
    return BRIGHT_COLORS[Math.floor(Math.random() * BRIGHT_COLORS.length)];
}

/**
 * Returns the next available satellite ID (integer) for the satellites object.
 */
function getNextSatelliteID(satellites) {
    let id = 0;
    while (satellites[id]) {
        id++;
    }
    return id;
}

/**
 * Sets the visibility of the orbit, traces, and vectors on the given Satellite instance.
 */
function applyDisplaySettings(satellite, displaySettings) {
    if (!satellite || !displaySettings) return;

    const { showOrbits, showTraces, showGroundTraces, showSatVectors } = displaySettings;

    // Orbit line & apsis
    if (satellite.orbitLine) {
        satellite.orbitLine.visible = showOrbits;
    }
    if (satellite.apsisVisualizer) {
        satellite.apsisVisualizer.visible = showOrbits;
    }

    // Traces
    if (satellite.traceLine) {
        satellite.traceLine.visible = showTraces;
    }
    if (satellite.groundTrack) {
        satellite.groundTrack.visible = showGroundTraces;
    }

    // Vectors
    if (satellite.velocityVector) {
        satellite.velocityVector.visible = showSatVectors;
    }
    if (satellite.orientationVector) {
        satellite.orientationVector.visible = showSatVectors;
    }
}

/**
 * Updates lines, geometry, and initial visuals (orbit lines, trace lines, etc.) after creation.
 */
function initializeVisuals(satellite, position, velocity) {
    // Update orbit line if visible
    if (satellite.orbitLine?.visible) {
        satellite.updateOrbitLine(position, velocity);
    }

    // Initialize the trace line if visible
    if (satellite.traceLine?.visible) {
        const scaledPosition = new THREE.Vector3(
            position.x * Constants.metersToKm * Constants.scale,
            position.y * Constants.metersToKm * Constants.scale,
            position.z * Constants.metersToKm * Constants.scale
        );
        satellite.tracePoints.push(scaledPosition.clone());
        satellite.traceLine.geometry.setFromPoints(satellite.tracePoints);
        satellite.traceLine.geometry.computeBoundingSphere();
    }
}

/**
 * Ensures the physics worker is initialized before adding a new satellite.
 * Returns a Promise that resolves once the worker is ready.
 */
async function ensurePhysicsWorkerInitialized(app) {
    if (!app.physicsWorker || !app.workerInitialized) {
        app.checkPhysicsWorkerNeeded();
        // Wait for the worker to be initialized
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
}

/**
 * Notifies the physics worker that a new satellite has been created,
 * so it can be accounted for in the physics simulation.
 */
function notifyPhysicsWorker(app, satellite) {
    if (!app.physicsWorker || !app.workerInitialized) {
        console.error('Physics worker not initialized when creating satellite:', satellite.id);
        return;
    }

    app.physicsWorker.postMessage({
        type: 'addSatellite',
        data: {
            id: satellite.id,
            position: {
                x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                z: satellite.position.z / (Constants.metersToKm * Constants.scale),
            },
            velocity: {
                x: satellite.velocity.x / Constants.metersToKm,
                y: satellite.velocity.y / Constants.metersToKm,
                z: satellite.velocity.z / Constants.metersToKm,
            },
            mass: satellite.mass
        }
    });
}

/**
 * Primary function to create a Satellite, add it to the scene, and initialize visuals & physics.
 */
export async function createSatellite(app, params) {
    const { scene, satellites, displaySettings } = app;
    if (!scene || !satellites) {
        console.error('App is missing required properties: scene or satellites.');
        return null;
    }

    // Determine unique ID
    const id = getNextSatelliteID(satellites);
    const color = getRandomBrightColor();

    // Create Satellite instance
    const newSatellite = new Satellite({
        scene,
        position: params.position,
        velocity: params.velocity,
        id,
        color,
        mass: params.mass || 100,  // default mass in kg
        size: params.size || 1,    // default size in meters
        app3d: app,
        name: params.name
    });

    // Apply UI display settings to the new satellite
    applyDisplaySettings(newSatellite, displaySettings);

    // Force initial updates to lines/traces
    initializeVisuals(newSatellite, params.position, params.velocity);

    // Create debug window if needed
    if (app.createDebugWindow) {
        app.createDebugWindow(newSatellite);
    }

    // Add satellite to the app registry
    app.satellites = { ...app.satellites, [newSatellite.id]: newSatellite };

    // Update satellite list in the UI (if method available)
    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    } else {
        console.warn('updateSatelliteList not found on app');
    }

    // Make sure the physics worker is ready, then notify
    await ensurePhysicsWorkerInitialized(app);
    notifyPhysicsWorker(app, newSatellite);

    return newSatellite;
}

/**
 * Helper that calls createSatellite with lat/lon-based position.
 */
export async function createSatelliteFromLatLon(app, params) {
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

    if (!earth?.rotationGroup || !earth?.tiltGroup) {
        console.warn('Earth rotationGroup or tiltGroup missing; using default quaternions.');
    }

    const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
    const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

    // Convert lat/lon to ECEF
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

    // Scale to scene
    const scaledPosition = new THREE.Vector3(
        positionECEF.x * Constants.metersToKm * Constants.scale,
        positionECEF.y * Constants.metersToKm * Constants.scale,
        positionECEF.z * Constants.metersToKm * Constants.scale
    );
    const scaledVelocity = new THREE.Vector3(
        velocityECEF.x,
        velocityECEF.y,
        velocityECEF.z
    );

    // Create the satellite
    const satellite = await createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });

    // Update UI list
    app.updateSatelliteList?.();

    return satellite;
}

/**
 * Helper for creating a satellite with a circular orbit at a given lat/lon/alt/azimuth.
 */
export async function createSatelliteFromLatLonCircular(app, params) {
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

    // Calculate orbital velocity for a circular orbit
    const radius = Constants.earthRadius + altitude * Constants.kmToMeters;
    const orbitalVelocity = PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, radius);

    // Convert lat/lon to ECEF with the circular orbital velocity
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
        velocityECEF.x,
        velocityECEF.y,
        velocityECEF.z
    );

    // Create the satellite
    const satellite = await createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });

    // Update UI list
    app.updateSatelliteList?.();

    return satellite;
}

/**
 * Helper that creates a satellite from classical orbital elements.
 */
export async function createSatelliteFromOrbitalElements(app, params) {
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

    // Position & velocity in ECI reference
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        // Invert inclination sign if you need a particular orientation
        inclination * (-1),
        raan,
        argumentOfPeriapsis,
        trueAnomaly
    );

    // Scale to scene coordinates
    const scaledPosition = new THREE.Vector3(
        positionECI.x * Constants.metersToKm * Constants.scale,
        positionECI.y * Constants.metersToKm * Constants.scale,
        positionECI.z * Constants.metersToKm * Constants.scale
    );
    const scaledVelocity = new THREE.Vector3(
        velocityECI.x,
        velocityECI.y,
        velocityECI.z
    );

    const satellite = await createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });

    // Update UI list
    app.updateSatelliteList?.();

    return satellite;
}