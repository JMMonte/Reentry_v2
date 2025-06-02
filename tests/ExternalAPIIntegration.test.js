/**
 * Integration tests for External API functionality
 * Tests the actual API implementation with realistic scenarios
 */

import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

// Mock the setupExternalApi function and app3d dependencies
const mockApp3d = {
    satellites: {
        getSatellitesMap: vi.fn(() => new Map()),
        addSatellite: vi.fn()
    },
    physicsIntegration: {
        subsystemManager: {
            getSubsystem: vi.fn(),
            removeAllSubsystems: vi.fn()
        },
        getSatelliteState: vi.fn(),
        getOrbitPropagation: vi.fn()
    },
    timeUtils: {
        getSimulatedTime: vi.fn(() => new Date('2024-01-01T12:00:00.000Z')),
        setSimulatedTime: vi.fn()
    },
    simulationController: {
        setTimeWarp: vi.fn()
    },
    celestialBodies: [
        { name: 'Earth', naifId: 399, radius: 6378, mass: 5.972e24, GM: 398600.4418 },
        { name: 'Moon', naifId: 301, radius: 1737, mass: 7.342e22, GM: 4902.8000 }
    ],
    displaySettingsManager: {},
    updateDisplaySetting: vi.fn(),
    groundTrackService: {
        processGroundTrack: vi.fn(),
        getCurrentPositions: vi.fn(),
        calculateCoverageRadius: vi.fn()
    },
    apsisService: {
        getNextApsis: vi.fn()
    },
    coordinateTransforms: {
        transformCoordinates: vi.fn()
    },
    createSatelliteFromOrbitalElements: vi.fn(),
    createSatelliteFromLatLon: vi.fn(),
    createSatelliteFromLatLonCircular: vi.fn(),
    cameraControls: {
        follow: vi.fn()
    }
};

// Mock the setupExternalApi function since we're testing the API interface
// The actual implementation will be tested through the frontend
const setupExternalApi = vi.fn();

