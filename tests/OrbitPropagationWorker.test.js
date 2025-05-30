/**
 * Tests for the orbit propagation worker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Worker from 'web-worker:../src/workers/orbitPropagationWorker.js';

describe('OrbitPropagationWorker Tests', () => {
    let worker;
    let messages;

    beforeEach(() => {
        worker = new Worker();
        messages = [];
        
        // Capture worker messages
        worker.onmessage = (event) => {
            messages.push(event.data);
        };
        
        // Initialize worker with physics state
        const physicsState = {
            bodies: {
                399: { // Earth
                    naif: 399,
                    position: [0, 0, 0],
                    velocity: [0, 0, 0],
                    mass: 5.972e24,
                    radius: 6371,
                    soiRadius: 929000,
                    GM: 398600.4415,
                    type: 'planet',
                    J2: 0.00108263
                },
                10: { // Sun
                    naif: 10,
                    position: [-149597870.7, 0, 0],
                    velocity: [0, -30, 0],
                    mass: 1.989e30,
                    radius: 695700,
                    soiRadius: 1e12,
                    GM: 132712440041.93938,
                    type: 'star'
                },
                301: { // Moon
                    naif: 301,
                    position: [384400, 0, 0],
                    velocity: [0, 1.022, 0],
                    mass: 7.342e22,
                    radius: 1737.4,
                    soiRadius: 66100,
                    GM: 4902.8000,
                    type: 'moon'
                }
            },
            hierarchy: null,
            currentTime: Date.now()
        };
        
        worker.postMessage({
            type: 'updatePhysicsState',
            data: physicsState
        });
        
        // Clear initialization messages
        messages = [];
    });

    afterEach(() => {
        worker.terminate();
    });

    describe('Basic orbit propagation', () => {
        it('should propagate LEO orbit successfully', (done) => {
            const satelliteId = 'test-leo-1';
            const radius = 6371 + 400; // 400 km altitude
            const velocity = 7.66; // km/s (circular velocity)
            
            worker.postMessage({
                type: 'propagate',
                data: {
                    satelliteId,
                    position: [radius, 0, 0],
                    velocity: [0, velocity, 0],
                    centralBodyNaifId: 399,
                    duration: 5400, // 90 minutes
                    timeStep: 60, // 1 minute
                    propagateSolarSystem: false
                }
            });
            
            // Wait for completion
            const checkComplete = () => {
                const completeMsg = messages.find(msg => msg.type === 'complete');
                if (completeMsg) {
                    // Check we got chunks
                    const chunks = messages.filter(msg => msg.type === 'chunk');
                    expect(chunks.length).toBeGreaterThan(0);
                    
                    // Check total points
                    const totalPoints = chunks.reduce((sum, chunk) => sum + chunk.points.length, 0);
                    expect(totalPoints).toBeGreaterThan(80); // At least 80 points
                    
                    // Verify no SOI transitions
                    const transitions = chunks.flatMap(chunk => chunk.soiTransitions || []);
                    expect(transitions.length).toBe(0);
                    
                    done();
                } else {
                    setTimeout(checkComplete, 10);
                }
            };
            checkComplete();
        });

        it('should detect SOI exit for escape trajectory', (done) => {
            const satelliteId = 'test-escape-1';
            const radius = 6371 + 400;
            const escapeVelocity = Math.sqrt(2 * 398600.4415 / radius);
            
            worker.postMessage({
                type: 'propagate',
                data: {
                    satelliteId,
                    position: [radius, 0, 0],
                    velocity: [escapeVelocity * 1.1, 0, 0], // 10% above escape
                    centralBodyNaifId: 399,
                    duration: 30 * 86400, // 30 days
                    timeStep: 3600, // 1 hour
                    propagateSolarSystem: false
                }
            });
            
            const checkComplete = () => {
                const completeMsg = messages.find(msg => msg.type === 'complete');
                if (completeMsg) {
                    const chunks = messages.filter(msg => msg.type === 'chunk');
                    
                    // Should have SOI transitions
                    const transitions = chunks.flatMap(chunk => chunk.soiTransitions || []);
                    expect(transitions.length).toBeGreaterThan(0);
                    
                    // Last point should be marked as SOI exit
                    const allPoints = chunks.flatMap(chunk => chunk.points);
                    const lastPoint = allPoints[allPoints.length - 1];
                    expect(lastPoint.isSOIExit).toBeTruthy();
                    
                    done();
                } else {
                    setTimeout(checkComplete, 10);
                }
            };
            checkComplete();
        });
    });

    describe('Worker message handling', () => {
        it('should handle cancel message', (done) => {
            const satelliteId = 'test-cancel-1';
            
            worker.postMessage({
                type: 'propagate',
                data: {
                    satelliteId,
                    position: [6771, 0, 0],
                    velocity: [0, 7.66, 0],
                    centralBodyNaifId: 399,
                    duration: 86400, // 1 day
                    timeStep: 10, // Small step for long propagation
                    propagateSolarSystem: false
                }
            });
            
            // Cancel after 50ms
            setTimeout(() => {
                worker.postMessage({ type: 'cancel' });
                
                // Should stop getting chunks
                setTimeout(() => {
                    const chunksBeforeCancel = messages.filter(msg => msg.type === 'chunk').length;
                    
                    setTimeout(() => {
                        const chunksAfterCancel = messages.filter(msg => msg.type === 'chunk').length;
                        expect(chunksAfterCancel).toBe(chunksBeforeCancel);
                        done();
                    }, 100);
                }, 50);
            }, 50);
        });

        it('should handle missing central body error', (done) => {
            worker.postMessage({
                type: 'propagate',
                data: {
                    satelliteId: 'test-error-1',
                    position: [6771, 0, 0],
                    velocity: [0, 7.66, 0],
                    centralBodyNaifId: 999, // Non-existent body
                    duration: 5400,
                    timeStep: 60,
                    propagateSolarSystem: false
                }
            });
            
            const checkError = () => {
                const errorMsg = messages.find(msg => msg.type === 'error');
                if (errorMsg) {
                    expect(errorMsg.error).toContain('Central body 999 not found');
                    done();
                } else {
                    setTimeout(checkError, 10);
                }
            };
            checkError();
        });
    });

    describe('Chunked propagation', () => {
        it('should send multiple chunks for long propagation', (done) => {
            const satelliteId = 'test-chunks-1';
            
            worker.postMessage({
                type: 'propagate',
                data: {
                    satelliteId,
                    position: [6771, 0, 0],
                    velocity: [0, 7.66, 0],
                    centralBodyNaifId: 399,
                    duration: 10800, // 3 hours
                    timeStep: 30, // 30 seconds
                    pointsPerChunk: 50, // Force multiple chunks
                    propagateSolarSystem: false
                }
            });
            
            const checkComplete = () => {
                const completeMsg = messages.find(msg => msg.type === 'complete');
                if (completeMsg) {
                    const chunks = messages.filter(msg => msg.type === 'chunk');
                    expect(chunks.length).toBeGreaterThan(1); // Multiple chunks
                    
                    // Each chunk should have progress info
                    chunks.forEach((chunk, i) => {
                        expect(chunk.progress).toBeGreaterThan(0);
                        expect(chunk.progress).toBeLessThanOrEqual(1);
                        
                        // Last chunk should be marked complete
                        if (i === chunks.length - 1) {
                            expect(chunk.isComplete).toBeTruthy();
                        }
                    });
                    
                    done();
                } else {
                    setTimeout(checkComplete, 10);
                }
            };
            checkComplete();
        });
    });

    describe('Perturbations', () => {
        it('should include J2 perturbation for Earth satellites', (done) => {
            const satelliteId = 'test-j2-1';
            const radius = 6371 + 400;
            const velocity = Math.sqrt(398600.4415 / radius);
            
            // Polar orbit to maximize J2 effect
            worker.postMessage({
                type: 'propagate',
                data: {
                    satelliteId,
                    position: [radius, 0, 0],
                    velocity: [0, 0, velocity], // Polar orbit
                    centralBodyNaifId: 399,
                    duration: 5400, // 90 minutes
                    timeStep: 60,
                    propagateSolarSystem: false
                }
            });
            
            const checkComplete = () => {
                const completeMsg = messages.find(msg => msg.type === 'complete');
                if (completeMsg) {
                    const chunks = messages.filter(msg => msg.type === 'chunk');
                    const points = chunks.flatMap(chunk => chunk.points);
                    
                    // For polar orbit, J2 should cause precession
                    // Check that orbit doesn't return exactly to start
                    const firstPoint = points[0];
                    const lastPoint = points[points.length - 1];
                    
                    // Position should be different due to J2 precession
                    const posDiff = Math.sqrt(
                        (lastPoint.position[0] - firstPoint.position[0])**2 +
                        (lastPoint.position[1] - firstPoint.position[1])**2 +
                        (lastPoint.position[2] - firstPoint.position[2])**2
                    );
                    
                    expect(posDiff).toBeGreaterThan(1); // At least 1 km difference
                    
                    done();
                } else {
                    setTimeout(checkComplete, 10);
                }
            };
            checkComplete();
        });
    });
});