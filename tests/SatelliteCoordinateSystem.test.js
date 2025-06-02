import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';

describe('Satellite Coordinate System Issues', () => {
    it('should correctly handle satellite positions relative to Earth', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Set up minimal solar system with proper positions
        // Sun at origin
        physicsEngine.bodies[10] = {
            name: 'Sun',
            type: 'star',
            mass: 1.989e30,
            radius: 695700,
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 10
        };
        
        // Earth at 1 AU from Sun
        physicsEngine.bodies[399] = {
            name: 'Earth',
            type: 'planet',
            mass: 5.972e24,
            radius: 6371,
            position: new THREE.Vector3(1.496e8, 0, 0), // 1 AU
            velocity: new THREE.Vector3(0, 29.78, 0), // ~30 km/s orbital velocity
            naifId: 399,
            j2: 0.00108263
        };
        
        // Create satellite in Earth-centric coordinates
        const satellite = {
            id: 'test-sat',
            centralBodyNaifId: 399,
            position: new THREE.Vector3(6771, 0, 0), // 400 km altitude, Earth-centric
            velocity: new THREE.Vector3(0, 7.67, 0), // LEO velocity, Earth-centric
            mass: 1000,
            area: 10,
            Cd: 2.2
        };
        
        physicsEngine.satellites = { 'test-sat': satellite };
        
        // Compute acceleration
        const accel = physicsEngine._computeSatelliteAcceleration(satellite);
        
        console.log('\n=== Coordinate System Test ===');
        console.log('Earth position:', physicsEngine.bodies[399].position.toArray());
        console.log('Satellite position (Earth-centric):', satellite.position.toArray());
        
        // Global position should be Earth position + satellite position
        const satGlobalPos = satellite.position.clone().add(physicsEngine.bodies[399].position);
        console.log('Satellite global position:', satGlobalPos.toArray());
        
        // Distance to Sun should be ~1 AU
        const distToSun = satGlobalPos.length();
        console.log('Distance to Sun:', distToSun, 'km');
        
        // Sun's acceleration should be reasonable
        const sunAccel = satellite.a_bodies?.[10] ? new THREE.Vector3(...satellite.a_bodies[10]) : null;
        if (sunAccel) {
            console.log('Sun acceleration magnitude:', sunAccel.length(), 'km/s²');
        }
        
        // Total acceleration should be dominated by Earth's gravity
        console.log('Total acceleration:', accel.length(), 'km/s²');
        console.log('Acceleration components:', {
            earth: satellite.a_bodies?.[399] ? new THREE.Vector3(...satellite.a_bodies[399]).length() : 0,
            sun: satellite.a_bodies?.[10] ? new THREE.Vector3(...satellite.a_bodies[10]).length() : 0,
            j2: satellite.a_j2 ? new THREE.Vector3(...satellite.a_j2).length() : 0,
            drag: satellite.a_drag ? new THREE.Vector3(...satellite.a_drag).length() : 0
        });
        
        // Expectations (satellite is 6771 km from Earth center, so distance to Sun is 1 AU + 6771 km)
        expect(distToSun).toBeCloseTo(1.496e8 + 6771, -4); // Should be ~1 AU + satellite distance
        expect(accel.length()).toBeLessThan(0.01); // Should be ~0.0087 km/s² for LEO
        expect(accel.length()).toBeGreaterThan(0.005);
    });
    
    it('should handle Earth-centric satellites correctly', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Set up realistic configuration
        physicsEngine.bodies[10] = {
            name: 'Sun',
            type: 'star',
            mass: 1.989e30,
            radius: 695700,
            position: new THREE.Vector3(-1.496e8, 0, 0), // 1 AU away from Earth
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 10
        };
        
        physicsEngine.bodies[399] = {
            name: 'Earth',
            type: 'planet', 
            mass: 5.972e24,
            radius: 6371,
            position: new THREE.Vector3(0, 0, 0), // Earth at origin for this test
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 399,
            j2: 0.00108263
        };
        
        const satellite = {
            id: 'test-sat',
            centralBodyNaifId: 399,
            position: new THREE.Vector3(6771, 0, 0),
            velocity: new THREE.Vector3(0, 7.67, 0),
            mass: 1000,
            area: 10,
            Cd: 2.2
        };
        
        physicsEngine.satellites = { 'test-sat': satellite };
        
        // Compute acceleration with realistic Sun distance
        const accel = physicsEngine._computeSatelliteAcceleration(satellite);
        
        console.log('\n=== Realistic Configuration ===');
        console.log('Total acceleration:', accel.length(), 'km/s²');
        console.log('Sun acceleration:', satellite.a_bodies?.[10] ? new THREE.Vector3(...satellite.a_bodies[10]).length() : 0, 'km/s²');
        
        // With Sun at 1 AU, acceleration should be reasonable for LEO
        expect(accel.length()).toBeLessThan(0.02); // Should be ~0.0087 km/s² for LEO
        expect(accel.length()).toBeGreaterThan(0.005);
    });
});