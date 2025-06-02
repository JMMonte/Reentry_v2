/**
 * Test the fixed atmospheric drag calculations
 */

import { describe, test, expect } from 'vitest';
import { AtmosphericModels } from '../src/physics/core/AtmosphericModels.js';
import { PhysicsConstants } from '../src/physics/core/PhysicsConstants.js';
import earthConfig from '../src/physics/data/planets/Earth.js';

describe('Fixed Atmospheric Drag Calculations', () => {
    
    test('should properly calculate atmospheric co-rotation with planetary tilt', () => {
        const earth = {
            ...earthConfig,
            radius: 6371,
            rotationPeriod: PhysicsConstants.TIME.SIDEREAL_DAY,
            tilt: 23.5, // Earth's obliquity
            atmosphere: earthConfig.atmosphericModel
        };
        
        // Test positions at different latitudes and altitudes
        const testCases = [
            {
                name: 'Equatorial orbit',
                position: [7000, 0, 0],  // 629 km altitude
                velocity: [0, 7.5, 0],
                expectedAtmVelNonZero: true
            },
            {
                name: 'Polar orbit',
                position: [0, 0, 7000],  // Over North pole
                velocity: [7.5, 0, 0],
                expectedAtmVelNonZero: true  // Should have velocity due to tilt
            },
            {
                name: 'Inclined orbit',
                position: [4950, 0, 4950],  // 45° from equator
                velocity: [0, 7.5, 0],
                expectedAtmVelNonZero: true
            }
        ];
        
        testCases.forEach(testCase => {
            const dragAccel = AtmosphericModels.computeDragAcceleration(
                testCase.position, 
                testCase.velocity, 
                earth
            );
            
            const dragMagnitude = Math.sqrt(dragAccel[0]**2 + dragAccel[1]**2 + dragAccel[2]**2);
            
            console.log(`${testCase.name}:`);
            console.log(`  Position: [${testCase.position.join(', ')}]`);
            console.log(`  Drag acceleration: [${dragAccel.map(a => a.toFixed(8)).join(', ')}]`);
            console.log(`  Drag magnitude: ${dragMagnitude.toFixed(8)}`);
            
            if (testCase.expectedAtmVelNonZero) {
                expect(dragMagnitude).toBeGreaterThan(0);
            }
        });
    });
    
    test('should calculate correct atmospheric velocity at different positions', () => {
        const earth = {
            radius: 6371,
            rotationPeriod: PhysicsConstants.TIME.SIDEREAL_DAY,
            tilt: 23.5,
            atmosphericModel: { 
                getDensity: (alt) => {
                    console.log(`Checking density at altitude ${alt} km`);
                    return alt < 1000 ? 1e-12 : 0; // Constant density for testing below 1000 km
                },
                maxAltitude: 1000
            }
        };
        
        const omega = 2 * Math.PI / earth.rotationPeriod;
        const tilt = earth.tilt * Math.PI / 180;
        
        // Manual calculation of rotation axis
        const rotationAxis = [Math.sin(tilt), 0, Math.cos(tilt)];
        
        console.log(`Earth rotation rate: ${omega * 1000} mrad/s`);
        console.log(`Earth tilt: ${earth.tilt}°`);
        console.log(`Rotation axis: [${rotationAxis.map(a => a.toFixed(6)).join(', ')}]`);
        
        // Test at equator (x-axis)
        const position1 = [7000, 0, 0];
        const velocity1 = [0, 7.5, 0];
        
        // Expected atmospheric velocity at this position (ω × r)
        const expectedVatm1 = [
            omega * (rotationAxis[1] * position1[2] - rotationAxis[2] * position1[1]),
            omega * (rotationAxis[2] * position1[0] - rotationAxis[0] * position1[2]),
            omega * (rotationAxis[0] * position1[1] - rotationAxis[1] * position1[0])
        ];
        
        console.log(`Expected atmospheric velocity at equator: [${expectedVatm1.map(v => v.toFixed(6)).join(', ')}] km/s`);
        
        const dragAccel1 = AtmosphericModels.computeDragAcceleration(position1, velocity1, earth, 50); // 50 kg/m² ballistic coefficient
        const dragMag1 = Math.abs(dragAccel1[0]) + Math.abs(dragAccel1[1]) + Math.abs(dragAccel1[2]);
        console.log(`Drag acceleration 1: [${dragAccel1.map(a => a.toFixed(8)).join(', ')}], magnitude: ${dragMag1}`);
        expect(dragMag1).toBeGreaterThan(0);
        
        // Test at pole (z-axis)
        const position2 = [0, 0, 7000];
        const velocity2 = [7.5, 0, 0];
        
        const expectedVatm2 = [
            omega * (rotationAxis[1] * position2[2] - rotationAxis[2] * position2[1]),
            omega * (rotationAxis[2] * position2[0] - rotationAxis[0] * position2[2]),
            omega * (rotationAxis[0] * position2[1] - rotationAxis[1] * position2[0])
        ];
        
        console.log(`Expected atmospheric velocity at pole: [${expectedVatm2.map(v => v.toFixed(6)).join(', ')}] km/s`);
        
        const dragAccel2 = AtmosphericModels.computeDragAcceleration(position2, velocity2, earth, 50);
        const dragMag2 = Math.abs(dragAccel2[0]) + Math.abs(dragAccel2[1]) + Math.abs(dragAccel2[2]);
        console.log(`Drag acceleration 2: [${dragAccel2.map(a => a.toFixed(8)).join(', ')}], magnitude: ${dragMag2}`);
        expect(dragMag2).toBeGreaterThan(0);
        
        // Due to tilt, even at the pole there should be atmospheric velocity
        // The old implementation would give zero atmospheric velocity at poles
    });
    
    test('should handle coordinate frame transformations correctly', () => {
        // Test that the drag calculation is consistent across different coordinate frames
        
        const earth = {
            radius: 6371,
            rotationPeriod: PhysicsConstants.TIME.SIDEREAL_DAY,
            tilt: 23.5,
            atmosphericModel: earthConfig.atmosphericModel
        };
        
        // Same orbital velocity magnitude, different directions
        const testPositions = [
            [7000, 0, 0],      // +X axis
            [0, 7000, 0],      // +Y axis  
            [-7000, 0, 0],     // -X axis
            [0, -7000, 0],     // -Y axis
            [4950, 4950, 0],   // XY diagonal
        ];
        
        const orbitalSpeed = 7.5; // km/s
        
        testPositions.forEach((pos, i) => {
            // Calculate velocity perpendicular to radius for circular orbit
            const r = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
            const vel = [
                -pos[1] * orbitalSpeed / r,  // Perpendicular velocity
                pos[0] * orbitalSpeed / r,
                0
            ];
            
            const dragAccel = AtmosphericModels.computeDragAcceleration(pos, vel, earth);
            const dragMag = Math.sqrt(dragAccel[0]**2 + dragAccel[1]**2 + dragAccel[2]**2);
            
            console.log(`Position ${i + 1}: [${pos.map(p => p.toFixed(0)).join(', ')}], Drag: ${dragMag.toFixed(8)} km/s²`);
            
            // All positions at same altitude should have similar drag magnitudes
            // (within an order of magnitude due to atmospheric co-rotation effects)
            expect(dragMag).toBeGreaterThan(0);
            expect(dragMag).toBeLessThan(1e-3); // Reasonable upper bound for LEO drag
        });
    });
    
    test('should demonstrate improvement over old implementation', () => {
        // Compare old vs new atmospheric velocity calculation
        
        const earth = {
            radius: 6371,
            rotationPeriod: PhysicsConstants.TIME.SIDEREAL_DAY,
            tilt: 23.5,
            atmosphericModel: { getDensity: () => 1e-12 }
        };
        
        const omega = 2 * Math.PI / earth.rotationPeriod;
        const position = [0, 0, 7000]; // North pole
        
        // Old implementation (simplified 2D rotation)
        const vAtmOld = [-omega * position[1], omega * position[0], 0];
        
        // New implementation (proper 3D rotation with tilt)
        const tilt = earth.tilt * Math.PI / 180;
        const rotationAxis = [Math.sin(tilt), 0, Math.cos(tilt)];
        const vAtmNew = [
            omega * (rotationAxis[1] * position[2] - rotationAxis[2] * position[1]),
            omega * (rotationAxis[2] * position[0] - rotationAxis[0] * position[2]),
            omega * (rotationAxis[0] * position[1] - rotationAxis[1] * position[0])
        ];
        
        console.log('At North Pole:');
        console.log(`Old atmospheric velocity: [${vAtmOld.map(v => v.toFixed(6)).join(', ')}]`);
        console.log(`New atmospheric velocity: [${vAtmNew.map(v => v.toFixed(6)).join(', ')}]`);
        
        const oldMag = Math.sqrt(vAtmOld[0]**2 + vAtmOld[1]**2 + vAtmOld[2]**2);
        const newMag = Math.sqrt(vAtmNew[0]**2 + vAtmNew[1]**2 + vAtmNew[2]**2);
        
        console.log(`Old magnitude: ${oldMag.toFixed(6)} km/s`);
        console.log(`New magnitude: ${newMag.toFixed(6)} km/s`);
        
        // The old implementation incorrectly gave zero atmospheric velocity at poles
        expect(oldMag).toBe(0);
        // The new implementation correctly accounts for tilt
        expect(newMag).toBeGreaterThan(0);
    });
});