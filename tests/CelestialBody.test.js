/**
 * CelestialBody Unit Tests
 * 
 * Tests the CelestialBody class in isolation to ensure it provides
 * a proper domain model for physics calculations.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CelestialBody } from '../src/physics/core/CelestialBody.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';

describe('CelestialBody Class', () => {
    let earthConfig, marsConfig, sunConfig, moonConfig;

    beforeEach(() => {
        earthConfig = {
            name: 'earth',
            naif_id: 399,
            type: 'planet',
            mass: 5.972e24, // kg
            radius: 6371, // km
            J2: 0.00108263,
            rotationPeriod: 86164, // seconds
            soiRadius: 929000, // km
            atmosphericModel: {
                maxAltitude: 1000,
                minAltitude: 0,
                getDensity: function(altitude) {
                    return altitude < 100 ? 1.225 * Math.exp(-altitude / 8.5) : 0;
                }
            }
        };

        marsConfig = {
            name: 'mars',
            naif_id: 499,
            type: 'planet',
            mass: 6.417e23, // kg
            radius: 3389.5, // km
            parent: 'mars_barycenter'
        };

        sunConfig = {
            name: 'sun',
            naif_id: 10,
            type: 'star',
            mass: 1.989e30, // kg
            radius: 695700 // km
        };

        moonConfig = {
            name: 'moon',
            naif_id: 301,
            type: 'moon',
            mass: 7.342e22, // kg
            radius: 1737.4, // km
            parent: 'earth'
        };
    });

    describe('Construction and Validation', () => {
        test('should create CelestialBody from valid config', () => {
            const earth = new CelestialBody(earthConfig);
            
            expect(earth.name).toBe('earth');
            expect(earth.naifId).toBe(399);
            expect(earth.type).toBe('planet');
            expect(earth.mass).toBe(5.972e24);
            expect(earth.radius).toBe(6371);
        });

        test('should throw error for missing name', () => {
            const invalidConfig = { ...earthConfig };
            delete invalidConfig.name;
            
            expect(() => new CelestialBody(invalidConfig)).toThrow('CelestialBody requires a name');
        });

        test('should validate configurations correctly', () => {
            const validation = CelestialBody.validateConfig(earthConfig);
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        test('should detect invalid configurations', () => {
            const invalidConfig = {
                name: 'test',
                type: 'planet'
                // Missing required fields
            };
            
            const validation = CelestialBody.validateConfig(invalidConfig);
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });

        test('should handle barycenter type specially', () => {
            const baryConfig = {
                name: 'test_barycenter',
                naif_id: 123,
                type: 'barycenter'
                // No mass or radius required for barycenters
            };
            
            const validation = CelestialBody.validateConfig(baryConfig);
            expect(validation.isValid).toBe(true);
        });
    });

    describe('Gravitational Parameter (GM)', () => {
        test('should calculate GM from mass when not provided', () => {
            const earth = new CelestialBody(earthConfig);
            const expectedGM = PhysicsConstants.PHYSICS.G * earthConfig.mass;
            
            expect(earth.GM).toBeCloseTo(expectedGM, -3);
        });

        test('should use provided GM over calculated', () => {
            const configWithGM = { ...earthConfig, GM: 123456 };
            const earth = new CelestialBody(configWithGM);
            
            expect(earth.GM).toBe(123456);
        });

        test('should cache GM calculation', () => {
            const earth = new CelestialBody(earthConfig);
            
            const gm1 = earth.GM;
            const gm2 = earth.GM;
            
            expect(gm1).toBe(gm2);
            expect(gm1).toBeGreaterThan(0);
        });

        test('should handle missing mass gracefully', () => {
            const configNoMass = { ...earthConfig };
            delete configNoMass.mass;
            
            const earth = new CelestialBody(configNoMass);
            expect(earth.GM).toBe(0);
        });
    });

    describe('Orbital Mechanics Calculations', () => {
        test('should calculate escape velocity correctly', () => {
            const earth = new CelestialBody(earthConfig);
            const escapeVel = earth.getEscapeVelocity();
            
            // Earth's escape velocity should be ~11.2 km/s
            expect(escapeVel).toBeCloseTo(11.2, 1);
        });

        test('should calculate escape velocity at altitude', () => {
            const earth = new CelestialBody(earthConfig);
            const surfaceEscape = earth.getEscapeVelocity(0);
            const altitudeEscape = earth.getEscapeVelocity(1000); // 1000 km altitude
            
            expect(altitudeEscape).toBeLessThan(surfaceEscape);
            expect(altitudeEscape).toBeGreaterThan(0);
        });

        test('should calculate circular orbital velocity', () => {
            const earth = new CelestialBody(earthConfig);
            const surfaceVel = earth.getOrbitalVelocity(earth.radius);
            
            // Should be ~7.9 km/s at Earth's surface
            expect(surfaceVel).toBeCloseTo(7.9, 1);
        });

        test('should calculate orbital velocity at different distances', () => {
            const earth = new CelestialBody(earthConfig);
            const lowOrbit = earth.getOrbitalVelocity(7000); // ~630 km altitude
            const geoOrbit = earth.getOrbitalVelocity(42164); // GEO
            
            expect(lowOrbit).toBeGreaterThan(geoOrbit); // Closer = faster
            expect(geoOrbit).toBeCloseTo(3.1, 1); // GEO velocity
        });

        test('should calculate vis-viva orbital velocity', () => {
            const earth = new CelestialBody(earthConfig);
            const semiMajorAxis = 7000; // km
            const currentRadius = 7000; // km (circular)
            
            const velocity = earth.getOrbitalVelocityAtRadius(semiMajorAxis, currentRadius);
            const circularVel = earth.getOrbitalVelocity(currentRadius);
            
            expect(velocity).toBeCloseTo(circularVel, 2);
        });

        test('should handle edge cases in velocity calculations', () => {
            const earth = new CelestialBody(earthConfig);
            
            expect(earth.getOrbitalVelocity(0)).toBe(0);
            expect(earth.getOrbitalVelocity(-100)).toBe(0);
            expect(earth.getEscapeVelocity(-100)).toBe(0);
        });
    });

    describe('Gravitational Acceleration', () => {
        test('should compute gravitational acceleration', () => {
            const earth = new CelestialBody(earthConfig);
            earth.position.set(0, 0, 0);
            
            const testPosition = new THREE.Vector3(7000, 0, 0); // 630 km altitude
            const acceleration = earth.computeGravitationalAcceleration(testPosition);
            
            expect(acceleration.length()).toBeGreaterThan(0);
            expect(acceleration.x).toBeLessThan(0); // Points toward Earth center
        });

        test('should compute J2 perturbation acceleration', () => {
            const earth = new CelestialBody(earthConfig);
            earth.position.set(0, 0, 0);
            
            const testPosition = new THREE.Vector3(7000, 0, 1000); // Off-equatorial
            const j2Acceleration = earth.computeJ2Acceleration(testPosition);
            
            expect(j2Acceleration.length()).toBeGreaterThan(0);
        });

        test('should handle zero distance gracefully', () => {
            const earth = new CelestialBody(earthConfig);
            earth.position.set(0, 0, 0);
            
            const zeroPosition = new THREE.Vector3(0, 0, 0);
            const acceleration = earth.computeGravitationalAcceleration(zeroPosition);
            
            expect(acceleration.length()).toBe(0);
        });

        test('should handle missing J2 gracefully', () => {
            const configNoJ2 = { ...earthConfig };
            delete configNoJ2.J2;
            
            const earth = new CelestialBody(configNoJ2);
            earth.position.set(0, 0, 0);
            
            const testPosition = new THREE.Vector3(7000, 0, 1000);
            const j2Acceleration = earth.computeJ2Acceleration(testPosition);
            
            expect(j2Acceleration.length()).toBe(0);
        });
    });

    describe('Atmospheric Properties', () => {
        test('should calculate atmospheric density', () => {
            const earth = new CelestialBody(earthConfig);
            
            const seaLevel = earth.getAtmosphericDensity(0);
            const altitude = earth.getAtmosphericDensity(100);
            
            expect(seaLevel).toBeGreaterThan(altitude);
            expect(altitude).toBeGreaterThanOrEqual(0);
        });

        test('should cache atmospheric calculations', () => {
            const earth = new CelestialBody(earthConfig);
            
            const density1 = earth.getAtmosphericDensity(100);
            const density2 = earth.getAtmosphericDensity(100);
            
            expect(density1).toBe(density2);
        });

        test('should handle bodies without atmosphere', () => {
            const moon = new CelestialBody(moonConfig);
            const density = moon.getAtmosphericDensity(100);
            
            expect(density).toBe(0);
        });

        test('should respect altitude limits', () => {
            const earth = new CelestialBody(earthConfig);
            
            const tooHigh = earth.getAtmosphericDensity(2000); // Above max altitude
            const tooLow = earth.getAtmosphericDensity(-100); // Below surface
            
            expect(tooHigh).toBe(0);
            expect(tooLow).toBe(0);
        });
    });

    describe('Sphere of Influence', () => {
        test('should detect position within SOI', () => {
            const earth = new CelestialBody(earthConfig);
            earth.position.set(0, 0, 0);
            
            const nearPosition = new THREE.Vector3(1000, 0, 0); // Well within SOI
            const farPosition = new THREE.Vector3(1000000, 0, 0); // Outside SOI
            
            expect(earth.isWithinSOI(nearPosition)).toBe(true);
            expect(earth.isWithinSOI(farPosition)).toBe(false);
        });

        test('should handle missing SOI radius', () => {
            const configNoSOI = { ...moonConfig };
            delete configNoSOI.soiRadius;
            
            const moon = new CelestialBody(configNoSOI);
            moon.position.set(0, 0, 0);
            
            const testPosition = new THREE.Vector3(1000, 0, 0);
            expect(moon.isWithinSOI(testPosition)).toBe(false);
        });
    });

    describe('Body Hierarchy', () => {
        test('should manage parent-child relationships', () => {
            const earth = new CelestialBody(earthConfig);
            const moon = new CelestialBody(moonConfig);
            
            earth.addChild(moon);
            
            expect(earth.children).toContain(moon);
            expect(moon.parent).toBe('earth');
        });

        test('should prevent duplicate children', () => {
            const earth = new CelestialBody(earthConfig);
            const moon = new CelestialBody(moonConfig);
            
            earth.addChild(moon);
            earth.addChild(moon); // Add again
            
            expect(earth.children.filter(child => child === moon)).toHaveLength(1);
        });

        test('should remove children correctly', () => {
            const earth = new CelestialBody(earthConfig);
            const moon = new CelestialBody(moonConfig);
            
            earth.addChild(moon);
            earth.removeChild(moon);
            
            expect(earth.children).not.toContain(moon);
            expect(moon.parent).toBeNull();
        });

        test('should identify body types correctly', () => {
            const earth = new CelestialBody(earthConfig);
            const mars = new CelestialBody(marsConfig);
            const sun = new CelestialBody(sunConfig);
            const moon = new CelestialBody(moonConfig);
            
            expect(earth.isPlanet()).toBe(true);
            expect(earth.isMoon()).toBe(false);
            expect(earth.isStar()).toBe(false);
            
            expect(sun.isStar()).toBe(true);
            expect(sun.isPlanet()).toBe(false);
            
            expect(moon.isMoon()).toBe(true);
            expect(moon.isPlanet()).toBe(false);
        });
    });

    describe('State Management', () => {
        test('should update position and velocity', () => {
            const earth = new CelestialBody(earthConfig);
            const newPos = new THREE.Vector3(1000, 2000, 3000);
            const newVel = new THREE.Vector3(1, 2, 3);
            const time = 2451545.0; // J2000
            
            earth.updateState(newPos, newVel, time);
            
            expect(earth.position.equals(newPos)).toBe(true);
            expect(earth.velocity.equals(newVel)).toBe(true);
            expect(earth.lastUpdateTime).toBe(time);
        });

        test('should clear caches on state update', () => {
            const earth = new CelestialBody(earthConfig);
            
            // Pre-populate cache
            earth.getAtmosphericDensity(100);
            expect(earth._atmosphereCache.size).toBeGreaterThan(0);
            
            // Update state should clear position-dependent caches
            earth.updateState(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), 0);
            expect(earth._gravityCache.size).toBe(0);
        });
    });

    describe('Performance Properties', () => {
        test('should cache surface gravity calculation', () => {
            const earth = new CelestialBody(earthConfig);
            
            const gravity1 = earth.getSurfaceGravity();
            const gravity2 = earth.getSurfaceGravity();
            
            expect(gravity1).toBe(gravity2);
            expect(gravity1).toBeCloseTo(9.81, 0); // m/s²
        });

        test('should provide physics object for compatibility', () => {
            const earth = new CelestialBody(earthConfig);
            earth.position.set(1000, 2000, 3000);
            earth.velocity.set(1, 2, 3);
            
            const physicsObj = earth.toPhysicsObject();
            
            expect(physicsObj.name).toBe('earth');
            expect(physicsObj.GM).toBe(earth.GM);
            expect(physicsObj.position).toEqual([1000, 2000, 3000]);
            expect(physicsObj.velocity).toEqual([1, 2, 3]);
        });
    });

    describe('Factory Methods', () => {
        test('should create from config using factory method', () => {
            const earth = CelestialBody.fromConfig(earthConfig);
            
            expect(earth).toBeInstanceOf(CelestialBody);
            expect(earth.name).toBe('earth');
        });

        test('should validate before creation', () => {
            const invalidConfig = { name: 'test' };
            const validation = CelestialBody.validateConfig(invalidConfig);
            
            expect(validation.isValid).toBe(false);
            expect(() => CelestialBody.fromConfig(invalidConfig)).toThrow();
        });
    });
});