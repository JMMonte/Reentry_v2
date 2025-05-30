// KeplerianPropagator.js
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { integrateRK4 } from './integrators/OrbitalIntegrators.js';
import { solveKeplerEquation, stateToKeplerian } from '../utils/KeplerianUtils.js';

// Julian date utilities
export function dateToJd(date) {
    return (date.getTime() / 86400000) + Constants.ECLIPIC_J2000_JD;
}

const DEG_TO_RAD = Math.PI / 180.0;

/**
 * Specialized orbit propagator for analytical Keplerian orbit propagation
 * Supports Keplerian orbits, numerical integration, and trajectory prediction
 * 
 * Now includes consolidated orbital mechanics functions from OrbitalMechanics.js
 */
export class KeplerianPropagator {
    constructor() {
        this.cache = new Map(); // Cache orbital elements and trajectories
        this.maxCacheSize = 1000;
    }


    /**
     * Convert orbital elements to Cartesian state vector
     * @param {Object} elements - Orbital elements {a, e, i, Omega, omega, M0, epoch}
     * @param {number} julianDate - Current Julian date
     * @param {number} GM - Gravitational parameter (km³/s²)
     * @returns {Object} {position: Vector3, velocity: Vector3} in km and km/s
     */
    orbitalElementsToStateVector(elements, julianDate, GM) {
        const { a, e, i, Omega, omega, M0, epoch } = elements;

        // Convert to radians
        const i_rad = i * DEG_TO_RAD;
        const Omega_rad = Omega * DEG_TO_RAD;
        const omega_rad = omega * DEG_TO_RAD;
        const M0_rad = M0 * DEG_TO_RAD;

        // Time since epoch (days)
        const deltaT = julianDate - epoch;

        // Mean motion (rad/day)
        const n = Math.sqrt(GM / (a * a * a)) * 86400; // rad/s to rad/day by multiplying by seconds per day

        // Current mean anomaly
        const M = M0_rad + n * deltaT;

        // Solve Kepler's equation for eccentric anomaly
        const E = solveKeplerEquation(M, e);

        // True anomaly
        const cosnu = (Math.cos(E) - e) / (1 - e * Math.cos(E));
        const sinnu = Math.sqrt(1 - e * e) * Math.sin(E) / (1 - e * Math.cos(E));
        const nu = Math.atan2(sinnu, cosnu);

        // Distance from central body
        const r = a * (1 - e * Math.cos(E));

        // Position in orbital plane
        const x_orb = r * Math.cos(nu);
        const y_orb = r * Math.sin(nu);
        const z_orb = 0;

        // Velocity in orbital plane
        const p = a * (1 - e * e);
        const h = Math.sqrt(GM * p); // angular momentum, GM already in km³/s²
        const vx_orb = -(h / r) * Math.sin(nu);
        const vy_orb = (h / r) * (e + Math.cos(nu));
        const vz_orb = 0;

        // Rotation matrices for 3D transformation
        const cosOmega = Math.cos(Omega_rad);
        const sinOmega = Math.sin(Omega_rad);
        const cosomega = Math.cos(omega_rad);
        const sinomega = Math.sin(omega_rad);
        const cosi = Math.cos(i_rad);
        const sini = Math.sin(i_rad);

        // Transform to 3D coordinates (ECLIPJ2000)
        const P11 = cosOmega * cosomega - sinOmega * sinomega * cosi;
        const P12 = -cosOmega * sinomega - sinOmega * cosomega * cosi;
        const P13 = sinOmega * sini;

        const P21 = sinOmega * cosomega + cosOmega * sinomega * cosi;
        const P22 = -sinOmega * sinomega + cosOmega * cosomega * cosi;
        const P23 = -cosOmega * sini;

        const P31 = sinomega * sini;
        const P32 = cosomega * sini;
        const P33 = cosi;

        // Apply rotation
        const x = P11 * x_orb + P12 * y_orb + P13 * z_orb;
        const y = P21 * x_orb + P22 * y_orb + P23 * z_orb;
        const z = P31 * x_orb + P32 * y_orb + P33 * z_orb;

        const vx = P11 * vx_orb + P12 * vy_orb + P13 * vz_orb;
        const vy = P21 * vx_orb + P22 * vy_orb + P23 * vz_orb;
        const vz = P31 * vx_orb + P32 * vy_orb + P33 * vz_orb;

        const result = {
            position: new THREE.Vector3(x, y, z),
            velocity: new THREE.Vector3(vx, vy, vz)
        };

        return result;
    }

    /**
     * Compute mean motion from semi-major axis and GM
     * @param {number} a - Semi-major axis (km)
     * @param {number} GM - Gravitational parameter (km³/s²)
     * @returns {number} Mean motion (rad/day)
     */
    computeMeanMotion(a, GM) {
        // n = sqrt(GM/a³) in rad/s, convert to rad/day by multiplying by seconds per day
        return Math.sqrt(GM / (a * a * a)) * 86400;
    }

