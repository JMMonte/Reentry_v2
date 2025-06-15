import { PhysicsConstants } from '../core/PhysicsConstants.js';
import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { OrbitalMechanics } from '../core/OrbitalMechanics.js';
import { CoordinateTransforms } from '../utils/CoordinateTransforms.js';
import { GeodeticUtils } from '../utils/GeodeticUtils.js';
import { OrbitalElementsConverter } from '../utils/OrbitalElementsConverter.js';
import { MathUtils } from '../utils/MathUtils.js';
import { PhysicsVector3 } from '../utils/PhysicsVector3.js';
import { PropagationMetrics } from '../utils/PropagationMetrics.js';
import { SatelliteWorkerPool } from '../workers/SatelliteWorkerPool.js';
import { SOITransitionManager } from '../utils/SOITransitionManager.js';
import { integrateRK4, getIntegrator } from '../integrators/OrbitalIntegrators.js';

/**
 * SatelliteEngine - Focused satellite simulation and management
 * 
 * Extracted from PhysicsEngine to improve maintainability and separation of concerns.
 * Handles all satellite-related operations: creation, simulation, state management.
 */
export class SatelliteEngine {
    constructor(physicsEngine = null) {
        // Store reference to parent PhysicsEngine for API access
        this.physicsEngineRef = physicsEngine;
        this.physicsAPI = null; // Will be set later by PhysicsEngine

        // Satellite storage
        this.satellites = new Map();

        // Maneuver node tracking
        this.maneuverNodes = new Map(); // Map<satelliteId, ManeuverNodeDTO[]>

        // Performance optimization caches with size limits
        this._satelliteInfluenceCache = new Map(); // Cache significant bodies per satellite
        this._lastCacheUpdate = 0;
        this._cacheValidityPeriod = 5000; // 5 seconds
        this._maxCacheSize = 100; // Maximum entries per cache
        this._cacheCleanupThreshold = 150; // Clean up when size exceeds this

        // Pre-allocated vectors for calculations to avoid GC pressure
        this._tempVectors = {
            satGlobalPos: new PhysicsVector3(),
            bodyDistance: new PhysicsVector3(),
            acceleration: new PhysicsVector3(),
            position: new PhysicsVector3(),
            velocity: new PhysicsVector3()
        };

        // Configuration settings
        this._integrationMethod = 'auto'; // 'auto', 'rk4', or 'rk45'
        this._physicsTimeStep = 0.05;
        this._sensitivityScale = 1.0;
        this._perturbationScale = 1.0;

        // Worker pool for parallel processing
        this._useWorkers = true; // Enable workers for parallel processing
        this._workerPool = null;
        this._workerPoolInitialized = false;
        this._workerPoolInitializing = false;

        // SOI transition manager (will be initialized when hierarchy is available)
        this._soiTransitionManager = null;

        // Working vectors for maneuver execution
        this._maneuverWorkVectors = {
            localDV: new PhysicsVector3(),
            velDir: new PhysicsVector3(),
            radialDir: new PhysicsVector3(),
            normalDir: new PhysicsVector3(),
            worldDeltaV: new PhysicsVector3()
        };
    }

    // ================================================================
    // PUBLIC API - Core Satellite Management
    // ================================================================

    /**
     * Add satellite (planet-centric version)
     * @param {Object} satellite - Must include centralBodyNaifId (the NAIF ID of the central body)
     */
    addSatellite(satellite, bodies = null, simulationTime = null, _findAppropriateSOI = null) { // eslint-disable-line no-unused-vars
        if (!satellite.centralBodyNaifId) {
            throw new Error('Satellite must specify centralBodyNaifId (NAIF ID of central body)');
        }

        const id = String(satellite.id || Date.now());

        // Initialize performance metrics tracking for this satellite
        PropagationMetrics.initializeSatellite(id);

        // Debug: Check velocity magnitude before storing
        const velArray = Array.isArray(satellite.velocity) ? satellite.velocity :
            (satellite.velocity.toArray ? satellite.velocity.toArray() : [0, 0, 0]);
        const velMag = MathUtils.magnitude3D(velArray[0], velArray[1], velArray[2]);

        if (velMag > PhysicsConstants.VELOCITY_LIMITS.PLANETARY_MAX) {
            console.warn(`[SatelliteEngine] Extreme velocity on satellite creation: ${velMag.toFixed(3)} km/s`);
        }


        // Convert position to array if it's an object
        const posArray = Array.isArray(satellite.position) ? satellite.position :
            (satellite.position.toArray ? satellite.position.toArray() :
                [satellite.position.x, satellite.position.y, satellite.position.z]);

        const satData = {
            ...satellite,
            id,
            // All positions/velocities are planet-centric (relative to central body)
            position: PhysicsVector3.fromArray(posArray),
            velocity: PhysicsVector3.fromArray(velArray),
            acceleration: new PhysicsVector3(),
            mass: satellite.mass || PhysicsConstants.SATELLITE_DEFAULTS.MASS,
            size: satellite.size || PhysicsConstants.SATELLITE_DEFAULTS.RADIUS,
            dragCoefficient: satellite.dragCoefficient || PhysicsConstants.SATELLITE_DEFAULTS.DRAG_COEFFICIENT,
            crossSectionalArea: satellite.crossSectionalArea || PhysicsConstants.SATELLITE_DEFAULTS.CROSS_SECTIONAL_AREA,
            ballisticCoefficient: satellite.ballisticCoefficient, // kg/m² - optional
            lastUpdate: simulationTime || new Date(),
            centralBodyNaifId: satellite.centralBodyNaifId,
            // UI properties - store them here as single source of truth
            color: satellite.color !== undefined ? satellite.color : 0xffff00,
            name: satellite.name || `Satellite ${id}`,
            // Track velocity history for debugging
            velocityHistory: [{
                time: (simulationTime || new Date()).toISOString(),
                velocity: velMag,
                context: 'creation'
            }]
        };

        // SOI placement check moved to PhysicsEngine to maintain separation of concerns

        // Validate initial state
        this._validateSatelliteState(satData, "on creation", bodies);

        this.satellites.set(id, satData);

        // Communication subsystem addition handled by PhysicsEngine

        return id;
    }

    /**
     * Remove satellite
     */
    removeSatellite(id) {
        const strId = String(id);
        const satellite = this.satellites.get(strId);
        if (satellite) {
            // Subsystem removal handled by PhysicsEngine

            this.satellites.delete(strId);

            // Clear performance metrics for removed satellite
            PropagationMetrics.clearSatellite(strId);

            // Remove satellite from worker pool tracking
            if (this._workerPool) {
                this._workerPool.removeSatellite(strId);
            }

            // Shutdown worker pool if no satellites remain
            if (this.satellites.size === 0 && this._workerPool) {
                this._workerPool.shutdown();
                this._workerPool = null;
                this._workerPoolInitialized = false;
            }
        }
    }

    /**
     * Update satellite UI properties (color, name, etc)
     */
    updateSatelliteProperty(id, property, value) {
        const satellite = this.satellites.get(String(id));
        if (satellite) {
            satellite[property] = value;
        }
    }

