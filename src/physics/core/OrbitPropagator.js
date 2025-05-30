/**
 * OrbitPropagator.js
 * 
 * Reusable orbit propagation engine that can be used by:
 * - Web Workers for background orbit calculation
 * - Main thread for real-time physics
 * - Maneuver prediction systems
 * - Any other system needing orbit propagation
 */

import * as THREE from 'three';
import { integrateRK4 } from '../integrators/OrbitalIntegrators.js';
import { SatelliteAccelerationCalculator } from './SatelliteAccelerationCalculator.js';
import { GravityCalculator } from './GravityCalculator.js';

export class OrbitPropagator {
    constructor(options = {}) {
        this.options = {
            defaultTimeStep: 60, // seconds
            defaultPointsPerChunk: 100,
            enableSOITransitions: true,
            enableSolarSystemPropagation: false,
            debugLogging: false,
            ...options
        };
        
        this.isRunning = false;
        this.currentBodies = {};
        this.hierarchy = null;
    }

    /**
     * Initialize with physics state
     */
    initialize(physicsState) {
        this.currentBodies = JSON.parse(JSON.stringify(physicsState.bodies || {}));
        this.hierarchy = physicsState.hierarchy;
        
        if (this.options.debugLogging) {
            console.log('[OrbitPropagator] Initialized with', Object.keys(this.currentBodies).length, 'bodies');
        }
    }

    /**
     * Propagate satellite orbit
     * @param {Object} params - Propagation parameters
     * @param {Function} onProgress - Progress callback (chunk, progress, isComplete)
     * @returns {Promise} - Resolves when propagation is complete
     */
    async propagateOrbit(params, onProgress = null) {
        const {
            satelliteId,
            position: posArray,
            velocity: velArray,
            centralBodyNaifId,
            duration,
            timeStep = this.options.defaultTimeStep,
            pointsPerChunk = this.options.defaultPointsPerChunk,
            startTime = 0,
            mass = 1000,
            crossSectionalArea = 10,
            dragCoefficient = 2.2,
            propagateSolarSystem = this.options.enableSolarSystemPropagation
        } = params;

        // Validate central body exists
        if (!this.currentBodies[centralBodyNaifId]) {
            throw new Error(`Central body ${centralBodyNaifId} not found`);
        }

        this.isRunning = true;
        let position = new THREE.Vector3().fromArray(posArray);
        let velocity = new THREE.Vector3().fromArray(velArray);
        
        const centralBodyData = this.currentBodies[centralBodyNaifId];
        if (this.options.debugLogging) {
            console.log(`[OrbitPropagator] Starting propagation for satellite ${satelliteId}:`, {
                centralBody: centralBodyNaifId,
                soiRadius: centralBodyData?.soiRadius,
                duration,
                timeStep,
                propagateSolarSystem
            });
        }

        // Advance solar system to start time if needed
        if (startTime > 0 && propagateSolarSystem) {
            await this._advanceSolarSystemToTime(startTime, timeStep);
        }

        const satelliteProperties = { mass, crossSectionalArea, dragCoefficient };
        const numSteps = Math.floor(duration / timeStep);
        const points = [];
        const soiTransitions = [];
        let currentTime = startTime;

        // Add initial point if starting from the beginning
        if (startTime === 0) {
            points.push(this._createOrbitPoint(position, velocity, currentTime, centralBodyNaifId));
        }

        // Main propagation loop
        for (let i = 0; i < numSteps && this.isRunning; i++) {
            try {
                // Propagate solar system if enabled
                if (propagateSolarSystem) {
                    this.currentBodies = this._propagateSolarSystemBodies(this.currentBodies, timeStep);
                }
                
                // Propagate satellite
                const accelerationFunc = this._createAccelerationFunction(
                    centralBodyNaifId, 
                    satelliteProperties, 
                    propagateSolarSystem
                );
                
                const result = integrateRK4(position, velocity, accelerationFunc, timeStep);
                
                if (!result || !result.position || !result.velocity) {
                    throw new Error('Invalid integration result');
                }
                
                position = result.position;
                velocity = result.velocity;
                currentTime += timeStep;

            } catch (error) {
                console.error(`[OrbitPropagator] Error at step ${i}:`, error);
                break;
            }

            // Check SOI transitions
            const soiCheck = this._checkSOITransition(position, velocity, centralBodyNaifId);
            
            // Handle SOI exit for visualization-only propagation
            if (soiCheck?.exitedSOI && !propagateSolarSystem) {
                const finalPoint = this._createOrbitPoint(position, velocity, currentTime, centralBodyNaifId, true);
                points.push(finalPoint);
                
                soiTransitions.push({
                    time: currentTime,
                    fromBody: centralBodyNaifId,
                    toBody: null,
                    distance: soiCheck.distance,
                    soiRadius: soiCheck.soiRadius
                });
                
                break;
            }

            // Store orbit point
            const orbitPoint = this._createOrbitPoint(position, velocity, currentTime, centralBodyNaifId);
            if (soiCheck?.exitedSOI) {
                orbitPoint.isSOIExit = true;
            }
            points.push(orbitPoint);

            // Send progress chunk
            if (points.length >= pointsPerChunk || i === numSteps - 1) {
                const progress = (i + 1) / numSteps;
                const isComplete = i === numSteps - 1;
                
                if (onProgress) {
                    await onProgress({
                        points: points.slice(),
                        soiTransitions: soiTransitions.slice(),
                        progress,
                        isComplete,
                        finalSolarSystemState: isComplete ? this.currentBodies : null
                    });
                }
                
                points.length = 0;
                soiTransitions.length = 0;
            }
        }

        this.isRunning = false;
        return { completed: true, message: 'Orbit propagation completed' };
    }