    /**
     * Compute orbital period from semi-major axis and GM
     * @param {number} a - Semi-major axis (km)
     * @param {number} GM - Gravitational parameter (km³/s²)
     * @returns {number} Orbital period (days)
     */
    computeOrbitalPeriod(a, GM) {
        const n = this.computeMeanMotion(a, GM);
        return (2 * Math.PI) / n;
    }

    /**
     * Generate orbital path for a celestial body around its parent with moving reference frames
     * @param {Object} body - Body with position, velocity, mass
     * @param {Object} parent - Parent body (center of orbit)
     * @param {Object} allBodies - Complete solar system state for proper reference frame handling
     * @param {number} numPoints - Number of points in orbit (default: 360)
     * @param {number} timeSpan - Time span in seconds (default: one orbital period)
     * @param {number} timeStep - Integration time step for system evolution
     * @returns {Array} Array of THREE.Vector3 positions with proper reference frame corrections
     */
    generateOrbitPath(body, parent, allBodies = null, numPoints = 360, timeSpan = null) {
        // If no complete solar system provided, fall back to simple Keplerian orbit
        if (!allBodies) {
            return this._generateSimpleKeplerianOrbit(body, parent, numPoints, timeSpan);
        }

        // Calculate orbital elements for initial conditions
        const elements = this.calculateOrbitalElements(body, parent);

        if (!elements || !isFinite(elements.semiMajorAxis) || elements.semiMajorAxis <= 0) {
            console.warn('Invalid orbital elements for', body.name);
            return [];
        }

        // Use provided timeSpan or calculate orbital period (convert from days to seconds)
        const parentMu = parent.mu || (Constants.G * parent.mass);
        const period = timeSpan || (this.computeOrbitalPeriod(elements.semiMajorAxis, parentMu) * 86400);

        const points = [];
        const dt = period / numPoints;
        
        // Initialize current solar system state
        let currentBodies = JSON.parse(JSON.stringify(allBodies));
        
        // Get initial relative position
        let currentParentPos = new THREE.Vector3().fromArray(currentBodies[parent.naif]?.position || parent.position);
        
        for (let i = 0; i <= numPoints; i++) {
            const t = i * dt;
            
            // Evolve the solar system if we have significant time steps
            if (i > 0 && Math.abs(dt) > 60) { // Only evolve for significant time steps
                currentBodies = this._evolveSolarSystem(currentBodies, dt);
                currentParentPos = new THREE.Vector3().fromArray(currentBodies[parent.naif]?.position || parent.position);
            }
            
            // Get position using Keplerian motion relative to evolved parent
            const relativePosition = this._getKeplerianPositionAtTime(elements, parent, t);
            
            // Add parent's evolved position to get absolute position
            const absolutePosition = relativePosition.add(currentParentPos);
            
            points.push(absolutePosition);
        }

        return points;
    }

    /**
     * Simple Keplerian orbit generation (fallback for when solar system state unavailable)
     * @param {Object} body - Body with position, velocity, mass
     * @param {Object} parent - Parent body (center of orbit)
     * @param {number} numPoints - Number of points in orbit
     * @param {number} timeSpan - Time span in seconds
     * @returns {Array} Array of THREE.Vector3 positions
     */
    _generateSimpleKeplerianOrbit(body, parent, numPoints, timeSpan) {
        const elements = this.calculateOrbitalElements(body, parent);

        if (!elements || !isFinite(elements.semiMajorAxis) || elements.semiMajorAxis <= 0) {
            console.warn('Invalid orbital elements for', body.name);
            return [];
        }

        const parentMu = parent.mu || (Constants.G * parent.mass);
        const period = timeSpan || (this.computeOrbitalPeriod(elements.semiMajorAxis, parentMu) * 86400);

        const points = [];
        const dt = period / numPoints;

        for (let i = 0; i <= numPoints; i++) {
            const t = i * dt;
            const position = this._getKeplerianPositionAtTime(elements, parent, t);
            if (position) {
                points.push(position);
            }
        }

        return points;
    }

    /**
     * Evolve solar system state by one time step
     * @param {Object} currentBodies - Current solar system state
     * @param {number} deltaTime - Time step in seconds
     * @returns {Object} Updated solar system state
     */
    _evolveSolarSystem(currentBodies, deltaTime) {
        const updatedBodies = {};
        
        // Copy current state
        for (const [naifId, body] of Object.entries(currentBodies)) {
            updatedBodies[naifId] = {
                ...body,
                position: new THREE.Vector3().fromArray(body.position),
                velocity: new THREE.Vector3().fromArray(body.velocity)
            };
        }
        
        // Simplified N-body evolution for major bodies only
        for (const [naifId, body] of Object.entries(updatedBodies)) {
            if (body.type === 'barycenter') continue;
            
            const acceleration = this._computeBodyAcceleration(body, updatedBodies);
            
            // Simple Euler integration (could be improved to RK4)
            const newVel = body.velocity.clone().addScaledVector(acceleration, deltaTime);
            const newPos = body.position.clone().addScaledVector(newVel, deltaTime);
            
            updatedBodies[naifId].position = newPos.toArray();
            updatedBodies[naifId].velocity = newVel.toArray();
        }
        
        return updatedBodies;
    }

