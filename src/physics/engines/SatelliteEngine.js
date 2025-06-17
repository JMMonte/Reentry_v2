import { PhysicsConstants } from '../core/PhysicsConstants.js';
import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { OrbitalMechanics } from '../core/OrbitalMechanics.js';
import { CoordinateTransforms } from '../utils/CoordinateTransforms.js';
import { GeodeticUtils } from '../utils/GeodeticUtils.js';
import { OrbitalElementsConverter } from '../utils/OrbitalElementsConverter.js';
import { MathUtils } from '../utils/MathUtils.js';
import { PhysicsVector3 } from '../utils/PhysicsVector3.js';
import { SOITransitionManager } from '../utils/SOITransitionManager.js';
import { SatelliteIntegrator } from './SatelliteIntegrator.js';
import { ManeuverExecutor } from '../core/ManeuverExecutor.js';
import { OrbitStreamer } from '../utils/OrbitStreamer.js';

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

        // Orbit streaming for visualization - cycle-based approach
        this.orbitStreamers = new Map(); // Map<satelliteId, OrbitStreamer>
        this.orbitUpdateInterval = 500; // ms - Cycle interval (2 Hz)
        this.lastOrbitUpdate = 0;
        this.orbitPropagationCycles = new Map(); // Map<satelliteId, { inProgress: boolean, startTime: number, timeoutId: number }>
        this.orbitCacheTimeout = 2000; // ms - How long to cache completed propagations

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

        // Worker pool for parallel processing - use shared pool from WorkerPoolManager
        this._useWorkers = true; // Enable workers for parallel processing
        this._workerPool = null; // Will be set by WorkerPoolManager
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

        // Set up event listeners for satellite parameter changes from UI
        this._setupEventListeners();
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
        // PropagationMetrics.initializeSatellite(id); // Removed for performance optimization

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
            // PropagationMetrics.clearSatellite(strId); // Removed for performance optimization

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

        // Worker pool is managed by WorkerPoolManager - no need to initialize here
        // Just check if it's available

        // Use worker-based or main-thread processing based on configuration
        if (this._useWorkers && this._workerPoolInitialized && this._workerPool && this.satellites.size > 0) {
            await this._integrateSatellitesWithWorkers(deltaTime, bodies, hierarchy, simulationTime, timeWarp);
        } else {
            await this._integrateSatellitesMainThread(deltaTime, bodies, hierarchy, simulationTime, timeWarp);
        }

        // Stream orbit updates
        this._streamOrbitUpdates(simulationTime);
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
                // We now execute maneuvers inside the worker; just bundle nodes
                const pendingNodes = this.maneuverNodes.get(satellite.id) || [];

                satelliteDataArray.push({
                    id: satellite.id,
                    position: satellite.position.toArray(),
                    velocity: satellite.velocity.toArray(),
                    acceleration: satellite.acceleration.toArray(),
                    mass: satellite.mass,
                    crossSectionalArea: satellite.crossSectionalArea,
                    dragCoefficient: satellite.dragCoefficient,
                    ballisticCoefficient: satellite.ballisticCoefficient,
                    centralBodyNaifId: satellite.centralBodyNaifId,
                    maneuverNodes: pendingNodes
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

                    // Store local frame components for proper vector visualization
                    satellite.a_total_local = result.a_total_local;
                    satellite.a_gravity_total_local = result.a_gravity_total_local;
                    satellite.a_j2_local = result.a_j2_local;
                    satellite.a_drag_local = result.a_drag_local;
                    satellite.a_bodies_local = result.a_bodies_local;
                    satellite.a_bodies_direct_local = result.a_bodies_direct_local;

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
            // Execute any pending maneuvers for this satellite
            this._checkAndExecuteManeuvers(satellite, simulationTime);

            // Provide acceleration breakdown for inspectors / UI
            this._computeSatelliteAccelerationUnified(satellite, bodies);

            // Apply timeWarp scaling at the engine level to prevent double application
            const scaledDeltaTime = deltaTime * timeWarp;
            
            // Delegate numeric integration to the shared helper; if it fails
            // the helper has already logged and recorded metrics, so we just
            // skip this satellite for this tick.
            const ok = SatelliteIntegrator.integrateSingleSatellite(satellite, {
                deltaTime: scaledDeltaTime,
                bodies,
                simulationTime,
                integrationMethod: this._integrationMethod,
                sensitivityScale: this._sensitivityScale,
                perturbationScale: this._perturbationScale
            });

            if (!ok) continue;

            // Handle Sphere-of-Influence transitions after state update
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

                // Also calculate in equatorial frame for all bodies with significant rotation
                // (Most orbital analysis benefits from equatorial reference frame)
                const shouldCalculateEquatorial = centralBody.tilt !== undefined || 
                    centralBody.obliquity !== undefined || 
                    centralBody.orientationGroup ||
                    centralBody.rotationPeriod !== undefined ||
                    centralBody.naifId === 399 || // Earth - always calculate equatorial
                    centralBody.naifId === 499 || // Mars - always calculate equatorial
                    centralBody.naifId === 599 || // Jupiter - always calculate equatorial
                    centralBody.naifId === 699 || // Saturn - always calculate equatorial
                    centralBody.naifId === 799 || // Uranus - always calculate equatorial
                    centralBody.naifId === 899;   // Neptune - always calculate equatorial

                if (shouldCalculateEquatorial) {
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
                a_bodies_direct: satellite.a_bodies_direct,
                a_total_local: satellite.a_total_local,
                a_gravity_total_local: satellite.a_gravity_total_local,
                a_j2_local: satellite.a_j2_local,
                a_drag_local: satellite.a_drag_local,
                a_bodies_local: satellite.a_bodies_local,
                a_bodies_direct_local: satellite.a_bodies_direct_local
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
                    // PropagationMetrics.trackRecovery(satellite.id, 'acceleration', true); // Removed for performance optimization
                    // PropagationMetrics.trackAcceleration(satellite.id, accelerationTime, true); // Removed for performance optimization
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
            // PropagationMetrics.trackRecovery(satellite.id, 'acceleration', false); // Removed for performance optimization
            // PropagationMetrics.trackAcceleration(satellite.id, accelerationTime, false); // Removed for performance optimization
            return acceleration;
        }

        // Convert back to PhysicsVector3 for PhysicsEngine compatibility
        const acceleration = PhysicsVector3.fromArray(accelResult.total);

        // Track successful acceleration computation
        // PropagationMetrics.trackAcceleration(satellite.id, accelerationTime, true); // Removed for performance optimization

        // Store force components for visualization (detailed for vector display)
        satellite.a_total = accelResult.total;
        satellite.a_gravity_total = accelResult.components.primary;
        satellite.a_j2 = accelResult.components.j2;
        satellite.a_drag = accelResult.components.drag;
        satellite.a_bodies = accelResult.components.thirdBody; // Tidal perturbations (physics-accurate)
        satellite.a_bodies_direct = accelResult.components.thirdBodyIndividual; // Individual body accelerations (per-body object)

        // Store local frame components for proper vector visualization
        satellite.a_total_local = accelResult.components.totalLocal;
        satellite.a_gravity_total_local = accelResult.components.primaryLocal;
        satellite.a_j2_local = accelResult.components.j2Local;
        satellite.a_drag_local = accelResult.components.dragLocal;
        satellite.a_bodies_local = accelResult.components.thirdBodyLocal;
        satellite.a_bodies_direct_local = accelResult.components.thirdBodyIndividualLocal;
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

        // Delegate heavy-math to shared executor (decouples physics from engine/UI)
        const executedNodes = ManeuverExecutor.executePendingManeuvers(
            satellite,
            nodes,
            currentTime,
            this._maneuverWorkVectors // reuse pre-allocated vectors to avoid GC
        );

        if (executedNodes.length === 0) return;

        // Remove executed nodes & dispatch UI events – SatelliteEngine keeps the
        // application-level concerns while ManeuverExecutor focuses on physics.
        for (let i = nodes.length - 1; i >= 0; i--) {
            if (nodes[i].executed) {
                const node = nodes[i];
                nodes.splice(i, 1);

                // Notify listeners (UI, etc.)
                this._dispatchSatelliteEvent('maneuverExecuted', {
                    satelliteId: satellite.id,
                    nodeId: node.id,
                    deltaV: node.deltaV,
                    executeTime: node.executionTime,
                    actualExecuteTime: currentTime
                });
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
     * Set worker pool reference from WorkerPoolManager
     * @param {SatelliteWorkerPool} workerPool - Shared worker pool instance
     */
    setWorkerPool(workerPool) {
        this._workerPool = workerPool;
        this._workerPoolInitialized = workerPool && workerPool.initialized;

        // Send configuration to workers if pool is ready
        if (this._workerPoolInitialized) {
            this._workerPool.updateWorkersConfiguration({
                integrationMethod: this._integrationMethod,
                sensitivityScale: this._sensitivityScale,
                physicsTimeStep: this._physicsTimeStep,
                perturbationScale: this._perturbationScale
            });
        }
    }

    /**
     * Integrate a single satellite on main thread (for fallback)
     * @private
     */
    async _integrateSingleSatelliteMainThread(satellite, deltaTime, bodies, hierarchy, simulationTime, timeWarp) {
        // 1. Execute any pending maneuvers before physics step
        this._checkAndExecuteManeuvers(satellite, simulationTime);

        // 2. Re-evaluate acceleration once for visualisation (optional)
        this._computeSatelliteAccelerationUnified(satellite, bodies);

        // 3. Apply timeWarp scaling at the engine level to prevent double application
        const scaledDeltaTime = deltaTime * timeWarp;
        
        // Delegate numeric integration to the shared helper
        const ok = SatelliteIntegrator.integrateSingleSatellite(satellite, {
            deltaTime: scaledDeltaTime,
            bodies,
            simulationTime,
            integrationMethod: this._integrationMethod,
            sensitivityScale: this._sensitivityScale,
            perturbationScale: this._perturbationScale
        });

        if (!ok) return; // Integration failed – already logged/metriced by helper

        // 4. Handle potential Sphere-of-Influence transitions
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
     * Generate ground track for a satellite using worker pool
     * @param {string} satelliteId - Satellite ID
     * @param {Object} options - Ground track options
     * @returns {Promise<Object>} Ground track data
     */
    async generateGroundTrackAsync(satelliteId, options = {}) {
        const satellite = this.satellites.get(satelliteId);
        if (!satellite) {
            throw new Error(`Satellite ${satelliteId} not found`);
        }

        // Worker pool is managed by WorkerPoolManager
        if (this._workerPool && this._workerPoolInitialized) {
            const satelliteData = {
                id: satellite.id,
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                centralBodyNaifId: satellite.centralBodyNaifId,
                mass: satellite.mass,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient,
                ballisticCoefficient: satellite.ballisticCoefficient
            };

            return await this._workerPool.generateGroundTrack(satelliteData, options);
        } else {
            throw new Error('Worker pool not available for ground track generation');
        }
    }

    /**
     * Preview maneuver for a satellite using worker pool
     * @param {string} satelliteId - Satellite ID
     * @param {Object} maneuver - Maneuver data
     * @param {Object} options - Preview options
     * @returns {Promise<Object>} Maneuver preview data
     */
    async previewManeuverAsync(satelliteId, maneuver, options = {}) {
        const satellite = this.satellites.get(satelliteId);
        if (!satellite) {
            throw new Error(`Satellite ${satelliteId} not found`);
        }

        // Worker pool is managed by WorkerPoolManager
        if (this._workerPool && this._workerPoolInitialized) {
            const satelliteData = {
                id: satellite.id,
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                centralBodyNaifId: satellite.centralBodyNaifId,
                mass: satellite.mass,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient,
                ballisticCoefficient: satellite.ballisticCoefficient
            };

            return await this._workerPool.previewManeuver(satelliteData, maneuver, options);
        } else {
            throw new Error('Worker pool not available for maneuver preview');
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
     * Cleanup resources
     */
    async cleanup() {
        // Shutdown worker pool if exists
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

    // ================================================================
    // PUBLIC API - Comprehensive Maneuver Operations
    // ================================================================

    /**
     * Calculate Hohmann transfer parameters and optionally create nodes
     * @param {string} satelliteId - Satellite ID
     * @param {Object} params - Transfer parameters
     * @param {number} params.targetSemiMajorAxis - Target orbit SMA (km)
     * @param {number} params.targetEccentricity - Target orbit eccentricity (default: 0)
     * @param {number} params.targetInclination - Target orbit inclination (degrees, optional)
     * @param {number} params.targetLAN - Target LAN (degrees, optional)
     * @param {number} params.targetArgP - Target argument of periapsis (degrees, optional)
     * @param {Date} params.startTime - Start time for calculations
     * @param {boolean} params.createNodes - Whether to create actual maneuver nodes (default: false)
     * @param {Date} params.preferredBurnTime - Preferred time for first burn (optional)
     * @returns {Object} Complete transfer analysis
     */
    calculateHohmannTransfer(satelliteId, params) {
        const satellite = this.satellites.get(satelliteId);
        if (!satellite) {
            throw new Error(`Satellite ${satelliteId} not found`);
        }

        const {
            targetSemiMajorAxis,
            targetEccentricity = 0,
            targetInclination,
            targetLAN,
            targetArgP,
            startTime,
            createNodes = false,
            preferredBurnTime
        } = params;

        // Get central body data
        const centralBodyData = this._getPhysicsEngineRef()?.bodies?.[satellite.centralBodyNaifId];
        if (!centralBodyData) {
            throw new Error(`Central body ${satellite.centralBodyNaifId} not found`);
        }

        const currentRadius = satellite.position.length();
        const targetRadius = targetSemiMajorAxis; // For circular orbits
        const mu = centralBodyData.GM;

        // Calculate current orbital elements
        const currentElements = OrbitalMechanics.calculateOrbitalElements(
            satellite.position,
            satellite.velocity,
            mu,
            centralBodyData.radius
        );

        // Use target inclination/LAN if provided, otherwise maintain current
        const finalInclination = targetInclination !== undefined ? targetInclination : currentElements.inclination;
        const finalLAN = targetLAN !== undefined ? targetLAN : currentElements.longitudeOfAscendingNode;
        const finalArgP = targetArgP !== undefined ? targetArgP : currentElements.argumentOfPeriapsis;

        // Calculate transfer using core orbital mechanics
        const transfer = OrbitalMechanics.calculateHohmannTransfer({
            centralBody: centralBodyData,
            currentRadius,
            targetRadius
        });

        // Calculate optimal burn time
        let burnTime = preferredBurnTime;
        if (!burnTime) {
            // Default to next periapsis for efficiency
            burnTime = OrbitalMechanics.calculateNextApsis(
                satellite.position,
                satellite.velocity,
                mu,
                'periapsis',
                startTime
            );
        }

        // Calculate second burn time (after transfer)
        const burn2Time = new Date(burnTime.getTime() + transfer.transferTime * 1000);

        // Calculate plane change requirements
        const planeChangeAngle = Math.abs(finalInclination - currentElements.inclination);
        const planeChangeDV = planeChangeAngle > 0.1 ?
            2 * Math.sqrt(mu / targetRadius) * Math.sin(MathUtils.degToRad(planeChangeAngle) / 2) : 0;

        const result = {
            // Basic transfer data
            deltaV1: transfer.deltaV1,
            deltaV2: transfer.deltaV2,
            totalDeltaV: transfer.totalDeltaV + planeChangeDV,
            transferTime: transfer.transferTime,

            // Timing
            burn1Time: burnTime,
            burn2Time: burn2Time,

            // Plane change
            planeChangeAngle,
            planeChangeDeltaV: planeChangeDV,

            // Orbital details
            currentOrbit: currentElements,
            transferSemiMajorAxis: transfer.transferSemiMajorAxis,
            finalOrbit: {
                semiMajorAxis: targetSemiMajorAxis,
                eccentricity: targetEccentricity,
                inclination: finalInclination,
                longitudeOfAscendingNode: finalLAN,
                argumentOfPeriapsis: finalArgP
            },

            // Altitudes for display
            currentAltitude: currentRadius - centralBodyData.radius,
            targetAltitude: targetRadius - centralBodyData.radius
        };

        // Optionally create the maneuver nodes
        if (createNodes) {
            // Clear existing nodes first
            this.clearManeuverNodes(satelliteId);

            // Create first burn (prograde only for simplicity)
            const node1Id = this.addManeuverNode(satelliteId, {
                executionTime: burnTime,
                deltaV: {
                    prograde: transfer.deltaV1,
                    normal: 0,
                    radial: 0
                }
            });

            // Create second burn (includes plane change if needed)
            const orbitalDV = transfer.deltaV2;
            const node2Id = this.addManeuverNode(satelliteId, {
                executionTime: burn2Time,
                deltaV: {
                    prograde: orbitalDV,
                    normal: planeChangeDV, // Simplified: plane change in normal direction
                    radial: 0
                }
            });

            result.createdNodes = [node1Id, node2Id];
        }

        return result;
    }

    /**
     * Calculate maneuver preview data (for UI display without creating nodes)
     * @param {string} satelliteId - Satellite ID
     * @param {Object} deltaV - Delta-V components {prograde, normal, radial} in km/s
     * @param {Date} executionTime - When to execute the maneuver
     * @param {number} duration - How long to propagate orbit (seconds, optional)
     * @returns {Object} Preview data including orbit points and orbital elements
     */
    async calculateManeuverPreview(satelliteId, deltaV, executionTime, duration = null) {
        const satellite = this.satellites.get(satelliteId);
        if (!satellite) {
            throw new Error(`Satellite ${satelliteId} not found`);
        }

        // Use physics API for consistent preview calculation
        const { PhysicsAPI } = this._getPhysicsAPI();
        if (!PhysicsAPI) {
            throw new Error('PhysicsAPI not available');
        }

        const previewData = PhysicsAPI.Orbital.previewManeuver({
            satellite: {
                id: satelliteId,
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                centralBodyNaifId: satellite.centralBodyNaifId,
                mass: satellite.mass,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient
            },
            deltaV,
            executionTime,
            physicsEngine: this._getPhysicsEngineRef(),
            duration,
            isPreview: true
        });

        if (previewData.error) {
            throw new Error(previewData.error);
        }

        // Calculate post-maneuver orbital elements
        const centralBodyData = this._getPhysicsEngineRef()?.bodies?.[satellite.centralBodyNaifId];
        if (centralBodyData && previewData.maneuverPosition && previewData.postManeuverVelocity) {
            const postElements = OrbitalMechanics.calculateOrbitalElements(
                previewData.maneuverPosition,
                previewData.postManeuverVelocity,
                centralBodyData.GM,
                centralBodyData.radius
            );

            previewData.postManeuverElements = postElements;
        }

        return previewData;
    }

    /**
     * Calculate optimal burn timing for various maneuver types
     * @param {string} satelliteId - Satellite ID
     * @param {string} apsisType - 'periapsis', 'apoapsis', or 'optimal'
     * @param {Date} currentTime - Current simulation time
     * @param {Object} targetParams - Target orbit parameters (optional)
     * @returns {Date} Optimal burn time
     */
    calculateOptimalBurnTime(satelliteId, apsisType, currentTime) {
        const satellite = this.satellites.get(satelliteId);
        if (!satellite) {
            throw new Error(`Satellite ${satelliteId} not found`);
        }

        const centralBodyData = this._getPhysicsEngineRef()?.bodies?.[satellite.centralBodyNaifId];
        if (!centralBodyData) {
            throw new Error(`Central body ${satellite.centralBodyNaifId} not found`);
        }

        const mu = centralBodyData.GM;

        switch (apsisType) {
            case 'periapsis':
                return OrbitalMechanics.calculateNextApsis(
                    satellite.position,
                    satellite.velocity,
                    mu,
                    'periapsis',
                    currentTime
                );

            case 'apoapsis':
                return OrbitalMechanics.calculateNextApsis(
                    satellite.position,
                    satellite.velocity,
                    mu,
                    'apoapsis',
                    currentTime
                );

            case 'optimal':
                // For general maneuvers, periapsis is usually optimal for efficiency
                return OrbitalMechanics.calculateNextApsis(
                    satellite.position,
                    satellite.velocity,
                    mu,
                    'periapsis',
                    currentTime
                );

            default:
                throw new Error(`Unknown apsis type: ${apsisType}`);
        }
    }

    /**
     * Execute a manual burn with given parameters
     * @param {string} satelliteId - Satellite ID
     * @param {Object} params - Burn parameters
     * @param {Date} params.executionTime - When to execute
     * @param {Object} params.deltaV - Delta-V components {prograde, normal, radial} in km/s
     * @param {boolean} params.replaceExisting - Whether to replace existing nodes (default: false)
     * @returns {string} Created node ID
     */
    scheduleManualBurn(satelliteId, params) {
        const { executionTime, deltaV, replaceExisting = false } = params;

        // Clear existing nodes if requested
        if (replaceExisting) {
            this.clearManeuverNodes(satelliteId);
        }

        // Create the maneuver node
        return this.addManeuverNode(satelliteId, {
            executionTime,
            deltaV
        });
    }

    /**
     * Get comprehensive maneuver analysis for a satellite
     * @param {string} satelliteId - Satellite ID
     * @param {Date} currentTime - Current simulation time
     * @returns {Object} Complete maneuver state and analysis
     */
    getManeuverAnalysis(satelliteId, currentTime) {
        const satellite = this.satellites.get(satelliteId);
        if (!satellite) {
            return null;
        }

        const nodes = this.getManeuverNodes(satelliteId);
        const centralBodyData = this._getPhysicsEngineRef()?.bodies?.[satellite.centralBodyNaifId];

        if (!centralBodyData) {
            return { nodes, currentElements: null, nextApsis: null };
        }

        // Calculate current orbital elements
        const currentElements = OrbitalMechanics.calculateOrbitalElements(
            satellite.position,
            satellite.velocity,
            centralBodyData.GM,
            centralBodyData.radius
        );

        // Calculate next apsis times
        const nextPeriapsis = OrbitalMechanics.calculateNextApsis(
            satellite.position,
            satellite.velocity,
            centralBodyData.GM,
            'periapsis',
            currentTime
        );

        const nextApoapsis = OrbitalMechanics.calculateNextApsis(
            satellite.position,
            satellite.velocity,
            centralBodyData.GM,
            'apoapsis',
            currentTime
        );

        // Calculate total delta-V budget
        const totalDeltaV = nodes.reduce((sum, node) => sum + node.deltaMagnitude, 0);

        return {
            nodes,
            currentElements,
            nextApsis: {
                periapsis: nextPeriapsis,
                apoapsis: nextApoapsis
            },
            totalDeltaV,
            nodeCount: nodes.length
        };
    }

    // ================================================================
    // PRIVATE METHODS - Orbit Streaming
    // ================================================================

    /**
     * Stream orbit updates for visualization - cycle-based approach
     * @private
     */
    _streamOrbitUpdates(simulationTime) {
        const now = performance.now();

        // Check if it's time for a new cycle
        if (now - this.lastOrbitUpdate < this.orbitUpdateInterval) return;
        this.lastOrbitUpdate = now;

        // Process each satellite in the current cycle
        for (const [satelliteId, satellite] of this.satellites) {
            this._processSatelliteOrbitCycle(satelliteId, satellite, simulationTime, now);
        }
    }

    /**
     * Process orbit cycle for a single satellite
     * @private
     */
    _processSatelliteOrbitCycle(satelliteId, satellite, simulationTime, cycleStartTime) {
        const streamer = this._getOrCreateStreamer(satelliteId);
        const cycle = this.orbitPropagationCycles.get(satelliteId);

        // Create orbit point from current satellite state
        const orbitPoint = {
            position: satellite.position.toArray(),
            velocity: satellite.velocity.toArray(),
            time: simulationTime.getTime(),
            centralBodyNaifId: satellite.centralBodyNaifId
        };

        // Always add current physics point
        const hasNewPhysicsPoint = streamer.addPoint(orbitPoint);

        // Check if we need to start a new propagation cycle
        // Use the streamer's own parameters (which may have been customized per satellite)
        // instead of overriding with global display settings
        const extensionResult = streamer.needsExtension();

        // Don't start new cycle if:
        // 1. One is already in progress
        // 2. We don't need extension
        // 3. We already have sufficient orbit data
        if (cycle?.inProgress) {
            // Check if current cycle has timed out
            if (cycleStartTime - cycle.startTime > this.orbitUpdateInterval) {
                console.warn(`[SatelliteEngine] Orbit propagation cycle timed out for satellite ${satelliteId}, starting new cycle`);
                this._cancelOrbitCycle(satelliteId);
            } else {
                // Cycle still in progress, just publish current data if we have new physics points
                if (hasNewPhysicsPoint) {
                    this._publishOrbitStream(satelliteId, streamer.getStreamingData());
                }
                return;
            }
        }

        // Check if extension is actually needed
        if (extensionResult.needsExtension) {
            // Start new propagation cycle - pass simulationTime
            this._startOrbitPropagationCycle(satelliteId, streamer, extensionResult.needsCompleteRedraw, cycleStartTime, simulationTime);
        } else {
            // No extension needed, just publish current data if we have new physics points
            if (hasNewPhysicsPoint) {
                this._publishOrbitStream(satelliteId, streamer.getStreamingData());
            }
        }
    }

    /**
     * Start a new orbit propagation cycle
     * @private
     */
    _startOrbitPropagationCycle(satelliteId, streamer, isCompleteRedraw, startTime, simulationTime) {
        // Mark cycle as in progress
        this.orbitPropagationCycles.set(satelliteId, {
            inProgress: true,
            startTime: startTime,
            timeoutId: null
        });

        // Set timeout to cancel cycle if it takes too long
        const timeoutId = setTimeout(() => {
            console.warn(`[SatelliteEngine] Orbit propagation cycle forced timeout for satellite ${satelliteId}`);
            this._cancelOrbitCycle(satelliteId);
        }, this.orbitUpdateInterval);

        // Update timeout in cycle tracking
        const cycle = this.orbitPropagationCycles.get(satelliteId);
        cycle.timeoutId = timeoutId;

        // Start the actual propagation
        this._extendOrbitCycleAsync(satelliteId, streamer, isCompleteRedraw, simulationTime);
    }

    /**
     * Cancel an in-progress orbit cycle
     * @private
     */
    _cancelOrbitCycle(satelliteId) {
        const cycle = this.orbitPropagationCycles.get(satelliteId);
        if (cycle) {
            if (cycle.timeoutId) {
                clearTimeout(cycle.timeoutId);
            }
            this.orbitPropagationCycles.delete(satelliteId);

            // Reset streamer extension state
            const streamer = this.orbitStreamers.get(satelliteId);
            if (streamer) {
                streamer.setExtensionState(false, 0);
            }
        }
    }

    /**
     * Get or create orbit streamer for satellite
     * @private
     */
    _getOrCreateStreamer(satelliteId) {
        if (!this.orbitStreamers.has(satelliteId)) {
            // Get satellite-specific parameters if available, otherwise use global defaults
            const satellite = this.satellites.get(satelliteId);
            let params;
            
            if (satellite?.orbitSimProperties) {
                // Use satellite-specific parameters if they exist
                params = {
                    periods: satellite.orbitSimProperties.periods || 1.5,
                    pointsPerPeriod: satellite.orbitSimProperties.pointsPerPeriod || 64
                };
            } else {
                // Fall back to global display settings
                params = this._getOrbitDisplayParams();
            }
            
            // Get central body data from physics engine
            const physicsEngine = this._getPhysicsEngineRef();
            let centralBodyData = null;
            
            if (satellite && physicsEngine?.bodies) {
                centralBodyData = physicsEngine.bodies[satellite.centralBodyNaifId];
            }
            
            this.orbitStreamers.set(satelliteId, new OrbitStreamer(satelliteId, params, centralBodyData));
        }
        return this.orbitStreamers.get(satelliteId);
    }

    /**
     * Get orbit display parameters from display settings
     * @private
     */
    _getOrbitDisplayParams() {
        // Get parameters from DisplaySettingsManager if available
        const physicsEngine = this._getPhysicsEngineRef();
        const displaySettings = physicsEngine?.app3d?.displaySettingsManager;

        // Update orbit update interval from display settings
        const newOrbitUpdateInterval = displaySettings?.getSetting('orbitUpdateInterval');
        if (newOrbitUpdateInterval && newOrbitUpdateInterval !== this.orbitUpdateInterval) {
            this.orbitUpdateInterval = newOrbitUpdateInterval;
            console.log(`[SatelliteEngine] Updated orbit update interval to ${this.orbitUpdateInterval}ms`);
        }

        return {
            periods: displaySettings?.getSetting('orbitPredictionInterval') || 1.5,
            pointsPerPeriod: displaySettings?.getSetting('orbitPointsPerPeriod') || 64
        };
    }

    /**
     * Extend orbit using cycle-based approach
     * @private
     * @param {string} satelliteId - Satellite ID
     * @param {OrbitStreamer} streamer - Orbit streamer instance
     * @param {boolean} isCompleteRedraw - Whether this is a complete redraw due to parameter changes
     * @param {Date} simulationTime - Current simulation time
     */
    async _extendOrbitCycleAsync(satelliteId, streamer, isCompleteRedraw = false, simulationTime = null) {
        // This method replaces _extendOrbitAsync with cycle management

        streamer.setExtensionState(true, 0);

        try {
            // Check if cycle is still valid (not timed out)
            const cycle = this.orbitPropagationCycles.get(satelliteId);
            if (!cycle?.inProgress) {
                console.warn(`[SatelliteEngine] Orbit cycle was cancelled for satellite ${satelliteId}`);
                streamer.setExtensionState(false, 0);
                return false;
            }

            // For complete redraw, use current satellite state; for extension, use latest streamed point
            let startingPosition, startingVelocity;

            const satellite = this.satellites.get(satelliteId);
            if (!satellite) {
                this._completeOrbitCycle(satelliteId, false);
                return false;
            }

            if (isCompleteRedraw) {
                // Complete redraw: start from current satellite position
                startingPosition = satellite.position.toArray();
                startingVelocity = satellite.velocity.toArray();
            } else {
                // Normal extension: start from latest streamed point
                const startingPoint = streamer.getLatestPoint();
                if (!startingPoint) {
                    this._completeOrbitCycle(satelliteId, false);
                    return false;
                }
                startingPosition = startingPoint.position;
                startingVelocity = startingPoint.velocity;
            }

            // Calculate extension duration based on orbital periods only
            const requiredDuration = streamer._calculateRequiredDuration(streamer.params);
            
            // Use current simulation time as start time (in seconds since epoch)
            const currentSimTime = simulationTime || new Date();
            const startTimeSeconds = currentSimTime.getTime() / 1000; // Convert to seconds since epoch
            
            // Debug and fallback for invalid duration
            if (!Number.isFinite(requiredDuration) || requiredDuration <= 0) {
                console.warn(`[SatelliteEngine] Invalid requiredDuration (${requiredDuration}) for satellite ${satelliteId}, using fallback`);
                const fallbackDuration = 5400; // 90 minutes
                const estimatedPeriod = fallbackDuration / streamer.params.periods;
                const calculatedTimeStep = estimatedPeriod / streamer.params.pointsPerPeriod;
                const timeStep = Math.max(0.1, Math.min(60, calculatedTimeStep));
                
                const propagationParams = {
                    satellite: {
                        position: startingPosition,
                        velocity: startingVelocity,
                        centralBodyNaifId: satellite.centralBodyNaifId,
                        mass: satellite.mass,
                        crossSectionalArea: satellite.crossSectionalArea,
                        dragCoefficient: satellite.dragCoefficient,
                        ballisticCoefficient: satellite.ballisticCoefficient
                    },
                    bodies: this._prepareBodiesForWorkers(physicsEngine.bodies),
                    duration: fallbackDuration,
                    timeStep: timeStep,
                    startTime: startTimeSeconds, // Use current simulation time
                    includeJ2: true,
                    includeDrag: true,
                    includeThirdBody: true,
                    timeWarp: 1,
                    method: this._integrationMethod,
                    perturbationScale: this._perturbationScale
                };
                
                // Use UnifiedSatellitePropagator directly (single system)
                const { UnifiedSatellitePropagator } = await import('../core/UnifiedSatellitePropagator.js');
                const rawOrbitPoints = await UnifiedSatellitePropagator.propagateOrbit(propagationParams);
                
                if (rawOrbitPoints && rawOrbitPoints.length > 0) {
                    const resampledPoints = this._resampleOrbitPoints(rawOrbitPoints, streamer.params);
                    streamer.addPredictedPoints(resampledPoints, true);
                    this._completeOrbitCycle(satelliteId, true);
                    return true;
                } else {
                    throw new Error('No orbit points generated with fallback duration');
                }
            }

            // Use UnifiedSatellitePropagator directly for consistency
            const physicsEngine = this._getPhysicsEngineRef();
            if (!physicsEngine?.bodies) {
                throw new Error('Physics bodies not available for orbit extension');
            }

            // Calculate timeStep based on pointsPerPeriod - resolution is PER PERIOD
            const estimatedPeriod = requiredDuration / streamer.params.periods; // Single period duration
            const calculatedTimeStep = estimatedPeriod / streamer.params.pointsPerPeriod;
            const timeStep = Math.max(0.1, Math.min(60, calculatedTimeStep));

            const propagationParams = {
                satellite: {
                    position: startingPosition,
                    velocity: startingVelocity,
                    centralBodyNaifId: satellite.centralBodyNaifId,
                    mass: satellite.mass,
                    crossSectionalArea: satellite.crossSectionalArea,
                    dragCoefficient: satellite.dragCoefficient,
                    ballisticCoefficient: satellite.ballisticCoefficient
                },
                bodies: this._prepareBodiesForWorkers(physicsEngine.bodies),
                duration: requiredDuration,
                timeStep: timeStep,
                startTime: startTimeSeconds, // Use current simulation time
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                timeWarp: 1,
                method: this._integrationMethod,
                perturbationScale: this._perturbationScale
            };

            // Use UnifiedSatellitePropagator directly (single system)
            const { UnifiedSatellitePropagator } = await import('../core/UnifiedSatellitePropagator.js');
            const rawOrbitPoints = await UnifiedSatellitePropagator.propagateOrbit(propagationParams);

            // Check if cycle is still valid after propagation
            const currentCycle = this.orbitPropagationCycles.get(satelliteId);
            if (!currentCycle?.inProgress) {
                console.warn(`[SatelliteEngine] Orbit cycle timed out during propagation for satellite ${satelliteId}`);
                return false;
            }

            if (rawOrbitPoints && rawOrbitPoints.length > 0) {
                // Resample points to achieve desired pointsPerPeriod resolution
                const resampledPoints = this._resampleOrbitPoints(rawOrbitPoints, streamer.params);
                streamer.addPredictedPoints(resampledPoints, true); // Mark as complete
                this._completeOrbitCycle(satelliteId, true);
                return true;
            } else {
                throw new Error('No orbit points generated');
            }

        } catch (error) {
            console.warn(`[SatelliteEngine] Failed to extend orbit for satellite ${satelliteId}:`, error);
            this._completeOrbitCycle(satelliteId, false);
            return false;
        }
    }

    /**
     * Complete an orbit propagation cycle
     * @private
     */
    _completeOrbitCycle(satelliteId, success) {
        const cycle = this.orbitPropagationCycles.get(satelliteId);
        if (cycle) {
            // Clear timeout
            if (cycle.timeoutId) {
                clearTimeout(cycle.timeoutId);
            }
            // Remove cycle tracking
            this.orbitPropagationCycles.delete(satelliteId);
        }

        const streamer = this.orbitStreamers.get(satelliteId);
        if (streamer) {
            streamer.setExtensionState(false, success ? 1 : 0);

            if (success) {
                // Publish updated data when cycle completes successfully
                this._publishOrbitStream(satelliteId, streamer.getStreamingData());
                console.log(`[SatelliteEngine] Completed orbit propagation for satellite ${satelliteId}, total points: ${streamer.physicsPoints.length + streamer.predictedPoints.length}`);
            } else {
                console.warn(`[SatelliteEngine] Failed orbit propagation for satellite ${satelliteId}`);
            }
        }
    }

    /**
     * Publish orbit stream update event
     * @private
     */
    _publishOrbitStream(satelliteId, streamData) {
        // Dispatch event for visualization layer
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('orbitStreamUpdate', {
                detail: {
                    satelliteId,
                    data: streamData
                }
            }));
        }
    }

    /**
     * Get orbit streaming data for a satellite (replaces legacy propagation methods)
     * @param {string} satelliteId - Satellite ID
     * @param {Object} options - Options for orbit data
     * @returns {Object} Current orbit streaming data
     */
    getOrbitStreamingData(satelliteId, options = {}) {
        const streamer = this.orbitStreamers.get(satelliteId);
        if (!streamer) {
            return { points: [], metadata: null };
        }

        return streamer.getStreamingData(options);
    }

    /**
     * Force orbit extension for a satellite (replaces async propagation)
     * @param {string} satelliteId - Satellite ID
     * @param {Object} options - Extension options
     * @returns {Promise<boolean>} Success status
     */
    async forceOrbitExtension(satelliteId, options = {}) {
        const streamer = this._getOrCreateStreamer(satelliteId);

        // Cancel any existing cycle for this satellite
        this._cancelOrbitCycle(satelliteId);

        // Force extension with custom parameters
        let forceCompleteRedraw = false;
        if (options.duration || options.periods || options.pointsPerPeriod) {
            const oldParams = { ...streamer.params };
            streamer.params = { ...streamer.params, ...options };

            // Check if parameters changed significantly
            forceCompleteRedraw = !streamer._areParamsEqual(oldParams, streamer.params);
        }

        // Get current simulation time from physics engine
        const physicsEngine = this._getPhysicsEngineRef();
        const currentSimTime = physicsEngine?.simulationTime || new Date();

        // Start immediate cycle (outside normal cycle timing)
        this._startOrbitPropagationCycle(satelliteId, streamer, forceCompleteRedraw, performance.now(), currentSimTime);

        // Wait for cycle to complete (with timeout)
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const cycle = this.orbitPropagationCycles.get(satelliteId);
                if (!cycle?.inProgress) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            }, 100);

            // Timeout after 2 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                this._cancelOrbitCycle(satelliteId);
                resolve(false);
            }, 2000);
        });
    }

    // ================================================================
    // PRIVATE METHODS - Event Listeners for UI Integration
    // ================================================================

    /**
     * Set up event listeners for satellite parameter changes from UI
     * @private
     */
    _setupEventListeners() {
        // Bind methods to preserve `this` context
        this._handleSatelliteSimPropertiesChanged = this._handleSatelliteSimPropertiesChanged.bind(this);
        
        // Listen for satellite simulation properties changes from debug window
        if (typeof window !== 'undefined') {
            // Debug window dispatches to document, so listen on document
            document.addEventListener('satelliteSimPropertiesChanged', this._handleSatelliteSimPropertiesChanged);
            console.log('[SatelliteEngine] Event listener for satelliteSimPropertiesChanged added to document');
        } else {
            console.warn('[SatelliteEngine] Window not available, cannot add event listeners');
        }
    }

    /**
     * Remove event listeners
     * @private
     */
    _removeEventListeners() {
        if (typeof window !== 'undefined') {
            document.removeEventListener('satelliteSimPropertiesChanged', this._handleSatelliteSimPropertiesChanged);
        }
    }

    /**
     * Resample orbit points to achieve desired resolution (pointsPerPeriod)
     * @private
     * @param {Array} rawPoints - Original orbit points from propagation
     * @param {Object} params - Streaming parameters with periods and pointsPerPeriod
     * @returns {Array} Resampled orbit points
     */
    _resampleOrbitPoints(rawPoints, params) {
        if (!rawPoints || rawPoints.length === 0) return [];
        if (!params.pointsPerPeriod || params.pointsPerPeriod <= 0) return rawPoints;

        // Calculate desired total number of points
        const desiredTotalPoints = Math.round(params.periods * params.pointsPerPeriod);
        
        // If desired points matches what we have, return as-is
        if (rawPoints.length === desiredTotalPoints) {
            return rawPoints;
        }

        // Resample using linear interpolation to achieve exact desired resolution
        const resampledPoints = [];
        const maxIndex = rawPoints.length - 1;
        
        for (let i = 0; i < desiredTotalPoints; i++) {
            // Calculate floating point index in original array
            const floatIndex = (i / (desiredTotalPoints - 1)) * maxIndex;
            const lowerIndex = Math.floor(floatIndex);
            const upperIndex = Math.min(lowerIndex + 1, maxIndex);
            const t = floatIndex - lowerIndex; // Interpolation factor [0, 1]

            if (lowerIndex === upperIndex || t === 0) {
                // No interpolation needed
                resampledPoints.push(rawPoints[lowerIndex]);
            } else {
                // Linear interpolation between two points
                const lowerPoint = rawPoints[lowerIndex];
                const upperPoint = rawPoints[upperIndex];
                
                const interpolatedPoint = {
                    position: [
                        lowerPoint.position[0] + t * (upperPoint.position[0] - lowerPoint.position[0]),
                        lowerPoint.position[1] + t * (upperPoint.position[1] - lowerPoint.position[1]),
                        lowerPoint.position[2] + t * (upperPoint.position[2] - lowerPoint.position[2])
                    ],
                    velocity: [
                        lowerPoint.velocity[0] + t * (upperPoint.velocity[0] - lowerPoint.velocity[0]),
                        lowerPoint.velocity[1] + t * (upperPoint.velocity[1] - lowerPoint.velocity[1]),
                        lowerPoint.velocity[2] + t * (upperPoint.velocity[2] - lowerPoint.velocity[2])
                    ],
                    time: lowerPoint.time + t * (upperPoint.time - lowerPoint.time),
                    centralBodyNaifId: lowerPoint.centralBodyNaifId
                };
                
                resampledPoints.push(interpolatedPoint);
            }
        }

        return resampledPoints;
    }

    /**
     * Handle satellite simulation properties changes from debug window
     * @private
     */
    _handleSatelliteSimPropertiesChanged(event) {
        const { satelliteId, property, value } = event.detail || {};
        
        if (!satelliteId) {
            console.warn('[SatelliteEngine] No satelliteId in event');
            return;
        }
        
        // Try both string and numeric versions of the ID
        const stringId = String(satelliteId);
        const satellite = this.satellites.get(stringId);
        
        if (!satellite) {
            console.warn(`[SatelliteEngine] Satellite ${stringId} not found in physics engine`);
            return;
        }

        console.log(`[SatelliteEngine] Updating ${property} to ${value} for satellite ${stringId}`);

        // Store the parameters on the satellite object for persistence
        if (!satellite.orbitSimProperties) {
            satellite.orbitSimProperties = {};
        }
        satellite.orbitSimProperties[property] = value;

        // Update the streamer parameters if they exist
        const streamer = this.orbitStreamers.get(stringId);
        if (streamer) {
            // Update streamer parameters based on the property change
            const newParams = { ...streamer.params };
            
            if (property === 'periods') {
                newParams.periods = value;
            } else if (property === 'pointsPerPeriod') {
                newParams.pointsPerPeriod = value;
            }
            
            // Update the streamer parameters (this will cause the next regular orbit cycle to use new params)
            streamer.updateParams(newParams);
            
            console.log(`[SatelliteEngine] Updated streamer parameters for satellite ${stringId}:`, newParams);
        }
    }
}