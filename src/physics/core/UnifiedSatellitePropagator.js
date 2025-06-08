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
import * as THREE from 'three';
import { integrateRK45 } from '../integrators/OrbitalIntegrators.js';

export class UnifiedSatellitePropagator {
    
    /**
     * MASTER acceleration calculation - used by ALL systems
     * @param {Object} satellite - {position: [x,y,z], velocity: [vx,vy,vz], centralBodyNaifId, mass?, crossSectionalArea?, dragCoefficient?}
     * @param {Object} bodies - Map of body data by NAIF ID
     * @param {Object} options - {includeJ2: true, includeDrag: true, includeThirdBody: true, detailed: false}
     * @returns {Array|Object} - If detailed=false: [ax, ay, az] in km/s², If detailed=true: {total: [ax,ay,az], components: {...}}
     */
    static computeAcceleration(satellite, bodies, options = {}) {
        const {
            includeJ2 = true,
            includeDrag = true,
            includeThirdBody = true,
            detailed = false
        } = options;

        const centralBody = bodies[satellite.centralBodyNaifId];
        if (!centralBody) {
            return detailed ? { total: [0, 0, 0], components: {} } : [0, 0, 0];
        }

        const [x, y, z] = satellite.position;
        const r = Math.sqrt(x*x + y*y + z*z);
        
        if (r === 0) {
            return detailed ? { total: [0, 0, 0], components: {} } : [0, 0, 0];
        }

        // === 1. PRIMARY GRAVITATIONAL ACCELERATION ===
        const mu = centralBody.GM || (PhysicsConstants.PHYSICS.G * centralBody.mass);
        const primaryAccelMag = mu / (r * r);
        
        const primaryAccel = [
            -primaryAccelMag * x / r,
            -primaryAccelMag * y / r,
            -primaryAccelMag * z / r
        ];

        let totalAccel = [...primaryAccel];
        const components = detailed ? {
            primary: [...primaryAccel],
            j2: [0, 0, 0],
            drag: [0, 0, 0],
            thirdBody: [0, 0, 0],
            thirdBodies: {},
            thirdBodiesDirect: {} // Direct gravitational acceleration (for vector visualization)
        } : null;

        // === 2. J2 PERTURBATION ===
        let j2Accel = [0, 0, 0];
        if (includeJ2 && centralBody.J2 && centralBody.radius) {
            j2Accel = this._computeJ2Perturbation(satellite.position, centralBody);
            totalAccel[0] += j2Accel[0];
            totalAccel[1] += j2Accel[1];
            totalAccel[2] += j2Accel[2];
            if (detailed) components.j2 = [...j2Accel];
        }

        // === 3. ATMOSPHERIC DRAG ===
        let dragAccel = [0, 0, 0];
        if (includeDrag && (centralBody.atmosphericModel || centralBody.atmosphere)) {
            const ballisticCoeff = this._getBallisticCoefficient(satellite, centralBody);
            dragAccel = AtmosphericModels.computeDragAcceleration(
                satellite.position, 
                satellite.velocity, 
                centralBody, 
                ballisticCoeff
            );
            totalAccel[0] += dragAccel[0];
            totalAccel[1] += dragAccel[1];
            totalAccel[2] += dragAccel[2];
            if (detailed) components.drag = [...dragAccel];
        }

        // === 4. THIRD-BODY PERTURBATIONS ===
        let thirdBodyAccel = [0, 0, 0];
        if (includeThirdBody) {
            const thirdBodyResult = detailed 
                ? this._computeThirdBodyPerturbationsDetailed(satellite, centralBody, bodies)
                : this._computeThirdBodyPerturbations(satellite, centralBody, bodies);
            
            if (detailed && thirdBodyResult.total) {
                thirdBodyAccel = thirdBodyResult.total;
                components.thirdBody = [...thirdBodyAccel];
                components.thirdBodies = thirdBodyResult.individual || {};
                components.thirdBodiesDirect = thirdBodyResult.individualDirect || {};
            } else if (!detailed) {
                thirdBodyAccel = thirdBodyResult;
                components && (components.thirdBody = [...thirdBodyAccel]);
            }
            
            totalAccel[0] += thirdBodyAccel[0];
            totalAccel[1] += thirdBodyAccel[1];
            totalAccel[2] += thirdBodyAccel[2];
        }

        return detailed ? { total: totalAccel, components } : totalAccel;
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
            includeThirdBody = true,
            timeWarp = 1,
            method = 'auto',
            maneuverNodes = [] // Array of maneuver nodes with executionTime and deltaV
        } = params;

