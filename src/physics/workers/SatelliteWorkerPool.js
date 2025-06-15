/**
 * SatelliteWorkerPool.js
 * 
 * Manages a pool of web workers for parallel satellite orbit propagation
 * Distributes satellites across workers for optimal performance
 */

import { PropagationMetrics } from '../utils/PropagationMetrics.js';

export class SatelliteWorkerPool {
    constructor(options = {}) {
        this.maxWorkers = options.maxWorkers || Math.min(navigator.hardwareConcurrency || 4, 8);
        this.workers = [];
        this.workerTasks = new Map(); // Map<workerId, Set<satelliteId>>
        this.satelliteToWorker = new Map(); // Map<satelliteId, workerId>
        this.pendingTasks = new Map(); // Map<taskId, Promise>
        this.taskCounter = 0;

        // Performance tracking
        this.metrics = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageTaskTime: 0,
            workerUtilization: new Array(this.maxWorkers).fill(0),
            lastUpdate: Date.now()
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
                    this._handleWorkerMessage(workerId, event.data);
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
                this.pendingTasks.set(testTaskId, { resolve, reject, type: 'ping', startTime: performance.now() });

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
    _handleWorkerMessage(workerId, data) {
        const { taskId, type, result, error } = data;

        if (!this.pendingTasks.has(taskId)) {
            console.warn(`[SatelliteWorkerPool] Received response for unknown task ${taskId}`);
            return;
        }

        const task = this.pendingTasks.get(taskId);
        const taskTime = performance.now() - task.startTime;

        // Update worker state
        const worker = this.workers[workerId];
        if (worker) {
            worker.busy = false;
            worker.taskCount++;
            worker.lastTaskTime = taskTime;
        }

        // Update metrics
        this.metrics.completedTasks++;
        this.metrics.averageTaskTime = (this.metrics.averageTaskTime * (this.metrics.completedTasks - 1) + taskTime) / this.metrics.completedTasks;
        this.metrics.workerUtilization[workerId] = (this.metrics.workerUtilization[workerId] * 0.9) + (taskTime * 0.1);

        if (error) {
            console.error(`[SatelliteWorkerPool] Task ${taskId} failed:`, error);
            this.metrics.failedTasks++;
            task.reject(new Error(error));
        } else {
            // Track performance metrics for satellite tasks
            if (type === 'propagate' && result.satelliteId) {
                PropagationMetrics.trackIntegrationStep(
                    result.satelliteId,
                    taskTime,
                    result.method || 'worker',
                    !error
                );
            }

            task.resolve(result);
        }

        this.pendingTasks.delete(taskId);
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
     * Propagate a satellite using worker pool
     * @param {Object} satelliteData - Satellite state and configuration
     * @param {Object} physicsData - Physics bodies and simulation parameters
     * @returns {Promise<Object>} Updated satellite state
     */
    async propagateSatellite(satelliteData, physicsData) {
        if (!this.initialized) {
            throw new Error('Worker pool not initialized');
        }

        const taskId = this._generateTaskId();
        const workerId = this._selectWorker(satelliteData.id);

        return new Promise((resolve, reject) => {
            const task = {
                resolve,
                reject,
                type: 'propagate',
                workerId,
                startTime: performance.now(),
                satelliteId: satelliteData.id
            };

            this.pendingTasks.set(taskId, task);
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
                data: {
                    satellite: satelliteData,
                    physics: physicsData
                }
            });

            // Set timeout for task
            setTimeout(() => {
                if (this.pendingTasks.has(taskId)) {
                    this.pendingTasks.delete(taskId);
                    this.metrics.failedTasks++;
                    reject(new Error(`Task ${taskId} timed out`));
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

        const startTime = performance.now();

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

            const totalTime = performance.now() - startTime;

            return {
                successful: successfulResults,
                failed: failedResults,
                totalTime,
                parallelEfficiency: satellites.length > 0 ? (satellites.length * this.metrics.averageTaskTime) / totalTime : 1
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
     * Update physics data in all workers
     * @param {Object} physicsData - Updated physics bodies and parameters
     */
    async updateWorkersPhysicsState(physicsData) {
        if (!this.initialized) return;

        const updatePromises = this.workers.map((worker, workerId) => {
            if (!worker) return Promise.resolve();

            const taskId = this._generateTaskId();

            return new Promise((resolve, reject) => {
                this.pendingTasks.set(taskId, { resolve, reject, type: 'updatePhysics', startTime: performance.now() });

                worker.postMessage({
                    type: 'updatePhysics',
                    taskId,
                    data: physicsData
                });

                // Timeout for physics update
                setTimeout(() => {
                    if (this.pendingTasks.has(taskId)) {
                        this.pendingTasks.delete(taskId);
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
     * Get worker pool performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        const now = Date.now();
        const uptime = now - this.metrics.lastUpdate;

        return {
            ...this.metrics,
            uptime: uptime / 1000,
            activeWorkers: this.workers.filter(w => w).length,
            busyWorkers: this.workers.filter(w => w && w.busy).length,
            pendingTasks: this.pendingTasks.size,
            averageWorkerUtilization: this.metrics.workerUtilization.reduce((a, b) => a + b, 0) / this.maxWorkers,
            workerDetails: this.workers.map((worker, i) => ({
                id: i,
                busy: worker ? worker.busy : false,
                taskCount: worker ? worker.taskCount : 0,
                lastTaskTime: worker ? worker.lastTaskTime : 0,
                assignedSatellites: this.workerTasks.get(i).size
            }))
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
} 