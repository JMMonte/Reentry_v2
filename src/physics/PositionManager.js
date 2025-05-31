import * as THREE from 'three';

/**
 * Position Manager
 * 
 * Handles hierarchical positioning logic for all solar system bodies.
 * Ensures that each body is positioned correctly relative to its parent
 * in the hierarchy, solving the moon positioning problem.
 */
export class PositionManager {
    constructor(hierarchy, stateCalculator) {
        this.hierarchy = hierarchy;
        this.stateCalculator = stateCalculator;
        this.bodies = {}; // NAIF ID -> body state
    }

    /**
     * Update all body positions for a given time
     */
    updateAllPositions(time, bodyConfigs) {
        // Clear previous states
        this.bodies = {};

        // Process bodies in hierarchical order (parents before children)
        const processOrder = this._getProcessingOrder();

        for (const naifId of processOrder) {
            const bodyConfig = bodyConfigs.get ? bodyConfigs.get(naifId) : bodyConfigs[naifId];
            if (bodyConfig) {
                this._updateBodyPosition(naifId, bodyConfig, time);
            }
        }

        return this.bodies;
    }

    /**
     * Update position for a single body
     */
    _updateBodyPosition(naifId, bodyConfig, time) {
        const bodyInfo = this.hierarchy.getBodyInfo(naifId);
        if (!bodyInfo) {
            console.warn(`No hierarchy info for NAIF ID ${naifId}`);
            return;
        }

        // Calculate the raw state vector for this body
        const rawState = this.stateCalculator.calculateStateVector(naifId, time);

        if (!rawState) {
            // If no state available, mark as inactive
            this.bodies[naifId] = this._createInactiveBody(naifId, bodyConfig);
            return;
        }

        // Handle positioning based on body type and hierarchy
        const position = this._calculateHierarchicalPosition(naifId, rawState);
        const velocity = this._calculateHierarchicalVelocity(naifId, rawState);

        // Create body state
        this.bodies[naifId] = this._createBodyState(naifId, bodyConfig, position, velocity);
    }

    /**
     * Calculate hierarchical position for a body
     */
    _calculateHierarchicalPosition(naifId, rawState) {
        const bodyInfo = this.hierarchy.getBodyInfo(naifId);
        const parentId = bodyInfo.parent;

        // Root level bodies (SSB, Sun, major planets) use absolute positions
        if (parentId === null || parentId === 0) {
            return new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
        }

        // For bodies with parents, calculate relative position
        const parentBody = this.bodies[parentId];
        if (!parentBody) {
            console.warn(`Parent body ${parentId} not found for ${naifId}`);
            return new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
        }

        // Special handling for different hierarchy relationships
        if (this.hierarchy.isMoon(naifId)) {
            return this._calculateMoonPosition(naifId, rawState, parentId);
        } else if (this.hierarchy.isPlanet(naifId)) {
            return this._calculatePlanetPosition(naifId, rawState);
        } else {
            // Default: use raw position relative to parent
            const relativePos = new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
            return relativePos.sub(parentBody.position);
        }
    }

    /**
     * Calculate moon position relative to its parent planet
     */
    _calculateMoonPosition(moonNaifId, rawState, parentPlanetId) {
        const parentBody = this.bodies[parentPlanetId];
        if (!parentBody) {
            return new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
        }
        // Moon coordinates should remain in their native reference frame
        // The 3D scene handles coordinate transformations via equatorial groups
        // Default: position is relative to parent, so add parent position
        const relativePos = new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
        return relativePos.add(parentBody.position);
    }

