import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { Constants } from '../src/utils/Constants.js';

describe('Fixed Perturbation Calculation', () => {
    it('should correctly calculate perturbations in central body reference frame', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Set up solar system with proper positions
        physicsEngine.bodies[10] = {
            name: 'Sun',
            type: 'star',
            mass: 1.989e30,
            radius: 695700,
            position: new THREE.Vector3(0, 0, 0), // Sun at origin
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 10
        };
        
        physicsEngine.bodies[399] = {
            name: 'Earth',
            type: 'planet',
            mass: 5.972e24,
            radius: 6371,
            position: new THREE.Vector3(1.496e8, 0, 0), // Earth at 1 AU
            velocity: new THREE.Vector3(0, 29.78, 0),
            naifId: 399,
            j2: 0.00108263,
            atmosphericModel: { maxAltitude: 1000 }
        };
        
        physicsEngine.bodies[301] = {
            name: 'Moon',
            type: 'moon',
            mass: 7.342e22,
            radius: 1737.4,
            position: new THREE.Vector3(1.496e8 + 384400, 0, 0), // Moon at Earth + 384,400 km
            velocity: new THREE.Vector3(0, 29.78 + 1.022, 0),
            naifId: 301
        };
        
        // Earth satellite at 400km altitude
        const satellite = {
            id: 'test-sat',
            centralBodyNaifId: 399,
            position: new THREE.Vector3(6771, 0, 0), // 400km altitude relative to Earth
            velocity: new THREE.Vector3(0, 7.67, 0), // LEO velocity relative to Earth
            mass: 1000,
            crossSectionalArea: 10,
            dragCoefficient: 2.2
        };
        
        physicsEngine.satellites = { 'test-sat': satellite };
        
        // Calculate acceleration
        const accel = physicsEngine._computeSatelliteAcceleration(satellite);
        
        console.log('\n=== Fixed Perturbation Calculation Test ===');
        console.log('Body positions (absolute):');
        console.log(`  Sun: [${physicsEngine.bodies[10].position.toArray()}]`);
        console.log(`  Earth: [${physicsEngine.bodies[399].position.toArray()}]`);
        console.log(`  Moon: [${physicsEngine.bodies[301].position.toArray()}]`);
        
        console.log('\nSatellite (Earth-relative):');
        console.log(`  Position: [${satellite.position.toArray()}] km`);
        console.log(`  Distance from Earth center: ${satellite.position.length()} km`);
        
        console.log('\nPerturbation calculation (in Earth frame):');
        // Sun position relative to Earth
        const sunRelativeToEarth = physicsEngine.bodies[10].position.clone().sub(physicsEngine.bodies[399].position);
        console.log(`  Sun position relative to Earth: [${sunRelativeToEarth.toArray().map(v => v.toExponential(3))}] km`);
        
        // Distance from satellite to Sun (in Earth frame)
        const satToSun = sunRelativeToEarth.clone().sub(satellite.position);
        console.log(`  Distance from satellite to Sun: ${satToSun.length().toExponential(3)} km`);
        
        // Moon position relative to Earth
        const moonRelativeToEarth = physicsEngine.bodies[301].position.clone().sub(physicsEngine.bodies[399].position);
        console.log(`  Moon position relative to Earth: [${moonRelativeToEarth.toArray()}] km`);
        
        console.log('\nAcceleration components:');
        console.log(`  Total: ${accel.length().toExponential(3)} km/s²`);
        if (satellite.a_bodies) {
            Object.entries(satellite.a_bodies).forEach(([bodyId, accelArray]) => {
                const mag = new THREE.Vector3(...accelArray).length();
                const bodyName = physicsEngine.bodies[bodyId]?.name || `Body ${bodyId}`;
                console.log(`  ${bodyName}: ${mag.toExponential(3)} km/s²`);
            });
        }
        
        // Now the total acceleration should be reasonable
        expect(accel.length()).toBeLessThan(0.01); // Should be dominated by Earth gravity (~0.0087)
        expect(accel.length()).toBeGreaterThan(0.005);
        
        // Sun perturbation should be small but present
        const sunAccel = satellite.a_bodies?.[10] ? new THREE.Vector3(...satellite.a_bodies[10]).length() : 0;
        expect(sunAccel).toBeLessThan(1e-4); // Should be very small
        expect(sunAccel).toBeGreaterThan(1e-8); // But not zero
        
        console.log('\n✅ Test passed! Perturbations are now calculated correctly in central body frame.');
    });
    
    it('should handle satellites at different altitudes around Earth', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Set up Earth and Sun with proper separation
        physicsEngine.bodies[10] = {
            name: 'Sun',
            type: 'star',
            mass: 1.989e30,
            radius: 695700,
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 10
        };
        
        physicsEngine.bodies[399] = {
            name: 'Earth',
            type: 'planet',
            mass: 5.972e24,
            radius: 6371,
            position: new THREE.Vector3(1.496e8, 0, 0),
            velocity: new THREE.Vector3(0, 29.78, 0),
            naifId: 399,
            j2: 0.00108263,
            atmosphericModel: { maxAltitude: 1000 }
        };
        
        const altitudes = [400, 4000, 40000]; // LEO, MEO, GEO
        
        altitudes.forEach(alt => {
            const satellite = {
                id: `sat-${alt}`,
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6371 + alt, 0, 0),
                velocity: new THREE.Vector3(0, Math.sqrt(Constants.G * 5.972e24 / (6371 + alt)), 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };
            
            physicsEngine.satellites = { [`sat-${alt}`]: satellite };
            
            const accel = physicsEngine._computeSatelliteAcceleration(satellite);
            
            console.log(`\nSatellite at ${alt}km altitude:`);
            console.log(`  Total acceleration: ${accel.length().toExponential(3)} km/s²`);
            
            // All should be reasonable accelerations
            expect(accel.length()).toBeLessThan(0.1);
            expect(accel.length()).toBeGreaterThan(1e-6);
        });
    });
});