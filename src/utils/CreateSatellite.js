import * as THREE from 'three';
import { Satellite } from '../components/Satellite/Satellite.js';
import { PhysicsUtils } from './PhysicsUtils.js';
import { Constants } from './Constants.js';
import { createRoot } from 'react-dom/client';
import { SatelliteDebugWindow } from '../components/ui/satellite/SatelliteDebugWindow.jsx';

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

    // Update orbit visibility
    if (newSatellite.orbit && newSatellite.orbit.orbitLine) {
        newSatellite.orbit.orbitLine.visible = showOrbits;
    }

    // Update apsis visualizer visibility
    if (newSatellite.orbit && newSatellite.orbit.apsisVisualizer) {
        newSatellite.orbit.apsisVisualizer.visible = showOrbits;
    }

    // Update trace visibility
    if (newSatellite.visuals && newSatellite.visuals.traceLine) {
        newSatellite.visuals.traceLine.visible = showTraces;
    }

    // Update ground track visibility
    if (newSatellite.orbit && newSatellite.orbit.setGroundTraceVisible) {
        newSatellite.orbit.setGroundTraceVisible(showGroundTraces);
    }

    // Update velocity vector visibility
    if (newSatellite.visuals && newSatellite.visuals.velocityVector) {
        newSatellite.visuals.velocityVector.visible = showSatVectors;
    }

    // Update orientation vector visibility
    if (newSatellite.visuals && newSatellite.visuals.orientationVector) {
        newSatellite.visuals.orientationVector.visible = showSatVectors;
    }

    // Force initial updates for orbit line
    if (newSatellite.orbit && newSatellite.orbit.orbitLine && newSatellite.orbit.orbitLine.visible) {
        newSatellite.orbit.updateOrbitLine(params.position, params.velocity);
    }

    // Force initial updates for trace line
    if (newSatellite.visuals && newSatellite.visuals.traceLine && newSatellite.visuals.traceLine.visible) {
        const scaledPosition = new THREE.Vector3(
            params.position.x * Constants.metersToKm * Constants.scale,
            params.position.y * Constants.metersToKm * Constants.scale,
            params.position.z * Constants.metersToKm * Constants.scale
        );
        if (newSatellite.visuals.tracePoints) {
            newSatellite.visuals.tracePoints.push(scaledPosition.clone());
            newSatellite.visuals.traceLine.geometry.setFromPoints(newSatellite.visuals.tracePoints);
            newSatellite.visuals.traceLine.geometry.computeBoundingSphere();
        }
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

    // Initialize trace with the first point
    if (satellite.visuals && satellite.visuals.traceLine && satellite.visuals.traceLine.visible) {
        satellite.visuals.tracePoints.push(scaledPosition.clone());
        satellite.visuals.traceLine.geometry.setFromPoints(satellite.visuals.tracePoints);
        satellite.visuals.traceLine.geometry.computeBoundingSphere();
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

    // Initialize trace with the first point
    if (satellite.visuals && satellite.visuals.traceLine && satellite.visuals.traceLine.visible) {
        satellite.visuals.tracePoints.push(scaledPosition.clone());
        satellite.visuals.traceLine.geometry.setFromPoints(satellite.visuals.tracePoints);
        satellite.visuals.traceLine.geometry.computeBoundingSphere();
    }

    return satellite;
}

export function createSatelliteInCircularOrbit(app, params) {
    const { earth } = app;
    const {
        altitude, // in km
        inclination = 0, // in degrees
        longitudeOfAscendingNode = 0, // in degrees
        argumentOfPeriapsis = 0, // in degrees
        trueAnomaly = 0, // in degrees
        mass = 100, // in kg
        size = 1, // in meters
        name = `Satellite at ${altitude} km`
    } = params;

    // Convert Earth radius to km for calculations
    const earthRadiusKm = Constants.earthRadius * Constants.metersToKm;

    // Calculate orbital radius in km
    const orbitRadiusKm = earthRadiusKm + altitude;

    // Calculate orbital velocity for a circular orbit (in m/s)
    const orbitalVelocityMS = Math.sqrt(Constants.G * Constants.earthMass / (orbitRadiusKm * Constants.kmToMeters));

    // Convert orbital velocity to km/s for consistent scaling
    const orbitalVelocityKmS = orbitalVelocityMS * Constants.metersToKm;

    // Create position vector (in km)
    // Starting with position along the x-axis at the specified altitude
    const truAnoRad = THREE.MathUtils.degToRad(trueAnomaly);
    const position = new THREE.Vector3(
        orbitRadiusKm * Math.cos(truAnoRad),
        orbitRadiusKm * Math.sin(truAnoRad),
        0
    );

    // Create velocity vector perpendicular to position (in km/s)
    // For a circular orbit, velocity is perpendicular to position
    const velocity = new THREE.Vector3(
        -orbitalVelocityKmS * Math.sin(truAnoRad),
        orbitalVelocityKmS * Math.cos(truAnoRad),
        0
    );

    // Apply rotations for orbital parameters
    // First rotate by argument of periapsis
    const aopRad = THREE.MathUtils.degToRad(argumentOfPeriapsis);
    position.applyAxisAngle(new THREE.Vector3(0, 0, 1), aopRad);
    velocity.applyAxisAngle(new THREE.Vector3(0, 0, 1), aopRad);

    // Then rotate by inclination
    const incRad = THREE.MathUtils.degToRad(inclination);
    position.applyAxisAngle(new THREE.Vector3(1, 0, 0), incRad);
    velocity.applyAxisAngle(new THREE.Vector3(1, 0, 0), incRad);

    // Finally rotate by longitude of ascending node
    const raanRad = THREE.MathUtils.degToRad(longitudeOfAscendingNode);
    position.applyAxisAngle(new THREE.Vector3(0, 0, 1), raanRad);
    velocity.applyAxisAngle(new THREE.Vector3(0, 0, 1), raanRad);

    // Scale for visualization
    const scaledPosition = new THREE.Vector3(
        position.x * Constants.scale,
        position.y * Constants.scale,
        position.z * Constants.scale
    );

    const scaledVelocity = new THREE.Vector3(
        velocity.x * Constants.scale,
        velocity.y * Constants.scale,
        velocity.z * Constants.scale
    );

    console.log(`Creating satellite at ${altitude}km altitude`);
    console.log(`Orbital radius: ${orbitRadiusKm.toFixed(2)}km`);
    console.log(`Orbital velocity: ${orbitalVelocityKmS.toFixed(2)}km/s`);
    console.log(`Position (km): ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);
    console.log(`Velocity (km/s): ${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)}`);
    console.log(`Scaled position: ${scaledPosition.x.toFixed(2)}, ${scaledPosition.y.toFixed(2)}, ${scaledPosition.z.toFixed(2)}`);
    console.log(`Scaled velocity: ${scaledVelocity.x.toFixed(2)}, ${scaledVelocity.y.toFixed(2)}, ${scaledVelocity.z.toFixed(2)}`);

    // Create the satellite with these parameters
    const satellite = createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });

    // Initialize trace with the first point
    if (satellite.visuals && satellite.visuals.traceLine && satellite.visuals.traceLine.visible) {
        satellite.visuals.tracePoints.push(scaledPosition.clone());
        satellite.visuals.traceLine.geometry.setFromPoints(satellite.visuals.tracePoints);
        satellite.visuals.traceLine.geometry.computeBoundingSphere();
    }

    return satellite;
}
