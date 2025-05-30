/**
 * orbitPropagationWorker.js
 * 
 * Web Worker for satellite orbit propagation with complete solar system propagation
 * Handles physics-based orbit computation in background thread
 * 
 * KEY FIX: Now propagates the entire solar system during predictions to maintain
 * consistent reference frames between real-time physics and orbit prediction
 */

import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { integrateRK4 } from '../physics/integrators/OrbitalIntegrators.js';

// Complete physics engine state including solar system propagation
let physicsState = {
    bodies: {},
    hierarchy: null,
    initialTime: null,
    bodyStates: new Map() // Track body positions over time
};

// Solar system propagation functions
function propagateSolarSystemBodies(currentBodies, deltaTime) {
    const updatedBodies = {};
    
    // Copy current state
    for (const [naifId, body] of Object.entries(currentBodies)) {
        updatedBodies[naifId] = {
            ...body,
            position: new THREE.Vector3().fromArray(body.position),
            velocity: new THREE.Vector3().fromArray(body.velocity)
        };
    }
    
    // Propagate each celestial body using N-body physics
    for (const [naifId, body] of Object.entries(updatedBodies)) {
        if (body.type === 'barycenter') continue; // Skip barycenters
        
        const acceleration = computeBodyAcceleration(body, updatedBodies);
        
        // RK4 integration for celestial body
        const result = integrateRK4(
            body.position,
            body.velocity,
            () => acceleration,
            deltaTime
        );
        
        updatedBodies[naifId].position = result.position;
        updatedBodies[naifId].velocity = result.velocity;
    }
    
    // Convert back to arrays for consistency
    for (const [naifId, body] of Object.entries(updatedBodies)) {
        updatedBodies[naifId].position = body.position.toArray();
        updatedBodies[naifId].velocity = body.velocity.toArray();
    }
    
    return updatedBodies;
}

function computeBodyAcceleration(targetBody, allBodies) {
    const acceleration = new THREE.Vector3();
    const targetPos = targetBody.position;
    
    // Compute gravitational acceleration from all other massive bodies
    for (const [naifId, body] of Object.entries(allBodies)) {
        if (naifId == targetBody.naif || body.type === 'barycenter') continue;
        if (!body.mass || body.mass <= 0) continue;
        
        const r = new THREE.Vector3().fromArray(body.position).sub(targetPos);
        const distance = r.length();
        
        if (distance > 1e-6) {
            const gravAccel = (Constants.G * body.mass) / (distance * distance);
            const accVec = r.normalize().multiplyScalar(gravAccel);
            acceleration.add(accVec);
        }
    }
    
    return acceleration;
}

// Create acceleration function with current solar system state (simplified from PhysicsEngine)
function createAccelerationFunction(centralBodyNaifId, satelliteProperties = {}, currentBodies, propagateSolarSystemFlag = true) {
    return (position, velocity) => {
        const satellite = {
            position: position,
            velocity: velocity,
            centralBodyNaifId: centralBodyNaifId,
            mass: satelliteProperties.mass || 1000,
            crossSectionalArea: satelliteProperties.crossSectionalArea || 10,
            dragCoefficient: satelliteProperties.dragCoefficient || 2.2
        };
        
        return computeSatelliteAcceleration(satellite, currentBodies, propagateSolarSystemFlag);
    };
}