        const points = [];
        let position = [...satellite.position];
        let velocity = [...satellite.velocity];
        let currentTime = startTime;

        // Sort maneuver nodes by execution time
        const sortedManeuvers = [...maneuverNodes].sort((a, b) => {
            const timeA = a.executionTime instanceof Date ? a.executionTime.getTime() : new Date(a.executionTime).getTime();
            const timeB = b.executionTime instanceof Date ? b.executionTime.getTime() : new Date(b.executionTime).getTime();
            return timeA - timeB;
        });

        // Convert maneuver times to seconds from start
        const maneuversWithTime = sortedManeuvers.map(node => {
            const execTime = node.executionTime instanceof Date ? node.executionTime : new Date(node.executionTime);
            const baseTime = new Date().getTime() + startTime * 1000; // Convert startTime to absolute ms
            const timeFromStart = (execTime.getTime() - baseTime) / 1000; // seconds from start
            return {
                ...node,
                timeFromStart,
                executed: false
            };
        }).filter(m => m.timeFromStart >= 0 && m.timeFromStart <= duration); // Only include maneuvers within propagation window

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

        // Integrate using unified integrator
        for (let i = 0; i < numSteps; i++) {
            // Check for maneuvers before this step
            maneuversWithTime.forEach(maneuver => {
                if (!maneuver.executed && currentTime <= maneuver.timeFromStart && (currentTime + timeStep) > maneuver.timeFromStart) {
                    // Maneuver occurs during this step - integrate to exact maneuver time
                    const dtToManeuver = maneuver.timeFromStart - currentTime;
                    
                    if (dtToManeuver > 0.001) { // Only integrate if significant time remains
                        const preResult = this.integrate(position, velocity, accelerationFunc, dtToManeuver, {
                            method,
                            timeWarp,
                            absTol: 1e-6,
                            relTol: 1e-6
                        });
                        position = preResult.position;
                        velocity = preResult.velocity;
                    }

                    // Apply maneuver delta-V
                    const deltaV = this._applyManeuverDeltaV(position, velocity, maneuver.deltaV);
                    velocity = [
                        velocity[0] + deltaV[0],
                        velocity[1] + deltaV[1],
                        velocity[2] + deltaV[2]
                    ];

                    // Mark as executed
                    maneuver.executed = true;

                    // Add maneuver point
                    points.push({
                        position: [...position],
                        velocity: [...velocity],
                        time: maneuver.timeFromStart,
                        centralBodyId: satellite.centralBodyNaifId,
                        maneuverExecuted: true,
                        maneuverDeltaV: deltaV
                    });
                }
            });

            // Regular integration step
            const result = this.integrate(position, velocity, accelerationFunc, timeStep, {
                method,
                timeWarp,
                absTol: 1e-6,
                relTol: 1e-6
            });
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
     * Apply maneuver delta-V in local coordinates to world coordinates
     * @private
     */
    static _applyManeuverDeltaV(position, velocity, deltaVLocal) {
        // Convert local delta-V (prograde, normal, radial) to world coordinates
        const pos = new THREE.Vector3(...position);
        const vel = new THREE.Vector3(...velocity);
        
        // Calculate local coordinate frame
        const radialDir = pos.clone().normalize();
        const velocityDir = vel.clone().normalize();
        const normalDir = new THREE.Vector3().crossVectors(radialDir, velocityDir).normalize();
        
        // In case of zero velocity, use a different normal calculation
        if (vel.length() < 1e-6) {
            // Use z-axis cross product for normal if velocity is near zero
            const zAxis = new THREE.Vector3(0, 0, 1);
            normalDir.crossVectors(radialDir, zAxis).normalize();
            if (normalDir.length() < 0.1) {
                // If radial is parallel to z, use x-axis
                const xAxis = new THREE.Vector3(1, 0, 0);
                normalDir.crossVectors(radialDir, xAxis).normalize();
            }
        }
        
        // Build world delta-V from local components
        const worldDeltaV = new THREE.Vector3()
            .addScaledVector(velocityDir, deltaVLocal.prograde || 0)
            .addScaledVector(normalDir, deltaVLocal.normal || 0)
            .addScaledVector(radialDir, deltaVLocal.radial || 0);
        
        return worldDeltaV.toArray();
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
     * Compute third-body perturbations with individual body breakdown
     * @private
     */
    static _computeThirdBodyPerturbationsDetailed(satellite, centralBody, bodies) {
        const totalAccel = [0, 0, 0];
        const individual = {};
        const individualDirect = {}; // Direct gravitational acceleration (for intuitive vectors)
        
        // Convert satellite position from planet-centric to SSB coordinates
        // satellite.position is relative to central body, centralBody.position is SSB-relative
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
                
                // Calculate both tidal perturbation and direct acceleration
                const accel_sat_mag = mu_body / r2_sat;
                const accel_central_mag = mu_body / r2_central;
                
                // Tidal perturbation (physics-accurate for orbital mechanics)
                const bodyAccel = [
                    accel_sat_mag * dx_sat / r_sat - accel_central_mag * dx_central / r_central,
                    accel_sat_mag * dy_sat / r_sat - accel_central_mag * dy_central / r_central,
                    accel_sat_mag * dz_sat / r_sat - accel_central_mag * dz_central / r_central
                ];
                
                // Direct gravitational acceleration (intuitive for visualization)
                const directAccel = [
                    accel_sat_mag * dx_sat / r_sat,
                    accel_sat_mag * dy_sat / r_sat,
                    accel_sat_mag * dz_sat / r_sat
                ];
                
                totalAccel[0] += bodyAccel[0];
                totalAccel[1] += bodyAccel[1];
                totalAccel[2] += bodyAccel[2];
                
                // Store both types of acceleration
                individual[bodyId] = bodyAccel;
                individualDirect[bodyId] = directAccel;
            }
        }

        return { total: totalAccel, individual, individualDirect };
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

    /**
     * UNIFIED integration interface - automatically selects best integrator
     * @param {Array} position - [x, y, z] in km
     * @param {Array} velocity - [vx, vy, vz] in km/s
     * @param {Function} accelerationFunc - (pos, vel) => [ax, ay, az]
     * @param {number} dt - Time step in seconds
     * @param {Object} options - Integration options
     * @returns {Object} - {position: [x,y,z], velocity: [vx,vy,vz]}
     */
    static integrate(position, velocity, accelerationFunc, dt, options = {}) {
        const {
            method = 'auto',
            timeWarp = 1,
            absTol = 1e-6,
            relTol = 1e-6,
            minStep = 1e-6,
            maxStep = 60
        } = options;

        // Determine which integrator to use
        let useMethod = method;
        if (method === 'auto') {
            // Use RK45 for better precision, only fall back to RK4 for very small real-time steps
            if (timeWarp >= 10 || dt > 10) {
                useMethod = 'rk45';
            } else {
                useMethod = 'rk4';
            }
        }

        if (useMethod === 'rk45') {
            // Convert to Three.js vectors
            const pos3 = new THREE.Vector3(...position);
            const vel3 = new THREE.Vector3(...velocity);
            
            // Wrap acceleration function to work with Three.js vectors
            const accelFunc3 = (p, v) => {
                const accel = accelerationFunc(
                    [p.x, p.y, p.z],
                    [v.x, v.y, v.z]
                );
                return new THREE.Vector3(...accel);
            };
            
            const result = integrateRK45(pos3, vel3, accelFunc3, dt, {
                absTol,
                relTol,
                minStep,
                maxStep
            });
            
            return {
                position: [result.position.x, result.position.y, result.position.z],
                velocity: [result.velocity.x, result.velocity.y, result.velocity.z]
            };
        } else {
            // Use built-in RK4 (no dependencies)
            return this.integrateRK4(position, velocity, accelerationFunc, dt);
        }
    }
}