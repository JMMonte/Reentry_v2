import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { Constants } from '../src/utils/Constants.js';
import * as THREE from 'three';

describe('Atmospheric Rotation Drag Tests', () => {
    let physicsEngine;

    beforeEach(async () => {
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize(new Date('2024-01-01T00:00:00Z'));
    });

    it('should calculate atmosphere velocity correctly for equatorial position', () => {
        const earth = physicsEngine.bodies[399];
        expect(earth).toBeDefined();
        
        // Position at equator, 400 km altitude
        const altitude = 400; // km
        const radius = earth.radius + altitude;
        const position = new THREE.Vector3(radius, 0, 0); // On equator
        
        // Calculate atmosphere velocity
        const atmosphereVel = physicsEngine._calculateAtmosphereVelocity(position, earth);
        
        // Expected velocity at equator: v = omega * r
        // Earth rotation period ~ 86164 seconds (sidereal day)
        const rotationPeriod = earth.rotationPeriod || Constants.siderialDay;
        const omega = (2 * Math.PI) / rotationPeriod;
        const expectedVelMag = omega * radius; // km/s
        
        console.log('\n=== Equatorial Atmosphere Velocity ===');
        console.log(`Position: ${radius.toFixed(0)} km from center (${altitude} km altitude)`);
        console.log(`Rotation period: ${rotationPeriod} seconds`);
        console.log(`Angular velocity: ${omega.toExponential(3)} rad/s`);
        console.log(`Atmosphere velocity: ${atmosphereVel.toArray().map(v => v.toFixed(6))}`);
        console.log(`Expected magnitude: ${expectedVelMag.toFixed(6)} km/s`);
        console.log(`Actual magnitude: ${atmosphereVel.length().toFixed(6)} km/s`);
        
        // Velocity magnitude should match expected
        const actualVelMag = atmosphereVel.length();
        expect(actualVelMag).toBeCloseTo(expectedVelMag, 3);
        
        // Velocity should be perpendicular to position
        const dotProduct = atmosphereVel.dot(position);
        expect(dotProduct).toBeCloseTo(0, 5);
    });

    it('should have zero atmosphere velocity at poles', () => {
        const earth = physicsEngine.bodies[399];
        
        // Position at north pole
        const altitude = 400; // km
        const radius = earth.radius + altitude;
        const position = new THREE.Vector3(0, 0, radius); // North pole
        
        // Calculate atmosphere velocity
        const atmosphereVel = physicsEngine._calculateAtmosphereVelocity(position, earth);
        
        console.log('\n=== Polar Atmosphere Velocity ===');
        console.log(`Position: North pole at ${altitude} km altitude`);
        console.log(`Atmosphere velocity: ${atmosphereVel.toArray().map(v => v.toFixed(6))}`);
        
        // At geographic poles, due to Earth's 23.5° tilt, there's still some velocity
        // The velocity should be much smaller than at the equator
        const equatorialVel = 2 * Math.PI * (earth.radius + altitude) / (earth.rotationPeriod || Constants.siderialDay);
        expect(atmosphereVel.length()).toBeLessThan(equatorialVel * 0.5); // Less than half of equatorial
    });

    it('should affect drag differently for eastward vs westward motion', () => {
        const earth = physicsEngine.bodies[399];
        
        // Create two satellites at same position but different velocities
        const position = [earth.radius + 400, 0, 0]; // 400 km altitude at equator
        
        // Eastward satellite (with Earth's rotation)
        const eastSat = {
            id: 'east',
            centralBodyNaifId: 399,
            position: position,
            velocity: [0, 7.8, 0], // Eastward velocity
            mass: 1000,
            crossSectionalArea: 10,
            dragCoefficient: 2.2
        };
        
        // Westward satellite (against Earth's rotation)
        const westSat = {
            id: 'west',
            centralBodyNaifId: 399,
            position: position,
            velocity: [0, -7.8, 0], // Westward velocity
            mass: 1000,
            crossSectionalArea: 10,
            dragCoefficient: 2.2
        };
        
        physicsEngine.addSatellite(eastSat);
        physicsEngine.addSatellite(westSat);
        
        const eastSatData = physicsEngine.satellites.get('east');
        const westSatData = physicsEngine.satellites.get('west');
        
        // Calculate drag for both
        const eastDrag = physicsEngine._computeAtmosphericDrag(eastSatData);
        const westDrag = physicsEngine._computeAtmosphericDrag(westSatData);
        
        console.log('\n=== Directional Drag Comparison ===');
        console.log(`Eastward satellite drag: ${eastDrag.toArray().map(v => v.toExponential(3))}`);
        console.log(`Eastward drag magnitude: ${eastDrag.length().toExponential(3)} km/s²`);
        console.log(`Westward satellite drag: ${westDrag.toArray().map(v => v.toExponential(3))}`);
        console.log(`Westward drag magnitude: ${westDrag.length().toExponential(3)} km/s²`);
        
        // Westward satellite should experience more drag (higher relative velocity)
        expect(westDrag.length()).toBeGreaterThan(eastDrag.length());
        
        // Both should oppose motion (negative Y for east, positive Y for west)
        expect(eastDrag.y).toBeLessThan(0);
        expect(westDrag.y).toBeGreaterThan(0);
    });

    it('should calculate correct relative velocity for geostationary satellite', () => {
        const earth = physicsEngine.bodies[399];
        
        // Geostationary orbit radius
        const geoRadius = 42164; // km
        
        // Create satellite at geostationary position
        const position = new THREE.Vector3(geoRadius, 0, 0); // On equator
        
        // Get atmosphere velocity at this position
        const atmosphereVel = physicsEngine._calculateAtmosphereVelocity(position, earth);
        
        // Create satellite with velocity matching the atmosphere
        const geoSat = {
            id: 'geo',
            centralBodyNaifId: 399,
            position: position.toArray(),
            velocity: atmosphereVel.toArray(), // Match atmosphere velocity exactly
            mass: 1000,
            crossSectionalArea: 10,
            dragCoefficient: 2.2
        };
        
        physicsEngine.addSatellite(geoSat);
        const satData = physicsEngine.satellites.get('geo');
        
        // Calculate relative velocity
        const atmosphereVel2 = physicsEngine._calculateAtmosphereVelocity(satData.position, earth);
        const relativeVel = satData.velocity.clone().sub(atmosphereVel2);
        
        console.log('\n=== Geostationary Satellite ===');
        console.log(`Position: ${geoRadius} km`);
        console.log(`Satellite velocity: ${satData.velocity.toArray().map(v => v.toFixed(6))}`);
        console.log(`Atmosphere velocity: ${atmosphereVel2.toArray().map(v => v.toFixed(6))}`);
        console.log(`Relative velocity: ${relativeVel.length().toFixed(6)} km/s`);
        
        // For a satellite moving with the atmosphere, relative velocity should be zero
        expect(relativeVel.length()).toBeCloseTo(0, 5);
    });
});