// Simplified satellite acceleration computation (based on PhysicsEngine._computeSatelliteAcceleration)
function computeSatelliteAcceleration(satellite, bodies, propagateSolarSystemFlag = true) {
    const totalAccel = new THREE.Vector3();
    const centralBody = bodies[satellite.centralBodyNaifId];
    
    if (!centralBody) {
        return totalAccel;
    }
    
    // For visualization orbits (when solar system is not propagating),
    // keep central body fixed but still compute perturbations from other bodies
    if (!propagateSolarSystemFlag) {
        // First compute central body gravity (two-body problem base)
        const r = satellite.position.clone();
        const distance = r.length();
        
        if (distance > 1e-6) {
            const mu = centralBody.GM || (Constants.G * centralBody.mass);
            const gravAccel = -mu / (distance * distance);
            const accVec = r.normalize().multiplyScalar(gravAccel);
            totalAccel.add(accVec);
        }
        
        // Add perturbations from other significant bodies
        // Convert satellite to global position for perturbation calculation
        const satGlobalPos = satellite.position.clone().add(
            new THREE.Vector3().fromArray(centralBody.position)
        );
        
        // Only include significant perturbations (e.g., Sun and Moon for Earth satellites)
        for (const [bodyId, body] of Object.entries(bodies)) {
            if (body.type === 'barycenter' || !body.mass || body.mass <= 0) continue;
            if (bodyId == satellite.centralBodyNaifId) continue; // Skip central body
            
            // Apply significance filter based on mass and distance
            const bodyMass = body.mass;
            const isSun = parseInt(bodyId) === 10;
            const isMoon = parseInt(bodyId) === 301;
            const isJupiter = parseInt(bodyId) === 599;
            
            // For Earth satellites, include Sun and Moon; for Mars include Sun and Jupiter, etc.
            let includeBody = false;
            if (satellite.centralBodyNaifId == 399) { // Earth
                includeBody = isSun || isMoon;
            } else if (satellite.centralBodyNaifId == 499) { // Mars
                includeBody = isSun || isJupiter;
            } else {
                // For other bodies, just include the Sun
                includeBody = isSun;
            }
            
            if (!includeBody) continue;
            
            // Compute perturbation acceleration
            const r = new THREE.Vector3().fromArray(body.position).sub(satGlobalPos);
            const distance = r.length();
            
            if (distance > 1e-6) {
                const gravAccel = (Constants.G * bodyMass) / (distance * distance);
                const perturbAccel = r.normalize().multiplyScalar(gravAccel);
                
                // Also compute the acceleration of the central body due to this perturber
                const rCentral = new THREE.Vector3().fromArray(body.position).sub(
                    new THREE.Vector3().fromArray(centralBody.position)
                );
                const distCentral = rCentral.length();
                
                if (distCentral > 1e-6) {
                    const gravAccelCentral = (Constants.G * bodyMass) / (distCentral * distCentral);
                    const centralAccel = rCentral.normalize().multiplyScalar(gravAccelCentral);
                    
                    // Third-body perturbation: subtract central body's acceleration
                    perturbAccel.sub(centralAccel);
                }
                
                totalAccel.add(perturbAccel);
            }
        }
        
        // Add J2 and drag perturbations
        const j2Accel = computeJ2Perturbation(satellite, centralBody);
        const dragAccel = computeAtmosphericDrag(satellite, centralBody);
        
        totalAccel.add(j2Accel).add(dragAccel);
        
        return totalAccel;
    }
    
    // For full solar system propagation: compute N-body gravitational forces
    
    // Convert satellite from planet-centric to solar system coordinates
    const satGlobalPos = satellite.position.clone().add(
        new THREE.Vector3().fromArray(centralBody.position)
    );
    
    // Compute gravitational forces from all bodies
    for (const [, body] of Object.entries(bodies)) {
        if (body.type === 'barycenter' || !body.mass || body.mass <= 0) continue;
        
        const r = new THREE.Vector3().fromArray(body.position).sub(satGlobalPos);
        const distance = r.length();
        
        if (distance > 1e-6) {
            const gravAccel = (Constants.G * body.mass) / (distance * distance);
            const accVec = r.normalize().multiplyScalar(gravAccel);
            totalAccel.add(accVec);
        }
    }
    
    // Compute central body's acceleration (reference frame correction)
    const centralAccel = new THREE.Vector3();
    for (const [bodyId, body] of Object.entries(bodies)) {
        if (bodyId == satellite.centralBodyNaifId || body.type === 'barycenter') continue;
        if (!body.mass || body.mass <= 0) continue;
        
        const r = new THREE.Vector3().fromArray(body.position).sub(
            new THREE.Vector3().fromArray(centralBody.position)
        );
        const distance = r.length();
        
        if (distance > 1e-6) {
            const gravAccel = (Constants.G * body.mass) / (distance * distance);
            const accVec = r.normalize().multiplyScalar(gravAccel);
            centralAccel.add(accVec);
        }
    }
    
    // Subtract central body acceleration to get planet-centric acceleration
    totalAccel.sub(centralAccel);
    
    // Add J2 and drag perturbations
    const j2Accel = computeJ2Perturbation(satellite, centralBody);
    const dragAccel = computeAtmosphericDrag(satellite, centralBody);
    
    totalAccel.add(j2Accel).add(dragAccel);
    
    return totalAccel;
}

