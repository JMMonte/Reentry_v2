import { PhysicsVector3 } from './utils/PhysicsVector3.js';
import { PhysicsQuaternion } from './utils/PhysicsQuaternion.js';

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
        
        // Working vectors to avoid GC pressure
        this._workVec1 = new PhysicsVector3();
        this._workVec2 = new PhysicsVector3();
        this._workVec3 = new PhysicsVector3();
        
        // Pre-allocated objects for body states
        this._zeroVector = new PhysicsVector3(0, 0, 0);
        this._identityQuaternion = new PhysicsQuaternion();
        this._unitZ = new PhysicsVector3(0, 0, 1);
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
            return this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]).clone();
        }

        // For bodies with parents, calculate relative position
        const parentBody = this.bodies[parentId];
        if (!parentBody) {
            console.warn(`Parent body ${parentId} not found for ${naifId}`);
            return this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]).clone();
        }

        // Special handling for different hierarchy relationships
        if (this.hierarchy.isMoon(naifId)) {
            return this._calculateMoonPosition(naifId, rawState, parentId);
        } else if (this.hierarchy.isPlanet(naifId)) {
            return this._calculatePlanetPosition(naifId, rawState);
        } else {
            // Default: use raw position relative to parent
            this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]);
            return this._workVec1.sub(parentBody.position).clone();
        }
    }

    /**
     * Calculate moon position relative to its parent planet
     */
    _calculateMoonPosition(moonNaifId, rawState, parentPlanetId) {
        const parentBody = this.bodies[parentPlanetId];
        if (!parentBody) {
            return this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]).clone();
        }
        // Moon coordinates should remain in their native reference frame
        // The 3D scene handles coordinate transformations via equatorial groups
        // Default: position is relative to parent, so add parent position
        this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]);
        return this._workVec1.add(parentBody.position).clone();
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
            return this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]).clone();
        }
        const parentBody = this.bodies[parentId];
        if (!parentBody) {
            // Fallback: treat as root
            return this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]).clone();
        }
        // If parent is a barycenter, add the barycenter's position to get absolute position
        if (this.hierarchy.isBarycenter(parentId)) {
            this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]);
            return this._workVec1.add(parentBody.position).clone();
        }
        // Otherwise, subtract parent position
        this._workVec1.set(rawState.position[0], rawState.position[1], rawState.position[2]);
        return this._workVec1.sub(parentBody.position).clone();
    }

    /**
     * Calculate hierarchical velocity (similar to position)
     */
        _calculateHierarchicalVelocity(naifId, rawState) {
        const bodyInfo = this.hierarchy.getBodyInfo(naifId);
        const parentId = bodyInfo.parent;
        
        // Root level bodies use absolute velocities
        if (parentId === null || parentId === 0) {
            return this._workVec2.set(rawState.velocity[0], rawState.velocity[1], rawState.velocity[2]).clone();
        }
        
        const parentBody = this.bodies[parentId];
        if (!parentBody) {
            // Fallback: use raw velocity
            return this._workVec2.set(rawState.velocity[0], rawState.velocity[1], rawState.velocity[2]).clone();
        }
        
        // For hierarchical bodies, velocities are relative to parent
        // We need to add parent's velocity to get absolute velocity
        this._workVec2.set(rawState.velocity[0], rawState.velocity[1], rawState.velocity[2]);
        
        // Moon velocities should remain in their native reference frame
        // The 3D scene handles coordinate transformations via equatorial groups
        
        // Add parent velocity to get absolute velocity
        return this._workVec2.add(parentBody.velocity).clone();
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
        
        // Reuse existing body state if it exists to avoid creating new objects
        let bodyState = this.bodies[naifId];
        if (!bodyState) {
            bodyState = {
                naif: naifId,
                name: bodyConfig.name,
                mass: bodyConfig.mass,
                position: new PhysicsVector3(),
                velocity: new PhysicsVector3(),
                acceleration: new PhysicsVector3(),
                radius: bodyConfig.radius,
                isActive: true,
                // Orientation will be calculated separately
                quaternion: new PhysicsQuaternion(),
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: new PhysicsVector3(0, 0, 1),
                astronomyEngineName: bodyConfig.astronomyEngineName
            };
        } else {
            // Update existing state
            bodyState.name = bodyConfig.name;
            bodyState.mass = bodyConfig.mass;
            bodyState.radius = bodyConfig.radius;
            bodyState.isActive = true;
            bodyState.astronomyEngineName = bodyConfig.astronomyEngineName;
        }
        
        // Update position and velocity by copying values
        bodyState.position.copy(position);
        bodyState.velocity.copy(velocity);
        
        return bodyState;
    }

    /**
     * Create an inactive body state
     */
    _createInactiveBody(naifId, bodyConfig) {
        if (bodyConfig.radius === undefined) {
            throw new Error(`Missing radius for ${bodyConfig.name} (NAIF ${naifId})`);
        }
        
        // Reuse existing body state if it exists
        let bodyState = this.bodies[naifId];
        if (!bodyState) {
            bodyState = {
                naif: naifId,
                name: bodyConfig.name,
                mass: bodyConfig.mass,
                position: new PhysicsVector3(0, 0, 0),
                velocity: new PhysicsVector3(0, 0, 0),
                acceleration: new PhysicsVector3(),
                radius: bodyConfig.radius,
                isActive: false,
                quaternion: new PhysicsQuaternion(),
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: new PhysicsVector3(0, 0, 1),
                astronomyEngineName: bodyConfig.astronomyEngineName
            };
        } else {
            // Update existing state
            bodyState.name = bodyConfig.name;
            bodyState.mass = bodyConfig.mass;
            bodyState.radius = bodyConfig.radius;
            bodyState.isActive = false;
            bodyState.astronomyEngineName = bodyConfig.astronomyEngineName;
            bodyState.position.set(0, 0, 0);
            bodyState.velocity.set(0, 0, 0);
        }
        
        return bodyState;
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