    /**
     * Stop current propagation
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * Propagate celestial bodies using N-body physics
     * @private
     */
    _propagateSolarSystemBodies(currentBodies, deltaTime) {
        const updatedBodies = {};
        
        // Copy current state and convert to Vector3
        for (const [naifId, body] of Object.entries(currentBodies)) {
            updatedBodies[naifId] = {
                ...body,
                position: new THREE.Vector3().fromArray(body.position),
                velocity: new THREE.Vector3().fromArray(body.velocity)
            };
        }
        
        // Propagate each celestial body using GravityCalculator
        for (const [naifId, body] of Object.entries(updatedBodies)) {
            if (body.type === 'barycenter') continue;
            
            const otherBodies = Object.values(updatedBodies)
                .filter(b => b.naifId !== body.naifId && b.type !== 'barycenter' && b.mass > 0);
            
            const accelerationFunc = (position) => {
                return GravityCalculator.computeAcceleration(position, otherBodies);
            };
            
            const result = integrateRK4(
                body.position,
                body.velocity,
                accelerationFunc,
                deltaTime
            );
            
            updatedBodies[naifId].position = result.position;
            updatedBodies[naifId].velocity = result.velocity;
        }
        
        // Convert back to arrays
        for (const [naifId, body] of Object.entries(updatedBodies)) {
            updatedBodies[naifId].position = body.position.toArray();
            updatedBodies[naifId].velocity = body.velocity.toArray();
        }
        
        return updatedBodies;
    }

    /**
     * Create acceleration function for satellite
     * @private
     */
    _createAccelerationFunction(centralBodyNaifId, satelliteProperties, propagateSolarSystem) {
        return (position, velocity) => {
            const satellite = {
                position: position,
                velocity: velocity,
                centralBodyNaifId: centralBodyNaifId,
                ...satelliteProperties
            };
            
            const options = {
                includeJ2: true,
                includeDrag: true,
                includeSOIFiltering: !propagateSolarSystem,
                debugLogging: this.options.debugLogging
            };
            
            return SatelliteAccelerationCalculator.computeAcceleration(satellite, this.currentBodies, options);
        };
    }

    /**
     * Check for SOI transitions
     * @private
     */
    _checkSOITransition(position, velocity, centralBodyId) {
        const centralBody = this.currentBodies[centralBodyId];
        if (!centralBody || !this.options.enableSOITransitions) return null;
        
        const distToCentral = position.length();
        const soiRadius = centralBody.soiRadius || 1e12;
        
        if (distToCentral > soiRadius) {
            if (this.options.debugLogging) {
                console.log(`[OrbitPropagator] SOI exit detected for body ${centralBodyId}: ${distToCentral.toFixed(0)} km > ${soiRadius.toFixed(0)} km`);
            }
            
            return {
                exitedSOI: true,
                distance: distToCentral,
                soiRadius: soiRadius
            };
        }
        
        return null;
    }

    /**
     * Create standardized orbit point
     * @private
     */
    _createOrbitPoint(position, velocity, time, centralBodyId, isSOIExit = false) {
        const centralBody = this.currentBodies[centralBodyId];
        return {
            position: position.toArray(),
            velocity: velocity.toArray(),
            time: time,
            centralBodyId: centralBodyId,
            centralBodyPosition: centralBody?.position || [0, 0, 0],
            isSOIEntry: false,
            isSOIExit: isSOIExit
        };
    }

    /**
     * Advance solar system to a specific time
     * @private
     */
    async _advanceSolarSystemToTime(targetTime, timeStep) {
        const skipSteps = Math.floor(targetTime / timeStep);
        if (this.options.debugLogging) {
            console.log(`[OrbitPropagator] Advancing solar system by ${skipSteps} steps to reach time ${targetTime}s`);
        }
        
        for (let i = 0; i < skipSteps; i++) {
            this.currentBodies = this._propagateSolarSystemBodies(this.currentBodies, timeStep);
            
            // Yield control periodically for responsiveness
            if (i % 100 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }

    /**
     * Get current state for debugging
     */
    getState() {
        return {
            isRunning: this.isRunning,
            bodyCount: Object.keys(this.currentBodies).length,
            hasHierarchy: !!this.hierarchy,
            options: this.options
        };
    }
}