/**
 * PropagationMetrics.js
 * 
 * Performance monitoring system for satellite orbit propagation
 * Tracks integration times, recovery events, numerical issues, and overall health
 */

export class PropagationMetrics {
    static metrics = new Map(); // Map<satelliteId, MetricsData>
    static globalMetrics = {
        totalIntegrations: 0,
        totalRecoveries: 0,
        totalFailures: 0,
        averageIntegrationTime: 0,
        startTime: Date.now()
    };

    /**
     * Initialize metrics tracking for a satellite
     * @param {string} satelliteId - Satellite ID
     */
    static initializeSatellite(satelliteId) {
        if (!this.metrics.has(satelliteId)) {
            this.metrics.set(satelliteId, {
                // Performance tracking
                integrationTimes: [],
                accelerationTimes: [],
                totalIntegrations: 0,
                totalSteps: 0,
                
                // Recovery tracking
                integrationRecoveries: 0,
                accelerationRecoveries: 0,
                totalSkippedSteps: 0,
                
                // Health tracking
                lastIntegrationTime: 0,
                averageIntegrationTime: 0,
                integrationFailureRate: 0,
                
                // Method usage tracking
                rk4Usage: 0,
                rk45Usage: 0,
                
                // Error tracking
                recentErrors: [], // Keep last 10 errors
                errorCounts: {
                    nonFinitePosition: 0,
                    nonFiniteVelocity: 0,
                    nonFiniteAcceleration: 0,
                    integrationFailure: 0,
                    accelerationFailure: 0
                },
                
                // Memory tracking
                memoryUsage: {
                    vectorAllocations: 0,
                    cacheHits: 0,
                    cacheMisses: 0
                },
                
                // Timing
                createdAt: Date.now(),
                lastUpdate: Date.now()
            });
        }
    }

    /**
     * Track integration step performance
     * @param {string} satelliteId - Satellite ID
     * @param {number} duration - Integration duration in ms
     * @param {string} method - Integration method used ('rk4' or 'rk45')
     * @param {boolean} successful - Whether integration was successful
     */
    static trackIntegrationStep(satelliteId, duration, method = 'rk4', successful = true) {
        this.initializeSatellite(satelliteId);
        const metrics = this.metrics.get(satelliteId);
        
        metrics.totalSteps++;
        metrics.lastUpdate = Date.now();
        
        if (successful) {
            metrics.totalIntegrations++;
            metrics.integrationTimes.push(duration);
            
            // Keep only last 100 measurements for rolling average
            if (metrics.integrationTimes.length > 100) {
                metrics.integrationTimes.shift();
            }
            
            // Update average
            metrics.averageIntegrationTime = metrics.integrationTimes.reduce((a, b) => a + b, 0) / metrics.integrationTimes.length;
            metrics.lastIntegrationTime = duration;
            
            // Track method usage
            if (method === 'rk4') metrics.rk4Usage++;
            else if (method === 'rk45') metrics.rk45Usage++;
        } else {
            this.trackError(satelliteId, 'integrationFailure', 'Integration step failed');
        }
        
        // Update global metrics
        this.globalMetrics.totalIntegrations++;
        if (!successful) this.globalMetrics.totalFailures++;
        
        // Calculate failure rate
        metrics.integrationFailureRate = (metrics.totalSteps - metrics.totalIntegrations) / metrics.totalSteps;
    }

    /**
     * Track acceleration computation performance
     * @param {string} satelliteId - Satellite ID
     * @param {number} duration - Computation duration in ms
     * @param {boolean} successful - Whether computation was successful
     */
    static trackAcceleration(satelliteId, duration, successful = true) {
        this.initializeSatellite(satelliteId);
        const metrics = this.metrics.get(satelliteId);
        
        if (successful) {
            metrics.accelerationTimes.push(duration);
            
            // Keep only last 50 measurements
            if (metrics.accelerationTimes.length > 50) {
                metrics.accelerationTimes.shift();
            }
        } else {
            this.trackError(satelliteId, 'accelerationFailure', 'Acceleration computation failed');
        }
        
        metrics.lastUpdate = Date.now();
    }

