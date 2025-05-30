import * as THREE from 'three';
import { PhysicsEngine } from './PhysicsEngine.js';
import { KeplerianPropagator } from './KeplerianPropagator.js';
import { solarSystemDataManager } from './bodies/PlanetaryDataManager.js';

/**
 * Physics Manager - Main interface between application and physics engine
 * Handles initialization, updates, and bridges to existing codebase
 */
export class PhysicsManager {
    constructor(app) {
        this.app = app; // Reference to main App3D instance
        this.physicsEngine = new PhysicsEngine();
        this.orbitPropagator = new KeplerianPropagator();

        // Integration state
        this.isInitialized = false;
        this.updateInterval = null;
        this.physicsUpdateRate = 60; // Hz - now the primary time driver
        this._lastRealTime = null; // Track real time for physics-driven stepping
        this._fixedTimeStep = 1.0 / 60.0; // Fixed 60Hz physics timestep (16.67ms)
        this._accumulator = 0.0; // Time accumulator for fixed timestep

        // Cached data for performance
        this.bodyStatesCache = new Map();
        this.orbitPathsCache = new Map();

        // Event bindings
        this.boundUpdateLoop = this.updateLoop.bind(this);
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

            // console.log('[PhysicsManager] Initializing with time:', currentTime.toISOString());

            // Initialize the physics engine
            await this.physicsEngine.initialize(currentTime);

            // Set initial simulated time tracking
            this.lastSimulatedTime = new Date(currentTime.getTime());

            // Set up initial satellites if any exist
            this._syncExistingSatellites();

            // Set up time sync with app's TimeUtils
            this._setupTimeSync();

            // Set up update loop
            this._startUpdateLoop();

            this.isInitialized = true;
            // console.log('[PhysicsManager] Successfully initialized');

            return this;
        } catch (error) {
            console.error('[PhysicsManager] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Update simulation time and propagate physics
     */
    async setSimulationTime(newTime) {
        if (!this.isInitialized) return;

        await this.physicsEngine.setTime(newTime);

        // Get current state without stepping (planets are already at correct positions from setTime)
        const state = this.physicsEngine.getSimulationState();

        // Sync with existing celestial bodies in the app
        this._syncWithCelestialBodies(state);

        // Update orbit visualizations
        this._updateOrbitVisualizations();

        // Notify any listeners
        this._dispatchPhysicsUpdate(state);
    }

    /**
     * Step the simulation forward by deltaTime seconds
     */
    async stepSimulation(deltaTime) {
        // Debug: Count step calls and track total time
        if (!this._stepCallCount) {
            this._stepCallCount = 0;
            this._totalDeltaTime = 0;
        }
        this._stepCallCount++;
        this._totalDeltaTime += deltaTime;
        
        // Throttle log: only log every 10 seconds
        if (!this._lastStepLogTime || Date.now() - this._lastStepLogTime > 10000) {
            // console.log(`[PhysicsManager] stepSimulation: ${this._stepCallCount} calls in 10s, total deltaTime: ${this._totalDeltaTime.toFixed(3)}s, avg: ${(this._totalDeltaTime/this._stepCallCount).toFixed(4)}s`);
            this._stepCallCount = 0;
            this._totalDeltaTime = 0;
            this._lastStepLogTime = Date.now();
        }
        if (!this.isInitialized) return;

        const state = await this.physicsEngine.step(deltaTime);
        // console.log('[PhysicsManager] stepSimulation: state.satellites keys:', Object.keys(state.satellites));

        // Sync with existing celestial bodies
        this._syncWithCelestialBodies(state);

        // Update satellite states in existing managers
        this._syncSatelliteStates(state);

        // Update orbit visualizations with new physics state
        this._updateOrbitVisualizations();

        // Dispatch physics update events
        this._dispatchPhysicsUpdate(state);

        return state;
    }

    /**
     * Add a satellite to the physics simulation
     */
    addSatellite(satelliteData) {
        if (!this.isInitialized) {
            console.warn('[PhysicsManager] Cannot add satellite - not initialized');
            return;
        }

        // Debug logging for velocity tracking
        console.log('[PhysicsManager.addSatellite] Adding satellite:');
        console.log('  satelliteData:', satelliteData);
        if (satelliteData.velocity) {
            const vel = satelliteData.velocity;
            const velMag = Math.sqrt(
                (vel.x || vel[0] || 0)**2 + 
                (vel.y || vel[1] || 0)**2 + 
                (vel.z || vel[2] || 0)**2
            );
            console.log('  Velocity magnitude:', velMag.toFixed(3), 'km/s');
        }

        // PhysicsEngine is the single source of truth
        const id = this.physicsEngine.addSatellite(satelliteData);
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
            console.warn(`[PhysicsManager] Cannot find body or parent for ${bodyName}`);
            return [];
        }

        const orbitPath = this.orbitPropagator.generateOrbitPath(body, parent, numPoints);

        // Cache the result
        this.orbitPathsCache.set(cacheKey, orbitPath);

        return orbitPath;
    }

    /**
     * Generate future trajectory for a satellite
     */
    generateSatelliteTrajectory(satelliteId, duration = 3600, timeStep = 60) {
        if (!this.isInitialized) return [];

        const state = this.physicsEngine.getSimulationState();
        const satellite = state.satellites[satelliteId];

        if (!satellite) {
            console.warn(`[PhysicsManager] Satellite ${satelliteId} not found`);
            return [];
        }

        // Get gravitational bodies for trajectory calculation
        const gravitationalBodies = Object.values(state.bodies);

        return this.orbitPropagator.generateTrajectory(
            satellite,
            gravitationalBodies,
            duration,
            timeStep
        );
    }

    /**
     * Get orbital elements for a body
     */
    getOrbitalElements(bodyName) {
        const state = this.physicsEngine.getSimulationState();
        const body = this._findBodyByName(state.bodies, bodyName);
        const parent = this._findParentBody(state.bodies, body);

        if (!body || !parent) return null;

        return this.orbitPropagator.calculateOrbitalElements(body, parent);
    }

    /**
     * Set physics integration method
     */
    setIntegrator(method) {
        this.physicsEngine.setIntegrator(method);
    }

    /**
     * Enable/disable relativistic corrections
     */
    setRelativisticCorrections(enabled) {
        this.physicsEngine.setRelativisticCorrections(enabled);
    }

    /**
     * Cleanup and stop the physics integration
     */
    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Cleanup time sync
        if (this.cleanupTimeSync) {
            this.cleanupTimeSync();
            this.cleanupTimeSync = null;
        }

        this.orbitPropagator.clearCache();
        this.bodyStatesCache.clear();
        this.orbitPathsCache.clear();

        this.isInitialized = false;
    }

