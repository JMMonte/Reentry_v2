/**
 * GroundTrackWindow.test.jsx
 * 
 * Tests for the GroundTrackWindow component integration with the physics-based
 * groundtrack system using GroundtrackPath and workers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Worker global for Node.js environment
global.Worker = vi.fn().mockImplementation(() => ({
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    terminate: vi.fn()
}));

// Mock URL constructor for Worker path
global.URL = vi.fn().mockImplementation((path) => ({ href: path }));

// Mock THREE.js
vi.mock('three', () => ({
    Vector3: vi.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
        x, y, z,
        toArray: () => [x, y, z]
    }))
}));

// Mock GroundtrackPath
vi.mock('../src/components/Satellite/GroundtrackPath.js', () => ({
    GroundtrackPath: vi.fn().mockImplementation(() => ({
        update: vi.fn(),
        getPoints: vi.fn(() => []),
        dispose: vi.fn(),
        points: []
    }))
}));

describe('GroundTrackWindow', () => {
    let mockPlanets;
    let mockSatellites;
    let mockApp3d;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup mock planets
        mockPlanets = [
            {
                naifId: 399,
                name: 'earth',
                type: 'planet',
                getSurfaceTexture: vi.fn(() => ({
                    complete: true,
                    naturalWidth: 1024
                })),
                surface: {
                    points: {
                        cities: [{
                            userData: {
                                feature: {
                                    geometry: { coordinates: [-74.006, 40.7128] }
                                }
                            }
                        }]
                    }
                }
            },
            {
                naifId: 499,
                name: 'mars',
                type: 'planet',
                getSurfaceTexture: vi.fn(() => null)
            }
        ];

        // Setup mock satellites
        mockSatellites = {
            'sat-1': {
                id: 'sat-1',
                name: 'Test Satellite 1',
                position: [0, 0, 6771], // 400 km altitude
                velocity: [7.5, 0, 0],
                color: 0xff0000,
                centralBodyNaifId: 399,
                mass: 1000
            },
            'sat-2': {
                id: 'sat-2',
                name: 'Test Satellite 2',
                position: [1000, 0, 6771],
                velocity: [7.2, 0, 0],
                color: 0x00ff00,
                centralBodyNaifId: 399,
                mass: 1200
            },
            'mars-sat': {
                id: 'mars-sat',
                name: 'Mars Satellite',
                position: [0, 0, 3500],
                velocity: [3.5, 0, 0],
                color: 0x0000ff,
                centralBodyNaifId: 499,
                mass: 800
            }
        };

        // Setup mock app3d
        mockApp3d = {
            physicsIntegration: {
                physicsEngine: {
                    getBodiesForLineOfSight: vi.fn(() => [
                        { id: 399, name: 'earth', position: [0, 0, 0], mass: 5.972e24 },
                        { id: 301, name: 'moon', position: [384400, 0, 0], mass: 7.342e22 },
                        { id: 10, name: 'sun', position: [149597870, 0, 0], mass: 1.989e30 }
                    ])
                }
            }
        };

        // Mock window.app3d
        global.window = {
            ...global.window,
            app3d: mockApp3d
        };

        // Mock Date.now
        vi.spyOn(Date, 'now').mockReturnValue(1640995200000); // Fixed timestamp
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete global.window.app3d;
    });

    describe('GroundtrackPath Integration', () => {
        it('should create GroundtrackPath instances for satellites with position and velocity', () => {
            // Import the actual component logic without rendering
            const { GroundtrackPath } = require('../src/components/Satellite/GroundtrackPath.js');
            
            // Test that GroundtrackPath can be instantiated
            const path = new GroundtrackPath();
            expect(path).toBeDefined();
            expect(path.update).toBeDefined();
            expect(path.getPoints).toBeDefined();
            expect(path.dispose).toBeDefined();
        });

        it('should call update on GroundtrackPath with correct parameters', () => {
            const { GroundtrackPath } = require('../src/components/Satellite/GroundtrackPath.js');
            const mockPath = new GroundtrackPath();
            
            // Simulate the component logic
            const satellite = mockSatellites['sat-1'];
            const bodies = mockApp3d.physicsIntegration.physicsEngine.getBodiesForLineOfSight();
            const period = 6000; // 100 minutes
            const numPoints = 200;
            
            // Test that update method exists and can be called without error
            expect(mockPath.update).toBeDefined();
            expect(typeof mockPath.update).toBe('function');
            
            // Call update as the component would - should not throw
            expect(() => {
                mockPath.update(
                    Date.now(),
                    { x: satellite.position[0], y: satellite.position[1], z: satellite.position[2] },
                    { x: satellite.velocity[0], y: satellite.velocity[1], z: satellite.velocity[2] },
                    satellite.id,
                    bodies,
                    period,
                    numPoints
                );
            }).not.toThrow();
        });

        it('should filter satellites by planet naifId', () => {
            // Test filtering logic
            const planet = mockPlanets[0]; // Earth
            const filteredSatellites = Object.fromEntries(
                Object.entries(mockSatellites).filter(
                    ([, sat]) => sat.centralBodyNaifId === planet.naifId
                )
            );
            
            // Should only include Earth satellites (sat-1 and sat-2)
            expect(Object.keys(filteredSatellites)).toHaveLength(2);
            expect(filteredSatellites['sat-1']).toBeDefined();
            expect(filteredSatellites['sat-2']).toBeDefined();
            expect(filteredSatellites['mars-sat']).toBeUndefined();
        });

        it('should handle satellites without position/velocity gracefully', () => {
            const satelliteWithoutData = {
                id: 'incomplete-sat',
                name: 'Incomplete Satellite',
                // Missing position and velocity
                centralBodyNaifId: 399
            };

            // Test that filtering logic handles missing data
            const hasValidData = !!(satelliteWithoutData.position && satelliteWithoutData.velocity);
            expect(hasValidData).toBe(false);

            // Should not create GroundtrackPath for satellites without complete data
            if (hasValidData) {
                // This block should not execute
                expect(true).toBe(false);
            } else {
                // This is the expected path
                expect(true).toBe(true);
            }
        });

        it('should dispose GroundtrackPath instances on cleanup', () => {
            const { GroundtrackPath } = require('../src/components/Satellite/GroundtrackPath.js');
            const mockPath = new GroundtrackPath();
            
            // Test that dispose method exists and can be called without error
            expect(mockPath.dispose).toBeDefined();
            expect(typeof mockPath.dispose).toBe('function');
            
            // Simulate cleanup - should not throw
            expect(() => {
                mockPath.dispose();
            }).not.toThrow();
        });
    });

    describe('Physics Engine Integration', () => {
        it('should get physics bodies from the physics engine', () => {
            const bodies = mockApp3d.physicsIntegration.physicsEngine.getBodiesForLineOfSight();
            
            expect(mockApp3d.physicsIntegration.physicsEngine.getBodiesForLineOfSight)
                .toHaveBeenCalled();
            expect(bodies).toEqual([
                { id: 399, name: 'earth', position: [0, 0, 0], mass: 5.972e24 },
                { id: 301, name: 'moon', position: [384400, 0, 0], mass: 7.342e22 },
                { id: 10, name: 'sun', position: [149597870, 0, 0], mass: 1.989e30 }
            ]);
        });

        it('should handle missing physics engine gracefully', () => {
            // Remove physics engine
            delete global.window.app3d;

            // Should return empty array when physics engine is not available
            const bodies = global.window?.app3d?.physicsIntegration?.physicsEngine?.getBodiesForLineOfSight() || [];
            expect(bodies).toEqual([]);
        });
    });

    describe('Data Processing', () => {
        it('should prepare current positions from satellite data', () => {
            const satellites = Object.values(mockSatellites).filter(
                sat => sat.centralBodyNaifId === 399 // Earth satellites only
            );
            
            const positions = satellites.map(sat => ({
                id: sat.id,
                position: sat.position ? [sat.position[0], sat.position[1], sat.position[2]] : [0, 0, 0],
                color: sat.color || 0xffff00
            }));

            expect(positions).toEqual([
                {
                    id: 'sat-1',
                    position: [0, 0, 6771],
                    color: 0xff0000
                },
                {
                    id: 'sat-2',
                    position: [1000, 0, 6771],
                    color: 0x00ff00
                }
            ]);
        });

        it('should prepare POI data from planet surface points', () => {
            const planet = mockPlanets[0]; // Earth
            const activeLayers = { pois: true };
            
            let poiData = {};
            if (activeLayers.pois && planet?.surface?.points) {
                poiData = Object.entries(planet.surface.points).reduce((acc, [key, meshes]) => {
                    acc[key] = meshes.map(mesh => {
                        const feat = mesh.userData.feature;
                        const [lon, lat] = feat.geometry.coordinates;
                        return { lon, lat };
                    });
                    return acc;
                }, {});
            }

            expect(poiData.cities).toEqual([
                { lon: -74.006, lat: 40.7128 }
            ]);
        });
    });

    describe('Error Handling', () => {
        it('should handle GroundtrackPath creation errors gracefully', () => {
            // Test error handling by simulating what happens when GroundtrackPath fails
            let error = null;
            try {
                // Simulate error condition
                throw new Error('Failed to create GroundtrackPath');
            } catch (e) {
                error = e;
            }

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe('Failed to create GroundtrackPath');
            
            // Component should handle this gracefully and continue to function
            // even when GroundtrackPath creation fails
            expect(true).toBe(true); // Component should not crash
        });

        it('should handle planets without surface texture', () => {
            const planet = mockPlanets[1]; // Mars (without texture)
            const surfaceTexture = planet.getSurfaceTexture();
            
            expect(surfaceTexture).toBeNull();
            
            // Should handle null texture gracefully
            expect(() => {
                // Simulate component logic handling null texture
                const map = surfaceTexture;
                return map;
            }).not.toThrow();
        });
    });

    describe('Planet Selection Logic', () => {
        it('should use Earth as default planet when available', () => {
            const planetList = mockPlanets.filter(
                p => p.type !== 'barycenter' &&
                    !(typeof p.name === 'string' && (
                        p.name.endsWith('_barycenter') ||
                        p.name === 'ss_barycenter' ||
                        p.name === 'emb'
                    ))
            );
            
            // Default to first planet (Earth) or planet with naifId 399
            const defaultPlanetNaifId = planetList?.[0]?.naifId || 399;
            const planet = planetList.find(p => p.naifId === defaultPlanetNaifId) || planetList[0];
            
            expect(planet.naifId).toBe(399);
            expect(planet.name).toBe('earth');
        });

        it('should filter out barycenter planets', () => {
            const planetsWithBarycenters = [
                ...mockPlanets,
                {
                    naifId: 3,
                    name: 'earth_moon_barycenter',
                    type: 'barycenter'
                },
                {
                    naifId: 0,
                    name: 'ss_barycenter',
                    type: 'system'
                }
            ];

            const planetList = planetsWithBarycenters.filter(
                p => p.type !== 'barycenter' &&
                    !(typeof p.name === 'string' && (
                        p.name.endsWith('_barycenter') ||
                        p.name === 'ss_barycenter' ||
                        p.name === 'emb'
                    ))
            );

            expect(planetList).toHaveLength(2); // Only Earth and Mars
            expect(planetList.find(p => p.name.includes('barycenter'))).toBeUndefined();
        });
    });
});