    // ================================================================
    // PUBLIC API - Satellite Creation Methods
    // ================================================================

    /**
     * Create satellite from geographic coordinates
     * @param {Object} params - Geographic parameters (lat, lon, altitude, etc.)
     * @param {number} centralBodyNaifId - NAIF ID of the central body
     * @param {Object} bodies - Physics bodies for calculations
     * @param {Date} simulationTime - Current simulation time
     * @param {Function} getBodiesForOrbitPropagation - Function to get orbital propagation data
     * @param {Function} addSatelliteCallback - Optional callback to PhysicsEngine.addSatellite for subsystem management
     * @returns {Object} - { id, position, velocity } in planet-centric inertial coordinates
     */
    createSatelliteFromGeographic(params, centralBodyNaifId = 399, bodies, simulationTime, getBodiesForOrbitPropagation, addSatelliteCallback = null) {

        const centralBody = bodies[centralBodyNaifId];
        if (!centralBody) {
            throw new Error(`Central body with NAIF ID ${centralBodyNaifId} not found in physics engine`);
        }

        // Get the current authoritative body data from physics engine
        const physicsBodies = getBodiesForOrbitPropagation();
        const planetData = physicsBodies.find(b => b.naifId === centralBodyNaifId);

        if (!planetData) {
            throw new Error(`Planet data for NAIF ID ${centralBodyNaifId} not available for orbit propagation`);
        }

        // Use current simulation time for coordinate transformation
        const currentTime = simulationTime;

        // Use CoordinateTransforms with authoritative physics data
        const { position, velocity } = CoordinateTransforms.createFromLatLon(params, planetData, currentTime);

        // Create satellite object for physics engine
        const satelliteData = {
            ...params,
            position,
            velocity,
            centralBodyNaifId,
            mass: params.mass || PhysicsConstants.SATELLITE_DEFAULTS.MASS,
            size: params.size || PhysicsConstants.SATELLITE_DEFAULTS.RADIUS,
            crossSectionalArea: params.crossSectionalArea || PhysicsConstants.SATELLITE_DEFAULTS.CROSS_SECTIONAL_AREA,
            dragCoefficient: params.dragCoefficient || PhysicsConstants.SATELLITE_DEFAULTS.DRAG_COEFFICIENT,
            color: params.color || 0xffff00,
            name: params.name || `Satellite ${Date.now()}`,
            commsConfig: params.commsConfig // Pass through comms config
        };

        // Add to physics engine - use callback if provided to ensure subsystems are added
        const id = addSatelliteCallback ?
            addSatelliteCallback(satelliteData) :
            this.addSatellite(satelliteData, bodies, simulationTime, null);

        return {
            id,
            position,
            velocity,
            planetData // Return the planet data used for verification
        };
    }

    /**
     * Create satellite from orbital elements
     * @param {Object} params - Orbital element parameters
     * @param {number} centralBodyNaifId - NAIF ID of the central body
     * @param {Object} bodies - Physics bodies for calculations
     * @param {Function} getBodiesForOrbitPropagation - Function to get orbital propagation data
     * @param {Function} addSatelliteCallback - Optional callback to PhysicsEngine.addSatellite for subsystem management
     * @returns {Object} - { id, position, velocity } in planet-centric inertial coordinates
     */
    createSatelliteFromOrbitalElements(params, centralBodyNaifId = 399, bodies, getBodiesForOrbitPropagation, addSatelliteCallback = null) {
        const centralBody = bodies[centralBodyNaifId];
        if (!centralBody) {
            throw new Error(`Central body with NAIF ID ${centralBodyNaifId} not found in physics engine`);
        }

        // Get the current authoritative body data from physics engine
        const physicsBodies = getBodiesForOrbitPropagation();
        const planetData = physicsBodies.find(b => b.naifId === centralBodyNaifId);

        if (!planetData) {
            throw new Error(`Planet data for NAIF ID ${centralBodyNaifId} not available for orbit propagation`);
        }

        // Use CoordinateTransforms with authoritative physics data
        const { position, velocity } = CoordinateTransforms.createFromOrbitalElements(params, planetData);

        // Create satellite object for physics engine
        const satelliteData = {
            ...params,
            position,
            velocity,
            centralBodyNaifId,
            mass: params.mass || PhysicsConstants.SATELLITE_DEFAULTS.MASS,
            size: params.size || PhysicsConstants.SATELLITE_DEFAULTS.RADIUS,
            crossSectionalArea: params.crossSectionalArea || PhysicsConstants.SATELLITE_DEFAULTS.CROSS_SECTIONAL_AREA,
            dragCoefficient: params.dragCoefficient || PhysicsConstants.SATELLITE_DEFAULTS.DRAG_COEFFICIENT,
            color: params.color || 0xffff00,
            name: params.name || `Satellite ${Date.now()}`
        };

        // Add to physics engine - use callback if provided to ensure subsystems are added
        const id = addSatelliteCallback ?
            addSatelliteCallback(satelliteData) :
            this.addSatellite(satelliteData, bodies, null, null);

        return {
            id,
            position,
            velocity,
            planetData // Return the planet data used for verification
        };
    }

    // ================================================================
    // PUBLIC API - Simulation Integration
    // ================================================================

    /**
     * Integrate all satellites by one time step
     * Called by PhysicsEngine during step() operation
     * @param {number} deltaTime - Integration time step
     * @param {Object} bodies - Physics bodies for calculations
     * @param {Object} hierarchy - System hierarchy for SOI transitions
     * @param {Date} simulationTime - Current simulation time
     * @param {Object} subsystemManager - For satellite subsystems
     * @param {number} timeWarp - Current time warp factor
     */
    async integrateSatellites(deltaTime, bodies, hierarchy, simulationTime, _subsystemManager, timeWarp = 1) {
        // Clear caches periodically
        this._clearCacheIfNeeded();

        // Only initialize worker pool if we have satellites to process
        if (this._useWorkers && this.satellites.size > 0 && !this._workerPoolInitialized && !this._workerPoolInitializing) {
            this._workerPoolInitializing = true;
            try {
                await this._initializeWorkerPool();
            } catch (error) {
                console.error('[SatelliteEngine] Worker pool initialization failed:', error);
                this._useWorkers = false; // Disable workers on initialization failure
            } finally {
                this._workerPoolInitializing = false;
            }
        }

        // Use worker-based or main-thread processing based on configuration
        if (this._useWorkers && this._workerPoolInitialized && this._workerPool && this.satellites.size > 0) {
            await this._integrateSatellitesWithWorkers(deltaTime, bodies, hierarchy, simulationTime, timeWarp);
        } else {
            await this._integrateSatellitesMainThread(deltaTime, bodies, hierarchy, simulationTime, timeWarp);
        }
    }