// Simplified J2 perturbation
function computeJ2Perturbation(satellite, centralBody) {
    // Check both uppercase and lowercase J2
    const J2 = centralBody.J2 || centralBody.j2;
    if (!J2 || J2 === 0) {
        return new THREE.Vector3(0, 0, 0);
    }
    const Re = centralBody.radius || centralBody.equatorialRadius;
    const mu = centralBody.GM || (Constants.G * centralBody.mass);
    
    const r = satellite.position.clone();
    const rMag = r.length();
    
    if (rMag < Re * 1.1) {
        return new THREE.Vector3(0, 0, 0);
    }
    
    // Simplified J2 calculation (assumes pole along Z-axis)
    const z = r.z;
    const factor = -1.5 * J2 * mu * (Re * Re) / (rMag ** 5);
    
    const radialComp = r.clone().multiplyScalar(factor * (1 - 5 * (z * z) / (rMag * rMag)));
    const polarComp = new THREE.Vector3(0, 0, factor * z * (3 - 5 * (z * z) / (rMag * rMag)));
    
    return radialComp.add(polarComp);
}

// Simplified atmospheric drag
function computeAtmosphericDrag(satellite, centralBody) {
    if (!centralBody.atmosphericModel) {
        return new THREE.Vector3(0, 0, 0);
    }
    
    const r = satellite.position.clone();
    const altitude = r.length() - (centralBody.radius || centralBody.equatorialRadius);
    
    const maxAlt = centralBody.atmosphericModel.maxAltitude || 1000;
    const minAlt = centralBody.atmosphericModel.minAltitude || 0;
    
    if (altitude > maxAlt || altitude < minAlt) {
        return new THREE.Vector3(0, 0, 0);
    }
    
    // Use planet-specific atmospheric model
    let density;
    if (centralBody.atmosphericModel.getDensity) {
        // Use custom density function (like Earth)
        density = centralBody.atmosphericModel.getDensity(altitude);
    } else {
        // Use simple exponential model with planet's parameters
        const h0 = centralBody.atmosphericModel.referenceAltitude || 200;
        const rho0 = centralBody.atmosphericModel.referenceDensity || 2.789e-13;
        const H = centralBody.atmosphericModel.scaleHeight || 50;
        density = rho0 * Math.exp(-(altitude - h0) / H);
    }
    
    const mass = satellite.mass || 1000;
    const area = satellite.crossSectionalArea || 10;
    const Cd = satellite.dragCoefficient || 2.2;
    
    const relativeVel = satellite.velocity.clone();
    const velMag = relativeVel.length() * 1000; // km/s to m/s
    
    if (velMag === 0) {
        return new THREE.Vector3(0, 0, 0);
    }
    
    const dragMag = 0.5 * density * velMag * velMag * Cd * area / mass;
    const dragDirection = relativeVel.normalize().multiplyScalar(-1);
    
    return dragDirection.multiplyScalar(dragMag / 1000); // back to km/s²
}


