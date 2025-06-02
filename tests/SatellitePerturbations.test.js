import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';
import { SolarSystemHierarchy } from '../src/physics/SolarSystemHierarchy.js';

// Mock the dependencies like in PhysicsEngine.test.js
vi.mock('../src/physics/StateVectorCalculator.js', () => ({
    StateVectorCalculator: class {
        constructor() {}
        getBodyState(bodyName, julianDate) {
            // Return realistic positions for testing
            if (bodyName === 'Earth') {
                return {
                    position: new THREE.Vector3(150000000, 0, 0), // 1 AU from Sun
                    velocity: new THREE.Vector3(0, 30, 0) // ~30 km/s orbital velocity
                };
            } else if (bodyName === 'Moon') {
                return {
                    position: new THREE.Vector3(150384400, 0, 0), // Earth + 384,400 km
                    velocity: new THREE.Vector3(0, 31.022, 0) // Earth velocity + Moon's ~1 km/s
                };
            } else if (bodyName === 'Sun') {
                return {
                    position: new THREE.Vector3(0, 0, 0),
                    velocity: new THREE.Vector3(0, 0, 0)
                };
            } else if (bodyName === 'Jupiter') {
                return {
                    position: new THREE.Vector3(778000000, 0, 0), // ~5.2 AU
                    velocity: new THREE.Vector3(0, 13, 0) // ~13 km/s
                };
            }
            return {
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0)
            };
        }
    }
}));

vi.mock('../src/physics/PositionManager.js', () => ({
    PositionManager: class {
        constructor(hierarchy) {
            this.hierarchy = hierarchy;
        }
        updatePositions(bodies, barycenters) {
            // No-op for tests
        }
    }
}));

vi.mock('../src/physics/PlanetaryDataManager.js', () => ({
    planetaryDataManager: {
        initialize: vi.fn().mockResolvedValue(undefined),
        getBodyByNaif: vi.fn((naifId) => {
            const bodies = {
                10: { name: 'sun', naifId: 10, type: 'star', mass: 1.989e30, radius: 696000, GM: 1.32712440018e11 },
                399: { 
                    name: 'earth', 
                    naifId: 399, 
                    type: 'planet', 
                    mass: 5.972e24, 
                    radius: 6371, 
                    GM: 398600.4418,
                    j2: 0.00108263,
                    poleRA: 0,
                    poleDec: 90,
                    atmosphere: {
                        thickness: 1000,
                        densityScaleHeight: 8.5
                    }
                },
                301: { name: 'moon', naifId: 301, type: 'moon', mass: 7.342e22, radius: 1737.4, GM: 4902.8 },
                599: { name: 'jupiter', naifId: 599, type: 'planet', mass: 1.898e27, radius: 69911, GM: 1.26686534e8 }
            };
            return bodies[naifId];
        }),
        getAllBodies: vi.fn(() => [])
    }
}));

