import { describe, it, expect, beforeEach } from 'vitest';
import { StateVectorCalculator } from '../src/physics/StateVectorCalculator.js';
import { SolarSystemHierarchy } from '../src/physics/SolarSystemHierarchy.js';
import { planetaryDataManager } from '../src/physics/bodies/PlanetaryDataManager.js';
import * as Astronomy from 'astronomy-engine';

describe('State Vector Debug', () => {
    let stateCalculator;
    let hierarchy;
    let testDate;

    beforeEach(async () => {
        testDate = new Date('2025-01-01T00:00:00.000Z');
        
        // Initialize planetary data
        await planetaryDataManager.initialize();
        
        // Create hierarchy and state calculator
        hierarchy = new SolarSystemHierarchy(planetaryDataManager.naifToBody);
        stateCalculator = new StateVectorCalculator(hierarchy, planetaryDataManager.naifToBody);
    });

    it('should calculate Earth state vector from Astronomy Engine', () => {
        const earthState = stateCalculator.calculateStateVector(399, testDate);
        
        console.log('Earth state from StateVectorCalculator:', earthState);
        
        expect(earthState).toBeDefined();
        expect(earthState.position).toBeDefined();
        expect(earthState.velocity).toBeDefined();
        
        // Check that position is not zero
        const posLength = Math.sqrt(
            earthState.position[0] ** 2 + 
            earthState.position[1] ** 2 + 
            earthState.position[2] ** 2
        );
        console.log('Earth distance from origin:', posLength, 'km');
        expect(posLength).toBeGreaterThan(1e8); // Should be ~150 million km
        
        // Check that velocity is not zero
        const velLength = Math.sqrt(
            earthState.velocity[0] ** 2 + 
            earthState.velocity[1] ** 2 + 
            earthState.velocity[2] ** 2
        );
        console.log('Earth velocity magnitude:', velLength, 'km/s');
        expect(velLength).toBeGreaterThan(25); // Should be ~30 km/s
    });

    it('should calculate raw Astronomy Engine state for Earth', () => {
        // Direct astronomy engine call
        const astroTime = Astronomy.MakeTime(testDate);
        const earthStateRaw = new Astronomy.StateVector('Earth', astroTime);
        
        console.log('Raw Astronomy Engine Earth state:', {
            position: [earthStateRaw.x, earthStateRaw.y, earthStateRaw.z],
            velocity: [earthStateRaw.vx, earthStateRaw.vy, earthStateRaw.vz]
        });
        
        // Convert AU to km for position
        const posKm = [
            earthStateRaw.x * 149597870.7,
            earthStateRaw.y * 149597870.7,
            earthStateRaw.z * 149597870.7
        ];
        
        // Convert AU/day to km/s for velocity
        const velKmS = [
            earthStateRaw.vx * 149597870.7 / 86400,
            earthStateRaw.vy * 149597870.7 / 86400,
            earthStateRaw.vz * 149597870.7 / 86400
        ];
        
        console.log('Converted to km and km/s:', {
            position: posKm,
            velocity: velKmS
        });
        
        const speed = Math.sqrt(velKmS[0] ** 2 + velKmS[1] ** 2 + velKmS[2] ** 2);
        console.log('Earth speed:', speed, 'km/s');
        
        expect(speed).toBeGreaterThan(25);
    });

    it('should track Earth state through hierarchy', () => {
        // Get Earth-Moon Barycenter state
        const embState = stateCalculator.calculateStateVector(3, testDate);
        console.log('EMB state:', embState);
        
        // Get Earth state
        const earthState = stateCalculator.calculateStateVector(399, testDate);
        console.log('Earth state:', earthState);
        
        // Earth should be offset from EMB
        if (embState && earthState) {
            const offset = Math.sqrt(
                (earthState.position[0] - embState.position[0]) ** 2 +
                (earthState.position[1] - embState.position[1]) ** 2 +
                (earthState.position[2] - embState.position[2]) ** 2
            );
            console.log('Earth offset from EMB:', offset, 'km');
            expect(offset).toBeGreaterThan(0);
            expect(offset).toBeLessThan(10000); // Should be ~4700 km
        }
    });
});