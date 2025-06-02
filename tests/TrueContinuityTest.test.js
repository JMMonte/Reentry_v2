import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';

describe('True Continuity at SOI Boundary', () => {
    it('should check actual continuity at the exact SOI boundary', () => {
        const physicsEngine = new PhysicsEngine();
        
        // Set up Earth-Moon system
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
                position: new THREE.Vector3(1.496e8, 0, 0),
                velocity: new THREE.Vector3(0, 29.78, 0),
                naifId: 399,
                j2: 0.00108263,
                soiRadius: 924000
            },
            301: { // Moon
                name: 'Moon',
                type: 'moon',
                mass: 7.342e22,
                radius: 1737.4,
                position: new THREE.Vector3(1.496e8 + 384400, 0, 0),
                velocity: new THREE.Vector3(0, 29.78 + 1.022, 0),
                naifId: 301,
                soiRadius: 66183
            }
        };

        // Moon's SOI boundary is at 66,183 km from Moon center
        // This is at 384,400 - 66,183 = 318,217 km from Earth center
        const moonSoiBoundaryFromEarth = 318217;
        
        console.log('\n=== True Continuity Test at SOI Boundary ===');
        console.log(`Moon SOI radius: ${physicsEngine.bodies[301].soiRadius} km`);
        console.log(`SOI boundary distance from Earth: ${moonSoiBoundaryFromEarth} km`);
        
        // Test points extremely close to the boundary
        const epsilon = 0.001; // 1 meter
        const testPoints = [
            {
                distance: moonSoiBoundaryFromEarth - 1,     // 1 km inside Earth SOI
                expectedCentral: 399,
                desc: "1 km before boundary"
            },
            {
                distance: moonSoiBoundaryFromEarth - 0.1,   // 100 m inside Earth SOI
                expectedCentral: 399,
                desc: "100 m before boundary"
            },
            {
                distance: moonSoiBoundaryFromEarth - epsilon, // 1 m inside Earth SOI
                expectedCentral: 399,
                desc: "1 m before boundary"
            },
            {
                distance: moonSoiBoundaryFromEarth,         // Exactly at boundary
                expectedCentral: 301,  // Should be in Moon SOI
                desc: "Exactly at boundary"
            },
            {
                distance: moonSoiBoundaryFromEarth + epsilon, // 1 m inside Moon SOI
                expectedCentral: 301,
                desc: "1 m after boundary"
            },
            {
                distance: moonSoiBoundaryFromEarth + 0.1,   // 100 m inside Moon SOI
                expectedCentral: 301,
                desc: "100 m after boundary"
            },
            {
                distance: moonSoiBoundaryFromEarth + 1,     // 1 km inside Moon SOI
                expectedCentral: 301,
                desc: "1 km after boundary"
            }
        ];
        
        const results = [];
        
        testPoints.forEach((point, index) => {
            // Test satellite in Earth's reference frame
            const satInEarthFrame = {
                id: `earth-frame-${index}`,
                centralBodyNaifId: 399,
                position: new THREE.Vector3(point.distance, 0, 0),
                velocity: new THREE.Vector3(0, 1.0, 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };
            
            // Test satellite in Moon's reference frame
            const moonRelativePos = point.distance - 384400; // Convert to Moon-centric
            const satInMoonFrame = {
                id: `moon-frame-${index}`,
                centralBodyNaifId: 301,
                position: new THREE.Vector3(moonRelativePos, 0, 0),
                velocity: new THREE.Vector3(0, 1.0 - 1.022, 0), // Adjust for Moon's velocity
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };
            
            // Calculate accelerations in both frames
            physicsEngine.satellites = { [`earth-frame-${index}`]: satInEarthFrame };
            const accelEarthFrame = physicsEngine._computeSatelliteAcceleration(satInEarthFrame);
            
            physicsEngine.satellites = { [`moon-frame-${index}`]: satInMoonFrame };
            const accelMoonFrame = physicsEngine._computeSatelliteAcceleration(satInMoonFrame);
            
            const result = {
                distance: point.distance,
                desc: point.desc,
                earthFrameAccel: accelEarthFrame.length(),
                moonFrameAccel: accelMoonFrame.length(),
                difference: Math.abs(accelEarthFrame.length() - accelMoonFrame.length()),
                earthForces: {
                    earth: satInEarthFrame.a_bodies?.[399] ? new THREE.Vector3(...satInEarthFrame.a_bodies[399]).length() : 0,
                    moon: satInEarthFrame.a_bodies?.[301] ? new THREE.Vector3(...satInEarthFrame.a_bodies[301]).length() : 0,
                    sun: satInEarthFrame.a_bodies?.[10] ? new THREE.Vector3(...satInEarthFrame.a_bodies[10]).length() : 0
                },
                moonForces: {
                    earth: satInMoonFrame.a_bodies?.[399] ? new THREE.Vector3(...satInMoonFrame.a_bodies[399]).length() : 0,
                    moon: satInMoonFrame.a_bodies?.[301] ? new THREE.Vector3(...satInMoonFrame.a_bodies[301]).length() : 0,
                    sun: satInMoonFrame.a_bodies?.[10] ? new THREE.Vector3(...satInMoonFrame.a_bodies[10]).length() : 0
                }
            };
            
            results.push(result);
            
            console.log(`\n${point.desc} (${point.distance} km from Earth):`);
            console.log(`  Earth frame acceleration: ${accelEarthFrame.length().toExponential(6)} km/s²`);
            console.log(`  Moon frame acceleration: ${accelMoonFrame.length().toExponential(6)} km/s²`);
            console.log(`  Difference: ${result.difference.toExponential(6)} km/s²`);
            console.log(`  Force breakdown (Earth frame): Earth=${result.earthForces.earth.toExponential(3)}, Moon=${result.earthForces.moon.toExponential(3)}, Sun=${result.earthForces.sun.toExponential(3)}`);
            console.log(`  Force breakdown (Moon frame): Earth=${result.moonForces.earth.toExponential(3)}, Moon=${result.moonForces.moon.toExponential(3)}, Sun=${result.moonForces.sun.toExponential(3)}`);
        });
        
        // Check for discontinuity at the boundary
        console.log('\n=== Discontinuity Analysis ===');
        
        // Find the boundary crossing
        let boundaryIndex = -1;
        for (let i = 0; i < results.length - 1; i++) {
            if (testPoints[i].expectedCentral !== testPoints[i + 1].expectedCentral) {
                boundaryIndex = i;
                break;
            }
        }
        
        if (boundaryIndex >= 0) {
            const beforeBoundary = results[boundaryIndex];
            const atBoundary = results[boundaryIndex + 1];
            
            // Calculate the jump in acceleration
            const jumpEarthFrame = Math.abs(atBoundary.earthFrameAccel - beforeBoundary.earthFrameAccel);
            const jumpMoonFrame = Math.abs(atBoundary.moonFrameAccel - beforeBoundary.moonFrameAccel);
            
            console.log(`\nJump at boundary (${testPoints[boundaryIndex].desc} → ${testPoints[boundaryIndex + 1].desc}):`);
            console.log(`  Earth frame jump: ${jumpEarthFrame.toExponential(6)} km/s²`);
            console.log(`  Moon frame jump: ${jumpMoonFrame.toExponential(6)} km/s²`);
            
            // For true continuity, these jumps should be very small
            // But in practice, there might be a discontinuity due to:
            // 1. Different central body reference frame corrections
            // 2. Different sets of significant bodies
            // 3. Numerical precision issues
            
            const avgAccel = (beforeBoundary.earthFrameAccel + atBoundary.earthFrameAccel) / 2;
            const relativeJump = jumpEarthFrame / avgAccel;
            
            console.log(`  Relative jump: ${(relativeJump * 100).toFixed(2)}%`);
            
            // This is where we'd see if there's a true discontinuity
            if (relativeJump > 0.01) { // More than 1% jump
                console.warn('\n⚠️  DISCONTINUITY DETECTED at SOI boundary!');
                console.warn(`   The acceleration changes by ${(relativeJump * 100).toFixed(2)}% at the boundary.`);
            } else {
                console.log('\n✅ Acceleration is effectively continuous at the boundary.');
            }
        }
        
        // Also check if the same physical location gives same acceleration
        console.log('\n=== Physical Consistency Check ===');
        const avgDifference = results.reduce((sum, r) => sum + r.difference, 0) / results.length;
        console.log(`Average difference between reference frames: ${avgDifference.toExponential(6)} km/s²`);
        
        // The real issue: Do we get the same total acceleration at the same physical location?
        const maxDifference = Math.max(...results.map(r => r.difference));
        const minAccel = Math.min(...results.map(r => Math.min(r.earthFrameAccel, r.moonFrameAccel)));
        const relativeDifference = maxDifference / minAccel;
        
        console.log(`Maximum difference: ${maxDifference.toExponential(6)} km/s²`);
        console.log(`Maximum relative difference: ${(relativeDifference * 100).toFixed(2)}%`);
        
        if (relativeDifference > 0.1) {
            console.warn('\n⚠️  REFERENCE FRAME INCONSISTENCY!');
            console.warn(`   Same physical location gives different accelerations (up to ${(relativeDifference * 100).toFixed(2)}% difference).`);
            console.warn('   This indicates the physics calculation depends on the reference frame choice.');
        }
    });
});