    /**
     * Integrate satellites using worker pool (parallel processing)
     * @private
     */
    async _integrateSatellitesWithWorkers(deltaTime, bodies, hierarchy, simulationTime, timeWarp) {
        try {
            // Prepare satellite data for workers
            const satelliteDataArray = [];
            for (const [, satellite] of this.satellites) {
                // Check for maneuvers before sending to worker
                this._checkAndExecuteManeuvers(satellite, simulationTime);

                satelliteDataArray.push({
                    id: satellite.id,
                    position: satellite.position.toArray(),
                    velocity: satellite.velocity.toArray(),
                    acceleration: satellite.acceleration.toArray(),
                    mass: satellite.mass,
                    crossSectionalArea: satellite.crossSectionalArea,
                    dragCoefficient: satellite.dragCoefficient,
                    ballisticCoefficient: satellite.ballisticCoefficient,
                    centralBodyNaifId: satellite.centralBodyNaifId
                });
            }

            // Prepare physics data for workers
            const physicsData = {
                deltaTime,
                timeWarp,
                simulationTime: simulationTime.toISOString(),
                bodies: this._prepareBodiesForWorkers(bodies)
            };

            // Update worker physics state
            await this._workerPool.updateWorkersPhysicsState(physicsData);

            // Propagate all satellites in parallel
            const results = await this._workerPool.propagateMultipleSatellites(satelliteDataArray, physicsData);

            // Apply results back to satellites
            for (const result of results.successful) {
                const satellite = this.satellites.get(result.satelliteId);
                if (satellite) {
                    satellite.position.set(result.position[0], result.position[1], result.position[2]);
                    satellite.velocity.set(result.velocity[0], result.velocity[1], result.velocity[2]);
                    satellite.acceleration.set(result.acceleration[0], result.acceleration[1], result.acceleration[2]);
                    satellite.centralBodyNaifId = result.centralBodyNaifId;
                    satellite.lastUpdate = new Date(result.lastUpdate);

                    // Store force components for visualization
                    satellite.a_total = result.a_total;
                    satellite.a_gravity_total = result.a_gravity_total;
                    satellite.a_j2 = result.a_j2;
                    satellite.a_drag = result.a_drag;
                    satellite.a_bodies = result.a_bodies;
                    satellite.a_bodies_direct = result.a_bodies_direct;

                    // Handle SOI transitions in main thread (requires hierarchy)
                    this._handleSOITransitions(satellite, bodies, hierarchy);
                }
            }

            // Handle failed satellites with fallback to main thread
            if (results.failed.length > 0) {
                console.warn(`[SatelliteEngine] ${results.failed.length} satellites failed worker processing, using main thread fallback`);
                for (const failure of results.failed) {
                    const satellite = this.satellites.get(failure.satelliteId);
                    if (satellite) {
                        await this._integrateSingleSatelliteMainThread(satellite, deltaTime, bodies, hierarchy, simulationTime, timeWarp);
                    }
                }
            }

        } catch {
            await this._integrateSatellitesMainThread(deltaTime, bodies, hierarchy, simulationTime, timeWarp);
        }
    }

    /**
     * Integrate satellites on main thread (original implementation)
     * @private
     */
    async _integrateSatellitesMainThread(deltaTime, bodies, hierarchy, simulationTime, timeWarp) {
        for (const [, satellite] of this.satellites) {
            // Check for maneuvers before integration
            this._checkAndExecuteManeuvers(satellite, simulationTime);

            // Use UnifiedSatellitePropagator for consistent physics across all systems
            this._computeSatelliteAccelerationUnified(satellite, bodies);

            // Use unified integrator with automatic method selection
            const position = satellite.position.toArray();
            const velocity = satellite.velocity.toArray();

            // Create acceleration function
            const accelerationFunc = (pos, vel) => {
                const satState = {
                    ...satellite,
                    position: pos,
                    velocity: vel,
                    id: satellite.id,
                    centralBodyNaifId: satellite.centralBodyNaifId
                };
                const accel = UnifiedSatellitePropagator.computeAcceleration(satState, bodies, {
                    includeJ2: true,
                    includeDrag: true,
                    includeThirdBody: true,
                    perturbationScale: this._perturbationScale
                });
                return accel;
            };

            // Use optimized integrators from OrbitalIntegrators.js
            const startTime = performance.now();
            const integrator = getIntegrator(this._integrationMethod);
            const posVec = new PhysicsVector3(...position);
            const velVec = new PhysicsVector3(...velocity);

            let result;
            let integrationTime;

            try {
                // Primary integration attempt using optimized integrators
                if (this._integrationMethod === 'rk45' || this._integrationMethod === 'adaptive') {
                    result = integrator(
                        posVec,
                        velVec,
                        (p, v) => {
                            const accel = accelerationFunc(p.toArray(), v.toArray());
                            return new PhysicsVector3(...accel);
                        },
                        deltaTime * timeWarp,
                        {
                            absTol: 1e-6 / this._sensitivityScale,
                            relTol: 1e-6 / this._sensitivityScale,
                            sensitivityScale: this._sensitivityScale
                        }
                    );
                } else {
                    result = integrator(
                        posVec,
                        velVec,
                        (p, v) => {
                            const accel = accelerationFunc(p.toArray(), v.toArray());
                            return new PhysicsVector3(...accel);
                        },
                        deltaTime * timeWarp
                    );
                }

                integrationTime = performance.now() - startTime;

                // Validate integration result before applying
                if (!result.position.toArray().every(v => isFinite(v)) || !result.velocity.toArray().every(v => isFinite(v))) {
                    throw new Error('Integration produced non-finite values');
                }

                // Track successful integration
                PropagationMetrics.trackIntegrationStep(satellite.id, integrationTime, this._integrationMethod, true);

                // Convert result back to arrays for consistency
                result = {
                    position: result.position.toArray(),
                    velocity: result.velocity.toArray()
                };

            } catch (error) {
                integrationTime = performance.now() - startTime;
                console.error(`[SatelliteEngine] Integration failed for satellite ${satellite.id}:`, {
                    error: error.message,
                    inputPosition: position,
                    inputVelocity: velocity,
                    deltaTime,
                    timeWarp,
                    integrationMethod: this._integrationMethod
                });

                // Try recovery with smaller timestep and RK4
                console.warn(`[SatelliteEngine] Attempting recovery for satellite ${satellite.id} with smaller timestep`);
                try {
                    const recoveryResult = integrateRK4(
                        posVec,
                        velVec,
                        (p, v) => {
                            const accel = accelerationFunc(p.toArray(), v.toArray());
                            return new PhysicsVector3(...accel);
                        },
                        deltaTime * 0.1 // 10x smaller timestep, no time warp
                    );

                    if (recoveryResult.position.toArray().every(v => isFinite(v)) && 
                        recoveryResult.velocity.toArray().every(v => isFinite(v))) {
                        
                        result = {
                            position: recoveryResult.position.toArray(),
                            velocity: recoveryResult.velocity.toArray()
                        };

                        // Track successful recovery
                        PropagationMetrics.trackRecovery(satellite.id, 'integration', true);
                        PropagationMetrics.trackIntegrationStep(satellite.id, integrationTime, 'rk4', true);
                    } else {
                        console.error(`[SatelliteEngine] Recovery failed for satellite ${satellite.id}, skipping integration step`);

                        // Track failed recovery
                        PropagationMetrics.trackRecovery(satellite.id, 'integration', false);
                        PropagationMetrics.trackIntegrationStep(satellite.id, integrationTime, this._integrationMethod, false);
                        continue; // Skip this satellite for this step
                    }
                } catch (recoveryError) {
                    console.error(`[SatelliteEngine] Recovery attempt failed for satellite ${satellite.id}:`, recoveryError);

                    // Track failed recovery attempt
                    PropagationMetrics.trackRecovery(satellite.id, 'integration', false);
                    PropagationMetrics.trackIntegrationStep(satellite.id, integrationTime, this._integrationMethod, false);
                    continue; // Skip this satellite for this step
                }
            }

            // Update satellite state
            satellite.position.set(result.position[0], result.position[1], result.position[2]);
            satellite.velocity.set(result.velocity[0], result.velocity[1], result.velocity[2]);
            satellite.lastUpdate = new Date(simulationTime.getTime());

            // SOI transition logic
            this._handleSOITransitions(satellite, bodies, hierarchy);
        }
    }

