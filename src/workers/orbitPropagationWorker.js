/**
 * orbitPropagationWorker.js
 * 
 * Web Worker for satellite orbit propagation
 * Handles physics-based orbit computation in background thread
 */

import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { integrateRK4 } from '../physics/integrators/OrbitalIntegrators.js';
import { GravityCalculator } from '../physics/core/GravityCalculator.js';

// Simplified physics engine state
let physicsState = {
    bodies: {},
    hierarchy: null
};

// Create acceleration function using centralized calculator
function createAccelerationFunction(centralBodyNaifId) {
    return (position, velocity) => {
        const centralBody = physicsState.bodies[centralBodyNaifId];
        if (!centralBody) {
            return new THREE.Vector3();
        }

        // Convert to global position
        const globalPos = position.clone()
            .add(new THREE.Vector3().fromArray(centralBody.position));

        // Get bodies array for GravityCalculator
        const bodiesArray = Object.values(physicsState.bodies).filter(b => b.position && b.mass);
        
        // Compute acceleration in global frame
        const globalAccel = GravityCalculator.computeAcceleration(globalPos, bodiesArray);
        
        // Compute central body acceleration for reference frame
        const centralGlobalPos = new THREE.Vector3().fromArray(centralBody.position);
        const centralAccel = GravityCalculator.computeAcceleration(
            centralGlobalPos, 
            bodiesArray,
            { excludeBodies: [centralBodyNaifId] }
        );
        
        // Convert to planet-centric frame
        return globalAccel.sub(centralAccel);
    };
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
        // Use centralized RK4 integration
        const accelerationFunc = createAccelerationFunction(currentCentralBodyId);
        const result = integrateRK4(position, velocity, accelerationFunc, timeStep);
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