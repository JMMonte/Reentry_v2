/**
 * CommunicationSubsystem.test.js
 * 
 * Comprehensive tests for the satellite communication subsystem.
 * Tests RF link calculations, target discovery, and physics integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommunicationSubsystem } from '../src/physics/subsystems/CommunicationSubsystem.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { SubsystemManager } from '../src/physics/subsystems/SubsystemManager.js';

describe('CommunicationSubsystem', () => {
    let commSystem;
    let mockPhysicsEngine;
    let satelliteId;

    beforeEach(() => {
        satelliteId = 'test-sat-1';
        commSystem = new CommunicationSubsystem(satelliteId, {
            antennaGain: 15.0,
            transmitPower: 20.0,
            dataRate: 2000,
            maxRange: 10000
        });

        // Mock physics engine
        mockPhysicsEngine = {
            satellites: new Map(),
            subsystemManager: {
                getSubsystem: vi.fn()
            }
        };

        commSystem.setPhysicsEngine(mockPhysicsEngine);
    });

    describe('Initialization', () => {
        it('should initialize with correct default configuration', () => {
            const defaultCommSystem = new CommunicationSubsystem('test-sat-default');
            const status = defaultCommSystem.getStatus();
            
            expect(status.config.antennaGain).toBe(12.0);
            expect(status.config.transmitPower).toBe(10.0);
            expect(status.config.dataRate).toBe(1000);
            expect(status.config.maxRange).toBe(50000);
            expect(status.state.status).toBe('operational');
        });

        it('should override default config with provided values', () => {
            const status = commSystem.getStatus();
            
            expect(status.config.antennaGain).toBe(15.0);
            expect(status.config.transmitPower).toBe(20.0);
            expect(status.config.dataRate).toBe(2000);
            expect(status.config.maxRange).toBe(10000);
        });

        it('should have correct initial state', () => {
            const status = commSystem.getStatus();
            
            expect(status.state.powerConsumption).toBe(5.0); // Base power
            expect(status.state.isTransmitting).toBe(false);
            expect(status.state.connectionCount).toBe(0);
            expect(status.state.totalDataTransmitted).toBe(0);
        });
    });

    describe('Target Discovery', () => {
        beforeEach(() => {
            // Add mock satellites to physics engine
            mockPhysicsEngine.satellites.set('sat-2', {
                position: [1000, 0, 0], // 1000 km away
                velocity: [0, 7.5, 0]
            });
            
            mockPhysicsEngine.satellites.set('sat-3', {
                position: [5000, 0, 0], // 5000 km away
                velocity: [0, 5.5, 0]
            });

            // Mock subsystem manager responses
            mockPhysicsEngine.subsystemManager.getSubsystem.mockImplementation((satId, type) => {
                if (type === 'communication' && satId !== satelliteId) {
                    return {
                        config: { antennaGain: 10.0 }
                    };
                }
                return null;
            });
        });

        it('should find other satellites as communication targets', () => {
            const mockSatellite = { position: [0, 0, 0] };
            const targets = commSystem.findCommunicationTargets(mockSatellite);
            
            expect(targets).toHaveLength(2);
            expect(targets[0].id).toBe('sat-2');
            expect(targets[1].id).toBe('sat-3');
            expect(targets[0].type).toBe('satellite');
        });

        it('should not include self as target', () => {
            // Add self to satellites map
            mockPhysicsEngine.satellites.set(satelliteId, {
                position: [0, 0, 0],
                velocity: [0, 0, 0]
            });

            const mockSatellite = { position: [0, 0, 0] };
            const targets = commSystem.findCommunicationTargets(mockSatellite);
            
            expect(targets).toHaveLength(2);
            expect(targets.find(t => t.id === satelliteId)).toBeUndefined();
        });

        it('should not include satellites without communication subsystem', () => {
            // Add satellite without comms
            mockPhysicsEngine.satellites.set('sat-no-comms', {
                position: [2000, 0, 0]
            });

            mockPhysicsEngine.subsystemManager.getSubsystem.mockImplementation((satId, type) => {
                if (type === 'communication' && satId === 'sat-no-comms') {
                    return null; // No comms subsystem
                }
                if (type === 'communication' && satId !== satelliteId) {
                    return { config: { antennaGain: 10.0 } };
                }
                return null;
            });

            const mockSatellite = { position: [0, 0, 0] };
            const targets = commSystem.findCommunicationTargets(mockSatellite);
            
            expect(targets).toHaveLength(2); // Still only sat-2 and sat-3
            expect(targets.find(t => t.id === 'sat-no-comms')).toBeUndefined();
        });
    });

    describe('Link Budget Calculations', () => {
        let mockSatellite;
        let mockTarget;
        let mockEnvironment;

        beforeEach(() => {
            mockSatellite = {
                position: [0, 0, 0]
            };

            mockTarget = {
                id: 'target-sat',
                type: 'satellite',
                position: [1000, 0, 0], // 1000 km away
                antennaGain: 12.0
            };

            mockEnvironment = {
                temperature: 2.7
            };
        });

        it('should calculate successful link for close satellites', () => {
            const linkInfo = commSystem.calculateLinkBudget(mockSatellite, mockTarget, mockEnvironment);
            
            expect(linkInfo.possible).toBe(true);
            expect(linkInfo.distance).toBe(1000);
            expect(linkInfo.quality).toBeGreaterThan(0);
            expect(linkInfo.dataRate).toBeGreaterThan(0);
            expect(linkInfo.margin).toBeGreaterThan(0);
        });

        it('should reject link for satellites beyond max range', () => {
            mockTarget.position = [15000, 0, 0]; // Beyond 10000 km max range
            
            const linkInfo = commSystem.calculateLinkBudget(mockSatellite, mockTarget, mockEnvironment);
            
            expect(linkInfo.possible).toBe(false);
            expect(linkInfo.reason).toBe('Out of range');
        });

        it('should reject link with insufficient signal strength', () => {
            // Very distant satellite with poor antenna
            mockTarget.position = [9000, 0, 0]; // Near max range
            mockTarget.antennaGain = -10.0; // Poor antenna
            
            const linkInfo = commSystem.calculateLinkBudget(mockSatellite, mockTarget, mockEnvironment);
            
            expect(linkInfo.possible).toBe(false);
            expect(linkInfo.reason).toBe('Insufficient link margin');
        });

        it('should calculate elevation angle for ground stations', () => {
            const groundTarget = {
                id: 'ground-station',
                type: 'ground_station',
                position: [0, 0, -6371], // On Earth surface
                antennaGain: 25.0
            };

            mockSatellite.position = [0, 0, 0]; // At center
            
            const linkInfo = commSystem.calculateLinkBudget(mockSatellite, groundTarget, mockEnvironment);
            
            expect(linkInfo.elevationAngle).toBeCloseTo(90, 1); // Should be 90 degrees
        });

        it('should reject ground station links below minimum elevation', () => {
            const groundTarget = {
                id: 'ground-station',
                type: 'ground_station',
                position: [6371, 0, -6371], // Low elevation
                antennaGain: 25.0
            };

            mockSatellite.position = [0, 0, 400]; // 400 km altitude
            
            const linkInfo = commSystem.calculateLinkBudget(mockSatellite, groundTarget, mockEnvironment);
            
            if (linkInfo.elevationAngle < 5.0) {
                expect(linkInfo.possible).toBe(false);
                expect(linkInfo.reason).toBe('Below minimum elevation');
            }
        });
    });

    describe('Communication Link Updates', () => {
        let mockSatellite;
        let mockEnvironment;

        beforeEach(() => {
            mockSatellite = {
                position: [0, 0, 0]
            };

            mockEnvironment = {
                temperature: 2.7
            };

            // Setup mock targets that will pass link budget
            mockPhysicsEngine.satellites.set('close-sat', {
                position: [500, 0, 0] // Close satellite
            });

            mockPhysicsEngine.satellites.set('far-sat', {
                position: [15000, 0, 0] // Too far
            });

            mockPhysicsEngine.subsystemManager.getSubsystem.mockImplementation((satId, type) => {
                if (type === 'communication' && satId !== satelliteId) {
                    return { config: { antennaGain: 15.0 } };
                }
                return null;
            });
        });

        it('should establish connections with reachable satellites', () => {
            commSystem.updateCommunicationLinks(mockSatellite, mockEnvironment);
            
            const connections = commSystem.getActiveConnections();
            expect(connections.length).toBeGreaterThan(0);
            
            const closeConnection = connections.find(c => c.targetId === 'close-sat');
            expect(closeConnection).toBeDefined();
            expect(closeConnection.linkQuality).toBeGreaterThan(0);
        });

        it('should not establish connections with unreachable satellites', () => {
            commSystem.updateCommunicationLinks(mockSatellite, mockEnvironment);
            
            const connections = commSystem.getActiveConnections();
            const farConnection = connections.find(c => c.targetId === 'far-sat');
            expect(farConnection).toBeUndefined();
        });

        it('should update connection count in state', () => {
            commSystem.updateCommunicationLinks(mockSatellite, mockEnvironment);
            
            const status = commSystem.getStatus();
            expect(status.state.connectionCount).toBe(commSystem.getActiveConnections().length);
        });

        it('should update link quality metrics', () => {
            commSystem.updateCommunicationLinks(mockSatellite, mockEnvironment);
            
            const status = commSystem.getStatus();
            if (status.state.connectionCount > 0) {
                expect(status.state.bestLinkQuality).toBeGreaterThan(0);
                expect(status.state.averageLinkQuality).toBeGreaterThan(0);
            }
        });
    });

    describe('Data Transmission', () => {
        beforeEach(() => {
            // Setup active connection
            commSystem.activeConnections.set('target-1', {
                targetId: 'target-1',
                dataRate: 1000, // 1 Mbps
                linkQuality: 80
            });
        });

        it('should queue transmission data', () => {
            const testData = new Uint8Array(1024); // 1 KB
            commSystem.queueTransmission(testData, 'high');
            
            expect(commSystem.transmissionQueue).toHaveLength(1);
            expect(commSystem.transmissionQueue[0].totalSize).toBe(1024);
            expect(commSystem.transmissionQueue[0].priority).toBe('high');
        });

        it('should process transmissions with active connections', () => {
            const testData = new Uint8Array(100);
            commSystem.queueTransmission(testData);
            
            const deltaTime = 1.0; // 1 second
            commSystem.processTransmissions(deltaTime);
            
            const status = commSystem.getStatus();
            expect(status.state.isTransmitting).toBe(true);
            expect(status.state.currentDataRate).toBe(1000);
            expect(status.state.totalDataTransmitted).toBeGreaterThan(0);
        });

        it('should not transmit without active connections', () => {
            commSystem.activeConnections.clear();
            
            const testData = new Uint8Array(100);
            commSystem.queueTransmission(testData);
            
            commSystem.processTransmissions(1.0);
            
            const status = commSystem.getStatus();
            expect(status.state.isTransmitting).toBe(false);
            expect(status.state.totalDataTransmitted).toBe(0);
        });

        it('should prioritize emergency transmissions', () => {
            const normalData = new Uint8Array(100);
            const emergencyData = new Uint8Array(50);
            
            commSystem.queueTransmission(normalData, 'normal');
            commSystem.queueTransmission(emergencyData, 'emergency');
            
            expect(commSystem.transmissionQueue[0].priority).toBe('emergency');
            expect(commSystem.transmissionQueue[1].priority).toBe('normal');
        });
    });

    describe('Power Consumption', () => {
        it('should have base power consumption when idle', () => {
            commSystem.updatePowerConsumption();
            
            const status = commSystem.getStatus();
            expect(status.state.powerConsumption).toBe(5.0); // Base power
        });

        it('should increase power when transmitting', () => {
            commSystem.state.isTransmitting = true;
            commSystem.updatePowerConsumption();
            
            const status = commSystem.getStatus();
            expect(status.state.powerConsumption).toBeGreaterThan(5.0);
        });

        it('should increase power with active connections', () => {
            commSystem.activeConnections.set('target-1', {});
            commSystem.activeConnections.set('target-2', {});
            commSystem.updatePowerConsumption();
            
            const status = commSystem.getStatus();
            expect(status.state.powerConsumption).toBe(9.0); // 5 + 2*2
        });
    });

    describe('Thermal Management', () => {
        it('should update antenna temperature', () => {
            const initialTemp = commSystem.state.antennaTemperature;
            
            commSystem.updateThermalState(1.0, { temperature: 2.7 });
            
            // Temperature should change due to heat generation and radiation
            expect(commSystem.state.antennaTemperature).not.toBe(initialTemp);
        });

        it('should trigger thermal overload protection', () => {
            commSystem.state.transmitterTemperature = 350.15; // Above 70°C limit
            
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();
            commSystem.onThermalOverload();
            
            expect(commSystem.state.status).toBe('degraded');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Thermal overload')
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('Configuration Updates', () => {
        it('should update configuration', () => {
            const newConfig = {
                transmitPower: 50.0,
                dataRate: 5000
            };
            
            commSystem.updateConfig(newConfig);
            
            const status = commSystem.getStatus();
            expect(status.config.transmitPower).toBe(50.0);
            expect(status.config.dataRate).toBe(5000);
            expect(status.config.antennaGain).toBe(15.0); // Should keep original
        });

        it('should enable/disable subsystem', () => {
            commSystem.setEnabled(false);
            
            expect(commSystem.isEnabled).toBe(false);
            expect(commSystem.state.status).toBe('offline');
            
            commSystem.setEnabled(true);
            expect(commSystem.isEnabled).toBe(true);
            expect(commSystem.state.status).toBe('operational');
        });
    });
});