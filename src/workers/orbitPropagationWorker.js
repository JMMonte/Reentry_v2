/**
 * orbitPropagationWorker.js
 * 
 * Web Worker for satellite orbit propagation
 * Handles physics-based orbit computation in background thread
 */

import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';

// Simplified physics engine state
let physicsState = {
    bodies: {},
    hierarchy: null
};

// Simplified force calculations (matching PhysicsEngine)
function computeSatelliteAcceleration(satellite) {
    const totalAccel = new THREE.Vector3();
    const centralBody = physicsState.bodies[satellite.centralBodyNaifId];
    
    if (!centralBody) {
        return totalAccel;
    }

    // Convert to global position
    const satGlobalPos = new THREE.Vector3()
        .fromArray(satellite.position)
        .add(new THREE.Vector3().fromArray(centralBody.position));

    // Compute forces from all bodies
    for (const [bodyId, body] of Object.entries(physicsState.bodies)) {
        if (!body.position || !body.mass) continue;
        
        const r = new THREE.Vector3()
            .fromArray(body.position)
            .sub(satGlobalPos);
        const distance = r.length();
        
        if (distance > 1e-6) {
            const gravAccel = (Constants.G * body.mass) / (distance * distance * distance);
            const accVec = r.multiplyScalar(gravAccel);
            totalAccel.add(accVec);
        }
    }

    // Compute central body acceleration for reference frame
    const centralAccel = new THREE.Vector3();
    const centralGlobalPos = new THREE.Vector3().fromArray(centralBody.position);
    
    for (const [bodyId, body] of Object.entries(physicsState.bodies)) {
        if (bodyId == satellite.centralBodyNaifId || !body.position || !body.mass) continue;
        
        const r = new THREE.Vector3()
            .fromArray(body.position)
            .sub(centralGlobalPos);
        const distance = r.length();
        
        if (distance > 1e-6) {
            const gravAccel = (Constants.G * body.mass) / (distance * distance * distance);
            centralAccel.add(r.clone().multiplyScalar(gravAccel));
        }
    }

    // Convert to planet-centric frame
    totalAccel.sub(centralAccel);
    
    return totalAccel;
}

// RK4 integration
function integrateRK4(position, velocity, dt) {
    const satellite = {
        position: position.toArray(),
        velocity: velocity.toArray(),
        centralBodyNaifId: currentCentralBodyId
    };

    const pos0 = position.clone();
    const vel0 = velocity.clone();
    const acc0 = computeSatelliteAcceleration(satellite);

    // k1
    const k1v = acc0.clone().multiplyScalar(dt);
    const k1p = vel0.clone().multiplyScalar(dt);

    // k2
    const pos1 = pos0.clone().addScaledVector(k1p, 0.5);
    const vel1 = vel0.clone().addScaledVector(k1v, 0.5);
    satellite.position = pos1.toArray();
    satellite.velocity = vel1.toArray();
    const acc1 = computeSatelliteAcceleration(satellite);
    const k2v = acc1.clone().multiplyScalar(dt);
    const k2p = vel1.clone().multiplyScalar(dt);

    // k3
    const pos2 = pos0.clone().addScaledVector(k2p, 0.5);
    const vel2 = vel0.clone().addScaledVector(k2v, 0.5);
    satellite.position = pos2.toArray();
    satellite.velocity = vel2.toArray();
    const acc2 = computeSatelliteAcceleration(satellite);
    const k3v = acc2.clone().multiplyScalar(dt);
    const k3p = vel2.clone().multiplyScalar(dt);

    // k4
    const pos3 = pos0.clone().add(k3p);
    const vel3 = vel0.clone().add(k3v);
    satellite.position = pos3.toArray();
    satellite.velocity = vel3.toArray();
    const acc3 = computeSatelliteAcceleration(satellite);
    const k4v = acc3.clone().multiplyScalar(dt);
    const k4p = vel3.clone().multiplyScalar(dt);

    // Final update
    const newPos = pos0
        .addScaledVector(k1p, 1/6)
        .addScaledVector(k2p, 1/3)
        .addScaledVector(k3p, 1/3)
        .addScaledVector(k4p, 1/6);

    const newVel = vel0
        .addScaledVector(k1v, 1/6)
        .addScaledVector(k2v, 1/3)
        .addScaledVector(k3v, 1/3)
        .addScaledVector(k4v, 1/6);

    return { position: newPos, velocity: newVel };
}

