import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { SubsystemManager } from '../src/physics/subsystems/SubsystemManager.js';
import { CommunicationSubsystem } from '../src/physics/subsystems/CommunicationSubsystem.js';

describe('Satellite Communication Links', () => {
    let physicsEngine;
    let subsystemManager;
    
    beforeEach(async () => {
        // Mock console methods to capture logs
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        
        // Initialize physics engine
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
        subsystemManager = physicsEngine.subsystemManager;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Communication Subsystem Initialization', () => {
        it('should create communication subsystem for satellite', () => {
            const satelliteId = 'test-sat-1';
            
            // Add communication subsystem
            const commsSubsystem = subsystemManager.addSubsystem(satelliteId, 'communication', {
                antennaGain: 12.0,
                transmitPower: 10.0,
                maxRange: 50000
            });
            
            expect(commsSubsystem).toBeDefined();
            expect(commsSubsystem.satelliteId).toBe(satelliteId);
            expect(commsSubsystem.subsystemType).toBe('communication');
            expect(commsSubsystem.config.antennaGain).toBe(12.0);
        });

        it('should retrieve communication subsystem', () => {
            const satelliteId = 'test-sat-2';
            
            subsystemManager.addSubsystem(satelliteId, 'communication');
            const retrieved = subsystemManager.getSubsystem(satelliteId, 'communication');
            
            expect(retrieved).toBeDefined();
            expect(retrieved.satelliteId).toBe(satelliteId);
        });
    });

    describe('Finding Communication Targets', () => {
        it('should find other satellites with communication capability', () => {
            // Create two satellites with positions
            const sat1Id = 'sat-1';
            const sat2Id = 'sat-2';
            
            // Add satellites to physics engine
            physicsEngine.addSatellite({
                id: sat1Id,
                position: [7000, 0, 0], // 7000 km from origin
                velocity: [0, 7.5, 0],
                mass: 100,
                centralBodyNaifId: 399 // Earth
            });
            
            physicsEngine.addSatellite({
                id: sat2Id,
                position: [7500, 0, 0], // 7500 km from origin
                velocity: [0, 7.3, 0],
                mass: 100,
                centralBodyNaifId: 399 // Earth
            });
            
            // Add communication subsystems to both
            const comms1 = subsystemManager.addSubsystem(sat1Id, 'communication');
            const comms2 = subsystemManager.addSubsystem(sat2Id, 'communication');
            
            // Test finding targets from sat1's perspective
            const targets = comms1.findCommunicationTargets();
            
            expect(targets).toHaveLength(1);
            expect(targets[0].id).toBe(sat2Id);
            expect(targets[0].type).toBe('satellite');
        });

        it('should not include self in communication targets', () => {
            const satId = 'sat-self';
            
            physicsEngine.addSatellite({
                id: satId,
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 100,
                centralBodyNaifId: 399
            });
            
            const comms = subsystemManager.addSubsystem(satId, 'communication');
            const targets = comms.findCommunicationTargets();
            
            expect(targets).toHaveLength(0);
        });
    });

    describe('Link Budget Calculations', () => {
        it('should calculate valid link budget for nearby satellites', () => {
            const sat1 = {
                position: [7000, 0, 0] // Array format
            };
            
            const target = {
                id: 'target-sat',
                type: 'satellite',
                position: [7100, 0, 0], // 100 km away
                antennaGain: 12.0
            };
            
            const comms = new CommunicationSubsystem('test-sat', {
                antennaGain: 12.0,
                transmitPower: 10.0,
                maxRange: 50000,
                receiverSensitivity: -110
            });
            
            const linkBudget = comms.calculateLinkBudget(sat1, target);
            
            expect(linkBudget.possible).toBe(true);
            expect(linkBudget.distance).toBeCloseTo(100, 1);
            expect(linkBudget.quality).toBeGreaterThan(0);
            expect(linkBudget.quality).toBeLessThanOrEqual(100);
        });

        it('should fail link budget for out-of-range satellites', () => {
            const sat1 = {
                position: [7000, 0, 0]
            };
            
            const target = {
                id: 'far-sat',
                type: 'satellite',
                position: [60000, 0, 0], // 53000 km away (beyond 50000 km max range)
                antennaGain: 12.0
            };
            
            const comms = new CommunicationSubsystem('test-sat', {
                maxRange: 50000
            });
            
            const linkBudget = comms.calculateLinkBudget(sat1, target);
            
            expect(linkBudget.possible).toBe(false);
            expect(linkBudget.reason).toBe('Out of range');
        });
    });

    describe('Active Connection Management', () => {
        it('should establish and track active connections', () => {
            // Create two satellites
            const sat1Id = 'comm-sat-1';
            const sat2Id = 'comm-sat-2';
            
            // Add satellites with close positions
            physicsEngine.addSatellite({
                id: sat1Id,
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 100,
                centralBodyNaifId: 399
            });
            
            physicsEngine.addSatellite({
                id: sat2Id,
                position: [7050, 0, 0], // 50 km away
                velocity: [0, 7.5, 0],
                mass: 100,
                centralBodyNaifId: 399
            });
            
            // Add communication subsystems
            const comms1 = subsystemManager.addSubsystem(sat1Id, 'communication');
            const comms2 = subsystemManager.addSubsystem(sat2Id, 'communication');
            
            // Get satellite data
            const sat1Data = physicsEngine.satellites.get(sat1Id);
            
            // Update communication links
            comms1.updateCommunicationLinks(sat1Data, {});
            
            // Check active connections
            const activeConnections = comms1.getActiveConnections();
            
            expect(activeConnections).toHaveLength(1);
            expect(activeConnections[0].targetId).toBe(sat2Id);
            expect(activeConnections[0].targetType).toBe('satellite');
            expect(activeConnections[0].linkQuality).toBeGreaterThan(0);
            
            // Verify console logging
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining(`Satellite ${sat1Id} found 1 potential targets`)
            );
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining(`Satellite ${sat1Id} established link with ${sat2Id}`)
            );
        });

        it('should update connection count in state', () => {
            const satId = 'update-test-sat';
            
            physicsEngine.addSatellite({
                id: satId,
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 100,
                centralBodyNaifId: 399
            });
            
            const comms = subsystemManager.addSubsystem(satId, 'communication');
            const satData = physicsEngine.satellites.get(satId);
            
            // Initially no connections
            expect(comms.state.connectionCount).toBe(0);
            
            // Add another satellite nearby
            physicsEngine.addSatellite({
                id: 'nearby-sat',
                position: [7030, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 100,
                centralBodyNaifId: 399
            });
            subsystemManager.addSubsystem('nearby-sat', 'communication');
            
            // Update links
            comms.updateCommunicationLinks(satData, {});
            
            // Should now have one connection
            expect(comms.state.connectionCount).toBe(1);
            expect(comms.metrics.successfulConnections).toBe(1);
        });
    });

    describe('Communication Timeline Integration', () => {
        it('should provide status compatible with SatelliteCommsTimeline', () => {
            const satId = 'timeline-sat';
            
            physicsEngine.addSatellite({
                id: satId,
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 100,
                centralBodyNaifId: 399
            });
            
            const comms = subsystemManager.addSubsystem(satId, 'communication');
            
            // Get status as timeline component would
            const status = comms.getStatus();
            
            expect(status).toBeDefined();
            expect(status.state).toBeDefined();
            expect(status.state.status).toBe('operational');
            expect(status.state.connectionCount).toBeDefined();
            expect(status.state.currentDataRate).toBeDefined();
            expect(status.state.powerConsumption).toBeDefined();
            
            // Get active connections as timeline component would
            const connections = comms.getActiveConnections();
            expect(Array.isArray(connections)).toBe(true);
        });
    });
});