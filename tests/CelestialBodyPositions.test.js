import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';

describe('Celestial Body Positions', () => {
    let physicsEngine;
    let testDate;

    beforeEach(async () => {
        // Use a specific date for consistent testing
        testDate = new Date('2025-01-01T00:00:00.000Z');
        
        // Initialize physics engine with real astronomy calculations
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize(testDate);
    }, 15000); // Increase timeout to 15 seconds

    describe('Planet Positions', () => {
        it('should place all planets at reasonable distances from the Sun', async () => {
            const expectedRanges = {
                199: { name: 'mercury', minAU: 0.3, maxAU: 0.5 },  // Mercury: 0.31-0.47 AU
                299: { name: 'venus', minAU: 0.7, maxAU: 0.73 },   // Venus: ~0.72 AU
                399: { name: 'earth', minAU: 0.97, maxAU: 1.02 },  // Earth: ~1 AU
                499: { name: 'mars', minAU: 1.38, maxAU: 1.67 },   // Mars: 1.38-1.67 AU
                599: { name: 'jupiter', minAU: 4.95, maxAU: 5.46 }, // Jupiter: 4.95-5.46 AU
                699: { name: 'saturn', minAU: 9.0, maxAU: 10.1 },   // Saturn: 9.0-10.1 AU
                799: { name: 'uranus', minAU: 18.3, maxAU: 20.1 },  // Uranus: 18.3-20.1 AU
                899: { name: 'neptune', minAU: 29.8, maxAU: 30.3 }  // Neptune: 29.8-30.3 AU
            };

            const sunPosition = physicsEngine.bodies[10]?.position || new THREE.Vector3(0, 0, 0);
            
            for (const [naifId, range] of Object.entries(expectedRanges)) {
                const planet = physicsEngine.bodies[naifId];
                expect(planet).toBeDefined();
                expect(planet.name).toBe(range.name);
                
                // Calculate distance from Sun in AU
                const distanceKm = planet.position.distanceTo(sunPosition);
                const distanceAU = distanceKm / PhysicsConstants.PHYSICS.AU;
                
                console.log(`${range.name}: ${distanceAU.toFixed(3)} AU from Sun`);
                
                // Check if within expected range
                expect(distanceAU).toBeGreaterThanOrEqual(range.minAU);
                expect(distanceAU).toBeLessThanOrEqual(range.maxAU);
            }
        });

        it('should have planets in roughly the same plane (ecliptic)', async () => {
            const planets = [199, 299, 399, 499, 599, 699, 799, 899];
            const sunPosition = physicsEngine.bodies[10]?.position || new THREE.Vector3(0, 0, 0);
            
            const zPositions = [];
            for (const naifId of planets) {
                const planet = physicsEngine.bodies[naifId];
                if (planet) {
                    const relativePos = planet.position.clone().sub(sunPosition);
                    const distanceXY = Math.sqrt(relativePos.x * relativePos.x + relativePos.y * relativePos.y);
                    const inclinationAngle = Math.atan2(Math.abs(relativePos.z), distanceXY) * (180 / Math.PI);
                    
                    console.log(`${planet.name}: inclination ${inclinationAngle.toFixed(2)}°`);
                    
                    // Most planets should be within ~7 degrees of the ecliptic
                    // (Mercury is an exception with ~7° inclination)
                    expect(inclinationAngle).toBeLessThan(10);
                }
            }
        });
    });

    describe('Moon Positions', () => {
        it('should place Earth\'s Moon at correct distance from Earth', async () => {
            const earth = physicsEngine.bodies[399];
            const moon = physicsEngine.bodies[301];
            
            expect(earth).toBeDefined();
            expect(moon).toBeDefined();
            
            const distanceKm = moon.position.distanceTo(earth.position);
            console.log(`Moon distance from Earth: ${distanceKm.toFixed(0)} km`);
            
            // Moon's distance varies from 356,500 to 406,700 km
            expect(distanceKm).toBeGreaterThan(350000);
            expect(distanceKm).toBeLessThan(410000);
        });

        it('should place Mars moons at correct distances', async () => {
            const mars = physicsEngine.bodies[499];
            const phobos = physicsEngine.bodies[401];
            const deimos = physicsEngine.bodies[402];
            
            if (mars && phobos) {
                const phobosDistance = phobos.position.distanceTo(mars.position);
                console.log(`Phobos distance from Mars: ${phobosDistance.toFixed(0)} km`);
                // Phobos orbits at ~9,377 km
                expect(phobosDistance).toBeGreaterThan(9000);
                expect(phobosDistance).toBeLessThan(10000);
            }
            
            if (mars && deimos) {
                const deimosDistance = deimos.position.distanceTo(mars.position);
                console.log(`Deimos distance from Mars: ${deimosDistance.toFixed(0)} km`);
                // Deimos orbits at ~23,460 km
                expect(deimosDistance).toBeGreaterThan(23000);
                expect(deimosDistance).toBeLessThan(24000);
            }
        });

        it('should place Galilean moons at correct distances from Jupiter', async () => {
            const jupiter = physicsEngine.bodies[599];
            const expectedDistances = {
                501: { name: 'Io', min: 415000, max: 425000 },        // ~421,800 km
                502: { name: 'Europa', min: 665000, max: 675000 },    // ~671,100 km
                503: { name: 'Ganymede', min: 1065000, max: 1075000 }, // ~1,070,400 km
                504: { name: 'Callisto', min: 1875000, max: 1895000 }  // ~1,882,700 km
            };
            
            for (const [naifId, expected] of Object.entries(expectedDistances)) {
                const moon = physicsEngine.bodies[naifId];
                if (jupiter && moon) {
                    const distance = moon.position.distanceTo(jupiter.position);
                    console.log(`${expected.name} distance from Jupiter: ${distance.toFixed(0)} km`);
                    expect(distance).toBeGreaterThan(expected.min);
                    expect(distance).toBeLessThan(expected.max);
                }
            }
        });
    });

    describe('Barycenter Calculations', () => {
        it('should calculate Earth-Moon barycenter correctly', async () => {
            const earth = physicsEngine.bodies[399];
            const moon = physicsEngine.bodies[301];
            const emb = physicsEngine.barycenters.get(3); // Earth-Moon Barycenter
            
            expect(earth).toBeDefined();
            expect(moon).toBeDefined();
            expect(emb).toBeDefined();
            
            // Calculate expected barycenter position
            const earthMass = earth.mass;
            const moonMass = moon.mass;
            const totalMass = earthMass + moonMass;
            
            const expectedBarycenter = new THREE.Vector3()
                .addScaledVector(earth.position, earthMass / totalMass)
                .addScaledVector(moon.position, moonMass / totalMass);
            
            // Check if calculated barycenter matches
            const distance = emb.position.distanceTo(expectedBarycenter);
            console.log(`EMB calculation error: ${distance.toFixed(3)} km`);
            
            // Should be very close (within 1 km)
            expect(distance).toBeLessThan(1);
            
            // EMB should be inside Earth (about 4,670 km from Earth's center based on mass ratio)
            const embDistanceFromEarth = emb.position.distanceTo(earth.position);
            console.log(`EMB distance from Earth center: ${embDistanceFromEarth.toFixed(0)} km`);
            // Earth-Moon mass ratio is 81.3, so EMB is at Moon distance / (1 + 81.3) ≈ 4670 km from Earth
            expect(embDistanceFromEarth).toBeGreaterThan(4500);
            expect(embDistanceFromEarth).toBeLessThan(4800);
        });
    });

    describe('Orbital Velocities', () => {
        it('should have Earth moving at approximately 30 km/s around the Sun', async () => {
            const earth = physicsEngine.bodies[399];
            expect(earth).toBeDefined();
            
            const speed = earth.velocity.length();
            console.log(`Earth orbital speed: ${speed.toFixed(1)} km/s`);
            
            // Earth's orbital speed is ~29.78 km/s
            expect(speed).toBeGreaterThan(29);
            expect(speed).toBeLessThan(31);
        });

        it('should have planets moving in prograde orbits', async () => {
            const planets = [199, 299, 399, 499, 599, 699, 799, 899];
            const sun = physicsEngine.bodies[10];
            
            for (const naifId of planets) {
                const planet = physicsEngine.bodies[naifId];
                if (planet && sun) {
                    // Calculate angular momentum vector
                    const r = planet.position.clone().sub(sun.position);
                    const v = planet.velocity.clone().sub(sun.velocity);
                    const angularMomentum = new THREE.Vector3().crossVectors(r, v);
                    
                    // For prograde orbits, angular momentum should point roughly in +Z direction
                    console.log(`${planet.name} angular momentum Z: ${angularMomentum.z > 0 ? '+' : '-'}`);
                    expect(angularMomentum.z).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('Time Evolution', () => {
        it('should update positions correctly over time', async () => {
            const earth = physicsEngine.bodies[399];
            const initialPos = earth.position.clone();
            
            // Advance time by 1 day
            const newDate = new Date(testDate.getTime() + 24 * 3600 * 1000);
            await physicsEngine.setTime(newDate);
            
            const newPos = physicsEngine.bodies[399].position;
            const distance = newPos.distanceTo(initialPos);
            
            // Earth moves about 2.6 million km per day
            console.log(`Earth moved ${(distance / 1e6).toFixed(2)} million km in 1 day`);
            expect(distance).toBeGreaterThan(2.5e6);
            expect(distance).toBeLessThan(2.7e6);
        });
    });
});