// Check SOI transition
function checkSOITransition(position, velocity, centralBodyId) {
    const centralBody = physicsState.bodies[centralBodyId];
    if (!centralBody) return null;

    const globalPos = position.clone()
        .add(new THREE.Vector3().fromArray(centralBody.position));
    const distToCentral = position.length();
    const soiRadius = centralBody.soiRadius || 1e12;

    // Check if outside current SOI
    if (distToCentral > soiRadius) {
        // Find parent body
        const parentId = getParentBody(centralBodyId);
        if (parentId !== null && physicsState.bodies[parentId]) {
            const parent = physicsState.bodies[parentId];
            const newPos = globalPos.sub(new THREE.Vector3().fromArray(parent.position));
            const newVel = velocity.clone()
                .add(new THREE.Vector3().fromArray(centralBody.velocity))
                .sub(new THREE.Vector3().fromArray(parent.velocity));
            
            return {
                newCentralBodyId: parentId,
                newPosition: newPos,
                newVelocity: newVel
            };
        }
    }

    // Check if entered child body SOI
    for (const [bodyId, body] of Object.entries(physicsState.bodies)) {
        if (bodyId == centralBodyId || !body.soiRadius) continue;
        
        const parentId = getParentBody(Number(bodyId));
        if (parentId === centralBodyId) {
            const relPos = globalPos.clone()
                .sub(new THREE.Vector3().fromArray(body.position));
            
            if (relPos.length() < body.soiRadius) {
                const newVel = velocity.clone()
                    .add(new THREE.Vector3().fromArray(centralBody.velocity))
                    .sub(new THREE.Vector3().fromArray(body.velocity));
                
                return {
                    newCentralBodyId: Number(bodyId),
                    newPosition: relPos,
                    newVelocity: newVel
                };
            }
        }
    }

    return null;
}

// Simplified hierarchy lookup
function getParentBody(naifId) {
    // Basic parent relationships
    const parentMap = {
        301: 399,  // Moon -> Earth
        401: 499, 402: 499,  // Mars moons -> Mars
        501: 599, 502: 599, 503: 599, 504: 599,  // Jupiter moons -> Jupiter
        601: 699, 602: 699, 603: 699, 604: 699, 605: 699, 606: 699,  // Saturn moons -> Saturn
        701: 799, 702: 799, 703: 799, 704: 799, 705: 799,  // Uranus moons -> Uranus
        801: 899, 802: 899,  // Neptune moons -> Neptune
        901: 999, 902: 999, 903: 999,  // Pluto moons -> Pluto
        // Planets -> Sun
        199: 10, 299: 10, 399: 10, 499: 10, 599: 10, 699: 10, 799: 10, 899: 10, 999: 10
    };
    return parentMap[naifId] || null;
}

// Main propagation variables
let currentCentralBodyId = null;
let isRunning = false;

// Message handler
self.onmessage = function(event) {
    const { type, data } = event.data;

    switch (type) {
        case 'updatePhysicsState':
            // Update cached physics state
            physicsState.bodies = data.bodies || {};
            physicsState.hierarchy = data.hierarchy || null;
            break;

        case 'propagate':
            if (isRunning) {
                self.postMessage({ 
                    type: 'error', 
                    error: 'Propagation already in progress' 
                });
                return;
            }

            isRunning = true;
            propagateOrbit(data);
            break;

        case 'cancel':
            isRunning = false;
            break;
    }
};

// Main propagation function
function propagateOrbit(params) {
    const {
        satelliteId,
        position: posArray,
        velocity: velArray,
        centralBodyNaifId,
        duration,
        timeStep = 60,
        pointsPerChunk = 100
    } = params;

    console.log('[orbitPropagationWorker] Starting propagation:', {
        satelliteId,
        centralBodyNaifId,
        duration,
        timeStep,
        position: posArray,
        velocity: velArray
    });

    currentCentralBodyId = centralBodyNaifId;
    let position = new THREE.Vector3().fromArray(posArray);
    let velocity = new THREE.Vector3().fromArray(velArray);
    
    const numSteps = Math.floor(duration / timeStep);
    const points = [];
    const soiTransitions = [];
    let currentTime = 0;

    // Send initial point
    points.push({
        position: position.toArray(),
        time: 0,
        centralBodyId: currentCentralBodyId
    });

    for (let i = 0; i < numSteps && isRunning; i++) {
        // Integrate one step
        const result = integrateRK4(position, velocity, timeStep);
        position = result.position;
        velocity = result.velocity;
        currentTime += timeStep;

        // Check SOI transition
        const transition = checkSOITransition(position, velocity, currentCentralBodyId);
        if (transition) {
            currentCentralBodyId = transition.newCentralBodyId;
            position = transition.newPosition;
            velocity = transition.newVelocity;
            
            soiTransitions.push({
                time: currentTime,
                fromBody: currentCentralBodyId,
                toBody: transition.newCentralBodyId
            });
        }

        // Store point
        points.push({
            position: position.toArray(),
            time: currentTime,
            centralBodyId: currentCentralBodyId
        });

        // Send chunk if ready
        if (points.length >= pointsPerChunk || i === numSteps - 1) {
            console.log(`[orbitPropagationWorker] Sending chunk: ${points.length} points, step ${i+1}/${numSteps}`);
            self.postMessage({
                type: 'chunk',
                satelliteId,
                points: points.slice(),
                soiTransitions: soiTransitions.slice(),
                progress: (i + 1) / numSteps,
                isComplete: i === numSteps - 1
            });
            points.length = 0;
            soiTransitions.length = 0;
        }
    }

    isRunning = false;
    
    // Send completion message
    self.postMessage({
        type: 'complete',
        satelliteId
    });
}