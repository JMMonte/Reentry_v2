/**
 * SatelliteCommunicationIntegration.test.js
 * 
 * Integration tests for the complete satellite communication system,
 * testing the interaction between PhysicsEngine, SubsystemManager,
 * and CommunicationSubsystem in realistic scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { SubsystemManager } from '../src/physics/subsystems/SubsystemManager.js';
import { CommunicationSubsystem } from '../src/physics/subsystems/CommunicationSubsystem.js';

describe('Satellite Communication Integration', () => {
    let physicsEngine;
    let subsystemManager;

    beforeEach(async () => {
        // Initialize real physics engine
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize(new Date('2024-01-01T12:00:00Z'));
        
        // SubsystemManager is created by PhysicsEngine
        subsystemManager = physicsEngine.subsystemManager;
    });

    afterEach(() => {
        physicsEngine?.cleanup?.();
    });

    describe('Multi-Satellite Communication Network', () => {
        it('should establish communication links between multiple satellites', async () => {
            // Add three satellites in LEO
            const sat1Id = physicsEngine.addSatellite({
                id: 'sat-1',
                position: [0, 0, 6771],      // 400 km altitude above Earth surface
                velocity: [7.5, 0, 0],       // Orbital velocity
                mass: 1000,
                centralBodyNaifId: 399,      // Earth
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            const sat2Id = physicsEngine.addSatellite({
                id: 'sat-2', 
                position: [1000, 0, 6771],   // 1000 km separation
                velocity: [7.2, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            const sat3Id = physicsEngine.addSatellite({
                id: 'sat-3',
                position: [500, 866, 6771],  // Triangular formation
                velocity: [6.5, 3.75, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            // Wait for satellites to be added and subsystems initialized
            await new Promise(resolve => setTimeout(resolve, 100));

            // Get communication subsystems
            const comm1 = subsystemManager.getSubsystem(sat1Id, 'communication');
            const comm2 = subsystemManager.getSubsystem(sat2Id, 'communication');
            const comm3 = subsystemManager.getSubsystem(sat3Id, 'communication');

            expect(comm1).toBeInstanceOf(CommunicationSubsystem);
            expect(comm2).toBeInstanceOf(CommunicationSubsystem);
            expect(comm3).toBeInstanceOf(CommunicationSubsystem);

            // Force communication link updates
            const sat1Data = physicsEngine.satellites.get(sat1Id);
            const sat2Data = physicsEngine.satellites.get(sat2Id);
            const sat3Data = physicsEngine.satellites.get(sat3Id);

            comm1.updateCommunicationLinks(sat1Data, { temperature: 2.7 });
            comm2.updateCommunicationLinks(sat2Data, { temperature: 2.7 });
            comm3.updateCommunicationLinks(sat3Data, { temperature: 2.7 });

            // Check that satellites can communicate with each other
            const connections1 = comm1.getActiveConnections();
            const connections2 = comm2.getActiveConnections();
            const connections3 = comm3.getActiveConnections();

            // Each satellite should have connections to the others (if within range)
            expect(connections1.length).toBeGreaterThan(0);
            expect(connections2.length).toBeGreaterThan(0);
            expect(connections3.length).toBeGreaterThan(0);

            // Verify specific connections exist
            expect(connections1.some(c => c.targetId === sat2Id)).toBe(true);
            expect(connections2.some(c => c.targetId === sat1Id)).toBe(true);
        });

        it('should handle satellites moving out of communication range', async () => {
            // Add two satellites - one close, one far
            const closeSatId = physicsEngine.addSatellite({
                id: 'close-sat',
                position: [0, 0, 6771],
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            const farSatId = physicsEngine.addSatellite({
                id: 'far-sat',
                position: [150000, 0, 6771],  // Very far - definitely beyond communication range (150,000 km)
                velocity: [2.0, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const closeComm = subsystemManager.getSubsystem(closeSatId, 'communication');
            const farComm = subsystemManager.getSubsystem(farSatId, 'communication');

            // Update communication links
            const closeSatData = physicsEngine.satellites.get(closeSatId);
            const farSatData = physicsEngine.satellites.get(farSatId);

            closeComm.updateCommunicationLinks(closeSatData, { temperature: 2.7 });
            farComm.updateCommunicationLinks(farSatData, { temperature: 2.7 });

            // Satellites should not be able to communicate due to distance
            const closeConnections = closeComm.getActiveConnections();
            const farConnections = farComm.getActiveConnections();

            expect(closeConnections.find(c => c.targetId === farSatId)).toBeUndefined();
            expect(farConnections.find(c => c.targetId === closeSatId)).toBeUndefined();
        });

        it('should update communication links during physics simulation', async () => {
            // Add satellites
            const sat1Id = physicsEngine.addSatellite({
                id: 'moving-sat-1',
                position: [0, 0, 6771],  // 400 km altitude above Earth surface
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            const sat2Id = physicsEngine.addSatellite({
                id: 'moving-sat-2',
                position: [800, 0, 6771],  // 800 km separation
                velocity: [7.3, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Run physics simulation for several steps
            for (let i = 0; i < 5; i++) {
                await physicsEngine.step(1.0); // 1 second steps
            }

            // Check that subsystems are being updated
            const comm1 = subsystemManager.getSubsystem(sat1Id, 'communication');
            const comm2 = subsystemManager.getSubsystem(sat2Id, 'communication');

            expect(comm1.state.lastUpdate).toBeGreaterThan(0);
            expect(comm2.state.lastUpdate).toBeGreaterThan(0);

            // Check that communication status is available
            const status1 = comm1.getStatus();
            const status2 = comm2.getStatus();

            expect(status1.state.status).toBe('operational');
            expect(status2.state.status).toBe('operational');
        });
    });

    describe('Communication Data Flow', () => {
        let sat1Id, sat2Id;
        let comm1, comm2;

        beforeEach(async () => {
            // Setup two communicating satellites
            sat1Id = physicsEngine.addSatellite({
                id: 'data-sat-1',
                position: [0, 0, 6771],      // 400 km altitude above Earth surface
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            sat2Id = physicsEngine.addSatellite({
                id: 'data-sat-2',
                position: [500, 0, 6771], // Close enough for communication
                velocity: [7.4, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            comm1 = subsystemManager.getSubsystem(sat1Id, 'communication');
            comm2 = subsystemManager.getSubsystem(sat2Id, 'communication');

            // Establish communication links
            const sat1Data = physicsEngine.satellites.get(sat1Id);
            const sat2Data = physicsEngine.satellites.get(sat2Id);

            comm1.updateCommunicationLinks(sat1Data, { temperature: 2.7 });
            comm2.updateCommunicationLinks(sat2Data, { temperature: 2.7 });
        });

        it('should transmit data between connected satellites', () => {
            // Verify we have active connections first
            const connections = comm1.getActiveConnections();
            expect(connections.length).toBeGreaterThan(0);
            
            // Queue data for transmission
            const testData = new Uint8Array(100); // Small test data for faster transmission
            comm1.queueTransmission(testData, 'normal');

            const initialDataTransmitted = comm1.state.totalDataTransmitted;

            // Process transmissions for multiple steps to ensure data is transmitted
            for (let i = 0; i < 5; i++) {
                comm1.processTransmissions(0.1); // Process in smaller time steps
            }

            // Should have transmitted some data
            expect(comm1.state.totalDataTransmitted).toBeGreaterThan(initialDataTransmitted);
        });

        it('should handle different transmission priorities', () => {
            const normalData = new Uint8Array(500);
            const emergencyData = new Uint8Array(100);
            const highData = new Uint8Array(200);

            // Queue in non-priority order
            comm1.queueTransmission(normalData, 'normal');
            comm1.queueTransmission(emergencyData, 'emergency');
            comm1.queueTransmission(highData, 'high');

            // Emergency should be first, then high, then normal
            expect(comm1.transmissionQueue[0].priority).toBe('emergency');
            expect(comm1.transmissionQueue[1].priority).toBe('high');
            expect(comm1.transmissionQueue[2].priority).toBe('normal');
        });

        it('should update power consumption during transmission', () => {
            // Verify we have active connections first
            const connections = comm1.getActiveConnections();
            expect(connections.length).toBeGreaterThan(0);
            
            const basePower = comm1.state.powerConsumption;

            // Queue and start transmission
            const testData = new Uint8Array(1000);
            comm1.queueTransmission(testData);
            comm1.processTransmissions(1.0);
            
            // Manually update power consumption to reflect transmission state
            comm1.updatePowerConsumption();

            // Power should increase during transmission
            expect(comm1.state.powerConsumption).toBeGreaterThan(basePower);
        });
    });

    describe('System Failure and Recovery', () => {
        it('should handle communication subsystem failures gracefully', async () => {
            const satId = physicsEngine.addSatellite({
                id: 'failure-test-sat',
                position: [0, 0, 6771],  // 400 km altitude above Earth surface (6371 + 400)
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const comm = subsystemManager.getSubsystem(satId, 'communication');

            // Simulate failure
            comm.onFailure('Test failure');

            expect(comm.state.status).toBe('offline');
            expect(comm.metrics.faultEvents).toBe(1);

            // System should still function after failure
            const status = comm.getStatus();
            expect(status).toBeDefined();
            expect(status.state.status).toBe('offline');
        });

        it('should handle thermal overload conditions', async () => {
            const satId = physicsEngine.addSatellite({
                id: 'thermal-test-sat',
                position: [0, 0, 6771],  // 400 km altitude above Earth surface
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const comm = subsystemManager.getSubsystem(satId, 'communication');

            // Simulate overheating
            comm.state.transmitterTemperature = 350.15; // Above 70°C limit

            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

            comm.onThermalOverload();

            expect(comm.state.status).toBe('degraded');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Thermal overload')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Performance and Metrics', () => {
        it('should track communication metrics over time', async () => {
            const satId = physicsEngine.addSatellite({
                id: 'metrics-sat',
                position: [0, 0, 6771],  // 400 km altitude above Earth surface
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const comm = subsystemManager.getSubsystem(satId, 'communication');

            // Run updates to accumulate metrics - need to call update() to trigger updateMetrics()
            for (let i = 0; i < 10; i++) {
                const mockSatellite = physicsEngine.satellites.get(satId);
                const mockEnvironment = { temperature: 2.7 };
                comm.update(1.0, mockSatellite, mockEnvironment);
            }

            const status = comm.getStatus();
            expect(status.metrics.totalOperationTime).toBeGreaterThan(0);
            expect(status.metrics.totalPowerConsumed).toBeGreaterThan(0);
        });

        it('should provide performance statistics from subsystem manager', () => {
            const stats = subsystemManager.getPerformanceStats();

            expect(stats).toHaveProperty('totalUpdates');
            expect(stats).toHaveProperty('averageUpdateTime');
            expect(stats).toHaveProperty('activeSatellites');
            expect(stats).toHaveProperty('totalSubsystems');
        });
    });

    describe('Configuration and Control', () => {
        it('should update communication configuration dynamically', async () => {
            const satId = physicsEngine.addSatellite({
                id: 'config-sat',
                position: [0, 0, 6771],  // 400 km altitude above Earth surface
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const newConfig = {
                transmitPower: 25.0,
                dataRate: 5000,
                minElevationAngle: 15.0
            };

            const success = subsystemManager.updateSubsystemConfig(
                satId, 
                'communication', 
                newConfig
            );

            expect(success).toBe(true);

            const status = subsystemManager.getSubsystemStatus(satId, 'communication');
            expect(status.config.transmitPower).toBe(25.0);
            expect(status.config.dataRate).toBe(5000);
            expect(status.config.minElevationAngle).toBe(15.0);
        });

        it('should enable and disable communication subsystems', async () => {
            const satId = physicsEngine.addSatellite({
                id: 'enable-disable-sat',
                position: [0, 0, 6771],  // 400 km altitude above Earth surface
                velocity: [7.5, 0, 0],
                mass: 1000,
                centralBodyNaifId: 399,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            // Disable subsystem
            const disableSuccess = subsystemManager.setSubsystemEnabled(
                satId, 
                'communication', 
                false
            );

            expect(disableSuccess).toBe(true);

            let status = subsystemManager.getSubsystemStatus(satId, 'communication');
            expect(status.isEnabled).toBe(false);
            expect(status.state.status).toBe('offline');

            // Re-enable subsystem
            const enableSuccess = subsystemManager.setSubsystemEnabled(
                satId, 
                'communication', 
                true
            );

            expect(enableSuccess).toBe(true);

            status = subsystemManager.getSubsystemStatus(satId, 'communication');
            expect(status.isEnabled).toBe(true);
            expect(status.state.status).toBe('operational');
        });
    });
});