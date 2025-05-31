/**
 * Physics Service Integration Tests
 * 
 * Tests the physics directory as a single service with a clean interface.
 * Focuses on the main entry points and integration between components.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { 
    Physics, 
    CelestialBody, 
    PlanetaryDataManager, 
    GravityCalculator,
    OrbitalMechanics 
} from '../src/physics/index.js';

describe('Physics Service Integration', () => {
    let dataManager;
    let earth, sun, moon;

    beforeAll(async () => {
        // Initialize the physics service
        dataManager = PlanetaryDataManager;
        await dataManager.initialize();
        
        // Get test bodies
        earth = dataManager.getCelestialBodyByName('earth');
        sun = dataManager.getCelestialBodyByName('sun');
        moon = dataManager.getCelestialBodyByName('moon');
    });

    describe('Service Initialization', () => {
        test('should initialize without errors', async () => {
            expect(dataManager.initialized).toBe(true);
        });

        test('should load celestial bodies', () => {
            const bodies = dataManager.getAllCelestialBodies();
            expect(bodies.length).toBeGreaterThan(0);
            expect(bodies.some(b => b.name === 'earth')).toBe(true);
            expect(bodies.some(b => b.name === 'sun')).toBe(true);
        });

        test('should create proper CelestialBody instances', () => {
            expect(earth).toBeInstanceOf(CelestialBody);
            expect(earth.name).toBe('earth');
            expect(earth.naifId).toBe(399);
            expect(earth.GM).toBeGreaterThan(0);
        });
    });

    describe('CelestialBody Physics Properties', () => {
        test('should provide consistent gravitational parameters', () => {
            expect(earth.GM).toBeCloseTo(398600, -2); // km³/s² (allow larger tolerance)
            expect(sun.GM).toBeCloseTo(132712440041, -6); // km³/s²
            expect(moon.GM).toBeCloseTo(4902, -1); // km³/s² (allow larger tolerance)
        });

        test('should calculate escape velocities correctly', () => {
            const earthEscape = earth.getEscapeVelocity();
            expect(earthEscape).toBeCloseTo(11.2, 1); // km/s

            const sunEscape = sun.getEscapeVelocity();
            expect(sunEscape).toBeCloseTo(617, 1); // km/s from surface (allow larger tolerance)
        });

        test('should provide orbital velocities', () => {
            // Circular velocity at Earth's surface
            const surfaceVel = earth.getOrbitalVelocity(earth.radius);
            expect(surfaceVel).toBeCloseTo(7.9, 1); // km/s

            // GEO velocity
            const geoVel = earth.getOrbitalVelocity(42164);
            expect(geoVel).toBeCloseTo(3.1, 1); // km/s
        });

        test('should handle atmospheric density calculations', () => {
            if (earth.atmosphericModel) {
                const seaLevel = earth.getAtmosphericDensity(0);
                const highAlt = earth.getAtmosphericDensity(400);
                
                expect(seaLevel).toBeGreaterThan(highAlt);
                expect(highAlt).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('Gravity Calculations', () => {
        test('should compute gravitational acceleration', () => {
            const position = { x: 7000, y: 0, z: 0 }; // 7000 km from center
            const bodies = [earth];
            
            // Mock position for Earth
            earth.position.set(0, 0, 0);
            
            const acceleration = GravityCalculator.computeAcceleration(
                new THREE.Vector3(position.x, position.y, position.z),
                bodies
            );
            
            expect(acceleration.length()).toBeGreaterThan(0);
            expect(acceleration.length()).toBeCloseTo(8.1, 1); // m/s² at ~630km altitude
        });

        test('should handle multiple body gravity', () => {
            const position = { x: 384400, y: 0, z: 0 }; // Near Moon's orbit
            
            earth.position.set(0, 0, 0);
            moon.position.set(384400, 0, 0);
            
            const bodies = [earth, moon];
            const acceleration = GravityCalculator.computeAcceleration(
                new THREE.Vector3(position.x, position.y, position.z),
                bodies
            );
            
            expect(acceleration.length()).toBeGreaterThan(0);
        });

        test('should compute J2 perturbations for oblate bodies', () => {
            if (earth.J2 && earth.J2 > 0) {
                const position = { x: 7000, y: 0, z: 1000 }; // Off-equatorial
                earth.position.set(0, 0, 0);
                
                const j2Accel = earth.computeJ2Acceleration(
                    new THREE.Vector3(position.x, position.y, position.z)
                );
                
                expect(j2Accel.length()).toBeGreaterThan(0);
            }
        });
    });

    describe('Orbital Mechanics', () => {
        test('should calculate orbital periods', () => {
            const position = [7000, 0, 0]; // km
            const velocity = [0, 7.5, 0]; // km/s (roughly circular)
            
            const period = OrbitalMechanics.calculateOrbitalPeriod(
                position, velocity, earth.GM
            );
            
            expect(period).toBeGreaterThan(0);
            expect(period).toBeCloseTo(6000, -3); // ~100 minutes in seconds (allow very large tolerance)
        });

        test('should calculate Hohmann transfer', () => {
            const params = {
                centralBody: earth,
                currentRadius: 7000, // LEO
                targetRadius: 42164  // GEO
            };
            
            const transfer = OrbitalMechanics.calculateHohmannTransfer(params);
            
            expect(transfer.deltaV1).toBeGreaterThan(0);
            expect(transfer.deltaV2).toBeGreaterThan(0);
            expect(transfer.totalDeltaV).toBeCloseTo(4.0, 0); // km/s
        });

        test('should calculate launch velocities', () => {
            const launch = OrbitalMechanics.calculateLaunchVelocity(
                earth,
                28.5, // latitude (Kennedy Space Center)
                200,  // altitude km
                90    // azimuth (eastward)
            );
            
            expect(launch).toBeDefined();
            if (launch.totalDeltaV !== undefined) {
                expect(launch.totalDeltaV).toBeGreaterThan(7);
                expect(launch.totalDeltaV).toBeLessThan(10);
            }
        });
    });

    describe('Sphere of Influence', () => {
        test('should determine SOI correctly', () => {
            expect(earth.soiRadius).toBeGreaterThan(0);
            expect(moon.soiRadius).toBeGreaterThan(0);
            
            // Earth's SOI should be much larger than Moon's
            expect(earth.soiRadius).toBeGreaterThan(moon.soiRadius);
        });

        test('should detect position within SOI', () => {
            const nearEarth = { x: 1000, y: 0, z: 0 };
            earth.position.set(0, 0, 0);
            
            const isWithin = earth.isWithinSOI(
                new THREE.Vector3(nearEarth.x, nearEarth.y, nearEarth.z)
            );
            
            expect(isWithin).toBe(true);
        });

        test('should find dominant gravitational body', () => {
            const position = { x: 1000, y: 0, z: 0 }; // Close to Earth
            
            earth.position.set(0, 0, 0);
            sun.position.set(150000000, 0, 0); // ~1 AU away
            
            const bodies = [earth, sun];
            const dominant = GravityCalculator.findDominantBody(
                new THREE.Vector3(position.x, position.y, position.z),
                bodies
            );
            
            expect(dominant).toBe(earth);
        });
    });

    describe('Body Hierarchy', () => {
        test('should maintain parent-child relationships', () => {
            const earthChildren = earth.children;
            const hasChild = earthChildren.some(child => child && child.name === 'moon');
            expect(hasChild).toBe(true);
        });

        test('should identify body types correctly', () => {
            expect(earth.isPlanet()).toBe(true);
            expect(earth.isMoon()).toBe(false);
            expect(earth.isStar()).toBe(false);
            
            expect(sun.isStar()).toBe(true);
            expect(sun.isPlanet()).toBe(false);
            
            expect(moon.isMoon()).toBe(true);
            expect(moon.isPlanet()).toBe(false);
        });

        test('should provide physics object compatibility', () => {
            const physicsObj = earth.toPhysicsObject();
            
            expect(physicsObj.name).toBe('earth');
            expect(physicsObj.GM).toBe(earth.GM);
            expect(physicsObj.mass).toBe(earth.mass);
            expect(Array.isArray(physicsObj.position)).toBe(true);
        });
    });

    describe('Service Performance', () => {
        test('should cache expensive calculations', () => {
            const start1 = performance.now();
            const escape1 = earth.getEscapeVelocity();
            const time1 = performance.now() - start1;
            
            const start2 = performance.now();
            const escape2 = earth.getEscapeVelocity();
            const time2 = performance.now() - start2;
            
            expect(escape1).toBe(escape2);
            expect(time2).toBeLessThan(time1); // Second call should be faster (cached)
        });

        test('should handle large numbers of bodies efficiently', () => {
            const allBodies = dataManager.getAllCelestialBodies();
            const position = { x: 0, y: 0, z: 0 };
            
            const start = performance.now();
            const acceleration = GravityCalculator.computeAcceleration(
                new THREE.Vector3(position.x, position.y, position.z),
                allBodies.slice(0, 10) // Test with subset
            );
            const duration = performance.now() - start;
            
            expect(duration).toBeLessThan(100); // Should complete in <100ms
            expect(acceleration).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid body identifiers gracefully', () => {
            const invalidBody = dataManager.getCelestialBodyByName('nonexistent');
            expect(invalidBody).toBeUndefined();
        });

        test('should validate CelestialBody configurations', () => {
            const invalidConfig = { name: 'test' }; // Missing required fields
            const validation = CelestialBody.validateConfig(invalidConfig);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });

        test('should handle edge cases in calculations', () => {
            // Zero distance should not crash
            const zeroDistance = earth.getOrbitalVelocity(0);
            expect(zeroDistance).toBe(0);
            
            // Negative radius should return 0 or handle gracefully
            const negativeRadius = earth.getEscapeVelocity(-100);
            expect(negativeRadius).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Data Consistency', () => {
        test('should have consistent GM values across access methods', () => {
            // GM from CelestialBody should match calculated from mass
            const calculatedGM = earth.mass * 6.67430e-20; // G in km³/kg/s²
            expect(earth.GM).toBeCloseTo(calculatedGM, -3);
        });

        test('should maintain unit consistency', () => {
            // All distances in km, velocities in km/s, time in seconds
            expect(earth.radius).toBeCloseTo(6371, 0); // km
            expect(earth.rotationPeriod).toBeCloseTo(86164, 0); // seconds (sidereal day)
        });

        test('should provide complete body data', () => {
            const requiredProps = ['name', 'naifId', 'mass', 'radius', 'GM'];
            
            requiredProps.forEach(prop => {
                expect(earth[prop]).toBeDefined();
                expect(earth[prop]).not.toBeNull();
            });
        });
    });
});

describe('Physics Service API', () => {
    test('should export main interface correctly', () => {
        expect(Physics).toBeDefined();
        expect(CelestialBody).toBeDefined();
        expect(PlanetaryDataManager).toBeDefined();
        expect(GravityCalculator).toBeDefined();
        expect(OrbitalMechanics).toBeDefined();
    });

    test('should provide single point of contact', () => {
        // The main Physics export should provide access to all functionality
        expect(typeof Physics).toBe('object');
    });
});