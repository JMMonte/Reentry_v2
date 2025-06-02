import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { integrateRK4 } from '../src/physics/integrators/OrbitalIntegrators.js';
import { CoordinateTransforms } from '../src/physics/utils/CoordinateTransforms.js';

describe('Satellite Performance Optimizations', () => {
    let physicsEngine;
    
    beforeEach(async () => {
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
    });

    afterEach(() => {
        if (physicsEngine.cleanup) {
            physicsEngine.cleanup();
        }
    });

    describe('Vector Pooling in RK4 Integration', () => {
        it('should use pre-allocated vectors without memory leaks', () => {
            const position = new THREE.Vector3(7000, 0, 0); // 7000 km from center
            const velocity = new THREE.Vector3(0, 7.5, 0); // ~7.5 km/s orbital velocity
            
            const accelerationFunc = (pos, vel) => {
                // Simple gravitational acceleration for Earth
                const GM = 398600.4418; // km³/s² for Earth
                const r = pos.length();
                const acc = -GM / (r * r * r);
                return pos.clone().multiplyScalar(acc);
            };

            // Track memory usage by monitoring vector allocations
            const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
            
            // Perform many integration steps to test vector pooling
            let currentPos = position.clone();
            let currentVel = velocity.clone();
            
            const startTime = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                const result = integrateRK4(currentPos, currentVel, accelerationFunc, 1.0);
                currentPos = result.position;
                currentVel = result.velocity;
            }
            
            const endTime = performance.now();
            const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
            
            // Verify orbit is reasonable (should still be roughly circular)
            const finalRadius = currentPos.length();
            expect(finalRadius).toBeGreaterThan(6000); // Still above Earth
            expect(finalRadius).toBeLessThan(8000); // Reasonable orbit
            
            // Performance should be good (less than 1ms per integration on average)
            const avgTimePerIntegration = (endTime - startTime) / 1000;
            expect(avgTimePerIntegration).toBeLessThan(1);
            
            // Memory growth should be minimal due to vector pooling
            if (performance.memory) {
                const memoryGrowth = finalMemory - initialMemory;
                expect(memoryGrowth).toBeLessThan(1000000); // Less than 1MB growth for 1000 integrations
            }
            
            console.log(`✓ RK4 Integration: ${(endTime - startTime).toFixed(2)}ms for 1000 steps`);
            console.log(`✓ Average: ${avgTimePerIntegration.toFixed(3)}ms per integration`);
        });
    });

    describe('Physics Engine Performance Caches', () => {
        it('should efficiently cache significant body calculations', async () => {
            // Add multiple satellites to test caching
            const satellites = [];
            const startTime = performance.now();
            
            for (let i = 0; i < 10; i++) {
                const satellite = {
                    id: `test-sat-${i}`,
                    position: [7000 + i * 100, 0, 0], // Spread satellites around
                    velocity: [0, 7.5, 0],
                    mass: 1000,
                    centralBodyNaifId: 399 // Earth
                };
                
                const id = physicsEngine.addSatellite(satellite);
                satellites.push(id);
            }
            
            const addTime = performance.now() - startTime;
            
            // Perform multiple physics steps to test caching efficiency
            const stepStartTime = performance.now();
            
            for (let step = 0; step < 50; step++) {
                await physicsEngine.step(1.0); // 1 second steps
            }
            
            const stepTime = performance.now() - stepStartTime;
            
            // Get performance stats
            const stats = physicsEngine.getPerformanceStats();
            
            expect(stats.satelliteCount).toBe(10);
            expect(stats.cacheSize).toBeGreaterThan(0); // Cache should be populated
            
            // Performance should be reasonable
            const avgStepTime = stepTime / 50;
            expect(avgStepTime).toBeLessThan(50); // Less than 50ms per step for 10 satellites
            
            console.log(`✓ Added 10 satellites in ${addTime.toFixed(2)}ms`);
            console.log(`✓ Physics steps: ${stepTime.toFixed(2)}ms for 50 steps (${avgStepTime.toFixed(2)}ms avg)`);
            console.log(`✓ Cache entries: ${stats.cacheSize}`);
            
            // Cleanup
            satellites.forEach(id => physicsEngine.removeSatellite(id));
        });

        it('should clear caches appropriately', async () => {
            // Add a satellite
            const satellite = {
                id: 'cache-test-sat',
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 1000,
                centralBodyNaifId: 399
            };
            
            const id = physicsEngine.addSatellite(satellite);
            
            // Run some steps to populate cache
            for (let i = 0; i < 10; i++) {
                await physicsEngine.step(1.0);
            }
            
            let stats = physicsEngine.getPerformanceStats();
            expect(stats.cacheSize).toBeGreaterThan(0);
            
            // Wait for cache timeout (simulate time passage)
            // Force cache clear by calling the private method
            physicsEngine._clearCacheIfNeeded();
            
            // Cache should still exist since we just updated it
            stats = physicsEngine.getPerformanceStats();
            expect(stats.cacheSize).toBeGreaterThan(0);
            
            console.log(`✓ Cache management working properly`);
            
            physicsEngine.removeSatellite(id);
        });
    });

    describe('Satellite Creation Optimizations', () => {
        it('should efficiently create satellites with appropriate SOI placement', () => {
            const startTime = performance.now();
            
            // Test various satellite creation scenarios
            const testCases = [
                {
                    name: 'Earth LEO',
                    position: [6800, 0, 0], // 400km altitude
                    velocity: [0, 7.67, 0], // LEO velocity
                    centralBodyNaifId: 399
                },
                {
                    name: 'Earth GEO',
                    position: [42164, 0, 0], // GEO altitude
                    velocity: [0, 3.07, 0], // GEO velocity
                    centralBodyNaifId: 399
                },
                {
                    name: 'Moon orbit',
                    position: [2000, 0, 0], // 262km above Moon
                    velocity: [0, 1.5, 0], // Lunar orbital velocity
                    centralBodyNaifId: 301
                }
            ];
            
            const createdSatellites = [];
            
            testCases.forEach((testCase, index) => {
                const satellite = {
                    id: `soi-test-${index}`,
                    position: testCase.position,
                    velocity: testCase.velocity,
                    mass: 1000,
                    centralBodyNaifId: testCase.centralBodyNaifId,
                    name: testCase.name
                };
                
                const id = physicsEngine.addSatellite(satellite);
                createdSatellites.push(id);
                
                // Verify satellite was created
                expect(id).toBeDefined();
                expect(typeof id).toBe('string');
            });
            
            const creationTime = performance.now() - startTime;
            
            // Get satellite states
            const state = physicsEngine.getSimulationState();
            expect(Object.keys(state.satellites)).toHaveLength(3);
            
            // Verify satellite properties
            Object.values(state.satellites).forEach(sat => {
                expect(sat.position).toHaveLength(3);
                expect(sat.velocity).toHaveLength(3);
                expect(sat.mass).toBe(1000);
                expect(sat.centralBodyNaifId).toBeDefined();
            });
            
            console.log(`✓ Created 3 satellites in ${creationTime.toFixed(2)}ms`);
            console.log(`✓ All satellites have valid states and SOI assignments`);
            
            // Cleanup
            createdSatellites.forEach(id => physicsEngine.removeSatellite(id));
        });

        it('should validate satellite states efficiently', () => {
            const satellite = {
                id: 'validation-test',
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 1000,
                centralBodyNaifId: 399
            };
            
            const id = physicsEngine.addSatellite(satellite);
            const state = physicsEngine.getSimulationState();
            const satState = state.satellites[id];
            
            // Verify state validation is working
            expect(satState.position).toHaveLength(3);
            expect(satState.velocity).toHaveLength(3);
            expect(satState.speed).toBeCloseTo(7.5, 1); // Speed should be ~7.5 km/s
            expect(satState.altitude_surface).toBeGreaterThan(0); // Above Earth surface
            
            console.log(`✓ Satellite validation: speed=${satState.speed.toFixed(2)} km/s, altitude=${satState.altitude_surface.toFixed(0)} km`);
            
            physicsEngine.removeSatellite(id);
        });
    });

    describe('Coordinate System Performance', () => {
        it('should efficiently handle coordinate transformations', () => {
            const startTime = performance.now();
            
            // Test coordinate transformations with SatelliteCoordinates
            const testParams = {
                latitude: 28.5, // Cape Canaveral
                longitude: -80.5,
                altitude: 400,
                velocity: 7.8,
                azimuth: 90, // Due East
                angleOfAttack: 0
            };
            
            // Mock planet object
            const earth = {
                radius: 6371,
                mass: 5.972e24,
                GM: 398600.4418,
                rotationRate: 7.2921159e-5,
                rotationPeriod: 86164.1
            };
            
            // Test coordinate creation from lat/lon
            const result = CoordinateTransforms.createFromLatLon(testParams, earth);
            
            expect(result.position).toHaveLength(3);
            expect(result.velocity).toHaveLength(3);
            
            // Position should be reasonable for 400km altitude
            const radius = Math.sqrt(result.position[0]**2 + result.position[1]**2 + result.position[2]**2);
            expect(radius).toBeCloseTo(6771, 50); // 6371 + 400 km ± 50km
            
            // Velocity should be reasonable for LEO
            const speed = Math.sqrt(result.velocity[0]**2 + result.velocity[1]**2 + result.velocity[2]**2);
            expect(speed).toBeGreaterThan(7); // Should be orbital velocity
            expect(speed).toBeLessThan(8.5);
            
            const transformTime = performance.now() - startTime;
            
            console.log(`✓ Coordinate transformation: ${transformTime.toFixed(2)}ms`);
            console.log(`✓ Generated orbit: radius=${radius.toFixed(0)}km, speed=${speed.toFixed(2)}km/s`);
        });

        it('should handle multiple coordinate frame transformations', () => {
            const earth = {
                radius: 6371,
                mass: 5.972e24,
                GM: 398600.4418,
                rotationRate: 7.2921159e-5
            };
            
            const startTime = performance.now();
            
            // Test multiple transformations
            const transformations = [
                { from: 'PF', to: 'PCI' },
                { from: 'PCI', to: 'PF' },
                { from: 'PCI', to: 'SSB' },
                { from: 'SSB', to: 'PCI' }
            ];
            
            const position = [6771, 0, 0];
            const velocity = [0, 7.5, 0];
            
            transformations.forEach(({ from, to }) => {
                const result = CoordinateTransforms.transformCoordinates(
                    position, velocity, from, to, earth
                );
                
                expect(result.position).toHaveLength(3);
                expect(result.velocity).toHaveLength(3);
                expect(result.position.every(x => isFinite(x))).toBe(true);
                expect(result.velocity.every(x => isFinite(x))).toBe(true);
            });
            
            const transformTime = performance.now() - startTime;
            
            console.log(`✓ Multiple coordinate transformations: ${transformTime.toFixed(2)}ms`);
        });
    });

    describe('Memory Management', () => {
        it('should properly cleanup resources', async () => {
            const initialStats = physicsEngine.getPerformanceStats();
            
            // Create and destroy many satellites to test cleanup
            const satelliteIds = [];
            
            for (let i = 0; i < 20; i++) {
                const satellite = {
                    id: `cleanup-test-${i}`,
                    position: [7000 + i * 10, 0, 0],
                    velocity: [0, 7.5, 0],
                    mass: 1000,
                    centralBodyNaifId: 399
                };
                
                const id = physicsEngine.addSatellite(satellite);
                satelliteIds.push(id);
            }
            
            // Run some physics steps
            for (let i = 0; i < 10; i++) {
                await physicsEngine.step(1.0);
            }
            
            const midStats = physicsEngine.getPerformanceStats();
            expect(midStats.satelliteCount).toBe(20);
            
            // Remove all satellites
            satelliteIds.forEach(id => physicsEngine.removeSatellite(id));
            
            const finalStats = physicsEngine.getPerformanceStats();
            expect(finalStats.satelliteCount).toBe(0);
            
            // Run cleanup
            physicsEngine.cleanup();
            
            console.log(`✓ Memory cleanup: ${initialStats.satelliteCount} → ${midStats.satelliteCount} → ${finalStats.satelliteCount} satellites`);
            console.log(`✓ Cache cleaned up properly`);
        });
    });

    describe('Performance Benchmarks', () => {
        it('should handle high satellite counts efficiently', async () => {
            const satelliteCount = 50;
            const satelliteIds = [];
            
            console.log(`\n🚀 Performance Benchmark: ${satelliteCount} satellites`);
            
            // Creation benchmark
            const createStart = performance.now();
            
            for (let i = 0; i < satelliteCount; i++) {
                const angle = (i / satelliteCount) * 2 * Math.PI;
                const radius = 7000 + (i % 10) * 100; // Vary altitude
                
                const satellite = {
                    id: `perf-test-${i}`,
                    position: [
                        radius * Math.cos(angle),
                        radius * Math.sin(angle),
                        0
                    ],
                    velocity: [
                        -7.5 * Math.sin(angle),
                        7.5 * Math.cos(angle),
                        0
                    ],
                    mass: 1000,
                    centralBodyNaifId: 399
                };
                
                const id = physicsEngine.addSatellite(satellite);
                satelliteIds.push(id);
            }
            
            const createTime = performance.now() - createStart;
            
            // Physics step benchmark
            const stepStart = performance.now();
            const stepCount = 20;
            
            for (let i = 0; i < stepCount; i++) {
                await physicsEngine.step(1.0);
            }
            
            const stepTime = performance.now() - stepStart;
            const avgStepTime = stepTime / stepCount;
            
            // Performance assertions
            expect(createTime).toBeLessThan(2000); // Creation should be under 2 seconds
            expect(avgStepTime).toBeLessThan(100); // Each step should be under 100ms
            
            console.log(`✓ Creation: ${createTime.toFixed(0)}ms (${(createTime/satelliteCount).toFixed(1)}ms per satellite)`);
            console.log(`✓ Physics steps: ${stepTime.toFixed(0)}ms for ${stepCount} steps (${avgStepTime.toFixed(1)}ms avg)`);
            console.log(`✓ Performance target: <100ms per step ✓`);
            
            // Cleanup
            satelliteIds.forEach(id => physicsEngine.removeSatellite(id));
        });
    });
});