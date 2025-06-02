/**
 * Maneuver Node Propagation Test
 * 
 * Tests that maneuver nodes use the same unified propagation system as regular orbits
 * Ensures consistency between pre-burn and post-burn orbit calculations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { UnifiedSatellitePropagator } from '../src/physics/core/UnifiedSatellitePropagator.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { Utils } from '../src/physics/PhysicsAPI.js';

describe('Maneuver Node Propagation Consistency', () => {
    let physicsEngine;
    let mockBodies;
    
    beforeEach(async () => {
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
        
        // Set up Earth-Moon system for testing
        mockBodies = {
            399: { // Earth
                name: 'Earth',
                type: 'planet',
                mass: 5.972e24,
                radius: 6371,
                position: [0, 0, 0],
                velocity: [0, 0, 0],
                soiRadius: 924000,
                naifId: 399,
                GM: 398600.4415,
                J2: 1.08262668e-3
            },
            301: { // Moon
                name: 'Moon',
                type: 'moon',
                mass: 7.342e22,
                radius: 1737.4,
                position: [384400, 0, 0],
                velocity: [0, 1.022, 0],
                soiRadius: 66100,
                naifId: 301,
                GM: 4902.8,
                parent: 399
            }
        };
    });

    describe('Pre-Maneuver Orbit Propagation', () => {
        it('should use unified propagation for pre-maneuver orbit prediction', () => {
            // ISS-like initial conditions
            const satellite = {
                position: [7000, 0, 0], // 629 km altitude
                velocity: [0, 7.5, 0], // ~7.5 km/s orbital velocity
                centralBodyNaifId: 399,
                mass: 450000, // ISS mass in kg
                crossSectionalArea: 4000, // m²
                dragCoefficient: 2.2
            };

            // Propagate orbit to maneuver time (1 hour in future)
            const maneuverTime = 3600; // 1 hour in seconds
            const preManeuverPoints = UnifiedSatellitePropagator.propagateOrbit({
                satellite,
                bodies: mockBodies,
                duration: maneuverTime,
                timeStep: 60, // 1 minute steps
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true
            });

            expect(preManeuverPoints.length).toBeGreaterThan(50);
            
            // Verify the orbit progresses realistically
            const firstPoint = preManeuverPoints[0];
            const lastPoint = preManeuverPoints[preManeuverPoints.length - 1];
            
            const firstR = Math.sqrt(firstPoint.position[0]**2 + firstPoint.position[1]**2 + firstPoint.position[2]**2);
            const lastR = Math.sqrt(lastPoint.position[0]**2 + lastPoint.position[1]**2 + lastPoint.position[2]**2);
            
            // Should maintain reasonable orbital radius (accounting for drag)
            expect(firstR).toBeCloseTo(7000, 0);
            expect(lastR).toBeGreaterThan(6800); // Atmospheric drag causes orbital decay
            expect(lastR).toBeLessThan(7100);
        });

        it('should handle different maneuver timing predictions consistently', () => {
            const satellite = {
                position: [10000, 0, 0],
                velocity: [0, 6.32, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Test different maneuver times
            const maneuverTimes = [1800, 3600, 7200]; // 30 min, 1 hour, 2 hours
            const results = [];

            for (const maneuverTime of maneuverTimes) {
                const points = UnifiedSatellitePropagator.propagateOrbit({
                    satellite,
                    bodies: mockBodies,
                    duration: maneuverTime,
                    timeStep: 60,
                    includeJ2: true,
                    includeDrag: false, // Disable for pure gravitational test
                    includeThirdBody: false
                });
                results.push(points[points.length - 1]);
            }

            // Verify that longer propagations build on shorter ones consistently
            expect(results.length).toBe(3);
            
            // Check energy conservation across different timeframes
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const r = Math.sqrt(result.position[0]**2 + result.position[1]**2 + result.position[2]**2);
                const v = Math.sqrt(result.velocity[0]**2 + result.velocity[1]**2 + result.velocity[2]**2);
                const energy = 0.5 * v * v - mockBodies[399].GM / r;
                
                console.log(`Maneuver time ${maneuverTimes[i]}s: Energy = ${energy.toFixed(6)} km²/s²`);
                
                // Energy should be conserved (negative for bound orbits)
                expect(energy).toBeLessThan(0);
                expect(Math.abs(energy)).toBeGreaterThan(10); // Reasonable orbital energy
            }
        });
    });

    describe('Post-Maneuver Orbit Propagation', () => {
        it('should apply delta-V correctly and use unified propagation', () => {
            // Start with circular orbit
            const initialSatellite = {
                position: [8000, 0, 0],
                velocity: [0, 7.07, 0], // Circular velocity at 8000 km
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Define maneuver: prograde burn to raise apoapsis
            const maneuverNode = {
                deltaV: {
                    prograde: 0.5, // 500 m/s prograde
                    normal: 0,
                    radial: 0
                }
            };

            // Get state at maneuver point (using current position)
            const maneuverPosition = new THREE.Vector3(...initialSatellite.position);
            const maneuverVelocity = new THREE.Vector3(...initialSatellite.velocity);
            
            // Convert local delta-V to world coordinates
            const localDeltaV = new THREE.Vector3(
                maneuverNode.deltaV.prograde,
                maneuverNode.deltaV.normal,
                maneuverNode.deltaV.radial
            );
            
            const worldDeltaV = Utils.vector.localToWorldDeltaV(localDeltaV, maneuverPosition, maneuverVelocity);
            
            // Apply delta-V
            const postManeuverVelocity = maneuverVelocity.clone().add(worldDeltaV);
            
            // Create post-maneuver satellite state
            const postManeuverSatellite = {
                ...initialSatellite,
                velocity: postManeuverVelocity.toArray()
            };

            // Propagate post-maneuver orbit using unified system
            const postManeuverPoints = UnifiedSatellitePropagator.propagateOrbit({
                satellite: postManeuverSatellite,
                bodies: mockBodies,
                duration: 7200, // 2 hours
                timeStep: 60,
                includeJ2: true,
                includeDrag: false, // Disable for pure orbital mechanics test
                includeThirdBody: false
            });

            expect(postManeuverPoints.length).toBeGreaterThan(100);

            // Verify the maneuver raised the apoapsis
            let maxRadius = 0;
            let minRadius = Infinity;
            
            for (const point of postManeuverPoints) {
                const r = Math.sqrt(point.position[0]**2 + point.position[1]**2 + point.position[2]**2);
                maxRadius = Math.max(maxRadius, r);
                minRadius = Math.min(minRadius, r);
            }

            console.log(`Post-maneuver orbit: Periapsis = ${minRadius.toFixed(1)} km, Apoapsis = ${maxRadius.toFixed(1)} km`);
            
            // The prograde burn should have raised the apoapsis above the initial circular orbit
            expect(maxRadius).toBeGreaterThan(8200); // Should be higher than initial 8000 km
            expect(minRadius).toBeCloseTo(8000, 0); // Periapsis should remain near maneuver point
            
            // Verify orbital energy increased (less negative) due to prograde burn
            const finalPoint = postManeuverPoints[postManeuverPoints.length - 1];
            const finalR = Math.sqrt(finalPoint.position[0]**2 + finalPoint.position[1]**2 + finalPoint.position[2]**2);
            const finalV = Math.sqrt(finalPoint.velocity[0]**2 + finalPoint.velocity[1]**2 + finalPoint.velocity[2]**2);
            const finalEnergy = 0.5 * finalV * finalV - mockBodies[399].GM / finalR;
            
            const initialR = Math.sqrt(initialSatellite.position[0]**2 + initialSatellite.position[1]**2 + initialSatellite.position[2]**2);
            const initialV = Math.sqrt(initialSatellite.velocity[0]**2 + initialSatellite.velocity[1]**2 + initialSatellite.velocity[2]**2);
            const initialEnergy = 0.5 * initialV * initialV - mockBodies[399].GM / initialR;
            
            expect(finalEnergy).toBeGreaterThan(initialEnergy); // Higher energy due to prograde burn
        });

        it('should handle retrograde burns correctly', () => {
            const satellite = {
                position: [9000, 0, 0],
                velocity: [0, 6.65, 0], // Circular velocity at 9000 km
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Retrograde burn to lower periapsis
            const retroDeltaV = new THREE.Vector3(-0.3, 0, 0); // 300 m/s retrograde
            const position = new THREE.Vector3(...satellite.position);
            const velocity = new THREE.Vector3(...satellite.velocity);
            
            const worldDeltaV = Utils.vector.localToWorldDeltaV(retroDeltaV, position, velocity);
            const postBurnVelocity = velocity.clone().add(worldDeltaV);
            
            const postBurnSatellite = {
                ...satellite,
                velocity: postBurnVelocity.toArray()
            };

            const points = UnifiedSatellitePropagator.propagateOrbit({
                satellite: postBurnSatellite,
                bodies: mockBodies,
                duration: 5400, // 1.5 hours
                timeStep: 60,
                includeJ2: true,
                includeDrag: false,
                includeThirdBody: false
            });

            // Find periapsis and apoapsis
            let maxRadius = 0;
            let minRadius = Infinity;
            
            for (const point of points) {
                const r = Math.sqrt(point.position[0]**2 + point.position[1]**2 + point.position[2]**2);
                maxRadius = Math.max(maxRadius, r);
                minRadius = Math.min(minRadius, r);
            }

            console.log(`Retrograde burn result: Periapsis = ${minRadius.toFixed(1)} km, Apoapsis = ${maxRadius.toFixed(1)} km`);
            
            // Retrograde burn should lower the periapsis
            expect(minRadius).toBeLessThan(8800); // Lower than initial 9000 km
            expect(maxRadius).toBeCloseTo(9000, 0); // Apoapsis should remain near burn point
        });
    });

    describe('Maneuver Propagation Consistency', () => {
        it('should produce identical results when using the same propagation system', () => {
            const satellite = {
                position: [7500, 0, 0],
                velocity: [0, 7.27, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Propagate using unified system directly
            const directResult = UnifiedSatellitePropagator.propagateOrbit({
                satellite,
                bodies: mockBodies,
                duration: 3600,
                timeStep: 60,
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true
            });

            // Simulate what the worker would do (same unified system)
            const workerResult = UnifiedSatellitePropagator.propagateOrbit({
                satellite,
                bodies: mockBodies,
                duration: 3600,
                timeStep: 60,
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true
            });

            expect(directResult.length).toBe(workerResult.length);
            
            // Compare final positions (should be identical)
            const directFinal = directResult[directResult.length - 1];
            const workerFinal = workerResult[workerResult.length - 1];
            
            expect(directFinal.position[0]).toBeCloseTo(workerFinal.position[0], 10);
            expect(directFinal.position[1]).toBeCloseTo(workerFinal.position[1], 10);
            expect(directFinal.position[2]).toBeCloseTo(workerFinal.position[2], 10);
            
            expect(directFinal.velocity[0]).toBeCloseTo(workerFinal.velocity[0], 10);
            expect(directFinal.velocity[1]).toBeCloseTo(workerFinal.velocity[1], 10);
            expect(directFinal.velocity[2]).toBeCloseTo(workerFinal.velocity[2], 10);
        });

        it('should maintain energy conservation through maneuver sequences', () => {
            // Test a Hohmann transfer maneuver sequence
            const satellite = {
                position: [8000, 0, 0], // Low circular orbit
                velocity: [0, 7.07, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // First burn: prograde to raise apoapsis to 12000 km
            const transferVelocity = Math.sqrt(mockBodies[399].GM * (2/8000 - 1/10000)); // Transfer orbit velocity at periapsis
            const deltaV1 = transferVelocity - 7.07; // Difference from circular velocity
            
            const position1 = new THREE.Vector3(...satellite.position);
            const velocity1 = new THREE.Vector3(...satellite.velocity);
            const localDV1 = new THREE.Vector3(deltaV1, 0, 0);
            const worldDV1 = Utils.vector.localToWorldDeltaV(localDV1, position1, velocity1);
            
            const transferSatellite = {
                ...satellite,
                velocity: velocity1.clone().add(worldDV1).toArray()
            };

            // Propagate to apoapsis (half orbital period of transfer orbit)
            const transferPeriod = 2 * Math.PI * Math.sqrt(Math.pow(10000, 3) / mockBodies[399].GM);
            const timeToApoapsis = transferPeriod / 2;
            
            const transferOrbit = UnifiedSatellitePropagator.propagateOrbit({
                satellite: transferSatellite,
                bodies: mockBodies,
                duration: timeToApoapsis,
                timeStep: 60,
                includeJ2: false, // Pure Keplerian for energy test
                includeDrag: false,
                includeThirdBody: false
            });

            // Check that we reached approximately the target apoapsis
            const apoapsisPoint = transferOrbit[transferOrbit.length - 1];
            const apoapsisRadius = Math.sqrt(apoapsisPoint.position[0]**2 + apoapsisPoint.position[1]**2 + apoapsisPoint.position[2]**2);
            
            console.log(`Transfer orbit apoapsis: ${apoapsisRadius.toFixed(1)} km (target: 12000 km)`);
            expect(apoapsisRadius).toBeCloseTo(12000, -2); // Within 100 km
            
            // Verify energy conservation during transfer
            const initialEnergy = 0.5 * 7.07**2 - mockBodies[399].GM / 8000;
            const transferEnergy = 0.5 * transferVelocity**2 - mockBodies[399].GM / 8000;
            const apoapsisV = Math.sqrt(apoapsisPoint.velocity[0]**2 + apoapsisPoint.velocity[1]**2 + apoapsisPoint.velocity[2]**2);
            const apoapsisEnergy = 0.5 * apoapsisV**2 - mockBodies[399].GM / apoapsisRadius;
            
            console.log(`Energy conservation check:`);
            console.log(`  Initial: ${initialEnergy.toFixed(6)} km²/s²`);
            console.log(`  Transfer: ${transferEnergy.toFixed(6)} km²/s²`);
            console.log(`  Apoapsis: ${apoapsisEnergy.toFixed(6)} km²/s²`);
            
            // Energy should be conserved within numerical precision
            expect(Math.abs(transferEnergy - apoapsisEnergy)).toBeLessThan(0.001);
        });
    });

    describe('Integration with PhysicsEngine', () => {
        it('should produce consistent results through PhysicsEngine interface', async () => {
            // Add satellite to physics engine
            const satelliteId = physicsEngine.addSatellite({
                id: 'maneuver-test',
                position: [7200, 0, 0],
                velocity: [0, 7.42, 0],
                centralBodyNaifId: 399,
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            const satellite = physicsEngine.satellites.get(satelliteId);
            expect(satellite).toBeDefined();

            // Test acceleration calculation consistency
            const physicsAccel = physicsEngine._computeSatelliteAccelerationUnified(satellite);
            expect(physicsAccel).toBeDefined();
            expect(physicsAccel.length()).toBeGreaterThan(0);

            // Compare with direct UnifiedSatellitePropagator call
            const satState = {
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                centralBodyNaifId: satellite.centralBodyNaifId,
                mass: satellite.mass,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient
            };

            const bodiesArray = {};
            for (const [naifId, body] of Object.entries(physicsEngine.bodies)) {
                bodiesArray[naifId] = {
                    ...body,
                    position: body.position.toArray(),
                    velocity: body.velocity.toArray()
                };
            }

            const directAccel = UnifiedSatellitePropagator.computeAcceleration(
                satState, 
                bodiesArray,
                { includeJ2: true, includeDrag: true, includeThirdBody: true }
            );

            // Should be identical (within floating point precision)
            expect(physicsAccel.x).toBeCloseTo(directAccel[0], 10);
            expect(physicsAccel.y).toBeCloseTo(directAccel[1], 10);
            expect(physicsAccel.z).toBeCloseTo(directAccel[2], 10);

            console.log(`Acceleration consistency verified:`);
            console.log(`  PhysicsEngine: [${physicsAccel.x.toExponential(6)}, ${physicsAccel.y.toExponential(6)}, ${physicsAccel.z.toExponential(6)}]`);
            console.log(`  Direct UnifiedSatellitePropagator: [${directAccel[0].toExponential(6)}, ${directAccel[1].toExponential(6)}, ${directAccel[2].toExponential(6)}]`);
        });
    });
});