/**
 * SOI (Sphere of Influence) Interactions Test
 * 
 * Tests the critical SOI transition logic in the unified satellite propagation system.
 * SOI transitions are essential for accurate multi-body orbital mechanics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { UnifiedSatellitePropagator } from '../src/physics/core/UnifiedSatellitePropagator.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';

describe('SOI Interactions in Unified Propagation System', () => {
    let mockBodies;
    
    beforeEach(() => {
        // Set up realistic Earth-Moon-Sun system with proper SOI radii
        mockBodies = {
            10: { // Sun
                name: 'Sun',
                type: 'star',
                mass: 1.989e30,
                radius: 695700,
                position: [0, 0, 0],
                velocity: [0, 0, 0],
                soiRadius: 1e12, // Very large SOI
                naifId: 10,
                GM: 1.32712442018e11 // km³/s²
            },
            399: { // Earth
                name: 'Earth',
                type: 'planet',
                mass: 5.972e24,
                radius: 6371,
                position: [149597870.7, 0, 0], // 1 AU from Sun
                velocity: [0, 29.78, 0], // Earth orbital velocity
                soiRadius: 924000, // ~924,000 km Earth SOI
                naifId: 399,
                GM: 398600.4415, // km³/s²
                J2: 1.08262668e-3 // Earth's J2 coefficient
            },
            301: { // Moon
                name: 'Moon',
                type: 'moon',
                mass: 7.342e22,
                radius: 1737.4,
                position: [149597870.7 + 384400, 0, 0], // 384,400 km from Earth
                velocity: [0, 29.78 + 1.022, 0], // Earth + Moon orbital velocity
                soiRadius: 66100, // ~66,100 km Moon SOI
                naifId: 301,
                GM: 4902.8, // km³/s²
                parent: 399 // Moon orbits Earth
            }
        };
    });

    describe('SOI Boundary Detection', () => {
        it('should detect when satellite is within Earth SOI', () => {
            const satellite = {
                position: [149597870.7 + 400000, 0, 0], // 400,000 km from Earth center
                velocity: [0, 29.78, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Calculate distance from Earth
            const earthPos = mockBodies[399].position;
            const distance = Math.sqrt(
                (satellite.position[0] - earthPos[0])**2 + 
                (satellite.position[1] - earthPos[1])**2 + 
                (satellite.position[2] - earthPos[2])**2
            );

            expect(distance).toBeLessThan(mockBodies[399].soiRadius);
            expect(distance).toBeCloseTo(400000, 0);
        });

        it('should detect when satellite is within Moon SOI', () => {
            const satellite = {
                position: [149597870.7 + 384400 + 30000, 0, 0], // 30,000 km from Moon center
                velocity: [0, 29.78 + 1.022, 0],
                centralBodyNaifId: 301,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Calculate distance from Moon
            const moonPos = mockBodies[301].position;
            const distance = Math.sqrt(
                (satellite.position[0] - moonPos[0])**2 + 
                (satellite.position[1] - moonPos[1])**2 + 
                (satellite.position[2] - moonPos[2])**2
            );

            expect(distance).toBeLessThan(mockBodies[301].soiRadius);
            expect(distance).toBeCloseTo(30000, 0);
        });

        it('should correctly identify the dominant gravitational body', () => {
            // Satellite closer to Moon than Earth
            const satelliteNearMoon = {
                position: [149597870.7 + 384400 + 20000, 0, 0], // 20,000 km from Moon
                velocity: [0, 30.8, 0],
                centralBodyNaifId: 301, // Should be Moon-centric
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Calculate accelerations from different bodies
            const accelArray = UnifiedSatellitePropagator.computeAcceleration(
                satelliteNearMoon, 
                mockBodies,
                {
                    includeJ2: true,
                    includeDrag: false,
                    includeThirdBody: true,
                    debugLogging: false
                }
            );

            expect(accelArray).toBeDefined();
            expect(Array.isArray(accelArray)).toBe(true);
            expect(accelArray.length).toBe(3);
            
            // Acceleration magnitude should be reasonable for Moon proximity
            const accelMagnitude = Math.sqrt(accelArray[0]**2 + accelArray[1]**2 + accelArray[2]**2);
            const expectedMoonAccel = mockBodies[301].GM / (20000**2); // GM/r²
            
            // Should be dominated by Moon's gravity (within order of magnitude)
            expect(accelMagnitude).toBeGreaterThan(expectedMoonAccel * 0.1);
            expect(accelMagnitude).toBeLessThan(expectedMoonAccel * 10);
        });
    });

    describe('SOI Transition Scenarios', () => {
        it('should handle Earth-to-Moon trajectory correctly', () => {
            // Satellite starting from high Earth orbit, heading toward Moon
            const satellite = {
                position: [149597870.7 + 100000, 0, 0], // 100,000 km from Earth
                velocity: [0, 29.78 + 2.5, 0], // High velocity toward Moon
                centralBodyNaifId: 399, // Starting in Earth SOI
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Propagate for several time steps
            const points = UnifiedSatellitePropagator.propagateOrbit({
                satellite,
                bodies: mockBodies,
                duration: 3600 * 24, // 24 hours
                timeStep: 3600, // 1 hour steps
                includeJ2: true,
                includeDrag: false,
                includeThirdBody: true
            });

            expect(points.length).toBeGreaterThan(10);
            
            // Check that trajectory moves toward Moon region
            const firstPoint = points[0];
            const lastPoint = points[points.length - 1];
            
            const moonPos = mockBodies[301].position;
            const initialDistToMoon = Math.sqrt(
                (firstPoint.position[0] - moonPos[0])**2 + 
                (firstPoint.position[1] - moonPos[1])**2 + 
                (firstPoint.position[2] - moonPos[2])**2
            );
            const finalDistToMoon = Math.sqrt(
                (lastPoint.position[0] - moonPos[0])**2 + 
                (lastPoint.position[1] - moonPos[1])**2 + 
                (lastPoint.position[2] - moonPos[2])**2
            );

            // Should move closer to Moon (or at least change significantly)
            expect(Math.abs(finalDistToMoon - initialDistToMoon)).toBeGreaterThan(10000);
        });

        it('should handle Moon-to-Earth return trajectory', () => {
            // Satellite starting from Moon orbit, returning to Earth
            const satellite = {
                position: [149597870.7 + 384400 + 50000, 0, 0], // 50,000 km from Moon
                velocity: [0, 29.78 + 1.022 - 0.8, 0], // Velocity to return to Earth
                centralBodyNaifId: 301, // Starting in Moon SOI
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            const points = UnifiedSatellitePropagator.propagateOrbit({
                satellite,
                bodies: mockBodies,
                duration: 3600 * 48, // 48 hours
                timeStep: 3600 * 2, // 2 hour steps
                includeJ2: true,
                includeDrag: false,
                includeThirdBody: true
            });

            expect(points.length).toBeGreaterThan(10);
            
            // Verify the satellite moves in Earth direction
            const firstPoint = points[0];
            const lastPoint = points[points.length - 1];
            
            const earthPos = mockBodies[399].position;
            const initialDistToEarth = Math.sqrt(
                (firstPoint.position[0] - earthPos[0])**2 + 
                (firstPoint.position[1] - earthPos[1])**2 + 
                (firstPoint.position[2] - earthPos[2])**2
            );
            const finalDistToEarth = Math.sqrt(
                (lastPoint.position[0] - earthPos[0])**2 + 
                (lastPoint.position[1] - earthPos[1])**2 + 
                (lastPoint.position[2] - earthPos[2])**2
            );

            // Should show significant trajectory change
            expect(Math.abs(finalDistToEarth - initialDistToEarth)).toBeGreaterThan(50000);
        });

        it('should maintain energy conservation during SOI transitions', () => {
            const satellite = {
                position: [149597870.7 + 200000, 0, 0], // Between Earth and Moon
                velocity: [0, 29.78 + 1.5, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Calculate initial energy in the Earth-Moon system
            const [x, y, z] = satellite.position;
            const [vx, vy, vz] = satellite.velocity;
            const r = Math.sqrt(x*x + y*y + z*z);
            const v = Math.sqrt(vx*vx + vy*vy + vz*vz);
            
            // Simplified energy calculation (dominant Earth influence)
            const earthPos = mockBodies[399].position;
            const rEarth = Math.sqrt(
                (x - earthPos[0])**2 + (y - earthPos[1])**2 + (z - earthPos[2])**2
            );
            const initialEnergy = 0.5 * v * v - mockBodies[399].GM / rEarth;

            // Propagate through potential SOI transition
            const points = UnifiedSatellitePropagator.propagateOrbit({
                satellite,
                bodies: mockBodies,
                duration: 3600 * 12, // 12 hours
                timeStep: 1800, // 30 minute steps
                includeJ2: false, // Disable for pure energy test
                includeDrag: false,
                includeThirdBody: true
            });

            expect(points.length).toBeGreaterThan(10);
            
            // Check final energy
            const finalPoint = points[points.length - 1];
            const [fx, fy, fz] = finalPoint.position;
            const [fvx, fvy, fvz] = finalPoint.velocity;
            const fv = Math.sqrt(fvx*fvx + fvy*fvy + fvz*fvz);
            const frEarth = Math.sqrt(
                (fx - earthPos[0])**2 + (fy - earthPos[1])**2 + (fz - earthPos[2])**2
            );
            const finalEnergy = 0.5 * fv * fv - mockBodies[399].GM / frEarth;

            // Energy should be conserved within reasonable tolerance
            const energyChange = Math.abs(finalEnergy - initialEnergy);
            const relativeError = energyChange / Math.abs(initialEnergy);
            
            console.log(`SOI Energy Conservation Test:`);
            console.log(`  Initial energy: ${initialEnergy.toFixed(8)} km²/s²`);
            console.log(`  Final energy: ${finalEnergy.toFixed(8)} km²/s²`);
            console.log(`  Energy change: ${energyChange.toExponential(3)} km²/s²`);
            console.log(`  Relative error: ${(relativeError * 100).toFixed(6)}%`);

            expect(relativeError).toBeLessThan(0.01); // Less than 1% error
        });
    });

    describe('Third-Body Perturbations in SOI Context', () => {
        it('should include Moon perturbations for Earth satellites', () => {
            const satellite = {
                position: [149597870.7 + 50000, 0, 0], // 50,000 km from Earth
                velocity: [0, 29.78 + 3.0, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Calculate acceleration with and without third-body effects
            const accelWithThirdBody = UnifiedSatellitePropagator.computeAcceleration(
                satellite, mockBodies,
                { includeJ2: false, includeDrag: false, includeThirdBody: true }
            );

            const accelWithoutThirdBody = UnifiedSatellitePropagator.computeAcceleration(
                satellite, mockBodies,
                { includeJ2: false, includeDrag: false, includeThirdBody: false }
            );

            // Third-body effects should make a measurable difference
            const diff = Math.sqrt(
                (accelWithThirdBody[0] - accelWithoutThirdBody[0])**2 +
                (accelWithThirdBody[1] - accelWithoutThirdBody[1])**2 +
                (accelWithThirdBody[2] - accelWithoutThirdBody[2])**2
            );

            expect(diff).toBeGreaterThan(1e-8); // Should have measurable third-body effect
            
            console.log(`Third-body perturbation magnitude: ${diff.toExponential(3)} km/s²`);
        });

        it('should include Earth perturbations for Moon satellites', () => {
            const satellite = {
                position: [149597870.7 + 384400 + 10000, 0, 0], // 10,000 km from Moon
                velocity: [0, 29.78 + 1.022 + 0.5, 0],
                centralBodyNaifId: 301,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            const accelWithThirdBody = UnifiedSatellitePropagator.computeAcceleration(
                satellite, mockBodies,
                { includeJ2: false, includeDrag: false, includeThirdBody: true }
            );

            const accelWithoutThirdBody = UnifiedSatellitePropagator.computeAcceleration(
                satellite, mockBodies,
                { includeJ2: false, includeDrag: false, includeThirdBody: false }
            );

            const diff = Math.sqrt(
                (accelWithThirdBody[0] - accelWithoutThirdBody[0])**2 +
                (accelWithThirdBody[1] - accelWithoutThirdBody[1])**2 +
                (accelWithThirdBody[2] - accelWithoutThirdBody[2])**2
            );

            expect(diff).toBeGreaterThan(1e-6); // Earth's effect on Moon satellites should be significant
            
            console.log(`Earth perturbation on Moon satellite: ${diff.toExponential(3)} km/s²`);
        });
    });

    describe('Integration with PhysicsEngine SOI Handling', () => {
        it('should work correctly through PhysicsEngine interface', async () => {
            const physicsEngine = new PhysicsEngine();
            await physicsEngine.initialize();

            // Add the satellite to physics engine
            const satelliteId = physicsEngine.addSatellite({
                id: 'soi-test',
                position: [149597870.7 + 300000, 0, 0], // 300,000 km from Earth
                velocity: [0, 29.78 + 2.0, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            expect(satelliteId).toBe('soi-test');

            const satellite = physicsEngine.satellites.get('soi-test');
            expect(satellite).toBeDefined();

            // Test acceleration calculation through PhysicsEngine
            const acceleration = physicsEngine._computeSatelliteAccelerationUnified(satellite);
            expect(acceleration).toBeDefined();
            expect(acceleration.length()).toBeGreaterThan(0);

            // The acceleration should be reasonable for the distance
            const expectedAccel = mockBodies[399].GM / (300000**2);
            const actualAccel = acceleration.length();
            
            // Should be within order of magnitude (accounting for third-body effects)
            expect(actualAccel).toBeGreaterThan(expectedAccel * 0.1);
            expect(actualAccel).toBeLessThan(expectedAccel * 10);
        });
    });

    describe('SOI Radius Calculations', () => {
        it('should have realistic SOI radii for Earth-Moon system', () => {
            // Earth SOI radius (relative to Sun) ≈ a × (m_earth/m_sun)^(2/5)
            // where a is Earth's orbital radius
            const earthOrbitRadius = 149597870.7; // km
            const massRatio = mockBodies[399].mass / mockBodies[10].mass;
            const expectedEarthSOI = earthOrbitRadius * Math.pow(massRatio, 2/5);
            
            expect(mockBodies[399].soiRadius).toBeCloseTo(expectedEarthSOI, -4); // Within 10000 km
            
            // Moon SOI radius (relative to Earth) ≈ a × (m_moon/m_earth)^(2/5)
            const moonOrbitRadius = 384400; // km
            const moonMassRatio = mockBodies[301].mass / mockBodies[399].mass;
            const expectedMoonSOI = moonOrbitRadius * Math.pow(moonMassRatio, 2/5);
            
            expect(mockBodies[301].soiRadius).toBeCloseTo(expectedMoonSOI, -3); // Within 1000 km
        });
    });
});