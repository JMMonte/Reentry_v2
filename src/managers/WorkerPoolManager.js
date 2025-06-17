/**
 * WorkerPoolManager.js
 * 
 * Manages Web Worker pool for orbit propagation calculations
 * Now uses unified SatelliteWorkerPool for all satellite calculations
 */

import { SatelliteWorkerPool } from '../physics/workers/SatelliteWorkerPool.js';

export class WorkerPoolManager {
    constructor() {
        // Use unified satellite worker pool
        this.satelliteWorkerPool = null;
        this.activeJobs = new Map();
        this.physicsState = null; // Store for fallback
        this.workersSupported = true;
        this.satelliteEngine = null; // Will be set by PhysicsEngine
        this._workerPoolInitialized = false;
        this._workerPoolInitializing = false;

        // Don't initialize workers at startup - use lazy initialization
        // this._initializeWorkerPool();
    }

    /**
     * Set SatelliteEngine reference for worker pool sharing
     * @param {SatelliteEngine} satelliteEngine - SatelliteEngine instance
     */
    setSatelliteEngine(satelliteEngine) {
        this.satelliteEngine = satelliteEngine;
        
        // Connect worker pool if already initialized
        if (this.satelliteWorkerPool && this._workerPoolInitialized) {
            satelliteEngine.setWorkerPool(this.satelliteWorkerPool);
        }
    }

    /**
     * Initialize worker pool when first satellite is added
     * @returns {Promise<boolean>} True if workers are ready
     */
    async initializeWorkersForSatellites() {
        const ready = await this._ensureWorkerPoolInitialized();
        
        // Connect to SatelliteEngine if both are ready
        if (ready && this.satelliteEngine && this.satelliteWorkerPool) {
            this.satelliteEngine.setWorkerPool(this.satelliteWorkerPool);
        }
        
        return ready;
    }

    /**
     * Ensure worker pool is initialized (lazy initialization)
     */
    async _ensureWorkerPoolInitialized() {
        if (this._workerPoolInitialized || this._workerPoolInitializing) {
            return this._workerPoolInitialized;
        }

        this._workerPoolInitializing = true;

        try {
            console.log('[WorkerPoolManager] Initializing worker pool...');
            await this._initializeWorkerPool();
            this._workerPoolInitialized = true;
            console.log('[WorkerPoolManager] Worker pool initialized successfully');
            return true;
        } catch (error) {
            console.warn('[WorkerPoolManager] Failed to initialize worker pool:', error);
            console.warn('[WorkerPoolManager] Worker support:', {
                workerSupported: typeof Worker !== 'undefined',
                hardwareConcurrency: navigator.hardwareConcurrency,
                userAgent: navigator.userAgent
            });
            this._workerPoolInitialized = false;
            return false;
        } finally {
            this._workerPoolInitializing = false;
        }
    }

