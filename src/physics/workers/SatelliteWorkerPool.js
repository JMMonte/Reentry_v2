/**
 * SatelliteWorkerPool.js
 * 
 * Manages a pool of web workers for parallel satellite orbit propagation
 * Distributes satellites across workers for optimal performance
 */

// PropagationMetrics import removed to reduce CPU overhead

export class SatelliteWorkerPool {
    constructor(options = {}) {
        this.maxWorkers = options.maxWorkers || Math.min(navigator.hardwareConcurrency || 4, 8);
        this.workers = [];
        this.workerTasks = new Map(); // Map<workerId, Set<satelliteId>>
        this.satelliteToWorker = new Map(); // Map<satelliteId, workerId>
        this.pendingTasks = new Map(); // Map<taskId, Promise>
        this.taskCounter = 0;

        // Separate tracking for different request types
        this.physicsTaskCounter = 0;
        this.visualizationTaskCounter = 0;
        this.pendingPhysicsTasks = new Map(); // Map<taskId, Promise>
        this.pendingVisualizationTasks = new Map(); // Map<taskId, Promise>

        // Physics data streaming optimization
        this.lastPhysicsDataHash = null;
        this.physicsDataCacheTime = 0;
        this.PHYSICS_CACHE_TTL = 100; // Only update physics data every 100ms max

        // Performance tracking
        this.metrics = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageTaskTime: 0,
            workerUtilization: new Array(this.maxWorkers).fill(0),
            lastUpdate: Date.now(),
            physicsUpdates: 0,
            visualizationRequests: 0,
            physicsDataSkipped: 0
        };

