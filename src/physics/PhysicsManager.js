import * as THREE from 'three';
import { PhysicsEngine } from './PhysicsEngine.js';
import { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
import { OrbitalMechanics } from './core/OrbitalMechanics.js';
import { solarSystemDataManager } from './PlanetaryDataManager.js';
import { PhysicsConstants } from './core/PhysicsConstants.js';

/**
 * Physics Manager - Main interface between application and physics engine
 * Handles initialization, updates, and bridges to existing codebase
 * 
 * ARCHITECTURE NOTE: This is the integration layer between pure physics (PhysicsEngine) 
 * and the Three.js application. It's acceptable for this layer to use Three.js for 
 * app integration purposes, while keeping the core PhysicsEngine purely mathematical.
 */
export class PhysicsManager {
    constructor(app) {
        this.app = app; // Reference to main App3D instance
        this.physicsEngine = new PhysicsEngine();
        // UnifiedSatellitePropagator is static - no instantiation needed

        // Integration state
        this.isInitialized = false;
        this._baseTimeStep = 1.0 / 60.0; // Base 60Hz physics timestep (16.67ms)
        this._currentTimeStep = this._baseTimeStep; // Current adaptive timestep
        this._accumulator = 0.0; // Time accumulator for adaptive timestep

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

            console.log('[PhysicsManager] Initialized - physics driven by SimulationLoop');

            this.isInitialized = true;

            return this;
        } catch (error) {
            console.error('[PhysicsManager] Failed to initialize:', error);
            throw error;
        }
    }


    /**
     * Step the simulation forward by deltaTime seconds
     */
    async stepSimulation(deltaTime) {
        if (!this.isInitialized) return;

        const state = await this.physicsEngine.step(deltaTime, 1); // timeWarp = 1 for initialization

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
     * External physics step method for SimulationLoop integration
     * @param {number} realDeltaTime - Real time elapsed in seconds
     * @param {number} timeWarp - Current time warp factor
     * @returns {Object} { stepsProcessed, interpolationFactor, physicsState }
     */
    async stepPhysicsExternal(realDeltaTime, timeWarp) {
        if (!this.isInitialized || !this.app.timeUtils) {
            return { stepsProcessed: 0, interpolationFactor: 0, physicsState: null };
        }

        // Fast path for paused state
        if (timeWarp === 0) {
            this._updateOrbitVisualizations();
            return { stepsProcessed: 0, interpolationFactor: 0, physicsState: this.physicsEngine.getSimulationState() };
        }
        
        // Optimized path for very high timewarps
        if (timeWarp >= 100000) {
            return this._stepPhysicsHighWarp(realDeltaTime, timeWarp);
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
            // Dynamic timestep calculation based on timewarp
            let maxStepSize;
            
            if (timeWarp >= 10000000) {
                // Ultra-high warp: up to 1 hour steps
                maxStepSize = 3600.0;
            } else if (timeWarp >= 1000000) {
                // Very high warp: up to 10 minute steps
                maxStepSize = 600.0;
            } else if (timeWarp >= 100000) {
                // High warp: up to 1 minute steps
                maxStepSize = 60.0;
            } else if (timeWarp >= 10000) {
                // Medium-high warp: up to 30 second steps
                maxStepSize = 30.0;
            } else if (timeWarp >= 1000) {
                // Medium warp: up to 10 second steps
                maxStepSize = 10.0;
            } else {
                // Low warp: up to 5 second steps
                maxStepSize = 5.0;
            }
            
            // For extreme timewarps, allow even larger steps if the total time is very large
            if (timeWarp >= 1000000 && totalTimeToAdvance > 3600) {
                // Allow up to 1% of total time as step size, but cap at 1 day
                maxStepSize = Math.min(totalTimeToAdvance * 0.01, 86400.0);
            }
            
            // Calculate number of steps needed
            const numSteps = Math.max(1, Math.ceil(totalTimeToAdvance / maxStepSize));
            const stepSize = totalTimeToAdvance / numSteps;
            
            // Update time first for celestial bodies (they use analytical ephemeris)
            const finalTime = new Date(currentTime.getTime() + totalTimeToAdvance * 1000);
            await this.physicsEngine.setTime(finalTime);
            
            // Then propagate satellites with the calculated step size
            // For very large steps, we can do it in one go since orbits are stable
            if (stepSize > 60.0) {
                // Single large step for stable orbits
                physicsState = await this.physicsEngine.step(totalTimeToAdvance, timeWarp);
            } else {
                // Multiple smaller steps for accuracy
                for (let i = 0; i < numSteps; i++) {
                    physicsState = await this.physicsEngine.step(stepSize, timeWarp);
                }
            }
            
            // Sync visuals with final state
            this._syncWithCelestialBodies(physicsState);
            this._syncSatelliteStates(physicsState);
            
            // Update TimeUtils with final time (already declared above)
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
     * Optimized physics step for very high timewarps (>=100k)
     * @private
     */
    async _stepPhysicsHighWarp(realDeltaTime, timeWarp) {
        // Direct calculation for high timewarps - no complex conditionals
        const timeToAdvance = realDeltaTime * timeWarp;
        
        // Direct time advancement
        const currentTime = this.app.timeUtils.getSimulatedTime();
        const finalTime = new Date(currentTime.getTime() + timeToAdvance * 1000);
        
        // Single physics update
        await this.physicsEngine.setTime(finalTime);
        const physicsState = await this.physicsEngine.step(timeToAdvance, this.getCurrentTimeWarp());
        
        // Full syncing for satellites
        this._syncWithCelestialBodies(physicsState);
        this._syncSatelliteStates(physicsState);
        this.app.timeUtils.updateFromPhysics(finalTime);
        
        // Always dispatch physics updates for satellites
        this._dispatchPhysicsUpdate(physicsState);
        
        // Reduced frequency for orbit visualizations only
        this._frameCount++;
        if (this._frameCount % 10 === 0) {
            this._updateOrbitVisualizations();
        }
        
        return {
            stepsProcessed: 1,
            interpolationFactor: 0,
            physicsState,
            totalDeltaTime: timeToAdvance
        };
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
     * Update adaptive timestep based on time warp (KSP-style)
     * Higher time warps use larger timesteps for better performance but lower precision
     * @param {number} timeWarp - Current time warp factor
     */
    _updateAdaptiveTimestep(timeWarp) {
        // Aggressive timestep scaling for high timewarps
        // We want to actually advance time quickly at high warps
        
        if (timeWarp <= 1) {
            // Real-time or slower: use base timestep
            this._currentTimeStep = this._baseTimeStep;
        } else if (timeWarp <= 10) {
            // Low warp: 0.02 to 0.1 seconds
            const t = (timeWarp - 1) / 9;
            this._currentTimeStep = this._baseTimeStep + t * (0.1 - this._baseTimeStep);
        } else if (timeWarp <= 100) {
            // Medium warp: 0.1 to 1 second
            const t = Math.log10(timeWarp / 10);
            this._currentTimeStep = 0.1 + t * 0.9;
        } else if (timeWarp <= 1000) {
            // High warp: 1 to 10 seconds
            const t = Math.log10(timeWarp / 100);
            this._currentTimeStep = 1.0 + t * 9.0;
        } else if (timeWarp <= 10000) {
            // Very high warp: 10 to 60 seconds
            const t = Math.log10(timeWarp / 1000);
            this._currentTimeStep = 10.0 + t * 50.0;
        } else if (timeWarp <= 100000) {
            // Extreme warp: 60 to 600 seconds (1-10 minutes)
            const t = Math.log10(timeWarp / 10000);
            this._currentTimeStep = 60.0 + t * 540.0;
        } else if (timeWarp <= 1000000) {
            // Ultra warp: 600 to 3600 seconds (10-60 minutes)
            const t = Math.log10(timeWarp / 100000);
            this._currentTimeStep = 600.0 + t * 3000.0;
        } else {
            // Maximum warp: 3600 to 86400 seconds (1-24 hours)
            const t = Math.log10(timeWarp / 1000000);
            this._currentTimeStep = 3600.0 + t * 82800.0;
        }
        
        // No artificial safety caps - we want full speed at high warps
    }

    /**
     * Get time warp performance limits (KSP-style)
     * @param {number} timeWarp - Current time warp factor
     * @returns {Object} { maxSteps, maxAccumulator }
     */
    _getTimeWarpLimits(timeWarp) {
        // Aggressive limits for high timewarps
        // We want fewer frame subdivisions at high warps
        
        let maxSteps;
        let maxAccumulatorMultiplier;
        
        if (timeWarp <= 100) {
            // Low-medium warp: many steps for accuracy
            maxSteps = 20;
            maxAccumulatorMultiplier = 2.0;
        } else if (timeWarp <= 10000) {
            // High warp: fewer steps
            maxSteps = 5;
            maxAccumulatorMultiplier = 5.0;
        } else if (timeWarp <= 1000000) {
            // Very high warp: minimal steps
            maxSteps = 2;
            maxAccumulatorMultiplier = 10.0;
        } else {
            // Maximum warp: single step per frame
            maxSteps = 1;
            maxAccumulatorMultiplier = 20.0;
        }
        
        // Calculate max accumulator based on current timestep
        const maxAccumulator = maxSteps * this._currentTimeStep * maxAccumulatorMultiplier;
        
        return { maxSteps, maxAccumulator };
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
            
            // Add parent position to get absolute position
            const absolutePos = stateVector.position.add(new THREE.Vector3().fromArray(parent.position));
            points.push(absolutePos);
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
        console.log('[PhysicsManager] Time sync handled by SimulationLoop');
    }
} 