    /**
     * Track recovery events
     * @param {string} satelliteId - Satellite ID
     * @param {string} recoveryType - 'integration' or 'acceleration'
     * @param {boolean} successful - Whether recovery was successful
     */
    static trackRecovery(satelliteId, recoveryType, successful = true) {
        this.initializeSatellite(satelliteId);
        const metrics = this.metrics.get(satelliteId);
        
        if (recoveryType === 'integration') {
            metrics.integrationRecoveries++;
            if (!successful) {
                metrics.totalSkippedSteps++;
            }
        } else if (recoveryType === 'acceleration') {
            metrics.accelerationRecoveries++;
        }
        
        this.globalMetrics.totalRecoveries++;
        metrics.lastUpdate = Date.now();
        
        this.trackError(satelliteId, `${recoveryType}Recovery`, `${recoveryType} recovery ${successful ? 'successful' : 'failed'}`);
    }

    /**
     * Track specific error types
     * @param {string} satelliteId - Satellite ID
     * @param {string} errorType - Type of error
     * @param {string} message - Error message
     */
    static trackError(satelliteId, errorType, message) {
        this.initializeSatellite(satelliteId);
        const metrics = this.metrics.get(satelliteId);
        
        // Update error counts
        if (Object.prototype.hasOwnProperty.call(metrics.errorCounts, errorType)) {
            metrics.errorCounts[errorType]++;
        }
        
        // Add to recent errors
        metrics.recentErrors.push({
            type: errorType,
            message,
            timestamp: Date.now()
        });
        
        // Keep only last 10 errors
        if (metrics.recentErrors.length > 10) {
            metrics.recentErrors.shift();
        }
        
        metrics.lastUpdate = Date.now();
    }

    /**
     * Track memory usage patterns
     * @param {string} satelliteId - Satellite ID
     * @param {string} operation - 'vectorAllocation', 'cacheHit', 'cacheMiss'
     */
    static trackMemory(satelliteId, operation) {
        this.initializeSatellite(satelliteId);
        const metrics = this.metrics.get(satelliteId);
        
        if (Object.prototype.hasOwnProperty.call(metrics.memoryUsage, operation)) {
            metrics.memoryUsage[operation]++;
        }
        
        metrics.lastUpdate = Date.now();
    }

    /**
     * Get performance metrics for a specific satellite
     * @param {string} satelliteId - Satellite ID
     * @returns {Object} Metrics data formatted for UI display
     */
    static getSatelliteMetrics(satelliteId) {
        if (!this.metrics.has(satelliteId)) {
            return null;
        }
        
        const metrics = this.metrics.get(satelliteId);
        const now = Date.now();
        const uptime = now - metrics.createdAt;
        const timeSinceLastUpdate = now - metrics.lastUpdate;
        
        // Calculate performance indicators
        const stepsPerSecond = metrics.totalSteps / (uptime / 1000);
        const averageAccelerationTime = metrics.accelerationTimes.length > 0 
            ? metrics.accelerationTimes.reduce((a, b) => a + b, 0) / metrics.accelerationTimes.length 
            : 0;
        
        const totalRecoveries = metrics.integrationRecoveries + metrics.accelerationRecoveries;
        const totalErrors = Object.values(metrics.errorCounts).reduce((a, b) => a + b, 0);
        
        const cacheTotal = metrics.memoryUsage.cacheHits + metrics.memoryUsage.cacheMisses;
        const cacheHitRate = cacheTotal > 0 ? metrics.memoryUsage.cacheHits / cacheTotal : 0;
        
        return {
            // Performance
            performance: {
                stepsPerSecond: Math.round(stepsPerSecond * 100) / 100,
                averageIntegrationTime: Math.round(metrics.averageIntegrationTime * 1000) / 1000,
                lastIntegrationTime: Math.round(metrics.lastIntegrationTime * 1000) / 1000,
                averageAccelerationTime: Math.round(averageAccelerationTime * 1000) / 1000,
                integrationFailureRate: Math.round(metrics.integrationFailureRate * 10000) / 100 // Percentage
            },
            
            // Health
            health: {
                uptime: Math.round(uptime / 1000), // seconds
                timeSinceLastUpdate: Math.round(timeSinceLastUpdate / 1000), // seconds
                totalSteps: metrics.totalSteps,
                successfulIntegrations: metrics.totalIntegrations,
                totalRecoveries,
                totalErrors,
                status: this._calculateHealthStatus(metrics, timeSinceLastUpdate)
            },
            
            // Method usage
            methods: {
                rk4Usage: metrics.rk4Usage,
                rk45Usage: metrics.rk45Usage,
                preferredMethod: metrics.rk4Usage >= metrics.rk45Usage ? 'RK4' : 'RK45'
            },
            
            // Memory
            memory: {
                vectorAllocations: metrics.memoryUsage.vectorAllocations,
                cacheHitRate: Math.round(cacheHitRate * 10000) / 100, // Percentage
                cacheHits: metrics.memoryUsage.cacheHits,
                cacheMisses: metrics.memoryUsage.cacheMisses
            },
            
            // Recent issues
            recentErrors: metrics.recentErrors.slice(-5), // Last 5 errors
            
            // Error breakdown
            errorBreakdown: { ...metrics.errorCounts }
        };
    }

