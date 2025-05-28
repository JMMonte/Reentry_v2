/**
 * NumericalPropagator.js
 * 
 * Numerical orbit propagation system that integrates with PhysicsEngine
 * Handles perturbations, SOI transitions and different orbit types
 */
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';

export class NumericalPropagator {
    constructor(physicsEngine) {
        this.physicsEngine = physicsEngine;
    }

    /**
     * Determine orbit type and propagation parameters
     * @param {Object} satellite - Satellite state with position, velocity, centralBodyNaifId
     * @returns {Object} { type: 'elliptical'|'parabolic'|'hyperbolic', period, duration, points }
     */
    analyzeOrbit(satellite) {
        console.log('[NumericalPropagator] Analyzing orbit for satellite:', satellite.id);
        
        const centralBody = this.physicsEngine.bodies[satellite.centralBodyNaifId];
        if (!centralBody) {
            console.error(`[NumericalPropagator] Central body ${satellite.centralBodyNaifId} not found`);
            throw new Error(`Central body ${satellite.centralBodyNaifId} not found`);
        }

        // Handle both Vector3 and array formats
        const r = satellite.position.toArray ? satellite.position.clone() : new THREE.Vector3().fromArray(satellite.position);
        const v = satellite.velocity.toArray ? satellite.velocity.clone() : new THREE.Vector3().fromArray(satellite.velocity);
        const mu = Constants.G * centralBody.mass;
        
        // Calculate orbital energy
        const rMag = r.length();
        const vMag = v.length();
        const specificEnergy = (vMag * vMag / 2) - (mu / rMag);
        
        // Calculate eccentricity vector
        const h = new THREE.Vector3().crossVectors(r, v);
        const hMag = h.length();
        const eVec = new THREE.Vector3()
            .crossVectors(v, h)
            .divideScalar(mu)
            .sub(r.clone().divideScalar(rMag));
        const eccentricity = eVec.length();

        let type, period, duration, points;

        if (eccentricity < 0.999) {
            // Elliptical orbit
            type = 'elliptical';
            const a = -mu / (2 * specificEnergy);
            period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
            duration = period * 2; // Default to 2 periods
            points = 360; // Points per period
        } else if (eccentricity < 1.001) {
            // Parabolic orbit
            type = 'parabolic';
            period = Infinity;
            duration = this.calculateEscapeDuration(satellite, centralBody);
            points = 500;
        } else {
            // Hyperbolic orbit
            type = 'hyperbolic';
            period = Infinity;
            duration = this.calculateEscapeDuration(satellite, centralBody);
            points = 500;
        }

        const result = { type, period, duration, points, eccentricity, specificEnergy };
        console.log('[NumericalPropagator] Orbit analysis result:', result);
        return result;
    }

    /**
     * Calculate duration to reach SOI boundary or max distance
     */
    calculateEscapeDuration(satellite, centralBody) {
        const soiRadius = centralBody.soiRadius || 1e9; // Default to large value
        const maxRadius = centralBody.naifId === 10 ? 500 * Constants.AU : soiRadius;
        
        // Rough estimate: use current velocity to estimate time to boundary
        const r = new THREE.Vector3().fromArray(satellite.position);
        const v = new THREE.Vector3().fromArray(satellite.velocity);
        const currentRadius = r.length();
        const radialVelocity = r.dot(v) / currentRadius;
        
        if (radialVelocity <= 0) {
            // Not escaping
            return 86400; // 1 day default
        }
        
        const distanceToBoundary = maxRadius - currentRadius;
        const estimatedTime = distanceToBoundary / radialVelocity;
        
        // Cap at reasonable values
        return Math.min(Math.max(estimatedTime, 3600), 86400 * 365); // 1 hour to 1 year
    }

    /**
     * Propagate orbit with SOI checking
     * @param {Object} params - Propagation parameters
     * @returns {Object} { points: [], soiTransitions: [] }
     */
    async propagateOrbit(params) {
        const { 
            satellite, 
            duration, 
            timeStep = 60, // seconds
            maxPoints = 10000,
            checkSOI = true,
            onProgress
        } = params;

        const points = [];
        const soiTransitions = [];
        
        // Clone satellite state to avoid modifying original
        let currentSat = {
            position: new THREE.Vector3().fromArray(satellite.position),
            velocity: new THREE.Vector3().fromArray(satellite.velocity),
            centralBodyNaifId: satellite.centralBodyNaifId
        };

        const numSteps = Math.min(Math.floor(duration / timeStep), maxPoints);
        let currentTime = 0;

        for (let i = 0; i < numSteps; i++) {
            // Store current position
            points.push({
                position: currentSat.position.clone(),
                time: currentTime,
                centralBodyNaifId: currentSat.centralBodyNaifId
            });

            // Check SOI if enabled
            if (checkSOI) {
                const transition = this.checkSOITransition(currentSat);
                if (transition) {
                    soiTransitions.push({
                        time: currentTime,
                        fromBody: transition.fromBody,
                        toBody: transition.toBody,
                        position: currentSat.position.clone()
                    });
                    
                    // Update satellite's central body
                    currentSat.centralBodyNaifId = transition.toBody;
                    currentSat.position = transition.newPosition;
                    currentSat.velocity = transition.newVelocity;
                }
            }

            // Propagate one step
            const acceleration = this.computeAcceleration(currentSat);
            this.integrateStep(currentSat, acceleration, timeStep);
            currentTime += timeStep;

            // Report progress
            if (onProgress && i % 100 === 0) {
                onProgress(i / numSteps);
            }
        }

        return { points, soiTransitions };
    }