        // Worker state
        this.initialized = false;
        this.shuttingDown = false;
    }

    /**
     * Initialize the worker pool
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Create workers
            for (let i = 0; i < this.maxWorkers; i++) {
                await this._createWorker(i);
            }

            this.initialized = true;

        } catch (error) {
            console.error('[SatelliteWorkerPool] Failed to initialize workers:', error);
            throw error;
        }
    }

    /**
     * Create a single worker
     * @private
     */
    async _createWorker(workerId) {
        return new Promise((resolve, reject) => {
            try {
                const worker = new Worker(
                    new URL('./SatelliteWorker.js', import.meta.url),
                    { type: 'module' }
                );

                worker.workerId = workerId;
                worker.busy = false;
                worker.taskCount = 0;
                worker.lastTaskTime = 0;

                // Set up message handling
                worker.onmessage = (event) => {
                    this._handleWorkerMessage(workerId, event);
                };

                worker.onerror = (error) => {
                    console.error(`[SatelliteWorkerPool] Worker ${workerId} error:`, error);
                    this._handleWorkerError(workerId, error);
                };

                worker.onmessageerror = (error) => {
                    console.error(`[SatelliteWorkerPool] Worker ${workerId} message error:`, error);
                };

                // Initialize worker tasks tracking
                this.workerTasks.set(workerId, new Set());

                // Test worker with ping
                const testTaskId = this._generateTaskId();
                this.pendingTasks.set(testTaskId, { resolve, reject, type: 'ping' });

                worker.postMessage({
                    type: 'ping',
                    taskId: testTaskId
                });

                this.workers[workerId] = worker;

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle messages from workers
     * @private
     */
    _handleWorkerMessage(workerId, event) {
        // Handle initialization messages without taskId
        if (!event.data || typeof event.data !== 'object') {
            console.warn(`[SatelliteWorkerPool] Received invalid message from worker ${workerId}:`, event.data);
            return;
        }

        const { taskId, error, data } = event.data;

        // Handle initialization or status messages without taskId
        if (!taskId) {
            console.log(`[SatelliteWorkerPool] Worker ${workerId} status message:`, event.data);
            return;
        }

        console.log(`[SatelliteWorkerPool] Received response from worker ${workerId}:`, {
            taskId,
            hasError: !!error,
            dataType: typeof data,
            dataKeys: data ? Object.keys(data) : []
        });

        // Route to appropriate task queue based on task ID prefix
        let task = null;
        if (taskId.startsWith('physics_')) {
            task = this.pendingPhysicsTasks.get(taskId);
            if (task) {
                this.pendingPhysicsTasks.delete(taskId);
                console.log(`[SatelliteWorkerPool] Found physics task for ${taskId}`);
            }
        } else if (taskId.startsWith('viz_')) {
            task = this.pendingVisualizationTasks.get(taskId);
            if (task) {
                this.pendingVisualizationTasks.delete(taskId);
                console.log(`[SatelliteWorkerPool] Found visualization task for ${taskId}`);
            }
        } else {
            // Legacy task ID format
            task = this.pendingTasks.get(taskId);
            if (task) {
                this.pendingTasks.delete(taskId);
                console.log(`[SatelliteWorkerPool] Found legacy task for ${taskId}`);
            }
        }

        if (!task) {
            console.warn(`[SatelliteWorkerPool] Received response for unknown task: ${taskId}`, {
                pendingPhysicsCount: this.pendingPhysicsTasks.size,
                pendingVisualizationCount: this.pendingVisualizationTasks.size,
                pendingLegacyCount: this.pendingTasks.size
            });
            return;
        }

        // Mark worker as available
        const worker = this.workers[workerId];
        if (worker) {
            worker.busy = false;
        }

        // Handle response
        if (error) {
            this.metrics.failedTasks++;
            task.reject(new Error(error));
        } else {
            this.metrics.completedTasks++;
            task.resolve(data);
        }

        // Update metrics
        if (task.startTime) {
            const taskTime = performance.now() - task.startTime;
            this.metrics.averageTaskTime = (this.metrics.averageTaskTime + taskTime) / 2;
        }
    }

    /**
     * Handle worker errors
     * @private
     */
    _handleWorkerError(workerId, error) {
        console.error(`[SatelliteWorkerPool] Worker ${workerId} encountered error:`, error);

        // Mark all pending tasks for this worker as failed
        for (const [taskId, task] of this.pendingTasks.entries()) {
            if (task.workerId === workerId) {
                task.reject(new Error(`Worker ${workerId} failed: ${error.message}`));
                this.pendingTasks.delete(taskId);
                this.metrics.failedTasks++;
            }
        }

        // Attempt to restart the worker
        this._restartWorker(workerId);
    }

    /**
     * Restart a failed worker
     * @private
     */
    async _restartWorker(workerId) {
        try {

            // Terminate old worker
            if (this.workers[workerId]) {
                this.workers[workerId].terminate();
            }

            // Create new worker
            await this._createWorker(workerId);


        } catch (error) {
            console.error(`[SatelliteWorkerPool] Failed to restart worker ${workerId}:`, error);
        }
    }

    /**
     * Propagate a satellite using worker pool (PHYSICS PRIORITY)
     * @param {Object} satelliteData - Satellite state and configuration
     * @param {Object} physicsData - Physics bodies and simulation parameters
     * @returns {Promise<Object>} Updated satellite state
     */
    async propagateSatellite(satelliteData, physicsData) {
        if (!this.initialized) {
            throw new Error('Worker pool not initialized');
        }

        const taskId = this._generatePhysicsTaskId();
        const workerId = this._selectWorker(satelliteData.id);

        return new Promise((resolve, reject) => {
            const task = {
                resolve,
                reject,
                type: 'propagate',
                workerId,
                satelliteId: satelliteData.id,
                priority: 'physics' // High priority for real-time physics
            };

            this.pendingPhysicsTasks.set(taskId, task);
            this.metrics.totalTasks++;

            // Mark worker as busy
            const worker = this.workers[workerId];
            if (worker) {
                worker.busy = true;
            }

            // Track satellite assignment
            this.satelliteToWorker.set(satelliteData.id, workerId);
            this.workerTasks.get(workerId).add(satelliteData.id);

            // Send task to worker
            worker.postMessage({
                type: 'propagate',
                taskId,
                priority: 'physics',
                data: {
                    satellite: satelliteData,
                    physics: physicsData
                }
            });

            // Set timeout for task
            setTimeout(() => {
                if (this.pendingPhysicsTasks.has(taskId)) {
                    this.pendingPhysicsTasks.delete(taskId);
                    this.metrics.failedTasks++;
                    reject(new Error(`Physics task ${taskId} timed out`));
                }
            }, 5000); // 5 second timeout
        });
    }

    /**
     * Propagate multiple satellites in parallel
     * @param {Array} satellites - Array of satellite data
     * @param {Object} physicsData - Physics bodies and simulation parameters
     * @returns {Promise<Array>} Array of updated satellite states
     */
    async propagateMultipleSatellites(satellites, physicsData) {
        if (!this.initialized) {
            throw new Error('Worker pool not initialized');
        }

        try {
            // Create propagation tasks for all satellites
            const propagationPromises = satellites.map(satellite =>
                this.propagateSatellite(satellite, physicsData)
            );

            // Wait for all tasks to complete
            const results = await Promise.allSettled(propagationPromises);

            // Process results
            const successfulResults = [];
            const failedResults = [];

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successfulResults.push(result.value);
                } else {
                    failedResults.push({
                        satelliteId: satellites[index].id,
                        error: result.reason
                    });
                    console.error(`[SatelliteWorkerPool] Failed to propagate satellite ${satellites[index].id}:`, result.reason);
                }
            });

            return {
                successful: successfulResults,
                failed: failedResults
            };

        } catch (error) {
            console.error('[SatelliteWorkerPool] Error in parallel propagation:', error);
            throw error;
        }
    }

    /**
     * Select the best worker for a satellite
     * @private
     */
    _selectWorker(satelliteId) {
        // If satellite is already assigned to a worker, use the same one for consistency
        if (this.satelliteToWorker.has(satelliteId)) {
            const assignedWorker = this.satelliteToWorker.get(satelliteId);
            if (assignedWorker < this.workers.length && this.workers[assignedWorker]) {
                return assignedWorker;
            }
        }

        // Find the least busy worker
        let bestWorker = 0;
        let minLoad = Infinity;

        for (let i = 0; i < this.workers.length; i++) {
            const worker = this.workers[i];
            if (!worker) continue;

            // Calculate worker load (number of assigned satellites + current busy state)
            const assignedSatellites = this.workerTasks.get(i).size;
            const busyPenalty = worker.busy ? 1 : 0;
            const load = assignedSatellites + busyPenalty;

            if (load < minLoad) {
                minLoad = load;
                bestWorker = i;
            }
        }

        return bestWorker;
    }

    /**
     * Update physics data in all workers (optimized)
     * @param {Object} physicsData - Updated physics bodies and parameters
     */
    async updateWorkersPhysicsState(physicsData) {
        if (!this.initialized) return;

        // Optimize: Only update if physics data actually changed
        const currentHash = this._hashPhysicsData(physicsData);
        const now = Date.now();
        
        if (this.lastPhysicsDataHash === currentHash && 
            (now - this.physicsDataCacheTime) < this.PHYSICS_CACHE_TTL) {
            this.metrics.physicsDataSkipped++;
            return; // Skip redundant updates
        }

        this.lastPhysicsDataHash = currentHash;
        this.physicsDataCacheTime = now;
        this.metrics.physicsUpdates++;

        const updatePromises = this.workers.map((worker, workerId) => {
            if (!worker) return Promise.resolve();

            const taskId = this._generatePhysicsTaskId();

            return new Promise((resolve, reject) => {
                this.pendingPhysicsTasks.set(taskId, { resolve, reject, type: 'updatePhysics', startTime: performance.now() });

                worker.postMessage({
                    type: 'updatePhysics',
                    taskId,
                    data: physicsData
                });

                // Timeout for physics update
                setTimeout(() => {
                    if (this.pendingPhysicsTasks.has(taskId)) {
                        this.pendingPhysicsTasks.delete(taskId);
                        reject(new Error(`Physics update timeout for worker ${workerId}`));
                    }
                }, 2000);
            });
        });

        try {
            await Promise.allSettled(updatePromises);
        } catch (error) {
            console.warn('[SatelliteWorkerPool] Some workers failed to update physics state:', error);
        }
    }

    /**
     * Update configuration settings in all workers
     * @param {Object} config - Configuration settings (integrationMethod, sensitivityScale, etc.)
     */
    async updateWorkersConfiguration(config) {
        if (!this.initialized) return;

        const updatePromises = this.workers.map((worker, workerId) => {
            if (!worker) return Promise.resolve();

            const taskId = this._generateTaskId();

            return new Promise((resolve, reject) => {
                this.pendingTasks.set(taskId, { resolve, reject, type: 'updateConfig', startTime: performance.now() });

                worker.postMessage({
                    type: 'updateConfig',
                    taskId,
                    data: config
                });

                // Timeout for config update
                setTimeout(() => {
                    if (this.pendingTasks.has(taskId)) {
                        this.pendingTasks.delete(taskId);
                        reject(new Error(`Config update timeout for worker ${workerId}`));
                    }
                }, 1000);
            });
        });

        try {
            await Promise.allSettled(updatePromises);
        } catch (error) {
            console.warn('[SatelliteWorkerPool] Some workers failed to update configuration:', error);
        }
    }

    /**
     * Propagate orbit for a satellite (VISUALIZATION PRIORITY)
     * @param {Object} satelliteData - Satellite state and configuration
     * @param {Object} options - Propagation options (duration, timeStep, etc.)
     * @returns {Promise<Object>} Orbit points
     */
    async propagateOrbit(satelliteData, options = {}) {
        if (!this.initialized) {
            throw new Error('Worker pool not initialized');
        }

        const workerId = this._selectWorker(satelliteData.id);
        const worker = this.workers[workerId];
        
        if (!worker) {
            throw new Error(`Worker ${workerId} not available`);
        }

        const taskId = this._generateVisualizationTaskId();
        this.metrics.visualizationRequests++;

        return new Promise((resolve, reject) => {
            this.pendingVisualizationTasks.set(taskId, { 
                resolve, 
                reject, 
                type: 'propagateOrbit', 
                startTime: performance.now(),
                priority: 'visualization' // Lower priority than physics
            });

            worker.postMessage({
                type: 'propagateOrbit',
                taskId,
                priority: 'visualization',
                data: {
                    satellite: satelliteData,
                    ...options
                }
            });

            // Timeout for orbit propagation
            const timeoutMs = options.integrationMethod === 'rk45' ? 120000 : 30000; // 2 min for rk45
            setTimeout(() => {
                if (this.pendingVisualizationTasks.has(taskId)) {
                    this.pendingVisualizationTasks.delete(taskId);
                    reject(new Error(`Orbit propagation timeout for satellite ${satelliteData.id}`));
                }
            }, timeoutMs);
        });
    }

    /**
     * Generate ground track for a satellite
     * @param {Object} satelliteData - Satellite state and configuration
     * @param {Object} options - Ground track options
     * @returns {Promise<Object>} Ground track data (streamed via chunks)
     */
    async generateGroundTrack(satelliteData, options = {}) {
        if (!this.initialized) {
            throw new Error('Worker pool not initialized');
        }

        const workerId = this._selectWorker(satelliteData.id);
        const worker = this.workers[workerId];
        
        if (!worker) {
            throw new Error(`Worker ${workerId} not available`);
        }

        const taskId = this._generateTaskId();

        return new Promise((resolve, reject) => {
            const chunks = [];
            
            this.pendingTasks.set(taskId, { 
                resolve: (result) => {
                    if (result.type === 'groundTrackChunk') {
                        chunks.push(result);
                        if (result.isComplete) {
                            resolve({ chunks, totalPoints: chunks.reduce((sum, chunk) => sum + chunk.points.length, 0) });
                        }
                    } else {
                        resolve(result);
                    }
                }, 
                reject, 
                type: 'generateGroundTrack', 
                startTime: performance.now() 
            });

            worker.postMessage({
                type: 'generateGroundTrack',
                taskId,
                data: {
                    satellite: satelliteData,
                    ...options
                }
            });

            // Timeout for ground track generation
            setTimeout(() => {
                if (this.pendingTasks.has(taskId)) {
                    this.pendingTasks.delete(taskId);
                    reject(new Error(`Ground track generation timeout for satellite ${satelliteData.id}`));
                }
            }, 60000); // 60 second timeout
        });
    }

    /**
     * Preview maneuver for a satellite
     * @param {Object} satelliteData - Satellite state and configuration
     * @param {Object} maneuver - Maneuver data
     * @param {Object} options - Preview options
     * @returns {Promise<Object>} Maneuver preview data
     */
    async previewManeuver(satelliteData, maneuver, options = {}) {
        if (!this.initialized) {
            throw new Error('Worker pool not initialized');
        }

        const workerId = this._selectWorker(satelliteData.id);
        const worker = this.workers[workerId];
        
        if (!worker) {
            throw new Error(`Worker ${workerId} not available`);
        }

        const taskId = this._generateTaskId();

        return new Promise((resolve, reject) => {
            this.pendingTasks.set(taskId, { resolve, reject, type: 'previewManeuver', startTime: performance.now() });

            worker.postMessage({
                type: 'previewManeuver',
                taskId,
                data: {
                    satellite: satelliteData,
                    maneuver,
                    ...options
                }
            });

            // Timeout for maneuver preview
            setTimeout(() => {
                if (this.pendingTasks.has(taskId)) {
                    this.pendingTasks.delete(taskId);
                    reject(new Error(`Maneuver preview timeout for satellite ${satelliteData.id}`));
                }
            }, 15000); // 15 second timeout
        });
    }

    /**
     * Remove satellite from worker tracking
     * @param {string} satelliteId - Satellite ID to remove
     */
    removeSatellite(satelliteId) {
        const workerId = this.satelliteToWorker.get(satelliteId);
        if (workerId !== undefined) {
            this.workerTasks.get(workerId).delete(satelliteId);
            this.satelliteToWorker.delete(satelliteId);
        }
        }

    /**
     * Get basic worker pool metrics (minimal overhead version)
     * @returns {Object} Essential metrics only
     */
    getMetrics() {
        return {
            activeWorkers: this.workers.filter(w => w).length,
            busyWorkers: this.workers.filter(w => w && w.busy).length,
            pendingTasks: this.pendingPhysicsTasks.size + this.pendingVisualizationTasks.size
        };
    }

    /**
     * Shutdown the worker pool
     */
    async shutdown() {
        if (this.shuttingDown) return;
        this.shuttingDown = true;


        // Cancel all pending tasks
        for (const [, task] of this.pendingTasks.entries()) {
            task.reject(new Error('Worker pool shutting down'));
        }
        this.pendingTasks.clear();

        // Terminate all workers
        for (const worker of this.workers) {
            if (worker) {
                worker.terminate();
            }
        }

        this.workers = [];
        this.workerTasks.clear();
        this.satelliteToWorker.clear();
        this.initialized = false;

    }

    /**
     * Generate unique task ID
     * @private
     */
    _generateTaskId() {
        return `task_${++this.taskCounter}_${Date.now()}`;
    }

    /**
     * Generate unique task ID for physics requests
     * @private
     */
    _generatePhysicsTaskId() {
        return `physics_${++this.physicsTaskCounter}_${Date.now()}`;
    }

    /**
     * Generate unique task ID for visualization requests
     * @private
     */
    _generateVisualizationTaskId() {
        return `viz_${++this.visualizationTaskCounter}_${Date.now()}`;
    }

    /**
     * Hash physics data to detect changes
     * @private
     */
    _hashPhysicsData(physicsData) {
        const bodyPositions = Object.values(physicsData.bodies || {})
            .map(body => body.position.join(','))
            .join('|');
        return `${physicsData.simulationTime}_${bodyPositions}`;
    }
} 