    /**
     * Get global system metrics
     * @returns {Object} Global performance metrics
     */
    static getGlobalMetrics() {
        const now = Date.now();
        const uptime = now - this.globalMetrics.startTime;
        const activeSatellites = this.metrics.size;
        
        // Calculate global averages
        let totalSteps = 0;
        let totalIntegrationTime = 0;
        let totalRecoveries = 0;
        
        for (const metrics of this.metrics.values()) {
            totalSteps += metrics.totalSteps;
            totalIntegrationTime += metrics.averageIntegrationTime * metrics.totalIntegrations;
            totalRecoveries += metrics.integrationRecoveries + metrics.accelerationRecoveries;
        }
        
        const globalAverageIntegrationTime = this.globalMetrics.totalIntegrations > 0 
            ? totalIntegrationTime / this.globalMetrics.totalIntegrations 
            : 0;
        
        return {
            uptime: Math.round(uptime / 1000), // seconds
            activeSatellites,
            totalIntegrations: this.globalMetrics.totalIntegrations,
            totalRecoveries: totalRecoveries,
            totalFailures: this.globalMetrics.totalFailures,
            globalFailureRate: this.globalMetrics.totalIntegrations > 0 
                ? Math.round((this.globalMetrics.totalFailures / this.globalMetrics.totalIntegrations) * 10000) / 100 
                : 0,
            averageIntegrationTime: Math.round(globalAverageIntegrationTime * 1000) / 1000,
            stepsPerSecond: Math.round((totalSteps / (uptime / 1000)) * 100) / 100
        };
    }

    /**
     * Calculate health status based on metrics
     * @private
     */
    static _calculateHealthStatus(metrics, timeSinceLastUpdate) {
        // If no updates in 10 seconds, consider stalled
        if (timeSinceLastUpdate > 10000) {
            return 'STALLED';
        }
        
        // If failure rate > 10%, consider degraded
        if (metrics.integrationFailureRate > 0.1) {
            return 'DEGRADED';
        }
        
        // If recoveries are frequent (more than 1% of steps), consider unstable
        const totalRecoveries = metrics.integrationRecoveries + metrics.accelerationRecoveries;
        if (totalRecoveries / metrics.totalSteps > 0.01) {
            return 'UNSTABLE';
        }
        
        return 'HEALTHY';
    }

    /**
     * Clear metrics for a satellite (when satellite is removed)
     * @param {string} satelliteId - Satellite ID
     */
    static clearSatellite(satelliteId) {
        this.metrics.delete(satelliteId);
    }

    /**
     * Reset all metrics
     */
    static reset() {
        this.metrics.clear();
        this.globalMetrics = {
            totalIntegrations: 0,
            totalRecoveries: 0,
            totalFailures: 0,
            averageIntegrationTime: 0,
            startTime: Date.now()
        };
    }
} 