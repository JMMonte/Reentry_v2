import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { Constants } from '../src/utils/Constants.js';

describe('Realistic Significant Bodies Algorithm', () => {
    let physicsEngine;
    
    beforeEach(() => {
        physicsEngine = new PhysicsEngine();
        
        // Set up realistic solar system
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
            },
            301: { // Moon
                name: 'Moon',
                type: 'moon',
                mass: 7.342e22,
                radius: 1737.4,
                position: new THREE.Vector3(1.496e8 + 384400, 0, 0),
                velocity: new THREE.Vector3(0, 29.78 + 1.022, 0),
                naifId: 301
            },
            499: { // Mars
                name: 'Mars',
                type: 'planet',
                mass: 6.39e23,
                radius: 3390,
                position: new THREE.Vector3(2.28e8, 0, 0), // 1.52 AU
                velocity: new THREE.Vector3(0, 24.1, 0),
                naifId: 499
            },
            599: { // Jupiter
                name: 'Jupiter',
                type: 'planet',
                mass: 1.898e27,
                radius: 69911,
                position: new THREE.Vector3(7.78e8, 0, 0), // 5.2 AU
                velocity: new THREE.Vector3(0, 13.1, 0),
                naifId: 599
            }
        };
    });

    describe('Earth Satellite Perturbations', () => {
        it('should include Moon for all Earth satellites', () => {
            const altitudes = [400, 4000, 40000, 400000]; // LEO to very high orbit
            
            altitudes.forEach(alt => {
                const satellite = {
                    id: `earth-${alt}`,
                    centralBodyNaifId: 399,
                    position: new THREE.Vector3(6371 + alt, 0, 0),
                    velocity: new THREE.Vector3(0, Math.sqrt(Constants.G * 5.972e24 / (6371 + alt)), 0)
                };
                
                const significantBodies = physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[399]);
                
                // Moon should always be significant for Earth satellites
                expect(significantBodies.has(301)).toBe(true);
                console.log(`Earth satellite at ${alt}km: Moon included ✓`);
            });
        });
        
        it('should include Sun based on perturbation magnitude', () => {
            const testCases = [
                { alt: 400, expectSun: true, desc: 'LEO (Sun perturbation ~680 ppm)' },
                { alt: 4000, expectSun: true, desc: 'MEO low' },
                { alt: 15000, expectSun: true, desc: 'MEO high' },
                { alt: 25000, expectSun: true, desc: 'Above MEO' },
                { alt: 42164, expectSun: true, desc: 'GEO' },
                { alt: 100000, expectSun: true, desc: 'High orbit' }
            ];
            
            testCases.forEach(test => {
                const satellite = {
                    id: `earth-${test.alt}`,
                    centralBodyNaifId: 399,
                    position: new THREE.Vector3(6371 + test.alt, 0, 0),
                    velocity: new THREE.Vector3(0, Math.sqrt(Constants.G * 5.972e24 / (6371 + test.alt)), 0)
                };
                
                const significantBodies = physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[399]);
                
                expect(significantBodies.has(10)).toBe(test.expectSun);
                console.log(`${test.desc} (${test.alt}km): Sun ${test.expectSun ? 'included' : 'excluded'} ✓`);
            });
        });
        
        it('should apply realistic perturbation thresholds', () => {
            // LEO satellite - calculate expected perturbations
            const satellite = {
                id: 'earth-leo',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6771, 0, 0), // 400km
                velocity: new THREE.Vector3(0, 7.67, 0)
            };
            
            const centralBody = physicsEngine.bodies[399];
            const significantBodies = physicsEngine._getSignificantBodies(satellite, centralBody);
            
            // Calculate actual perturbation magnitudes
            const centralAccel = (Constants.G * centralBody.mass) / (6771 * 6771);
            
            // Moon perturbation
            const moonPos = physicsEngine.bodies[301].position.clone().sub(centralBody.position);
            const moonDist = moonPos.distanceTo(satellite.position);
            const moonAccel = (Constants.G * physicsEngine.bodies[301].mass) / (moonDist * moonDist);
            const moonRelative = moonAccel / centralAccel;
            
            console.log('\nLEO Satellite Perturbation Analysis:');
            console.log(`Central body acceleration: ${centralAccel.toExponential(3)} km/s²`);
            console.log(`Moon distance: ${moonDist.toFixed(0)} km`);
            console.log(`Moon acceleration: ${moonAccel.toExponential(3)} km/s²`);
            console.log(`Moon relative strength: ${moonRelative.toExponential(3)} (${(moonRelative * 1e6).toFixed(1)} ppm)`);
            console.log(`Significant bodies: [${Array.from(significantBodies).join(', ')}]`);
            
            // Moon should be included (special case for Earth satellites)
            expect(significantBodies.has(301)).toBe(true);
            
            // Sun should be included for LEO (perturbation is ~680 ppm, significant for orbital accuracy)
            expect(significantBodies.has(10)).toBe(true);
        });
    });

    describe('Mars Satellite Perturbations', () => {
        it('should include Sun for Mars satellites', () => {
            const satellite = {
                id: 'mars-leo',
                centralBodyNaifId: 499,
                position: new THREE.Vector3(3790, 0, 0), // 400km above Mars
                velocity: new THREE.Vector3(0, 3.4, 0)
            };
            
            const significantBodies = physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[499]);
            
            // Sun should be included for Mars satellites (special case)
            expect(significantBodies.has(10)).toBe(true);
            console.log('Mars satellite: Sun included ✓');
        });
        
        it('should include Jupiter when close enough', () => {
            // Move Mars closer to Jupiter for this test
            const originalMarsPos = physicsEngine.bodies[499].position.clone();
            physicsEngine.bodies[499].position.set(4e8, 0, 0); // Closer to Jupiter
            
            const satellite = {
                id: 'mars-leo-near-jupiter',
                centralBodyNaifId: 499,
                position: new THREE.Vector3(3790, 0, 0),
                velocity: new THREE.Vector3(0, 3.4, 0)
            };
            
            const significantBodies = physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[499]);
            
            // Jupiter should be included when close
            expect(significantBodies.has(599)).toBe(true);
            console.log('Mars satellite near Jupiter: Jupiter included ✓');
            
            // Restore original position
            physicsEngine.bodies[499].position.copy(originalMarsPos);
        });
    });

    describe('Hill Sphere Calculations', () => {
        it('should calculate Hill spheres correctly', () => {
            const centralBody = physicsEngine.bodies[399]; // Earth
            const perturbingBody = physicsEngine.bodies[301]; // Moon
            const distance = 384400; // Earth-Moon distance
            
            const hillSphere = physicsEngine._calculateHillSphere(centralBody, perturbingBody, distance);
            
            // Moon's Hill sphere should be ~60,000 km
            expect(hillSphere).toBeGreaterThan(50000);
            expect(hillSphere).toBeLessThan(70000);
            console.log(`Moon's Hill sphere radius: ${hillSphere.toFixed(0)} km`);
        });
        
        it('should include bodies within 3x Hill sphere', () => {
            // Create a satellite close to Moon's Hill sphere
            const satellite = {
                id: 'earth-near-moon',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(300000, 0, 0), // Close to Moon
                velocity: new THREE.Vector3(0, 1.0, 0)
            };
            
            const significantBodies = physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[399]);
            
            // Moon should definitely be included due to Hill sphere proximity
            expect(significantBodies.has(301)).toBe(true);
            console.log('Satellite near Moon Hill sphere: Moon included ✓');
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle satellites with zero position', () => {
            const satellite = {
                id: 'zero-pos',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0)
            };
            
            expect(() => {
                physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[399]);
            }).not.toThrow();
        });
        
        it('should exclude massless and barycenter bodies', () => {
            // Add a massless body and barycenter
            physicsEngine.bodies[999] = {
                name: 'Massless',
                type: 'object',
                mass: 0,
                position: new THREE.Vector3(1000, 0, 0),
                naifId: 999
            };
            
            physicsEngine.bodies[3] = {
                name: 'Earth-Moon Barycenter',
                type: 'barycenter',
                mass: 5.972e24 + 7.342e22,
                position: new THREE.Vector3(1.496e8 - 4671, 0, 0),
                naifId: 3
            };
            
            const satellite = {
                id: 'test-exclusion',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6771, 0, 0),
                velocity: new THREE.Vector3(0, 7.67, 0)
            };
            
            const significantBodies = physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[399]);
            
            // Should exclude massless body and barycenter
            expect(significantBodies.has(999)).toBe(false);
            expect(significantBodies.has(3)).toBe(false);
            console.log('Massless bodies and barycenters excluded ✓');
        });
        
        it('should show realistic perturbation summary', () => {
            const satellite = {
                id: 'geo-sat',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(42164, 0, 0), // GEO
                velocity: new THREE.Vector3(0, 3.075, 0)
            };
            
            const significantBodies = physicsEngine._getSignificantBodies(satellite, physicsEngine.bodies[399]);
            
            console.log('\n=== GEO Satellite Significant Bodies ===');
            significantBodies.forEach(bodyId => {
                const body = physicsEngine.bodies[bodyId];
                console.log(`  ${body.name} (${bodyId})`);
            });
            
            // At GEO, should include Moon and Sun
            expect(significantBodies.has(301)).toBe(true); // Moon
            expect(significantBodies.has(10)).toBe(true);  // Sun
            expect(significantBodies.size).toBeGreaterThan(0);
        });
    });
});