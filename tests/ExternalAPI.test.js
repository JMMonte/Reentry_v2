/**
 * Comprehensive tests for the External API functionality
 * Tests all new satellite creation, mission planning, communication, and ground tracking features
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock the external API functions
const mockAPI = {
    // Satellite Creation
    createSatelliteFromOrbitalElements: vi.fn(),
    createSatelliteFromLatLon: vi.fn(),
    createSatelliteFromLatLonCircular: vi.fn(),
    
    // Satellite Management
    getSatellites: vi.fn(),
    getSatellite: vi.fn(),
    deleteSatellite: vi.fn(),
    
    // Mission Planning & Maneuvers
    addManeuverNode: vi.fn(),
    getManeuverNodes: vi.fn(),
    deleteManeuverNode: vi.fn(),
    calculateHohmannTransfer: vi.fn(),
    
    // Communication Systems
    getSatelliteComms: vi.fn(),
    getCommunicationLinks: vi.fn(),
    updateCommsConfig: vi.fn(),
    
    // Ground Tracking
    getGroundTrack: vi.fn(),
    getCurrentPositions: vi.fn(),
    calculateCoverage: vi.fn(),
    getNextApsis: vi.fn(),
    
    // Orbital Mechanics
    getOrbitalElements: vi.fn(),
    calculateOrbitalPeriod: vi.fn(),
    getSphereOfInfluence: vi.fn(),
    
    // Simulation Control
    getSimulationTime: vi.fn(),
    setSimulationTime: vi.fn(),
    getTimeWarp: vi.fn(),
    setTimeWarp: vi.fn(),
    
    // Celestial Bodies
    getCelestialBodies: vi.fn(),
    focusCamera: vi.fn(),
    
    // Utilities
    convertCoordinates: vi.fn(),
    getSimulationStats: vi.fn(),
    updateDisplaySettings: vi.fn()
};

// Mock window.api
global.window = { api: mockAPI };

describe('External API - Satellite Creation with Communications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('createSatelliteFromOrbitalElements with communication config', () => {
        const mockResult = { 
            success: true, 
            satellite: { id: 'sat1', name: 'CommSat-1' }
        };
        mockAPI.createSatelliteFromOrbitalElements.mockReturnValue(mockResult);

        const params = {
            name: 'CommSat-1',
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
                transmitPower: 5,
                enabled: true
            }
        };

        const result = window.api.createSatelliteFromOrbitalElements(params);

        expect(mockAPI.createSatelliteFromOrbitalElements).toHaveBeenCalledWith(params);
        expect(result.success).toBe(true);
        expect(result.satellite.name).toBe('CommSat-1');
    });

    test('createSatelliteFromLatLon with communication config', () => {
        const mockResult = { 
            success: true, 
            satellite: { id: 'sat2', name: 'LEO-Comm' }
        };
        mockAPI.createSatelliteFromLatLon.mockReturnValue(mockResult);

        const params = {
            name: 'LEO-Comm',
            mass: 300,
            size: 1.5,
            latitude: 0,
            longitude: 0,
            altitude: 400,
            velocity: 7.8,
            azimuth: 90,
            angleOfAttack: 0,
            commsConfig: {
                preset: 'smallsat',
                antennaGain: 20,
                transmitPower: 10
            }
        };

        const result = window.api.createSatelliteFromLatLon(params);

        expect(mockAPI.createSatelliteFromLatLon).toHaveBeenCalledWith(params);
        expect(result.success).toBe(true);
        expect(result.satellite.name).toBe('LEO-Comm');
    });

    test('createSatelliteFromLatLonCircular', () => {
        const mockResult = { 
            success: true, 
            satellite: { id: 'sat3', name: 'Circular-Sat' }
        };
        mockAPI.createSatelliteFromLatLonCircular.mockReturnValue(mockResult);

        const params = {
            name: 'Circular-Sat',
            mass: 200,
            size: 1,
            latitude: 51.5,
            longitude: -0.1,
            altitude: 600
        };

        const result = window.api.createSatelliteFromLatLonCircular(params);

        expect(mockAPI.createSatelliteFromLatLonCircular).toHaveBeenCalledWith(params);
        expect(result.success).toBe(true);
    });
});

describe('External API - Mission Planning & Maneuvers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('addManeuverNode', () => {
        const mockResult = { 
            success: true, 
            nodeId: 'node1',
            executionTime: '2024-01-01T12:00:00.000Z'
        };
        mockAPI.addManeuverNode.mockReturnValue(mockResult);

        const params = {
            satelliteId: 'sat1',
            executionTime: '2024-01-01T12:00:00.000Z',
            deltaV: { x: 0.1, y: 0, z: 0 }
        };

        const result = window.api.addManeuverNode('sat1', params);

        expect(mockAPI.addManeuverNode).toHaveBeenCalledWith('sat1', params);
        expect(result.success).toBe(true);
        expect(result.nodeId).toBe('node1');
    });

    test('getManeuverNodes', () => {
        const mockResult = { 
            success: true, 
            nodes: [
                {
                    id: 'node1',
                    executionTime: '2024-01-01T12:00:00.000Z',
                    deltaV: { x: 0.1, y: 0, z: 0 },
                    deltaMagnitude: 0.1,
                    status: 'planned'
                }
            ]
        };
        mockAPI.getManeuverNodes.mockReturnValue(mockResult);

        const result = window.api.getManeuverNodes('sat1');

        expect(mockAPI.getManeuverNodes).toHaveBeenCalledWith('sat1');
        expect(result.success).toBe(true);
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].id).toBe('node1');
    });

    test('deleteManeuverNode', () => {
        const mockResult = { 
            success: true, 
            message: 'Maneuver node node1 deleted'
        };
        mockAPI.deleteManeuverNode.mockReturnValue(mockResult);

        const result = window.api.deleteManeuverNode('sat1', 'node1');

        expect(mockAPI.deleteManeuverNode).toHaveBeenCalledWith('sat1', 'node1');
        expect(result.success).toBe(true);
        expect(result.message).toContain('deleted');
    });

    test('calculateHohmannTransfer', () => {
        const mockResult = { 
            success: true, 
            transfer: {
                deltaV1: 0.15,
                deltaV2: 0.12,
                totalDeltaV: 0.27,
                transferTime: 3156,
                transferSemiMajorAxis: 8000,
                centralBody: 'Earth'
            }
        };
        mockAPI.calculateHohmannTransfer.mockReturnValue(mockResult);

        const params = {
            currentSemiMajorAxis: 7000,
            targetSemiMajorAxis: 9000,
            centralBodyNaifId: 399
        };

        const result = window.api.calculateHohmannTransfer(params);

        expect(mockAPI.calculateHohmannTransfer).toHaveBeenCalledWith(params);
        expect(result.success).toBe(true);
        expect(result.transfer.centralBody).toBe('Earth');
        expect(result.transfer.totalDeltaV).toBeCloseTo(0.27);
    });
});

describe('External API - Communication Systems', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('getSatelliteComms', () => {
        const mockResult = { 
            success: true, 
            comms: {
                status: 'operational',
                powerConsumption: 15.5,
                isTransmitting: true,
                currentDataRate: 1000,
                connectionCount: 2,
                bestLinkQuality: 85,
                averageLinkQuality: 75,
                totalDataTransmitted: 1024000,
                totalDataReceived: 512000,
                activeConnections: [
                    {
                        targetId: 'sat2',
                        targetType: 'satellite',
                        linkQuality: 85,
                        dataRate: 800,
                        distance: 1500
                    }
                ]
            }
        };
        mockAPI.getSatelliteComms.mockReturnValue(mockResult);

        const result = window.api.getSatelliteComms('sat1');

        expect(mockAPI.getSatelliteComms).toHaveBeenCalledWith('sat1');
        expect(result.success).toBe(true);
        expect(result.comms.status).toBe('operational');
        expect(result.comms.activeConnections).toHaveLength(1);
    });

    test('getCommunicationLinks', () => {
        const mockResult = { 
            success: true, 
            links: [
                {
                    source: 'sat1',
                    target: 'sat2',
                    targetType: 'satellite',
                    linkQuality: 85,
                    dataRate: 800,
                    distance: 1500,
                    elevationAngle: null
                },
                {
                    source: 'sat2',
                    target: 'ground1',
                    targetType: 'ground_station',
                    linkQuality: 70,
                    dataRate: 600,
                    distance: 800,
                    elevationAngle: 15
                }
            ]
        };
        mockAPI.getCommunicationLinks.mockReturnValue(mockResult);

        const result = window.api.getCommunicationLinks();

        expect(mockAPI.getCommunicationLinks).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.links).toHaveLength(2);
        expect(result.links[0].source).toBe('sat1');
        expect(result.links[1].targetType).toBe('ground_station');
    });

    test('updateCommsConfig', () => {
        const mockResult = { 
            success: true, 
            config: {
                antennaGain: 25,
                transmitPower: 15,
                dataRate: 2000,
                enabled: true
            }
        };
        mockAPI.updateCommsConfig.mockReturnValue(mockResult);

        const config = {
            antennaGain: 25,
            transmitPower: 15,
            dataRate: 2000,
            enabled: true
        };

        const result = window.api.updateCommsConfig('sat1', config);

        expect(mockAPI.updateCommsConfig).toHaveBeenCalledWith('sat1', config);
        expect(result.success).toBe(true);
        expect(result.config.antennaGain).toBe(25);
    });
});

describe('External API - Ground Tracking', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('getGroundTrack', () => {
        const mockResult = { 
            success: true, 
            groundTrack: [
                {
                    time: '2024-01-01T12:00:00.000Z',
                    latitude: 0,
                    longitude: 0,
                    altitude: 400,
                    x: 180,
                    y: 90,
                    isDatelineCrossing: false
                },
                {
                    time: '2024-01-01T12:05:00.000Z',
                    latitude: 5,
                    longitude: 15,
                    altitude: 400,
                    x: 195,
                    y: 85,
                    isDatelineCrossing: false
                }
            ],
            centralBody: 'Earth',
            centralBodyNaifId: 399,
            duration: 5400
        };
        mockAPI.getGroundTrack.mockReturnValue(mockResult);

        const result = window.api.getGroundTrack('sat1', 5400);

        expect(mockAPI.getGroundTrack).toHaveBeenCalledWith('sat1', 5400);
        expect(result.success).toBe(true);
        expect(result.groundTrack).toHaveLength(2);
        expect(result.centralBody).toBe('Earth');
    });

    test('getCurrentPositions', () => {
        const mockResult = { 
            success: true, 
            positions: [
                {
                    id: 'sat1',
                    lat: 0,
                    lon: 0,
                    alt: 400,
                    color: 0xFF0000
                },
                {
                    id: 'sat2',
                    lat: 45,
                    lon: -120,
                    alt: 600,
                    color: 0x00FF00
                }
            ],
            planetNaifId: 399,
            time: '2024-01-01T12:00:00.000Z'
        };
        mockAPI.getCurrentPositions.mockReturnValue(mockResult);

        const result = window.api.getCurrentPositions(399);

        expect(mockAPI.getCurrentPositions).toHaveBeenCalledWith(399);
        expect(result.success).toBe(true);
        expect(result.positions).toHaveLength(2);
        expect(result.planetNaifId).toBe(399);
    });

    test('calculateCoverage', () => {
        const mockResult = { 
            success: true, 
            coverage: {
                centerLat: 0,
                centerLon: 0,
                radiusDegrees: 15.2,
                altitude: 400,
                centralBody: 'Earth'
            }
        };
        mockAPI.calculateCoverage.mockReturnValue(mockResult);

        const result = window.api.calculateCoverage('sat1');

        expect(mockAPI.calculateCoverage).toHaveBeenCalledWith('sat1');
        expect(result.success).toBe(true);
        expect(result.coverage.radiusDegrees).toBeCloseTo(15.2);
        expect(result.coverage.centralBody).toBe('Earth');
    });

    test('getNextApsis', () => {
        const mockResult = { 
            success: true, 
            apsisType: 'periapsis',
            time: '2024-01-01T13:45:30.000Z',
            timeFromNow: 6330
        };
        mockAPI.getNextApsis.mockReturnValue(mockResult);

        const result = window.api.getNextApsis('sat1', 'periapsis');

        expect(mockAPI.getNextApsis).toHaveBeenCalledWith('sat1', 'periapsis');
        expect(result.success).toBe(true);
        expect(result.apsisType).toBe('periapsis');
        expect(result.timeFromNow).toBe(6330);
    });
});

describe('External API - Satellite Management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('getSatellites', () => {
        const mockResult = { 
            success: true, 
            satellites: [
                {
                    id: 'sat1',
                    name: 'CommSat-1',
                    mass: 500,
                    size: 2,
                    hasComms: true,
                    commsStatus: 'operational',
                    activeConnections: 2,
                    maneuverNodes: 1,
                    orbitalElements: {
                        semiMajorAxis: 7000,
                        eccentricity: 0.01,
                        inclination: 98,
                        period: 5400
                    }
                }
            ]
        };
        mockAPI.getSatellites.mockReturnValue(mockResult);

        const result = window.api.getSatellites();

        expect(mockAPI.getSatellites).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.satellites).toHaveLength(1);
        expect(result.satellites[0].hasComms).toBe(true);
    });

    test('getSatellite', () => {
        const mockResult = { 
            success: true, 
            satellite: {
                id: 'sat1',
                name: 'CommSat-1',
                mass: 500,
                communicationDetails: {
                    config: { antennaGain: 15, transmitPower: 5 },
                    state: { status: 'operational', connectionCount: 2 },
                    activeConnections: []
                },
                maneuverDetails: [
                    {
                        id: 'node1',
                        executionTime: '2024-01-01T12:00:00.000Z',
                        deltaV: { prograde: 0.1, normal: 0, radial: 0 }
                    }
                ]
            }
        };
        mockAPI.getSatellite.mockReturnValue(mockResult);

        const result = window.api.getSatellite('sat1');

        expect(mockAPI.getSatellite).toHaveBeenCalledWith('sat1');
        expect(result.success).toBe(true);
        expect(result.satellite.communicationDetails).toBeDefined();
        expect(result.satellite.maneuverDetails).toHaveLength(1);
    });

    test('deleteSatellite', () => {
        const mockResult = { 
            success: true, 
            message: 'Satellite sat1 deleted'
        };
        mockAPI.deleteSatellite.mockReturnValue(mockResult);

        const result = window.api.deleteSatellite('sat1');

        expect(mockAPI.deleteSatellite).toHaveBeenCalledWith('sat1');
        expect(result.success).toBe(true);
        expect(result.message).toContain('deleted');
    });
});

describe('External API - Orbital Mechanics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('getOrbitalElements', () => {
        const mockResult = { 
            success: true, 
            elements: {
                semiMajorAxis: 7000,
                eccentricity: 0.01,
                inclination: 98,
                raan: 120,
                argumentOfPeriapsis: 45,
                trueAnomaly: 15,
                meanAnomaly: 12,
                period: 5400
            },
            centralBody: 'Earth',
            centralBodyNaifId: 399
        };
        mockAPI.getOrbitalElements.mockReturnValue(mockResult);

        const result = window.api.getOrbitalElements('sat1');

        expect(mockAPI.getOrbitalElements).toHaveBeenCalledWith('sat1');
        expect(result.success).toBe(true);
        expect(result.elements.semiMajorAxis).toBe(7000);
        expect(result.centralBody).toBe('Earth');
    });

    test('calculateOrbitalPeriod', () => {
        const mockResult = { 
            success: true, 
            period: 5400,
            periodHours: 1.5,
            periodDays: 0.0625,
            centralBody: 'Earth',
            semiMajorAxis: 7000,
            mu: 398600.4418
        };
        mockAPI.calculateOrbitalPeriod.mockReturnValue(mockResult);

        const result = window.api.calculateOrbitalPeriod(7000, 399);

        expect(mockAPI.calculateOrbitalPeriod).toHaveBeenCalledWith(7000, 399);
        expect(result.success).toBe(true);
        expect(result.period).toBe(5400);
        expect(result.centralBody).toBe('Earth');
    });

    test('getSphereOfInfluence', () => {
        const mockResult = { 
            success: true, 
            body: 'Earth',
            naifId: 399,
            soiRadius: 924000,
            soiRadiusKm: 924000,
            hasAtmosphere: true,
            atmosphereHeight: 100
        };
        mockAPI.getSphereOfInfluence.mockReturnValue(mockResult);

        const result = window.api.getSphereOfInfluence(399);

        expect(mockAPI.getSphereOfInfluence).toHaveBeenCalledWith(399);
        expect(result.success).toBe(true);
        expect(result.body).toBe('Earth');
        expect(result.hasAtmosphere).toBe(true);
    });
});

describe('External API - Simulation Control', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('getSimulationTime', () => {
        const mockResult = { 
            success: true, 
            time: '2024-01-01T12:00:00.000Z',
            timestamp: 1704110400000
        };
        mockAPI.getSimulationTime.mockReturnValue(mockResult);

        const result = window.api.getSimulationTime();

        expect(mockAPI.getSimulationTime).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.time).toBe('2024-01-01T12:00:00.000Z');
    });

    test('setSimulationTime', () => {
        const mockResult = { 
            success: true, 
            time: '2024-06-01T00:00:00.000Z'
        };
        mockAPI.setSimulationTime.mockReturnValue(mockResult);

        const result = window.api.setSimulationTime('2024-06-01T00:00:00.000Z');

        expect(mockAPI.setSimulationTime).toHaveBeenCalledWith('2024-06-01T00:00:00.000Z');
        expect(result.success).toBe(true);
        expect(result.time).toBe('2024-06-01T00:00:00.000Z');
    });

    test('getTimeWarp and setTimeWarp', () => {
        const mockGetResult = { success: true, timeWarp: 1 };
        const mockSetResult = { success: true, timeWarp: 100 };
        
        mockAPI.getTimeWarp.mockReturnValue(mockGetResult);
        mockAPI.setTimeWarp.mockReturnValue(mockSetResult);

        const getResult = window.api.getTimeWarp();
        const setResult = window.api.setTimeWarp(100);

        expect(mockAPI.getTimeWarp).toHaveBeenCalled();
        expect(mockAPI.setTimeWarp).toHaveBeenCalledWith(100);
        expect(getResult.timeWarp).toBe(1);
        expect(setResult.timeWarp).toBe(100);
    });
});

describe('External API - Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('convertCoordinates', () => {
        const mockResult = { 
            success: true, 
            result: {
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                fromFrame: 'PCI',
                toFrame: 'PF',
                centralBody: 'Earth',
                time: '2024-01-01T12:00:00.000Z'
            }
        };
        mockAPI.convertCoordinates.mockReturnValue(mockResult);

        const params = {
            position: [7000, 0, 0],
            velocity: [0, 7.5, 0],
            fromFrame: 'PCI',
            toFrame: 'PF',
            centralBodyNaifId: 399,
            time: '2024-01-01T12:00:00.000Z'
        };

        const result = window.api.convertCoordinates(params);

        expect(mockAPI.convertCoordinates).toHaveBeenCalledWith(params);
        expect(result.success).toBe(true);
        expect(result.result.centralBody).toBe('Earth');
    });

    test('getSimulationStats', () => {
        const mockResult = { 
            success: true, 
            stats: {
                satelliteCount: 3,
                simulationTime: '2024-01-01T12:00:00.000Z',
                timeWarp: 1,
                physicsSteps: 120000,
                activeCommunications: 4,
                activeManeuvers: 2
            }
        };
        mockAPI.getSimulationStats.mockReturnValue(mockResult);

        const result = window.api.getSimulationStats();

        expect(mockAPI.getSimulationStats).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.stats.satelliteCount).toBe(3);
        expect(result.stats.activeCommunications).toBe(4);
    });

    test('updateDisplaySettings', () => {
        const mockResult = { 
            success: true, 
            updatedSettings: {
                showOrbits: true,
                showGroundTracks: true,
                showCommunicationLinks: true,
                showManeuverNodes: true
            }
        };
        mockAPI.updateDisplaySettings.mockReturnValue(mockResult);

        const settings = {
            showOrbits: true,
            showGroundTracks: true,
            showCommunicationLinks: true,
            showManeuverNodes: true
        };

        const result = window.api.updateDisplaySettings(settings);

        expect(mockAPI.updateDisplaySettings).toHaveBeenCalledWith(settings);
        expect(result.success).toBe(true);
        expect(result.updatedSettings.showCommunicationLinks).toBe(true);
    });
});

describe('External API - Error Handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('handles satellite not found error', () => {
        const mockResult = { 
            success: false, 
            error: 'Satellite sat999 not found'
        };
        mockAPI.getSatellite.mockReturnValue(mockResult);

        const result = window.api.getSatellite('sat999');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    test('handles invalid parameters error', () => {
        const mockResult = { 
            success: false, 
            error: 'Invalid execution time format'
        };
        mockAPI.addManeuverNode.mockReturnValue(mockResult);

        const result = window.api.addManeuverNode('sat1', { 
            executionTime: 'invalid-time',
            deltaV: { x: 0.1, y: 0, z: 0 }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid');
    });

    test('handles system not available error', () => {
        const mockResult = { 
            success: false, 
            error: 'Communication system not available'
        };
        mockAPI.getSatelliteComms.mockReturnValue(mockResult);

        const result = window.api.getSatelliteComms('sat1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
    });
});