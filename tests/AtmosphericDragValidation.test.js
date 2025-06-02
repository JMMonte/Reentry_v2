/**
 * AtmosphericDragValidation.test.js
 * 
 * Comprehensive tests for atmospheric drag calculations to validate realistic physics
 */

import { AtmosphericModels } from '../src/physics/core/AtmosphericModels.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Atmospheric Drag Validation', () => {
    let physicsEngine;
    let earthBody;
    
    beforeEach(async () => {
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
        
        // Get Earth body for testing
        earthBody = physicsEngine.bodies[399]; // Earth NAIF ID
        
        // Ensure Earth has atmospheric model
        if (!earthBody.atmosphericModel) {
            earthBody.atmosphericModel = {
                maxAltitude: 1000,
                minAltitude: 0,
                referenceAltitude: 0,
                referenceDensity: 1.225e-9, // kg/km³ (corrected from kg/m³)
                scaleHeight: 8.5
            };
        }
    });

    describe('Atmospheric Density Calculations', () => {
        it('should calculate correct sea level density', () => {
            const density = AtmosphericModels.calculateDensity(0, {
                density: 1.225e-9, // kg/km³ 
                densityScaleHeight: 8.5
            });
            
            expect(density).toBeCloseTo(1.225e-9, 12);
        });

        it('should decrease density exponentially with altitude', () => {
            const seaLevel = AtmosphericModels.calculateDensity(0, {
                density: 1.225e-9,
                densityScaleHeight: 8.5
            });
            
            const at10km = AtmosphericModels.calculateDensity(10, {
                density: 1.225e-9,
                densityScaleHeight: 8.5
            });
            
            const at20km = AtmosphericModels.calculateDensity(20, {
                density: 1.225e-9,
                densityScaleHeight: 8.5
            });
            
            expect(at10km).toBeLessThan(seaLevel);
            expect(at20km).toBeLessThan(at10km);
            
            // Check exponential relationship
            const expectedAt10km = seaLevel * Math.exp(-10 / 8.5);
            expect(at10km).toBeCloseTo(expectedAt10km, 15);
        });

        it('should return zero density above atmosphere thickness', () => {
            const density = AtmosphericModels.calculateDensity(200, {
                density: 1.225e-9,
                densityScaleHeight: 8.5,
                thickness: 100
            });
            
            expect(density).toBe(0);
        });
    });

    describe('ISS Orbital Decay Validation', () => {
        it('should produce realistic orbital decay for ISS-like satellite', async () => {
            // ISS parameters - position from Earth center including radius
            const earthRadius = earthBody.radius; // ~6371 km
            const issAltitude = 408; // km
            const issParams = {
                id: 'iss-test',
                position: [0, 0, earthRadius + issAltitude], // Position from Earth center
                velocity: [7.66, 0, 0], // ~7.66 km/s orbital velocity
                mass: 450000, // 450 tons
                crossSectionalArea: 4000, // ~4000 m² cross-sectional area
                dragCoefficient: 2.2,
                centralBodyNaifId: 399
            };

            physicsEngine.addSatellite(issParams);
            const satellite = physicsEngine.satellites.get('iss-test');
            
            // Record initial altitude
            const initialAltitude = satellite.position.length() - earthBody.radius;
            console.log(`Initial altitude: ${initialAltitude.toFixed(1)} km`);
            
            // Simulate one day (86400 seconds)
            const oneDay = 86400;
            const timeStep = 60; // 1 minute steps
            let totalDrag = 0;
            let dragSamples = 0;
            
            for (let t = 0; t < oneDay; t += timeStep) {
                await physicsEngine.step(timeStep);
                
                // Track drag acceleration magnitude
                if (satellite.a_drag && satellite.a_drag.length === 3) {
                    const dragMag = Math.sqrt(
                        satellite.a_drag[0]**2 + 
                        satellite.a_drag[1]**2 + 
                        satellite.a_drag[2]**2
                    );
                    totalDrag += dragMag;
                    dragSamples++;
                }
            }
            
            // Check final altitude
            const finalAltitude = satellite.position.length() - earthBody.radius;
            const altitudeLoss = initialAltitude - finalAltitude;
            const averageDrag = totalDrag / dragSamples;
            
            console.log(`Final altitude: ${finalAltitude.toFixed(1)} km`);
            console.log(`Altitude loss: ${altitudeLoss.toFixed(3)} km per day`);
            console.log(`Average drag acceleration: ${averageDrag.toExponential(3)} km/s²`);
            
            // Validate realistic orbital decay
            // ISS loses ~100-200 meters per day at 400km altitude
            expect(altitudeLoss).toBeGreaterThan(0.05); // At least 50 meters
            expect(altitudeLoss).toBeLessThan(1.0);     // Less than 1 km (too much)
            
            // Drag acceleration should be small but measurable
            expect(averageDrag).toBeGreaterThan(1e-9);  // Detectable
            expect(averageDrag).toBeLessThan(1e-6);     // Not extreme
        });

        it('should show negligible drag at higher altitudes', async () => {
            // High altitude satellite (800 km)
            const earthRadius = earthBody.radius;
            const highAltitude = 800; // km
            const highSatParams = {
                id: 'high-test',
                position: [0, 0, earthRadius + highAltitude], // Position from Earth center
                velocity: [7.45, 0, 0], // Adjusted orbital velocity
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2,
                centralBodyNaifId: 399
            };

            physicsEngine.addSatellite(highSatParams);
            const satellite = physicsEngine.satellites.get('high-test');
            
            const initialAltitude = satellite.position.length() - earthBody.radius;
            
            // Simulate one day
            const oneDay = 86400;
            const timeStep = 300; // 5 minute steps for efficiency
            
            for (let t = 0; t < oneDay; t += timeStep) {
                await physicsEngine.step(timeStep);
            }
            
            const finalAltitude = satellite.position.length() - earthBody.radius;
            const altitudeLoss = initialAltitude - finalAltitude;
            
            console.log(`High altitude loss: ${altitudeLoss.toFixed(6)} km per day`);
            
            // At 800 km, drag should be minimal
            expect(altitudeLoss).toBeLessThan(0.01); // Less than 10 meters per day
        });
    });

    describe('Drag Force Direction and Magnitude', () => {
        it('should apply drag opposite to velocity vector', () => {
            const position = [0, 0, earthBody.radius + 400]; // 400 km altitude from Earth center
            const velocity = [7.66, 0, 0]; // Eastward velocity
            
            const dragAccel = AtmosphericModels.computeDragAcceleration(
                position,
                velocity,
                earthBody,
                50 // ballistic coefficient kg/m²
            );
            
            // Drag should be opposite to velocity (negative X direction)
            expect(dragAccel[0]).toBeLessThan(0);
            expect(Math.abs(dragAccel[1])).toBeLessThan(Math.abs(dragAccel[0]));
            expect(Math.abs(dragAccel[2])).toBeLessThan(Math.abs(dragAccel[0]));
        });

        it('should scale with velocity squared', () => {
            const position = [0, 0, earthBody.radius + 400]; // 400 km altitude from Earth center
            
            const lowVel = [3.0, 0, 0];
            const highVel = [6.0, 0, 0]; // 2x velocity
            
            const dragLow = AtmosphericModels.computeDragAcceleration(
                position, lowVel, earthBody, 50
            );
            const dragHigh = AtmosphericModels.computeDragAcceleration(
                position, highVel, earthBody, 50
            );
            
            const dragLowMag = Math.sqrt(dragLow[0]**2 + dragLow[1]**2 + dragLow[2]**2);
            const dragHighMag = Math.sqrt(dragHigh[0]**2 + dragHigh[1]**2 + dragHigh[2]**2);
            
            // Drag should scale approximately as velocity squared
            const ratio = dragHighMag / dragLowMag;
            expect(ratio).toBeGreaterThan(3.5); // Close to 4x
            expect(ratio).toBeLessThan(4.5);
        });

        it('should account for atmospheric co-rotation', () => {
            // Test at equator where co-rotation effect is maximum
            const equatorPosition = [earthBody.radius + 400, 0, 0]; // 400 km altitude at equator
            const stationaryVel = [0, 0, 0]; // Stationary relative to Earth
            
            const dragAccel = AtmosphericModels.computeDragAcceleration(
                equatorPosition,
                stationaryVel,
                earthBody,
                50
            );
            
            // Should have some drag due to relative motion with rotating atmosphere
            const dragMag = Math.sqrt(dragAccel[0]**2 + dragAccel[1]**2 + dragAccel[2]**2);
            expect(dragMag).toBeGreaterThan(0);
        });
    });

    describe('Ballistic Coefficient Effects', () => {
        it('should produce less drag for higher ballistic coefficient', () => {
            const position = [0, 0, earthBody.radius + 400]; // 400 km altitude from Earth center
            const velocity = [7.66, 0, 0];
            
            const lowBc = 10;  // kg/m² - high drag
            const highBc = 100; // kg/m² - low drag
            
            const dragLowBc = AtmosphericModels.computeDragAcceleration(
                position, velocity, earthBody, lowBc
            );
            const dragHighBc = AtmosphericModels.computeDragAcceleration(
                position, velocity, earthBody, highBc
            );
            
            const dragLowMag = Math.sqrt(dragLowBc[0]**2 + dragLowBc[1]**2 + dragLowBc[2]**2);
            const dragHighMag = Math.sqrt(dragHighBc[0]**2 + dragHighBc[1]**2 + dragHighBc[2]**2);
            
            expect(dragHighMag).toBeLessThan(dragLowMag);
            expect(dragLowMag / dragHighMag).toBeCloseTo(10, 1); // Should be ~10x ratio
        });
    });

    describe('Unit Conversion Validation', () => {
        it('should properly convert between km and m units', () => {
            // Test the fixed density conversion
            const atmosphere = {
                density: 1.225e-9, // kg/km³ (corrected)
                densityScaleHeight: 8.5
            };
            
            const density = AtmosphericModels.calculateDensity(0, atmosphere);
            
            // Convert back to kg/m³ for validation
            const densityKgM3 = density * 1e9; // Convert kg/km³ to kg/m³
            expect(densityKgM3).toBeCloseTo(1.225, 10); // Should be 1.225 kg/m³
        });

        it('should maintain unit consistency in drag calculations', () => {
            const position = [0, 0, earthBody.radius + 400]; // km from Earth center
            const velocity = [7.66, 0, 0]; // km/s
            const ballisticCoeff = 50; // kg/m²
            
            const dragAccel = AtmosphericModels.computeDragAcceleration(
                position, velocity, earthBody, ballisticCoeff
            );
            
            // Result should be in km/s²
            expect(Array.isArray(dragAccel)).toBe(true);
            expect(dragAccel.length).toBe(3);
            
            // Should be reasonable magnitude for km/s² units
            const dragMag = Math.sqrt(dragAccel[0]**2 + dragAccel[1]**2 + dragAccel[2]**2);
            expect(dragMag).toBeGreaterThan(1e-12); // Detectable in km/s²
            expect(dragMag).toBeLessThan(1e-3);     // Not unreasonably large
        });
    });
});