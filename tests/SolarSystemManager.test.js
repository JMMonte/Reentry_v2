import { describe, test, expect } from 'vitest';
import { SolarSystemManager } from '../src/managers/SolarSystemManager.js';
import * as THREE from 'three';

describe('SolarSystemManager', () => {
    const manager = new SolarSystemManager();
    const now = new Date('2025-05-11T00:00:00Z');

    test('returns valid state for Earth (Astronomy Engine)', () => {
        const state = manager.getBodyState(399, now); // Earth
        expect(state).toHaveProperty('position');
        expect(state).toHaveProperty('velocity');
        expect(typeof state.position.x).toBe('number');
        expect(typeof state.velocity.x).toBe('number');
        expect(state.position.x).not.toBeNaN();
        expect(state.velocity.x).not.toBeNaN();
    });

    test('returns valid state for Phobos (Keplerian)', () => {
        const state = manager.getBodyState(401, now); // Phobos
        expect(state).toHaveProperty('position');
        expect(state).toHaveProperty('velocity');
        expect(typeof state.position.x).toBe('number');
        expect(typeof state.velocity.x).toBe('number');
        expect(state.position.x).not.toBeNaN();
        expect(state.velocity.x).not.toBeNaN();
    });

    test('returns a valid quaternion for Earth', () => {
        const state = manager.getBodyState(399, now);
        expect(state.quaternion).toBeInstanceOf(THREE.Quaternion);
        // Should be normalized
        const len = state.quaternion.length();
        expect(Math.abs(len - 1)).toBeLessThan(1e-6);
    });

    test('velocity is nonzero and finite for Earth', () => {
        const state = manager.getBodyState(399, now);
        const v = state.velocity;
        const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        expect(mag).toBeGreaterThan(0.01);
        expect(mag).toBeLessThan(100);
    });
}); 