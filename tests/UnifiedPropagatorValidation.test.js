/**
 * Validation tests for the UnifiedSatellitePropagator
 * Ensures it's numerically accurate and energy-conserving
 */

import { describe, test, expect } from 'vitest';
import { UnifiedSatellitePropagator } from '../src/physics/core/UnifiedSatellitePropagator.js';
import { PhysicsConstants } from '../src/physics/core/PhysicsConstants.js';
import earthConfig from '../src/physics/data/planets/Earth.js';

describe('Unified Satellite Propagator Validation', () => {
    
    const earth = {
        ...earthConfig,
        position: [0, 0, 0],
        velocity: [0, 0, 0],
        mass: 5.972e24,
        GM: PhysicsConstants.PHYSICS.G * 5.972e24,
        radius: 6371,
        J2: 0.00108263
    };
    
    const bodies = { 399: earth };
    
    test('should conserve energy in pure Keplerian orbits', () => {
        const satellite = {
            position: [7000, 0, 0],
            velocity: [0, 7.546, 0], // Exact circular velocity
            centralBodyNaifId: 399,
            mass: 1000
        };
        
        // Test pure Keplerian motion (no perturbations)
        const initialEnergy = UnifiedSatellitePropagator.checkEnergyConservation(satellite, earth);
        
        // Propagate for one orbit
        const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(7000, 3) / earth.GM);
        const points = UnifiedSatellitePropagator.propagateOrbit({
            satellite,
            bodies,
            duration: orbitalPeriod,
            timeStep: 60,
            includeJ2: false,
            includeDrag: false,
            includeThirdBody: false
        });
        
        const finalSat = {
            position: points[points.length - 1].position,
            velocity: points[points.length - 1].velocity,
            centralBodyNaifId: 399
        };
        
        const finalEnergy = UnifiedSatellitePropagator.checkEnergyConservation(finalSat, earth);
        
        console.log('Energy Conservation Test:');
        console.log(`  Initial energy: ${initialEnergy.total.toFixed(8)} km²/s²`);
        console.log(`  Final energy: ${finalEnergy.total.toFixed(8)} km²/s²`);
        console.log(`  Energy change: ${(finalEnergy.total - initialEnergy.total).toFixed(8)} km²/s²`);
        console.log(`  Relative error: ${Math.abs(finalEnergy.total - initialEnergy.total) / Math.abs(initialEnergy.total) * 100}%`);
        
        // Energy should be conserved to high precision in Keplerian case
        const energyError = Math.abs(finalEnergy.total - initialEnergy.total) / Math.abs(initialEnergy.total);
        expect(energyError).toBeLessThan(1e-6); // Less than 0.0001% error
    });
    
    test('should produce correct acceleration magnitudes', () => {
        const testCases = [
            {
                name: 'LEO circular',
                satellite: { position: [6771, 0, 0], velocity: [0, 7.73, 0], centralBodyNaifId: 399 },
                expectedAccel: 8.87e-3, // km/s²
                tolerance: 1e-4
            },
            {
                name: 'ISS altitude',
                satellite: { position: [6779, 0, 0], velocity: [0, 7.66, 0], centralBodyNaifId: 399 },
                expectedAccel: 8.69e-3, // km/s²
                tolerance: 1e-4
            },
            {
                name: 'GEO',
                satellite: { position: [42164, 0, 0], velocity: [0, 3.07, 0], centralBodyNaifId: 399 },
                expectedAccel: 2.24e-4, // km/s²
                tolerance: 1e-5
            }
        ];
        
        testCases.forEach(testCase => {
            const accel = UnifiedSatellitePropagator.computeAcceleration(
                testCase.satellite, 
                bodies,
                { includeJ2: false, includeDrag: false, includeThirdBody: false }
            );
            
            const accelMag = Math.sqrt(accel[0]**2 + accel[1]**2 + accel[2]**2);
            
            console.log(`${testCase.name}: calculated = ${accelMag.toExponential(3)}, expected = ${testCase.expectedAccel.toExponential(3)}`);
            
            expect(Math.abs(accelMag - testCase.expectedAccel)).toBeLessThan(testCase.tolerance);
        });
    });
    
    test('should correctly handle J2 perturbations', () => {
        const satellite = {
            position: [7000, 0, 0],
            velocity: [0, 7.546, 0],
            centralBodyNaifId: 399
        };
        
        // Calculate acceleration with and without J2
        const accelNoJ2 = UnifiedSatellitePropagator.computeAcceleration(
            satellite, bodies, { includeJ2: false, includeDrag: false, includeThirdBody: false }
        );
        
        const accelWithJ2 = UnifiedSatellitePropagator.computeAcceleration(
            satellite, bodies, { includeJ2: true, includeDrag: false, includeThirdBody: false }
        );
        
        const j2Effect = [
            accelWithJ2[0] - accelNoJ2[0],
            accelWithJ2[1] - accelNoJ2[1],
            accelWithJ2[2] - accelNoJ2[2]
        ];
        
        const j2Magnitude = Math.sqrt(j2Effect[0]**2 + j2Effect[1]**2 + j2Effect[2]**2);
        const primaryMagnitude = Math.sqrt(accelNoJ2[0]**2 + accelNoJ2[1]**2 + accelNoJ2[2]**2);
        
        console.log('J2 Perturbation Analysis:');
        console.log(`  Primary gravity: ${primaryMagnitude.toExponential(3)} km/s²`);
        console.log(`  J2 perturbation: ${j2Magnitude.toExponential(3)} km/s²`);
        console.log(`  J2/Primary ratio: ${(j2Magnitude / primaryMagnitude).toExponential(3)}`);
        
        // J2 should be significant but much smaller than primary gravity
        expect(j2Magnitude).toBeGreaterThan(0);
        expect(j2Magnitude / primaryMagnitude).toBeGreaterThan(1e-6);
        expect(j2Magnitude / primaryMagnitude).toBeLessThan(1e-2);
        
        // For equatorial orbit, J2 should be primarily radial (X direction)
        expect(Math.abs(j2Effect[0])).toBeGreaterThan(Math.abs(j2Effect[1]));
        expect(Math.abs(j2Effect[0])).toBeGreaterThan(Math.abs(j2Effect[2]));
    });
    
    test('should handle third-body perturbations correctly', () => {
        const satellite = {
            position: [7000, 0, 0],
            velocity: [0, 7.546, 0],
            centralBodyNaifId: 399
        };
        
        const bodiesWithMoon = {
            399: earth,
            301: { // Moon
                position: [384400, 0, 0],
                velocity: [0, 1.023, 0],
                mass: 7.342e22,
                GM: PhysicsConstants.PHYSICS.G * 7.342e22
            }
        };
        
        const accelEarthOnly = UnifiedSatellitePropagator.computeAcceleration(
            satellite, { 399: earth }, 
            { includeJ2: false, includeDrag: false, includeThirdBody: false }
        );
        
        const accelWithMoon = UnifiedSatellitePropagator.computeAcceleration(
            satellite, bodiesWithMoon,
            { includeJ2: false, includeDrag: false, includeThirdBody: true }
        );
        
        const moonEffect = [
            accelWithMoon[0] - accelEarthOnly[0],
            accelWithMoon[1] - accelEarthOnly[1],
            accelWithMoon[2] - accelEarthOnly[2]
        ];
        
        const moonMagnitude = Math.sqrt(moonEffect[0]**2 + moonEffect[1]**2 + moonEffect[2]**2);
        const earthMagnitude = Math.sqrt(accelEarthOnly[0]**2 + accelEarthOnly[1]**2 + accelEarthOnly[2]**2);
        
        console.log('Third-body Perturbation Analysis:');
        console.log(`  Earth gravity: ${earthMagnitude.toExponential(3)} km/s²`);
        console.log(`  Moon perturbation: ${moonMagnitude.toExponential(3)} km/s²`);
        console.log(`  Moon/Earth ratio: ${(moonMagnitude / earthMagnitude).toExponential(3)}`);
        
        // Moon should have measurable but small effect on LEO satellites
        expect(moonMagnitude).toBeGreaterThan(0);
        expect(moonMagnitude / earthMagnitude).toBeGreaterThan(1e-9);
        expect(moonMagnitude / earthMagnitude).toBeLessThan(1e-4);
    });
    
    test('should produce stable long-term orbits', () => {
        const satellite = {
            position: [7000, 0, 0],
            velocity: [0, 7.546, 0],
            centralBodyNaifId: 399
        };
        
        // Propagate for 10 orbits
        const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(7000, 3) / earth.GM);
        const duration = 10 * orbitalPeriod;
        
        const points = UnifiedSatellitePropagator.propagateOrbit({
            satellite,
            bodies,
            duration,
            timeStep: 60,
            includeJ2: true,   // Include perturbations
            includeDrag: false, // But not drag (would cause decay)
            includeThirdBody: false
        });
        
        // Check orbital characteristics every orbit
        const orbitsToCheck = [1, 5, 10];
        const pointsPerOrbit = Math.floor(orbitalPeriod / 60);
        
        console.log('Long-term Orbital Stability:');
        
        orbitsToCheck.forEach(orbitNum => {
            const pointIndex = Math.min(orbitNum * pointsPerOrbit, points.length - 1);
            const point = points[pointIndex];
            
            const r = Math.sqrt(point.position[0]**2 + point.position[1]**2 + point.position[2]**2);
            const v = Math.sqrt(point.velocity[0]**2 + point.velocity[1]**2 + point.velocity[2]**2);
            
            const satState = {
                position: point.position,
                velocity: point.velocity,
                centralBodyNaifId: 399
            };
            const energy = UnifiedSatellitePropagator.checkEnergyConservation(satState, earth);
            
            console.log(`  Orbit ${orbitNum}: r=${r.toFixed(1)}km, v=${v.toFixed(3)}km/s, E=${energy.total.toFixed(6)}km²/s²`);
            
            // Orbit should remain bounded and stable
            expect(r).toBeGreaterThan(6500); // Above Earth surface
            expect(r).toBeLessThan(8000);    // Reasonable orbit
            expect(v).toBeGreaterThan(7.0);  // Sufficient velocity
            expect(v).toBeLessThan(8.0);     // Not hyperbolic
        });
    });
    
    test('should demonstrate consistent results across different scenarios', () => {
        const baseCase = {
            position: [7000, 0, 0],
            velocity: [0, 7.546, 0],
            centralBodyNaifId: 399
        };
        
        // Test same physics with different coordinate representations
        const scenarios = [
            { name: 'Base case', satellite: baseCase },
            { name: 'Rotated 90°', satellite: { ...baseCase, position: [0, 7000, 0], velocity: [-7.546, 0, 0] } },
            { name: 'Different altitude', satellite: { ...baseCase, position: [8000, 0, 0], velocity: [0, 7.0, 0] } }
        ];
        
        console.log('Consistency Test:');
        
        scenarios.forEach(scenario => {
            const accel = UnifiedSatellitePropagator.computeAcceleration(
                scenario.satellite, bodies,
                { includeJ2: true, includeDrag: false, includeThirdBody: false }
            );
            
            const accelMag = Math.sqrt(accel[0]**2 + accel[1]**2 + accel[2]**2);
            const r = Math.sqrt(scenario.satellite.position[0]**2 + scenario.satellite.position[1]**2 + scenario.satellite.position[2]**2);
            const expectedAccel = earth.GM / (r * r);
            const error = Math.abs(accelMag - expectedAccel) / expectedAccel;
            
            console.log(`  ${scenario.name}: accel=${accelMag.toFixed(8)}, expected=${expectedAccel.toFixed(8)}, error=${(error*100).toFixed(4)}%`);
            
            // Should have consistent physics
            expect(error).toBeLessThan(0.002); // Less than 0.2% error (accounts for J2)
        });
    });
});