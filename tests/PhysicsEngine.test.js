import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { Constants } from '../src/utils/Constants.js';
import { SolarSystemHierarchy } from '../src/physics/SolarSystemHierarchy.js';

// Mock StateVectorCalculator
vi.mock('../src/physics/StateVectorCalculator.js', () => ({
    StateVectorCalculator: class {
        constructor() {}
        getBodyState(bodyName, julianDate) {
            // Return mock positions based on bodyName
            if (bodyName === 'Earth') {
                return {
                    position: new THREE.Vector3(150000000, 0, 0),
                    velocity: new THREE.Vector3(0, 30, 0)
                };
            } else if (bodyName === 'Moon') {
                return {
                    position: new THREE.Vector3(150384400, 0, 0),
                    velocity: new THREE.Vector3(0, 31.022, 0)
                };
            } else if (bodyName === 'Sun') {
                return {
                    position: new THREE.Vector3(0, 0, 0),
                    velocity: new THREE.Vector3(0, 0, 0)
                };
            }
            return {
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0)
            };
        }
    }
}));

// Mock PositionManager
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

// Mock PlanetaryDataManager
vi.mock('../src/physics/bodies/PlanetaryDataManager.js', () => ({
    planetaryDataManager: {
        getAllBodies: () => []
    }
}));

// Mock Astronomy Engine
vi.mock('astronomy-engine', () => ({
    Body: {
        Sun: { name: 'Sun' },
        Earth: { name: 'Earth' },
        Moon: { name: 'Moon' },
        Mercury: { name: 'Mercury' },
        Venus: { name: 'Venus' },
        Mars: { name: 'Mars' },
        Jupiter: { name: 'Jupiter' },
        Saturn: { name: 'Saturn' },
        Uranus: { name: 'Uranus' },
        Neptune: { name: 'Neptune' },
        Pluto: { name: 'Pluto' },
        EMB: { name: 'EMB' },
        SSB: { name: 'SSB' }
    },
    MakeTime: vi.fn(() => ({ ut: 0, tt: 0 })),
    AxisInfo: vi.fn().mockReturnValue({
        ra: 0, // Right ascension in hours
        dec: 90, // Declination in degrees  
        spin: 0, // Spin angle in degrees
        north: { x: 0, y: 0, z: 1 }
    }),
    StateVector: vi.fn().mockReturnValue({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        t: { ut: 0, tt: 0 }
    }),
    BaryState: vi.fn().mockReturnValue({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        t: { ut: 0, tt: 0 }
    }),
    Rotation_EQJ_ECL: vi.fn(() => ({ rot: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] })),
    RotateVector: vi.fn((rotation, vector) => vector),
    Rotation_ECL_EQJ: vi.fn(() => ({ rot: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] })),
    RotationAxis: vi.fn().mockReturnValue({
        ra: 0,
        dec: 90,
        spin: 0,
        north: { x: 0, y: 0, z: 1 }
    }),
    GeoMoon: vi.fn().mockReturnValue({
        x: 384400, y: 0, z: 0,
        vx: 0, vy: 1.022, vz: 0,
        t: { ut: 0, tt: 0 }
    })
}));

// Mock SolarSystemHierarchy
vi.mock('../src/physics/SolarSystemHierarchy.js', () => ({
    SolarSystemHierarchy: class {
        constructor() {
            this.hierarchy = new Map();
            // Simple hierarchy: Sun -> Earth -> Moon
            this.hierarchy.set(399, 10); // Earth's parent is Sun
            this.hierarchy.set(301, 399); // Moon's parent is Earth
        }
        getParent(naifId) {
            return this.hierarchy.get(naifId);
        }
        getChildren(naifId) {
            const children = [];
            for (const [child, parent] of this.hierarchy) {
                if (parent === naifId) children.push(child);
            }
            return children;
        }
    }
}));

// Mock celestial bodies data
vi.mock('../src/physics/bodies/planets/Earth.js', () => ({
    EarthData: {
        naif: 399,
        name: 'Earth',
        type: 'planet',
        mass: 5.972e24, // kg
        GM: 398600.44, // km³/s²
        radius: 6371, // km
        J2: 0.00108263,
        atmosphere: {
            maxAltitude: 1000, // km
            minAltitude: 0,
            scaleHeight: 8.5, // km
            referenceDensity: 1.225e-9, // kg/m³ at sea level (converted to kg/km³)
            referenceAltitude: 0
        }
    }
}));

vi.mock('../src/physics/bodies/planets/Sun.js', () => ({
    SunData: {
        naif: 10,
        name: 'Sun',
        type: 'star',
        mass: 1.989e30, // kg
        GM: 132712440018, // km³/s²
        radius: 695700 // km
    }
}));

vi.mock('../src/physics/bodies/moons/EarthMoons.js', () => ({
    MoonData: {
        naif: 301,
        name: 'Moon',
        type: 'moon',
        mass: 7.342e22, // kg
        GM: 4902.8, // km³/s²
        radius: 1737 // km
    }
}));

