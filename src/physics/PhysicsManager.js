import * as THREE from 'three';
import { PhysicsEngine } from './PhysicsEngine.js';
import { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
import { OrbitalMechanics } from './core/OrbitalMechanics.js';
import { solarSystemDataManager } from './PlanetaryDataManager.js';

/**
 * Physics Manager - Main interface between application and physics engine
 * Handles initialization, updates, and bridges to existing codebase
 */
export class PhysicsManager {
    constructor(app) {
        this.app = app; // Reference to main App3D instance
        this.physicsEngine = new PhysicsEngine();
        // UnifiedSatellitePropagator is static - no instantiation needed

        // Integration state
        this.isInitialized = false;
        this.updateInterval = null;
        this.physicsUpdateRate = 60; // Hz - now the primary time driver
        this._lastRealTime = null; // Track real time for physics-driven stepping
        this._baseTimeStep = 1.0 / 60.0; // Base 60Hz physics timestep (16.67ms)
        this._currentTimeStep = this._baseTimeStep; // Current adaptive timestep
        this._accumulator = 0.0; // Time accumulator for adaptive timestep

        // Cached data for performance with size limits
        this.bodyStatesCache = new Map();
        this.orbitPathsCache = new Map();
        this.maxCacheSize = 50; // Maximum entries per cache
        this.cacheCleanupThreshold = 100; // Clean up when size exceeds this

        // Event bindings
        this.boundUpdateLoop = this.updateLoop.bind(this);
        
        // Track last orientations to detect flips
        this._lastOrientations = new Map(); // naifId -> last quaternion
        
        // Timewarp configuration
        this._timeWarpOptions = [0, 0.25, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 1000000, 10000000];
        this._currentTimeWarpIndex = 2; // Default to 1x (index 2)
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

            // Set up update loop
            this._startUpdateLoop();

            this.isInitialized = true;

            return this;
        } catch (error) {
            console.error('[PhysicsManager] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Update simulation time and propagate physics
     * @deprecated Use stepPhysicsExternal() from SimulationLoop instead
     * This method can cause redundant physics updates and should not be called directly
     */
    async setSimulationTime(newTime) {
        console.warn('[PhysicsManager] setSimulationTime() is deprecated - physics time should be managed by SimulationLoop');
        
        if (!this.isInitialized) return;

        // Only update time if absolutely necessary (e.g., for initialization)
        // Regular time updates should go through stepPhysicsExternal()
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
        
        if (!this.isInitialized) return;

        const state = await this.physicsEngine.step(deltaTime);

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
     */
    async generateSatelliteTrajectory(satelliteId, duration = 3600, timeStep = 60) {
        if (!this.isInitialized) return [];

        const state = this.physicsEngine.getSimulationState();
        const satellite = state.satellites[satelliteId];

        if (!satellite) {
            return [];
        }

        // Use UnifiedSatellitePropagator for trajectory generation
        const propagatedPoints = UnifiedSatellitePropagator.propagateOrbit({
            satellite: {
                position: satellite.position,
                velocity: satellite.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId || 399,
                mass: satellite.mass || 1000,
                crossSectionalArea: satellite.crossSectionalArea || 10,
                dragCoefficient: satellite.dragCoefficient || 2.2
            },
            bodies: state.bodies,
            duration,
            timeStep,
            includeJ2: true,
            includeDrag: true,
            includeThirdBody: false
        });

        // Convert to Vector3 array
        return propagatedPoints.map(pt => new THREE.Vector3().fromArray(pt.position));
    }

    /**
     * Get orbital elements for a body
     */
    getOrbitalElements(bodyName) {
        const state = this.physicsEngine.getSimulationState();
        const body = this._findBodyByName(state.bodies, bodyName);
        const parent = this._findParentBody(state.bodies, body);

        if (!body || !parent) return null;

        // Calculate relative position and velocity
        const relPos = new THREE.Vector3().fromArray(body.position).sub(
            new THREE.Vector3().fromArray(parent.position)
        );
        const relVel = new THREE.Vector3().fromArray(body.velocity).sub(
            new THREE.Vector3().fromArray(parent.velocity)
        );

        const mu = parent.mu || (parent.mass * 6.6743e-20); // G in km³/kg/s²
        
        return OrbitalMechanics.calculateOrbitalElements(relPos, relVel, mu, parent.radius || 0);
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
     * External physics step method for SimulationLoop integration
     * @param {number} realDeltaTime - Real time elapsed in seconds
     * @param {number} timeWarp - Current time warp factor
     * @returns {Object} { stepsProcessed, interpolationFactor, physicsState }
     */
    async stepPhysicsExternal(realDeltaTime, timeWarp) {
        if (!this.isInitialized || !this.app.timeUtils) {
            return { stepsProcessed: 0, interpolationFactor: 0, physicsState: null };
        }

        // If paused, don't advance time
        if (timeWarp === 0) {
            // Still update orbit visualizations even when paused
            this._updateOrbitVisualizations();
            return { stepsProcessed: 0, interpolationFactor: 0, physicsState: this.physicsEngine.getSimulationState() };
        }

        // Convert to simulation time delta
        const simulatedDeltaSeconds = realDeltaTime * timeWarp;

        // KSP-style adaptive timestep based on time warp
        this._updateAdaptiveTimestep(timeWarp);

        // Add to accumulator for adaptive timestep integration
        this._accumulator += simulatedDeltaSeconds;
        
        // Adaptive step limits based on time warp
        const { maxSteps, maxAccumulator } = this._getTimeWarpLimits(timeWarp);
        
        // Clamp accumulator to prevent spiral of death
        if (this._accumulator > maxAccumulator) {
            this._accumulator = maxAccumulator;
        }
        
        // Get current time once
        let currentTime = this.app.timeUtils.getSimulatedTime();
        let physicsState = null;
        
        // Process accumulated time in adaptive timestep chunks
        let stepsProcessed = 0;
        let totalTimeToAdvance = 0;
        
        // First, calculate total time we need to advance
        while (this._accumulator >= this._currentTimeStep && stepsProcessed < maxSteps) {
            totalTimeToAdvance += this._currentTimeStep;
            this._accumulator -= this._currentTimeStep;
            stepsProcessed++;
        }
        
        // If we have time to advance, process it efficiently
        if (totalTimeToAdvance > 0) {
            // For very high timewarps, we can skip intermediate steps
            // and just update positions directly using analytical methods
            if (timeWarp >= 100000) {
                // Single large update for celestial bodies (they use analytical ephemeris)
                const finalTime = new Date(currentTime.getTime() + totalTimeToAdvance * 1000);
                await this.physicsEngine.setTime(finalTime);
                
                // For satellites, use multiple smaller steps
                const maxSatelliteStep = 5.0; // 5 seconds for satellite propagation
                const numSatelliteSteps = Math.ceil(totalTimeToAdvance / maxSatelliteStep);
                const satelliteStepSize = totalTimeToAdvance / numSatelliteSteps;
                
                for (let i = 0; i < numSatelliteSteps; i++) {
                    physicsState = await this.physicsEngine.step(satelliteStepSize);
                }
            } else {
                // For lower timewarps, use adaptive stepping
                const maxPhysicsTimestep = 5.0; // 5 seconds max per physics step
                const numSteps = Math.ceil(totalTimeToAdvance / maxPhysicsTimestep);
                const stepSize = totalTimeToAdvance / numSteps;
                
                let timeAdvanced = 0;
                for (let i = 0; i < numSteps; i++) {
                    timeAdvanced += stepSize;
                    const intermediateTime = new Date(currentTime.getTime() + timeAdvanced * 1000);
                    await this.physicsEngine.setTime(intermediateTime);
                    physicsState = await this.physicsEngine.step(stepSize);
                }
            }
            
            // Sync visuals with final state
            this._syncWithCelestialBodies(physicsState);
            this._syncSatelliteStates(physicsState);
            
            // Update TimeUtils with final time
            const finalTime = new Date(currentTime.getTime() + totalTimeToAdvance * 1000);
            this.app.timeUtils.updateFromPhysics(finalTime);
            
            // Dispatch physics update for components
            this._dispatchPhysicsUpdate(physicsState);
        } else {
            // No physics steps, but get current state
            physicsState = this.physicsEngine.getSimulationState();
        }
        
        // Calculate interpolation factor for smooth visuals
        const interpolationFactor = this._currentTimeStep > 0 ? this._accumulator / this._currentTimeStep : 0;
        
        // Performance feedback for high time warps
        if (this._accumulator > this._currentTimeStep && stepsProcessed >= maxSteps) {
            if (this._accumulator > maxAccumulator * 0.5) {
                document.dispatchEvent(new CustomEvent('timeWarpLagging', {
                    detail: { 
                        timeWarp, 
                        lag: this._accumulator,
                        timestep: this._currentTimeStep 
                    }
                }));
            }
        }
        
        // Always update orbit visualizations for smooth rendering
        this._updateOrbitVisualizations();
        
        // Manage cache sizes periodically
        if (stepsProcessed > 0) {
            this._manageCaches();
        }

        return {
            stepsProcessed,
            interpolationFactor,
            physicsState,
            currentTimeStep: this._currentTimeStep
        };
    }

    /**
     * Get current adaptive timestep for external use
     */
    getAdaptiveTimestep(timeWarp) {
        this._updateAdaptiveTimestep(timeWarp);
        return this._currentTimeStep;
    }

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
                        crossSectionalArea: satellite.crossSectionalArea || 10,
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
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

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
     * Private: Start the physics update loop
     * DISABLED: Physics is now driven by SimulationLoop for better synchronization
     */
    _startUpdateLoop() {
        // Disabled - physics updates are now driven by SimulationLoop
        console.log('[PhysicsManager] Internal update loop disabled - physics driven by SimulationLoop');
        
        // Initialize real time tracking
        this._lastRealTime = performance.now();
        
        // Don't start the interval anymore
        // this.updateInterval = setInterval(this.boundUpdateLoop, 1000 / this.physicsUpdateRate);
    }

    /**
     * Private: Main update loop - DEPRECATED
     * This method is no longer used. Physics updates are now driven by SimulationLoop
     * via the stepPhysicsExternal() method for better synchronization.
     * @deprecated
     */
    async updateLoop() {
        console.warn('[PhysicsManager] updateLoop() called but is deprecated - use stepPhysicsExternal() instead');
        // Method body removed - all physics updates should go through stepPhysicsExternal()
    }

    /**
     * Update adaptive timestep based on time warp (KSP-style)
     * Higher time warps use larger timesteps for better performance but lower precision
     * @param {number} timeWarp - Current time warp factor
     */
    _updateAdaptiveTimestep(timeWarp) {
        // Smoother timestep scaling with logarithmic progression
        // This prevents sudden jumps in timestep that can cause numerical instabilities
        
        if (timeWarp <= 1) {
            // Real-time or slower: use base timestep
            this._currentTimeStep = this._baseTimeStep;
        } else if (timeWarp <= 10) {
            // Low warp: smooth interpolation from 0.02 to 0.1
            const t = (timeWarp - 1) / 9;
            this._currentTimeStep = this._baseTimeStep + t * (0.1 - this._baseTimeStep);
        } else if (timeWarp <= 100) {
            // Medium warp: smooth interpolation from 0.1 to 0.5
            const t = Math.log10(timeWarp / 10) / Math.log10(10);
            this._currentTimeStep = 0.1 + t * 0.4;
        } else if (timeWarp <= 10000) {
            // High warp: smooth interpolation from 0.5 to 5.0
            const t = Math.log10(timeWarp / 100) / Math.log10(100);
            this._currentTimeStep = 0.5 + t * 4.5;
        } else {
            // Very high warp: cap at 10 seconds for stability
            // Logarithmic scaling from 5.0 to 10.0
            const t = Math.min(Math.log10(timeWarp / 10000) / Math.log10(1000), 1);
            this._currentTimeStep = 5.0 + t * 5.0;
        }
        
        // Apply additional safety cap based on timewarp to prevent extreme steps
        const maxSafeStep = Math.min(10.0, Math.sqrt(timeWarp) * 0.01);
        this._currentTimeStep = Math.min(this._currentTimeStep, maxSafeStep);
    }

    /**
     * Get time warp performance limits (KSP-style)
     * @param {number} timeWarp - Current time warp factor
     * @returns {Object} { maxSteps, maxAccumulator }
     */
    _getTimeWarpLimits(timeWarp) {
        // Smoother step limits based on time warp
        // Higher warps need fewer steps per frame to maintain performance
        
        let maxSteps;
        let maxAccumulatorMultiplier;
        
        if (timeWarp <= 10) {
            // Low warp: many steps for accuracy
            maxSteps = 60;
            maxAccumulatorMultiplier = 1.0;
        } else if (timeWarp <= 1000) {
            // Medium warp: scale down steps smoothly
            const t = Math.log10(timeWarp / 10) / Math.log10(100);
            maxSteps = Math.floor(60 - t * 40); // 60 to 20 steps
            maxAccumulatorMultiplier = 1.0 + t * 0.5; // 1.0 to 1.5x
        } else if (timeWarp <= 100000) {
            // High warp: fewer steps but allow more accumulation
            const t = Math.log10(timeWarp / 1000) / Math.log10(100);
            maxSteps = Math.floor(20 - t * 10); // 20 to 10 steps
            maxAccumulatorMultiplier = 1.5 + t * 1.0; // 1.5 to 2.5x
        } else {
            // Extreme warp: minimum steps for performance
            maxSteps = 5;
            maxAccumulatorMultiplier = 3.0;
        }
        
        // Calculate max accumulator based on current timestep
        const maxAccumulator = maxSteps * this._currentTimeStep * maxAccumulatorMultiplier;
        
        return { maxSteps, maxAccumulator };
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
                    const newQuat = new THREE.Quaternion(
                        bodyState.quaternion[0], // x
                        bodyState.quaternion[1], // y  
                        bodyState.quaternion[2], // z
                        bodyState.quaternion[3]  // w
                    );
                    
                    // Check for flips - especially for Earth
                    const lastQuat = this._lastOrientations.get(naifId);
                    if (lastQuat) {
                        const dot = lastQuat.dot(newQuat);
                        
                        // If quaternions are pointing in opposite directions, negate to take shorter path
                        if (dot < 0) {
                            newQuat.x *= -1;
                            newQuat.y *= -1;
                            newQuat.z *= -1;
                            newQuat.w *= -1;
                        }
                        
                        // No special handling for Earth - treat all bodies the same
                    }
                    
                    // Update the orientation
                    celestialBody.targetOrientation.copy(newQuat);
                    
                    // Store for next comparison
                    if (!this._lastOrientations.has(naifId)) {
                        this._lastOrientations.set(naifId, new THREE.Quaternion());
                    }
                    this._lastOrientations.get(naifId).copy(newQuat);
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
                        const newQuat = new THREE.Quaternion(
                            bodyState.quaternion[0],
                            bodyState.quaternion[1],
                            bodyState.quaternion[2],
                            bodyState.quaternion[3]
                        );
                        
                        // Check for flips
                        const lastQuat = this._lastOrientations.get(parseInt(naifId));
                        if (lastQuat) {
                            const dot = lastQuat.dot(newQuat);
                            if (dot < 0) {
                                newQuat.x *= -1;
                                newQuat.y *= -1;
                                newQuat.z *= -1;
                                newQuat.w *= -1;
                            }
                        }
                        
                        body.targetOrientation.copy(newQuat);
                        
                        // Store for next comparison
                        const naifIdNum = parseInt(naifId);
                        if (!this._lastOrientations.has(naifIdNum)) {
                            this._lastOrientations.set(naifIdNum, new THREE.Quaternion());
                        }
                        this._lastOrientations.get(naifIdNum).copy(newQuat);
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

    }

    /**
     * Private: Sync satellite states with existing managers
     */
    _syncSatelliteStates(state) {
        if (!this.app.satelliteManager?.satellites) return;


        for (const [id, satelliteState] of Object.entries(state.satellites)) {
            const satId = String(id);
            let satellite = this.app.satelliteManager.satellites.get(satId);
            if (satellite) {
                satellite.updateVisualsFromState(satelliteState);
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
     * Private: Generate orbit path from orbital elements
     */
    _generateOrbitPathFromElements(body, parent, numPoints) {
        const relPos = new THREE.Vector3().fromArray(body.position).sub(
            new THREE.Vector3().fromArray(parent.position)
        );
        const relVel = new THREE.Vector3().fromArray(body.velocity).sub(
            new THREE.Vector3().fromArray(parent.velocity)
        );

        const mu = parent.mu || (parent.mass * 6.6743e-20); // G in km³/kg/s²
        
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
            
            // Add parent position to get absolute position
            const absolutePos = stateVector.position.add(new THREE.Vector3().fromArray(parent.position));
            points.push(absolutePos);
        }

        return points;
    }

    /**
     * Private: Set up synchronization with app's time system
     * DISABLED: Time is now driven by SimulationLoop through stepPhysicsExternal
     */
    _setupTimeSync() {
        // Disabled - time sync is now handled by SimulationLoop calling stepPhysicsExternal
        console.log('[PhysicsManager] Time sync disabled - time driven by SimulationLoop');
    }
} 