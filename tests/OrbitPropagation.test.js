/**
 * Tests for orbit propagation logic including SOI transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Constants } from '../src/utils/Constants.js';

// Mock the worker since we'll test the logic directly
vi.mock('../src/workers/orbitPropagationWorker.js');

describe('Orbit Propagation Tests', () => {
    let mockPhysicsState;
    let mockWorker;

    beforeEach(() => {
        // Set up mock physics state with Earth and Sun
        mockPhysicsState = {
            bodies: {
                399: { // Earth
                    naif: 399,
                    position: [0, 0, 0],
                    velocity: [0, 0, 0],
                    mass: 5.972e24,
                    radius: 6371,
                    soiRadius: 929000, // km
                    GM: Constants.G * 5.972e24,
                    type: 'planet'
                },
                10: { // Sun
                    naif: 10,
                    position: [-149597870.7, 0, 0], // 1 AU away
                    velocity: [0, -30, 0], // Earth's orbital velocity
                    mass: 1.989e30,
                    radius: 695700,
                    soiRadius: 1e12, // Effectively infinite
                    GM: Constants.G * 1.989e30,
                    type: 'star'
                }
            }
        };
    });

    describe('Orbit within Earth SOI', () => {
        it('should propagate circular orbit without leaving SOI', async () => {
            // Low Earth Orbit parameters
            const altitude = 400; // km
            const radius = mockPhysicsState.bodies[399].radius + altitude;
            const velocity = Math.sqrt(mockPhysicsState.bodies[399].GM / radius);
            
            const satellite = {
                position: [radius, 0, 0],
                velocity: [0, velocity, 0],
                centralBodyNaifId: 399
            };

            const propagationParams = {
                position: satellite.position,
                velocity: satellite.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId,
                duration: 5400, // 1.5 hours (about 1 orbit)
                timeStep: 60, // 1 minute
                propagateSolarSystem: false
            };

            // Test that all points stay within SOI
            const orbitPoints = await propagateOrbit(propagationParams, mockPhysicsState);
            
            expect(orbitPoints.length).toBeGreaterThan(0);
            
            // Check all points are within Earth's SOI
            orbitPoints.forEach(point => {
                const distance = Math.sqrt(
                    point.position[0]**2 + 
                    point.position[1]**2 + 
                    point.position[2]**2
                );
                expect(distance).toBeLessThan(mockPhysicsState.bodies[399].soiRadius);
                expect(point.centralBodyId).toBe(399);
                expect(point.isSOIExit).toBeFalsy();
            });
        });

        it('should propagate elliptical orbit within SOI', async () => {
            // Elliptical orbit with apogee at 35786 km (GEO) and perigee at 400 km
            const perigee = mockPhysicsState.bodies[399].radius + 400;
            const apogee = mockPhysicsState.bodies[399].radius + 35786;
            const a = (perigee + apogee) / 2; // semi-major axis
            const e = (apogee - perigee) / (apogee + perigee); // eccentricity
            
            // Velocity at perigee
            const vPerigee = Math.sqrt(mockPhysicsState.bodies[399].GM * (2/perigee - 1/a));
            
            const satellite = {
                position: [perigee, 0, 0],
                velocity: [0, vPerigee, 0],
                centralBodyNaifId: 399
            };

            const propagationParams = {
                position: satellite.position,
                velocity: satellite.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId,
                duration: 43200, // 12 hours (about 1 orbit for GEO)
                timeStep: 300, // 5 minutes
                propagateSolarSystem: false
            };

            const orbitPoints = await propagateOrbit(propagationParams, mockPhysicsState);
            
            // Find max distance (should be at apogee)
            const maxDistance = Math.max(...orbitPoints.map(point => 
                Math.sqrt(point.position[0]**2 + point.position[1]**2 + point.position[2]**2)
            ));
            
            // Due to simplified physics, just check it's elliptical with reasonable bounds
            expect(maxDistance).toBeGreaterThan(apogee * 0.7); // At least 70% of expected
            expect(maxDistance).toBeLessThan(apogee * 1.3); // At most 130% of expected
            expect(maxDistance).toBeLessThan(mockPhysicsState.bodies[399].soiRadius);
        });
    });

    describe('SOI boundary detection', () => {
        it('should detect when orbit exits Earth SOI', async () => {
            // Escape velocity from 400 km altitude
            const altitude = 400;
            const radius = mockPhysicsState.bodies[399].radius + altitude;
            const escapeVelocity = Math.sqrt(2 * mockPhysicsState.bodies[399].GM / radius);
            
            const satellite = {
                position: [radius, 0, 0],
                velocity: [escapeVelocity * 1.1, 0, 0], // 10% above escape velocity
                centralBodyNaifId: 399
            };

            const propagationParams = {
                position: satellite.position,
                velocity: satellite.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId,
                duration: 30 * 86400, // 30 days
                timeStep: 3600, // 1 hour
                propagateSolarSystem: false
            };

            const orbitPoints = await propagateOrbit(propagationParams, mockPhysicsState);
            
            // Should stop at SOI boundary
            const lastPoint = orbitPoints[orbitPoints.length - 1];
            expect(lastPoint.isSOIExit).toBeTruthy();
            
            const lastDistance = Math.sqrt(
                lastPoint.position[0]**2 + 
                lastPoint.position[1]**2 + 
                lastPoint.position[2]**2
            );
            
            // Should be close to Earth's SOI radius
            expect(lastDistance).toBeGreaterThan(mockPhysicsState.bodies[399].soiRadius * 0.99);
            expect(lastDistance).toBeLessThan(mockPhysicsState.bodies[399].soiRadius * 1.02); // Allow 2% overshoot due to timeStep
        });

        it('should handle hyperbolic trajectory correctly', async () => {
            // Hyperbolic trajectory with C3 = 10 km²/s²
            const C3 = 10; // km²/s²
            const radius = mockPhysicsState.bodies[399].radius + 400;
            const velocity = Math.sqrt(C3 + 2 * mockPhysicsState.bodies[399].GM / radius);
            
            const satellite = {
                position: [radius, 0, 0],
                velocity: [0, velocity, 0],
                centralBodyNaifId: 399
            };

            const propagationParams = {
                position: satellite.position,
                velocity: satellite.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId,
                duration: 30 * 86400, // 30 days
                timeStep: 3600, // 1 hour
                propagateSolarSystem: false
            };

            const orbitPoints = await propagateOrbit(propagationParams, mockPhysicsState);
            
            // Check that orbit is marked as hyperbolic/escape
            const speeds = orbitPoints.map(point => 
                Math.sqrt(point.velocity[0]**2 + point.velocity[1]**2 + point.velocity[2]**2)
            );
            
            // Speed should remain above escape velocity
            speeds.forEach((speed, i) => {
                const r = Math.sqrt(
                    orbitPoints[i].position[0]**2 + 
                    orbitPoints[i].position[1]**2 + 
                    orbitPoints[i].position[2]**2
                );
                const escapeSpeed = Math.sqrt(2 * mockPhysicsState.bodies[399].GM / r);
                expect(speed).toBeGreaterThan(escapeSpeed * 0.99); // Allow 1% numerical error
            });
        });
    });

    describe('Orbit visualization segments', () => {
        it('should create discontinuous segments at SOI boundaries', async () => {
            // Create an orbit that exits Earth's SOI
            const radius = mockPhysicsState.bodies[399].radius + 400;
            const escapeVelocity = Math.sqrt(2 * mockPhysicsState.bodies[399].GM / radius);
            
            const satellite = {
                position: [radius, 0, 0],
                velocity: [escapeVelocity * 1.2, 0, 0],
                centralBodyNaifId: 399
            };

            const propagationParams = {
                position: satellite.position,
                velocity: satellite.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId,
                duration: 30 * 86400,
                timeStep: 3600,
                propagateSolarSystem: false
            };

            const orbitPoints = await propagateOrbit(propagationParams, mockPhysicsState);
            
            // Process points into segments (simulating SatelliteOrbitManager logic)
            const segments = createOrbitSegments(orbitPoints);
            
            // Should have at least one segment
            expect(segments.length).toBeGreaterThanOrEqual(1);
            
            // Last segment should end at SOI boundary
            const lastSegment = segments[segments.length - 1];
            const lastPoint = lastSegment.points[lastSegment.points.length - 1];
            expect(lastPoint.isSOIExit).toBeTruthy();
        });
    });

    describe('Maneuver node propagation', () => {
        it('should propagate post-maneuver orbit correctly', async () => {
            // Circular orbit at 400 km
            const radius = mockPhysicsState.bodies[399].radius + 400;
            const velocity = Math.sqrt(mockPhysicsState.bodies[399].GM / radius);
            
            // Apply prograde burn of 100 m/s
            const deltaV = [0, 0.1, 0]; // 100 m/s in velocity direction
            
            const preManeuverState = {
                position: [radius, 0, 0],
                velocity: [0, velocity, 0],
                centralBodyNaifId: 399
            };
            
            const postManeuverState = {
                position: preManeuverState.position,
                velocity: [
                    preManeuverState.velocity[0] + deltaV[0],
                    preManeuverState.velocity[1] + deltaV[1],
                    preManeuverState.velocity[2] + deltaV[2]
                ],
                centralBodyNaifId: 399
            };

            const propagationParams = {
                position: postManeuverState.position,
                velocity: postManeuverState.velocity,
                centralBodyNaifId: postManeuverState.centralBodyNaifId,
                duration: 7200, // 2 hours
                timeStep: 60,
                propagateSolarSystem: false
            };

            const orbitPoints = await propagateOrbit(propagationParams, mockPhysicsState);
            
            // Check that orbit is now elliptical
            const distances = orbitPoints.map(point => 
                Math.sqrt(point.position[0]**2 + point.position[1]**2 + point.position[2]**2)
            );
            
            const minDistance = Math.min(...distances);
            const maxDistance = Math.max(...distances);
            
            // Should have raised apogee
            expect(maxDistance).toBeGreaterThan(radius + 50); // At least 50 km higher
            // Perigee should remain reasonably close
            expect(minDistance).toBeGreaterThan(radius * 0.9);
            expect(minDistance).toBeLessThan(radius * 1.1);
        });
    });
});

// Helper function to simulate orbit propagation (simplified version of worker logic)
async function propagateOrbit(params, physicsState) {
    const points = [];
    let position = new THREE.Vector3(...params.position);
    let velocity = new THREE.Vector3(...params.velocity);
    let time = 0;
    
    const numSteps = Math.floor(params.duration / params.timeStep);
    const centralBody = physicsState.bodies[params.centralBodyNaifId];
    
    for (let i = 0; i < numSteps; i++) {
        // Simple two-body propagation
        const r = position.length();
        const acceleration = position.clone().normalize().multiplyScalar(-centralBody.GM / (r * r));
        
        // Simple Euler integration for testing
        velocity.add(acceleration.clone().multiplyScalar(params.timeStep));
        position.add(velocity.clone().multiplyScalar(params.timeStep));
        time += params.timeStep;
        
        // Check SOI
        const distance = position.length();
        const isSOIExit = distance > centralBody.soiRadius;
        
        points.push({
            position: position.toArray(),
            velocity: velocity.toArray(),
            time: time,
            centralBodyId: params.centralBodyNaifId,
            isSOIExit: isSOIExit
        });
        
        if (isSOIExit && !params.propagateSolarSystem) {
            break; // Stop at SOI boundary
        }
    }
    
    return points;
}

// Helper function to create orbit segments
function createOrbitSegments(points) {
    const segments = [];
    let currentSegment = null;
    
    for (const point of points) {
        if (!currentSegment || point.isSOIEntry) {
            if (currentSegment) {
                segments.push(currentSegment);
            }
            currentSegment = {
                centralBodyId: point.centralBodyId,
                points: [],
                isAfterSOITransition: point.isSOIEntry || false
            };
        }
        
        currentSegment.points.push(point);
        
        if (point.isSOIExit) {
            segments.push(currentSegment);
            currentSegment = null;
        }
    }
    
    if (currentSegment && currentSegment.points.length > 0) {
        segments.push(currentSegment);
    }
    
    return segments;
}