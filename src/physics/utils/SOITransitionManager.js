/**
 * SOI Transition Manager
 * 
 * Handles sphere of influence transitions for satellites in a clean, testable way.
 * Supports all transition types: parent↔child, sibling, and complex multi-hop.
 */
export class SOITransitionManager {
    constructor(hierarchy) {
        this.hierarchy = hierarchy;
        
        // Hysteresis factors to prevent ping-ponging
        this.EXIT_FACTOR = 1.02;   // Must be 2% outside SOI to exit
        this.ENTER_FACTOR = 0.98;  // Must be 2% inside SOI to enter
    }

    /**
     * Check if satellite should transition to a different SOI
     * @param {Object} satellite - Satellite state with position, velocity, centralBodyNaifId
     * @param {Object} bodies - Physics bodies data
     * @returns {number|null} New central body NAIF ID, or null if no transition
     */
    checkTransition(satellite, bodies) {
        const currentId = satellite.centralBodyNaifId;
        const currentBody = bodies[currentId];
        
        if (!currentBody) {
            return null; // Invalid current body
        }

        // Calculate basic metrics
        const position = Array.isArray(satellite.position) ? satellite.position : satellite.position.toArray();
        const velocity = Array.isArray(satellite.velocity) ? satellite.velocity : satellite.velocity.toArray();
        
        const distance = this._magnitude(position);
        const radialVelocity = this._dot(position, velocity) / distance;

        // 1. Check exit from current SOI
        const exitTarget = this._checkExit(currentId, currentBody, distance, radialVelocity);
        if (exitTarget !== null) {
            return exitTarget;
        }

        // 2. Check entry into child SOIs
        const childTarget = this._checkChildEntry(currentId, currentBody, position, velocity, bodies);
        if (childTarget !== null) {
            return childTarget;
        }

        // 3. Check sibling transitions
        const siblingTarget = this._checkSiblingEntry(currentId, currentBody, position, velocity, bodies);
        if (siblingTarget !== null) {
            return siblingTarget;
        }

        return null; // No transition needed
    }

    /**
     * Transform satellite coordinates for SOI transition
     * @param {Object} satellite - Satellite state
     * @param {number} newCentralBodyId - New central body NAIF ID
     * @param {Object} bodies - Physics bodies data
     * @returns {Object} New position and velocity arrays
     */
    transformCoordinates(satellite, newCentralBodyId, bodies) {
        const oldBody = bodies[satellite.centralBodyNaifId];
        const newBody = bodies[newCentralBodyId];

        if (!oldBody || !newBody) {
            throw new Error(`Cannot transform coordinates: missing body data`);
        }

        // Convert to arrays if needed
        const position = Array.isArray(satellite.position) ? satellite.position : satellite.position.toArray();
        const velocity = Array.isArray(satellite.velocity) ? satellite.velocity : satellite.velocity.toArray();
        const oldBodyPos = Array.isArray(oldBody.position) ? oldBody.position : oldBody.position.toArray();
        const oldBodyVel = Array.isArray(oldBody.velocity) ? oldBody.velocity : oldBody.velocity.toArray();
        const newBodyPos = Array.isArray(newBody.position) ? newBody.position : newBody.position.toArray();
        const newBodyVel = Array.isArray(newBody.velocity) ? newBody.velocity : newBody.velocity.toArray();

        // Transform to global coordinates
        const globalPosition = [
            position[0] + oldBodyPos[0],
            position[1] + oldBodyPos[1],
            position[2] + oldBodyPos[2]
        ];

        const globalVelocity = [
            velocity[0] + oldBodyVel[0],
            velocity[1] + oldBodyVel[1],
            velocity[2] + oldBodyVel[2]
        ];

        // Transform to new body's frame
        const newPosition = [
            globalPosition[0] - newBodyPos[0],
            globalPosition[1] - newBodyPos[1],
            globalPosition[2] - newBodyPos[2]
        ];

        const newVelocity = [
            globalVelocity[0] - newBodyVel[0],
            globalVelocity[1] - newBodyVel[1],
            globalVelocity[2] - newBodyVel[2]
        ];

        return {
            position: newPosition,
            velocity: newVelocity
        };
    }

