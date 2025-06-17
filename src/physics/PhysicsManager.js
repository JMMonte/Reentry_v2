import { PhysicsEngine } from './PhysicsEngine.js';
import { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
import { OrbitalMechanics } from './core/OrbitalMechanics.js';
import { solarSystemDataManager } from './PlanetaryDataManager.js';
import { PhysicsConstants } from './core/PhysicsConstants.js';
import { PhysicsVector3 } from './utils/PhysicsVector3.js';

/**
 * Physics Manager - Pure physics interface for the application
 * Handles initialization, updates, and provides physics data
 * 
 * ARCHITECTURE NOTE: This is a pure physics layer that returns physics data types.
 * The frontend/app layer is responsible for converting to Three.js objects when needed.
 * This layer should NEVER import or use Three.js directly.
 */
export class PhysicsManager {
    constructor(app) {
        this.app = app; // Reference to main App3D instance
        this.physicsEngine = new PhysicsEngine();
        // UnifiedSatellitePropagator is static - no instantiation needed

        // Integration state
        this.isInitialized = false;
        // Removed complex timestep management - now handled by SatelliteIntegrator

        // Cached data for performance with size limits
        this.bodyStatesCache = new Map();
        this.orbitPathsCache = new Map();
        this.maxCacheSize = 50; // Maximum entries per cache
        this.cacheCleanupThreshold = 100; // Clean up when size exceeds this

        // Track last orientations to detect flips
        this._lastOrientations = new Map(); // naifId -> last quaternion

        // Timewarp configuration
        this._timeWarpOptions = [0, 0.25, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 1000000, 10000000];
        this._currentTimeWarpIndex = 2; // Default to 1x (index 2)

        // Frame counter for reduced frequency updates
        this._frameCount = 0;

        // Simple adaptive timestep management
        this._currentTimeStep = 1.0; // Default 1 second timestep
        this._baseTimeStep = 1.0;    // Base timestep for 1x time warp
    }

    /**
     * Initialize the physics integration
     */
    async initialize(initialTime = new Date()) {
        try {
            // Validate initialTime parameter first
            if (!initialTime || !(initialTime instanceof Date) || isNaN(initialTime.getTime())) {
                console.warn('[PhysicsManager] Invalid initialTime parameter, using current time');
                initialTime = new Date();
            }

            // Use app's current simulation time if available and valid
            let currentTime = initialTime;
            if (this.app.timeUtils?.getSimulatedTime) {
                const appTime = this.app.timeUtils.getSimulatedTime();
                if (appTime && appTime instanceof Date && !isNaN(appTime.getTime())) {
                    currentTime = appTime;
                } else {
                    console.warn('[PhysicsManager] App timeUtils returned invalid time, using initialTime');
                }
            }


            // Initialize the physics engine
            await this.physicsEngine.initialize(currentTime);

            // Set initial simulated time tracking
            this.lastSimulatedTime = new Date(currentTime.getTime());

            // Set up initial satellites if any exist
            this._syncExistingSatellites();

            // Set up time sync with app's TimeUtils
            this._setupTimeSync();

            this.isInitialized = true;

            return this;
        } catch (error) {
            console.error('[PhysicsManager] Failed to initialize:', error);
            throw error;
        }
    }


    /**
     * Step simulation forward in time
     */
    async stepSimulation(deltaTime) {
        if (!this.isInitialized) return null;

        try {
            // Step physics forward
            const state = await this.physicsEngine.step(deltaTime);

            // **CRITICAL FIX**: Update TimeUtils with new physics time
            if (this.app?.timeUtils && state.time) {
                this.app.timeUtils.updateFromPhysics(state.time);
            }

            // Sync with celestial bodies (visual update only)
            this._syncWithCelestialBodies(state);

            // Sync with satellites (visual update only)
            this._syncSatelliteStates(state);

            // Orbit visualization now handled by streaming system (OrbitStreamer → orbitStreamUpdate events)
            // No manual orbit updates needed

            // Throttled physics event dispatch
            this._dispatchPhysicsUpdate(state);

            return state;
        } catch (error) {
            console.error('[PhysicsManager] Error in stepSimulation:', error);
            return null;
        }
    }

    /**
     * Add a satellite to the physics simulation
     */
    addSatellite(satelliteData) {
        if (!this.isInitialized) {
            console.warn('[PhysicsManager] Cannot add satellite - not initialized');
            return;
        }

        // PhysicsEngine is the single source of truth
        const id = this.physicsEngine.addSatellite(satelliteData);
        
        // Trigger immediate physics update for responsive UI
        if (id && this.physicsEngine) {
            const currentState = this.physicsEngine.getSimulationState();
            if (currentState) {
                this._dispatchPhysicsUpdate(currentState, true); // immediate = true
            }
        }
        
        return id;
    }

    /**
     * Remove a satellite from the physics simulation
     */
    removeSatellite(satelliteId) {
        if (!this.isInitialized) return;
        // PhysicsEngine handles everything including event dispatch
        this.physicsEngine.removeSatellite(satelliteId);
    }

    /**
     * Update satellite property (color, name, etc)
     */
    updateSatelliteProperty(satelliteId, property, value) {
        if (!this.isInitialized) return;
        this.physicsEngine.updateSatelliteProperty(satelliteId, property, value);
    }

    /**
     * Generate orbit path for a celestial body
     * @returns {Array<Array<number>>} Array of position arrays [x, y, z] in km
     */
    generateOrbitPath(bodyName, numPoints = 360) {
        if (!this.isInitialized) return [];

        const cacheKey = `${bodyName}_${numPoints}`;
        if (this.orbitPathsCache.has(cacheKey)) {
            return this.orbitPathsCache.get(cacheKey);
        }

        // Find the body in current state
        const state = this.physicsEngine.getSimulationState();
        const body = this._findBodyByName(state.bodies, bodyName);
        const parent = this._findParentBody(state.bodies, body);

        if (!body || !parent) {
            return [];
        }

        // Generate orbit path using OrbitalMechanics
        const orbitPath = this._generateOrbitPathFromElements(body, parent, numPoints);

        // Cache the result
        this.orbitPathsCache.set(cacheKey, orbitPath);

        return orbitPath;
    }

    /**
     * Generate future trajectory for a satellite
     * @returns {Array<Array<number>>} Array of position arrays [x, y, z] in km
     */
    async generateSatelliteTrajectory(satelliteId, duration = 3600, timeStep = 60) {
        if (!this.isInitialized) return [];

        const state = this.physicsEngine.getSimulationState();
        const satellite = state.satellites[satelliteId];

        if (!satellite) {
            return [];
        }

        // Get current simulation time
        const currentSimTime = this.physicsEngine.simulationTime || new Date();
        const startTimeSeconds = currentSimTime.getTime() / 1000; // Convert to seconds since epoch

        // Use UnifiedSatellitePropagator for trajectory generation
        const propagatedPoints = UnifiedSatellitePropagator.propagateOrbit({
            satellite: {
                position: satellite.position,
                velocity: satellite.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId || 399,
                mass: satellite.mass || 1000,
                crossSectionalArea: satellite.crossSectionalArea || PhysicsConstants.SATELLITE_DEFAULTS.CROSS_SECTIONAL_AREA,
                dragCoefficient: satellite.dragCoefficient || 2.2
            },
            bodies: state.bodies,
            duration,
            timeStep,
            startTime: startTimeSeconds, // Use current simulation time
            includeJ2: true,
            includeDrag: true,
            includeThirdBody: false
        });

        // Return array of position arrays for frontend conversion
        return propagatedPoints.map(pt => pt.position);
    }

    /**
     * Get orbital elements for a body
     */
    getOrbitalElements(bodyName) {
        const state = this.physicsEngine.getSimulationState();
        const body = this._findBodyByName(state.bodies, bodyName);
        const parent = this._findParentBody(state.bodies, body);

        if (!body || !parent) return null;

        // Calculate relative position and velocity using physics vectors
        const bodyPos = PhysicsVector3.fromArray(body.position);
        const parentPos = PhysicsVector3.fromArray(parent.position);
        const relPos = bodyPos.clone().sub(parentPos);

        const bodyVel = PhysicsVector3.fromArray(body.velocity);
        const parentVel = PhysicsVector3.fromArray(parent.velocity);
        const relVel = bodyVel.clone().sub(parentVel);

        const mu = parent.mu || (parent.mass * PhysicsConstants.PHYSICS.G); // G in km³/kg/s²

        return OrbitalMechanics.calculateOrbitalElements(relPos, relVel, mu, parent.radius || 0);
    }


    /**
     * Get available timewarp options
     * @returns {number[]} Array of available timewarp multipliers
     */
    getTimeWarpOptions() {
        return [...this._timeWarpOptions];
    }

    /**
     * Get current timewarp value
     * @returns {number} Current timewarp multiplier
     */
    getCurrentTimeWarp() {
        return this._timeWarpOptions[this._currentTimeWarpIndex];
    }

    /**
     * Set timewarp by index
     * @param {number} index - Index in the timewarp options array
     */
    setTimeWarpIndex(index) {
        if (index >= 0 && index < this._timeWarpOptions.length) {
            this._currentTimeWarpIndex = index;
        }
    }

    /**
     * Set timewarp by value (finds closest match)
     * @param {number} value - Desired timewarp value
     */
    setTimeWarpValue(value) {
        const index = this._timeWarpOptions.findIndex(v => v === value);
        if (index !== -1) {
            this._currentTimeWarpIndex = index;
        }
    }

    /**
     * Increase timewarp to next level
     */
    increaseTimeWarp() {
        if (this._currentTimeWarpIndex < this._timeWarpOptions.length - 1) {
            this._currentTimeWarpIndex++;
        }
    }

    /**
     * Decrease timewarp to previous level
     */
    decreaseTimeWarp() {
        if (this._currentTimeWarpIndex > 0) {
            this._currentTimeWarpIndex--;
        }
    }

    /**
     * Step physics externally for testing (bypasses App3D time loop)
     * @param {number} realDeltaTime - Real world delta time in seconds
     * @param {number} timeWarp - Time warp multiplier
     */
    async stepPhysicsExternal(realDeltaTime, timeWarp) {
        if (!this.isInitialized) return null;

        // Use the passed timeWarp parameter directly as deltaTime
        // Don't apply timeWarp twice - the physics engine will handle time scaling
        const physicsTimeStep = realDeltaTime;

        try {
            // Step physics forward - let physics engine handle time warp internally
            const state = await this.physicsEngine.step(physicsTimeStep, timeWarp);

            // **CRITICAL FIX**: Update TimeUtils with new physics time
            if (this.app?.timeUtils && state.time) {
                this.app.timeUtils.updateFromPhysics(state.time);
            }

            // Sync with celestial bodies (visual update only)
            this._syncWithCelestialBodies(state);

            // Sync with satellites (visual update only)  
            this._syncSatelliteStates(state);

            // Orbit visualization now handled by streaming system (OrbitStreamer → orbitStreamUpdate events)
            // No manual orbit updates needed

            // Setup time sync
            this._setupTimeSync();

            // Throttled physics event dispatch
            this._dispatchPhysicsUpdate(state);

            return state;
        } catch (error) {
            console.error('[PhysicsManager] Error in stepPhysicsExternal:', error);
            return null;
        }
    }

    /**
     * Get current adaptive timestep for external use
     */
    getAdaptiveTimestep(timeWarp) {
        this._updateAdaptiveTimestep(timeWarp);
        return this._currentTimeStep;
    }

    /**
     * Update adaptive timestep based on time warp factor
     * @private
     */
    _updateAdaptiveTimestep(timeWarp) {
        // Simple adaptive timestep: scale base timestep with time warp
        // Clamp to reasonable bounds for stability
        if (timeWarp <= 1) {
            this._currentTimeStep = this._baseTimeStep;
        } else if (timeWarp <= 100) {
            this._currentTimeStep = this._baseTimeStep * timeWarp;
        } else {
            // For very high time warps, use larger but capped timesteps
            this._currentTimeStep = Math.min(this._baseTimeStep * timeWarp, 60); // Max 60 seconds
        }
    }

    // Removed _stepPhysicsHighWarp - no longer needed with simplified time warp handling

    /**
     * Sync existing satellites from the app to physics engine
     * @private
     */
    _syncExistingSatellites() {
        // Check if the app has existing satellites to sync
        if (!this.app.satellites) return;

        const satellitesMap = this.app.satellites.getSatellitesMap?.();
        if (!satellitesMap || satellitesMap.size === 0) return;

        // Add each satellite to the physics engine
        for (const [satellite] of satellitesMap) {
            if (satellite.position && satellite.velocity) {
                try {
                    this.physicsEngine.addSatellite({
                        id: satellite.id,
                        position: satellite.position.toArray(),
                        velocity: satellite.velocity.toArray(),
                        mass: satellite.mass || 1000,
                        size: satellite.size || 1,
                        crossSectionalArea: satellite.crossSectionalArea || PhysicsConstants.SATELLITE_DEFAULTS.CROSS_SECTIONAL_AREA,
                        dragCoefficient: satellite.dragCoefficient || 2.2,
                        centralBodyNaifId: satellite.centralBodyNaifId || 399
                    });
                } catch {
                    // Ignore failed syncs
                }
            }
        }
    }

    /**
     * Cleanup and stop the physics integration
     */
    cleanup() {
        // Cleanup time sync
        if (this.cleanupTimeSync) {
            this.cleanupTimeSync();
            this.cleanupTimeSync = null;
        }

        // Clear our caches
        this.bodyStatesCache.clear();
        this.orbitPathsCache.clear();

        this.isInitialized = false;
    }

    /**
     * Clean up cache when it gets too large (LRU eviction)
     * @private
     */
    _cleanupCache(cache, maxSize) {
        if (cache.size <= maxSize) return;

        // Convert to array, sort by access time (if available), remove oldest
        const entries = Array.from(cache.entries());
        const entriesToRemove = entries.slice(0, cache.size - maxSize);

        for (const [key] of entriesToRemove) {
            cache.delete(key);
        }
    }

    /**
     * Manage cache sizes and cleanup when needed
     * @private
     */
    _manageCaches() {
        if (this.bodyStatesCache.size > this.cacheCleanupThreshold) {
            this._cleanupCache(this.bodyStatesCache, this.maxCacheSize);
        }
        if (this.orbitPathsCache.size > this.cacheCleanupThreshold) {
            this._cleanupCache(this.orbitPathsCache, this.maxCacheSize);
        }
    }

    /**
     * Check if a system is a multi-body system where bodies orbit around a shared barycenter
     */
    _isMultiBodySystem(bodyNaifId) {
        // Check if the body itself is marked as a multi-body system component
        const bodyConfig = solarSystemDataManager.getBodyByNaif(bodyNaifId);
        if (bodyConfig && bodyConfig.multiBodySystemComponent) {
            return true;
        }

        return false;
    }

    /**
     * Private: Sync physics state with existing celestial bodies
     * Sets physics data properties on celestial bodies for frontend conversion:
     * - physicsPosition: [x, y, z] array in km
     * - physicsVelocity: [x, y, z] array in km/s  
     * - physicsQuaternion: [x, y, z, w] array for orientation
     * - physicsNorthPole: [x, y, z] array for north pole vector
     */
    _syncWithCelestialBodies(state) {
        if (!this.app.celestialBodies || !Array.isArray(this.app.celestialBodies)) {
            return;
        }

        for (const celestialBody of this.app.celestialBodies) {
            // Get the NAIF ID from the celestial body
            const naifId = celestialBody.naifId;
            if (!naifId) continue;

            // Get the physics state for this body
            const bodyState = state.bodies[naifId];
            if (!bodyState) continue;

            try {
                // Check if this body has a parent in the hierarchy (needed for both position and velocity)
                const bodyConfig = solarSystemDataManager.getBodyByNaif(naifId);
                let parentNaifId = null;
                if (bodyConfig && bodyConfig.parent) {
                    const parentConfig = solarSystemDataManager.getBodyByName(bodyConfig.parent);
                    if (parentConfig && parentConfig.naifId !== undefined) {
                        parentNaifId = parentConfig.naifId;
                    }
                }

                // Store absolute position as physics data (frontend will convert to Three.js)
                if (Array.isArray(bodyState.position)) {
                    celestialBody.physicsPosition = [...bodyState.position];
                }

                // Update target position (Planet class expects this)
                if (celestialBody.targetPosition && Array.isArray(bodyState.position)) {

                    // For single-planet systems (like dwarf planets), the planet position IS the absolute position
                    // For multi-body systems (like Earth-Moon, Pluto-Charon), calculate relative to parent
                    const isMultiBodySystem = this._isMultiBodySystem(naifId, parentNaifId);

                    // Check if this body is parented to another body in the Three.js scene
                    const orbitGroup = celestialBody.getOrbitGroup?.();
                    const hasSceneParent = orbitGroup && orbitGroup.parent && orbitGroup.parent !== this.app.scene;

                    if (hasSceneParent || isMultiBodySystem) {
                        // Body is parented to another body (barycenter) in the scene graph
                        // OR it's a multi-body system component
                        // Calculate relative position to parent
                        if (parentNaifId && state.bodies[parentNaifId]) {
                            const parentState = state.bodies[parentNaifId];
                            celestialBody.targetPosition.set(
                                bodyState.position[0] - parentState.position[0],
                                bodyState.position[1] - parentState.position[1],
                                bodyState.position[2] - parentState.position[2]
                            );
                        } else {
                            // Fallback to 0,0,0 if no parent found
                            celestialBody.targetPosition.set(0, 0, 0);
                        }
                    } else {
                        // Body is at scene root: use absolute SSB position
                        celestialBody.targetPosition.set(
                            bodyState.position[0],
                            bodyState.position[1],
                            bodyState.position[2]
                        );
                    }
                }

                // ALWAYS provide BOTH absolute and local velocities for ALL bodies
                if (Array.isArray(bodyState.velocity)) {
                    // Store absolute velocity (SSB-relative velocity from PositionManager)
                    celestialBody.absoluteVelocity = [...bodyState.velocity];
                    celestialBody.physicsVelocity = [...bodyState.velocity]; // Legacy alias

                    // Calculate local velocity (velocity relative to immediate parent)
                    if (parentNaifId && state.bodies[parentNaifId] && Array.isArray(state.bodies[parentNaifId].velocity)) {
                        // Body has a parent - calculate relative velocity
                        const parentVelocity = state.bodies[parentNaifId].velocity;
                        celestialBody.localVelocity = [
                            bodyState.velocity[0] - parentVelocity[0],
                            bodyState.velocity[1] - parentVelocity[1],
                            bodyState.velocity[2] - parentVelocity[2]
                        ];
                    } else {
                        // Body has no parent (SSB, Sun) OR is a barycenter - local = absolute
                        celestialBody.localVelocity = [...bodyState.velocity];
                    }
                }

                // Store orientation as physics data (frontend will convert to Three.js)

                // Update target orientation if we have quaternion data
                if (bodyState.quaternion && Array.isArray(bodyState.quaternion) && bodyState.quaternion.length === 4) {
                    // Store the raw physics quaternion data - let the frontend handle coordinate conversion
                    // bodyState.quaternion format: [x, y, z, w] from physics engine
                    const rawQuaternion = bodyState.quaternion;

                    // Check for flips using raw quaternion data
                    const lastQuat = this._lastOrientations.get(naifId);
                    if (lastQuat) {
                        // Calculate dot product manually to avoid THREE.js dependency
                        const dot = lastQuat[0] * rawQuaternion[0] +
                            lastQuat[1] * rawQuaternion[1] +
                            lastQuat[2] * rawQuaternion[2] +
                            lastQuat[3] * rawQuaternion[3];

                        // If quaternions are pointing in opposite directions, negate to take shorter path
                        if (dot < 0) {
                            rawQuaternion[0] *= -1;
                            rawQuaternion[1] *= -1;
                            rawQuaternion[2] *= -1;
                            rawQuaternion[3] *= -1;
                        }
                    }

                    // Store raw physics quaternion data - frontend will handle THREE.js conversion
                    celestialBody.physicsQuaternion = rawQuaternion;

                    // Store for next comparison (as array to avoid THREE.js dependency)
                    this._lastOrientations.set(naifId, [...rawQuaternion]);
                } else if (bodyState.quaternion && typeof bodyState.quaternion === 'object' &&
                    bodyState.quaternion.x !== undefined && bodyState.quaternion.y !== undefined &&
                    bodyState.quaternion.z !== undefined && bodyState.quaternion.w !== undefined) {
                    // Handle case where quaternion is a PhysicsQuaternion object instead of array
                    const rawQuaternion = [
                        bodyState.quaternion.x,
                        bodyState.quaternion.y,
                        bodyState.quaternion.z,
                        bodyState.quaternion.w
                    ];

                    // Check for flips using raw quaternion data
                    const lastQuat = this._lastOrientations.get(naifId);
                    if (lastQuat) {
                        // Calculate dot product manually to avoid THREE.js dependency
                        const dot = lastQuat[0] * rawQuaternion[0] +
                            lastQuat[1] * rawQuaternion[1] +
                            lastQuat[2] * rawQuaternion[2] +
                            lastQuat[3] * rawQuaternion[3];

                        // If quaternions are pointing in opposite directions, negate to take shorter path
                        if (dot < 0) {
                            rawQuaternion[0] *= -1;
                            rawQuaternion[1] *= -1;
                            rawQuaternion[2] *= -1;
                            rawQuaternion[3] *= -1;
                        }
                    }

                    // Store raw physics quaternion data - frontend will handle THREE.js conversion
                    celestialBody.physicsQuaternion = rawQuaternion;

                    // Store for next comparison (as array to avoid THREE.js dependency)
                    this._lastOrientations.set(naifId, [...rawQuaternion]);
                }

                // Also update the direct orientation if it exists
                if (celestialBody.orientation && bodyState.quaternion) {
                    celestialBody.orientation.set(
                        bodyState.quaternion[0],
                        bodyState.quaternion[1],
                        bodyState.quaternion[2],
                        bodyState.quaternion[3]
                    );
                }

                // Store additional orientation data for debugging/analysis
                if (bodyState.poleRA !== undefined) {
                    celestialBody.poleRA = bodyState.poleRA;
                    celestialBody.poleDec = bodyState.poleDec;
                    celestialBody.spin = bodyState.spin;

                    // Store north pole vector as physics data (frontend will convert to Three.js)
                    if (bodyState.northPole && Array.isArray(bodyState.northPole)) {
                        celestialBody.physicsNorthPole = [...bodyState.northPole];
                    }
                }

            } catch (error) {
                console.warn(`[PhysicsManager] Failed to update ${celestialBody.name}:`, error);
            }
        }
    }

    /**
     * Private: Sync satellite states with existing managers
     */
    _syncSatelliteStates(state) {
        if (!this.app.satellites || !state.satellites) return;

        const satellitesMap = this.app.satellites.getSatellitesMap?.();
        if (!satellitesMap) return;

        for (const [id, satelliteState] of Object.entries(state.satellites)) {
            const satId = String(id);
            const satellite = satellitesMap.get(satId);
            if (satellite) {
                satellite.updateVisualsFromState(satelliteState);
            }
        }
    }

    /**
     * Private: Find body by name in state
     */
    _findBodyByName(bodies, name) {
        for (const bodyState of Object.values(bodies)) {
            if (bodyState.name?.toLowerCase() === name.toLowerCase()) {
                return bodyState;
            }
        }
        return null;
    }

    /**
     * Private: Find parent body for a given body
     */
    _findParentBody(bodies, body) {
        if (!body) return null;

        // Use SolarSystemDataManager to find the parent NAIF ID
        const solarSystemDataManagerRef = this.solarSystemDataManager || (this.app?.solarSystemDataManager);
        let parentNaifId = null;
        if (solarSystemDataManagerRef && body.naifId !== undefined) {
            const config = solarSystemDataManagerRef.getBodyByNaif(body.naifId);
            if (config && config.parent !== undefined && config.parent !== null) {
                parentNaifId = config.parent;
            }
        } else if (body.parent !== undefined && body.parent !== null) {
            parentNaifId = body.parent;
        }
        if (parentNaifId !== null && bodies[parentNaifId]) {
            return bodies[parentNaifId];
        }
        // Fallback: Default to Sun for planets
        return this._findBodyByName(bodies, 'Sun');
    }

    /**
     * Private: Dispatch physics update event (throttled to prevent CPU overheating)
     */
    _dispatchPhysicsUpdate(state, immediate = false) {
        if (typeof window !== 'undefined') {
            // Allow immediate dispatch for critical events (like satellite creation)
            if (!immediate) {
                // Throttle physics events to max 10 per second for better responsiveness
                const now = Date.now();
                if (!this._lastPhysicsEventTime) this._lastPhysicsEventTime = 0;
                if (now - this._lastPhysicsEventTime < 100) return; // 100ms = 10 updates per second max
                this._lastPhysicsEventTime = now;
            }

            // Dispatch single consolidated physics update event
            window.dispatchEvent(new CustomEvent('physicsUpdate', {
                detail: {
                    state,
                    time: this.physicsEngine.simulationTime
                }
            }));
        }
    }

    /**
     * Private: Generate orbit path from orbital elements
     * @returns {Array<Array<number>>} Array of position arrays [x, y, z] in km
     */
    _generateOrbitPathFromElements(body, parent, numPoints) {
        // Use physics vectors for internal calculations
        const bodyPos = PhysicsVector3.fromArray(body.position);
        const parentPos = PhysicsVector3.fromArray(parent.position);
        const relPos = bodyPos.clone().sub(parentPos);

        const bodyVel = PhysicsVector3.fromArray(body.velocity);
        const parentVel = PhysicsVector3.fromArray(parent.velocity);
        const relVel = bodyVel.clone().sub(parentVel);

        const mu = parent.mu || (parent.mass * PhysicsConstants.PHYSICS.G); // G in km³/kg/s²

        // Calculate orbital elements
        const elements = OrbitalMechanics.calculateOrbitalElements(relPos, relVel, mu, parent.radius || 0);

        if (!elements || !isFinite(elements.semiMajorAxis) || elements.semiMajorAxis <= 0) {
            return [];
        }

        const points = [];
        const period = elements.period || (2 * Math.PI * Math.sqrt(Math.pow(elements.semiMajorAxis, 3) / mu));
        const dt = period / numPoints;

        for (let i = 0; i <= numPoints; i++) {
            const t = i * dt;

            // Calculate mean anomaly at time t
            const meanMotion = 2 * Math.PI / period;
            const meanAnomaly = (elements.meanAnomaly * Math.PI / 180) + meanMotion * t;

            // Create elements for this time
            const currentElements = {
                a: elements.semiMajorAxis,
                e: elements.eccentricity,
                i: elements.inclination,
                Omega: elements.longitudeOfAscendingNode,
                omega: elements.argumentOfPeriapsis,
                M0: meanAnomaly * 180 / Math.PI,
                epoch: 2451545.0 // J2000.0
            };

            // Get state vector at this time
            const stateVector = OrbitalMechanics.orbitalElementsToStateVector(
                currentElements,
                2451545.0, // Current JD (simplified)
                mu
            );

            // Add parent position to get absolute position (return as physics array)
            const parentPos = PhysicsVector3.fromArray(parent.position);
            const absolutePos = stateVector.position.add(parentPos);
            points.push(absolutePos.toArray());
        }

        return points;
    }

    /**
     * Get current simulation state from physics engine
     * @returns {Object} Current physics state with bodies, satellites, etc.
     */
    getSimulationState() {
        if (!this.isInitialized || !this.physicsEngine) {
            return null;
        }
        return this.physicsEngine.getSimulationState();
    }

    /**
     * Get satellites for line of sight calculations
     * @returns {Array} Array of satellite data for line of sight
     */
    getSatellitesForLineOfSight() {
        if (!this.isInitialized || !this.physicsEngine) {
            return [];
        }
        return this.physicsEngine.getSatellitesForLineOfSight();
    }

    /**
     * Get bodies for line of sight calculations
     * @returns {Array} Array of celestial body data for line of sight
     */
    getBodiesForLineOfSight() {
        if (!this.isInitialized || !this.physicsEngine) {
            return [];
        }
        return this.physicsEngine.getBodiesForLineOfSight();
    }

    /**
     * Add maneuver node to satellite
     * @param {string} satelliteId - ID of the satellite
     * @param {Object} maneuverNode - Maneuver node data
     * @returns {string} Node ID
     */
    addManeuverNode(satelliteId, maneuverNode) {
        if (!this.isInitialized || !this.physicsEngine) {
            return null;
        }
        return this.physicsEngine.addManeuverNode(satelliteId, maneuverNode);
    }

    /**
     * Remove maneuver node from satellite
     * @param {string} satelliteId - ID of the satellite
     * @param {string} nodeId - ID of the maneuver node
     */
    removeManeuverNode(satelliteId, nodeId) {
        if (!this.isInitialized || !this.physicsEngine) {
            return;
        }
        this.physicsEngine.removeManeuverNode(satelliteId, nodeId);
    }

    /**
     * Private: Set up synchronization with app's time system
     */
    _setupTimeSync() {
        // Time sync is now handled by SimulationLoop calling stepPhysicsExternal
    }

    // ================================================================
    // PROPERTY GETTERS FOR EXTERNAL API COMPATIBILITY
    // ================================================================

    /**
     * Get satellites map for external API compatibility
     * @returns {Map} Map of satellites from physics engine
     */
    get satellites() {
        return this.physicsEngine?.satellites || new Map();
    }

    /**
     * Get satellite engine for external API compatibility
     * @returns {SatelliteEngine} Satellite engine instance
     */
    get satelliteEngine() {
        return this.physicsEngine?.satelliteEngine || null;
    }

    /**
     * Get maneuver nodes for external API compatibility
     * @returns {Map} Map of maneuver nodes from physics engine
     */
    get maneuverNodes() {
        return this.physicsEngine?.maneuverNodes || new Map();
    }
} 