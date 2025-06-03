import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';

describe('Satellite Communication Debug', () => {
    let physicsEngine;
    let logs = [];
    
    beforeEach(async () => {
        // Capture console logs
        logs = [];
        console.log = (...args) => {
            logs.push(args.join(' '));
        };
        console.warn = (...args) => {
            logs.push('[WARN] ' + args.join(' '));
        };
        
        // Initialize physics engine
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
    });

    afterEach(() => {
        // Print all logs for debugging
        console.error('=== Test Logs ===');
        logs.forEach(log => console.error(log));
        console.error('=================');
    });

    it('should show communication link establishment process', () => {
        // Create two satellites close together
        const sat1Id = 'debug-sat-1';
        const sat2Id = 'debug-sat-2';
        
        // Add satellites
        physicsEngine.addSatellite({
            id: sat1Id,
            position: [7000, 0, 0], // 7000 km from origin
            velocity: [0, 7.5, 0],
            mass: 100,
            centralBodyNaifId: 399 // Earth
        });
        
        physicsEngine.addSatellite({
            id: sat2Id,
            position: [7020, 0, 0], // Only 20 km away for strong signal
            velocity: [0, 7.5, 0],
            mass: 100,
            centralBodyNaifId: 399 // Earth
        });
        
        // Add communication subsystems
        const comms1 = physicsEngine.subsystemManager.addSubsystem(sat1Id, 'communication', {
            antennaGain: 15.0,
            transmitPower: 20.0,
            maxRange: 50000
        });
        const comms2 = physicsEngine.subsystemManager.addSubsystem(sat2Id, 'communication', {
            antennaGain: 15.0,
            transmitPower: 20.0,
            maxRange: 50000
        });
        
        // Get satellite data
        const sat1Data = physicsEngine.satellites.get(sat1Id);
        const sat2Data = physicsEngine.satellites.get(sat2Id);
        
        console.log(`Satellite 1 data:`, sat1Data);
        console.log(`Satellite 2 data:`, sat2Data);
        
        // Update communication links for sat1
        comms1.updateCommunicationLinks(sat1Data, {});
        
        // Check logs
        const targetLogs = logs.filter(log => log.includes('found') && log.includes('targets'));
        const linkLogs = logs.filter(log => log.includes('established link') || log.includes('failed to link'));
        
        console.log('Target logs:', targetLogs);
        console.log('Link logs:', linkLogs);
        
        // Check active connections
        const activeConnections1 = comms1.getActiveConnections();
        console.log(`Sat1 active connections:`, activeConnections1);
        
        expect(targetLogs.length).toBeGreaterThan(0);
        expect(activeConnections1.length).toBe(1);
        expect(activeConnections1[0].targetId).toBe(sat2Id);
        
        // Also update from sat2's perspective
        comms2.updateCommunicationLinks(sat2Data, {});
        const activeConnections2 = comms2.getActiveConnections();
        console.log(`Sat2 active connections:`, activeConnections2);
        
        expect(activeConnections2.length).toBe(1);
        expect(activeConnections2[0].targetId).toBe(sat1Id);
    });

    it('should handle satellites with no position data', () => {
        const satId = 'no-position-sat';
        
        // Add satellite without proper position
        physicsEngine.addSatellite({
            id: satId,
            position: [7000, 0, 0],
            velocity: [0, 7.5, 0],
            mass: 100,
            centralBodyNaifId: 399
        });
        
        const comms = physicsEngine.subsystemManager.addSubsystem(satId, 'communication');
        
        // Create a satellite data object without position (simulating missing data)
        const badSatData = { id: satId };
        
        // This should warn but not crash
        comms.updateCommunicationLinks(badSatData, {});
        
        const warnLogs = logs.filter(log => log.includes('[WARN]') && log.includes('position'));
        expect(warnLogs.length).toBeGreaterThan(0);
    });
});