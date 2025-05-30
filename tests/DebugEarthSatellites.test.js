import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';

describe('Debug Earth Satellite Issues', () => {
    it('should identify the source of chaotic behavior', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Simulate the actual issue - check if multiple bodies are at origin
        physicsEngine.bodies = {
            10: { // Sun
                name: 'Sun',
                position: new THREE.Vector3(0, 0, 0),
                mass: 1.989e30,
                radius: 695700,
                type: 'star'
            },
            399: { // Earth  
                name: 'Earth',
                position: new THREE.Vector3(0, 0, 0), // PROBLEM!
                mass: 5.972e24,
                radius: 6371,
                type: 'planet'
            }
        };
        
        const satellite = {
            id: 'debug-sat',
            centralBodyNaifId: 399,
            position: new THREE.Vector3(6771, 0, 0),
            velocity: new THREE.Vector3(0, 7.67, 0),
            mass: 1000,
            area: 10,
            Cd: 2.2
        };
        
        physicsEngine.satellites = { 'debug-sat': satellite };
        
        // This demonstrates the problem
        const accel = physicsEngine._computeSatelliteAcceleration(satellite);
        
        console.log('\n=== Debugging Earth Satellite Issues ===');
        console.log('Bodies in physics engine:');
        Object.entries(physicsEngine.bodies).forEach(([id, body]) => {
            console.log(`  ${body.name} (${id}): position = [${body.position.toArray()}]`);
        });
        
        console.log('\nSatellite acceleration components:');
        console.log('  Total:', accel.length(), 'km/s²');
        if (satellite.a_bodies) {
            Object.entries(satellite.a_bodies).forEach(([bodyId, accelArray]) => {
                const mag = new THREE.Vector3(...accelArray).length();
                const bodyName = physicsEngine.bodies[bodyId]?.name || `Body ${bodyId}`;
                console.log(`  ${bodyName}: ${mag.toExponential(3)} km/s²`);
            });
        }
        
        // The fix recommendation
        console.log('\n=== SOLUTION ===');
        console.log('The issue is that multiple celestial bodies have the same position (0,0,0).');
        console.log('In your simulation setup, ensure that:');
        console.log('1. The Sun is at the origin (0,0,0)');
        console.log('2. Earth is at ~1 AU from the Sun (~1.496e8 km)');
        console.log('3. Other planets are at their correct distances');
        console.log('4. Check your PositionManager or simulation initialization');
        
        // This confirms the massive acceleration issue
        expect(accel.length()).toBeGreaterThan(1000);
    });
    
    it('should show correct behavior with proper positioning', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Correct positioning
        physicsEngine.bodies = {
            10: { // Sun at origin
                name: 'Sun',
                position: new THREE.Vector3(0, 0, 0),
                mass: 1.989e30,
                radius: 695700,
                type: 'star'
            },
            399: { // Earth at 1 AU
                name: 'Earth',
                position: new THREE.Vector3(1.496e8, 0, 0),
                velocity: new THREE.Vector3(0, 29.78, 0),
                mass: 5.972e24,
                radius: 6371,
                type: 'planet',
                j2: 0.00108263
            }
        };
        
        const satellite = {
            id: 'good-sat',
            centralBodyNaifId: 399,
            position: new THREE.Vector3(6771, 0, 0),
            velocity: new THREE.Vector3(0, 7.67, 0),
            mass: 1000,
            area: 10,
            Cd: 2.2
        };
        
        physicsEngine.satellites = { 'good-sat': satellite };
        
        const accel = physicsEngine._computeSatelliteAcceleration(satellite);
        
        console.log('\n=== Correct Configuration ===');
        console.log('Total acceleration:', accel.length(), 'km/s²');
        console.log('This should be ~0.0087 km/s² (normal for LEO)');
        
        // This should be reasonable
        expect(accel.length()).toBeCloseTo(0.0087, 3);
        expect(accel.length()).toBeLessThan(0.01);
    });
});