import { describe, test, expect, beforeEach } from 'vitest';
import { StateVectorCalculator } from '../src/physics/StateVectorCalculator.js';
import { SolarSystemHierarchy } from '../src/physics/SolarSystemHierarchy.js';
import { solarSystemDataManager } from '../src/physics/PlanetaryDataManager.js';
import * as THREE from 'three';

describe('StateVectorCalculator', () => {
    let calculator;
    let hierarchy;
    const now = new Date('2025-05-11T00:00:00Z');

    beforeEach(async () => {
        await solarSystemDataManager.initialize();
        hierarchy = new SolarSystemHierarchy(solarSystemDataManager.naifToBody);
        calculator = new StateVectorCalculator(hierarchy, solarSystemDataManager.naifToBody);
    });

    test('returns valid state for Earth (Astronomy Engine)', () => {
        const state = calculator.calculateStateVector(399, now); // Earth
        expect(state).toHaveProperty('position');
        expect(state).toHaveProperty('velocity');
        expect(Array.isArray(state.position)).toBe(true);
        expect(Array.isArray(state.velocity)).toBe(true);
        expect(typeof state.position[0]).toBe('number');
        expect(typeof state.velocity[0]).toBe('number');
        expect(state.position[0]).not.toBeNaN();
        expect(state.velocity[0]).not.toBeNaN();
    });

    test('returns valid state for Phobos (Keplerian)', () => {
        const state = calculator.calculateStateVector(401, now); // Phobos
        expect(state).toHaveProperty('position');
        expect(state).toHaveProperty('velocity');
        expect(Array.isArray(state.position)).toBe(true);
        expect(Array.isArray(state.velocity)).toBe(true);
        expect(typeof state.position[0]).toBe('number');
        expect(typeof state.velocity[0]).toBe('number');
        expect(state.position[0]).not.toBeNaN();
        expect(state.velocity[0]).not.toBeNaN();
    });

    test('returns valid position for Earth', () => {
        const state = calculator.calculateStateVector(399, now);
        expect(state.position).toBeDefined();
        expect(Array.isArray(state.position)).toBe(true);
        expect(state.position.length).toBe(3);
        
        // Position should be reasonable 
        const distance = Math.sqrt(state.position[0]**2 + state.position[1]**2 + state.position[2]**2);
        // Earth could be in different coordinate systems (EMB-centric, SSB-centric, etc.)
        // Just verify it's a reasonable distance (not zero, not infinite)
        expect(distance).toBeGreaterThan(1000); // > 1000 km (not at origin)
        expect(distance).toBeLessThan(1e12); // < 1 million million km (reasonable solar system scale)
    });

    test('velocity is nonzero and finite for Earth', () => {
        const state = calculator.calculateStateVector(399, now);
        const v = state.velocity;
        const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        expect(mag).toBeGreaterThan(0.01);
        expect(mag).toBeLessThan(100);
    });
}); 