    /**
     * Compute gravitational acceleration for a body
     * @param {Object} targetBody - Body to compute acceleration for
     * @param {Object} allBodies - All bodies in the system
     * @returns {THREE.Vector3} Acceleration vector
     */
    _computeBodyAcceleration(targetBody, allBodies) {
        const acceleration = new THREE.Vector3();
        const targetPos = targetBody.position;
        
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

    /**
     * Get Keplerian position at specific time (renamed for clarity)
     * @param {Object} elements - Orbital elements
     * @param {Object} parent - Parent body
     * @param {number} time - Time in seconds from epoch
     * @returns {THREE.Vector3} Position relative to parent
     */
    _getKeplerianPositionAtTime(elements, parent, time) {
        return this.getPositionAtTime(elements, parent, time);
    }

    /**
     * Generate future trajectory for a satellite
     * @param {Object} satellite - Satellite with current position and velocity
     * @param {Array} gravitationalBodies - Array of bodies affecting the satellite
     * @param {number} duration - Prediction duration in seconds
     * @param {number} timeStep - Integration time step in seconds
     * @returns {Array} Array of predicted positions
     */
    generateTrajectory(satellite, gravitationalBodies, duration = 3600, timeStep = 60) {
        const cacheKey = this._generateTrajectoryKey(satellite, gravitationalBodies, duration, timeStep);

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const trajectory = [];
        let currentPos = new THREE.Vector3().fromArray(satellite.position);
        let currentVel = new THREE.Vector3().fromArray(satellite.velocity);

        const numSteps = Math.floor(duration / timeStep);

        for (let step = 0; step <= numSteps; step++) {
            trajectory.push(currentPos.clone());

            if (step < numSteps) {
                // RK4 integration step using centralized integrator
                const accelerationFunc = (pos) => this._computeGravitationalAcceleration(pos, gravitationalBodies);
                const { position: newPos, velocity: newVel } = integrateRK4(
                    currentPos,
                    currentVel,
                    accelerationFunc,
                    timeStep
                );

                currentPos = newPos;
                currentVel = newVel;
            }
        }

        // Cache the result
        this._cacheResult(cacheKey, trajectory);
        return trajectory;
    }

    /**
     * Calculate Keplerian orbital elements from state vectors
     * @param {Object} body - Body with position and velocity
     * @param {Object} parent - Parent body
     * @returns {Object} Orbital elements
     */
    calculateOrbitalElements(body, parent) {
        const r = new THREE.Vector3().fromArray(body.position).sub(
            new THREE.Vector3().fromArray(parent.position)
        );
        const v = new THREE.Vector3().fromArray(body.velocity).sub(
            new THREE.Vector3().fromArray(parent.velocity)
        );

        const mu = parent.mu || (Constants.G * parent.mass);

        // Basic validation
        if (r.length() === 0 || v.length() === 0) return null;

        // Use centralized KeplerianUtils implementation
        const elements = stateToKeplerian(r, v, mu, 0, parent.radius || 0);
        
        if (!elements) return null;
        
        // Return in the format expected by this class (with radians)
        return {
            semiMajorAxis: elements.semiMajorAxis,
            eccentricity: elements.eccentricity,
            inclination: THREE.MathUtils.degToRad(elements.inclination),
            longitudeOfAscendingNode: THREE.MathUtils.degToRad(elements.longitudeOfAscendingNode),
            argumentOfPeriapsis: THREE.MathUtils.degToRad(elements.argumentOfPeriapsis),
            trueAnomaly: THREE.MathUtils.degToRad(elements.trueAnomaly),
            specificAngularMomentum: elements.specificAngularMomentum,
            specificEnergy: elements.specificOrbitalEnergy
        };
    }

    /**
     * Get position at a specific time using Keplerian motion
     * @param {Object} elements - Orbital elements
     * @param {Object} parent - Parent body
     * @param {number} time - Time in seconds from epoch
     * @returns {THREE.Vector3} Position relative to parent
     */
    getPositionAtTime(elements, parent, time) {
        const mu = parent.mu || (Constants.G * parent.mass);

        // Mean motion
        const n = Math.sqrt(mu / Math.pow(elements.semiMajorAxis, 3));

        // Mean anomaly at time t
        const M = (elements.trueAnomaly + n * time) % (2 * Math.PI);

        // Solve Kepler's equation for eccentric anomaly
        const E = solveKeplerEquation(M, elements.eccentricity);

        // True anomaly
        const nu = 2 * Math.atan2(
            Math.sqrt(1 + elements.eccentricity) * Math.sin(E / 2),
            Math.sqrt(1 - elements.eccentricity) * Math.cos(E / 2)
        );

        // Distance
        const r = elements.semiMajorAxis * (1 - elements.eccentricity * Math.cos(E));

        // Position in orbital plane
        const xOrb = r * Math.cos(nu);
        const yOrb = r * Math.sin(nu);

        // Rotation matrices
        const cosO = Math.cos(elements.longitudeOfAscendingNode);
        const sinO = Math.sin(elements.longitudeOfAscendingNode);
        const cosi = Math.cos(elements.inclination);
        const sini = Math.sin(elements.inclination);
        const cosw = Math.cos(elements.argumentOfPeriapsis);
        const sinw = Math.sin(elements.argumentOfPeriapsis);

        // Transform to inertial frame
        const x = (cosO * cosw - sinO * sinw * cosi) * xOrb +
            (-cosO * sinw - sinO * cosw * cosi) * yOrb;
        const y = (sinO * cosw + cosO * sinw * cosi) * xOrb +
            (-sinO * sinw + cosO * cosw * cosi) * yOrb;
        const z = (sinw * sini) * xOrb + (cosw * sini) * yOrb;

        // Add parent position
        const parentPos = new THREE.Vector3().fromArray(parent.position);
        return new THREE.Vector3(x, y, z).add(parentPos);
    }

    /**
     * Generate orbit around multiple barycenters
     * @param {Object} body - Body to orbit
     * @param {Array} barycenters - Array of barycenter objects
     * @param {number} numPoints - Number of points in orbit
     * @returns {Array} Array of positions showing hierarchical orbits
     */
    generateHierarchicalOrbit(body, barycenters, numPoints = 360) {
        // Find the immediate parent barycenter
        const parentBarycenter = barycenters.find(b =>
            this._isDirectParent(body, b)
        );

        if (!parentBarycenter) {
            console.warn('No parent barycenter found for', body.name);
            return [];
        }

        // Generate primary orbit around immediate parent
        const primaryOrbit = this.generateOrbitPath(body, parentBarycenter, numPoints);

        // If parent barycenter has its own parent, add hierarchical motion
        const grandParent = barycenters.find(b =>
            this._isDirectParent(parentBarycenter, b)
        );

        if (grandParent) {
            const parentOrbit = this.generateOrbitPath(parentBarycenter, grandParent, numPoints);

            // Combine the orbits
            return primaryOrbit.map((pos, index) => {
                const parentOffset = parentOrbit[index] || new THREE.Vector3();
                return pos.clone().add(parentOffset);
            });
        }

        return primaryOrbit;
    }

    /**
     * Private: Compute gravitational acceleration
     */
    _computeGravitationalAcceleration(position, bodies) {
        const acceleration = new THREE.Vector3();

        for (const body of bodies) {
            const bodyPos = new THREE.Vector3().fromArray(body.position);
            const r = new THREE.Vector3().subVectors(bodyPos, position);
            const distance = r.length();

            if (distance > 0) {
                const mu = body.mu || (Constants.G * body.mass);
                const accelMag = mu / (distance * distance * distance);
                acceleration.addScaledVector(r, accelMag);
            }
        }

        return acceleration;
    }


    /**
     * Private: Generate cache key for trajectory
     */
    _generateTrajectoryKey(satellite, bodies, duration, timeStep) {
        const posStr = satellite.position.join(',');
        const velStr = satellite.velocity.join(',');
        const bodiesStr = bodies.map(b => `${b.name}:${b.mass}`).join('|');
        return `${satellite.id}:${posStr}:${velStr}:${bodiesStr}:${duration}:${timeStep}`;
    }

    /**
     * Private: Cache result with size limit
     */
    _cacheResult(key, result) {
        if (this.cache.size >= this.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, result);
    }

    /**
     * Private: Check if parent is direct parent of body
     */
    _isDirectParent(body, parent) {
        // Simple check - in a real implementation, this would use
        // the solar system hierarchy
        return body.parent === parent.naif || body.parent === parent.name;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }
}

// ============================================================================
// Standalone functions for compatibility with existing code
// These replace the functions from OrbitalMechanics.js
// ============================================================================

/**
 * Get scaled position for visualization (convert km to scene units)
 * @param {THREE.Vector3} position - Position in km
 * @param {number} scaleFactor - Scale factor for visualization
 * @returns {THREE.Vector3} Scaled position
 */
export function getScaledPosition(position, scaleFactor = 1) {
    return position.clone().multiplyScalar(scaleFactor);
}