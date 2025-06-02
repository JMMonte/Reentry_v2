import { describe, it, expect, beforeEach } from 'vitest';
import { OrbitCacheManager } from '../src/managers/OrbitCacheManager.js';

describe('OrbitCacheManager Propagation Information', () => {
    let cacheManager;
    
    beforeEach(() => {
        cacheManager = new OrbitCacheManager();
    });

    describe('Cache Entry Creation with Propagation Metadata', () => {
        it('should store complete propagation metadata in cache entries', () => {
            const mockPoints = Array.from({ length: 360 }, (_, i) => ({
                position: [7000 + i, 0, 0],
                velocity: [0, 7.5, 0],
                time: i * 10
            }));
            
            const mockParams = {
                hash: 'test-hash',
                maxPeriods: 2,
                duration: 3600,
                pointsPerPeriod: 180,
                requestedPeriods: 2,
                satellite: {
                    position: [7000, 0, 0],
                    velocity: [0, 7.5, 0],
                    centralBodyNaifId: 399
                },
                existingPoints: [],
                calculationTime: Date.now()
            };
            
            const mockSatellite = {
                lastManeuverTime: null
            };
            
            const mockPhysicsEngine = {
                simulationTime: {
                    getTime: () => Date.now()
                }
            };
            
            // Test cache entry creation
            const cacheEntry = cacheManager.createCacheEntry(
                mockPoints, 
                mockParams, 
                mockSatellite, 
                mockPhysicsEngine
            );
            
            // Verify all propagation metadata is stored
            expect(cacheEntry.points).toBe(mockPoints);
            expect(cacheEntry.maxPeriods).toBe(2);
            expect(cacheEntry.duration).toBe(3600);
            expect(cacheEntry.pointsPerPeriod).toBe(180);
            expect(cacheEntry.requestedPeriods).toBe(2);
            expect(cacheEntry.pointCount).toBe(360);
            expect(cacheEntry.partial).toBe(false);
            expect(cacheEntry.centralBodyNaifId).toBe(399);
            expect(cacheEntry.timestamp).toBeDefined();
            expect(cacheEntry.hash).toBe('test-hash');
            
            console.log('✓ Cache entry contains complete propagation metadata');
            console.log(`   Duration: ${cacheEntry.duration}s, Points: ${cacheEntry.pointCount}, Periods: ${cacheEntry.maxPeriods}`);
        });
        
        it('should store partial propagation metadata for incomplete calculations', () => {
            const mockPoints = Array.from({ length: 120 }, (_, i) => ({
                position: [7000 + i, 0, 0],
                velocity: [0, 7.5, 0],
                time: i * 10
            }));
            
            const mockParams = {
                hash: 'test-hash-partial',
                maxPeriods: 2,
                duration: 1200,
                pointsPerPeriod: 180,
                requestedPeriods: 2,
                satellite: {
                    position: [7000, 0, 0],
                    velocity: [0, 7.5, 0],
                    centralBodyNaifId: 399
                }
            };
            
            const mockPhysicsEngine = {
                simulationTime: {
                    getTime: () => Date.now()
                }
            };
            
            // Test partial cache entry creation
            const partialEntry = cacheManager.createPartialCacheEntry(
                mockPoints,
                mockParams,
                mockPhysicsEngine
            );
            
            // Verify partial metadata is stored
            expect(partialEntry.points).toBe(mockPoints);
            expect(partialEntry.duration).toBe(1200);
            expect(partialEntry.pointsPerPeriod).toBe(180);
            expect(partialEntry.requestedPeriods).toBe(2);
            expect(partialEntry.pointCount).toBe(120);
            expect(partialEntry.partial).toBe(true);
            expect(partialEntry.timestamp).toBeDefined();
            expect(partialEntry.hash).toBe('test-hash-partial');
            
            console.log('✓ Partial cache entry contains propagation metadata');
            console.log(`   Duration: ${partialEntry.duration}s, Points: ${partialEntry.pointCount} (partial)`);
        });
    });

    describe('Cache Storage and Retrieval', () => {
        it('should store and retrieve orbit data with propagation metadata', () => {
            const satelliteId = 'test-satellite-123';
            
            // Create mock orbit data with propagation metadata
            const mockOrbitData = {
                points: Array.from({ length: 180 }, (_, i) => ({
                    position: [7000 + i, 0, 0],
                    velocity: [0, 7.5, 0],
                    time: i * 20
                })),
                maxPeriods: 1,
                duration: 3600,
                pointsPerPeriod: 180,
                requestedPeriods: 1,
                pointCount: 180,
                partial: false,
                timestamp: Date.now(),
                centralBodyNaifId: 399,
                hash: 'test-hash-retrieval'
            };
            
            // Store orbit data in cache
            cacheManager.setCachedOrbit(satelliteId, mockOrbitData);
            
            // Retrieve orbit data (simulating debug window access)
            const retrievedData = cacheManager.getCachedOrbit(satelliteId);
            
            // Verify data retrieval
            expect(retrievedData).toBeDefined();
            expect(retrievedData.points.length).toBe(180);
            expect(retrievedData.duration).toBe(3600);
            expect(retrievedData.pointsPerPeriod).toBe(180);
            expect(retrievedData.requestedPeriods).toBe(1);
            expect(retrievedData.pointCount).toBe(180);
            expect(retrievedData.partial).toBe(false);
            expect(retrievedData.centralBodyNaifId).toBe(399);
            expect(retrievedData.maxPeriods).toBe(1);
            
            console.log('✓ Debug window can access complete orbit data');
            console.log(`   Retrieved: Duration=${retrievedData.duration}s, Points=${retrievedData.pointCount}, Periods=${retrievedData.maxPeriods}`);
        });
        
        it('should handle missing orbit data gracefully', () => {
            const nonExistentSatelliteId = 'non-existent-satellite';
            
            // Try to retrieve non-existent orbit data
            const retrievedData = cacheManager.getCachedOrbit(nonExistentSatelliteId);
            
            // Should return undefined for non-existent data
            expect(retrievedData).toBeUndefined();
            
            console.log('✓ Gracefully handles missing orbit data');
        });
        
        it('should remove cached orbit data correctly', () => {
            const satelliteId = 'test-satellite-remove';
            const mockOrbitData = {
                points: [{ position: [7000, 0, 0], velocity: [0, 7.5, 0], time: 0 }],
                duration: 100,
                pointCount: 1
            };
            
            // Store and verify it exists
            cacheManager.setCachedOrbit(satelliteId, mockOrbitData);
            expect(cacheManager.getCachedOrbit(satelliteId)).toBeDefined();
            
            // Remove and verify it's gone
            cacheManager.removeCachedOrbit(satelliteId);
            expect(cacheManager.getCachedOrbit(satelliteId)).toBeUndefined();
            
            console.log('✓ Cache removal works correctly');
        });
    });

    describe('Performance Metadata Calculations', () => {
        it('should provide data for calculating performance metrics', () => {
            const mockOrbitData = {
                duration: 5400, // 1.5 hours
                pointCount: 270,
                maxPeriods: 1.5,
                pointsPerPeriod: 180,
                timestamp: Date.now()
            };
            
            // Calculate metrics (simulating debug window calculations)
            const timeStepPerPoint = mockOrbitData.duration / mockOrbitData.pointCount;
            const actualPointsPerPeriod = mockOrbitData.pointCount / mockOrbitData.maxPeriods;
            const avgDurationPerPeriod = mockOrbitData.duration / mockOrbitData.maxPeriods;
            
            // Verify calculations
            expect(timeStepPerPoint).toBe(20); // 20 seconds per point
            expect(actualPointsPerPeriod).toBe(180); // 180 points per period
            expect(avgDurationPerPeriod).toBe(3600); // 1 hour per period
            
            console.log('✓ Performance metrics calculated correctly');
            console.log(`   Time step: ${timeStepPerPoint}s/point`);
            console.log(`   Points/period: ${actualPointsPerPeriod}`);
            console.log(`   Period duration: ${avgDurationPerPeriod}s`);
        });
    });

    describe('SOI Transition Detection Logic', () => {
        it('should provide data structure for SOI transition detection', () => {
            // Create mock orbit data with SOI transitions
            const mockPoints = [
                { position: [7000, 0, 0], velocity: [0, 7.5, 0], time: 0, centralBodyId: 399 },
                { position: [8000, 0, 0], velocity: [0, 7.5, 0], time: 100, centralBodyId: 399 },
                { position: [50000, 0, 0], velocity: [0, 5.0, 0], time: 200, centralBodyId: 301 }, // Moon SOI
                { position: [60000, 0, 0], velocity: [0, 4.5, 0], time: 300, centralBodyId: 301 },
                { position: [70000, 0, 0], velocity: [0, 7.0, 0], time: 400, centralBodyId: 399 } // Back to Earth
            ];
            
            const mockOrbitData = {
                points: mockPoints,
                duration: 400,
                pointCount: 5,
                maxPeriods: 1,
                centralBodyNaifId: 399
            };
            
            // Simulate SOI transition detection (from debug window logic)
            const soiTransitions = [];
            let lastBodyId = null;
            
            for (let i = 0; i < mockOrbitData.points.length; i++) {
                const point = mockOrbitData.points[i];
                if (lastBodyId !== null && point.centralBodyId !== lastBodyId) {
                    soiTransitions.push({
                        index: i,
                        time: point.time,
                        fromBody: lastBodyId,
                        toBody: point.centralBodyId,
                        isEntry: point.isSOIEntry || false,
                        isExit: point.isSOIExit || false
                    });
                }
                lastBodyId = point.centralBodyId;
            }
            
            // Verify SOI transitions detected
            expect(soiTransitions.length).toBe(2);
            expect(soiTransitions[0].fromBody).toBe(399); // Earth
            expect(soiTransitions[0].toBody).toBe(301);   // Moon
            expect(soiTransitions[0].time).toBe(200);
            expect(soiTransitions[0].index).toBe(2);
            expect(soiTransitions[1].fromBody).toBe(301); // Moon
            expect(soiTransitions[1].toBody).toBe(399);   // Earth
            expect(soiTransitions[1].time).toBe(400);
            expect(soiTransitions[1].index).toBe(4);
            
            console.log(`✓ Detected ${soiTransitions.length} SOI transitions`);
            console.log(`   Earth→Moon at t=${soiTransitions[0].time}s (index ${soiTransitions[0].index})`);
            console.log(`   Moon→Earth at t=${soiTransitions[1].time}s (index ${soiTransitions[1].index})`);
        });
    });

    describe('Cache Statistics', () => {
        it('should provide cache statistics for debugging', () => {
            // Add some test data
            cacheManager.setCachedOrbit('sat1', { points: new Array(100), pointCount: 100 });
            cacheManager.setCachedOrbit('sat2', { points: new Array(200), pointCount: 200, partial: true });
            cacheManager.setCachedOrbit('sat3', { points: new Array(150), pointCount: 150 });
            
            const stats = cacheManager.getStats();
            const cachedIds = cacheManager.getCachedSatelliteIds();
            
            expect(stats.totalCached).toBe(3);
            expect(stats.cacheEntries).toHaveLength(3);
            expect(cachedIds).toEqual(['sat1', 'sat2', 'sat3']);
            
            // Verify individual entries
            const sat2Entry = stats.cacheEntries.find(entry => entry.satelliteId === 'sat2');
            expect(sat2Entry.pointCount).toBe(200);
            expect(sat2Entry.isPartial).toBe(true);
            
            console.log('✓ Cache statistics provide useful debugging information');
            console.log(`   Total cached: ${stats.totalCached} satellites`);
            console.log(`   Cached IDs: ${cachedIds.join(', ')}`);
        });
    });
});