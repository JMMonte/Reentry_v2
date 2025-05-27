import { describe, test, expect, beforeEach } from 'vitest';

// Mock Worker globally for Node/Vitest
globalThis.Worker = class {
    postMessage() { }
    terminate() { }
    addEventListener() { }
    removeEventListener() { }
    onmessage = null;
};

import { LocalPhysicsProvider } from '../src/providers/LocalPhysicsProvider.js';
import * as THREE from 'three';
import { createSatelliteFromLatLon, createSatelliteFromOrbitalElements } from '../src/components/Satellite/createSatellite.js';

// Mock minimal App3D

describe('LocalPhysicsProvider', () => {
    let provider;
    let mockApp3D;
    beforeEach(() => {
        mockApp3D = {
            timeUtils: {
                getSimulatedTime: () => new Date('2025-05-11T00:00:00Z'),
                timeWarp: 1,
            },
            getDisplaySetting: () => 1,
            // celestialBodiesConfig: { // No longer needed
                10: { name: 'Sun' },
                399: { name: 'Earth' },
                301: { name: 'Moon' },
                499: { name: 'Mars' },
                401: { name: 'Phobos' },
                402: { name: 'Deimos' },
                599: { name: 'Jupiter' },
                501: { name: 'Io' },
                502: { name: 'Europa' },
                503: { name: 'Ganymede' },
                504: { name: 'Callisto' },
            // },
            satellites: { getSatellitesMap: () => new Map() },
        };
        provider = new LocalPhysicsProvider(mockApp3D);
        provider._workerReady = true; // Pretend worker is ready
    });

    test('update() populates _thirdBodyPositions with valid entries', () => {
        provider.update();
        expect(Array.isArray(provider._thirdBodyPositions)).toBe(true);
        expect(provider._thirdBodyPositions.length).toBeGreaterThan(0);
        for (const body of provider._thirdBodyPositions) {
            expect(typeof body.name).toBe('string');
            expect(body.position).toBeInstanceOf(THREE.Vector3);
            expect(typeof body.mass).toBe('number');
            // Quaternion can be null for some bodies, but if present, should be a THREE.Quaternion
            if (body.quaternion) {
                expect(body.quaternion).toBeInstanceOf(THREE.Quaternion);
                const len = body.quaternion.length();
                expect(Math.abs(len - 1)).toBeLessThan(1e-6);
            }
        }
    });
});

// Mock planet configs for Earth and Mars
const earthConfig = {
    name: 'Earth',
    radius: 6371e3,
    polarRadius: 6356.8e3,
    inclination: 23.4392811,
    GM: 3.986004418e14,
    naifId: 399,
    getRotationGroup() { return { quaternion: new THREE.Quaternion() }; },
    getOrbitGroup() { return { position: new THREE.Vector3(0,0,0) }; },
    getEquatorialGroup() { return { quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2) }; }
};
const marsConfig = {
    name: 'Mars',
    radius: 3389.5e3,
    polarRadius: 3376.2e3,
    inclination: 25.19,
    GM: 4.282837e13,
    naifId: 499,
    getRotationGroup() { return { quaternion: new THREE.Quaternion() }; },
    getOrbitGroup() { return { position: new THREE.Vector3(0,0,0) }; },
    getEquatorialGroup() { return { quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2) }; }
};

const mockApp = {
    satellites: {
        addSatellite: (params) => params,
        removeSatellite: () => {},
    },
    displaySettingsManager: { settings: { showOrbits: true, showSatVectors: true } },
    sessionId: null,
};

describe('Satellite creation workflows', () => {
    test('createSatelliteFromLatLon spawns at correct altitude for Earth', async () => {
        const params = {
            latitude: 0,
            longitude: 0,
            altitude: 400, // km
            velocity: 7.67, // km/s (LEO)
            mass: 1000,
            size: 1,
            name: 'TestSat'
        };
        const sat = await createSatelliteFromLatLon(mockApp, params, earthConfig);
        expect(sat.position.length()).toBeGreaterThan(earthConfig.radius * 0.001 + 390); // ~Earth radius + 400km
        expect(sat.velocity.length()).toBeGreaterThan(7);
    });
    test('createSatelliteFromLatLon spawns at correct altitude for Mars', async () => {
        const params = {
            latitude: 0,
            longitude: 0,
            altitude: 400, // km
            velocity: 3.4, // km/s (Mars LEO)
            mass: 1000,
            size: 1,
            name: 'MarsSat'
        };
        const sat = await createSatelliteFromLatLon(mockApp, params, marsConfig);
        expect(sat.position.length()).toBeGreaterThan(marsConfig.radius * 0.001 + 390);
        expect(sat.velocity.length()).toBeGreaterThan(3);
    });
    test('createSatelliteFromOrbitalElements spawns GPS-like satellite for Earth', () => {
        const params = {
            semiMajorAxis: 26560, // km (GPS)
            eccentricity: 0.01,
            inclination: 55,
            raan: 0,
            argumentOfPeriapsis: 0,
            trueAnomaly: 0,
            mass: 1000,
            size: 1,
            name: 'GPS',
            planet: earthConfig
        };
        const sat = createSatelliteFromOrbitalElements(mockApp, params);
        expect(sat.position.length()).toBeGreaterThan(26500);
        expect(sat.velocity.length()).toBeGreaterThan(3);
    });
    test('createSatelliteFromOrbitalElements spawns Phobos orbiter for Mars', () => {
        const params = {
            semiMajorAxis: 9376, // km (Phobos orbit)
            eccentricity: 0.0151,
            inclination: 1.08,
            raan: 0,
            argumentOfPeriapsis: 0,
            trueAnomaly: 0,
            mass: 1000,
            size: 1,
            name: 'PhobosOrbiter',
            planet: marsConfig
        };
        const sat = createSatelliteFromOrbitalElements(mockApp, params);
        expect(sat.position.length()).toBeGreaterThan(9000);
        expect(sat.velocity.length()).toBeGreaterThan(1);
    });
}); 