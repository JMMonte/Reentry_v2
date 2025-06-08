/**
 * WorkerPoolManager.js
 * 
 * Manages Web Worker pool for orbit propagation calculations
 */

export class WorkerPoolManager {
    constructor() {
        // Worker management - scale based on hardware
        this.workers = [];
        this.workerPool = [];
        // Use hardware concurrency but cap at 8 to avoid overwhelming the system
        this.maxWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);
        this.activeJobs = new Map();
        this.physicsState = null; // Store for fallback

        this._initializeWorkers();
    }

    /**
     * Initialize worker pool
     */
    _initializeWorkers() {
        this.workersSupported = true;
        
        for (let i = 0; i < this.maxWorkers; i++) {
            try {
                const worker = new Worker(
                    new URL('../physics/workers/orbitPropagationWorker.js', import.meta.url),
                    { type: 'module' }
                );

                worker.onmessage = this._handleWorkerMessage.bind(this);
                worker.onerror = this._handleWorkerError.bind(this);

                this.workers.push(worker);
                this.workerPool.push(worker);
            } catch (error) {
                console.warn(`[WorkerPoolManager] Failed to create worker ${i}:`, error);
                this.workersSupported = false;
                break;
            }
        }
        
        if (!this.workersSupported || this.workers.length === 0) {
            console.warn('[WorkerPoolManager] Workers not supported or failed to load, using main thread fallback');
            this.workersSupported = false;
        }
    }

    /**
     * Update physics state in all workers with complete solar system data
     */
    updateWorkersPhysicsState(physicsIntegration) {
        if (!physicsIntegration || !physicsIntegration.physicsEngine) {
            console.warn('[WorkerPoolManager] Cannot update workers - no physics integration');
            return;
        }

        const state = physicsIntegration.getSimulationState();
        if (!state || !state.bodies) {
            console.warn('[WorkerPoolManager] Cannot update workers - no simulation state');
            return;
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
                naif: parseInt(id),
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

        // Store for fallback and send to all workers with current simulation time
        this.physicsState = {
            bodies: simplifiedBodies,
            hierarchy: state.hierarchy || null,
            currentTime: physicsIntegration.physicsEngine?.simulationTime?.getTime() || Date.now()
        };
        
        
        this.workers.forEach(worker => {
            worker.postMessage({
                type: 'updatePhysicsState',
                data: this.physicsState
            });
        });
    }

    /**
     * Start propagation job
     */
    startPropagationJob(params, messageHandler) {
        
        // Cancel existing job but preserve any partial results
        this.cancelJob(params.satelliteId, true);

        // Check if workers are supported
        if (!this.workersSupported || this.workerPool.length === 0) {
            this._runMainThreadFallback(params, messageHandler);
            return true;
        }

        // Get available worker
        const worker = this.workerPool.pop();
        if (!worker) {
            // Use main thread fallback
            this._runMainThreadFallback(params, messageHandler);
            return true;
        }
        
        // Bind message handlers with proper context
        const boundHandler = this._handleWorkerMessage.bind(this);
        worker.onmessage = boundHandler;
        worker.onerror = this._handleWorkerError.bind(this);

        // Track active job
        this.activeJobs.set(params.satelliteId, {
            worker,
            params,
            points: params.existingPoints || [], // Start with existing points if extending
            startTime: Date.now(),
            messageHandler
        });

        // Send propagation request with satellite properties for drag calculation
        worker.postMessage({
            type: 'propagate',
            data: {
                satelliteId: params.satelliteId,
                position: params.satellite.position,
                velocity: params.satellite.velocity,
                centralBodyNaifId: params.satellite.centralBodyNaifId,
                duration: params.duration,
                timeStep: params.timeStep,
                startTime: params.startTime || 0,
                // Include satellite properties for accurate drag calculation
                mass: params.satellite.mass,
                crossSectionalArea: params.satellite.crossSectionalArea,
                dragCoefficient: params.satellite.dragCoefficient,
                // Enable solar system propagation for hyperbolic/parabolic orbits that may leave planetary SOI
                propagateSolarSystem: params.orbitType === 'hyperbolic' || params.orbitType === 'parabolic',
                // Include maneuver nodes for maneuver-aware propagation
                maneuverNodes: params.maneuverNodes || []
            }
        });

        return true;
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

            job.worker.postMessage({ type: 'cancel' });
            this.workerPool.push(job.worker);
            this.activeJobs.delete(satelliteId);
        }
    }

    /**
     * Handle worker messages
     */
    _handleWorkerMessage(event) {
        try {
            const { type, satelliteId, points, isComplete, soiTransitions } = event.data;
            const job = this.activeJobs.get(satelliteId);
            if (!job) {
                // For 'complete' messages, this is normal since the job may have been cleaned up by 'chunk' with isComplete
                // Also ignore warnings for maneuver preview jobs which are temporary
                if (type !== 'complete' && !satelliteId?.includes('maneuver_preview')) {
                    console.warn(`[WorkerPoolManager] No active job found for satellite ${satelliteId}`);
                }
                return;
            }

            switch (type) {
            case 'chunk':
                // Accumulate points
                job.points.push(...points);
                // Also accumulate SOI transitions
                if (!job.soiTransitions) job.soiTransitions = [];
                if (soiTransitions && soiTransitions.length > 0) {
                    job.soiTransitions.push(...soiTransitions);
                }
                
                // Notify message handler
                if (job.messageHandler) {
                    job.messageHandler('chunk', satelliteId, job.points, job.params, isComplete, job.soiTransitions);
                }

                if (isComplete) {
                    // Return worker to pool
                    this.workerPool.push(job.worker);
                    this.activeJobs.delete(satelliteId);
                }
                break;

            case 'complete':
                // Job completed - do nothing here since we already handled cleanup in 'chunk' with isComplete
                break;

            case 'error':
                console.error(`Orbit propagation error for satellite ${satelliteId}:`, event.data.error);
                if (job.messageHandler) {
                    job.messageHandler('error', satelliteId, null, job.params, false, null, event.data.error);
                }
                // Don't reuse worker after error - replace it instead
                this._replaceCorruptedWorker(job.worker);
                this.activeJobs.delete(satelliteId);
                break;
            }
        
        } catch (error) {
            console.error('[WorkerPoolManager] ERROR in message handling:', error);
            console.error('[WorkerPoolManager] Event data:', event.data);
        }
    }

    /**
     * Handle worker errors
     */
    _handleWorkerError(error) {
        console.error('Orbit propagation worker error:', error);

        // Find the corrupted worker and replace it
        const corruptedWorker = error.target || error.currentTarget;
        if (corruptedWorker) {
            this._replaceCorruptedWorker(corruptedWorker);
        }
    }

    /**
     * Replace a corrupted worker with a new one
     */
    _replaceCorruptedWorker(corruptedWorker) {
        // Find and remove corrupted worker from workers array
        const workerIndex = this.workers.findIndex(w => w === corruptedWorker);
        if (workerIndex !== -1) {
            this.workers.splice(workerIndex, 1);
        }

        // Remove from pool if present
        const poolIndex = this.workerPool.findIndex(w => w === corruptedWorker);
        if (poolIndex !== -1) {
            this.workerPool.splice(poolIndex, 1);
        }

        // Clean up any active jobs using this worker
        for (const [satelliteId, job] of this.activeJobs.entries()) {
            if (job.worker === corruptedWorker) {
                // Notify handler of failure
                if (job.messageHandler) {
                    job.messageHandler('error', satelliteId, null, job.params, false, null, 'Worker terminated due to error');
                }
                this.activeJobs.delete(satelliteId);
            }
        }

        // Terminate the corrupted worker
        try {
            corruptedWorker.terminate();
        } catch (e) {
            console.warn('Failed to terminate corrupted worker:', e);
        }

        // Create replacement worker if we're under the max count
        if (this.workers.length < this.maxWorkers) {
            this._createReplacementWorker();
        }
    }

    /**
     * Create a replacement worker
     */
    _createReplacementWorker() {
        try {
            const worker = new Worker(
                new URL('../physics/workers/orbitPropagationWorker.js', import.meta.url),
                { type: 'module' }
            );

            worker.onmessage = this._handleWorkerMessage.bind(this);
            worker.onerror = this._handleWorkerError.bind(this);

            this.workers.push(worker);
            this.workerPool.push(worker);

        } catch (error) {
            console.error('[WorkerPoolManager] Failed to create replacement worker:', error);
        }
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
        return this.workerPool.length > 0;
    }

    /**
     * Main thread fallback for orbit propagation
     */
    async _runMainThreadFallback(params, messageHandler) {
        try {
            // Import the propagation logic
            const { UnifiedSatellitePropagator } = await import('../physics/core/UnifiedSatellitePropagator.js');
            
            const propagationParams = {
                satellite: {
                    position: params.satellite.position,
                    velocity: params.satellite.velocity,
                    centralBodyNaifId: params.satellite.centralBodyNaifId || 399,
                    mass: params.satellite.mass || 1000,
                    crossSectionalArea: params.satellite.crossSectionalArea || 10,
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
                maneuverNodes: params.maneuverNodes || [],
                includeJ2: params.includeJ2 !== false,
                includeDrag: params.includeDrag !== false,
                includeThirdBody: params.includeThirdBody !== false
            };
            
            const points = UnifiedSatellitePropagator.propagateOrbit(propagationParams);
            
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
     * Dispose of resources
     */
    dispose() {
        // Cancel all jobs
        for (const satelliteId of this.activeJobs.keys()) {
            this.cancelJob(satelliteId);
        }

        // Gracefully terminate workers
        this.workers.forEach(worker => {
            try {
                // Send cleanup signal first
                worker.postMessage({ type: 'terminate' });
                // Force termination after a brief delay to allow cleanup
                setTimeout(() => worker.terminate(), 10);
            } catch {
                // If worker is already terminated, just call terminate
                worker.terminate();
            }
        });
        this.workers = [];
        this.workerPool = [];
        this.activeJobs.clear();
    }
}