import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';

describe('Perturbation Calculations', () => {
    let physicsEngine;
    
    beforeEach(() => {
        physicsEngine = new PhysicsEngine();
    });

    describe('Gravitational Acceleration Calculations', () => {
        it('should calculate correct acceleration from Moon to Earth satellite', () => {
            // Set up Earth
            physicsEngine.bodies[399] = {
                name: 'Earth',
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 5.972e24,
                radius: 6371,
                type: 'planet',
                naifId: 399
            };

            // Set up Moon at ~384,400 km from Earth
            physicsEngine.bodies[301] = {
                name: 'Moon',
                position: new THREE.Vector3(384400, 0, 0),
                velocity: new THREE.Vector3(0, 1.022, 0), // ~1 km/s orbital velocity
                mass: 7.342e22,
                radius: 1737.4,
                type: 'moon',
                naifId: 301
            };

            // Create a satellite in LEO (400 km altitude)
            const satellite = {
                id: 'test-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6771, 0, 0), // Earth radius + 400 km
                velocity: new THREE.Vector3(0, 7.67, 0), // LEO velocity
                mass: 1000,
                area: 10,
                Cd: 2.2
            };

            // Add satellite to physics engine
            physicsEngine.satellites = { 'test-sat': satellite };

            // Calculate acceleration
            const totalAccel = physicsEngine._computeSatelliteAcceleration(satellite);
            
            // Expected Moon perturbation acceleration
            // Distance from satellite to Moon: ~377,629 km
            const moonDistance = new THREE.Vector3().subVectors(
                physicsEngine.bodies[301].position,
                satellite.position
            ).length();
            
            const expectedMoonAccel = (PhysicsConstants.PHYSICS.G * physicsEngine.bodies[301].mass) / (moonDistance * moonDistance);
            
            // The acceleration breakdown is stored on the satellite object
            expect(satellite.a_bodies[301]).toBeDefined();
            const moonAccelVector = new THREE.Vector3(...satellite.a_bodies[301]);
            const moonAccelMagnitude = moonAccelVector.length();
            
            expect(moonAccelMagnitude).toBeGreaterThan(0);
            expect(moonAccelMagnitude).toBeCloseTo(expectedMoonAccel, 6);
            
            // Log the values for debugging
            console.log(`Moon distance: ${moonDistance} km`);
            console.log(`Expected Moon accel: ${expectedMoonAccel} km/s²`);
            console.log(`Actual Moon accel: ${moonAccelMagnitude} km/s²`);
            console.log(`Moon GM: ${PhysicsConstants.PHYSICS.G * physicsEngine.bodies[301].mass} km³/s²`);
            
            // The Moon perturbation at LEO is actually quite small
            // At ~380,000 km distance, it's about 3.4e-8 km/s²
            expect(moonAccelMagnitude).toBeGreaterThan(1e-8);
            expect(moonAccelMagnitude).toBeLessThan(1e-6);
        });

        it('should calculate correct acceleration for multiple body perturbations', () => {
            // Set up simplified Earth-Moon-Sun system
            physicsEngine.bodies[10] = {
                name: 'Sun',
                position: new THREE.Vector3(1.496e8, 0, 0), // 1 AU
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 1.989e30,
                radius: 695700,
                type: 'star',
                naifId: 10
            };

            physicsEngine.bodies[399] = {
                name: 'Earth',
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 29.78, 0), // Earth orbital velocity
                mass: 5.972e24,
                radius: 6371,
                type: 'planet',
                naifId: 399
            };

            physicsEngine.bodies[301] = {
                name: 'Moon',
                position: new THREE.Vector3(384400, 0, 0),
                velocity: new THREE.Vector3(0, 30.802, 0), // Moon + Earth velocity
                mass: 7.342e22,
                radius: 1737.4,
                type: 'moon',
                naifId: 301
            };

            // Satellite in high Earth orbit (above 100,000 km to trigger Sun perturbation)
            const satellite = {
                id: 'high-orbit-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(150000, 0, 0), // 150,000 km altitude
                velocity: new THREE.Vector3(0, 1.5, 0), // Slower velocity at high altitude
                mass: 2000,
                area: 20,
                Cd: 2.2
            };

            physicsEngine.satellites = { 'high-orbit-sat': satellite };

            const totalAccel = physicsEngine._computeSatelliteAcceleration(satellite);
            
            // Check that we have perturbations from both Moon and Sun
            expect(satellite.a_bodies[301]).toBeDefined(); // Moon
            expect(satellite.a_bodies[10]).toBeDefined();  // Sun
            
            const moonAccel = new THREE.Vector3(...satellite.a_bodies[301]).length();
            const sunAccel = new THREE.Vector3(...satellite.a_bodies[10]).length();
            
            // At high orbit (150,000 km), Moon perturbation is weaker (about 8.9e-8)
            expect(moonAccel).toBeGreaterThan(1e-8);
            expect(moonAccel).toBeLessThan(1e-6);
            
            // Sun perturbation should be present (about 5.9e-6 km/s²)
            expect(sunAccel).toBeGreaterThan(1e-6);
            expect(sunAccel).toBeLessThan(1e-5);
        });

        it('should handle edge cases correctly', () => {
            // Test with satellite at exact body position (should skip)
            physicsEngine.bodies[399] = {
                name: 'Earth',
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 5.972e24,
                radius: 6371,
                type: 'planet',
                naifId: 399
            };

            const satellite = {
                id: 'edge-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(0, 0, 0), // Same as Earth
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 100,
                area: 1,
                Cd: 2.2
            };

            physicsEngine.satellites = { 'edge-sat': satellite };

            // Should not throw error
            expect(() => {
                physicsEngine._computeSatelliteAcceleration(satellite);
            }).not.toThrow();
        });

        it('should correctly subtract central body acceleration for inertial frame', () => {
            // Set up Earth-Moon system with Sun
            physicsEngine.bodies[10] = {
                name: 'Sun',
                position: new THREE.Vector3(1.496e8, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 1.989e30,
                radius: 695700,
                type: 'star',
                naifId: 10
            };

            physicsEngine.bodies[399] = {
                name: 'Earth',
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 29.78, 0),
                mass: 5.972e24,
                radius: 6371,
                type: 'planet',
                naifId: 399
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

            const totalAccel = physicsEngine._computeSatelliteAcceleration(satellite);
            
            // The total acceleration should account for the reference frame
            // In Earth-centered frame, the Sun's direct pull on satellite should be 
            // nearly cancelled by the Sun's pull on Earth
            
            // The net acceleration should be dominated by Earth's gravity
            const earthGM = PhysicsConstants.PHYSICS.G * physicsEngine.bodies[399].mass;
            const expectedEarthAccel = earthGM / (6771 * 6771);
            
            expect(totalAccel.length()).toBeCloseTo(expectedEarthAccel, 3);
        });
    });

    describe('Barycenter Handling', () => {
        it('should not compute gravitational effects from barycenters', () => {
            // Set up Earth-Moon barycenter
            physicsEngine.bodies[3] = {
                name: 'Earth-Moon Barycenter',
                position: new THREE.Vector3(-4671, 0, 0), // ~4671 km from Earth center
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 0, // Barycenters should have no mass
                type: 'barycenter',
                naifId: 3
            };

            physicsEngine.bodies[399] = {
                name: 'Earth',
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 5.972e24,
                radius: 6371,
                type: 'planet',
                naifId: 399
            };

            const satellite = {
                id: 'test-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(7000, 0, 0),
                velocity: new THREE.Vector3(0, 7.5, 0),
                mass: 1000,
                area: 10,
                Cd: 2.2
            };

            physicsEngine.satellites = { 'test-sat': satellite };

            const totalAccel = physicsEngine._computeSatelliteAcceleration(satellite);
            
            // Barycenter should not appear in acceleration components
            expect(satellite.a_bodies[3]).toBeUndefined();
        });
    });
});