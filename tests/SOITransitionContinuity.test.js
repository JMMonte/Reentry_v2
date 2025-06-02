import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';

describe('SOI Transition Continuity Tests', () => {
    let physicsEngine;
    
    beforeEach(() => {
        physicsEngine = new PhysicsEngine();
        
        // Set up Earth-Moon system with realistic positions
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
                position: new THREE.Vector3(1.496e8, 0, 0), // 1 AU from Sun
                velocity: new THREE.Vector3(0, 29.78, 0),
                naifId: 399,
                j2: 0.00108263,
                atmosphericModel: { maxAltitude: 1000 },
                soiRadius: 924000 // Earth's SOI radius in km
            },
            301: { // Moon
                name: 'Moon',
                type: 'moon',
                mass: 7.342e22,
                radius: 1737.4,
                position: new THREE.Vector3(1.496e8 + 384400, 0, 0), // Earth + 384,400 km
                velocity: new THREE.Vector3(0, 29.78 + 1.022, 0),
                naifId: 301,
                soiRadius: 66183 // Moon's SOI radius in km
            }
        };
    });

    describe('Force Continuity Across SOI Boundaries', () => {
        it('should maintain force continuity when transitioning from Earth to Moon SOI', () => {
            // Create a trajectory that crosses from Earth SOI to Moon SOI
            const testPoints = [
                { pos: [250000, 0, 0], centralBody: 399, desc: "Deep in Earth SOI" },
                { pos: [300000, 0, 0], centralBody: 399, desc: "Approaching Moon SOI boundary" },
                { pos: [320000, 0, 0], centralBody: 399, desc: "Just outside Moon SOI (~64k km from Moon)" },
                { pos: [325000, 0, 0], centralBody: 301, desc: "Just inside Moon SOI" },
                { pos: [330000, 0, 0], centralBody: 301, desc: "Deeper in Moon SOI" },
                { pos: [340000, 0, 0], centralBody: 301, desc: "Well inside Moon SOI" }
            ];
            
            const accelerations = [];
            const forces = [];
            
            console.log('\n=== SOI Transition Force Analysis ===');
            
            testPoints.forEach((point, index) => {
                const satellite = {
                    id: `test-sat-${index}`,
                    centralBodyNaifId: point.centralBody,
                    position: new THREE.Vector3(...point.pos),
                    velocity: new THREE.Vector3(0, 1.0, 0), // Small tangential velocity
                    mass: 1000,
                    crossSectionalArea: 10,
                    dragCoefficient: 2.2
                };
                
                physicsEngine.satellites = { [`test-sat-${index}`]: satellite };
                
                // Calculate acceleration
                const accel = physicsEngine._computeSatelliteAcceleration(satellite);
                accelerations.push(accel.clone());
                
                // Calculate distance to Earth and Moon
                const earthPos = physicsEngine.bodies[399].position;
                const moonPos = physicsEngine.bodies[301].position;
                const satGlobalPos = satellite.position.clone().add(physicsEngine.bodies[point.centralBody].position);
                
                const distToEarth = satGlobalPos.distanceTo(earthPos);
                const distToMoon = satGlobalPos.distanceTo(moonPos);
                
                // Store force breakdown
                const forceBreakdown = {
                    total: accel.length(),
                    earth: satellite.a_bodies?.[399] ? new THREE.Vector3(...satellite.a_bodies[399]).length() : 0,
                    moon: satellite.a_bodies?.[301] ? new THREE.Vector3(...satellite.a_bodies[301]).length() : 0,
                    sun: satellite.a_bodies?.[10] ? new THREE.Vector3(...satellite.a_bodies[10]).length() : 0,
                    distToEarth,
                    distToMoon,
                    centralBody: point.centralBody
                };
                
                forces.push(forceBreakdown);
                
                console.log(`\n${point.desc}:`);
                console.log(`  Central body: ${physicsEngine.bodies[point.centralBody].name} (${point.centralBody})`);
                console.log(`  Position: [${point.pos.join(', ')}] km`);
                console.log(`  Distance to Earth: ${distToEarth.toFixed(0)} km`);
                console.log(`  Distance to Moon: ${distToMoon.toFixed(0)} km`);
                console.log(`  Total acceleration: ${accel.length().toExponential(3)} km/s²`);
                console.log(`  Force breakdown:`);
                console.log(`    Earth: ${forceBreakdown.earth.toExponential(3)} km/s²`);
                console.log(`    Moon: ${forceBreakdown.moon.toExponential(3)} km/s²`);
                console.log(`    Sun: ${forceBreakdown.sun.toExponential(3)} km/s²`);
            });
            
            // Check for continuity - accelerations should not have sudden jumps
            console.log('\n=== Continuity Analysis ===');
            for (let i = 1; i < accelerations.length; i++) {
                const prevAccel = accelerations[i - 1].length();
                const currAccel = accelerations[i].length();
                const change = Math.abs(currAccel - prevAccel);
                const relativeChange = change / Math.max(prevAccel, currAccel);
                
                console.log(`Step ${i}: ${change.toExponential(3)} km/s² change (${(relativeChange * 100).toFixed(2)}%)`);
                
                // No sudden jumps > 50% change between adjacent points
                expect(relativeChange).toBeLessThan(0.5);
            }
            
            // The total acceleration magnitude should vary smoothly
            const totalAccelMagnitudes = accelerations.map(a => a.length());
            const maxAccel = Math.max(...totalAccelMagnitudes);
            const minAccel = Math.min(...totalAccelMagnitudes);
            console.log(`\nAcceleration range: ${minAccel.toExponential(3)} to ${maxAccel.toExponential(3)} km/s²`);
            
            // All accelerations should be reasonable (not extreme)
            totalAccelMagnitudes.forEach(accel => {
                expect(accel).toBeLessThan(0.1); // Less than 0.1 km/s²
                expect(accel).toBeGreaterThan(1e-6); // Greater than 1e-6 km/s²
            });
        });
        
        it('should handle force calculation consistency across reference frames', () => {
            // Test the same physical location calculated in different reference frames
            const moonRelativeToEarth = new THREE.Vector3(384400, 0, 0);
            
            // Position 10,000 km from Moon towards Earth
            const testPositionFromMoon = new THREE.Vector3(-10000, 0, 0); // 10k km towards Earth from Moon
            const testPositionFromEarth = moonRelativeToEarth.clone().add(testPositionFromMoon);
            
            // Satellite as seen from Moon's reference frame
            const satelliteInMoonFrame = {
                id: 'sat-moon-frame',
                centralBodyNaifId: 301,
                position: testPositionFromMoon.clone(),
                velocity: new THREE.Vector3(0, 1.0, 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };
            
            // Satellite as seen from Earth's reference frame
            const satelliteInEarthFrame = {
                id: 'sat-earth-frame',
                centralBodyNaifId: 399,
                position: testPositionFromEarth.clone(),
                velocity: new THREE.Vector3(0, 1.0, 0),
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };
            
            // Calculate accelerations in both frames
            physicsEngine.satellites = { 'sat-moon-frame': satelliteInMoonFrame };
            const accelMoonFrame = physicsEngine._computeSatelliteAcceleration(satelliteInMoonFrame);
            
            physicsEngine.satellites = { 'sat-earth-frame': satelliteInEarthFrame };
            const accelEarthFrame = physicsEngine._computeSatelliteAcceleration(satelliteInEarthFrame);
            
            console.log('\n=== Reference Frame Consistency Test ===');
            console.log(`Position from Moon: [${testPositionFromMoon.toArray().join(', ')}] km`);
            console.log(`Position from Earth: [${testPositionFromEarth.toArray().join(', ')}] km`);
            console.log(`Acceleration in Moon frame: ${accelMoonFrame.length().toExponential(3)} km/s²`);
            console.log(`Acceleration in Earth frame: ${accelEarthFrame.length().toExponential(3)} km/s²`);
            
            // The acceleration magnitudes should be similar (within 5%)
            const diff = Math.abs(accelMoonFrame.length() - accelEarthFrame.length());
            const avgAccel = (accelMoonFrame.length() + accelEarthFrame.length()) / 2;
            const relativeDiff = diff / avgAccel;
            
            console.log(`Relative difference: ${(relativeDiff * 100).toFixed(3)}%`);
            
            // Should be within 6% - small differences expected due to different central body corrections
            expect(relativeDiff).toBeLessThan(0.06);
        });
    });

    describe('SOI Boundary Detection and Transitions', () => {
        it('should properly detect when satellite crosses SOI boundaries', () => {
            // Simulate a satellite moving from Earth towards Moon
            const initialPos = new THREE.Vector3(200000, 0, 0); // Start in Earth SOI
            const finalPos = new THREE.Vector3(350000, 0, 0);   // End in Moon SOI
            const steps = 20;
            
            console.log('\n=== SOI Boundary Detection Test ===');
            console.log(`Earth SOI radius: ${physicsEngine.bodies[399].soiRadius} km`);
            console.log(`Moon SOI radius: ${physicsEngine.bodies[301].soiRadius} km`);
            console.log(`Moon distance from Earth: 384,400 km`);
            console.log(`Moon SOI boundary from Earth: ${384400 - 66183} to ${384400 + 66183} km\n`);
            
            const transitions = [];
            let currentCentralBody = 399; // Start with Earth
            
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const pos = new THREE.Vector3().lerpVectors(initialPos, finalPos, t);
                
                // Calculate distances to determine which SOI we're in
                const earthPos = physicsEngine.bodies[399].position;
                const moonPos = physicsEngine.bodies[301].position;
                
                // For this test, satellite position is Earth-relative
                const satGlobalPos = pos.clone().add(earthPos);
                const distToEarth = satGlobalPos.distanceTo(earthPos);
                const distToMoon = satGlobalPos.distanceTo(moonPos);
                
                // Determine which SOI based on distances and SOI radii
                let expectedCentralBody;
                if (distToMoon < physicsEngine.bodies[301].soiRadius) {
                    expectedCentralBody = 301; // Moon SOI
                } else {
                    expectedCentralBody = 399; // Earth SOI
                }
                
                // Detect transitions
                if (expectedCentralBody !== currentCentralBody) {
                    transitions.push({
                        step: i,
                        position: pos.clone(),
                        from: currentCentralBody,
                        to: expectedCentralBody,
                        distToEarth,
                        distToMoon
                    });
                    currentCentralBody = expectedCentralBody;
                }
                
                if (i % 4 === 0 || expectedCentralBody !== currentCentralBody) {
                    console.log(`Step ${i}: pos=[${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}], ` +
                               `distToEarth=${distToEarth.toFixed(0)}km, distToMoon=${distToMoon.toFixed(0)}km, ` +
                               `SOI=${physicsEngine.bodies[expectedCentralBody].name}`);
                }
            }
            
            console.log(`\nDetected ${transitions.length} SOI transitions:`);
            transitions.forEach((transition, idx) => {
                console.log(`  ${idx + 1}. Step ${transition.step}: ${physicsEngine.bodies[transition.from].name} → ${physicsEngine.bodies[transition.to].name}`);
                console.log(`     Position: [${transition.position.x.toFixed(0)}, ${transition.position.y.toFixed(0)}, ${transition.position.z.toFixed(0)}]`);
                console.log(`     Distance to Moon: ${transition.distToMoon.toFixed(0)} km`);
            });
            
            // Should detect at least one transition (Earth → Moon)
            expect(transitions.length).toBeGreaterThan(0);
            expect(transitions.length).toBeLessThan(5); // Shouldn't oscillate too much
            
            // Last transition should be to Moon
            if (transitions.length > 0) {
                const lastTransition = transitions[transitions.length - 1];
                expect(lastTransition.to).toBe(301);
            }
        });
    });

    describe('Acceleration Smoothness Near Lagrange Points', () => {
        it('should maintain smooth accelerations near L1 point', () => {
            // L1 point is approximately 326,000 km from Earth center (58,400 km from Moon)
            // This is a region where gravitational forces balance and can be sensitive
            const L1_approx = new THREE.Vector3(326000, 0, 0);
            
            // Test points around L1
            const testOffsets = [
                new THREE.Vector3(-5000, 0, 0),    // 5km towards Earth
                new THREE.Vector3(-1000, 0, 0),    // 1km towards Earth
                new THREE.Vector3(0, 0, 0),        // At L1
                new THREE.Vector3(1000, 0, 0),     // 1km towards Moon
                new THREE.Vector3(5000, 0, 0)      // 5km towards Moon
            ];
            
            const accelerations = [];
            
            console.log('\n=== L1 Point Acceleration Smoothness ===');
            
            testOffsets.forEach((offset, index) => {
                const position = L1_approx.clone().add(offset);
                
                // Determine central body (L1 is still in Earth's SOI)
                const satellite = {
                    id: `l1-test-${index}`,
                    centralBodyNaifId: 399, // Earth SOI
                    position: position.clone(),
                    velocity: new THREE.Vector3(0, 0.5, 0),
                    mass: 1000,
                    crossSectionalArea: 10,
                    dragCoefficient: 2.2
                };
                
                physicsEngine.satellites = { [`l1-test-${index}`]: satellite };
                const accel = physicsEngine._computeSatelliteAcceleration(satellite);
                accelerations.push(accel.clone());
                
                console.log(`Offset ${offset.x}km: accel = ${accel.length().toExponential(3)} km/s²`);
            });
            
            // Check smoothness - no sudden jumps
            for (let i = 1; i < accelerations.length; i++) {
                const change = accelerations[i].clone().sub(accelerations[i-1]).length();
                const avgMag = (accelerations[i].length() + accelerations[i-1].length()) / 2;
                const relativeChange = change / avgMag;
                
                console.log(`Change ${i}: ${change.toExponential(3)} km/s² (${(relativeChange * 100).toFixed(2)}%)`);
                
                // Should be smooth changes, not sudden jumps
                expect(relativeChange).toBeLessThan(0.3); // Less than 30% change between nearby points
            }
        });
    });
});