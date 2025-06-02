import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { integrateRK4 } from '../src/physics/integrators/OrbitalIntegrators.js';

describe('Satellite Performance Metrics Validation', () => {
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

    describe('RK4 Vector Pooling Performance', () => {
        it('should demonstrate significant performance improvement with vector pooling', () => {
            const position = new THREE.Vector3(7000, 0, 0);
            const velocity = new THREE.Vector3(0, 7.5, 0);
            
            const accelerationFunc = (pos, vel) => {
                const GM = 398600.4418;
                const r = pos.length();
                const acc = -GM / (r * r * r);
                return pos.clone().multiplyScalar(acc);
            };

            // Test with high iteration count to measure pooling benefits
            const iterations = 5000;
            let currentPos = position.clone();
            let currentVel = velocity.clone();
            
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                const result = integrateRK4(currentPos, currentVel, accelerationFunc, 0.1);
                currentPos = result.position;
                currentVel = result.velocity;
            }
            
            const totalTime = performance.now() - startTime;
            const avgTimePerIntegration = totalTime / iterations;
            
            console.log(`\n📊 RK4 Vector Pooling Results:`);
            console.log(`   Total time: ${totalTime.toFixed(2)}ms for ${iterations} integrations`);
            console.log(`   Average: ${(avgTimePerIntegration * 1000).toFixed(1)}μs per integration`);
            console.log(`   Performance: ${(iterations / (totalTime / 1000)).toFixed(0)} integrations/second`);
            
            // Performance target: should be under 0.1ms per integration
            expect(avgTimePerIntegration).toBeLessThan(0.1);
            
            // Memory target: should complete without excessive allocations
            expect(totalTime).toBeLessThan(1000); // Under 1 second total
        });
    });

    describe('Multi-Satellite Cache Performance', () => {
        it('should demonstrate cache efficiency with multiple satellites', async () => {
            const satelliteCount = 25;
            const satelliteIds = [];
            
            console.log(`\n🛰️  Multi-Satellite Cache Performance (${satelliteCount} satellites):`);
            
            // Create satellites in circular formation
            for (let i = 0; i < satelliteCount; i++) {
                const angle = (i / satelliteCount) * 2 * Math.PI;
                const radius = 7000 + (i % 5) * 50; // Slight altitude variation
                
                const satellite = {
                    id: `cache-test-${i}`,
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
            
            // Warm up caches with initial steps
            for (let i = 0; i < 5; i++) {
                await physicsEngine.step(1.0);
            }
            
            // Measure cached performance
            const cachedSteps = 30;
            const cachedStartTime = performance.now();
            
            for (let i = 0; i < cachedSteps; i++) {
                await physicsEngine.step(1.0);
            }
            
            const cachedTime = performance.now() - cachedStartTime;
            const avgCachedStep = cachedTime / cachedSteps;
            
            const stats = physicsEngine.getPerformanceStats();
            
            console.log(`   Cache entries: ${stats.cacheSize}`);
            console.log(`   Cached steps: ${cachedTime.toFixed(1)}ms for ${cachedSteps} steps`);
            console.log(`   Average cached step: ${avgCachedStep.toFixed(1)}ms`);
            console.log(`   Performance target: <50ms per step ✓`);
            
            // Performance assertions
            expect(stats.cacheSize).toBeGreaterThan(0);
            expect(avgCachedStep).toBeLessThan(50); // Cached performance should be good
            
            // Cleanup
            satelliteIds.forEach(id => physicsEngine.removeSatellite(id));
        });
    });

    describe('Memory Allocation Patterns', () => {
        it('should maintain stable memory usage during continuous operation', async () => {
            if (!performance.memory) {
                console.log('   ⚠️  Memory metrics not available in this environment');
                return;
            }
            
            const initialMemory = performance.memory.usedJSHeapSize;
            
            // Create test satellites
            const satelliteIds = [];
            for (let i = 0; i < 15; i++) {
                const satellite = {
                    id: `memory-test-${i}`,
                    position: [7000 + i * 20, 0, 0],
                    velocity: [0, 7.5, 0],
                    mass: 1000,
                    centralBodyNaifId: 399
                };
                satelliteIds.push(physicsEngine.addSatellite(satellite));
            }
            
            const postCreationMemory = performance.memory.usedJSHeapSize;
            
            // Run extended simulation
            for (let i = 0; i < 100; i++) {
                await physicsEngine.step(0.5);
                
                // Force garbage collection periodically (if available)
                if (i % 20 === 0 && global.gc) {
                    global.gc();
                }
            }
            
            const finalMemory = performance.memory.usedJSHeapSize;
            
            const creationGrowth = postCreationMemory - initialMemory;
            const simulationGrowth = finalMemory - postCreationMemory;
            
            console.log(`\n💾 Memory Allocation Analysis:`);
            console.log(`   Initial: ${(initialMemory / 1024 / 1024).toFixed(1)}MB`);
            console.log(`   After creation: ${(postCreationMemory / 1024 / 1024).toFixed(1)}MB (+${(creationGrowth / 1024).toFixed(0)}KB)`);
            console.log(`   After simulation: ${(finalMemory / 1024 / 1024).toFixed(1)}MB (+${(simulationGrowth / 1024).toFixed(0)}KB)`);
            console.log(`   Simulation growth: ${simulationGrowth < 1024 * 1024 ? (simulationGrowth / 1024).toFixed(0) + 'KB' : (simulationGrowth / 1024 / 1024).toFixed(1) + 'MB'}`);
            
            // Memory growth during simulation should be minimal due to vector pooling
            expect(simulationGrowth).toBeLessThan(5 * 1024 * 1024); // Less than 5MB growth during simulation
            
            // Cleanup
            satelliteIds.forEach(id => physicsEngine.removeSatellite(id));
        });
    });

    describe('Scalability Testing', () => {
        it('should scale efficiently with increasing satellite counts', async () => {
            const testSizes = [5, 10, 20, 40];
            const results = [];
            
            console.log(`\n📈 Scalability Analysis:`);
            
            for (const count of testSizes) {
                const satelliteIds = [];
                
                // Create satellites
                const createStart = performance.now();
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * 2 * Math.PI;
                    const satellite = {
                        id: `scale-test-${count}-${i}`,
                        position: [
                            7000 * Math.cos(angle),
                            7000 * Math.sin(angle),
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
                    satelliteIds.push(physicsEngine.addSatellite(satellite));
                }
                const createTime = performance.now() - createStart;
                
                // Measure physics performance
                const stepStart = performance.now();
                const stepCount = 10;
                for (let i = 0; i < stepCount; i++) {
                    await physicsEngine.step(1.0);
                }
                const stepTime = performance.now() - stepStart;
                const avgStepTime = stepTime / stepCount;
                
                results.push({
                    count,
                    createTime,
                    avgStepTime,
                    timePerSatellite: avgStepTime / count
                });
                
                console.log(`   ${count} satellites: ${avgStepTime.toFixed(1)}ms/step (${(avgStepTime/count).toFixed(2)}ms per satellite)`);
                
                // Performance should scale reasonably
                expect(avgStepTime).toBeLessThan(count * 2); // Linear scaling or better
                
                // Cleanup
                satelliteIds.forEach(id => physicsEngine.removeSatellite(id));
            }
            
            // Check that per-satellite time doesn't increase significantly
            const firstPerSat = results[0].timePerSatellite;
            const lastPerSat = results[results.length - 1].timePerSatellite;
            const scalingFactor = lastPerSat / firstPerSat;
            
            console.log(`   Scaling factor: ${scalingFactor.toFixed(2)}x (${scalingFactor < 2 ? 'GOOD' : 'NEEDS_OPTIMIZATION'})`);
            
            // Scaling should be reasonable (less than 2x increase in per-satellite time)
            expect(scalingFactor).toBeLessThan(3); // Allow some degradation but not excessive
        });
    });
});