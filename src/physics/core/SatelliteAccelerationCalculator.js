import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { GravityCalculator } from './GravityCalculator.js';
import { AtmosphericModels } from './AtmosphericModels.js';

/**
 * Centralized satellite physics calculator
 * Ensures consistent physics calculations between main engine and workers
 * Includes acceleration calculation and SOI management
 */
export class SatelliteAccelerationCalculator {
    /**
     * Compute total acceleration on a satellite including all perturbations
     * @param {Object} satellite - Satellite state {position, velocity, centralBodyNaifId}
     * @param {Object} bodies - Map/object of all bodies by NAIF ID
     * @param {Object} options - Additional options
     * @returns {THREE.Vector3} - Total acceleration in planet-centric frame (km/s²)
     */
    static computeAcceleration(satellite, bodies, options = {}) {
        const {
            includeJ2 = true,
            includeDrag = true,
            includeSOIFiltering = true,
            debugLogging = false
        } = options;

        const centralBody = bodies[satellite.centralBodyNaifId];
        if (!centralBody) {
            console.warn(`[SatelliteAccelerationCalculator] Central body ${satellite.centralBodyNaifId} not found`);
            return new THREE.Vector3();
        }

        // Convert satellite position to global coordinates
        const satGlobalPos = satellite.position.clone()
            .add(new THREE.Vector3().fromArray(centralBody.position || [0, 0, 0]));
        
        // Get significant bodies if SOI filtering is enabled
        const bodiesToUse = includeSOIFiltering 
            ? this._getSignificantBodies(satellite, centralBody, bodies)
            : Object.values(bodies).filter(b => b.type !== 'barycenter' && b.mass > 0);

        // Use GravityCalculator for N-body gravitational forces
        const bodiesForGravity = bodiesToUse.filter(b => b.naifId !== satellite.centralBodyNaifId);
        
        // Compute gravitational acceleration at satellite position
        const globalAccel = GravityCalculator.computeAcceleration(satGlobalPos, bodiesForGravity);
        
        // Compute gravitational acceleration at central body position (for reference frame correction)
        const centralGlobalPos = new THREE.Vector3().fromArray(centralBody.position || [0, 0, 0]);
        const centralAccel = GravityCalculator.computeAcceleration(centralGlobalPos, bodiesForGravity);
        
        // Convert to planet-centric frame
        const totalAccel = globalAccel.sub(centralAccel);

        // Add J2 perturbation using GravityCalculator
        if (includeJ2 && centralBody.J2) {
            const j2Accel = GravityCalculator.computeJ2Acceleration(satellite.position, centralBody);
            totalAccel.add(j2Accel);
        }

        // Add atmospheric drag using AtmosphericModels
        if (includeDrag && centralBody.atmosphericModel) {
            // Calculate ballistic coefficient from satellite properties
            const ballisticCoeff = satellite.mass / (satellite.dragCoefficient * satellite.crossSectionalArea);
            const dragAccelArray = AtmosphericModels.computeDragAcceleration(
                satellite.position, 
                satellite.velocity, 
                centralBody, 
                ballisticCoeff
            );
            const dragAccel = new THREE.Vector3().fromArray(dragAccelArray);
            totalAccel.add(dragAccel);
        }

        if (debugLogging && totalAccel.length() > 0.1) {
            console.log(`[SatelliteAccelerationCalculator] High acceleration detected:`, {
                satelliteId: satellite.id,
                totalAccel: totalAccel.length(),
                components: {
                    gravity: globalAccel.sub(centralAccel).length(),
                    j2: includeJ2 ? 'calculated' : 'skipped',
                    drag: includeDrag ? 'calculated' : 'skipped'
                }
            });
        }

        return totalAccel;
    }

    /**
     * Get bodies with significant gravitational influence
     * @private
     */
    static _getSignificantBodies(satellite, centralBody, bodies) {
        const significantBodies = [];
        const satGlobalPos = satellite.position.clone()
            .add(new THREE.Vector3().fromArray(centralBody.position || [0, 0, 0]));
        const satAltitude = satellite.position.length();
        
        // Always include central body
        significantBodies.push(centralBody);
        
        // Define sphere of influence based on central body
        let sphereOfInfluence;
        switch (satellite.centralBodyNaifId) {
            case 399: // Earth
                sphereOfInfluence = Math.max(1e6, satAltitude * 5);
                if (bodies[301]) significantBodies.push(bodies[301]); // Moon
                if (satAltitude > 100000 && bodies[10]) significantBodies.push(bodies[10]); // Sun
                break;
            case 499: // Mars
                sphereOfInfluence = Math.max(5e5, satAltitude * 3);
                if (bodies[10]) significantBodies.push(bodies[10]); // Sun
                if (bodies[599]) significantBodies.push(bodies[599]); // Jupiter
                break;
            case 301: // Moon
                sphereOfInfluence = Math.max(1e5, satAltitude * 2);
                if (bodies[399]) significantBodies.push(bodies[399]); // Earth
                if (bodies[10]) significantBodies.push(bodies[10]); // Sun
                break;
            default:
                sphereOfInfluence = Math.max(1e6, satAltitude * 10);
                if (bodies[10]) significantBodies.push(bodies[10]); // Sun
                break;
        }
        
        // Check all bodies within sphere of influence
        for (const body of Object.values(bodies)) {
            if (body.type === 'barycenter') continue;
            if (significantBodies.includes(body)) continue;
            
            const bodyPos = body.position instanceof THREE.Vector3
                ? body.position
                : new THREE.Vector3().fromArray(body.position);
            
            const distance = bodyPos.distanceTo(satGlobalPos);
            if (distance < sphereOfInfluence) {
                const mu = body.GM || (Constants.G * body.mass);
                const gravAccel = mu / (distance * distance);
                const centralGravAccel = (centralBody.GM || Constants.G * centralBody.mass) / (satAltitude * satAltitude);
                
                // Include if perturbation is at least 0.1% of central body's gravity
                if (gravAccel > centralGravAccel * 0.001) {
                    significantBodies.push(body);
                }
            }
        }
        
        return significantBodies;
    }