    /**
     * Perform complete SOI transition (check + transform)
     * @param {Object} satellite - Satellite state (will be modified)
     * @param {Object} bodies - Physics bodies data
     * @returns {boolean} True if transition occurred
     */
    performTransition(satellite, bodies) {
        const newCentralBodyId = this.checkTransition(satellite, bodies);
        
        if (newCentralBodyId === null || newCentralBodyId === satellite.centralBodyNaifId) {
            return false; // No transition needed
        }

        // Transform coordinates
        const transformed = this.transformCoordinates(satellite, newCentralBodyId, bodies);
        
        // Update satellite state
        if (Array.isArray(satellite.position)) {
            satellite.position[0] = transformed.position[0];
            satellite.position[1] = transformed.position[1];
            satellite.position[2] = transformed.position[2];
        } else {
            satellite.position.set(transformed.position[0], transformed.position[1], transformed.position[2]);
        }

        if (Array.isArray(satellite.velocity)) {
            satellite.velocity[0] = transformed.velocity[0];
            satellite.velocity[1] = transformed.velocity[1];
            satellite.velocity[2] = transformed.velocity[2];
        } else {
            satellite.velocity.set(transformed.velocity[0], transformed.velocity[1], transformed.velocity[2]);
        }

        satellite.centralBodyNaifId = newCentralBodyId;
        
        return true; // Transition occurred
    }

    // ================================================================
    // PRIVATE METHODS
    // ================================================================

    /**
     * Check if satellite should exit current SOI
     * @private
     */
    _checkExit(currentId, currentBody, distance, radialVelocity) {
        const soiRadius = currentBody.soiRadius;
        if (!soiRadius || soiRadius === Infinity) {
            return null; // No SOI boundary to exit
        }

        // Exit conditions: outside boundary + moving away
        if (distance > soiRadius * this.EXIT_FACTOR && radialVelocity > 0) {
            const parent = this.hierarchy.getParent(currentId);
            return parent !== null ? parent : 0; // Default to SSB if no parent
        }

        return null;
    }

    /**
     * Check if satellite should enter a child SOI
     * @private
     */
    _checkChildEntry(currentId, currentBody, position, velocity, bodies) {
        const children = this.hierarchy.getChildren(currentId);
        if (children.length === 0) return null;

        // Convert satellite position & velocity to global frame once
        const globalPos = this._addVectors(position, this._getBodyPosition(currentBody));
        const globalVel = this._addVectors(
            velocity,
            Array.isArray(currentBody.velocity) ? currentBody.velocity : currentBody.velocity.toArray()
        );

        for (const childId of children) {
            const childBody = bodies[childId];
            if (!childBody?.soiRadius) continue;

            const childPos = this._getBodyPosition(childBody);
            const relVec = [globalPos[0] - childPos[0], globalPos[1] - childPos[1], globalPos[2] - childPos[2]];
            const distanceToChild = this._magnitude(relVec);

            // Radial velocity towards child (<0 means approaching)
            const radialToChild = this._dot(relVec, globalVel) / (distanceToChild || 1);

            if (distanceToChild < childBody.soiRadius * this.ENTER_FACTOR && radialToChild < 0) {
                return childId;
            }
        }

        return null;
    }

    /**
     * Check if satellite should enter a sibling SOI
     * @private
     */
    _checkSiblingEntry(currentId, currentBody, position, velocity, bodies) {
        const parent = this.hierarchy.getParent(currentId);
        if (parent === null) {
            return null; // No siblings if no parent
        }

        const siblings = this.hierarchy.getChildren(parent);
        if (siblings.length === 0) return null;

        const globalPos = this._addVectors(position, this._getBodyPosition(currentBody));
        const globalVel = this._addVectors(
            velocity,
            Array.isArray(currentBody.velocity) ? currentBody.velocity : currentBody.velocity.toArray()
        );

        for (const siblingId of siblings) {
            if (siblingId === currentId) continue;
            const siblingBody = bodies[siblingId];
            if (!siblingBody?.soiRadius) continue;

            const siblingPos = this._getBodyPosition(siblingBody);
            const relVec = [globalPos[0] - siblingPos[0], globalPos[1] - siblingPos[1], globalPos[2] - siblingPos[2]];
            const distanceToSibling = this._magnitude(relVec);
            const radialToSibling = this._dot(relVec, globalVel) / (distanceToSibling || 1);

            if (distanceToSibling < siblingBody.soiRadius * this.ENTER_FACTOR && radialToSibling < 0) {
                return siblingId;
            }
        }

        return null;
    }

    /**
     * Utility: Get body position as array
     * @private
     */
    _getBodyPosition(body) {
        return Array.isArray(body.position) ? body.position : body.position.toArray();
    }

    /**
     * Utility: Vector magnitude
     * @private
     */
    _magnitude(vec) {
        return Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);
    }

    /**
     * Utility: Vector dot product
     * @private
     */
    _dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    /**
     * Utility: Vector addition
     * @private
     */
    _addVectors(a, b) {
        return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }

    /**
     * Utility: Distance between two points
     * @private
     */
    _distance(a, b) {
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
} 