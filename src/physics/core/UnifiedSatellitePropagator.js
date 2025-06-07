/**
 * UnifiedSatellitePropagator.js
 * 
 * SINGLE CENTRALIZED SYSTEM for all satellite motion and orbit propagation
 * Replaces multiple inconsistent systems with one authoritative implementation
 * 
 * Design principles:
 * 1. Single acceleration calculation method
 * 2. Consistent data types (pure arrays for performance)
 * 3. Single integration method (RK4 for stability)
 * 4. Unified coordinate frame handling
 * 5. Consistent SOI transition logic
 */

import { PhysicsConstants } from './PhysicsConstants.js';
import { AtmosphericModels } from './AtmosphericModels.js';

export class UnifiedSatellitePropagator {
    
    /**
     * MASTER acceleration calculation - used by ALL systems
     * @param {Object} satellite - {position: [x,y,z], velocity: [vx,vy,vz], centralBodyNaifId, mass?, crossSectionalArea?, dragCoefficient?}
     * @param {Object} bodies - Map of body data by NAIF ID
     * @param {Object} options - {includeJ2: true, includeDrag: true, includeThirdBody: true}
     * @returns {Array} - Acceleration [ax, ay, az] in km/s²
     */
    static computeAcceleration(satellite, bodies, options = {}) {
        const {
            includeJ2 = true,
            includeDrag = true,
            includeThirdBody = true
        } = options;

        const centralBody = bodies[satellite.centralBodyNaifId];
        if (!centralBody) {
            return [0, 0, 0];
        }

        const [x, y, z] = satellite.position;
        const r = Math.sqrt(x*x + y*y + z*z);
        
        if (r === 0) return [0, 0, 0];

        // === 1. PRIMARY GRAVITATIONAL ACCELERATION ===
        const mu = centralBody.GM || (PhysicsConstants.PHYSICS.G * centralBody.mass);
        const primaryAccelMag = mu / (r * r);
        
        const primaryAccel = [
            -primaryAccelMag * x / r,
            -primaryAccelMag * y / r,
            -primaryAccelMag * z / r
        ];

        let totalAccel = [...primaryAccel];

        // === 2. J2 PERTURBATION ===
        if (includeJ2 && centralBody.J2 && centralBody.radius) {
            const j2Accel = this._computeJ2Perturbation(satellite.position, centralBody);
            totalAccel[0] += j2Accel[0];
            totalAccel[1] += j2Accel[1];
            totalAccel[2] += j2Accel[2];
        }

        // === 3. ATMOSPHERIC DRAG ===
        if (includeDrag && (centralBody.atmosphericModel || centralBody.atmosphere)) {
            const ballisticCoeff = this._getBallisticCoefficient(satellite, centralBody);
            const dragAccel = AtmosphericModels.computeDragAcceleration(
                satellite.position, 
                satellite.velocity, 
                centralBody, 
                ballisticCoeff
            );
            totalAccel[0] += dragAccel[0];
            totalAccel[1] += dragAccel[1];
            totalAccel[2] += dragAccel[2];
        }

        // === 4. THIRD-BODY PERTURBATIONS ===
        if (includeThirdBody) {
            const thirdBodyAccel = this._computeThirdBodyPerturbations(
                satellite, centralBody, bodies
            );
            totalAccel[0] += thirdBodyAccel[0];
            totalAccel[1] += thirdBodyAccel[1];
            totalAccel[2] += thirdBodyAccel[2];
        }

        return totalAccel;
    }

