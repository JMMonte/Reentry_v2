import * as THREE from 'three';
import { PhysicsEngine } from './PhysicsEngine.js';
import { OrbitPropagator } from './OrbitPropagator.js';

/**
 * Integration manager that bridges the new physics engine with existing codebase.
 */
export class PhysicsIntegration {
    constructor(app) {
        this.app = app; // Reference to main App3D instance
        this.physicsEngine = new PhysicsEngine();
        this.orbitPropagator = new OrbitPropagator();

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
                console.warn('[PhysicsIntegration] Invalid initialTime parameter, using current time');
                initialTime = new Date();
            }

            // Use app's current simulation time if available and valid
            let currentTime = initialTime;
            if (this.app.timeUtils?.getSimulatedTime) {
                const appTime = this.app.timeUtils.getSimulatedTime();
                if (appTime && appTime instanceof Date && !isNaN(appTime.getTime())) {
                    currentTime = appTime;
                } else {
                    console.warn('[PhysicsIntegration] App timeUtils returned invalid time, using initialTime');
                }
            }

            // console.log('[PhysicsIntegration] Initializing with time:', currentTime.toISOString());

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
            // console.log('[PhysicsIntegration] Successfully initialized');

            return this;
        } catch (error) {
            console.error('[PhysicsIntegration] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Update simulation time and propagate physics
     */
    async setSimulationTime(newTime) {
        if (!this.isInitialized) return;

        await this.physicsEngine.setTime(newTime);

        // Update all body positions using the physics engine
        const state = await this.physicsEngine.step(0); // No time advance, just update positions

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
        // Throttle log: only log every 5 seconds
        if (!this._lastStepLogTime || Date.now() - this._lastStepLogTime > 5000) {
            // console.log('[PhysicsIntegration] stepSimulation called with', deltaTime);
            this._lastStepLogTime = Date.now();
        }
        if (!this.isInitialized) return;

        const state = await this.physicsEngine.step(deltaTime);
        // console.log('[PhysicsIntegration] stepSimulation: state.satellites keys:', Object.keys(state.satellites));

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
            console.warn('[PhysicsIntegration] Cannot add satellite - not initialized');
            return;
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
            console.warn(`[PhysicsIntegration] Cannot find body or parent for ${bodyName}`);
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
            console.warn(`[PhysicsIntegration] Satellite ${satelliteId} not found`);
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

        // Convert to simulation time delta and add to accumulator
        const simulatedDeltaMs = realDeltaMs * timeWarp;
        const simulatedDeltaSeconds = simulatedDeltaMs / 1000;
        this._accumulator += simulatedDeltaSeconds;

        // Fixed timestep integration - process accumulated time in fixed chunks
        let stepsProcessed = 0;
        const maxSteps = 5; // Prevent spiral of death
        
        // If accumulator is too large (>1 second), it means we have high time warp
        // In this case, clamp it to prevent infinite processing
        if (this._accumulator > 1.0) {
            console.log(`[PhysicsIntegration] Large time accumulator detected (${this._accumulator.toFixed(3)}s), clamping to 1.0s for high time warp`);
            this._accumulator = 1.0;
        }
        
        while (this._accumulator >= this._fixedTimeStep && stepsProcessed < maxSteps) {
            // Get current time and advance by fixed timestep
            const currentTime = this.app.timeUtils.getSimulatedTime();
            const newTime = new Date(currentTime.getTime() + this._fixedTimeStep * 1000);

            // Update physics engine time (this updates all body positions)
            await this.physicsEngine.setTime(newTime);

            // Step physics simulation with fixed timestep
            await this.stepSimulation(this._fixedTimeStep);

            // Update TimeUtils with new time (this will dispatch UI events)
            this.app.timeUtils.updateFromPhysics(newTime);
            
            // Remove processed time from accumulator
            this._accumulator -= this._fixedTimeStep;
            stepsProcessed++;
        }
        
        // If we hit the step limit, clear remaining accumulator to prevent buildup
        if (stepsProcessed >= maxSteps && this._accumulator > 0) {
            console.log(`[PhysicsIntegration] Hit max steps limit (${maxSteps}), clearing remaining accumulator: ${this._accumulator.toFixed(3)}s`);
            this._accumulator = 0;
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
                // Update target position (Planet class expects this)
                if (celestialBody.targetPosition && Array.isArray(bodyState.position)) {
                    celestialBody.targetPosition.set(
                        bodyState.position[0],
                        bodyState.position[1],
                        bodyState.position[2]
                    );
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
                console.warn(`[PhysicsIntegration] Failed to update ${celestialBody.name}:`, error);
            }
        }

        // Also update the bodiesByNaifId map for backward compatibility
        if (this.app.bodiesByNaifId) {
            for (const [naifId, bodyState] of Object.entries(state.bodies)) {
                const body = this.app.bodiesByNaifId[naifId];
                if (body && body.targetPosition && Array.isArray(bodyState.position)) {
                    body.targetPosition.set(
                        bodyState.position[0],
                        bodyState.position[1],
                        bodyState.position[2]
                    );

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

        // if (bodiesUpdated > 0) {
        //     console.log(`[PhysicsIntegration] Updated ${bodiesUpdated} celestial bodies with correct positions`);
        // }
    }

    /**
     * Private: Sync satellite states with existing managers
     */
    _syncSatelliteStates(state) {
        // console.log('[PhysicsIntegration] _syncSatelliteStates: called with satellites keys:', Object.keys(state.satellites));
        if (!this.app.satelliteManager?.satellites) return;

        // Throttle log: only log every 5 seconds
        if (!this._lastSyncLogTime || Date.now() - this._lastSyncLogTime > 5000) {
            // console.log('[PhysicsIntegration] _syncSatelliteStates called, satellites:', Object.keys(state.satellites));
            this._lastSyncLogTime = Date.now();
        }

        for (const [id, satelliteState] of Object.entries(state.satellites)) {
            const satId = String(id);
            let satellite = this.app.satelliteManager.satellites.get(satId);
            if (satellite) {
                // Only log every 5 seconds
                if (!satellite._lastSyncLogTime || Date.now() - satellite._lastSyncLogTime > 5000) {
                    // console.log('[PhysicsIntegration] Syncing satellite', satId, satelliteState.position);
                    satellite._lastSyncLogTime = Date.now();
                }
                satellite.updateVisualsFromState(satelliteState);
            } else {
                if (!this._lastMissingLogTime || Date.now() - this._lastMissingLogTime > 5000) {
                    console.warn('[PhysicsIntegration] No UI satellite found for id', satId, 'keys:', Array.from(this.app.satelliteManager.satellites.keys()));
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
            console.warn('[PhysicsIntegration] Failed to update orbit visualizations:', error);
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

        // Use PlanetaryDataManager to find the parent NAIF ID
        const planetaryDataManager = this.planetaryDataManager || (this.app?.planetaryDataManager);
        let parentNaifId = null;
        if (planetaryDataManager && body.naifId !== undefined) {
            const config = planetaryDataManager.getBodyByNaif(body.naifId);
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
            console.warn('[PhysicsIntegration] No timeUtils found in app - time sync disabled');
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