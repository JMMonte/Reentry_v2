import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { Constants } from '../src/utils/Constants.js';
import Earth from '../src/physics/bodies/planets/Earth.js';

describe('Atmospheric Drag Calculations', () => {
    let physicsEngine;
    
    beforeEach(() => {
        physicsEngine = new PhysicsEngine();
        // Set up Earth with proper atmospheric model
        physicsEngine.bodies[399] = {
            name: 'Earth',
            type: 'planet',
            mass: Earth.mass,
            radius: Earth.radius,
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 399,
            atmosphericModel: Earth.atmosphericModel,
            j2: Earth.j2
        };
    });

    describe('Atmospheric Density Model', () => {
        it('should calculate correct density at various altitudes', () => {
            const earth = physicsEngine.bodies[399];
            
            // Test key altitudes
            const testCases = [
                { altitude: 0, minDensity: 1.0, maxDensity: 1.3 }, // Sea level ~1.225 kg/m³
                { altitude: 100, minDensity: 1e-7, maxDensity: 1e-6 }, // Karman line
                { altitude: 200, minDensity: 1e-10, maxDensity: 5e-10 }, // LEO
                { altitude: 400, minDensity: 1e-12, maxDensity: 1e-11 }, // ISS altitude
                { altitude: 600, minDensity: 1e-14, maxDensity: 1e-13 }, // High LEO
                { altitude: 1001, expectedDensity: 0 }, // Above atmosphere
                { altitude: 1500, expectedDensity: 0 }, // Well above atmosphere
            ];
            
            testCases.forEach(test => {
                const density = earth.atmosphericModel.getDensity(test.altitude);
                
                if (test.expectedDensity !== undefined) {
                    expect(density).toBe(test.expectedDensity);
                } else {
                    expect(density).toBeGreaterThan(test.minDensity);
                    expect(density).toBeLessThan(test.maxDensity);
                }
                
                // Density should never be negative
                expect(density).toBeGreaterThanOrEqual(0);
            });
        });

        it('should have decreasing density with altitude', () => {
            const earth = physicsEngine.bodies[399];
            
            // Test that density decreases monotonically
            let previousDensity = earth.atmosphericModel.getDensity(0);
            
            for (let alt = 50; alt <= 1000; alt += 50) {
                const density = earth.atmosphericModel.getDensity(alt);
                expect(density).toBeLessThanOrEqual(previousDensity);
                previousDensity = density;
            }
        });
    });

    describe('Drag Force Calculations', () => {
        it('should calculate drag correctly for LEO satellite', () => {
            // Typical LEO satellite
            const satellite = {
                id: 'leo-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6771, 0, 0), // 400 km altitude
                velocity: new THREE.Vector3(0, 7.67, 0), // ~7.67 km/s orbital velocity
                mass: 1000, // kg
                crossSectionalArea: 10, // m²
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'leo-sat': satellite };
            
            const dragAccel = physicsEngine._computeAtmosphericDrag(satellite);
            
            // Drag should be opposite to velocity
            const dragDir = dragAccel.clone().normalize();
            const velDir = satellite.velocity.clone().normalize();
            const dotProduct = dragDir.dot(velDir);
            expect(dotProduct).toBeCloseTo(-1, 5); // Should be opposite direction
            
            // Magnitude check - at 400km, drag should be small but non-zero
            const dragMag = dragAccel.length();
            expect(dragMag).toBeGreaterThan(1e-10); // Non-zero
            expect(dragMag).toBeLessThan(1e-6); // But small
        });

        it('should scale with velocity squared', () => {
            const satellite1 = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6571, 0, 0), // 200 km altitude
                velocity: new THREE.Vector3(0, 5, 0), // 5 km/s
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            const satellite2 = {
                id: 'sat2',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6571, 0, 0), // Same altitude
                velocity: new THREE.Vector3(0, 10, 0), // 2x velocity
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'sat1': satellite1, 'sat2': satellite2 };
            
            const drag1 = physicsEngine._computeAtmosphericDrag(satellite1);
            const drag2 = physicsEngine._computeAtmosphericDrag(satellite2);
            
            // Drag should scale with v²
            const ratio = drag2.length() / drag1.length();
            expect(ratio).toBeCloseTo(4, 5); // 2² = 4
        });

        it('should scale with cross-sectional area', () => {
            const satellite1 = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6671, 0, 0), // 300 km altitude
                velocity: new THREE.Vector3(0, 7.7, 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            const satellite2 = {
                id: 'sat2',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6671, 0, 0), // Same altitude
                velocity: new THREE.Vector3(0, 7.7, 0), // Same velocity
                mass: 1000,
                crossSectionalArea: 20, // 2x area
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'sat1': satellite1, 'sat2': satellite2 };
            
            const drag1 = physicsEngine._computeAtmosphericDrag(satellite1);
            const drag2 = physicsEngine._computeAtmosphericDrag(satellite2);
            
            // Drag should scale linearly with area
            const ratio = drag2.length() / drag1.length();
            expect(ratio).toBeCloseTo(2, 5);
        });

        it('should scale inversely with mass', () => {
            const satellite1 = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6671, 0, 0), // 300 km altitude
                velocity: new THREE.Vector3(0, 7.7, 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            const satellite2 = {
                id: 'sat2',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6671, 0, 0), // Same altitude
                velocity: new THREE.Vector3(0, 7.7, 0), // Same velocity
                mass: 2000, // 2x mass
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'sat1': satellite1, 'sat2': satellite2 };
            
            const drag1 = physicsEngine._computeAtmosphericDrag(satellite1);
            const drag2 = physicsEngine._computeAtmosphericDrag(satellite2);
            
            // Acceleration should scale inversely with mass
            const ratio = drag2.length() / drag1.length();
            expect(ratio).toBeCloseTo(0.5, 5);
        });

        it('should be zero above atmosphere', () => {
            const satellite = {
                id: 'high-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(7371, 0, 0), // 1000 km altitude
                velocity: new THREE.Vector3(0, 6.0, 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'high-sat': satellite };
            
            const dragAccel = physicsEngine._computeAtmosphericDrag(satellite);
            
            // Should be effectively zero above atmosphere (within floating point precision)
            expect(dragAccel.length()).toBeLessThan(1e-10);
        });

        it('should handle zero velocity correctly', () => {
            const satellite = {
                id: 'static-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6571, 0, 0), // 200 km altitude
                velocity: new THREE.Vector3(0, 0, 0), // Zero velocity
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'static-sat': satellite };
            
            const dragAccel = physicsEngine._computeAtmosphericDrag(satellite);
            
            // Should be zero when velocity is zero
            expect(dragAccel.length()).toBe(0);
        });
    });

    describe('Orbital Decay Simulation', () => {
        it('should cause energy loss due to drag', () => {
            // Low altitude satellite
            const satellite = {
                id: 'decay-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6671, 0, 0), // 300 km altitude
                velocity: new THREE.Vector3(0, 7.73, 0), // Circular velocity
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'decay-sat': satellite };
            
            // Track initial specific orbital energy
            const r0 = satellite.position.length();
            const v0 = satellite.velocity.length();
            const mu = Constants.G * physicsEngine.bodies[399].mass;
            const initialEnergy = (v0 * v0 / 2) - (mu / r0);
            
            // Calculate drag work over one orbit
            const orbitalPeriod = 2 * Math.PI * Math.sqrt(r0 * r0 * r0 / mu);
            const numSteps = 100;
            const dt = orbitalPeriod / numSteps;
            
            let totalDragWork = 0;
            let totalDistance = 0;
            
            // Clone satellite for simulation
            const simSat = {
                ...satellite,
                position: satellite.position.clone(),
                velocity: satellite.velocity.clone()
            };
            
            for (let i = 0; i < numSteps; i++) {
                // Get drag acceleration only
                const dragAccel = physicsEngine._computeAtmosphericDrag(simSat);
                const dragForce = dragAccel.clone().multiplyScalar(simSat.mass);
                
                // Calculate work done by drag (F·v·dt)
                const work = dragForce.dot(simSat.velocity) * dt;
                totalDragWork += work;
                
                // Simple circular motion update (ignore drag effect on trajectory)
                const angle = (2 * Math.PI * i) / numSteps;
                simSat.position.set(r0 * Math.cos(angle), r0 * Math.sin(angle), 0);
                simSat.velocity.set(-v0 * Math.sin(angle), v0 * Math.cos(angle), 0);
                
                totalDistance += v0 * dt;
            }
            
            // Drag work should be negative (energy loss)
            expect(totalDragWork).toBeLessThan(0);
            
            // Energy loss per orbit should be small but measurable
            const energyLossPerOrbit = -totalDragWork / simSat.mass;
            expect(energyLossPerOrbit).toBeGreaterThan(0);
            expect(energyLossPerOrbit).toBeLessThan(Math.abs(initialEnergy) * 0.01); // Less than 1% per orbit
        });
    });

    describe('Edge Cases and Stability', () => {
        it('should handle satellites at exact Earth radius', () => {
            const satellite = {
                id: 'surface-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6371, 0, 0), // Exactly at Earth radius
                velocity: new THREE.Vector3(0, 7.9, 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'surface-sat': satellite };
            
            // Should not throw error
            expect(() => {
                physicsEngine._computeAtmosphericDrag(satellite);
            }).not.toThrow();
        });

        it('should handle very high velocities gracefully', () => {
            const satellite = {
                id: 'fast-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6571, 0, 0), // 200 km altitude
                velocity: new THREE.Vector3(0, 20, 0), // Very high velocity
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'fast-sat': satellite };
            
            const dragAccel = physicsEngine._computeAtmosphericDrag(satellite);
            
            // Should produce finite result
            expect(isFinite(dragAccel.length())).toBe(true);
            expect(dragAccel.length()).toBeGreaterThan(0);
        });

        it('should handle missing satellite properties with defaults', () => {
            const satellite = {
                id: 'minimal-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6571, 0, 0),
                velocity: new THREE.Vector3(0, 7.78, 0)
                // Missing mass, area, Cd
            };

            physicsEngine.satellites = { 'minimal-sat': satellite };
            
            const dragAccel = physicsEngine._computeAtmosphericDrag(satellite);
            
            // Should use defaults and not crash
            expect(dragAccel).toBeDefined();
            expect(isFinite(dragAccel.length())).toBe(true);
        });
    });
});