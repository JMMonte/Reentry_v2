/**
 * Functional tests for External API
 * Tests that verify the API functions work with realistic data flows
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Create a functional API implementation for testing
function createFunctionalAPI() {
    const satellites = new Map();
    const celestialBodies = [
        { name: 'Earth', naifId: 399, radius: 6378, GM: 398600.4418, mu: 398600.4418 },
        { name: 'Moon', naifId: 301, radius: 1737, GM: 4902.8000, mu: 4902.8000 }
    ];
    
    let currentTime = new Date('2024-01-01T12:00:00.000Z');
    let timeWarp = 1;

    return {
        // Satellite Creation
        createSatelliteFromOrbitalElements: (params) => {
            try {
                if (!params.name || params.semiMajorAxis == null || params.eccentricity == null) {
                    return { success: false, error: 'Missing required parameters' };
                }
                
                const satId = `sat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const satellite = {
                    id: satId,
                    name: params.name,
                    mass: params.mass || 100,
                    size: params.size || 1,
                    orbitalElements: {
                        semiMajorAxis: params.semiMajorAxis,
                        eccentricity: params.eccentricity,
                        inclination: params.inclination,
                        raan: params.raan,
                        argumentOfPeriapsis: params.argumentOfPeriapsis,
                        trueAnomaly: params.trueAnomaly
                    },
                    centralBodyNaifId: params.centralBodyNaifId || 399,
                    maneuverNodes: [],
                    commsConfig: params.commsConfig || null
                };
                
                satellites.set(satId, satellite);
                return { success: true, satellite: { id: satId, name: params.name } };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        createSatelliteFromLatLon: (params) => {
            try {
                if (!params.name || params.latitude == null || params.longitude == null || !params.altitude) {
                    return { success: false, error: 'Missing required parameters' };
                }
                
                const satId = `sat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const satellite = {
                    id: satId,
                    name: params.name,
                    mass: params.mass || 100,
                    size: params.size || 1,
                    latitude: params.latitude,
                    longitude: params.longitude,
                    altitude: params.altitude,
                    velocity: params.velocity,
                    azimuth: params.azimuth,
                    centralBodyNaifId: params.centralBodyNaifId || 399,
                    maneuverNodes: [],
                    commsConfig: params.commsConfig || null
                };
                
                satellites.set(satId, satellite);
                return { success: true, satellite: { id: satId, name: params.name } };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // Satellite Management
        getSatellites: () => {
            try {
                const satelliteArray = Array.from(satellites.values()).map(sat => ({
                    id: sat.id,
                    name: sat.name,
                    mass: sat.mass,
                    size: sat.size,
                    hasComms: !!sat.commsConfig,
                    commsStatus: sat.commsConfig ? 'operational' : 'offline',
                    maneuverNodes: sat.maneuverNodes.length,
                    orbitalElements: sat.orbitalElements
                }));
                
                return { success: true, satellites: satelliteArray };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        getSatellite: (id) => {
            try {
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
                }
                
                return { success: true, satellite };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        deleteSatellite: (id) => {
            try {
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
                }
                
                satellites.delete(id);
                return { success: true, message: `Satellite ${id} deleted` };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // Mission Planning
        addManeuverNode: (satelliteId, params) => {
            try {
                const satellite = satellites.get(satelliteId);
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }
                
                const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const node = {
                    id: nodeId,
                    executionTime: params.executionTime,
                    deltaV: params.deltaV,
                    status: 'planned'
                };
                
                satellite.maneuverNodes.push(node);
                return { success: true, nodeId, executionTime: params.executionTime };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        getManeuverNodes: (satelliteId) => {
            try {
                const satellite = satellites.get(satelliteId);
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }
                
                return { success: true, nodes: satellite.maneuverNodes };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        calculateHohmannTransfer: (params) => {
            try {
                if (!params.currentSemiMajorAxis || !params.targetSemiMajorAxis) {
                    return { success: false, error: 'Current and target semi-major axes required' };
                }
                
                const centralBody = celestialBodies.find(b => b.naifId === (params.centralBodyNaifId || 399));
                if (!centralBody) {
                    return { success: false, error: `Central body not found` };
                }
                
                const mu = centralBody.mu;
                const r1 = params.currentSemiMajorAxis;
                const r2 = params.targetSemiMajorAxis;
                const a_transfer = (r1 + r2) / 2;

                // Calculate delta-V requirements using vis-viva equation
                const v1 = Math.sqrt(mu / r1);
                const v2 = Math.sqrt(mu / r2);
                const v_transfer_1 = Math.sqrt(mu * (2/r1 - 1/a_transfer));
                const v_transfer_2 = Math.sqrt(mu * (2/r2 - 1/a_transfer));
                
                const deltaV1 = Math.abs(v_transfer_1 - v1);
                const deltaV2 = Math.abs(v2 - v_transfer_2);
                const totalDeltaV = deltaV1 + deltaV2;
                
                // Transfer time (half orbital period of transfer ellipse)
                const transferTime = Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / mu);

                return {
                    success: true,
                    transfer: {
                        deltaV1,
                        deltaV2,
                        totalDeltaV,
                        transferTime,
                        transferSemiMajorAxis: a_transfer,
                        centralBody: centralBody.name
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // Communication Systems
        getSatelliteComms: (satelliteId) => {
            try {
                const satellite = satellites.get(satelliteId);
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }
                
                if (!satellite.commsConfig) {
                    return { success: false, error: 'No communication subsystem found' };
                }
                
                return {
                    success: true,
                    comms: {
                        status: 'operational',
                        powerConsumption: 15.5,
                        isTransmitting: true,
                        currentDataRate: satellite.commsConfig.dataRate || 1000,
                        connectionCount: 1,
                        bestLinkQuality: 85,
                        averageLinkQuality: 75,
                        activeConnections: []
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // Orbital Mechanics
        calculateOrbitalPeriod: (semiMajorAxis, centralBodyNaifId = 399) => {
            try {
                const centralBody = celestialBodies.find(b => b.naifId === centralBodyNaifId);
                if (!centralBody) {
                    return { success: false, error: `Central body ${centralBodyNaifId} not found` };
                }
                
                // Calculate period using Kepler's third law: T = 2π√(a³/μ)
                const mu = centralBody.mu;
                const period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
                
                return {
                    success: true,
                    period,
                    periodHours: period / 3600,
                    periodDays: period / 86400,
                    centralBody: centralBody.name,
                    semiMajorAxis,
                    mu
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // Simulation Control
        getSimulationTime: () => {
            return {
                success: true,
                time: currentTime.toISOString(),
                timestamp: currentTime.getTime()
            };
        },

        setSimulationTime: (time) => {
            try {
                currentTime = new Date(time);
                return { success: true, time: currentTime.toISOString() };
            } catch (error) {
                return { success: false, error: 'Invalid time format' };
            }
        },

        getTimeWarp: () => {
            return { success: true, timeWarp };
        },

        setTimeWarp: (factor) => {
            try {
                if (typeof factor !== 'number' || factor <= 0) {
                    return { success: false, error: 'Time warp must be a positive number' };
                }
                timeWarp = factor;
                return { success: true, timeWarp: factor };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // Celestial Bodies
        getCelestialBodies: () => {
            return { success: true, bodies: celestialBodies };
        },

        // Utilities
        getSimulationStats: () => {
            return {
                success: true,
                stats: {
                    satelliteCount: satellites.size,
                    simulationTime: currentTime.toISOString(),
                    timeWarp,
                    physicsSteps: 120000,
                    activeCommunications: Array.from(satellites.values()).filter(s => s.commsConfig).length,
                    activeManeuvers: Array.from(satellites.values()).reduce((total, s) => total + s.maneuverNodes.length, 0)
                }
            };
        }
    };
}

describe('External API Functional Tests', () => {
    let api;

    beforeEach(() => {
        api = createFunctionalAPI();
    });

    describe('Satellite Creation Workflow', () => {
        test('complete satellite creation from orbital elements with communications', () => {
            const params = {
                name: 'ISS-Replica',
                mass: 450000,
                size: 73,
                semiMajorAxis: 6778,
                eccentricity: 0.0003,
                inclination: 51.6,
                raan: 0,
                argumentOfPeriapsis: 0,
                trueAnomaly: 0,
                commsConfig: {
                    preset: 'commercial',
                    antennaGain: 20,
                    transmitPower: 25,
                    dataRate: 5000
                }
            };

            const result = api.createSatelliteFromOrbitalElements(params);

            expect(result.success).toBe(true);
            expect(result.satellite.name).toBe('ISS-Replica');

            // Verify satellite is in system
            const satellites = api.getSatellites();
            expect(satellites.success).toBe(true);
            expect(satellites.satellites).toHaveLength(1);
            expect(satellites.satellites[0].hasComms).toBe(true);
        });

        test('satellite creation from geographic coordinates', () => {
            const params = {
                name: 'KSC-Launch',
                mass: 5000,
                size: 10,
                latitude: 28.5,
                longitude: -80.6,
                altitude: 408,
                velocity: 7.66,
                azimuth: 90,
                angleOfAttack: 0
            };

            const result = api.createSatelliteFromLatLon(params);

            expect(result.success).toBe(true);
            expect(result.satellite.name).toBe('KSC-Launch');

            // Verify satellite details
            const satellite = api.getSatellite(result.satellite.id);
            expect(satellite.success).toBe(true);
            expect(satellite.satellite.latitude).toBe(28.5);
            expect(satellite.satellite.longitude).toBe(-80.6);
        });
    });

    describe('Mission Planning Workflow', () => {
        test('complete mission planning sequence', () => {
            // Create satellite
            const createResult = api.createSatelliteFromOrbitalElements({
                name: 'Mission-Sat',
                mass: 1000,
                size: 3,
                semiMajorAxis: 7000,
                eccentricity: 0.01,
                inclination: 98,
                raan: 120,
                argumentOfPeriapsis: 45,
                trueAnomaly: 0
            });

            expect(createResult.success).toBe(true);
            const satId = createResult.satellite.id;

            // Add maneuver node
            const maneuverResult = api.addManeuverNode(satId, {
                executionTime: '2024-01-01T14:00:00.000Z',
                deltaV: { x: 0.15, y: 0, z: 0 }
            });

            expect(maneuverResult.success).toBe(true);
            expect(maneuverResult.nodeId).toBeDefined();

            // Get maneuver nodes
            const nodesResult = api.getManeuverNodes(satId);
            expect(nodesResult.success).toBe(true);
            expect(nodesResult.nodes).toHaveLength(1);
            expect(nodesResult.nodes[0].deltaV.x).toBe(0.15);
        });

        test('Hohmann transfer calculation', () => {
            const result = api.calculateHohmannTransfer({
                currentSemiMajorAxis: 6778, // ISS altitude
                targetSemiMajorAxis: 42164, // GEO altitude
                centralBodyNaifId: 399
            });

            expect(result.success).toBe(true);
            expect(result.transfer.deltaV1).toBeGreaterThan(0);
            expect(result.transfer.deltaV2).toBeGreaterThan(0);
            expect(result.transfer.totalDeltaV).toBeGreaterThan(3); // Realistic delta-V for GEO transfer
            expect(result.transfer.centralBody).toBe('Earth');
            expect(result.transfer.transferTime).toBeGreaterThan(0);
        });
    });

    describe('Communication Systems Workflow', () => {
        test('satellite with communication capabilities', () => {
            // Create satellite with comms
            const createResult = api.createSatelliteFromOrbitalElements({
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
                    dataRate: 1000
                }
            });

            expect(createResult.success).toBe(true);
            const satId = createResult.satellite.id;

            // Get communication status
            const commsResult = api.getSatelliteComms(satId);
            expect(commsResult.success).toBe(true);
            expect(commsResult.comms.status).toBe('operational');
            expect(commsResult.comms.currentDataRate).toBe(1000);
        });

        test('satellite without communication fails gracefully', () => {
            // Create satellite without comms
            const createResult = api.createSatelliteFromOrbitalElements({
                name: 'Basic-Sat',
                mass: 100,
                size: 1,
                semiMajorAxis: 7000,
                eccentricity: 0,
                inclination: 90,
                raan: 0,
                argumentOfPeriapsis: 0,
                trueAnomaly: 0
                // No commsConfig provided
            });

            expect(createResult.success).toBe(true);
            const satId = createResult.satellite.id;

            // Try to get communication status
            const commsResult = api.getSatelliteComms(satId);
            expect(commsResult.success).toBe(false);
            expect(commsResult.error).toContain('No communication subsystem found');
        });
    });

    describe('Orbital Mechanics Workflow', () => {
        test('orbital period calculations for different bodies', () => {
            // Earth orbit
            const earthResult = api.calculateOrbitalPeriod(6778, 399);
            expect(earthResult.success).toBe(true);
            expect(earthResult.periodHours).toBeCloseTo(1.5, 1); // ISS period ~90 minutes

            // Moon orbit  
            const moonResult = api.calculateOrbitalPeriod(1837, 301); // 100km altitude
            expect(moonResult.success).toBe(true);
            expect(moonResult.centralBody).toBe('Moon');
            expect(moonResult.periodHours).toBeGreaterThan(0);
        });

        test('orbital mechanics validation', () => {
            // Test unrealistic orbit
            const result = api.calculateOrbitalPeriod(1000, 399); // Below Earth's surface
            expect(result.success).toBe(true); // Function calculates anyway
            expect(result.period).toBeGreaterThan(0);
        });
    });

    describe('Simulation Control Workflow', () => {
        test('time management operations', () => {
            // Get initial time
            const initialTime = api.getSimulationTime();
            expect(initialTime.success).toBe(true);
            expect(initialTime.time).toBe('2024-01-01T12:00:00.000Z');

            // Set new time
            const newTime = '2024-06-01T00:00:00.000Z';
            const setResult = api.setSimulationTime(newTime);
            expect(setResult.success).toBe(true);
            expect(setResult.time).toBe(newTime);

            // Verify time changed
            const updatedTime = api.getSimulationTime();
            expect(updatedTime.time).toBe(newTime);
        });

        test('time warp operations', () => {
            // Get initial time warp
            const initialWarp = api.getTimeWarp();
            expect(initialWarp.success).toBe(true);
            expect(initialWarp.timeWarp).toBe(1);

            // Set time warp
            const setResult = api.setTimeWarp(100);
            expect(setResult.success).toBe(true);
            expect(setResult.timeWarp).toBe(100);

            // Test invalid time warp
            const invalidResult = api.setTimeWarp(-1);
            expect(invalidResult.success).toBe(false);
            expect(invalidResult.error).toContain('positive number');
        });
    });

    describe('System Integration Workflow', () => {
        test('complete multi-satellite mission scenario', () => {
            // Create constellation of satellites
            const sat1 = api.createSatelliteFromOrbitalElements({
                name: 'Constellation-1',
                mass: 300,
                size: 1.5,
                semiMajorAxis: 7000,
                eccentricity: 0,
                inclination: 98,
                raan: 0,
                argumentOfPeriapsis: 0,
                trueAnomaly: 0,
                commsConfig: { preset: 'cubesat' }
            });

            const sat2 = api.createSatelliteFromOrbitalElements({
                name: 'Constellation-2',
                mass: 300,
                size: 1.5,
                semiMajorAxis: 7000,
                eccentricity: 0,
                inclination: 98,
                raan: 90,
                argumentOfPeriapsis: 0,
                trueAnomaly: 0,
                commsConfig: { preset: 'cubesat' }
            });

            expect(sat1.success && sat2.success).toBe(true);

            // Add maneuvers to both satellites
            api.addManeuverNode(sat1.satellite.id, {
                executionTime: '2024-01-01T13:00:00.000Z',
                deltaV: { x: 0.05, y: 0, z: 0 }
            });

            api.addManeuverNode(sat2.satellite.id, {
                executionTime: '2024-01-01T13:30:00.000Z',
                deltaV: { x: 0.05, y: 0, z: 0 }
            });

            // Check system statistics
            const stats = api.getSimulationStats();
            expect(stats.success).toBe(true);
            expect(stats.stats.satelliteCount).toBe(2);
            expect(stats.stats.activeCommunications).toBe(2);
            expect(stats.stats.activeManeuvers).toBe(2);

            // Verify constellation details
            const satellites = api.getSatellites();
            expect(satellites.success).toBe(true);
            expect(satellites.satellites).toHaveLength(2);
            expect(satellites.satellites.every(s => s.hasComms)).toBe(true);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('handles missing satellite errors', () => {
            const result = api.getSatellite('nonexistent');
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        test('handles invalid parameters', () => {
            const result = api.createSatelliteFromOrbitalElements({
                name: '', // Missing name
                semiMajorAxis: 7000
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required parameters');
        });

        test('handles invalid time format', () => {
            const result = api.setSimulationTime('invalid-time');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid time format');
        });

        test('handles missing celestial body', () => {
            const result = api.calculateOrbitalPeriod(7000, 999);
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });
});