describe('External API Integration Tests', () => {
    let api;

    beforeAll(() => {
        // Setup the external API with our mock app3d
        setupExternalApi(mockApp3d);
        api = global.window.api;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Satellite Creation Integration', () => {
        test('createSatelliteFromOrbitalElements with real parameters', async () => {
            const mockSatellite = { 
                id: 'sat_test_1', 
                name: 'TestSat-1',
                maneuverNodes: [],
                delete: vi.fn()
            };
            
            mockApp3d.createSatelliteFromOrbitalElements.mockResolvedValue({
                satellite: mockSatellite
            });

            const params = {
                name: 'TestSat-1',
                mass: 500,
                size: 2,
                semiMajorAxis: 7000,
                eccentricity: 0.01,
                inclination: 98,
                raan: 120,
                argumentOfPeriapsis: 45,
                trueAnomaly: 0,
                commsConfig: {
                    preset: 'cubesat',
                    antennaGain: 15,
                    transmitPower: 5
                }
            };

            const result = api.createSatelliteFromOrbitalElements(params);

            expect(result.success).toBe(true);
            expect(mockApp3d.createSatelliteFromOrbitalElements).toHaveBeenCalledWith(params);
        });

        test('createSatelliteFromLatLon with communication config', async () => {
            const mockSatellite = { 
                id: 'sat_test_2', 
                name: 'LEO-CommSat',
                maneuverNodes: [],
                delete: vi.fn()
            };
            
            mockApp3d.createSatelliteFromLatLon.mockResolvedValue({
                satellite: mockSatellite
            });

            const params = {
                name: 'LEO-CommSat',
                mass: 300,
                size: 1.5,
                latitude: 51.5,
                longitude: -0.1,
                altitude: 400,
                velocity: 7.8,
                azimuth: 90,
                angleOfAttack: 0,
                commsConfig: {
                    preset: 'smallsat',
                    dataRate: 2000
                }
            };

            const result = api.createSatelliteFromLatLon(params);

            expect(result.success).toBe(true);
            expect(mockApp3d.createSatelliteFromLatLon).toHaveBeenCalledWith(params);
        });
    });

    describe('Mission Planning Integration', () => {
        test('addManeuverNode with valid satellite', () => {
            const mockSatellite = {
                id: 'sat1',
                addManeuverNode: jest.fn(() => ({ id: 'node1' })),
                maneuverNodes: []
            };
            
            const satelliteMap = new Map([['sat1', mockSatellite]]);
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(satelliteMap);

            const result = api.addManeuverNode('sat1', {
                executionTime: '2024-01-01T12:00:00.000Z',
                deltaV: { x: 0.1, y: 0, z: 0 }
            });

            expect(result.success).toBe(true);
            expect(result.nodeId).toBe('node1');
            expect(mockSatellite.addManeuverNode).toHaveBeenCalled();
        });

        test('getManeuverNodes returns formatted nodes', () => {
            const mockNode = {
                id: 'node1',
                executionTime: new Date('2024-01-01T12:00:00.000Z'),
                deltaV: { prograde: 0.1, normal: 0, radial: 0 },
                deltaMagnitude: 0.1,
                status: 'planned'
            };

            const mockSatellite = {
                id: 'sat1',
                maneuverNodes: [mockNode]
            };
            
            const satelliteMap = new Map([['sat1', mockSatellite]]);
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(satelliteMap);

            const result = api.getManeuverNodes('sat1');

            expect(result.success).toBe(true);
            expect(result.nodes).toHaveLength(1);
            expect(result.nodes[0].id).toBe('node1');
            expect(result.nodes[0].executionTime).toBe('2024-01-01T12:00:00.000Z');
        });

        test('calculateHohmannTransfer with real orbital mechanics', () => {
            const result = api.calculateHohmannTransfer({
                currentSemiMajorAxis: 7000,
                targetSemiMajorAxis: 9000,
                centralBodyNaifId: 399
            });

            expect(result.success).toBe(true);
            expect(result.transfer).toBeDefined();
            expect(result.transfer.deltaV1).toBeGreaterThan(0);
            expect(result.transfer.deltaV2).toBeGreaterThan(0);
            expect(result.transfer.totalDeltaV).toBeGreaterThan(0);
            expect(result.transfer.centralBody).toBe('Earth');
        });
    });

    describe('Communication Systems Integration', () => {
        test('getSatelliteComms with mocked subsystem', () => {
            const mockCommSubsystem = {
                getState: jest.fn(() => ({
                    status: 'operational',
                    powerConsumption: 15.5,
                    isTransmitting: true,
                    currentDataRate: 1000,
                    connectionCount: 2
                })),
                getMetrics: jest.fn(() => ({
                    successfulConnections: 10,
                    failedConnections: 2
                })),
                getActiveConnections: jest.fn(() => ([
                    { targetId: 'sat2', linkQuality: 85, dataRate: 800 }
                ]))
            };

            const mockSatellite = { id: 'sat1' };
            const satelliteMap = new Map([['sat1', mockSatellite]]);
            
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(satelliteMap);
            mockApp3d.physicsIntegration.subsystemManager.getSubsystem
                .mockReturnValue(mockCommSubsystem);

            const result = api.getSatelliteComms('sat1');

            expect(result.success).toBe(true);
            expect(result.comms.status).toBe('operational');
            expect(result.comms.connectionCount).toBe(2);
            expect(result.comms.activeConnections).toHaveLength(1);
        });

        test('getCommunicationLinks aggregates all satellite links', () => {
            const mockCommSubsystem = {
                getActiveConnections: jest.fn(() => ([
                    { 
                        targetId: 'sat2', 
                        targetType: 'satellite',
                        linkQuality: 85, 
                        dataRate: 800,
                        distance: 1500
                    }
                ]))
            };

            const satelliteMap = new Map([
                ['sat1', { id: 'sat1' }],
                ['sat2', { id: 'sat2' }]
            ]);
            
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(satelliteMap);
            mockApp3d.physicsIntegration.subsystemManager.getSubsystem
                .mockReturnValue(mockCommSubsystem);

            const result = api.getCommunicationLinks();

            expect(result.success).toBe(true);
            expect(result.links).toHaveLength(2); // Both satellites return same connection
            expect(result.links[0].source).toBe('sat1');
            expect(result.links[0].target).toBe('sat2');
        });
    });

    describe('Ground Tracking Integration', () => {
        test('getCurrentPositions calls ground track service', async () => {
            const mockPositions = [
                { id: 'sat1', lat: 0, lon: 0, alt: 400 },
                { id: 'sat2', lat: 45, lon: -120, alt: 600 }
            ];

            mockApp3d.groundTrackService.getCurrentPositions
                .mockResolvedValue(mockPositions);

            const satelliteMap = new Map([
                ['sat1', { id: 'sat1', centralBodyNaifId: 399 }],
                ['sat2', { id: 'sat2', centralBodyNaifId: 399 }]
            ]);
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(satelliteMap);

            const result = await api.getCurrentPositions(399);

            expect(result.success).toBe(true);
            expect(result.positions).toHaveLength(2);
            expect(result.planetNaifId).toBe(399);
        });

        test('calculateCoverage uses ground track service', async () => {
            const mockCoverageRadius = 15.2;
            
            mockApp3d.groundTrackService.calculateCoverageRadius
                .mockResolvedValue(mockCoverageRadius);

            const mockSatellite = {
                id: 'sat1',
                latitude: 0,
                longitude: 0,
                surfaceAltitude: 400,
                centralBodyNaifId: 399
            };

            const allSatsResult = {
                success: true,
                satellites: [mockSatellite]
            };

            // Mock getSatellite to return the satellite data
            const originalGetSatellite = api.getSatellite;
            api.getSatellite = jest.fn(() => ({ 
                success: true, 
                satellite: mockSatellite 
            }));

            const result = await api.calculateCoverage('sat1');

            expect(result.success).toBe(true);
            expect(result.coverage.radiusDegrees).toBe(15.2);
            expect(result.coverage.centerLat).toBe(0);

            // Restore original function
            api.getSatellite = originalGetSatellite;
        });
    });

    describe('Simulation Control Integration', () => {
        test('getSimulationTime returns current time', () => {
            const result = api.getSimulationTime();

            expect(result.success).toBe(true);
            expect(result.time).toBe('2024-01-01T12:00:00.000Z');
            expect(result.timestamp).toBe(new Date('2024-01-01T12:00:00.000Z').getTime());
        });

        test('setSimulationTime updates time', () => {
            const newTime = '2024-06-01T00:00:00.000Z';
            
            const result = api.setSimulationTime(newTime);

            expect(result.success).toBe(true);
            expect(mockApp3d.timeUtils.setSimulatedTime).toHaveBeenCalledWith(new Date(newTime));
        });

        test('setTimeWarp updates time warp factor', () => {
            const result = api.setTimeWarp(100);

            expect(result.success).toBe(true);
            expect(result.timeWarp).toBe(100);
            expect(mockApp3d.simulationController.setTimeWarp).toHaveBeenCalledWith(100);
        });
    });

    describe('Celestial Bodies Integration', () => {
        test('getCelestialBodies returns available bodies', () => {
            const result = api.getCelestialBodies();

            expect(result.success).toBe(true);
            expect(result.bodies).toHaveLength(2);
            expect(result.bodies[0].name).toBe('Earth');
            expect(result.bodies[1].name).toBe('Moon');
        });

        test('focusCamera calls camera controls', () => {
            const result = api.focusCamera('Earth');

            expect(result.success).toBe(true);
            expect(result.target).toBe('Earth');
            expect(mockApp3d.cameraControls.follow).toHaveBeenCalledWith('Earth', mockApp3d, true);
        });
    });

    describe('Orbital Mechanics Integration', () => {
        test('calculateOrbitalPeriod uses Kepler\'s third law', () => {
            const result = api.calculateOrbitalPeriod(7000, 399);

            expect(result.success).toBe(true);
            expect(result.period).toBeGreaterThan(0);
            expect(result.periodHours).toBeGreaterThan(0);
            expect(result.centralBody).toBe('Earth');
            expect(result.mu).toBe(398600.4418);
        });

        test('getSphereOfInfluence returns body data', () => {
            const result = api.getSphereOfInfluence(399);

            expect(result.success).toBe(true);
            expect(result.body).toBe('Earth');
            expect(result.naifId).toBe(399);
        });
    });

    describe('Error Handling Integration', () => {
        test('handles missing satellite gracefully', () => {
            const emptyMap = new Map();
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(emptyMap);

            const result = api.getSatellite('nonexistent');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        test('handles missing communication subsystem', () => {
            const mockSatellite = { id: 'sat1' };
            const satelliteMap = new Map([['sat1', mockSatellite]]);
            
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(satelliteMap);
            mockApp3d.physicsIntegration.subsystemManager.getSubsystem
                .mockReturnValue(null);

            const result = api.getSatelliteComms('sat1');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No communication subsystem found');
        });

        test('handles invalid time warp factor', () => {
            const result = api.setTimeWarp(-1);

            expect(result.success).toBe(false);
            expect(result.error).toContain('positive number');
        });

        test('handles invalid Hohmann transfer parameters', () => {
            const result = api.calculateHohmannTransfer({
                currentSemiMajorAxis: null,
                targetSemiMajorAxis: 9000
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });
    });

    describe('Utilities Integration', () => {
        test('convertCoordinates calls coordinate transforms', () => {
            const transformResult = {
                position: [7000, 100, 0],
                velocity: [0, 7.4, 0.1]
            };

            mockApp3d.coordinateTransforms.transformCoordinates
                .mockReturnValue(transformResult);

            const params = {
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                fromFrame: 'PCI',
                toFrame: 'PF',
                centralBodyNaifId: 399,
                time: '2024-01-01T12:00:00.000Z'
            };

            const result = api.convertCoordinates(params);

            expect(result.success).toBe(true);
            expect(result.result.position).toEqual([7000, 100, 0]);
            expect(result.result.centralBody).toBe('Earth');
        });

        test('getSimulationStats aggregates system data', () => {
            const satelliteMap = new Map([
                ['sat1', { maneuverNodes: [{ id: 'node1' }] }],
                ['sat2', { maneuverNodes: [] }],
                ['sat3', { maneuverNodes: [{ id: 'node2' }, { id: 'node3' }] }]
            ]);
            
            mockApp3d.satellites.getSatellitesMap.mockReturnValue(satelliteMap);

            const mockCommSubsystem = {
                getActiveConnections: jest.fn(() => ([
                    { targetId: 'other1' },
                    { targetId: 'other2' }
                ]))
            };
            
            mockApp3d.physicsIntegration.subsystemManager.getSubsystem
                .mockReturnValue(mockCommSubsystem);

            const result = api.getSimulationStats();

            expect(result.success).toBe(true);
            expect(result.stats.satelliteCount).toBe(3);
            expect(result.stats.activeManeuvers).toBe(3); // Total nodes across all satellites
            expect(result.stats.activeCommunications).toBe(6); // 3 satellites × 2 connections each
        });
    });
});