    /**
     * Get satellite states for external consumers
     * @param {Object} bodies - Physics bodies for calculations (optional)
     * @param {Date} simulationTime - Current simulation time (optional)
     * @param {Function} getBodiesForOrbitPropagation - Function to get orbital propagation data (optional)
     */
    getSatelliteStates(bodies = null, simulationTime = null, getBodiesForOrbitPropagation = null) {
        const states = {};

        // Get authoritative physics bodies data (same as satellite creation)
        let physicsBodies = null;
        if (getBodiesForOrbitPropagation) {
            try {
                physicsBodies = getBodiesForOrbitPropagation();
            } catch (error) {
                console.warn('[SatelliteEngine] Failed to get physics bodies for orbit propagation:', error);
            }
        }

        for (const [id, satellite] of this.satellites) {
            // Get central body for this satellite - use physics bodies first for consistency
            let centralBody = null;
            if (physicsBodies) {
                centralBody = physicsBodies.find(b => b.naifId === satellite.centralBodyNaifId);
            }
            // Fallback to legacy bodies if physics bodies not available
            if (!centralBody && bodies) {
                centralBody = bodies[satellite.centralBodyNaifId];
            }

            let orbitalElements = null;
            let equatorialElements = null;
            let lat = undefined;
            let lon = undefined;
            let ground_velocity = undefined;
            let ground_track_velocity = undefined;
            let escape_velocity = undefined;

            if (centralBody && centralBody.radius !== undefined) {
                // Calculate orbital elements in ecliptic frame (default)
                orbitalElements = OrbitalMechanics.calculateOrbitalElements(
                    satellite.position,
                    satellite.velocity,
                    centralBody,
                    centralBody.radius
                );

                // Also calculate in equatorial frame if planet has orientation data
                if (centralBody.tilt !== undefined || centralBody.obliquity !== undefined || centralBody.orientationGroup) {
                    try {
                        equatorialElements = OrbitalElementsConverter.calculateOrbitalElements(
                            satellite.position,
                            satellite.velocity,
                            centralBody,
                            'equatorial'
                        );
                    } catch (e) {
                        console.warn('[SatelliteEngine] Failed to calculate equatorial elements:', e);
                    }
                }

                // Calculate escape velocity at current position
                const altitude_radial = satellite.position.length();
                if (centralBody.GM) {
                    escape_velocity = Math.sqrt(2 * centralBody.GM / altitude_radial);
                }

                // Calculate lat/lon using coordinate transformation
                try {
                    // Transform from planet-centered inertial to planet-fixed frame
                    const transformed = CoordinateTransforms.transformCoordinates(
                        satellite.position.toArray(),
                        satellite.velocity.toArray(),
                        'planet-inertial', 'planet-fixed', centralBody, simulationTime
                    );

                    // Convert planet-fixed cartesian to lat/lon/alt
                    const [latitude, longitude] = CoordinateTransforms.planetFixedToLatLonAlt(
                        transformed.position, centralBody
                    );

                    lat = latitude;
                    lon = longitude;

                    // Calculate ground-relative velocity from planet-fixed velocity
                    const groundVel = new PhysicsVector3(...transformed.velocity);
                    ground_velocity = groundVel.length();

                    // Calculate ground track velocity (horizontal component)
                    const posNorm = new PhysicsVector3(...transformed.position).normalize();
                    const radialComponent = groundVel.dot(posNorm);
                    const tangentialVel = groundVel.clone().sub(posNorm.clone().multiplyScalar(radialComponent));
                    ground_track_velocity = tangentialVel.length();

                } catch (_error) { // eslint-disable-line no-unused-vars
                    // Fallback to simple spherical coordinates
                    const pos = satellite.position;
                    const spherical = GeodeticUtils.cartesianToGeodetic(pos.x, pos.y, pos.z);
                    lat = spherical.latitude;
                    lon = spherical.longitude;
                }
            }

            // Track distance traveled
            if (!satellite.lastPosition) {
                satellite.lastPosition = satellite.position.clone();
                satellite.distanceTraveled = 0;
            }
            const distanceStep = satellite.position.distanceTo(satellite.lastPosition);
            satellite.distanceTraveled = (satellite.distanceTraveled || 0) + distanceStep;
            satellite.lastPosition.copy(satellite.position);

            states[id] = {
                id: id,
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                acceleration: satellite.acceleration.toArray(),
                mass: satellite.mass,
                size: satellite.size,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient,
                ballisticCoefficient: satellite.ballisticCoefficient,
                centralBodyNaifId: satellite.centralBodyNaifId,
                orbitalElements,
                equatorialElements,
                lastUpdate: satellite.lastUpdate,
                color: satellite.color,
                name: satellite.name,
                latitude: lat,
                longitude: lon,
                ground_velocity,
                ground_track_velocity,
                escape_velocity,
                distanceTraveled: satellite.distanceTraveled,
                // Acceleration components for vector visualization
                a_total: satellite.a_total,
                a_gravity_total: satellite.a_gravity_total,
                a_j2: satellite.a_j2,
                a_drag: satellite.a_drag,
                a_bodies: satellite.a_bodies,
                a_bodies_direct: satellite.a_bodies_direct
            };
        }

        return states;
    }

    // ================================================================
    // PUBLIC API - Maneuver Node Management
    // ================================================================

    /**
     * Add a maneuver node for a satellite
     * @param {string} satelliteId - Satellite ID
     * @param {Object} maneuverNode - Maneuver node DTO
     * @returns {string} Node ID
     */
    addManeuverNode(satelliteId, maneuverNode) {
        if (!this.satellites.has(satelliteId)) {
            console.error(`Satellite ${satelliteId} not found`);
            return null;
        }

        // Validate and normalize maneuver node
        const normalizedNode = this._normalizeManeuverNode(maneuverNode);
        if (!normalizedNode) {
            console.error(`Invalid maneuver node provided for satellite ${satelliteId}`);
            return null;
        }

        if (!this.maneuverNodes.has(satelliteId)) {
            this.maneuverNodes.set(satelliteId, []);
        }

        const nodes = this.maneuverNodes.get(satelliteId);
        const nodeId = normalizedNode.id || `${satelliteId}_${Date.now()}`;

        // Calculate orbital data for the maneuver node
        const orbitData = this._calculateManeuverOrbitData(satelliteId, normalizedNode);

        const nodeWithId = {
            ...normalizedNode,
            id: nodeId,
            satelliteId: satelliteId,
            orbitData: orbitData
        };

        nodes.push(nodeWithId);

        // Sort nodes by execution time
        nodes.sort((a, b) => {
            return a.executionTime.getTime() - b.executionTime.getTime();
        });

        // Dispatch event for UI update
        this._dispatchSatelliteEvent('maneuverNodeAdded', {
            satelliteId,
            maneuverNode: nodeWithId
        });

        return nodeId;
    }