describe('PhysicsEngine Satellite Perturbations', () => {
    let physicsEngine;
    let mockDate;

    beforeEach(() => {
        // Set up a mock date
        mockDate = new Date('2025-01-01T00:00:00.000Z');
        vi.useFakeTimers();
        vi.setSystemTime(mockDate);

        // Create physics engine instance
        physicsEngine = new PhysicsEngine();
        
        // Initialize the hierarchy
        physicsEngine.hierarchy = new SolarSystemHierarchy();
        
        // Initialize with mock celestial bodies
        physicsEngine.bodies = {
            10: {
                naif: 10,
                name: 'Sun',
                mass: 1.989e30,
                GM: 132712440018,
                radius: 695700,
                position: new THREE.Vector3(0, 0, 0), // At SSB origin for simplicity
                velocity: new THREE.Vector3(0, 0, 0),
                quaternion: { x: 0, y: 0, z: 0, w: 1 }
            },
            399: {
                naif: 399,
                name: 'Earth',
                mass: 5.972e24,
                GM: 398600.44,
                radius: 6371,
                J2: 0.00108263,
                position: new THREE.Vector3(150000000, 0, 0), // 150M km from Sun
                velocity: new THREE.Vector3(0, 30, 0), // 30 km/s orbital velocity
                quaternion: { x: 0, y: 0, z: 0, w: 1 },
                atmosphere: {
                    maxAltitude: 1000,
                    minAltitude: 0,
                    scaleHeight: 8.5,
                    referenceDensity: 1.225e-9,
                    referenceAltitude: 0
                }
            },
            301: {
                naif: 301,
                name: 'Moon',
                mass: 7.342e22,
                GM: 4902.8,
                radius: 1737,
                position: new THREE.Vector3(150384400, 0, 0), // 384400 km from Earth
                velocity: new THREE.Vector3(0, 31.022, 0), // Earth velocity + Moon orbital velocity
                quaternion: { x: 0, y: 0, z: 0, w: 1 }
            }
        };

        physicsEngine.simulationTime = mockDate;
    });

    describe('Coordinate Frame Transformations', () => {
        it('should correctly convert satellite position from planet-centric to SSB frame', () => {
            // Add a satellite in LEO around Earth
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399, // Earth
                position: [7000, 0, 0], // 7000 km from Earth center (629 km altitude)
                velocity: [0, 7.5, 0], // Approximate circular orbit velocity
                mass: 1000
            };

            const satId = physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get(satId);

            // Convert to global position
            const earthPos = physicsEngine.bodies[399].position;
            const satGlobalPos = satData.position.clone().add(earthPos);

            // Verify global position
            expect(satGlobalPos.x).toBeCloseTo(150000000 + 7000);
            expect(satGlobalPos.y).toBeCloseTo(0);
            expect(satGlobalPos.z).toBeCloseTo(0);
        });

        it('should maintain planet-centric reference frame during force calculations', () => {
            // Add satellite
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            // Compute acceleration
            const acceleration = physicsEngine._computeSatelliteAcceleration(satData);

            // The acceleration should be primarily towards Earth (negative X direction in this case)
            expect(acceleration.x).toBeLessThan(0);
            expect(Math.abs(acceleration.x)).toBeGreaterThan(0.005); // Should be around -0.00813 km/s² for LEO
        });
    });

    describe('Gravitational Force Calculations', () => {
        it('should calculate correct gravitational acceleration from central body', () => {
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [7000, 0, 0], // 7000 km from Earth center
                velocity: [0, 7.5, 0],
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            // Compute just the gravitational acceleration
            const acceleration = physicsEngine._computeSatelliteAcceleration(satData);

            // Expected acceleration: GM/r² = 398600.44 / 7000² = 8.135 km/s²
            const expectedAccel = -398600.44 / (7000 * 7000);
            
            // The total acceleration should be close to this (with small perturbations)
            expect(acceleration.x).toBeCloseTo(expectedAccel, 2);
        });

        it('should include perturbations from other significant bodies', () => {
            // Place satellite at L1 point between Earth and Moon
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [326400, 0, 0], // Closer to Moon, where its influence is significant
                velocity: [0, 1.1, 0],
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            // Compute acceleration
            const acceleration = physicsEngine._computeSatelliteAcceleration(satData);

            // Check that force components were calculated
            expect(satData.a_bodies).toBeDefined();
            expect(satData.a_bodies['301']).toBeDefined(); // Moon's contribution
            expect(satData.a_bodies['301'][0]).not.toBe(0); // Moon should exert force
        });

        it('should correctly handle the central body acceleration bug', () => {
            // This tests the bug found in line 549 where r.multiplyScalar modifies r in place
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [100000, 0, 0], // High orbit to ensure other bodies have influence
                velocity: [0, 3.0, 0],
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            // Calculate acceleration multiple times - should get same result
            const accel1 = physicsEngine._computeSatelliteAcceleration(satData);
            const accel2 = physicsEngine._computeSatelliteAcceleration(satData);

            expect(accel1.x).toBeCloseTo(accel2.x);
            expect(accel1.y).toBeCloseTo(accel2.y);
            expect(accel1.z).toBeCloseTo(accel2.z);
        });
    });

    describe('J2 Perturbation', () => {
        it.skip('should calculate J2 perturbation for Earth satellites', () => {
            // Equatorial orbit where J2 effect is significant
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [7000, 0, 0], // Equatorial position
                velocity: [0, 7.5, 0],
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            // Call the full acceleration computation to populate all fields
            const totalAccel = physicsEngine._computeSatelliteAcceleration(satData);
            
            // Now check the J2 component that was stored
            expect(satData.a_j2).toBeDefined();
            const j2Magnitude = Math.sqrt(
                satData.a_j2[0] * satData.a_j2[0] + 
                satData.a_j2[1] * satData.a_j2[1] + 
                satData.a_j2[2] * satData.a_j2[2]
            );
            
            // J2 should create a non-zero acceleration
            expect(j2Magnitude).toBeGreaterThan(0);
        });

        it('should not apply J2 for bodies without J2 coefficient', () => {
            // Satellite around the Moon (no J2 in our mock)
            const satellite = {
                id: 'sat1', 
                centralBodyNaifId: 301,
                position: [2000, 0, 0],
                velocity: [0, 1.5, 0],
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            const j2Accel = physicsEngine._computeJ2Perturbation(satData, physicsEngine.bodies[301]);

            expect(j2Accel.x).toBe(0);
            expect(j2Accel.y).toBe(0);
            expect(j2Accel.z).toBe(0);
        });
    });

    describe('Atmospheric Drag', () => {
        it('should calculate atmospheric drag for low Earth orbit', () => {
            // Very low orbit where drag is significant
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [6571, 0, 0], // 200 km altitude
                velocity: [0, 7.8, 0],
                mass: 1000,
                area: 10, // 10 m² cross section
                dragCoeff: 2.2
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            const dragAccel = physicsEngine._computeAtmosphericDrag(satData);

            // Drag should oppose velocity (negative Y in this case)
            expect(dragAccel.y).toBeLessThan(0);
            expect(dragAccel.length()).toBeGreaterThan(0);
        });

        it('should not apply drag outside atmosphere', () => {
            // High orbit outside atmosphere
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [8371, 0, 0], // 2000 km altitude (outside atmosphere)
                velocity: [0, 6.5, 0],
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            const dragAccel = physicsEngine._computeAtmosphericDrag(satData);

            expect(dragAccel.x).toBe(0);
            expect(dragAccel.y).toBe(0);
            expect(dragAccel.z).toBe(0);
        });
    });

    describe('Integration Tests', () => {
        it('should correctly integrate satellite orbit over time', () => {
            // Circular orbit satellite
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [7000, 0, 0],
                velocity: [0, 7.546, 0], // Circular velocity at 7000 km
                mass: 1000
            };

            physicsEngine.addSatellite(satellite);
            const satData = physicsEngine.satellites.get('sat1');

            // Store initial state
            const initialPos = satData.position.clone();
            const initialVel = satData.velocity.clone();
            const initialR = initialPos.length();

            // Integrate for 100 seconds
            const dt = 1; // 1 second timestep
            for (let i = 0; i < 100; i++) {
                const accel = physicsEngine._computeSatelliteAcceleration(satData);
                physicsEngine._integrateRK4(satData, accel, dt);
            }

            // Check orbit stability
            const finalR = satData.position.length();
            expect(Math.abs(finalR - initialR)).toBeLessThan(0.1); // Should maintain altitude

            // Check velocity magnitude is conserved
            const finalSpeed = satData.velocity.length();
            const initialSpeed = initialVel.length();
            expect(Math.abs(finalSpeed - initialSpeed)).toBeLessThan(0.01);
        });

        it('should handle SOI transitions correctly', async () => {
            // Satellite escaping Earth's SOI
            const satellite = {
                id: 'sat1',
                centralBodyNaifId: 399,
                position: [900000, 0, 0], // Near Earth's SOI boundary
                velocity: [5, 0, 0], // Escape velocity
                mass: 1000
            };

            // Set Earth's SOI radius
            physicsEngine.bodies[399].soiRadius = 925000; // km

            physicsEngine.addSatellite(satellite);

            // Integrate to push satellite outside SOI - need larger timestep
            await physicsEngine._integrateSatellites(10000); // 10000 second step

            const satData = physicsEngine.satellites.get('sat1');
            
            // Should have switched to Sun as central body (or SSB)
            expect(satData.centralBodyNaifId).not.toBe(399);
        });
    });
});