    /**
     * Calculate planet position relative to its parent barycenter
     */
    _calculatePlanetPosition(planetNaifId, rawState) {
        // Get parent barycenter
        const bodyInfo = this.hierarchy.getBodyInfo(planetNaifId);
        const parentId = bodyInfo.parent;
        if (parentId === null || parentId === 0) {
            // Root-level planets (should not happen for real planets)
            return new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
        }
        const parentBody = this.bodies[parentId];
        if (!parentBody) {
            // Fallback: treat as root
            return new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
        }
        // If parent is a barycenter, add the barycenter's position to get absolute position
        if (this.hierarchy.isBarycenter(parentId)) {
            const relativePos = new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]);
            return relativePos.add(parentBody.position);
        }
        // Otherwise, subtract parent position
        return new THREE.Vector3(rawState.position[0], rawState.position[1], rawState.position[2]).sub(parentBody.position);
    }

    /**
     * Calculate hierarchical velocity (similar to position)
     */
    _calculateHierarchicalVelocity(naifId, rawState) {
        const bodyInfo = this.hierarchy.getBodyInfo(naifId);
        const parentId = bodyInfo.parent;
        
        // Root level bodies use absolute velocities
        if (parentId === null || parentId === 0) {
            return new THREE.Vector3(rawState.velocity[0], rawState.velocity[1], rawState.velocity[2]);
        }
        
        const parentBody = this.bodies[parentId];
        if (!parentBody) {
            // Fallback: use raw velocity
            return new THREE.Vector3(rawState.velocity[0], rawState.velocity[1], rawState.velocity[2]);
        }
        
        // For hierarchical bodies, velocities are relative to parent
        // We need to add parent's velocity to get absolute velocity
        const relativeVel = new THREE.Vector3(rawState.velocity[0], rawState.velocity[1], rawState.velocity[2]);
        
        // Moon velocities should remain in their native reference frame
        // The 3D scene handles coordinate transformations via equatorial groups
        
        // Add parent velocity to get absolute velocity
        return relativeVel.add(parentBody.velocity);
    }

    /**
     * Create a body state object
     */
    _createBodyState(naifId, bodyConfig, position, velocity) {
        if (bodyConfig.radius === undefined || bodyConfig.radius === null) {
            // Allow radius 0 for barycenters, but throw for others
            if (!this.hierarchy.isBarycenter(naifId)) {
                throw new Error(`Missing radius for ${bodyConfig.name} (NAIF ${naifId})`);
            }
        }
        return {
            naif: naifId,
            name: bodyConfig.name,
            mass: bodyConfig.mass,
            position: position,
            velocity: velocity,
            acceleration: new THREE.Vector3(),
            radius: bodyConfig.radius,
            isActive: true,
            // Orientation will be calculated separately
            quaternion: new THREE.Quaternion(),
            poleRA: 0,
            poleDec: 90,
            spin: 0,
            northPole: new THREE.Vector3(0, 0, 1),
            astronomyEngineName: bodyConfig.astronomyEngineName
        };
    }

    /**
     * Create an inactive body state
     */
    _createInactiveBody(naifId, bodyConfig) {
        if (bodyConfig.radius === undefined) {
            throw new Error(`Missing radius for ${bodyConfig.name} (NAIF ${naifId})`);
        }
        return {
            naif: naifId,
            name: bodyConfig.name,
            mass: bodyConfig.mass,
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            acceleration: new THREE.Vector3(),
            radius: bodyConfig.radius,
            isActive: false,
            quaternion: new THREE.Quaternion(),
            poleRA: 0,
            poleDec: 90,
            spin: 0,
            northPole: new THREE.Vector3(0, 0, 1),
            astronomyEngineName: bodyConfig.astronomyEngineName
        };
    }

    /**
     * Get processing order: parents before children
     */
    _getProcessingOrder() {
        const order = [];
        const visited = new Set();

        // Start with root (SSB)
        this._addToProcessingOrder(0, order, visited);

        return order;
    }

    /**
     * Recursively add bodies to processing order
     */
    _addToProcessingOrder(naifId, order, visited) {
        if (visited.has(naifId)) return;

        visited.add(naifId);
        const bodyInfo = this.hierarchy.getBodyInfo(naifId);

        if (bodyInfo) {
            // Add this body to the order
            order.push(naifId);

            // Then add all children
            for (const childId of bodyInfo.children) {
                this._addToProcessingOrder(childId, order, visited);
            }
        }
    }

    /**
     * Get current body states
     */
    getBodies() {
        return this.bodies;
    }

    /**
     * Get a specific body
     */
    getBody(naifId) {
        return this.bodies[naifId] || null;
    }

    /**
     * Check if a body is active
     */
    isBodyActive(naifId) {
        const body = this.getBody(naifId);
        return body ? body.isActive : false;
    }
} 