/**
 * AtmosphericDragDebug.test.js
 * 
 * Debug atmospheric drag calculations step by step
 */

import { AtmosphericModels } from '../src/physics/core/AtmosphericModels.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Atmospheric Drag Debug', () => {
    let physicsEngine;
    let earthBody;
    
    beforeEach(async () => {
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
        earthBody = physicsEngine.bodies[399]; // Earth NAIF ID
    });

    it('should debug Earth atmospheric model', () => {
        console.log('Earth body atmospheric model:', earthBody.atmosphericModel);
        console.log('Earth body radius:', earthBody.radius);
        console.log('Earth body atmosphere:', earthBody.atmosphere);
        
        // Test density calculation
        if (earthBody.atmosphericModel && earthBody.atmosphericModel.getDensity) {
            const density400 = earthBody.atmosphericModel.getDensity(400);
            console.log('Density at 400km (from getDensity):', density400);
        }
        
        // Test static calculation
        const testAtmosphere = {
            density: 1.225e-9,
            densityScaleHeight: 8.5,
            thickness: 1000
        };
        const density400static = AtmosphericModels.calculateDensity(400, testAtmosphere);
        console.log('Density at 400km (static):', density400static);
    });

    it('should debug drag calculation components', () => {
        const position = [0, 0, earthBody.radius + 400]; // 400 km altitude
        const velocity = [7.66, 0, 0]; // ISS velocity
        const ballisticCoeff = 50; // kg/m²
        
        console.log('Position:', position);
        console.log('Velocity:', velocity);
        console.log('Earth radius:', earthBody.radius);
        console.log('Earth atmospheric model exists:', !!earthBody.atmosphericModel);
        
        const dragAccel = AtmosphericModels.computeDragAcceleration(
            position,
            velocity,
            earthBody,
            ballisticCoeff
        );
        
        console.log('Drag acceleration:', dragAccel);
        
        // Test altitude calculation
        const r = Math.sqrt(position[0]**2 + position[1]**2 + position[2]**2);
        const altitude = r - earthBody.radius;
        console.log('Calculated altitude:', altitude);
        
        // Test if we're in atmosphere
        const inAtmo = AtmosphericModels.isInAtmosphere(position, earthBody);
        console.log('In atmosphere:', inAtmo);
        
        expect(dragAccel).toBeDefined();
        expect(Array.isArray(dragAccel)).toBe(true);
    });

    it('should test atmospheric co-rotation velocity', () => {
        if (!earthBody.rotationPeriod) {
            console.log('Earth rotation period not set!');
            return;
        }
        
        console.log('Earth rotation period:', earthBody.rotationPeriod, 'seconds');
        
        const position = [earthBody.radius + 400, 0, 0]; // Equatorial position
        const omega = (2 * Math.PI) / earthBody.rotationPeriod;
        console.log('Angular velocity:', omega, 'rad/s');
        
        // Expected atmospheric velocity at equator
        const expectedVAtm = omega * (earthBody.radius + 400);
        console.log('Expected atmospheric velocity at equator:', expectedVAtm, 'km/s');
        
        // Should be ~0.464 km/s at surface (465 m/s)
        const surfaceVel = omega * earthBody.radius;
        console.log('Surface velocity:', surfaceVel, 'km/s');
    });

    it('should test unit conversions in drag formula', () => {
        // Test the unit conversion chain
        const densityKgM3 = 1.225; // kg/m³ at sea level
        const densityKgKm3 = densityKgM3 * 1e-9; // Convert to kg/km³
        console.log(`Density conversion: ${densityKgM3} kg/m³ → ${densityKgKm3} kg/km³`);
        
        const velocity = 7.66; // km/s
        const velocityMS = velocity * 1000; // m/s
        console.log(`Velocity conversion: ${velocity} km/s → ${velocityMS} m/s`);
        
        const ballisticCoeff = 50; // kg/m²
        const ballisticCoeffKm = ballisticCoeff * 1e6; // kg/km²
        console.log(`Ballistic coefficient conversion: ${ballisticCoeff} kg/m² → ${ballisticCoeffKm} kg/km²`);
        
        // Drag acceleration calculation
        const dragMag = 0.5 * densityKgKm3 * velocity * velocity / ballisticCoeffKm;
        console.log(`Drag acceleration magnitude: ${dragMag} km/s²`);
        console.log(`Drag acceleration magnitude (scientific): ${dragMag.toExponential()}`);
    });
});