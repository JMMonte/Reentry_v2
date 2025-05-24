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