    /**
     * Remove a maneuver node
     * @param {string} satelliteId - Satellite ID
     * @param {string} nodeId - Node ID to remove
     * @returns {boolean} Success
     */
    removeManeuverNode(satelliteId, nodeId) {
        const nodes = this.maneuverNodes.get(satelliteId);
        if (!nodes) return false;

        const index = nodes.findIndex(n => n.id === nodeId);
        if (index === -1) return false;

        nodes.splice(index, 1);

        // Dispatch event for UI update
        this._dispatchSatelliteEvent('maneuverNodeRemoved', {
            satelliteId,
            nodeId
        });

        return true;
    }

    /**
     * Get maneuver nodes for a satellite
     * @param {string} satelliteId - Satellite ID
     * @returns {Array} Maneuver nodes (sorted by execution time)
     */
    getManeuverNodes(satelliteId) {
        const nodes = this.maneuverNodes.get(satelliteId);
        return nodes ? [...nodes] : [];
    }

    /**
     * Clear all maneuver nodes for a satellite
     * @param {string} satelliteId - Satellite ID
     */
    clearManeuverNodes(satelliteId) {
        if (this.maneuverNodes.has(satelliteId)) {
            this.maneuverNodes.set(satelliteId, []);
        }
    }

    // ================================================================
    // PRIVATE METHODS - Physics Calculations
    // ================================================================

    /**
     * UNIFIED acceleration calculation using UnifiedSatellitePropagator
     * Replaces all old inconsistent acceleration methods
     */
    _computeSatelliteAccelerationUnified(satellite, bodies) {
        // Convert satellite to array format for UnifiedSatellitePropagator
        const satState = {
            position: satellite.position.toArray(),
            velocity: satellite.velocity.toArray(),
            centralBodyNaifId: satellite.centralBodyNaifId,
            mass: satellite.mass,
            crossSectionalArea: satellite.crossSectionalArea,
            dragCoefficient: satellite.dragCoefficient,
            ballisticCoefficient: satellite.ballisticCoefficient
        };

        // Convert bodies to array format
        const bodiesArray = {};
        for (const [naifId, body] of Object.entries(bodies)) {
            bodiesArray[naifId] = {
                ...body,
                position: body.position.toArray(),
                velocity: body.velocity.toArray()
            };
        }

        // Track acceleration computation time
        const startTime = performance.now();

        // Use UnifiedSatellitePropagator for consistent physics with detailed components
        const accelResult = UnifiedSatellitePropagator.computeAcceleration(
            satState,
            bodiesArray,
            {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                detailed: true,
                debugLogging: false,
                perturbationScale: this._perturbationScale
            }
        );

        const accelerationTime = performance.now() - startTime;

        // Validate acceleration result
        if (!accelResult.total.every(v => isFinite(v))) {
            console.error(`[SatelliteEngine] Acceleration computation produced non-finite values for satellite ${satellite.id}:`, {
                satState,
                accelResult,
                bodiesAvailable: Object.keys(bodiesArray)
            });

            // Try fallback computation with just primary gravity
            console.warn(`[SatelliteEngine] Attempting fallback acceleration computation for satellite ${satellite.id}`);
            try {
                const fallbackAccel = UnifiedSatellitePropagator.computeAcceleration(
                    satState,
                    bodiesArray,
                    {
                        includeJ2: false,     // Disable perturbations
                        includeDrag: false,
                        includeThirdBody: false,
                        detailed: false,
                        perturbationScale: this._perturbationScale
                    }
                );

                if (fallbackAccel.every(v => isFinite(v))) {
                    const acceleration = PhysicsVector3.fromArray(fallbackAccel);
                    satellite.acceleration = acceleration;

                    // Track successful fallback acceleration
                    PropagationMetrics.trackRecovery(satellite.id, 'acceleration', true);
                    PropagationMetrics.trackAcceleration(satellite.id, accelerationTime, true);
                    return acceleration;
                }
            } catch (fallbackError) {
                console.error(`[SatelliteEngine] Fallback acceleration failed for satellite ${satellite.id}:`, fallbackError);
            }

            // Final fallback: use zero acceleration
            console.warn(`[SatelliteEngine] Using zero acceleration fallback for satellite ${satellite.id}`);
            const acceleration = new PhysicsVector3(0, 0, 0);
            satellite.acceleration = acceleration;

            // Track failed acceleration with zero fallback
            PropagationMetrics.trackRecovery(satellite.id, 'acceleration', false);
            PropagationMetrics.trackAcceleration(satellite.id, accelerationTime, false);
            return acceleration;
        }

        // Convert back to PhysicsVector3 for PhysicsEngine compatibility
        const acceleration = PhysicsVector3.fromArray(accelResult.total);

        // Track successful acceleration computation
        PropagationMetrics.trackAcceleration(satellite.id, accelerationTime, true);

        // Store force components for visualization (detailed for vector display)
        satellite.a_total = accelResult.total;
        satellite.a_gravity_total = accelResult.components.primary;
        satellite.a_j2 = accelResult.components.j2;
        satellite.a_drag = accelResult.components.drag;
        satellite.a_bodies = accelResult.components.thirdBodies; // Tidal perturbations (physics-accurate)
        satellite.a_bodies_direct = accelResult.components.thirdBodiesDirect; // Direct accelerations (intuitive)
        satellite.acceleration = acceleration;

        return acceleration;
    }


    /**
     * Handle SOI transitions for a satellite
     */
    _handleSOITransitions(satellite, bodies, hierarchy) {
        // Initialize SOI transition manager if needed
        if (!this._soiTransitionManager && hierarchy) {
            this._soiTransitionManager = new SOITransitionManager(hierarchy);
        }

        if (!this._soiTransitionManager) {
            return; // No hierarchy available
        }

        // Perform SOI transition using the manager
        const transitionOccurred = this._soiTransitionManager.performTransition(satellite, bodies);
        
        if (transitionOccurred) {
            // Log transition for debugging
            console.log(`[SOI Transition] Satellite ${satellite.id} transitioned to body ${satellite.centralBodyNaifId}`);
        }
    }

