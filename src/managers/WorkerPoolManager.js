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
        console.log(`[WorkerPoolManager] Using ${this.maxWorkers} workers (hardware concurrency: ${navigator.hardwareConcurrency})`);
        this.activeJobs = new Map();
        
        this._initializeWorkers();
    }

    /**
     * Initialize worker pool
     */
    _initializeWorkers() {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(
                new URL('../physics/workers/orbitPropagationWorker.js', import.meta.url),
                { type: 'module' }
            );
            
            worker.onmessage = this._handleWorkerMessage.bind(this);
            worker.onerror = this._handleWorkerError.bind(this);
            
            this.workers.push(worker);
            this.workerPool.push(worker);
        }
    }

    /**
     * Update physics state in all workers with complete solar system data
     */
    updateWorkersPhysicsState(physicsEngine) {
        if (!physicsEngine) {
            console.warn('[WorkerPoolManager] Cannot update workers - no physics engine');
            return;
        }

        const state = physicsEngine.getSimulationState();
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

        // Send to all workers with current simulation time
        this.workers.forEach(worker => {
            worker.postMessage({
                type: 'updatePhysicsState',
                data: {
                    bodies: simplifiedBodies,
                    hierarchy: state.hierarchy || null,
                    currentTime: physicsEngine.simulationTime?.getTime() || Date.now()
                }
            });
        });
    }

    /**
     * Start propagation job
     */
    startPropagationJob(params, messageHandler) {
        // Cancel existing job but preserve any partial results
        this.cancelJob(params.satelliteId, true);

        // Get available worker
        const worker = this.workerPool.pop();
        if (!worker) {
            // Return false to indicate no worker available
            return false;
        }

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
                propagateSolarSystem: params.orbitType === 'hyperbolic' || params.orbitType === 'parabolic'
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
        const { type, satelliteId, points, isComplete, soiTransitions } = event.data;

        const job = this.activeJobs.get(satelliteId);
        if (!job) {
            // For 'complete' messages, this is normal since the job may have been cleaned up by 'chunk' with isComplete
            if (type !== 'complete') {
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
                this.workerPool.push(job.worker);
                this.activeJobs.delete(satelliteId);
                break;
        }
    }

    /**
     * Handle worker errors
     */
    _handleWorkerError(error) {
        console.error('Orbit propagation worker error:', error);
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
     * Dispose of resources
     */
    dispose() {
        // Cancel all jobs
        for (const satelliteId of this.activeJobs.keys()) {
            this.cancelJob(satelliteId);
        }
        
        // Terminate workers
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.workerPool = [];
        this.activeJobs.clear();
    }
}