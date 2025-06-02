import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';

describe('Debug Significant Bodies', () => {
    it('should show why Sun is included for LEO satellites', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Set up Earth and Sun
        physicsEngine.bodies = {
            10: { // Sun
                name: 'Sun',
                type: 'star',
                mass: 1.989e30,
                radius: 695700,
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                naifId: 10
            },
            399: { // Earth
                name: 'Earth',
                type: 'planet',
                mass: 5.972e24,
                radius: 6371,
                position: new THREE.Vector3(1.496e8, 0, 0), // 1 AU
                velocity: new THREE.Vector3(0, 29.78, 0),
                naifId: 399,
                j2: 0.00108263
            }
        };
        
        // LEO satellite
        const satellite = {
            id: 'leo-debug',
            centralBodyNaifId: 399,
            position: new THREE.Vector3(6771, 0, 0), // 400km
            velocity: new THREE.Vector3(0, 7.67, 0)
        };
        
        const centralBody = physicsEngine.bodies[399];
        const centralGravAccel = (PhysicsConstants.PHYSICS.G * centralBody.mass) / (6771 * 6771);
        
        // Calculate Sun perturbation manually
        const sunBody = physicsEngine.bodies[10];
        const sunRelativeToCentral = sunBody.position.clone().sub(centralBody.position);
        const distanceToSun = sunRelativeToCentral.distanceTo(satellite.position);
        const sunAccel = (PhysicsConstants.PHYSICS.G * sunBody.mass) / (distanceToSun * distanceToSun);
        const sunRelative = sunAccel / centralGravAccel;
        
        console.log('\n=== LEO Sun Perturbation Debug ===');
        console.log(`Central body acceleration: ${centralGravAccel.toExponential(3)} km/s²`);
        console.log(`Sun distance: ${distanceToSun.toExponential(3)} km`);
        console.log(`Sun acceleration: ${sunAccel.toExponential(3)} km/s²`);
        console.log(`Sun relative strength: ${sunRelative.toExponential(3)} (${(sunRelative * 1e6).toFixed(3)} ppm)`);
        
        // Check thresholds
        const PERTURBATION_THRESHOLD = 1e-7;
        const RELATIVE_THRESHOLD = 1e-5;
        
        console.log('\nThreshold checks:');
        console.log(`  Absolute threshold (${PERTURBATION_THRESHOLD.toExponential(1)}): ${sunAccel >= PERTURBATION_THRESHOLD ? 'PASS' : 'FAIL'}`);
        console.log(`  Relative threshold (${RELATIVE_THRESHOLD.toExponential(1)}): ${sunAccel >= centralGravAccel * RELATIVE_THRESHOLD ? 'PASS' : 'FAIL'}`);
        
        // Check special case
        const satAltitude = satellite.position.length();
        console.log(`\nSpecial case checks:`);
        console.log(`  Satellite altitude: ${satAltitude} km`);
        console.log(`  Above MEO (>20,000 km): ${satAltitude > 20000 ? 'YES' : 'NO'}`);
        console.log(`  Above 100,000 km: ${satAltitude > 100000 ? 'YES' : 'NO'}`);
        
        const significantBodies = physicsEngine._getSignificantBodies(satellite, centralBody);
        console.log(`\nResult: Sun included = ${significantBodies.has(10)}`);
        
        // Sun should NOT be included for LEO based on realistic criteria
        expect(significantBodies.has(10)).toBe(false);
    });
});