import * as THREE from 'three';
import { Satellite } from './components/Satellite/Satellite';
import { PhysicsUtils as PhysicsUtilsImpl } from './utils/PhysicsUtils';
import { Constants } from './utils/Constants';
import type { App3D, SatelliteWithMethods, DisplaySettings, PhysicsUtils } from './types';

const PhysicsUtils = PhysicsUtilsImpl as unknown as PhysicsUtils;

interface SatelliteParams {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    mass?: number;
    size?: number;
    name?: string;
}

interface LatLonParams {
    latitude: number;
    longitude: number;
    altitude: number;
    velocity: number;
    azimuth: number;
    angleOfAttack?: number;
    mass?: number;
    size?: number;
    name?: string;
}

interface CircularOrbitParams {
    latitude: number;
    longitude: number;
    altitude: number;
    azimuth: number;
    angleOfAttack?: number;
    mass?: number;
    size?: number;
    name?: string;
}

interface OrbitalElementsParams {
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    longitudeOfAscendingNode: number;
    argumentOfPeriapsis: number;
    meanAnomaly: number;
    mass?: number;
    size?: number;
    name?: string;
}

const brightColors = [
    0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,  // Bright primary
    0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,  // Bright secondary
    0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,  // Bright tertiary
    0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,  // Bright neon
    0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF   // Bright pastel
];

export async function createSatellite(app: App3D, params: SatelliteParams): Promise<SatelliteWithMethods> {
    const { scene, satellites, displaySettings } = app;
    
    // Generate new unique ID
    let id = 0;
    while (satellites[id]) {
        id++;
    }

    const color = brightColors[Math.floor(Math.random() * brightColors.length)];
    const newSatellite = new Satellite({
        scene,
        position: params.position,
        velocity: params.velocity,
        id: id.toString(),
        color,
        mass: params.mass || 100, // kg
        size: params.size || 1, // meters
        app3d: app,
        name: params.name
    });

    // Apply display settings
    const showOrbits = displaySettings?.showOrbits || false;
    const showTraces = displaySettings?.showTraces || false;
    const showVectors = displaySettings?.showVectors || false;

    newSatellite.setVisible(true);
    newSatellite.updateDisplaySetting('showOrbits', showOrbits);
    newSatellite.updateDisplaySetting('showTraces', showTraces);
    newSatellite.updateDisplaySetting('showVectors', showVectors);

    // Add satellite to app.satellites
    app.satellites = { ...app.satellites, [newSatellite.id]: newSatellite };

    // Call updateSatelliteList explicitly
    if (app.updateSatelliteList) {
        app.updateSatelliteList();
    }

    // Initialize physics worker if needed and wait for it
    if (!app.physicsWorker || !app.workerInitialized) {
        app.checkPhysicsWorkerNeeded?.();
        // Wait for worker to be initialized
        await new Promise<void>((resolve) => {
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
    }

    return newSatellite;
}

export function createSatelliteFromLatLon(app: App3D, params: LatLonParams): Promise<SatelliteWithMethods> {
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

    return createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });
}

export function createSatelliteFromLatLonCircular(app: App3D, params: CircularOrbitParams): Promise<SatelliteWithMethods> {
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

    return createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });
}

export function createSatelliteFromOrbitalElements(app: App3D, params: OrbitalElementsParams): Promise<SatelliteWithMethods> {
    const {
        semiMajorAxis,
        eccentricity,
        inclination,
        longitudeOfAscendingNode,
        argumentOfPeriapsis,
        meanAnomaly,
        mass,
        size,
        name
    } = params;

    // Convert orbital elements to position and velocity vectors
    const { position, velocity } = PhysicsUtils.calculateStateVectors(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        inclination,
        longitudeOfAscendingNode,
        argumentOfPeriapsis,
        meanAnomaly,
        Constants.G * Constants.earthMass
    );

    const scaledPosition = new THREE.Vector3(
        position.x * Constants.metersToKm * Constants.scale,
        position.y * Constants.metersToKm * Constants.scale,
        position.z * Constants.metersToKm * Constants.scale
    );

    const scaledVelocity = new THREE.Vector3(
        velocity.x * Constants.metersToKm * Constants.scale,
        velocity.y * Constants.metersToKm * Constants.scale,
        velocity.z * Constants.metersToKm * Constants.scale
    );

    return createSatellite(app, {
        position: scaledPosition,
        velocity: scaledVelocity,
        mass,
        size,
        name
    });
} 