    /**
     * Private: Start the physics update loop
     */
    _startUpdateLoop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Initialize real time tracking
        this._lastRealTime = performance.now();

        this.updateInterval = setInterval(this.boundUpdateLoop, 1000 / this.physicsUpdateRate);
    }

    /**
     * Private: Main update loop - now the primary time driver
     */
    async updateLoop() {
        if (!this.isInitialized || !this.app.timeUtils) return;

        const timeWarp = this.app.timeUtils.getTimeWarp();

        // If paused, don't advance time
        if (timeWarp === 0) {
            // Still update orbit visualizations even when paused for real-time updates
            this._updateOrbitVisualizations();
            return;
        }
        

        // Calculate real time elapsed since last update
        const now = performance.now();
        const realDeltaMs = now - (this._lastRealTime || now);
        this._lastRealTime = now;

        // Convert to simulation time delta
        const simulatedDeltaMs = realDeltaMs * timeWarp;
        const simulatedDeltaSeconds = simulatedDeltaMs / 1000;

        // Add to accumulator for fixed timestep integration
        this._accumulator += simulatedDeltaSeconds;
        
        // Fixed timestep integration parameters
        let maxSteps = 5;
        
        // For very high time warps, allow more steps per frame to keep up
        if (timeWarp >= 10000) {
            maxSteps = Math.min(100, Math.ceil(simulatedDeltaSeconds / this._fixedTimeStep));
        } else if (timeWarp >= 1000) {
            maxSteps = Math.min(50, Math.ceil(simulatedDeltaSeconds / this._fixedTimeStep));
        } else if (timeWarp >= 100) {
            maxSteps = Math.min(20, Math.ceil(simulatedDeltaSeconds / this._fixedTimeStep));
        }
        
        // Clamp accumulator to prevent spiral of death
        const maxAccumulator = maxSteps * this._fixedTimeStep;
        if (this._accumulator > maxAccumulator) {
            // Only log if clamping by a significant amount
            if (this._accumulator - maxAccumulator > 0.1) {
                // console.log(`[PhysicsManager] Clamping accumulator from ${this._accumulator.toFixed(3)}s to ${maxAccumulator.toFixed(3)}s`);
            }
            this._accumulator = maxAccumulator;
        }
        
        // Process accumulated time in fixed timestep chunks
        let stepsProcessed = 0;
        while (this._accumulator >= this._fixedTimeStep && stepsProcessed < maxSteps) {
            // Get current time and advance by fixed timestep
            const currentTime = this.app.timeUtils.getSimulatedTime();
            const newTime = new Date(currentTime.getTime() + this._fixedTimeStep * 1000);

            // Update physics engine time (this updates all body positions)
            await this.physicsEngine.setTime(newTime);

            // Step physics simulation with fixed timestep - ALWAYS use _fixedTimeStep for satellites
            await this.stepSimulation(this._fixedTimeStep);

            // Update TimeUtils with new time (this will dispatch UI events)
            this.app.timeUtils.updateFromPhysics(newTime);
            
            // Remove processed time from accumulator
            this._accumulator -= this._fixedTimeStep;
            stepsProcessed++;
        }
        
        // If we couldn't process all accumulated time, log it
        if (this._accumulator > this._fixedTimeStep && stepsProcessed >= maxSteps) {
            // console.log(`[PhysicsManager] Hit max steps (${maxSteps}) at ${timeWarp}x warp, ${this._accumulator.toFixed(3)}s remaining`);
        }
        
        // Always update orbit visualizations for smooth rendering
        this._updateOrbitVisualizations();
    }

    /**
     * Private: Sync existing satellites with physics engine
     */
    _syncExistingSatellites() {
        // No longer needed - physics engine is the single source of truth
        // Satellites will be added through the normal flow
    }

    /**
     * Check if a system is a multi-body system where bodies orbit around a shared barycenter
     */
    _isMultiBodySystem(bodyNaifId, parentNaifId) {
        // Known multi-body systems where the barycenter is significantly displaced
        const knownMultiBodySystems = [
            3  // Earth-Moon Barycenter (EMB)
        ];
        
        return knownMultiBodySystems.includes(parentNaifId);
    }

    /**
     * Private: Sync physics state with existing celestial bodies
     */
    _syncWithCelestialBodies(state) {
        if (!this.app.celestialBodies || !Array.isArray(this.app.celestialBodies)) {
            return;
        }

        // let bodiesUpdated = 0;

        for (const celestialBody of this.app.celestialBodies) {
            // Get the NAIF ID from the celestial body
            const naifId = celestialBody.naifId;
            if (!naifId) continue;

            // Get the physics state for this body
            const bodyState = state.bodies[naifId];
            if (!bodyState) continue;

            try {
                // Store absolute position for physics calculations and orbit rendering
                if (!celestialBody.absolutePosition) {
                    celestialBody.absolutePosition = new THREE.Vector3();
                }
                if (Array.isArray(bodyState.position)) {
                    celestialBody.absolutePosition.set(
                        bodyState.position[0],
                        bodyState.position[1], 
                        bodyState.position[2]
                    );
                }
                
                // Update target position (Planet class expects this)
                if (celestialBody.targetPosition && Array.isArray(bodyState.position)) {
                    // Check if this body has a parent in the hierarchy
                    const bodyConfig = solarSystemDataManager.getBodyByNaif(naifId);
                    let parentNaifId = null;
                    if (bodyConfig && bodyConfig.parent) {
                        const parentConfig = solarSystemDataManager.getBodyByName(bodyConfig.parent);
                        if (parentConfig && parentConfig.naifId !== undefined) {
                            parentNaifId = parentConfig.naifId;
                        }
                    }
                    
                    // For single-planet systems (like dwarf planets), the planet position IS the absolute position
                    // For multi-body systems (like Earth-Moon, Pluto-Charon), calculate relative to parent
                    // const bodyConfig = this.physicsEngine.positionManager?.hierarchy?.getBodyInfo?.(naifId);
                    const isMultiBodySystem = this._isMultiBodySystem(naifId, parentNaifId);
                    
                    if (parentNaifId && state.bodies[parentNaifId] && isMultiBodySystem) {
                        // Multi-body system: calculate relative position to parent
                        const parentState = state.bodies[parentNaifId];
                        celestialBody.targetPosition.set(
                            bodyState.position[0] - parentState.position[0],
                            bodyState.position[1] - parentState.position[1],
                            bodyState.position[2] - parentState.position[2]
                        );
                    } else {
                        // Single-planet system or no parent: use absolute position
                        celestialBody.targetPosition.set(
                            bodyState.position[0],
                            bodyState.position[1],
                            bodyState.position[2]
                        );
                    }
                }

                // Store velocity for orbital calculations if needed
                if (Array.isArray(bodyState.velocity)) {
                    if (!celestialBody.velocity) {
                        celestialBody.velocity = new THREE.Vector3();
                    }
                    celestialBody.velocity.set(
                        bodyState.velocity[0],
                        bodyState.velocity[1],
                        bodyState.velocity[2]
                    );
                }

                // Update target orientation if we have quaternion data
                if (celestialBody.targetOrientation && bodyState.quaternion) {
                    // Convert quaternion array back to Three.js Quaternion
                    // bodyState.quaternion format: [x, y, z, w]
                    celestialBody.targetOrientation.set(
                        bodyState.quaternion[0], // x
                        bodyState.quaternion[1], // y  
                        bodyState.quaternion[2], // z
                        bodyState.quaternion[3]  // w
                    );
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

                    // Store north pole vector if needed
                    if (bodyState.northPole && Array.isArray(bodyState.northPole)) {
                        if (!celestialBody.northPole) {
                            celestialBody.northPole = new THREE.Vector3();
                        }
                        celestialBody.northPole.fromArray(bodyState.northPole);
                    }
                }

                // bodiesUpdated++;

            } catch (error) {
                console.warn(`[PhysicsManager] Failed to update ${celestialBody.name}:`, error);
            }
        }

        // Also update the bodiesByNaifId map for backward compatibility
        if (this.app.bodiesByNaifId) {
            for (const [naifId, bodyState] of Object.entries(state.bodies)) {
                const body = this.app.bodiesByNaifId[naifId];
                if (body && Array.isArray(bodyState.position)) {
                    // Store absolute position
                    if (!body.absolutePosition) {
                        body.absolutePosition = new THREE.Vector3();
                    }
                    body.absolutePosition.set(
                        bodyState.position[0],
                        bodyState.position[1],
                        bodyState.position[2]
                    );
                    
                    // Update target position for rendering
                    if (body.targetPosition) {
                        // Check if this body has a parent in the hierarchy
                        const bodyConfig2 = solarSystemDataManager.getBodyByNaif(parseInt(naifId));
                        let parentNaifId2 = null;
                        if (bodyConfig2 && bodyConfig2.parent) {
                            const parentConfig2 = solarSystemDataManager.getBodyByName(bodyConfig2.parent);
                            if (parentConfig2 && parentConfig2.naifId !== undefined) {
                                parentNaifId2 = parentConfig2.naifId;
                            }
                        }
                        
                        if (parentNaifId2 && state.bodies[parentNaifId2]) {
                            // Calculate relative position to parent
                            const parentState = state.bodies[parentNaifId2];
                            body.targetPosition.set(
                                bodyState.position[0] - parentState.position[0],
                                bodyState.position[1] - parentState.position[1],
                                bodyState.position[2] - parentState.position[2]
                            );
                        } else {
                            // No parent, use absolute position
                            body.targetPosition.set(
                                bodyState.position[0],
                                bodyState.position[1],
                                bodyState.position[2]
                            );
                        }
                    }

                    // Store velocity
                    if (!body.velocity) {
                        body.velocity = new THREE.Vector3();
                    }
                    if (Array.isArray(bodyState.velocity)) {
                        body.velocity.set(
                            bodyState.velocity[0],
                            bodyState.velocity[1],
                            bodyState.velocity[2]
                        );
                    }

                    // Update orientation
                    if (body.targetOrientation && bodyState.quaternion) {
                        body.targetOrientation.set(
                            bodyState.quaternion[0],
                            bodyState.quaternion[1],
                            bodyState.quaternion[2],
                            bodyState.quaternion[3]
                        );
                    }

                    // Store additional orientation data
                    if (bodyState.poleRA !== undefined) {
                        body.poleRA = bodyState.poleRA;
                        body.poleDec = bodyState.poleDec;
                        body.spin = bodyState.spin;

                        if (bodyState.northPole && Array.isArray(bodyState.northPole)) {
                            if (!body.northPole) {
                                body.northPole = new THREE.Vector3();
                            }
                            body.northPole.fromArray(bodyState.northPole);
                        }
                    }
                }
            }
        }

        // Also update barycenter positions
        if (state.barycenters && this.app.bodiesByNaifId) {
            for (const [naifId, barycenterState] of Object.entries(state.barycenters)) {
                const barycenter = this.app.bodiesByNaifId[naifId];
                if (barycenter && barycenter.targetPosition && Array.isArray(barycenterState.position)) {
                    // Barycenters always use absolute positions (no parent in rendering)
                    barycenter.targetPosition.set(
                        barycenterState.position[0],
                        barycenterState.position[1],
                        barycenterState.position[2]
                    );
                    
                    // Store velocity if available
                    if (barycenterState.velocity && Array.isArray(barycenterState.velocity)) {
                        if (!barycenter.velocity) {
                            barycenter.velocity = new THREE.Vector3();
                        }
                        barycenter.velocity.set(
                            barycenterState.velocity[0],
                            barycenterState.velocity[1],
                            barycenterState.velocity[2]
                        );
                    }
                }
            }
        }

        // if (bodiesUpdated > 0) {
        //     console.log(`[PhysicsManager] Updated ${bodiesUpdated} celestial bodies with correct positions`);
        // }
    }

    /**
     * Private: Sync satellite states with existing managers
     */
    _syncSatelliteStates(state) {
        // console.log('[PhysicsManager] _syncSatelliteStates: called with satellites keys:', Object.keys(state.satellites));
        if (!this.app.satelliteManager?.satellites) return;

        // Throttle log: only log every 5 seconds
        if (!this._lastSyncLogTime || Date.now() - this._lastSyncLogTime > 5000) {
            // console.log('[PhysicsManager] _syncSatelliteStates called, satellites:', Object.keys(state.satellites));
            this._lastSyncLogTime = Date.now();
        }

        for (const [id, satelliteState] of Object.entries(state.satellites)) {
            const satId = String(id);
            let satellite = this.app.satelliteManager.satellites.get(satId);
            if (satellite) {
                // Only log every 5 seconds
                if (!satellite._lastSyncLogTime || Date.now() - satellite._lastSyncLogTime > 5000) {
                    // console.log('[PhysicsManager] Syncing satellite', satId, satelliteState.position);
                    satellite._lastSyncLogTime = Date.now();
                }
                satellite.updateVisualsFromState(satelliteState);
            } else {
                if (!this._lastMissingLogTime || Date.now() - this._lastMissingLogTime > 5000) {
                    console.warn('[PhysicsManager] No UI satellite found for id', satId, 'keys:', Array.from(this.app.satelliteManager.satellites.keys()));
                    this._lastMissingLogTime = Date.now();
                }
            }
        }
    }

    /**
     * Private: Update orbit visualizations
     */
    _updateOrbitVisualizations() {
        if (!this.app.orbitManager) return;

        // Use the new update method which checks if orbits need updating
        try {
            this.app.orbitManager.update();
        } catch (error) {
            console.warn('[PhysicsManager] Failed to update orbit visualizations:', error);
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
     * Private: Dispatch physics update event
     */
    _dispatchPhysicsUpdate(state) {
        if (typeof window !== 'undefined') {
            // Dispatch general physics update event
            window.dispatchEvent(new CustomEvent('physicsUpdate', {
                detail: {
                    state,
                    time: this.physicsEngine.simulationTime
                }
            }));
            // Also dispatch specific physics state update for React components
            window.dispatchEvent(new CustomEvent('physicsStateUpdate', {
                detail: {
                    satellites: state.satellites || {}
                }
            }));
        }
    }

    /**
     * Private: Set up synchronization with app's time system
     */
    _setupTimeSync() {
        if (!this.app.timeUtils) {
            console.warn('[PhysicsManager] No timeUtils found in app - time sync disabled');
            return;
        }

        // Listen for time update events from the time system
        const handleTimeUpdate = async (event) => {
            if (!this.isInitialized) return;

            const { simulatedTime } = event.detail;
            const newTime = new Date(simulatedTime);

            // Update physics engine time (this now automatically updates all body positions)
            await this.physicsEngine.setTime(newTime);

            // Force a physics update to sync positions with new time
            this.setSimulationTime(newTime);
        };

        document.addEventListener('timeUpdate', handleTimeUpdate);

        // Store cleanup function
        this.cleanupTimeSync = () => {
            document.removeEventListener('timeUpdate', handleTimeUpdate);
        };
    }
} 