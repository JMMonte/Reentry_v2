import * as THREE from 'three';
import { Satellite } from './components/Satellite/Satellite.js';
import { PhysicsUtils } from './utils/PhysicsUtils.js';
import { Constants } from './utils/Constants.js';
import { createRoot } from 'react-dom/client';
import { SatelliteDebugWindow } from './components/ui/satellite/SatelliteDebugWindow';

export function createSatellite(app, params) {
    console.log('createSatellite called with params:', params);
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

    console.log('Creating satellite:', { 
        position: newSatellite.position, 
        velocity: newSatellite.velocity, 
        id: newSatellite.id, 
        name: newSatellite.name,
        color: newSatellite.color, 
        mass: newSatellite.mass, 
        size: newSatellite.size 
    });

    console.log('Creating satellite:', { position: newSatellite.position, velocity: newSatellite.velocity, id: newSatellite.id, color: newSatellite.color, mass: newSatellite.mass, size: newSatellite.size });

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
        console.log('Creating debug window for satellite:', newSatellite.id);
        app.createDebugWindow(newSatellite);
    } else {
        console.warn('createDebugWindow not found on app:', app);
    }

    // Store satellite in app's satellites object
    satellites[newSatellite.id] = newSatellite;

    // Notify physics worker
    if (app.physicsWorker && app.workerInitialized) {
        console.log('Notifying physics worker about new satellite:', newSatellite.id);
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
                mass: newSatellite.mass,
                size: newSatellite.size
            }
        });
    } else {
        console.error('Physics worker not initialized when creating satellite:', newSatellite.id);
    }

    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    }

    return newSatellite;
}

export function createSatelliteFromLatLon(app, params) {
    console.log('Creating satellite from lat/lon:', params);
    const { earth, displaySettings } = app;
    const {
        latitude,
        longitude,
        altitude,
        heading: azimuth,
        speed: velocity,
        mass,
        size,
        name
    } = params;

    const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
    const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

    // Assuming angle of attack is 0 for simplicity
    const angleOfAttack = 0;

    // Convert altitude from km to m for physics calculations
    const altitudeMeters = altitude * Constants.kmToMeters;

    // Convert velocity from km/s to m/s for physics calculations
    const velocityMeters = velocity * Constants.kmToMeters;

    const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
        latitude,
        longitude,
        altitudeMeters,
        velocityMeters,
        azimuth,
        angleOfAttack,
        earthQuaternion,
        tiltQuaternion
    );

    // Scale for Three.js visualization (convert from meters to km, then apply scale)
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
    console.log('Creating satellite from lat/lon circular:', params);
    const { earth, displaySettings } = app;
    const {
        latitude,
        longitude,
        altitude,
        inclination,
        raan,
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

    // Calculate azimuth based on inclination and RAAN
    const azimuth = PhysicsUtils.calculateAzimuthFromInclination(latitude, inclination, raan);

    // Assuming angle of attack for a circular orbit is zero
    const angleOfAttack = 0;

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
    console.log('Creating satellite from orbital elements:', params);
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
        inclination * (Math.PI / 180), // Convert to radians
        raan * (Math.PI / 180),
        argumentOfPeriapsis * (Math.PI / 180),
        trueAnomaly * (Math.PI / 180)
    );

    console.log('Calculated state vectors:', {
        position: positionECI,
        velocity: velocityECI
    });

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