    /**
     * MASTER integration step - used by ALL systems
     * @param {Array} position - [x, y, z] in km
     * @param {Array} velocity - [vx, vy, vz] in km/s
     * @param {Function} accelerationFunc - (pos, vel) => [ax, ay, az]
     * @param {number} dt - Time step in seconds
     * @returns {Object} - {position: [x,y,z], velocity: [vx,vy,vz]}
     */
    static integrateRK4(position, velocity, accelerationFunc, dt) {
        const [x, y, z] = position;
        const [vx, vy, vz] = velocity;

        // k1
        const k1v = accelerationFunc(position, velocity);
        const k1r = velocity;

        // k2
        const r2 = [x + 0.5*dt*k1r[0], y + 0.5*dt*k1r[1], z + 0.5*dt*k1r[2]];
        const v2 = [vx + 0.5*dt*k1v[0], vy + 0.5*dt*k1v[1], vz + 0.5*dt*k1v[2]];
        const k2v = accelerationFunc(r2, v2);
        const k2r = v2;

        // k3
        const r3 = [x + 0.5*dt*k2r[0], y + 0.5*dt*k2r[1], z + 0.5*dt*k2r[2]];
        const v3 = [vx + 0.5*dt*k2v[0], vy + 0.5*dt*k2v[1], vz + 0.5*dt*k2v[2]];
        const k3v = accelerationFunc(r3, v3);
        const k3r = v3;

        // k4
        const r4 = [x + dt*k3r[0], y + dt*k3r[1], z + dt*k3r[2]];
        const v4 = [vx + dt*k3v[0], vy + dt*k3v[1], vz + dt*k3v[2]];
        const k4v = accelerationFunc(r4, v4);
        const k4r = v4;

        // Final step
        const newPosition = [
            x + (dt/6) * (k1r[0] + 2*k2r[0] + 2*k3r[0] + k4r[0]),
            y + (dt/6) * (k1r[1] + 2*k2r[1] + 2*k3r[1] + k4r[1]),
            z + (dt/6) * (k1r[2] + 2*k2r[2] + 2*k3r[2] + k4r[2])
        ];

        const newVelocity = [
            vx + (dt/6) * (k1v[0] + 2*k2v[0] + 2*k3v[0] + k4v[0]),
            vy + (dt/6) * (k1v[1] + 2*k2v[1] + 2*k3v[1] + k4v[1]),
            vz + (dt/6) * (k1v[2] + 2*k2v[2] + 2*k3v[2] + k4v[2])
        ];

        return {
            position: newPosition,
            velocity: newVelocity
        };
    }

    /**
     * MASTER orbit propagation - used by ALL systems
     * @param {Object} params - Propagation parameters
     * @returns {Array} - Array of orbit points
     */
    static propagateOrbit(params) {
        const {
            satellite,
            bodies,
            duration,
            timeStep = 60,
            startTime = 0,
            maxPoints = Infinity, // No default limit - calculate based on duration/timeStep
            includeJ2 = true,
            includeDrag = true,
            includeThirdBody = true
        } = params;

        const points = [];
        let position = [...satellite.position];
        let velocity = [...satellite.velocity];
        let currentTime = startTime;

        const accelerationFunc = (pos, vel) => {
            const satState = {
                ...satellite,
                position: pos,
                velocity: vel
            };
            return this.computeAcceleration(satState, bodies, {
                includeJ2,
                includeDrag,
                includeThirdBody
            });
        };

        const numSteps = Math.min(Math.floor(duration / timeStep), maxPoints);

        // Add initial point
        points.push({
            position: [...position],
            velocity: [...velocity],
            time: currentTime,
            centralBodyId: satellite.centralBodyNaifId
        });

        // Integrate
        for (let i = 0; i < numSteps; i++) {
            const result = this.integrateRK4(position, velocity, accelerationFunc, timeStep);
            position = result.position;
            velocity = result.velocity;
            currentTime += timeStep;

            points.push({
                position: [...position],
                velocity: [...velocity],
                time: currentTime,
                centralBodyId: satellite.centralBodyNaifId
            });
        }

        return points;
    }

    /**
     * Check orbital energy conservation (for validation)
     */
    static checkEnergyConservation(satellite, centralBody) {
        const [x, y, z] = satellite.position;
        const [vx, vy, vz] = satellite.velocity;
        
        const r = Math.sqrt(x*x + y*y + z*z);
        const v = Math.sqrt(vx*vx + vy*vy + vz*vz);
        const mu = centralBody.GM || (PhysicsConstants.PHYSICS.G * centralBody.mass);
        
        const kineticEnergy = 0.5 * v * v;
        const potentialEnergy = -mu / r;
        const totalEnergy = kineticEnergy + potentialEnergy;
        
        return {
            kinetic: kineticEnergy,
            potential: potentialEnergy,
            total: totalEnergy,
            specific: totalEnergy // per unit mass
        };
    }

    // === PRIVATE HELPER METHODS ===

