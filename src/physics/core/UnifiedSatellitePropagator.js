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
     * @param {Object} options - {includeJ2: true, includeDrag: true, includeThirdBody: true, detailed: false}
     * @returns {Array|Object} - If detailed=false: [ax, ay, az] in km/s², If detailed=true: {total: [ax,ay,az], components: {...}}
     */
    static computeAcceleration(satellite, bodies, options = {}) {
        const {
            includeJ2 = true,
            includeDrag = true,
            includeThirdBody = true,
            detailed = false,
            perturbationScale = 1.0,
            debugLogging = false
        } = options;

        const centralBody = bodies[satellite.centralBodyNaifId];
        if (!centralBody) {
            console.error(`[UnifiedSatellitePropagator] Central body ${satellite.centralBodyNaifId} not found!`);
            console.error(`[UnifiedSatellitePropagator] Available bodies:`, Object.keys(bodies));
            return detailed ? { total: [0, 0, 0], components: {} } : [0, 0, 0];
        }

        const [x, y, z] = Array.isArray(satellite.position) ? satellite.position : [satellite.position.x, satellite.position.y, satellite.position.z];
        const r = Math.sqrt(x * x + y * y + z * z);

        if (r === 0) {
            console.error(`[UnifiedSatellitePropagator] Zero position magnitude for satellite!`);
            return detailed ? { total: [0, 0, 0], components: {} } : [0, 0, 0];
        }

        // Validate we have a valid GM value
        const mu = centralBody.GM || (PhysicsConstants.PHYSICS.G * centralBody.mass);
        if (!mu || mu <= 0) {
            console.error(`[UnifiedSatellitePropagator] Invalid GM for central body ${satellite.centralBodyNaifId}:`, {
                GM: centralBody.GM,
                mass: centralBody.mass,
                computedGM: PhysicsConstants.PHYSICS.G * centralBody.mass,
                G: PhysicsConstants.PHYSICS.G
            });
            return detailed ? { total: [0, 0, 0], components: {} } : [0, 0, 0];
        }

        // === 1. PRIMARY GRAVITATIONAL ACCELERATION ===
        const r3 = r * r * r;
        const gravityAccel = [
            -mu * x / r3,
            -mu * y / r3,
            -mu * z / r3
        ];

        if (debugLogging) {
            const gravityMag = Math.sqrt(gravityAccel[0] * gravityAccel[0] + gravityAccel[1] * gravityAccel[1] + gravityAccel[2] * gravityAccel[2]);
            const expectedGravity = mu / (r * r);
            console.log(`[UnifiedSatellitePropagator] Gravity check:`, {
                calculatedMag: gravityMag,
                expectedMag: expectedGravity,
                position: [x, y, z],
                r,
                mu,
                centralBodyId: satellite.centralBodyNaifId
            });
        }

        const totalAccel = [...gravityAccel];
        const components = { primary: gravityAccel };

        // === 2. J2 PERTURBATION ===
        if (includeJ2 && centralBody.J2) {
            const j2Accel = this._computeJ2Perturbation([x, y, z], centralBody);
            components.j2 = j2Accel.map(a => a * perturbationScale);
            totalAccel[0] += components.j2[0];
            totalAccel[1] += components.j2[1];
            totalAccel[2] += components.j2[2];
        } else {
            components.j2 = [0, 0, 0];
        }

        // === 3. ATMOSPHERIC DRAG ===
        if (includeDrag) {
            const dragAccel = this._computeAtmosphericDrag(satellite, centralBody);
            components.drag = dragAccel.map(a => a * perturbationScale);
            totalAccel[0] += components.drag[0];
            totalAccel[1] += components.drag[1];
            totalAccel[2] += components.drag[2];
        } else {
            components.drag = [0, 0, 0];
        }

        // === 4. THIRD-BODY PERTURBATIONS ===
        if (includeThirdBody) {
            const thirdBodyResult = this._computeThirdBodyPerturbationsDetailed(satellite, centralBody, bodies);
            components.thirdBody = thirdBodyResult.total.map(a => a * perturbationScale);
            components.thirdBodyIndividual = thirdBodyResult.individualDirect; // Use direct acceleration for visualization
            components.thirdBodyDirect = thirdBodyResult.individualDirect;
            totalAccel[0] += components.thirdBody[0];
            totalAccel[1] += components.thirdBody[1];
            totalAccel[2] += components.thirdBody[2];
        } else {
            components.thirdBody = [0, 0, 0];
            components.thirdBodyIndividual = {};
            components.thirdBodyDirect = {};
        }

        // Validate final acceleration
        if (!totalAccel.every(v => isFinite(v))) {
            console.error(`[UnifiedSatellitePropagator] Non-finite acceleration computed:`, {
                totalAccel,
                components,
                satellite: {
                    position: satellite.position,
                    centralBodyNaifId: satellite.centralBodyNaifId
                },
                centralBody: centralBody ? { name: centralBody.name, GM: centralBody.GM } : null
            });
            return detailed ? { total: [0, 0, 0], components: {} } : [0, 0, 0];
        }

        if (debugLogging) {
            console.log(`[UnifiedSatellitePropagator] Acceleration components:`, {
                primary: components.primary,
                j2: components.j2,
                drag: components.drag,
                thirdBody: components.thirdBody,
                total: totalAccel
            });
        }

        // Transform components to satellite local reference frame for visualization
        if (detailed) {
            const satelliteVelocity = Array.isArray(satellite.velocity) ? satellite.velocity : [satellite.velocity.x, satellite.velocity.y, satellite.velocity.z];
            const satellitePosition = [x, y, z];

            // Create local reference frame components for better vector visualization
            components.primaryLocal = this._transformToLocalFrame(components.primary, satellitePosition, satelliteVelocity);
            components.j2Local = this._transformToLocalFrame(components.j2, satellitePosition, satelliteVelocity);
            components.dragLocal = this._transformToLocalFrame(components.drag, satellitePosition, satelliteVelocity);
            components.thirdBodyLocal = this._transformToLocalFrame(components.thirdBody, satellitePosition, satelliteVelocity);
            components.totalLocal = this._transformToLocalFrame(totalAccel, satellitePosition, satelliteVelocity);

            // Transform individual third-body accelerations to local frame
            components.thirdBodyIndividualLocal = {};
            components.thirdBodyDirectLocal = {};

            for (const [bodyId, accel] of Object.entries(components.thirdBodyIndividual || {})) {
                components.thirdBodyIndividualLocal[bodyId] = this._transformToLocalFrame(accel, satellitePosition, satelliteVelocity);
            }

            for (const [bodyId, accel] of Object.entries(components.thirdBodyDirect || {})) {
                components.thirdBodyDirectLocal[bodyId] = this._transformToLocalFrame(accel, satellitePosition, satelliteVelocity);
            }
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
        const r2 = [x + 0.5 * dt * k1r[0], y + 0.5 * dt * k1r[1], z + 0.5 * dt * k1r[2]];
        const v2 = [vx + 0.5 * dt * k1v[0], vy + 0.5 * dt * k1v[1], vz + 0.5 * dt * k1v[2]];
        const k2v = accelerationFunc(r2, v2);
        const k2r = v2;

        // k3
        const r3 = [x + 0.5 * dt * k2r[0], y + 0.5 * dt * k2r[1], z + 0.5 * dt * k2r[2]];
        const v3 = [vx + 0.5 * dt * k2v[0], vy + 0.5 * dt * k2v[1], vz + 0.5 * dt * k2v[2]];
        const k3v = accelerationFunc(r3, v3);
        const k3r = v3;

        // k4
        const r4 = [x + dt * k3r[0], y + dt * k3r[1], z + dt * k3r[2]];
        const v4 = [vx + dt * k3v[0], vy + dt * k3v[1], vz + dt * k3v[2]];
        const k4v = accelerationFunc(r4, v4);
        const k4r = v4;

        // Final step
        const newPosition = [
            x + (dt / 6) * (k1r[0] + 2 * k2r[0] + 2 * k3r[0] + k4r[0]),
            y + (dt / 6) * (k1r[1] + 2 * k2r[1] + 2 * k3r[1] + k4r[1]),
            z + (dt / 6) * (k1r[2] + 2 * k2r[2] + 2 * k3r[2] + k4r[2])
        ];

        const newVelocity = [
            vx + (dt / 6) * (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]),
            vy + (dt / 6) * (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1]),
            vz + (dt / 6) * (k1v[2] + 2 * k2v[2] + 2 * k3v[2] + k4v[2])
        ];

        return {
            position: newPosition,
            velocity: newVelocity
        };
    }

    /**
     * MASTER orbit propagation - used by ALL systems
     * @param {Object} params - Propagation parameters
     * @returns {Promise<Array>} - Array of orbit points
     */
    static async propagateOrbit(params) {
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
        let position = Array.isArray(satellite.position) ? [...satellite.position] : [satellite.position.x, satellite.position.y, satellite.position.z];
        let velocity = Array.isArray(satellite.velocity) ? [...satellite.velocity] : [satellite.velocity.x, satellite.velocity.y, satellite.velocity.z];
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
            const baseTime = startTime * 1000; // startTime is already in seconds since epoch, convert to ms
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

        // Integrate using unified integrator with async yielding
        const batchSize = 100; // Process 100 steps at a time before yielding
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

            // Yield control every batchSize steps to prevent blocking
            if (i > 0 && i % batchSize === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        return points;
    }

    /**
     * Apply maneuver delta-V in local coordinates to world coordinates
     * @private
     */
    static _applyManeuverDeltaV(position, velocity, deltaVLocal) {
        // Convert local delta-V (prograde, normal, radial) to world coordinates
        const pos = [...position];
        const vel = [...velocity];

        // Calculate local coordinate frame
        const radialDir = [pos[0] / Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]),
        pos[1] / Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]),
        pos[2] / Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])];
        const velocityDir = [vel[0] / Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2]),
        vel[1] / Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2]),
        vel[2] / Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])];
        const normalDir = [radialDir[1] * velocityDir[2] - radialDir[2] * velocityDir[1],
        radialDir[2] * velocityDir[0] - radialDir[0] * velocityDir[2],
        radialDir[0] * velocityDir[1] - radialDir[1] * velocityDir[0]];

        // In case of zero velocity, use a different normal calculation
        if (vel[0] < 1e-6 && vel[1] < 1e-6 && vel[2] < 1e-6) {
            // Use z-axis cross product for normal if velocity is near zero
            const zAxis = [0, 0, 1];
            normalDir[0] = radialDir[1] * zAxis[2] - radialDir[2] * zAxis[1];
            normalDir[1] = radialDir[2] * zAxis[0] - radialDir[0] * zAxis[2];
            normalDir[2] = radialDir[0] * zAxis[1] - radialDir[1] * zAxis[0];
        }

        // Build world delta-V from local components
        const worldDeltaV = [
            velocityDir[0] * (deltaVLocal.prograde || 0) + normalDir[0] * (deltaVLocal.normal || 0) + radialDir[0] * (deltaVLocal.radial || 0),
            velocityDir[1] * (deltaVLocal.prograde || 0) + normalDir[1] * (deltaVLocal.normal || 0) + radialDir[1] * (deltaVLocal.radial || 0),
            velocityDir[2] * (deltaVLocal.prograde || 0) + normalDir[2] * (deltaVLocal.normal || 0) + radialDir[2] * (deltaVLocal.radial || 0)
        ];

        return worldDeltaV;
    }

    /**
     * Check orbital energy conservation (for validation)
     */
    static checkEnergyConservation(satellite, centralBody) {
        const [x, y, z] = satellite.position;
        const [vx, vy, vz] = satellite.velocity;

        const r = Math.sqrt(x * x + y * y + z * z);
        const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
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
        const r = Math.sqrt(x * x + y * y + z * z);
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
     * Compute third-body perturbations with detailed breakdown
     * @private
     */
    static _computeThirdBodyPerturbationsDetailed(satellite, centralBody, bodies) {
        const totalAccel = [0, 0, 0];
        const individual = {};
        const individualDirect = {}; // Direct gravitational acceleration (for intuitive vectors)

        // COORDINATE FRAME FIX: Keep calculations in planet-centric frame
        // The satellite position is already in planet-centric coordinates
        const satPos = Array.isArray(satellite.position) ? satellite.position : [satellite.position.x, satellite.position.y, satellite.position.z];

        // Get central body position in SSB coordinates for proper third-body calculations
        const centralBodySSBPos = this._transformToSSBCoordinates([0, 0, 0], centralBody, bodies);

        // Transform satellite to SSB coordinates for distance calculations only
        const satGlobalPos = this._transformToSSBCoordinates(satPos, centralBody, bodies);

        // Debug coordinate transformation for Earth satellites
        if (centralBody.naifId === 399 && Math.random() < 0.01) { // 1% sampling to avoid spam
            console.log(`[UnifiedSatellitePropagator] Earth satellite coordinate transform:`, {
                satelliteLocalPos: satPos.map(v => v.toFixed(1)),
                satelliteSSBPos: satGlobalPos.map(v => v.toFixed(1)),
                earthSSBPos: centralBodySSBPos.map(v => v.toFixed(1)),
                earthPos: centralBody.position?.map?.(v => v.toFixed(1)) || 'N/A'
            });
        }

        for (const [bodyId, body] of Object.entries(bodies)) {
            // CRITICAL FIX: Skip central body, barycenters, and non-physical bodies
            // Comprehensive barycenter detection:
            // 1. Check type field
            // 2. Check mass field 
            // 3. Check NAIF ID patterns (0-9 are typically barycenters, 10 is Sun)
            const naifId = parseInt(bodyId);
            const isBarycenter = body.type === 'barycenter' ||
                body.mass === 0 ||
                (naifId >= 0 && naifId <= 9 && naifId !== 10); // 0=SSB, 1-9=planet barycenters, 10=Sun

            if (bodyId == satellite.centralBodyNaifId ||
                !body.GM ||
                !body.position ||
                body.GM <= 0 ||
                isBarycenter) {  // EXCLUDE BARYCENTERS from acceleration calculations
                continue;
            }

            const bodyPos = Array.isArray(body.position) ? body.position : body.position.toArray();
            const mu = body.GM;

            // Distance vectors in SSB coordinates for proper physics
            const dx_sat = bodyPos[0] - satGlobalPos[0];
            const dy_sat = bodyPos[1] - satGlobalPos[1];
            const dz_sat = bodyPos[2] - satGlobalPos[2];
            const r_sat = Math.sqrt(dx_sat * dx_sat + dy_sat * dy_sat + dz_sat * dz_sat);

            const dx_central = bodyPos[0] - centralBodySSBPos[0];
            const dy_central = bodyPos[1] - centralBodySSBPos[1];
            const dz_central = bodyPos[2] - centralBodySSBPos[2];
            const r_central = Math.sqrt(dx_central * dx_central + dy_central * dy_central + dz_central * dz_central);

            if (r_sat === 0 || r_central === 0) continue;

            // Third-body perturbation (tidal effect) - compute in SSB frame
            const r_sat3 = r_sat * r_sat * r_sat;
            const r_central3 = r_central * r_central * r_central;

            // Compute tidal acceleration in SSB frame
            const accel_ssb = [
                mu * (dx_sat / r_sat3 - dx_central / r_central3),
                mu * (dy_sat / r_sat3 - dy_central / r_central3),
                mu * (dz_sat / r_sat3 - dz_central / r_central3)
            ];

            // COORDINATE FRAME FIX: For acceleration vectors, we can use SSB frame directly
            // since accelerations are vector quantities that don't depend on origin
            // But for visualization, we want vectors relative to satellite in planet-centric frame

            // For third-body perturbations (physics-accurate), use SSB calculation
            const accel = accel_ssb;

            // For direct acceleration visualization, compute in planet-centric frame
            // Vector from satellite to body (in planet-centric coordinates)
            const bodyPosPlanetCentric = [
                bodyPos[0] - centralBodySSBPos[0], // Body position relative to central body
                bodyPos[1] - centralBodySSBPos[1],
                bodyPos[2] - centralBodySSBPos[2]
            ];

            // Vector from satellite to body
            const satelliteToBody = [
                bodyPosPlanetCentric[0] - satPos[0],
                bodyPosPlanetCentric[1] - satPos[1],
                bodyPosPlanetCentric[2] - satPos[2]
            ];

            const r_body_sat = Math.sqrt(
                satelliteToBody[0] * satelliteToBody[0] +
                satelliteToBody[1] * satelliteToBody[1] +
                satelliteToBody[2] * satelliteToBody[2]
            );

            if (r_body_sat === 0) continue;

            const r_body_sat3 = r_body_sat * r_body_sat * r_body_sat;

            // Direct acceleration pointing toward the body
            const directAccel = [
                mu * satelliteToBody[0] / r_body_sat3,
                mu * satelliteToBody[1] / r_body_sat3,
                mu * satelliteToBody[2] / r_body_sat3
            ];

            individual[bodyId] = accel;
            individualDirect[bodyId] = directAccel;

            totalAccel[0] += accel[0];
            totalAccel[1] += accel[1];
            totalAccel[2] += accel[2];
        }

        return { total: totalAccel, individual, individualDirect };
    }

    /**
     * Transform satellite position to SSB coordinates, handling coordinate system hierarchy
     * @private
     */
    static _transformToSSBCoordinates(satellitePosition, centralBody, bodies) {
        // Start with satellite position relative to central body
        let ssbPosition = [
            satellitePosition[0],
            satellitePosition[1],
            satellitePosition[2]
        ];

        // Walk up the hierarchy to SSB
        let currentBody = centralBody;
        const visitedBodies = new Set(); // Prevent infinite loops

        while (currentBody && !visitedBodies.has(currentBody.naifId)) {
            visitedBodies.add(currentBody.naifId);

            // Add current body's position to get position relative to its parent
            if (currentBody.position) {
                const bodyPos = Array.isArray(currentBody.position) ? currentBody.position : currentBody.position.toArray();
                ssbPosition[0] += bodyPos[0];
                ssbPosition[1] += bodyPos[1];
                ssbPosition[2] += bodyPos[2];
            }

            // Stop if we've reached SSB (naifId 0) or Sun (naifId 10)
            if (currentBody.naifId === 0 || currentBody.naifId === 10) {
                break;
            }

            // Find parent body
            // For Earth (399), parent should be EMB (3)
            // For EMB (3), parent should be SSB (0)
            let parentId = null;

            // Earth-Moon system special case
            if (currentBody.naifId === 399) { // Earth
                parentId = 3; // EMB
            } else if (currentBody.naifId === 301) { // Moon
                parentId = 3; // EMB
            } else if (currentBody.naifId === 3) { // EMB
                parentId = 0; // SSB
            } else {
                // For other bodies, try to find parent barycenter
                // Most planets orbit their system barycenter which orbits SSB
                const bodyName = currentBody.name?.toLowerCase();
                if (bodyName?.includes('mercury')) parentId = 1;
                else if (bodyName?.includes('venus')) parentId = 2;
                else if (bodyName?.includes('mars')) parentId = 4;
                else if (bodyName?.includes('jupiter')) parentId = 5;
                else if (bodyName?.includes('saturn')) parentId = 6;
                else if (bodyName?.includes('uranus')) parentId = 7;
                else if (bodyName?.includes('neptune')) parentId = 8;
                else if (bodyName?.includes('pluto')) parentId = 9;
                else parentId = 0; // Default to SSB
            }

            // Move to parent body
            currentBody = parentId !== null ? bodies[parentId] : null;
        }

        return ssbPosition;
    }

    /**
     * Compute atmospheric drag acceleration
     * @private
     */
    static _computeAtmosphericDrag(satellite, centralBody) {
        if (!centralBody.atmosphericModel && !centralBody.atmosphere) {
            return [0, 0, 0];
        }

        const ballisticCoeff = this._getBallisticCoefficient(satellite, centralBody);
        const satPos = Array.isArray(satellite.position) ? satellite.position : [satellite.position.x, satellite.position.y, satellite.position.z];
        const satVel = Array.isArray(satellite.velocity) ? satellite.velocity : [satellite.velocity.x, satellite.velocity.y, satellite.velocity.z];

        try {
            return AtmosphericModels.computeDragAcceleration(
                satPos,
                satVel,
                centralBody,
                ballisticCoeff
            );
        } catch (error) {
            console.warn(`[UnifiedSatellitePropagator] Atmospheric drag calculation failed:`, error);
            return [0, 0, 0];
        }
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
            relTol = 1e-6
        } = options;

        // Determine which integrator to use
        let useMethod = method;
        if (method === 'auto') {
            // Use RK45 for high precision when time warp is high or large time steps
            // Use RK4 for normal operations
            useMethod = (timeWarp >= 100 || dt > 60) ? 'rk45' : 'rk4';
        }

        // Call appropriate integration method
        switch (useMethod) {
            case 'rk45':
                return this.integrateRK45(position, velocity, accelerationFunc, dt, { absTol, relTol });
            case 'rk4':
            default:
                return this.integrateRK4(position, velocity, accelerationFunc, dt);
        }
    }

    /**
     * Self-contained Runge-Kutta 4/5 (Dormand-Prince) integration with error control
     * @param {Array} position - [x, y, z] in km
     * @param {Array} velocity - [vx, vy, vz] in km/s
     * @param {Function} accelerationFunc - (pos, vel) => [ax, ay, az]
     * @param {number} targetTime - Target integration time in seconds
     * @param {Object} options - Integration options
     * @returns {Object} - {position: [x,y,z], velocity: [vx,vy,vz]}
     */
    static integrateRK45(position, velocity, accelerationFunc, targetTime, options = {}) {
        const {
            absTol = 1e-6,
            relTol = 1e-6,
            minStep = 1e-6,
            maxStep = 60
        } = options;

        let t = 0;
        let dt = Math.min(maxStep, targetTime * 0.1);

        // Current state
        let pos = [...position];
        let vel = [...velocity];

        // RK45 Dormand-Prince coefficients
        const a = [
            [],
            [1 / 4],
            [3 / 32, 9 / 32],
            [1932 / 2197, -7200 / 2197, 7296 / 2197],
            [439 / 216, -8, 3680 / 513, -845 / 4104],
            [-8 / 27, 2, -3544 / 2565, 1859 / 4104, -11 / 40]
        ];
        const b = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84];
        const b_star = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

        while (t < targetTime && dt > minStep) {
            // Don't overshoot target time
            if (t + dt > targetTime) {
                dt = targetTime - t;
            }

            // Compute RK stages
            const k = [];

            // k1
            const acc1 = accelerationFunc(pos, vel);
            k[0] = { pos: [...vel], vel: [...acc1] };

            // k2
            const pos2 = pos.map((p, i) => p + dt * a[1][0] * k[0].pos[i]);
            const vel2 = vel.map((v, i) => v + dt * a[1][0] * k[0].vel[i]);
            const acc2 = accelerationFunc(pos2, vel2);
            k[1] = { pos: [...vel2], vel: [...acc2] };

            // k3
            const pos3 = pos.map((p, i) => p + dt * (a[2][0] * k[0].pos[i] + a[2][1] * k[1].pos[i]));
            const vel3 = vel.map((v, i) => v + dt * (a[2][0] * k[0].vel[i] + a[2][1] * k[1].vel[i]));
            const acc3 = accelerationFunc(pos3, vel3);
            k[2] = { pos: [...vel3], vel: [...acc3] };

            // k4
            const pos4 = pos.map((p, i) => p + dt * (a[3][0] * k[0].pos[i] + a[3][1] * k[1].pos[i] + a[3][2] * k[2].pos[i]));
            const vel4 = vel.map((v, i) => v + dt * (a[3][0] * k[0].vel[i] + a[3][1] * k[1].vel[i] + a[3][2] * k[2].vel[i]));
            const acc4 = accelerationFunc(pos4, vel4);
            k[3] = { pos: [...vel4], vel: [...acc4] };

            // k5
            const pos5 = pos.map((p, i) => p + dt * (a[4][0] * k[0].pos[i] + a[4][1] * k[1].pos[i] + a[4][2] * k[2].pos[i] + a[4][3] * k[3].pos[i]));
            const vel5 = vel.map((v, i) => v + dt * (a[4][0] * k[0].vel[i] + a[4][1] * k[1].vel[i] + a[4][2] * k[2].vel[i] + a[4][3] * k[3].vel[i]));
            const acc5 = accelerationFunc(pos5, vel5);
            k[4] = { pos: [...vel5], vel: [...acc5] };

            // k6
            const pos6 = pos.map((p, i) => p + dt * (a[5][0] * k[0].pos[i] + a[5][1] * k[1].pos[i] + a[5][2] * k[2].pos[i] + a[5][3] * k[3].pos[i] + a[5][4] * k[4].pos[i]));
            const vel6 = vel.map((v, i) => v + dt * (a[5][0] * k[0].vel[i] + a[5][1] * k[1].vel[i] + a[5][2] * k[2].vel[i] + a[5][3] * k[3].vel[i] + a[5][4] * k[4].vel[i]));
            const acc6 = accelerationFunc(pos6, vel6);
            k[5] = { pos: [...vel6], vel: [...acc6] };

            // 5th order solution
            const newPos = pos.map((p, i) => p + dt * (b[0] * k[0].pos[i] + b[1] * k[1].pos[i] + b[2] * k[2].pos[i] + b[3] * k[3].pos[i] + b[4] * k[4].pos[i] + b[5] * k[5].pos[i]));
            const newVel = vel.map((v, i) => v + dt * (b[0] * k[0].vel[i] + b[1] * k[1].vel[i] + b[2] * k[2].vel[i] + b[3] * k[3].vel[i] + b[4] * k[4].vel[i] + b[5] * k[5].vel[i]));

            // 4th order solution for error estimation
            const newPos4 = pos.map((p, i) => p + dt * (b_star[0] * k[0].pos[i] + b_star[1] * k[1].pos[i] + b_star[2] * k[2].pos[i] + b_star[3] * k[3].pos[i] + b_star[4] * k[4].pos[i] + b_star[5] * k[5].pos[i]));
            const newVel4 = vel.map((v, i) => v + dt * (b_star[0] * k[0].vel[i] + b_star[1] * k[1].vel[i] + b_star[2] * k[2].vel[i] + b_star[3] * k[3].vel[i] + b_star[4] * k[4].vel[i] + b_star[5] * k[5].vel[i]));

            // Error estimation
            const posError = Math.sqrt(newPos.reduce((sum, p, i) => sum + Math.pow(p - newPos4[i], 2), 0));
            const velError = Math.sqrt(newVel.reduce((sum, v, i) => sum + Math.pow(v - newVel4[i], 2), 0));
            const error = Math.max(posError, velError);

            // Error tolerance
            const posTol = Math.max(absTol, relTol * Math.sqrt(newPos.reduce((sum, p) => sum + p * p, 0)));
            const velTol = Math.max(absTol, relTol * Math.sqrt(newVel.reduce((sum, v) => sum + v * v, 0)));
            const tolerance = Math.max(posTol, velTol);

            if (error <= tolerance || dt <= minStep) {
                // Accept step
                pos = newPos;
                vel = newVel;
                t += dt;

                // Adapt step size for next iteration
                if (error > 0) {
                    const factor = 0.9 * Math.pow(tolerance / error, 0.2);
                    dt = Math.min(maxStep, Math.max(minStep, dt * Math.min(2.0, Math.max(0.5, factor))));
                }
            } else {
                // Reject step and reduce step size
                const factor = 0.9 * Math.pow(tolerance / error, 0.25);
                dt = Math.max(minStep, dt * Math.max(0.1, factor));
            }
        }

        return { position: pos, velocity: vel };
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
     * Transform acceleration components to satellite local reference frame for visualization
     * @private
     */
    static _transformToLocalFrame(accel, satellitePosition, satelliteVelocity) {
        const [x, y, z] = satellitePosition;
        const [vx, vy, vz] = satelliteVelocity;

        // Calculate local coordinate frame unit vectors
        const r = Math.sqrt(x * x + y * y + z * z);
        const v = Math.sqrt(vx * vx + vy * vy + vz * vz);

        // Handle zero velocity case
        if (v < 1e-10) {
            return [0, 0, 0]; // No meaningful local frame without velocity
        }

        // Radial unit vector (outward from central body)
        const radialDir = [x / r, y / r, z / r];

        // Along-track unit vector (direction of velocity, prograde)
        const alongTrackDir = [vx / v, vy / v, vz / v];

        // Cross-track unit vector (normal to orbital plane, r × v direction)
        const crossTrackDir = [
            radialDir[1] * alongTrackDir[2] - radialDir[2] * alongTrackDir[1],
            radialDir[2] * alongTrackDir[0] - radialDir[0] * alongTrackDir[2],
            radialDir[0] * alongTrackDir[1] - radialDir[1] * alongTrackDir[0]
        ];

        // Normalize cross-track (it should be normalized already, but ensure)
        const crossTrackMag = Math.sqrt(crossTrackDir[0] * crossTrackDir[0] + crossTrackDir[1] * crossTrackDir[1] + crossTrackDir[2] * crossTrackDir[2]);
        if (crossTrackMag > 1e-10) {
            crossTrackDir[0] /= crossTrackMag;
            crossTrackDir[1] /= crossTrackMag;
            crossTrackDir[2] /= crossTrackMag;
        }

        // Project acceleration onto local frame axes
        const radialComponent = accel[0] * radialDir[0] + accel[1] * radialDir[1] + accel[2] * radialDir[2];
        const alongTrackComponent = accel[0] * alongTrackDir[0] + accel[1] * alongTrackDir[1] + accel[2] * alongTrackDir[2];
        const crossTrackComponent = accel[0] * crossTrackDir[0] + accel[1] * crossTrackDir[1] + accel[2] * crossTrackDir[2];

        // Return components in local frame: [radial, along-track, cross-track]
        return [radialComponent, alongTrackComponent, crossTrackComponent];
    }
}