import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { SolarSystemHierarchy } from '../src/physics/SolarSystemHierarchy.js';
import { planetaryDataManager } from '../src/physics/PlanetaryDataManager.js';
import * as THREE from 'three';

describe('Satellite Propagation with Realistic Perturbations', () => {
    let physicsEngine;
    let hierarchy;
    let testDate;

    beforeEach(async () => {
        // Use a specific date for consistent testing
        testDate = new Date('2025-01-01T00:00:00.000Z');
        
        // Initialize the full solar system
        await planetaryDataManager.initialize();
        const bodiesConfigMap = planetaryDataManager.getBodiesConfigMap();
        
        hierarchy = new SolarSystemHierarchy(bodiesConfigMap);
        physicsEngine = new PhysicsEngine(hierarchy, { startDate: testDate });
        await physicsEngine.initialize();
    }, 30000); // Allow 30 seconds for initialization

    afterEach(() => {
        physicsEngine = null;
        hierarchy = null;
    });

    describe('ISS-like Orbit (LEO)', () => {
        test('should experience orbital decay due to atmospheric drag', async () => {
            // ISS-like orbit parameters
            const altitude = 420; // km above Earth surface
            const earthRadius = 6371; // km
            const orbitalRadius = earthRadius + altitude;
            
            // Add satellite in circular orbit
            const satelliteId = 'iss-test';
            physicsEngine.addSatellite({
                id: satelliteId,
                centralBodyNaifId: 399, // Earth
                position: [orbitalRadius, 0, 0], // km
                velocity: [0, 7.66, 0], // km/s (circular velocity at 420km)
                mass: 420000, // kg (ISS mass)
                area: 2500, // m² (solar array area)
                dragCoeff: 2.2
            });

            // Get initial state
            const initialState = physicsEngine.getSimulationState();
            const initialSat = initialState.satellites[satelliteId];
            const initialAltitude = Math.sqrt(
                initialSat.position[0]**2 + 
                initialSat.position[1]**2 + 
                initialSat.position[2]**2
            ) - earthRadius;

            // Propagate for 1 day (86400 seconds)
            const propagationTime = 86400; // 1 day
            const steps = 1440; // 1 minute steps
            const dt = propagationTime / steps;
            
            for (let i = 0; i < steps; i++) {
                await physicsEngine.step(dt);
            }

            // Get final state
            const finalState = physicsEngine.getSimulationState();
            const finalSat = finalState.satellites[satelliteId];
            const finalAltitude = Math.sqrt(
                finalSat.position[0]**2 + 
                finalSat.position[1]**2 + 
                finalSat.position[2]**2
            ) - earthRadius;

            // ISS loses about 2km of altitude per month, so ~0.067 km/day
            const altitudeLoss = initialAltitude - finalAltitude;
            console.log(`Altitude loss in 1 day: ${altitudeLoss.toFixed(3)} km`);
            
            // Expect some altitude loss due to drag (should be positive)
            expect(altitudeLoss).toBeGreaterThan(0.01); // At least 10m
            expect(altitudeLoss).toBeLessThan(0.5); // But not more than 500m in one day
        });

        test('should complete expected number of orbits per day', async () => {
            // ISS orbital period is ~90 minutes, so ~16 orbits per day
            const altitude = 420; // km
            const earthRadius = 6371; // km
            const orbitalRadius = earthRadius + altitude;
            
            const satelliteId = 'iss-orbits';
            physicsEngine.addSatellite({
                id: satelliteId,
                centralBodyNaifId: 399,
                position: [orbitalRadius, 0, 0],
                velocity: [0, 7.66, 0],
                mass: 1000,
                area: 10,
                dragCoeff: 2.2
            });

            // Track orbit count by monitoring Y position sign changes
            let orbitCount = 0;
            let lastYSign = 1;
            const propagationTime = 86400; // 1 day
            const steps = 1440;
            const dt = propagationTime / steps;

            for (let i = 0; i < steps; i++) {
                await physicsEngine.step(dt);
                const state = physicsEngine.getSimulationState();
                const sat = state.satellites[satelliteId];
                
                const currentYSign = Math.sign(sat.position[1]);
                if (lastYSign > 0 && currentYSign < 0) {
                    orbitCount++;
                }
                lastYSign = currentYSign;
            }

            console.log(`ISS completed ${orbitCount} orbits in 24 hours`);
            
            // ISS completes about 15-16 orbits per day
            expect(orbitCount).toBeGreaterThan(14);
            expect(orbitCount).toBeLessThan(17);
        });
    });

    describe('GEO Satellite', () => {
        test('should maintain geostationary position', async () => {
            // GEO parameters
            const geoRadius = 42164; // km from Earth center
            const geoVelocity = 3.075; // km/s
            
            const satelliteId = 'geo-test';
            physicsEngine.addSatellite({
                id: satelliteId,
                centralBodyNaifId: 399,
                position: [geoRadius, 0, 0],
                velocity: [0, geoVelocity, 0],
                mass: 3000, // kg (typical GEO satellite)
                area: 50, // m²
                dragCoeff: 2.2
            });

            // Store initial longitude
            const initialLon = Math.atan2(0, geoRadius) * 180 / Math.PI;

            // Propagate for 24 hours
            const propagationTime = 86400;
            const steps = 144; // 10 minute steps (GEO is stable)
            const dt = propagationTime / steps;

            for (let i = 0; i < steps; i++) {
                await physicsEngine.step(dt);
            }

            // Check final position
            const finalState = physicsEngine.getSimulationState();
            const finalSat = finalState.satellites[satelliteId];
            
            // Calculate drift in longitude
            const finalLon = Math.atan2(finalSat.position[1], finalSat.position[0]) * 180 / Math.PI;
            let lonDrift = finalLon - initialLon;
            
            // Normalize to [-180, 180]
            while (lonDrift > 180) lonDrift -= 360;
            while (lonDrift < -180) lonDrift += 360;

            console.log(`GEO longitude drift in 24 hours: ${lonDrift.toFixed(3)}°`);

            // GEO satellite should stay relatively stationary (less than 1° drift per day)
            expect(Math.abs(lonDrift)).toBeLessThan(1.0);
        });
    });

    describe('Molniya Orbit', () => {
        test('should maintain high eccentricity orbit', async () => {
            // Molniya orbit parameters
            const perigee = 600 + 6371; // km (600 km altitude)
            const apogee = 39750 + 6371; // km (39750 km altitude)
            const semiMajor = (perigee + apogee) / 2;
            const eccentricity = (apogee - perigee) / (apogee + perigee);
            
            // Start at perigee
            const satelliteId = 'molniya-test';
            const perigeeVelocity = Math.sqrt(398600.4 * (2/perigee - 1/semiMajor)); // vis-viva equation
            
            physicsEngine.addSatellite({
                id: satelliteId,
                centralBodyNaifId: 399,
                position: [perigee, 0, 0],
                velocity: [0, perigeeVelocity, 0],
                mass: 1000,
                area: 10,
                dragCoeff: 2.2
            });

            // Track apogee and perigee over one orbit (about 12 hours for Molniya)
            let minRadius = Infinity;
            let maxRadius = 0;
            const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(semiMajor, 3) / 398600.4);
            const steps = 720; // 1 minute steps
            const dt = orbitalPeriod / steps;

            for (let i = 0; i < steps; i++) {
                await physicsEngine.step(dt);
                const state = physicsEngine.getSimulationState();
                const sat = state.satellites[satelliteId];
                
                const radius = Math.sqrt(
                    sat.position[0]**2 + 
                    sat.position[1]**2 + 
                    sat.position[2]**2
                );
                
                minRadius = Math.min(minRadius, radius);
                maxRadius = Math.max(maxRadius, radius);
            }

            const measuredEccentricity = (maxRadius - minRadius) / (maxRadius + minRadius);
            console.log(`Molniya orbit eccentricity: expected=${eccentricity.toFixed(3)}, measured=${measuredEccentricity.toFixed(3)}`);

            // Should maintain eccentricity within 1%
            expect(Math.abs(measuredEccentricity - eccentricity)).toBeLessThan(0.01);
        });
    });

    describe('Perturbation Effects', () => {
        test('should show J2 precession of orbital plane', async () => {
            // Sun-synchronous orbit parameters (crosses equator at same local time)
            const altitude = 600; // km
            const earthRadius = 6371; // km
            const orbitalRadius = earthRadius + altitude;
            const inclination = 97.8; // degrees (sun-synchronous for 600km)
            
            const satelliteId = 'j2-test';
            
            // Velocity for circular orbit
            const velocity = Math.sqrt(398600.4 / orbitalRadius);
            
            // Place in inclined orbit
            const incRad = inclination * Math.PI / 180;
            physicsEngine.addSatellite({
                id: satelliteId,
                centralBodyNaifId: 399,
                position: [orbitalRadius, 0, 0],
                velocity: [0, velocity * Math.cos(incRad), velocity * Math.sin(incRad)],
                mass: 1000,
                area: 10,
                dragCoeff: 2.2
            });

            // Get initial orbital plane normal
            const initialState = physicsEngine.getSimulationState();
            const initialSat = initialState.satellites[satelliteId];
            const r0 = new THREE.Vector3(...initialSat.position);
            const v0 = new THREE.Vector3(...initialSat.velocity);
            const h0 = r0.clone().cross(v0); // angular momentum vector (normal to orbital plane)
            
            // Propagate for 1 day
            const steps = 1440;
            const dt = 60; // 1 minute steps
            
            for (let i = 0; i < steps; i++) {
                await physicsEngine.step(dt);
            }

            // Get final orbital plane normal
            const finalState = physicsEngine.getSimulationState();
            const finalSat = finalState.satellites[satelliteId];
            const rf = new THREE.Vector3(...finalSat.position);
            const vf = new THREE.Vector3(...finalSat.velocity);
            const hf = rf.clone().cross(vf);

            // Calculate precession angle
            const precessionAngle = Math.acos(h0.normalize().dot(hf.normalize())) * 180 / Math.PI;
            console.log(`Orbital plane precession in 1 day: ${precessionAngle.toFixed(3)}°`);

            // Sun-synchronous orbit should precess about 0.986°/day
            expect(precessionAngle).toBeGreaterThan(0.8);
            expect(precessionAngle).toBeLessThan(1.2);
        });

        test('should show lunar perturbation effects on high altitude orbit', async () => {
            // High altitude orbit where lunar perturbations matter
            const altitude = 20000; // km
            const earthRadius = 6371; // km
            const orbitalRadius = earthRadius + altitude;
            
            const satelliteId = 'lunar-perturb';
            const velocity = Math.sqrt(398600.4 / orbitalRadius);
            
            physicsEngine.addSatellite({
                id: satelliteId,
                centralBodyNaifId: 399,
                position: [orbitalRadius, 0, 0],
                velocity: [0, velocity, 0],
                mass: 1000,
                area: 10,
                dragCoeff: 2.2
            });

            // Track orbital elements over time
            const orbitalElements = [];
            const propagationDays = 30;
            const stepsPerDay = 24;
            const dt = 3600; // 1 hour steps

            for (let day = 0; day < propagationDays; day++) {
                for (let hour = 0; hour < stepsPerDay; hour++) {
                    await physicsEngine.step(dt);
                }
                
                // Calculate current orbital elements
                const state = physicsEngine.getSimulationState();
                const sat = state.satellites[satelliteId];
                const r = new THREE.Vector3(...sat.position);
                const v = new THREE.Vector3(...sat.velocity);
                
                const a = 1 / (2/r.length() - v.lengthSq()/398600.4); // semi-major axis
                orbitalElements.push(a);
            }

            // Calculate variation in semi-major axis
            const minA = Math.min(...orbitalElements);
            const maxA = Math.max(...orbitalElements);
            const variation = maxA - minA;
            const percentVariation = (variation / ((minA + maxA) / 2)) * 100;

            console.log(`Semi-major axis variation over 30 days: ${variation.toFixed(1)} km (${percentVariation.toFixed(2)}%)`);

            // Should show some variation due to lunar perturbations
            expect(variation).toBeGreaterThan(1); // At least 1 km variation
            expect(percentVariation).toBeLessThan(5); // But not more than 5%
        });
    });
});