    /**
     * Compute J2 perturbation acceleration
     * @private
     */
    static _computeJ2Perturbation(position, body) {
        if (!body.J2 || !body.radius) return [0, 0, 0];

        const [x, y, z] = position;
        const r = Math.sqrt(x*x + y*y + z*z);
        const mu = body.GM || (PhysicsConstants.PHYSICS.G * body.mass);
        const J2 = body.J2;
        const Re = body.radius;

        if (r < Re) return [0, 0, 0];

        const r2 = r * r;
        const r5 = r2 * r2 * r;
        const Re2 = Re * Re;

        const factor = 1.5 * J2 * mu * Re2 / r5;
        const z2_r2 = (z * z) / r2;

        return [
            factor * x * (5 * z2_r2 - 1),
            factor * y * (5 * z2_r2 - 1),
            factor * z * (5 * z2_r2 - 3)
        ];
    }

    /**
     * Compute third-body perturbations
     * @private
     */
    static _computeThirdBodyPerturbations(satellite, centralBody, bodies) {
        const totalAccel = [0, 0, 0];
        
        // Satellite global position
        const satGlobalPos = [
            satellite.position[0] + (centralBody.position?.[0] || 0),
            satellite.position[1] + (centralBody.position?.[1] || 0),
            satellite.position[2] + (centralBody.position?.[2] || 0)
        ];

        for (const [bodyId, body] of Object.entries(bodies)) {
            // Skip central body and non-physical bodies
            if (bodyId == satellite.centralBodyNaifId || 
                body.type === 'barycenter' || 
                !body.mass || 
                body.mass <= 0) {
                continue;
            }

            const bodyPos = body.position || [0, 0, 0];
            
            // Acceleration on satellite due to this body
            const dx_sat = bodyPos[0] - satGlobalPos[0];
            const dy_sat = bodyPos[1] - satGlobalPos[1];
            const dz_sat = bodyPos[2] - satGlobalPos[2];
            const r2_sat = dx_sat*dx_sat + dy_sat*dy_sat + dz_sat*dz_sat;
            const r_sat = Math.sqrt(r2_sat);

            // Acceleration on central body due to this body
            const dx_central = bodyPos[0] - (centralBody.position?.[0] || 0);
            const dy_central = bodyPos[1] - (centralBody.position?.[1] || 0);
            const dz_central = bodyPos[2] - (centralBody.position?.[2] || 0);
            const r2_central = dx_central*dx_central + dy_central*dy_central + dz_central*dz_central;
            const r_central = Math.sqrt(r2_central);

            if (r_sat > 1e-6 && r_central > 1e-6) {
                const mu_body = body.GM || (PhysicsConstants.PHYSICS.G * body.mass);
                
                // Perturbation = acceleration on satellite - acceleration on central body
                const accel_sat_mag = mu_body / r2_sat;
                const accel_central_mag = mu_body / r2_central;
                
                totalAccel[0] += accel_sat_mag * dx_sat / r_sat - accel_central_mag * dx_central / r_central;
                totalAccel[1] += accel_sat_mag * dy_sat / r_sat - accel_central_mag * dy_central / r_central;
                totalAccel[2] += accel_sat_mag * dz_sat / r_sat - accel_central_mag * dz_central / r_central;
            }
        }

        return totalAccel;
    }

    /**
     * Get ballistic coefficient for satellite
     * @private
     */
    static _getBallisticCoefficient(satellite, centralBody) {
        // Use satellite-specific ballistic coefficient if available
        if (satellite.ballisticCoefficient) {
            return satellite.ballisticCoefficient;
        }
        
        // Calculate from satellite properties
        if (satellite.mass && satellite.crossSectionalArea && satellite.dragCoefficient) {
            return satellite.mass / (satellite.dragCoefficient * satellite.crossSectionalArea);
        }
        
        // Use central body default
        if (centralBody.ballisticCoefficient) {
            return centralBody.ballisticCoefficient;
        }
        
        // Final fallback
        return AtmosphericModels.DEFAULT_BALLISTIC_COEFFICIENT;
    }

    /**
     * Create standardized acceleration function for external systems
     * @param {Object} satellite - Satellite parameters
     * @param {Object} bodies - Body data
     * @param {Object} options - Physics options
     * @returns {Function} - Acceleration function (pos, vel) => accel
     */
    static createAccelerationFunction(satellite, bodies, options = {}) {
        return (position, velocity) => {
            const satState = {
                ...satellite,
                position: Array.isArray(position) ? position : [position.x, position.y, position.z],
                velocity: Array.isArray(velocity) ? velocity : [velocity.x, velocity.y, velocity.z]
            };
            return this.computeAcceleration(satState, bodies, options);
        };
    }
}