// Simplified SOI transition logic for orbit visualization
function checkSOITransition(position, velocity, centralBodyId, currentBodies) {
    const centralBody = currentBodies[centralBodyId];
    if (!centralBody) return null;
    
    const distToCentral = position.length();
    const soiRadius = centralBody.soiRadius || 1e12;
    
    // Log current state periodically for debugging (only if we're close to SOI boundary)
    if (distToCentral > soiRadius * 0.9 && Math.random() < 0.1) { // 10% of the time when near SOI
        console.log(`[orbitPropagationWorker] Body ${centralBodyId}: distance=${distToCentral.toFixed(0)} km, SOI=${soiRadius.toFixed(0)} km`);
    }
    
    // For orbit visualization, we just mark when we exit SOI
    // The actual transition handling is done by the physics engine during real-time simulation
    if (distToCentral > soiRadius) {
        console.log(`[orbitPropagationWorker] Orbit exits SOI of body ${centralBodyId} at distance ${distToCentral.toFixed(0)} km (SOI: ${soiRadius.toFixed(0)} km)`);
        
        // For visualization purposes, mark this as an SOI exit
        // We don't actually change reference frames here since the orbit line
        // is already parented to the correct body
        return {
            exitedSOI: true,
            distance: distToCentral,
            soiRadius: soiRadius
        };
    }
    
    return null;
}

// Main propagation variables
let currentCentralBodyId = null;
let isRunning = false;