    /**
     * Initialize unified worker pool
     */
    async _initializeWorkerPool() {
        try {
            console.log('[WorkerPoolManager] Initializing worker pool on demand...');
            this.satelliteWorkerPool = new SatelliteWorkerPool({
                maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 6) // Limit to 6 workers max
            });

            await this.satelliteWorkerPool.initialize();
            this.workersSupported = true;
            
            // Verify worker pool is actually working
            const workerCount = this.satelliteWorkerPool.workers?.length || 0;
            console.log(`[WorkerPoolManager] Successfully initialized ${workerCount} workers`);
            
            // Connect to SatelliteEngine if available
            if (this.satelliteEngine) {
                this.satelliteEngine.setWorkerPool(this.satelliteWorkerPool);
                console.log('[WorkerPoolManager] Connected worker pool to satellite engine');
            }
            
        } catch (error) {
            console.warn('[WorkerPoolManager] Failed to initialize unified worker pool:', error);
            this.workersSupported = false;
            this.satelliteWorkerPool = null;
            throw error;
        }
    }

    /**
     * Update physics state in unified worker pool
     */
    async updateWorkersPhysicsState(physicsIntegration) {
        if (!physicsIntegration || !physicsIntegration.physicsEngine) {
            console.warn('[WorkerPoolManager] Cannot update workers - no physics integration');
            return false;
        }

        const state = physicsIntegration.getSimulationState();
        if (!state || !state.bodies) {
            console.warn('[WorkerPoolManager] Cannot update workers - no simulation state');
            return false;
        }

        const simplifiedBodies = {};

        // Extract complete body data for solar system propagation
        for (const [id, body] of Object.entries(state.bodies)) {
            // Handle atmospheric model - can't send functions to workers
            let atmosphericModel = null;
            if (body.atmosphericModel) {
                atmosphericModel = {
                    maxAltitude: body.atmosphericModel.maxAltitude,
                    minAltitude: body.atmosphericModel.minAltitude,
                    referenceAltitude: body.atmosphericModel.referenceAltitude,
                    referenceDensity: body.atmosphericModel.referenceDensity,
                    scaleHeight: body.atmosphericModel.scaleHeight
                    // Exclude getDensity function - worker will use its own implementation
                };
            }

            simplifiedBodies[id] = {
                naifId: parseInt(id),
                position: body.position.toArray ? body.position.toArray() : body.position,
                velocity: body.velocity.toArray ? body.velocity.toArray() : body.velocity,
                mass: body.mass,
                soiRadius: body.soiRadius,
                radius: body.radius,
                type: body.type,
                // Include properties needed for perturbations
                J2: body.J2,
                atmosphericModel: atmosphericModel,
                GM: body.GM,
                rotationPeriod: body.rotationPeriod
            };
        }

        // Store for fallback
        this.physicsState = {
            bodies: simplifiedBodies,
            hierarchy: state.hierarchy || null,
            currentTime: physicsIntegration.physicsEngine?.simulationTime?.getTime() || Date.now(),
            timestamp: Date.now()
        };
        
        console.log(`[WorkerPoolManager] Updating workers with ${Object.keys(simplifiedBodies).length} physics bodies`);
        
        // Update unified worker pool if available (but don't initialize just for physics state updates)
        if (this.satelliteWorkerPool && this._workerPoolInitialized && this.workersSupported) {
            try {
                await this.satelliteWorkerPool.updateWorkersPhysicsState({
                    deltaTime: 0.05, // Default timestep
                    timeWarp: 1,
                    simulationTime: new Date(this.physicsState.currentTime).toISOString(),
                    bodies: simplifiedBodies
                });
                console.log(`[WorkerPoolManager] Successfully updated worker pool physics state`);
                return true;
            } catch (error) {
                console.error('[WorkerPoolManager] Failed to update worker pool physics state:', error);
                return false;
            }
        } else {
            console.warn('[WorkerPoolManager] Worker pool not available for physics state update');
            return false;
        }
    }

    /**
     * Start propagation job using unified worker pool
     */
    async startPropagationJob(params, messageHandler) {
        
        // Cancel existing job but preserve any partial results
        this.cancelJob(params.satelliteId, true);

        // Ensure worker pool is initialized when needed
        const workerPoolReady = await this._ensureWorkerPoolInitialized();

        // Check if workers are supported
        if (!this.workersSupported || !workerPoolReady || !this.satelliteWorkerPool) {
            this._runMainThreadFallback(params, messageHandler);
            return true;
        }

        try {
            // Track active job
            this.activeJobs.set(params.satelliteId, {
                params,
                points: params.existingPoints || [], // Start with existing points if extending
                startTime: Date.now(),
                messageHandler
            });

            // Prepare satellite data for unified worker pool
            const satelliteData = {
                id: params.satelliteId,
                position: params.satellite.position,
                velocity: params.satellite.velocity,
                centralBodyNaifId: params.satellite.centralBodyNaifId,
                mass: params.satellite.mass,
                crossSectionalArea: params.satellite.crossSectionalArea,
                dragCoefficient: params.satellite.dragCoefficient,
                ballisticCoefficient: params.satellite.ballisticCoefficient
            };

            // Get current simulation time (if available) or use current time
            const currentSimTime = this.physicsState?.simulationTime || new Date();
            const startTimeSeconds = currentSimTime instanceof Date ? 
                currentSimTime.getTime() / 1000 : 
                new Date(currentSimTime).getTime() / 1000;

            // Use unified worker pool for orbit propagation
            const result = await this.satelliteWorkerPool.propagateOrbit(satelliteData, {
                duration: params.duration,
                timeStep: params.timeStep,
                startTime: startTimeSeconds, // Use current simulation time
                maxPoints: params.maxPoints,
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                maneuverNodes: params.maneuverNodes || []
            });

            // Handle successful result
            const job = this.activeJobs.get(params.satelliteId);
            if (job && messageHandler) {
                messageHandler('complete', params.satelliteId, result.points, params, result.soiTransitions);
            }
            this.activeJobs.delete(params.satelliteId);

            return true;

        } catch (error) {
            console.error('[WorkerPoolManager] Propagation job failed:', error);
            this.cancelJob(params.satelliteId);
            
            // Fall back to main thread
            this._runMainThreadFallback(params, messageHandler);
            return false;
        }
    }

    /**
     * Cancel active job
     */
    cancelJob(satelliteId, preservePartialResults = false) {
        const job = this.activeJobs.get(satelliteId);
        if (job) {
            // If we have partial results and want to preserve them, let the caller handle it
            if (preservePartialResults && job.points && job.points.length > 0 && job.messageHandler) {
                job.messageHandler('partial', satelliteId, job.points, job.params);
            }

            // Note: Unified worker pool handles cancellation internally
            this.activeJobs.delete(satelliteId);
        }
    }

    /**
     * Handle worker messages (legacy - now handled by unified worker pool)
     */
    _handleWorkerMessage(event) {
        // This method is now largely unused as the unified worker pool handles messaging internally
        console.warn('[WorkerPoolManager] Legacy worker message received:', event.data);
    }

    /**
     * Handle worker errors (legacy - now handled by unified worker pool)
     */
    _handleWorkerError(error) {
        console.warn('[WorkerPoolManager] Legacy worker error:', error);
    }

    /**
     * Get active job for satellite
     */
    getActiveJob(satelliteId) {
        return this.activeJobs.get(satelliteId);
    }

    /**
     * Check if worker is available
     */
    hasAvailableWorker() {
        return this.workersSupported && this.satelliteWorkerPool && this.satelliteWorkerPool.initialized;
    }

    /**
     * Main thread fallback for orbit propagation
     */
    async _runMainThreadFallback(params, messageHandler) {
        try {
            // Import the propagation logic
            const { UnifiedSatellitePropagator } = await import('../physics/core/UnifiedSatellitePropagator.js');
            
            // Get current simulation time (if available) or use current time
            const currentSimTime = this.physicsState?.simulationTime || new Date();
            const startTimeSeconds = currentSimTime instanceof Date ? 
                currentSimTime.getTime() / 1000 : 
                new Date(currentSimTime).getTime() / 1000;
            
            const propagationParams = {
                satellite: {
                    position: params.satellite.position,
                    velocity: params.satellite.velocity,
                    centralBodyNaifId: params.satellite.centralBodyNaifId || 399,
                    mass: params.satellite.mass || 1000,
                    crossSectionalArea: params.satellite.crossSectionalArea || 2.0, // Realistic satellite cross-section
                    dragCoefficient: params.satellite.dragCoefficient || 2.2
                },
                bodies: this.physicsState?.bodies || {
                    399: {
                        name: 'Earth',
                        GM: 398600.4415,
                        radius: 6371,
                        position: [0, 0, 0],
                        velocity: [0, 0, 0],
                        naifId: 399
                    }
                },
                duration: params.duration || 5400,
                timeStep: params.timeStep || 60,
                startTime: startTimeSeconds, // Use current simulation time
                maneuverNodes: params.maneuverNodes || [],
                includeJ2: params.includeJ2 !== false,
                includeDrag: params.includeDrag !== false,
                includeThirdBody: params.includeThirdBody !== false
            };
            
            const points = await UnifiedSatellitePropagator.propagateOrbit(propagationParams);
            
            // Simulate chunked response like workers do
            const chunkSize = 100;
            for (let i = 0; i < points.length; i += chunkSize) {
                const chunk = points.slice(i, i + chunkSize);
                const isComplete = i + chunk.length >= points.length;
                
                if (messageHandler) {
                    messageHandler('chunk', params.satelliteId, chunk, params, isComplete, []);
                }
                
                // Small delay to prevent blocking
                if (!isComplete) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
            
        } catch (error) {
            console.error('[WorkerPoolManager] Main thread fallback failed:', error);
            if (messageHandler) {
                messageHandler('error', params.satelliteId, null, params, false, null, error.message);
            }
        }
    }
    
    /**
     * Dispose of unified worker pool
     */
    async dispose() {
        // Cancel all active jobs
        for (const [satelliteId] of this.activeJobs) {
            this.cancelJob(satelliteId);
        }

        // Shutdown unified worker pool
        if (this.satelliteWorkerPool) {
            try {
                await this.satelliteWorkerPool.shutdown();
            } catch (error) {
                console.warn('[WorkerPoolManager] Failed to shutdown worker pool:', error);
            }
            this.satelliteWorkerPool = null;
        }

        // Clear state
        this.activeJobs.clear();
        this.workersSupported = false;
    }
}