    /**
     * Check if satellite has transitioned to a new SOI
     */
    checkSOITransition(satellite) {
        const centralBody = this.physicsEngine.bodies[satellite.centralBodyNaifId];
        if (!centralBody) return null;

        const satGlobalPos = satellite.position.clone().add(centralBody.position);
        const distToCentral = satellite.position.length();

        // Check if outside current SOI
        const soiRadius = centralBody.soiRadius || 1e12;
        if (distToCentral > soiRadius) {
            // Find new central body (parent in hierarchy)
            const parentNaifId = this.physicsEngine.hierarchy?.getParent(satellite.centralBodyNaifId);
            if (parentNaifId !== undefined && this.physicsEngine.bodies[parentNaifId]) {
                const newCentral = this.physicsEngine.bodies[parentNaifId];
                const newPos = satGlobalPos.clone().sub(newCentral.position);
                const newVel = satellite.velocity.clone()
                    .add(centralBody.velocity)
                    .sub(newCentral.velocity);

                return {
                    fromBody: satellite.centralBodyNaifId,
                    toBody: parentNaifId,
                    newPosition: newPos,
                    newVelocity: newVel
                };
            }
        }

        // Check if entered a child body's SOI
        for (const [bodyId, body] of Object.entries(this.physicsEngine.bodies)) {
            if (bodyId == satellite.centralBodyNaifId) continue;
            
            // Check if this body is a child of current central body
            const parentId = this.physicsEngine.hierarchy?.getParent(Number(bodyId));
            if (parentId === satellite.centralBodyNaifId && body.soiRadius) {
                const relPos = satGlobalPos.clone().sub(body.position);
                const distance = relPos.length();
                
                if (distance < body.soiRadius) {
                    const newVel = satellite.velocity.clone()
                        .add(centralBody.velocity)
                        .sub(body.velocity);
                    
                    return {
                        fromBody: satellite.centralBodyNaifId,
                        toBody: Number(bodyId),
                        newPosition: relPos,
                        newVelocity: newVel
                    };
                }
            }
        }

        return null;
    }

    /**
     * Compute acceleration using physics engine forces
     */
    computeAcceleration(satellite) {
        // Convert to format expected by physics engine
        const satData = {
            position: satellite.position,
            velocity: satellite.velocity,
            centralBodyNaifId: satellite.centralBodyNaifId,
            mass: 1000 // Default mass
        };

        // Use physics engine's acceleration computation
        return this.physicsEngine._computeSatelliteAcceleration(satData);
    }

    /**
     * Simple RK4 integration step
     */
    integrateStep(satellite, acceleration, dt) {
        // RK4 integration
        const pos0 = satellite.position.clone();
        const vel0 = satellite.velocity.clone();
        const acc0 = acceleration;

        // k1
        const k1v = acc0.clone().multiplyScalar(dt);
        const k1p = vel0.clone().multiplyScalar(dt);

        // k2
        const pos1 = pos0.clone().addScaledVector(k1p, 0.5);
        const vel1 = vel0.clone().addScaledVector(k1v, 0.5);
        satellite.position = pos1;
        satellite.velocity = vel1;
        const acc1 = this.computeAcceleration(satellite);
        const k2v = acc1.clone().multiplyScalar(dt);
        const k2p = vel1.clone().multiplyScalar(dt);

        // k3
        const pos2 = pos0.clone().addScaledVector(k2p, 0.5);
        const vel2 = vel0.clone().addScaledVector(k2v, 0.5);
        satellite.position = pos2;
        satellite.velocity = vel2;
        const acc2 = this.computeAcceleration(satellite);
        const k3v = acc2.clone().multiplyScalar(dt);
        const k3p = vel2.clone().multiplyScalar(dt);

        // k4
        const pos3 = pos0.clone().add(k3p);
        const vel3 = vel0.clone().add(k3v);
        satellite.position = pos3;
        satellite.velocity = vel3;
        const acc3 = this.computeAcceleration(satellite);
        const k4v = acc3.clone().multiplyScalar(dt);
        const k4p = vel3.clone().multiplyScalar(dt);

        // Final update
        satellite.position = pos0
            .addScaledVector(k1p, 1/6)
            .addScaledVector(k2p, 1/3)
            .addScaledVector(k3p, 1/3)
            .addScaledVector(k4p, 1/6);

        satellite.velocity = vel0
            .addScaledVector(k1v, 1/6)
            .addScaledVector(k2v, 1/3)
            .addScaledVector(k3v, 1/3)
            .addScaledVector(k4v, 1/6);
    }
}