// Message handler
self.onmessage = function(event) {
    const { type, data } = event.data;

    switch (type) {
        case 'updatePhysicsState':
            // Update cached physics state with initial conditions
            physicsState.bodies = data.bodies || {};
            physicsState.hierarchy = data.hierarchy || null;
            physicsState.initialTime = data.currentTime || Date.now();
            
            console.log('[orbitPropagationWorker] Updated physics state with', Object.keys(physicsState.bodies).length, 'bodies');
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

// Main propagation function with complete solar system propagation
function propagateOrbit(params) {
    const {
        satelliteId,
        position: posArray,
        velocity: velArray,
        centralBodyNaifId,
        duration,
        timeStep = 60,
        pointsPerChunk = 100,
        startTime = 0,
        // Satellite properties for drag calculation
        mass,
        crossSectionalArea,
        dragCoefficient,
        propagateSolarSystem = true // Set to false for pure planet-centric orbit visualization
    } = params;

    console.log('[orbitPropagationWorker] Starting propagation with solar system evolution:', {
        satelliteId,
        centralBodyNaifId,
        duration,
        timeStep,
        position: posArray,
        velocity: velArray,
        bodyCount: Object.keys(physicsState.bodies).length,
        propagateSolarSystem
    });
    
    // Verify we have the central body
    if (!physicsState.bodies[centralBodyNaifId]) {
        console.error(`[orbitPropagationWorker] Central body ${centralBodyNaifId} not found in physics state!`);
        self.postMessage({
            type: 'error',
            satelliteId,
            error: `Central body ${centralBodyNaifId} not found`
        });
        isRunning = false;
        return;
    }

    currentCentralBodyId = centralBodyNaifId;
    let position = new THREE.Vector3().fromArray(posArray);
    let velocity = new THREE.Vector3().fromArray(velArray);
    
    // Initialize current solar system state (starts with current physics state)
    let currentBodies = JSON.parse(JSON.stringify(physicsState.bodies));
    
    const numSteps = Math.floor(duration / timeStep);
    const points = [];
    const soiTransitions = [];
    const bodyEvolution = []; // Track how solar system evolves
    let currentTime = startTime;

    // Only include initial point if we're starting from the beginning
    if (startTime === 0) {
        points.push({
            position: position.toArray(),
            velocity: velocity.toArray(),
            time: currentTime,
            centralBodyId: currentCentralBodyId
        });
    }
    
    // If we have a non-zero start time, we need to advance the solar system to that time
    if (startTime > 0 && propagateSolarSystem) {
        const skipSteps = Math.floor(startTime / timeStep);
        console.log(`[orbitPropagationWorker] Advancing solar system by ${skipSteps} steps to reach start time ${startTime}s`);
        for (let i = 0; i < skipSteps; i++) {
            currentBodies = propagateSolarSystemBodies(currentBodies, timeStep);
        }
    }

    // Create satellite properties object
    const satelliteProperties = {
        mass: mass || 1000,
        crossSectionalArea: crossSectionalArea || 10,
        dragCoefficient: dragCoefficient || 2.2
    };

    for (let i = 0; i < numSteps && isRunning; i++) {
        try {
            // CRITICAL FIX: Propagate the entire solar system first (if enabled)
            if (propagateSolarSystem) {
                currentBodies = propagateSolarSystemBodies(currentBodies, timeStep);
            }
            
            // Now propagate satellite in the context of the evolved solar system
            const accelerationFunc = createAccelerationFunction(currentCentralBodyId, satelliteProperties, currentBodies, propagateSolarSystem);
            const result = integrateRK4(position, velocity, accelerationFunc, timeStep);
            
            // Validate result
            if (!result || !result.position || !result.velocity) {
                throw new Error('Invalid integration result');
            }
            
            position = result.position;
            velocity = result.velocity;
            currentTime += timeStep;
        } catch (error) {
            console.error(`[orbitPropagationWorker] Error at step ${i}:`, error);
            console.error('Position:', position.toArray());
            console.error('Velocity:', velocity.toArray());
            console.error('Central body:', currentCentralBodyId);
            break;
        }

        // Check SOI boundary for orbit visualization
        let soiCheck = null;
        try {
            soiCheck = checkSOITransition(position, velocity, currentCentralBodyId, currentBodies);
        } catch (error) {
            console.error(`[orbitPropagationWorker] Error checking SOI:`, error);
        }
        
        // For orbit visualization without solar system propagation,
        // we stop at SOI boundary since we can't properly transform to another frame
        if (soiCheck && soiCheck.exitedSOI && !propagateSolarSystem) {
            console.log(`[orbitPropagationWorker] Stopping propagation at SOI boundary`);
            
            // Add final point at SOI boundary
            points.push({
                position: position.toArray(),
                velocity: velocity.toArray(),
                time: currentTime,
                centralBodyId: currentCentralBodyId,
                centralBodyPosition: currentBodies[currentCentralBodyId]?.position || [0, 0, 0],
                isSOIExit: true
            });
            
            // Mark as SOI transition for visualization
            soiTransitions.push({
                time: currentTime,
                fromBody: currentCentralBodyId,
                toBody: null, // Unknown without propagation
                distance: soiCheck.distance,
                soiRadius: soiCheck.soiRadius
            });
            
            break; // Stop propagation
        }

        // Store point with reference frame information
        // IMPORTANT: position is planet-centric relative to the current central body position
        points.push({
            position: position.toArray(),
            velocity: velocity.toArray(), // Need velocity for extensions
            time: currentTime,
            centralBodyId: currentCentralBodyId,
            // Include central body position at this time for debugging
            centralBodyPosition: currentBodies[currentCentralBodyId]?.position || [0, 0, 0],
            // Mark if this point is at SOI boundary
            isSOIEntry: false, // No actual transitions without solar system propagation
            isSOIExit: soiCheck && soiCheck.exitedSOI
        });

        // Optionally track major body evolution for debugging
        if (i % 100 === 0) { // Every 100 steps
            bodyEvolution.push({
                time: currentTime,
                earth: currentBodies[399]?.position || null,
                moon: currentBodies[301]?.position || null,
                sun: currentBodies[10]?.position || null
            });
        }

        // Send chunk if ready
        if (points.length >= pointsPerChunk || i === numSteps - 1) {
            console.log(`[orbitPropagationWorker] Sending chunk: ${points.length} points, step ${i+1}/${numSteps}, solar system evolved`);
            self.postMessage({
                type: 'chunk',
                satelliteId,
                points: points.slice(),
                soiTransitions: soiTransitions.slice(),
                bodyEvolution: bodyEvolution.slice(),
                progress: (i + 1) / numSteps,
                isComplete: i === numSteps - 1,
                finalSolarSystemState: i === numSteps - 1 ? currentBodies : null
            });
            points.length = 0;
            soiTransitions.length = 0;
            bodyEvolution.length = 0;
        }
    }

    isRunning = false;
    
    // Send completion message
    self.postMessage({
        type: 'complete',
        satelliteId,
        message: 'Orbit propagation completed with full solar system evolution'
    });
}