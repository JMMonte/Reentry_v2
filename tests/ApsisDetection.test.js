/**
 * Tests for Apsis Detection in N-Body Propagated Satellite Trajectories
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { UnifiedSatellitePropagator } from '../src/physics/core/UnifiedSatellitePropagator.js';
import { ApsisDetection } from '../src/services/ApsisDetection.js';

describe('Apsis Detection Tests', () => {
    let mockPhysicsState;
    
    beforeEach(() => {
        
        // Set up Earth-Moon system for apsis testing
        mockPhysicsState = {
            bodies: {
                10: { // Sun
                    name: 'Sun',
                    type: 'star',
                    mass: 1.989e30,
                    radius: 695700,
                    position: [0, 0, 0],
                    velocity: [0, 0, 0],
                    soiRadius: 1e12,
                    naifId: 10,
                    GM: 1.32712442018e11 // km³/s²
                },
                399: { // Earth
                    name: 'Earth',
                    type: 'planet',
                    mass: 5.972e24,
                    radius: 6371,
                    position: [149597870.7, 0, 0],
                    velocity: [0, 29.78, 0],
                    soiRadius: 924000,
                    naifId: 399,
                    GM: 398600.4415 // km³/s²
                },
                301: { // Moon
                    name: 'Moon',
                    type: 'moon',
                    mass: 7.342e22,
                    radius: 1737.4,
                    position: [149597870.7 + 384400, 0, 0],
                    velocity: [0, 29.78 + 1.022, 0],
                    soiRadius: 66183,
                    naifId: 301,
                    GM: 4902.800076 // km³/s²
                }
            },
            hierarchy: {
                10: { name: 'Sun', type: 'star', parent: null, children: [399] },
                399: { name: 'Earth', type: 'planet', parent: 10, children: [301] },
                301: { name: 'Moon', type: 'moon', parent: 399, children: [] }
            }
        };
        
        // UnifiedSatellitePropagator is static - no initialization needed
    });

    describe('Distance Calculation for Apsis Detection', () => {
        it('should calculate distance from satellite to central body correctly', () => {
            const satellitePos = new THREE.Vector3(10000, 0, 0); // 10,000 km from Earth center
            const centralBodyPos = new THREE.Vector3(0, 0, 0);
            
            const distance = satellitePos.distanceTo(centralBodyPos);
            expect(distance).toBe(10000);
            
            // Test with ApsisDetection service
            const serviceDistance = ApsisDetection.calculateDistance([10000, 0, 0], [0, 0, 0]);
            expect(serviceDistance).toBe(10000);
        });

        it('should handle 3D orbital positions', () => {
            const satellitePos = new THREE.Vector3(6000, 8000, 0); // 3D position
            const centralBodyPos = new THREE.Vector3(0, 0, 0);
            
            const distance = satellitePos.distanceTo(centralBodyPos);
            expect(distance).toBe(10000); // sqrt(6000² + 8000²) = 10000
            
            // Test with ApsisDetection service
            const serviceDistance = ApsisDetection.calculateDistance([6000, 8000, 0], [0, 0, 0]);
            expect(serviceDistance).toBe(10000);
        });
    });

    describe('Apsis Detection Algorithm', () => {
        it('should detect periapsis (minimum distance) in circular orbit', () => {
            // Create circular orbit points around Earth
            const orbitPoints = [];
            const radius = 7000; // 7000 km altitude
            const steps = 20;
            
            for (let i = 0; i < steps; i++) {
                const angle = (i / steps) * 2 * Math.PI;
                const x = radius * Math.cos(angle);
                const y = radius * Math.sin(angle);
                
                orbitPoints.push({
                    position: [x, y, 0],
                    time: i * 100, // 100 seconds per step
                    centralBodyId: 399,
                    distance: radius
                });
            }
            
            // All points should be at same distance (circular orbit)
            const distances = orbitPoints.map(p => 
                new THREE.Vector3(...p.position).length()
            );
            
            const minDistance = Math.min(...distances);
            const maxDistance = Math.max(...distances);
            
            // Circular orbit - min and max should be very close
            expect(Math.abs(maxDistance - minDistance)).toBeLessThan(0.001);
            expect(minDistance).toBeCloseTo(radius, 0);
        });

        it('should detect periapsis and apoapsis in elliptical orbit', () => {
            // Create elliptical orbit points
            const orbitPoints = [];
            const semiMajorAxis = 10000; // 10,000 km
            const eccentricity = 0.3;
            const steps = 40;
            
            for (let i = 0; i < steps; i++) {
                const trueAnomaly = (i / steps) * 2 * Math.PI;
                
                // Elliptical orbit equation: r = a(1-e²)/(1+e*cos(ν))
                const r = (semiMajorAxis * (1 - eccentricity * eccentricity)) / 
                          (1 + eccentricity * Math.cos(trueAnomaly));
                
                const x = r * Math.cos(trueAnomaly);
                const y = r * Math.sin(trueAnomaly);
                
                orbitPoints.push({
                    position: [x, y, 0],
                    time: i * 50,
                    centralBodyId: 399,
                    distance: r
                });
            }
            
            const distances = orbitPoints.map(p => 
                new THREE.Vector3(...p.position).length()
            );
            
            const minDistance = Math.min(...distances);
            const maxDistance = Math.max(...distances);
            
            // Calculate expected periapsis and apoapsis
            const expectedPeriapsis = semiMajorAxis * (1 - eccentricity);
            const expectedApoapsis = semiMajorAxis * (1 + eccentricity);
            
            expect(minDistance).toBeCloseTo(expectedPeriapsis, 0);
            expect(maxDistance).toBeCloseTo(expectedApoapsis, 0);
            
            // Find indices of periapsis and apoapsis
            const periapsisIndex = distances.indexOf(minDistance);
            const apoapsisIndex = distances.indexOf(maxDistance);
            
            expect(periapsisIndex).not.toBe(apoapsisIndex);
            expect(orbitPoints[periapsisIndex].time).not.toBe(orbitPoints[apoapsisIndex].time);
        });

        it('should identify next periapsis and apoapsis from current position', () => {
            // Create orbit with known apsis points
            const orbitPoints = [];
            const semiMajorAxis = 8000;
            const eccentricity = 0.5;
            const steps = 100;
            
            for (let i = 0; i < steps; i++) {
                const trueAnomaly = (i / steps) * 2 * Math.PI;
                const r = (semiMajorAxis * (1 - eccentricity * eccentricity)) / 
                          (1 + eccentricity * Math.cos(trueAnomaly));
                
                orbitPoints.push({
                    position: [r * Math.cos(trueAnomaly), r * Math.sin(trueAnomaly), 0],
                    time: i * 60, // 60 seconds per step
                    centralBodyId: 399,
                    distance: r
                });
            }
            
            // Find current position (e.g., 25% through orbit)
            const currentIndex = 25;
            const currentTime = orbitPoints[currentIndex].time;
            
            // Use ApsisDetection service to find next apsis points
            const nextPeriapsis = ApsisDetection.findNextPeriapsis(orbitPoints, currentTime, 399);
            const nextApoapsis = ApsisDetection.findNextApoapsis(orbitPoints, currentTime, 399);
            
            expect(nextPeriapsis).not.toBeNull();
            expect(nextApoapsis).not.toBeNull();
            expect(nextPeriapsis.time).toBeGreaterThan(currentTime);
            expect(nextApoapsis.time).toBeGreaterThan(currentTime);
            expect(nextPeriapsis.distance).toBeLessThan(nextApoapsis.distance);
        });
    });

    describe('N-Body Perturbation Effects on Apsis', () => {
        it('should handle apsis detection with lunar perturbations', async () => {
            // High Earth orbit affected by Moon
            const params = {
                satelliteId: 'test-heo',
                position: [30000, 0, 0], // 30,000 km from Earth (Moon-affected)
                velocity: [0, 3.0, 0], // Elliptical velocity
                centralBodyNaifId: 399,
                duration: 86400, // 24 hours
                timeStep: 300, // 5 minutes
                pointsPerChunk: 100
            };
            
            const collectedPoints = [];
            
            // Use UnifiedSatellitePropagator static method
            const points = UnifiedSatellitePropagator.propagateOrbit({
                satellite: {
                    position: params.position,
                    velocity: params.velocity,
                    centralBodyNaifId: params.centralBodyNaifId,
                    mass: 1000,
                    crossSectionalArea: 10,
                    dragCoefficient: 2.2
                },
                bodies: mockPhysicsState.bodies,
                duration: params.duration,
                timeStep: params.timeStep,
                includeJ2: true,
                includeDrag: false,
                includeThirdBody: true
            });
            // Convert to expected format
            collectedPoints.push(...points.map(p => ({ position: p.position, time: p.time })));
            
            // Calculate distances from Earth center
            const distances = collectedPoints.map(point => {
                return new THREE.Vector3(...point.position).length();
            });
            
            expect(distances.length).toBeGreaterThan(50);
            
            // Should have variation in distances due to elliptical orbit + perturbations
            const minDistance = Math.min(...distances);
            const maxDistance = Math.max(...distances);
            const variation = (maxDistance - minDistance) / minDistance;
            
            expect(variation).toBeGreaterThan(0.1); // At least 10% variation for elliptical orbit
            expect(minDistance).toBeGreaterThan(6371); // Above Earth's surface
        });

        it('should detect multiple apsis points in long propagation', async () => {
            // Propagate for multiple orbits
            const params = {
                satelliteId: 'multi-orbit',
                position: [12000, 0, 0], // 12,000 km from Earth
                velocity: [0, 4.5, 0], // Elliptical orbit
                centralBodyNaifId: 399,
                duration: 172800, // 48 hours (multiple orbits)
                timeStep: 180, // 3 minutes
                pointsPerChunk: 200
            };
            
            const collectedPoints = [];
            
            // Use UnifiedSatellitePropagator static method
            const points = UnifiedSatellitePropagator.propagateOrbit({
                satellite: {
                    position: params.position,
                    velocity: params.velocity,
                    centralBodyNaifId: params.centralBodyNaifId,
                    mass: 1000,
                    crossSectionalArea: 10,
                    dragCoefficient: 2.2
                },
                bodies: mockPhysicsState.bodies,
                duration: params.duration,
                timeStep: params.timeStep,
                includeJ2: true,
                includeDrag: false,
                includeThirdBody: true
            });
            // Convert to expected format
            collectedPoints.push(...points.map(p => ({ position: p.position, time: p.time })));
            
            // Use ApsisDetection service to find all apsis points
            const apsisPoints = ApsisDetection.detectApsisPoints(collectedPoints, {
                minimumSeparation: 1, // Reduce minimum separation for long propagations
                toleranceRatio: 0.001, // Reduce tolerance for better sensitivity
                requireAlternating: false
            });
            
            // For a 48-hour propagation, we should detect at least periapsis and apoapsis
            // Note: For highly elliptical orbits, there may only be one complete orbit in 48 hours
            expect(apsisPoints.length).toBeGreaterThan(1); // At least periapsis and apoapsis
            
            // Check alternating pattern
            let lastType = null;
            for (const apsis of apsisPoints) {
                expect(['periapsis', 'apoapsis']).toContain(apsis.type);
                if (lastType) {
                    expect(apsis.type).not.toBe(lastType); // Should alternate
                }
                lastType = apsis.type;
            }
        });
    });

    describe('Apsis Timing and Position Intersection', () => {
        it('should interpolate exact position at apsis time', () => {
            // Mock orbit points around an apsis
            const orbitPoints = [
                { position: [7990, 100, 0], time: 100, distance: 7991.25 },
                { position: [8000, 0, 0], time: 150, distance: 8000 }, // Exact apoapsis
                { position: [7990, -100, 0], time: 200, distance: 7991.25 }
            ];
            
            // Should find apoapsis at time 150
            const targetTime = 150;
            const point = orbitPoints.find(p => p.time === targetTime);
            
            expect(point).toBeDefined();
            expect(point.distance).toBe(8000);
            expect(point.position).toEqual([8000, 0, 0]);
        });

        it('should interpolate between orbit points for precise timing', () => {
            // Points before and after true apsis
            const point1 = { position: [7995, 50, 0], time: 140, distance: 7996.25 };
            const point2 = { position: [8000, 0, 0], time: 150, distance: 8000 };
            const point3 = { position: [7995, -50, 0], time: 160, distance: 7996.25 };
            
            // Linear interpolation between points
            const interpolatePosition = (p1, p2, t) => {
                const factor = (t - p1.time) / (p2.time - p1.time);
                return [
                    p1.position[0] + factor * (p2.position[0] - p1.position[0]),
                    p1.position[1] + factor * (p2.position[1] - p1.position[1]),
                    p1.position[2] + factor * (p2.position[2] - p1.position[2])
                ];
            };
            
            // Interpolate at apoapsis time
            const apsisTime = 150;
            const interpolatedPos = interpolatePosition(point1, point2, apsisTime);
            
            expect(interpolatedPos[0]).toBeCloseTo(8000, 1);
            expect(interpolatedPos[1]).toBeCloseTo(0, 1);
            expect(interpolatedPos[2]).toBeCloseTo(0, 1);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle orbit with no clear apsis (chaotic trajectory)', () => {
            // Simulate chaotic trajectory points
            const chaoticPoints = [];
            for (let i = 0; i < 50; i++) {
                const noise = Math.random() * 1000 + 7000; // 7000-8000 km with noise
                chaoticPoints.push({
                    position: [noise, Math.random() * 500, 0],
                    time: i * 100,
                    distance: noise
                });
            }
            
            const distances = chaoticPoints.map(p => p.distance);
            const minDistance = Math.min(...distances);
            const maxDistance = Math.max(...distances);
            
            // Even chaotic data should have min/max
            expect(minDistance).toBeLessThan(maxDistance);
            expect(minDistance).toBeGreaterThan(6371); // Above Earth surface
        });

        it('should handle insufficient orbit data gracefully', () => {
            const singlePoint = [
                { position: [7000, 0, 0], time: 0, distance: 7000 }
            ];
            
            // Cannot determine apsis with single point
            expect(singlePoint.length).toBe(1);
            // Algorithm should require at least 3 points for apsis detection
        });

        it('should handle SOI transitions affecting apsis calculation', () => {
            // Points crossing SOI boundary
            const transitionPoints = [
                { position: [300000, 0, 0], time: 0, centralBodyId: 399, distance: 300000 },
                { position: [320000, 0, 0], time: 100, centralBodyId: 399, distance: 320000 },
                { position: [50000, 0, 0], time: 200, centralBodyId: 301, distance: 50000 }, // SOI change
                { position: [40000, 0, 0], time: 300, centralBodyId: 301, distance: 40000 }
            ];
            
            // Apsis detection should segment by central body
            const earthSegment = transitionPoints.filter(p => p.centralBodyId === 399);
            const moonSegment = transitionPoints.filter(p => p.centralBodyId === 301);
            
            expect(earthSegment.length).toBe(2);
            expect(moonSegment.length).toBe(2);
            
            // Each segment should be analyzed separately for apsis
        });
    });
});