    /**
     * Check and execute any pending maneuvers for a satellite
     * @param {Object} satellite - Satellite object
     * @param {Date} currentTime - Current simulation time
     */
    _checkAndExecuteManeuvers(satellite, currentTime) {
        const nodes = this.maneuverNodes.get(satellite.id);
        if (!nodes || nodes.length === 0) return;

        // Check each maneuver node for execution
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            const executeTime = node.executionTime instanceof Date ?
                node.executionTime : new Date(node.executionTime);

            if (currentTime >= executeTime && !node.executed) {
                // Convert local delta-V (prograde, normal, radial) to world coordinates
                // Reuse working vectors to avoid GC pressure
                const localDV = this._maneuverWorkVectors.localDV.set(
                    node.deltaV.prograde || 0,
                    node.deltaV.normal || 0,
                    node.deltaV.radial || 0
                );

                // Convert to world coordinates based on current velocity direction
                const velDir = this._maneuverWorkVectors.velDir.copy(satellite.velocity).normalize();
                const radialDir = this._maneuverWorkVectors.radialDir.copy(satellite.position).normalize();
                const normalDir = this._maneuverWorkVectors.normalDir.crossVectors(radialDir, velDir).normalize();

                // Build rotation matrix from local to world - reuse working vector
                const progradeDir = velDir;
                const worldDeltaV = this._maneuverWorkVectors.worldDeltaV.set(0, 0, 0)
                    .addScaledVector(progradeDir, localDV.x)
                    .addScaledVector(normalDir, localDV.y)
                    .addScaledVector(radialDir, localDV.z);

                // Apply delta-V to velocity
                satellite.velocity.add(worldDeltaV);

                // Track velocity change for debugging
                const newVelMag = satellite.velocity.length();
                if (satellite.velocityHistory) {
                    satellite.velocityHistory.push({
                        time: currentTime.toISOString(),
                        velocity: newVelMag,
                        context: `maneuver_${node.id}`,
                        deltaV: worldDeltaV.length()
                    });
                    // Keep only last 10 entries
                    if (satellite.velocityHistory.length > 10) {
                        satellite.velocityHistory.shift();
                    }
                }

                // Mark as executed
                node.executed = true;
                node.actualExecuteTime = currentTime.toISOString();

                // Dispatch event for UI
                this._dispatchSatelliteEvent('maneuverExecuted', {
                    satelliteId: satellite.id,
                    nodeId: node.id,
                    deltaV: node.deltaV,
                    executeTime: executeTime,
                    actualExecuteTime: currentTime
                });

                // Remove executed maneuver
                nodes.splice(i, 1);
            }
        }
    }

    /**
     * Validate satellite state for reasonable values
     * @param {Object} satellite - Satellite object
     * @param {string} context - Context for logging
     * @param {Object} bodies - Physics bodies (optional)
     */
    _validateSatelliteState(satellite, context = "", bodies = null) {
        const positionMag = satellite.position.length();
        const velocityMag = satellite.velocity.length();
        const _centralBody = bodies ? bodies[satellite.centralBodyNaifId] : null; // eslint-disable-line no-unused-vars

        const isSunCentered = satellite.centralBodyNaifId === 10; // Sun's NAIF ID

        // Position validation (adjusted for different central bodies)
        const maxDistance = isSunCentered ? 1e9 : 1e6; // km
        if (positionMag > maxDistance) {
            console.error(`[SatelliteEngine._validateSatelliteState] Position magnitude too large ${context} for satellite ${satellite.id}: ${positionMag.toFixed(1)} km (max: ${maxDistance} km)`);
            console.error(`  Position: ${satellite.position.toArray().map(v => v.toFixed(1)).join(', ')} km`);
            return false;
        }

        // Velocity validation (more lenient for sun-centered)
        const maxVelocity = isSunCentered ?
            PhysicsConstants.VELOCITY_LIMITS.INTERPLANETARY_MAX :
            PhysicsConstants.VELOCITY_LIMITS.PLANETARY_MAX;

        if (velocityMag > maxVelocity) {
            console.error(`[SatelliteEngine._validateSatelliteState] Velocity magnitude too large ${context} for satellite ${satellite.id}: ${velocityMag.toFixed(3)} km/s (max: ${maxVelocity} km/s)`);
            return false;
        }

        // Check for NaN or infinite values
        if (!isFinite(positionMag) || !isFinite(velocityMag)) {
            console.error(`[SatelliteEngine._validateSatelliteState] Non-finite values detected ${context} for satellite ${satellite.id}`);
            return false;
        }

        return true;
    }

    /**
     * Dispatch satellite events for UI synchronization
     */
    _dispatchSatelliteEvent(eventType, data) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(eventType, { detail: data }));
        }
    }

    /**
     * Clear caches if needed to prevent memory leaks
     */
    _clearCacheIfNeeded() {
        const now = Date.now();
        if (now - this._lastCacheUpdate > this._cacheValidityPeriod) {
            if (this._satelliteInfluenceCache.size > this._cacheCleanupThreshold) {
                // Keep only the most recently used entries
                const entries = Array.from(this._satelliteInfluenceCache.entries());
                this._satelliteInfluenceCache.clear();
                entries.slice(-this._maxCacheSize).forEach(([key, value]) => {
                    this._satelliteInfluenceCache.set(key, value);
                });
            }
            this._lastCacheUpdate = now;
        }
    }

    /**
     * Normalize and validate a maneuver node
     * @param {Object} node - Raw maneuver node data
     * @returns {Object|null} - Normalized node or null if invalid
     */
    _normalizeManeuverNode(node) {
        if (!node) return null;

        // Normalize execution time
        let executionTime;
        if (node.executionTime instanceof Date) {
            executionTime = node.executionTime;
        } else if (typeof node.executionTime === 'string' || typeof node.executionTime === 'number') {
            executionTime = new Date(node.executionTime);
        } else {
            console.error('[SatelliteEngine] Invalid executionTime format:', node.executionTime);
            return null;
        }

        // Validate execution time
        if (isNaN(executionTime.getTime())) {
            console.error('[SatelliteEngine] Invalid executionTime value:', node.executionTime);
            return null;
        }

        // Normalize delta-V
        const deltaV = {
            prograde: parseFloat(node.deltaV?.prograde || 0),
            normal: parseFloat(node.deltaV?.normal || 0),
            radial: parseFloat(node.deltaV?.radial || 0)
        };

        // Validate delta-V values
        if (!isFinite(deltaV.prograde) || !isFinite(deltaV.normal) || !isFinite(deltaV.radial)) {
            console.error('[SatelliteEngine] Invalid deltaV values:', node.deltaV);
            return null;
        }

        // Calculate magnitude
        const deltaMagnitude = MathUtils.magnitude3D(deltaV.prograde, deltaV.normal, deltaV.radial);

        // Validate reasonable delta-V magnitude (< 50 km/s)
        if (deltaMagnitude > 50) {
            console.warn(`[SatelliteEngine] Large delta-V magnitude: ${deltaMagnitude.toFixed(3)} km/s`);
        }

        return {
            id: node.id,
            executionTime,
            deltaV,
            deltaMagnitude,
            predictedOrbit: node.predictedOrbit || null,
            executed: false
        };
    }

    /**
     * Validate that a maneuver is physically reasonable
     * @param {Object} satellite - Satellite state
     * @param {Object} node - Maneuver node
     * @param {Object} bodies - Physics bodies
     * @returns {Object} - {valid: boolean, warnings: string[]}
     */
    _validateManeuver(satellite, node, bodies) {
        const warnings = [];
        let valid = true;

        // Check execution time is in the future
        const now = new Date();
        if (node.executionTime <= now) {
            warnings.push('Maneuver execution time is in the past');
        }

        // Check for excessive delta-V
        if (node.deltaMagnitude > 20) {
            warnings.push(`Very large delta-V: ${node.deltaMagnitude.toFixed(3)} km/s`);
        }

        // Check if maneuver would exceed escape velocity
        const centralBody = bodies[satellite.centralBodyNaifId];
        if (centralBody) {
            const currentPos = satellite.position.length();
            const currentVel = satellite.velocity.length();
            const escapeVel = Math.sqrt(2 * centralBody.GM / currentPos);

            if (currentVel + node.deltaMagnitude > escapeVel * 1.5) {
                warnings.push('Maneuver may result in escape trajectory');
            }
        }

        // Check for collision course (periapsis below surface)
        try {
            const newVelocity = satellite.velocity.clone();
            // Apply a rough approximation of the maneuver for validation
            const prograde = satellite.velocity.clone().normalize().multiplyScalar(node.deltaV.prograde);
            newVelocity.add(prograde);

            // Simple periapsis check using vis-viva equation
            const r = satellite.position.length();
            const v = newVelocity.length();
            const mu = centralBody?.GM || 398600.4415;
            const energy = v * v / 2 - mu / r;
            const sma = -mu / (2 * energy);

            if (sma > 0) { // Elliptical orbit
                const eccentricity = Math.sqrt(1 + (2 * energy * (satellite.position.cross(newVelocity).lengthSq())) / (mu * mu));
                const periapsis = sma * (1 - eccentricity);
                const surfaceRadius = centralBody?.radius || 6371;

                if (periapsis < surfaceRadius + 100) { // 100km safety margin
                    warnings.push('Maneuver may result in surface collision');
                    valid = false;
                }
            }
        } catch {
            // Validation failed, but don't prevent maneuver
            warnings.push('Could not validate orbital safety');
        }

        return { valid, warnings };
    }

    // ================================================================
    // PUBLIC API - Configuration Methods
    // ================================================================

    /**
     * Set the integration method for satellite motion
     * @param {string} method - 'auto', 'rk4', or 'rk45'
     */
    setIntegrationMethod(method) {
        if (['auto', 'rk4', 'rk45'].includes(method)) {
            this._integrationMethod = method;
            
            // Propagate to worker pool if initialized
            if (this._workerPool && this._workerPoolInitialized) {
                this._workerPool.updateWorkersConfiguration({
                    integrationMethod: method
                });
            }
        } else {
            console.warn(`[SatelliteEngine] Invalid integration method: ${method}`);
        }
    }

    /**
     * Set the physics timestep
     * @param {number} timeStep - Physics timestep in seconds
     */
    setPhysicsTimeStep(timeStep) {
        if (typeof timeStep === 'number' && timeStep > 0 && timeStep <= 1) {
            this._physicsTimeStep = timeStep;
            
            // Propagate to worker pool if initialized
            if (this._workerPool && this._workerPoolInitialized) {
                this._workerPool.updateWorkersConfiguration({
                    physicsTimeStep: timeStep
                });
            }
        } else {
            console.warn(`[SatelliteEngine] Invalid physics timestep: ${timeStep}`);
        }
    }

    /**
     * Set the sensitivity scale for integrator error tolerance
     * @param {number} scale - Sensitivity scale (0-10)
     */
    setSensitivityScale(scale) {
        if (typeof scale === 'number' && scale >= 0 && scale <= 10) {
            this._sensitivityScale = scale;
            
            // Propagate to worker pool if initialized
            if (this._workerPool && this._workerPoolInitialized) {
                this._workerPool.updateWorkersConfiguration({
                    sensitivityScale: scale
                });
            }
        } else {
            console.warn(`[SatelliteEngine] Invalid sensitivity scale: ${scale}`);
        }
    }

    /**
     * Set the perturbation scale for third-body effects
     * @param {number} scale - Perturbation scale (0-1)
     */
    setPerturbationScale(scale) {
        if (typeof scale === 'number' && scale >= 0 && scale <= 1) {
            this._perturbationScale = scale;
            
            // Propagate to worker pool if initialized
            if (this._workerPool && this._workerPoolInitialized) {
                this._workerPool.updateWorkersConfiguration({
                    perturbationScale: scale
                });
            }
        } else {
            console.warn(`[SatelliteEngine] Invalid perturbation scale: ${scale}`);
        }
    }

    /**
     * Get current integration method
     * @returns {string} Current integration method
     */
    getIntegrationMethod() {
        return this._integrationMethod;
    }

    /**
     * Initialize worker pool for parallel processing
     * @private
     */
    async _initializeWorkerPool() {
        if (this._workerPoolInitialized) return;

        try {
            this._workerPool = new SatelliteWorkerPool({
                maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 6) // Limit to 6 workers max
            });

            await this._workerPool.initialize();
            this._workerPoolInitialized = true;

            // Send initial configuration to all workers
            await this._workerPool.updateWorkersConfiguration({
                integrationMethod: this._integrationMethod,
                sensitivityScale: this._sensitivityScale,
                physicsTimeStep: this._physicsTimeStep,
                perturbationScale: this._perturbationScale
            });

        } catch (error) {
            console.error('[SatelliteEngine] Failed to initialize worker pool:', error);
            console.error('[SatelliteEngine] Error details:', error.stack);
            this._useWorkers = false; // Fallback to main thread
        }
    }

    /**
     * Integrate a single satellite on main thread (for fallback)
     * @private
     */
    async _integrateSingleSatelliteMainThread(satellite, deltaTime, bodies, hierarchy, simulationTime, timeWarp) {
        // Check for maneuvers before integration
        this._checkAndExecuteManeuvers(satellite, simulationTime);

        // Use UnifiedSatellitePropagator for consistent physics across all systems
        this._computeSatelliteAccelerationUnified(satellite, bodies);

        // Use unified integrator with automatic method selection
        const position = satellite.position.toArray();
        const velocity = satellite.velocity.toArray();

        // Create acceleration function
        const accelerationFunc = (pos, vel) => {
            const satState = {
                ...satellite,
                position: pos,
                velocity: vel,
                id: satellite.id,
                centralBodyNaifId: satellite.centralBodyNaifId
            };
            const accel = UnifiedSatellitePropagator.computeAcceleration(satState, bodies, {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                perturbationScale: this._perturbationScale
            });
            return accel;
        };

        // Use optimized integrators from OrbitalIntegrators.js
        const startTime = performance.now();
        const integrator = getIntegrator(this._integrationMethod);
        const posVec = new PhysicsVector3(...position);
        const velVec = new PhysicsVector3(...velocity);

        let result;
        if (this._integrationMethod === 'rk45' || this._integrationMethod === 'adaptive') {
            result = integrator(
                posVec,
                velVec,
                (p, v) => {
                    const accel = accelerationFunc(p.toArray(), v.toArray());
                    return new PhysicsVector3(...accel);
                },
                deltaTime * timeWarp,
                {
                    absTol: 1e-6 / this._sensitivityScale,
                    relTol: 1e-6 / this._sensitivityScale,
                    sensitivityScale: this._sensitivityScale
                }
            );
        } else {
            result = integrator(
                posVec,
                velVec,
                (p, v) => {
                    const accel = accelerationFunc(p.toArray(), v.toArray());
                    return new PhysicsVector3(...accel);
                },
                deltaTime * timeWarp
            );
        }

        const integrationTime = performance.now() - startTime;

        // Convert result back to arrays for consistency
        result = {
            position: result.position.toArray(),
            velocity: result.velocity.toArray()
        };

        // Validate and apply result (same as main thread logic)
        if (!result.position.every(v => isFinite(v)) || !result.velocity.every(v => isFinite(v))) {
            console.error(`[SatelliteEngine] Integration produced non-finite values for satellite ${satellite.id}`);
            PropagationMetrics.trackIntegrationStep(satellite.id, integrationTime, this._integrationMethod, false);
            return;
        }

        // Update satellite state
        satellite.position.set(result.position[0], result.position[1], result.position[2]);
        satellite.velocity.set(result.velocity[0], result.velocity[1], result.velocity[2]);
        satellite.lastUpdate = new Date(simulationTime.getTime());

        // Track successful integration
        PropagationMetrics.trackIntegrationStep(satellite.id, integrationTime, this._integrationMethod, true);

        // SOI transition logic
        this._handleSOITransitions(satellite, bodies, hierarchy);
    }

    /**
     * Prepare bodies data for worker threads
     * @private
     */
    _prepareBodiesForWorkers(bodies) {
        const workerBodies = {};
        for (const [naifId, body] of Object.entries(bodies)) {
            workerBodies[naifId] = {
                naifId: body.naifId,
                name: body.name,
                mass: body.mass,
                radius: body.radius,
                GM: body.GM,
                J2: body.J2,
                position: Array.isArray(body.position) ? body.position : body.position.toArray(),
                velocity: Array.isArray(body.velocity) ? body.velocity : body.velocity.toArray(),
                soiRadius: body.soiRadius,
                atmosphereHeight: body.atmosphereHeight
            };
        }
        return workerBodies;
    }

    /**
     * Enable or disable worker-based processing
     * @param {boolean} useWorkers - Whether to use workers
     */
    setUseWorkers(useWorkers) {
        this._useWorkers = useWorkers;
        if (!useWorkers && this._workerPool) {
            this._workerPool.shutdown();
            this._workerPool = null;
            this._workerPoolInitialized = false;
        }
    }

    /**
     * Get worker pool metrics
     * @returns {Object|null} Worker pool performance metrics
     */
    getWorkerMetrics() {
        return this._workerPool ? this._workerPool.getMetrics() : null;
    }

    /**
     * Cleanup worker pool and resources
     */
    async cleanup() {
        if (this._workerPool) {
            await this._workerPool.shutdown();
            this._workerPool = null;
            this._workerPoolInitialized = false;
        }
    }

    /**
     * Calculate orbital data for a maneuver node
     * @private
     * @param {string} satelliteId - Satellite ID
     * @param {Object} maneuverNode - Maneuver node data
     * @returns {Object} Orbital data including period, velocity, and elements
     */
    _calculateManeuverOrbitData(satelliteId, maneuverNode) {
        try {
            const satellite = this.satellites.get(satelliteId);
            if (!satellite) {
                return { _orbitPeriod: 0, _currentVelocity: { length: () => 0 }, elements: null };
            }

            // Use physics API to calculate post-maneuver state
            const { PhysicsAPI } = this._getPhysicsAPI();
            if (!PhysicsAPI) {
                return { _orbitPeriod: 0, _currentVelocity: { length: () => 0 }, elements: null };
            }

            // Calculate the maneuver result with proper nested node handling
            // Convert vectors to arrays for physics API
            const satPosition = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
            const satVelocity = satellite.velocity.toArray ? satellite.velocity.toArray() : satellite.velocity;

            const maneuverResult = PhysicsAPI.Orbital.previewManeuver({
                satellite: {
                    id: satelliteId,
                    position: satPosition,
                    velocity: satVelocity,
                    centralBodyNaifId: satellite.centralBodyNaifId,
                    mass: satellite.mass,
                    crossSectionalArea: satellite.crossSectionalArea,
                    dragCoefficient: satellite.dragCoefficient
                },
                deltaV: maneuverNode.deltaV,
                executionTime: maneuverNode.executionTime,
                physicsEngine: this._getPhysicsEngineRef(),
                isPreview: true // Include existing nodes
            });

            if (maneuverResult?.error || !maneuverResult?.maneuverPosition || !maneuverResult?.postManeuverVelocity) {
                console.warn('[SatelliteEngine] maneuverResult missing data:', maneuverResult);
                return { _orbitPeriod: 0, _currentVelocity: { length: () => 0 }, elements: null };
            }

            const position = maneuverResult.maneuverPosition;
            const velocity = maneuverResult.postManeuverVelocity;

            // Get central body data directly from physics engine
            const physicsEngine = this._getPhysicsEngineRef();
            const centralBodyData = physicsEngine?.bodies?.[satellite.centralBodyNaifId];

            if (!centralBodyData || !position || !velocity) {
                console.warn(`[SatelliteEngine] Missing data for orbital calculation: centralBody=${!!centralBodyData}, position=${!!position}, velocity=${!!velocity}`);
                return { _orbitPeriod: 0, _currentVelocity: { length: () => 0 }, elements: null };
            }

            // Convert arrays to PhysicsVector3 format for orbital calculations
            const posVec3 = new PhysicsVector3(position[0], position[1], position[2]);
            const velVec3 = new PhysicsVector3(velocity[0], velocity[1], velocity[2]);

            // Calculate orbital elements using physics engine data
            const elements = PhysicsAPI.Orbital.calculateElements(
                posVec3,
                velVec3,
                centralBodyData
            );

            // Calculate velocity magnitude
            const velocityMag = MathUtils.magnitude3D(velocity[0], velocity[1], velocity[2]);

            return {
                _orbitPeriod: elements.period || 0,
                _currentVelocity: { length: () => velocityMag },
                elements: elements
            };

        } catch (error) {
            console.warn('[SatelliteEngine] Error calculating maneuver orbit data:', error);
            return { _orbitPeriod: 0, _currentVelocity: { length: () => 0 }, elements: null };
        }
    }

    /**
     * Set PhysicsAPI reference (called by parent PhysicsEngine)
     * @public
     */
    setPhysicsAPI(physicsAPI) {
        this.physicsAPI = physicsAPI;
    }

    /**
     * Get reference to PhysicsAPI
     * @private
     */
    _getPhysicsAPI() {
        return this.physicsAPI;
    }

    /**
     * Get reference to PhysicsEngine
     * @private
     */
    _getPhysicsEngineRef() {
        return this.physicsEngineRef;
    }
}