describe('Satellite Perturbations and Propagation', () => {
    let physicsEngine;
    let hierarchy;

    beforeEach(async () => {
        // Create minimal hierarchy for tests
        hierarchy = {
            getBodyInfo: (naifId) => {
                const bodies = {
                    10: { name: 'Sun', type: 'star', parent: null },
                    399: { name: 'Earth', type: 'planet', parent: 0 },
                    301: { name: 'Moon', type: 'moon', parent: 399 },
                    599: { name: 'Jupiter', type: 'planet', parent: 0 }
                };
                return bodies[naifId];
            },
            getHierarchicalRelationships: () => ({}),
            needsRelativePositioning: () => false
        };

        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize(new Date('2025-01-01T00:00:00Z'));
    });

    describe('Orbital Decay (Atmospheric Drag)', () => {
        it('should show altitude loss for ISS-like orbit', async () => {
            // ISS orbit parameters
            const altitude = 420; // km
            const earthRadius = 6371; // km
            const orbitalRadius = earthRadius + altitude;
            
            // Circular velocity at this altitude
            const GM = 398600.4418; // km³/s²
            const velocity = Math.sqrt(GM / orbitalRadius); // ~7.66 km/s
            
            physicsEngine.addSatellite({
                id: 'iss',
                centralBodyNaifId: 399,
                position: [orbitalRadius, 0, 0],
                velocity: [0, velocity, 0],
                mass: 420000, // ISS mass in kg
                area: 2500, // m² solar panel area
                dragCoeff: 2.2
            });

            // Get initial altitude
            const initialState = physicsEngine.getSimulationState();
            const initialSat = initialState.satellites['iss'];
            const initialR = Math.sqrt(
                initialSat.position[0]**2 + 
                initialSat.position[1]**2 + 
                initialSat.position[2]**2
            );

            // Propagate for 1 hour (3600 seconds) in 60-second steps
            for (let i = 0; i < 60; i++) {
                await physicsEngine.step(60);
            }

            // Get final altitude
            const finalState = physicsEngine.getSimulationState();
            const finalSat = finalState.satellites['iss'];
            const finalR = Math.sqrt(
                finalSat.position[0]**2 + 
                finalSat.position[1]**2 + 
                finalSat.position[2]**2
            );

            const altitudeLoss = (initialR - finalR) * 1000; // Convert to meters
            console.log(`ISS altitude loss in 1 hour: ${altitudeLoss.toFixed(1)} meters`);

            // ISS loses ~2-3 km per month, so ~3-4 meters per hour
            expect(altitudeLoss).toBeGreaterThan(0.5); // At least 0.5 meters
            expect(altitudeLoss).toBeLessThan(10); // But not more than 10 meters
        });
    });

    describe('J2 Perturbation', () => {
        it('should cause nodal precession for inclined orbit', async () => {
            const altitude = 600; // km
            const earthRadius = 6371; // km  
            const orbitalRadius = earthRadius + altitude;
            const inclination = 97.8 * Math.PI / 180; // Sun-synchronous inclination
            
            const GM = 398600.4418;
            const velocity = Math.sqrt(GM / orbitalRadius);
            
            // Inclined circular orbit
            physicsEngine.addSatellite({
                id: 'sso',
                centralBodyNaifId: 399,
                position: [orbitalRadius, 0, 0],
                velocity: [0, velocity * Math.cos(inclination), velocity * Math.sin(inclination)],
                mass: 1000,
                area: 10,
                dragCoeff: 2.2
            });

            // Get initial orbital elements
            const initialState = physicsEngine.getSimulationState();
            const initialSat = initialState.satellites['sso'];
            const r0 = new THREE.Vector3(...initialSat.position);
            const v0 = new THREE.Vector3(...initialSat.velocity);
            const h0 = r0.clone().cross(v0); // Angular momentum vector
            const n0 = new THREE.Vector3(0, 0, 1).cross(h0); // Node vector

            // Propagate for 6 hours
            for (let i = 0; i < 360; i++) {
                await physicsEngine.step(60); // 1 minute steps
            }

            // Get final orbital elements
            const finalState = physicsEngine.getSimulationState();
            const finalSat = finalState.satellites['sso'];
            const rf = new THREE.Vector3(...finalSat.position);
            const vf = new THREE.Vector3(...finalSat.velocity);
            const hf = rf.clone().cross(vf);
            const nf = new THREE.Vector3(0, 0, 1).cross(hf);

            // Calculate change in right ascension of ascending node
            const raan0 = Math.atan2(n0.y, n0.x);
            const raanf = Math.atan2(nf.y, nf.x);
            let deltaRaan = (raanf - raan0) * 180 / Math.PI;
            
            // Normalize to [-180, 180]
            if (deltaRaan > 180) deltaRaan -= 360;
            if (deltaRaan < -180) deltaRaan += 360;

            console.log(`Nodal precession in 6 hours: ${deltaRaan.toFixed(3)}°`);

            // Sun-synchronous orbit should precess ~0.986°/day = ~0.247° in 6 hours
            expect(Math.abs(deltaRaan)).toBeGreaterThan(0.1);
            expect(Math.abs(deltaRaan)).toBeLessThan(0.5);
        });
    });

    describe('Third-Body Perturbations', () => {
        it('should show lunar perturbation on high altitude satellite', async () => {
            // High altitude where Moon's gravity matters
            const altitude = 30000; // km
            const earthRadius = 6371; // km
            const orbitalRadius = earthRadius + altitude;
            
            const GM = 398600.4418;
            const velocity = Math.sqrt(GM / orbitalRadius);
            
            physicsEngine.addSatellite({
                id: 'geo-high',
                centralBodyNaifId: 399,
                position: [orbitalRadius, 0, 0],
                velocity: [0, velocity, 0],
                mass: 3000,
                area: 50,
                dragCoeff: 2.2
            });

            // Track position over time
            const positions = [];
            
            // Propagate for 12 hours to see lunar effects
            for (let i = 0; i < 72; i++) {
                const state = physicsEngine.getSimulationState();
                const sat = state.satellites['geo-high'];
                positions.push([...sat.position]);
                
                await physicsEngine.step(600); // 10 minute steps
            }

            // Calculate variation in orbital radius
            const radii = positions.map(p => Math.sqrt(p[0]**2 + p[1]**2 + p[2]**2));
            const minR = Math.min(...radii);
            const maxR = Math.max(...radii);
            const variation = maxR - minR;

            console.log(`Orbital radius variation due to lunar perturbation: ${variation.toFixed(2)} km`);

            // Should show some variation due to Moon's gravity
            expect(variation).toBeGreaterThan(0.1); // At least 100m variation
            expect(variation).toBeLessThan(50); // But not excessive
        });
    });

    describe('GEO Satellite Stability', () => {
        it('should maintain geostationary position', async () => {
            const geoRadius = 42164; // km
            const geoVelocity = 3.075; // km/s
            
            physicsEngine.addSatellite({
                id: 'geo',
                centralBodyNaifId: 399,
                position: [geoRadius, 0, 0],
                velocity: [0, geoVelocity, 0],
                mass: 3000,
                area: 50,
                dragCoeff: 2.2
            });

            // Initial longitude
            const lon0 = 0; // Starting at 0° longitude

            // Propagate for 24 hours
            for (let i = 0; i < 144; i++) {
                await physicsEngine.step(600); // 10 minute steps
            }

            // Final position
            const finalState = physicsEngine.getSimulationState();
            const finalSat = finalState.satellites['geo'];
            
            // Calculate longitude drift
            const lonf = Math.atan2(finalSat.position[1], finalSat.position[0]) * 180 / Math.PI;
            const drift = lonf - lon0;

            console.log(`GEO satellite longitude drift in 24 hours: ${drift.toFixed(3)}°`);

            // Should stay relatively stationary
            expect(Math.abs(drift)).toBeLessThan(0.5); // Less than 0.5° drift
        });
    });

    describe('Eccentric Orbit Evolution', () => {
        it('should maintain Molniya orbit characteristics', async () => {
            // Molniya orbit: high eccentricity, 12-hour period
            const perigeeAlt = 600; // km
            const apogeeAlt = 39750; // km
            const earthRadius = 6371; // km
            const rp = earthRadius + perigeeAlt;
            const ra = earthRadius + apogeeAlt;
            
            const GM = 398600.4418;
            const a = (rp + ra) / 2; // Semi-major axis
            const e = (ra - rp) / (ra + rp); // Eccentricity
            
            // Velocity at perigee
            const vp = Math.sqrt(GM * (2/rp - 1/a));
            
            physicsEngine.addSatellite({
                id: 'molniya',
                centralBodyNaifId: 399,
                position: [rp, 0, 0],
                velocity: [0, vp, 0],
                mass: 1000,
                area: 10,
                dragCoeff: 2.2
            });

            // Track apogee and perigee over half orbit (6 hours)
            let minR = Infinity;
            let maxR = 0;
            
            for (let i = 0; i < 360; i++) {
                const state = physicsEngine.getSimulationState();
                const sat = state.satellites['molniya'];
                const r = Math.sqrt(sat.position[0]**2 + sat.position[1]**2 + sat.position[2]**2);
                
                minR = Math.min(minR, r);
                maxR = Math.max(maxR, r);
                
                await physicsEngine.step(60); // 1 minute steps
            }

            const measuredE = (maxR - minR) / (maxR + minR);
            console.log(`Molniya eccentricity: expected=${e.toFixed(3)}, measured=${measuredE.toFixed(3)}`);

            // Should maintain eccentricity
            expect(Math.abs(measuredE - e)).toBeLessThan(0.01);
        });
    });
});