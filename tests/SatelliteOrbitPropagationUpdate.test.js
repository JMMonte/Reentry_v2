import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SatelliteOrbitManager } from '../src/managers/SatelliteOrbitManager.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';

describe('Satellite Orbit Propagation Updates', () => {
    let app, physicsEngine, orbitManager;
    let mockDisplaySettings;
    
    beforeEach(async () => {
        // Mock display settings
        mockDisplaySettings = {
            getSetting: vi.fn().mockImplementation((key) => {
                switch (key) {
                    case 'showOrbits': return true;
                    case 'orbitPredictionInterval': return 1;
                    case 'orbitPointsPerPeriod': return 180;
                    default: return null;
                }
            }),
            addListener: vi.fn(),
            removeListener: vi.fn()
        };
        
        // Mock app
        app = {
            displaySettingsManager: mockDisplaySettings,
            physicsIntegration: null
        };
        
        // Initialize physics engine
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
        
        app.physicsIntegration = { physicsEngine };
        
        // Initialize orbit manager
        orbitManager = new SatelliteOrbitManager(app);
        orbitManager.physicsEngine = physicsEngine;
        orbitManager.initialize();
    });
    
    afterEach(() => {
        if (orbitManager) {
            orbitManager.dispose();
        }
        if (physicsEngine) {
            physicsEngine.cleanup();
        }
    });

    describe('Simulation Properties Changes', () => {
        it('should detect when periods change and trigger recalculation', () => {
            // Add a test satellite
            const satelliteId = physicsEngine.addSatellite({
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 1000,
                centralBodyNaifId: 399
            });
            
            const satellite = physicsEngine.satellites.get(satelliteId);
            
            // Set initial properties
            satellite.orbitSimProperties = {
                periods: 2,
                pointsPerPeriod: 180
            };
            
            // Spy on orbit manager methods
            const updateSpy = vi.spyOn(orbitManager, 'updateSatelliteOrbit');
            const removeCacheSpy = vi.spyOn(orbitManager.orbitCacheManager, 'removeCachedOrbit');
            
            // Simulate property change event - reducing periods (should force recalculation)
            const event = new CustomEvent('satelliteSimPropertiesChanged', {
                detail: {
                    satelliteId,
                    property: 'periods',
                    value: 1,
                    previousValue: 2,
                    allProperties: { periods: 1, pointsPerPeriod: 180 },
                    needsRecalculation: true,
                    forceRecalculation: true
                }
            });
            
            document.dispatchEvent(event);
            
            // Verify the response
            expect(satellite.orbitSimProperties.periods).toBe(1);
            expect(removeCacheSpy).toHaveBeenCalledWith(satelliteId);
            expect(updateSpy).toHaveBeenCalledWith(satelliteId);
            
            console.log('✓ Periods change triggers forced recalculation');
        });
        
        it('should handle points per period changes correctly', () => {
            // Add a test satellite
            const satelliteId = physicsEngine.addSatellite({
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 1000,
                centralBodyNaifId: 399
            });
            
            const satellite = physicsEngine.satellites.get(satelliteId);
            
            // Set initial properties
            satellite.orbitSimProperties = {
                periods: 1,
                pointsPerPeriod: 180
            };
            
            // Spy on orbit manager methods
            const updateSpy = vi.spyOn(orbitManager, 'updateSatelliteOrbit');
            const removeCacheSpy = vi.spyOn(orbitManager.orbitCacheManager, 'removeCachedOrbit');
            
            // Simulate significant resolution change
            const event = new CustomEvent('satelliteSimPropertiesChanged', {
                detail: {
                    satelliteId,
                    property: 'pointsPerPeriod',
                    value: 360,
                    previousValue: 180,
                    allProperties: { periods: 1, pointsPerPeriod: 360 },
                    needsRecalculation: true,
                    forceRecalculation: true // Large change in resolution
                }
            });
            
            document.dispatchEvent(event);
            
            // Verify the response
            expect(satellite.orbitSimProperties.pointsPerPeriod).toBe(360);
            expect(removeCacheSpy).toHaveBeenCalledWith(satelliteId);
            expect(updateSpy).toHaveBeenCalledWith(satelliteId);
            
            console.log('✓ Points per period change triggers forced recalculation');
        });
        
        it('should truncate orbit points when reducing periods', () => {
            // Test the truncation function directly
            const mockPoints = Array.from({ length: 360 }, (_, i) => ({
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                time: i * 10
            }));
            
            // Simulate reducing from 2 periods to 1 period
            const truncatedPoints = orbitManager._truncateOrbitToRequestedPeriods(
                mockPoints, 
                1, // requested periods
                2  // cached periods
            );
            
            // Should keep approximately half the points
            expect(truncatedPoints.length).toBe(180);
            expect(truncatedPoints.length).toBeLessThan(mockPoints.length);
            
            // Verify we kept the first points (chronologically)
            expect(truncatedPoints[0]).toEqual(mockPoints[0]);
            expect(truncatedPoints[truncatedPoints.length - 1]).toEqual(mockPoints[179]);
            
            console.log(`✓ Orbit truncation: ${mockPoints.length} → ${truncatedPoints.length} points`);
        });
    });
    
    describe('Event Dispatching', () => {
        it('should dispatch calculation events appropriately', (done) => {
            let startEventReceived = false;
            let completeEventReceived = false;
            
            // Listen for events
            const handleCalculationStarted = (e) => {
                expect(e.detail.satelliteId).toBeDefined();
                startEventReceived = true;
            };
            
            const handleOrbitUpdated = (e) => {
                expect(e.detail.satelliteId).toBeDefined();
                expect(e.detail.pointCount).toBeGreaterThan(0);
                completeEventReceived = true;
                
                // Check both events were received
                if (startEventReceived && completeEventReceived) {
                    document.removeEventListener('orbitCalculationStarted', handleCalculationStarted);
                    document.removeEventListener('orbitUpdated', handleOrbitUpdated);
                    console.log('✓ Both calculation events dispatched correctly');
                    done();
                }
            };
            
            document.addEventListener('orbitCalculationStarted', handleCalculationStarted);
            document.addEventListener('orbitUpdated', handleOrbitUpdated);
            
            // Add a satellite to trigger calculation
            const satelliteId = physicsEngine.addSatellite({
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 1000,
                centralBodyNaifId: 399
            });
            
            // Trigger orbit calculation
            orbitManager.updateSatelliteOrbit(satelliteId);
            
            // Set timeout to fail the test if events don't fire
            setTimeout(() => {
                if (!startEventReceived || !completeEventReceived) {
                    done(new Error('Events not received within timeout'));
                }
            }, 5000);
        });
    });
    
    describe('Performance Validation', () => {
        it('should handle rapid property changes efficiently', () => {
            // Add test satellite
            const satelliteId = physicsEngine.addSatellite({
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 1000,
                centralBodyNaifId: 399
            });
            
            const satellite = physicsEngine.satellites.get(satelliteId);
            satellite.orbitSimProperties = { periods: 1, pointsPerPeriod: 180 };
            
            // Spy on expensive operations
            const removeCacheSpy = vi.spyOn(orbitManager.orbitCacheManager, 'removeCachedOrbit');
            const updateSpy = vi.spyOn(orbitManager, 'updateSatelliteOrbit');
            
            const startTime = performance.now();
            
            // Simulate rapid changes
            for (let i = 1; i <= 5; i++) {
                const event = new CustomEvent('satelliteSimPropertiesChanged', {
                    detail: {
                        satelliteId,
                        property: 'periods',
                        value: i,
                        previousValue: i - 1,
                        allProperties: { periods: i, pointsPerPeriod: 180 },
                        needsRecalculation: true,
                        forceRecalculation: i < (i - 1) // Only force if reducing
                    }
                });
                document.dispatchEvent(event);
            }
            
            const endTime = performance.now();
            const processingTime = endTime - startTime;
            
            expect(processingTime).toBeLessThan(50); // Should be very fast
            expect(updateSpy).toHaveBeenCalledTimes(5);
            
            console.log(`✓ Rapid property changes processed in ${processingTime.toFixed(2)}ms`);
        });
    });
});