    // J2 perturbation computation moved to GravityCalculator.computeJ2Acceleration()

    // Atmospheric drag computation moved to AtmosphericModels.computeDragAcceleration()

    /**
     * Create acceleration function for integration
     * @param {number} centralBodyNaifId - NAIF ID of central body
     * @param {Object} bodies - Map of all bodies
     * @param {Object} options - Acceleration options
     * @returns {Function} Acceleration function (position, velocity) => acceleration
     */
    static createAccelerationFunction(centralBodyNaifId, bodies, options = {}) {
        return (position, velocity) => {
            const satellite = {
                position: position,
                velocity: velocity,
                centralBodyNaifId: centralBodyNaifId
            };
            return this.computeAcceleration(satellite, bodies, options);
        };
    }

    /**
     * Check if satellite needs SOI transition
     * @param {Object} satellite - Satellite state
     * @param {Object} bodies - Map of all bodies
     * @param {Object} hierarchy - Hierarchy object with getParent method
     * @returns {Object|null} - Transition info or null if no transition needed
     */
    static checkSOITransition(satellite, bodies, hierarchy) {
        const centralBody = bodies[satellite.centralBodyNaifId];
        if (!centralBody) return null;

        const globalPos = satellite.position.clone()
            .add(new THREE.Vector3().fromArray(centralBody.position || [0, 0, 0]));
        const distToCentral = satellite.position.length();
        const soiRadius = centralBody.soiRadius || 1e12;

        // Check if outside current SOI
        if (distToCentral > soiRadius) {
            // Find parent body
            const parentId = hierarchy?.getParent?.(satellite.centralBodyNaifId) || 0;
            if (parentId !== null && bodies[parentId]) {
                const parent = bodies[parentId];
                const newPos = globalPos.clone().sub(new THREE.Vector3().fromArray(parent.position || [0, 0, 0]));
                const globalVel = satellite.velocity.clone().add(new THREE.Vector3().fromArray(centralBody.velocity || [0, 0, 0]));
                const newVel = globalVel.sub(new THREE.Vector3().fromArray(parent.velocity || [0, 0, 0]));
                
                return {
                    newCentralBodyId: parentId,
                    newPosition: newPos,
                    newVelocity: newVel
                };
            }
        }

        // Check if entered child body SOI
        for (const [bodyId, body] of Object.entries(bodies)) {
            if (bodyId == satellite.centralBodyNaifId || !body.soiRadius) continue;
            
            const parentId = hierarchy?.getParent?.(Number(bodyId));
            if (parentId === satellite.centralBodyNaifId) {
                const bodyPos = new THREE.Vector3().fromArray(body.position || [0, 0, 0]);
                const relPos = globalPos.clone().sub(bodyPos);
                
                if (relPos.length() < body.soiRadius) {
                    const globalVel = satellite.velocity.clone().add(new THREE.Vector3().fromArray(centralBody.velocity || [0, 0, 0]));
                    const newVel = globalVel.sub(new THREE.Vector3().fromArray(body.velocity || [0, 0, 0]));
                    
                    return {
                        newCentralBodyId: Number(bodyId),
                        newPosition: relPos,
                        newVelocity: newVel
                    };
                }
            }
        }

        return null; // No transition needed
    }

    /**
     * Find the appropriate SOI for a given global position
     * Returns the NAIF ID of the body whose SOI contains the position
     */
    static findAppropriateSOI(globalPos, bodies) {
        let bestBody = 0; // Default to SSB
        let smallestSOI = Infinity;
        
        // Check all bodies to find which SOI we're in
        for (const [naifId, body] of Object.entries(bodies)) {
            // Skip barycenters
            if (body.type === 'barycenter') continue;
            
            const bodyPos = new THREE.Vector3().fromArray(body.position || [0, 0, 0]);
            const distance = globalPos.distanceTo(bodyPos);
            const soiRadius = body.soiRadius || Infinity;
            
            // We're inside this body's SOI
            if (distance < soiRadius) {
                // Choose the smallest SOI that contains us (most specific)
                if (soiRadius < smallestSOI) {
                    bestBody = Number(naifId);
                    smallestSOI = soiRadius;
                }
            }
        }
        
        return bestBody;
    }
}