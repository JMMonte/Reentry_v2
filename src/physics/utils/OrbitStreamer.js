/**
 * OrbitStreamer - Unified orbit data streaming system
 * 
 * Manages real-time orbit visualization by combining physics simulation points
 * with propagated orbit predictions. Provides intelligent throttling, completion
 * detection, and efficient streaming for visualization layers.
 * 
 * @author Physics Engine Team
 * @version 2.0.0
 */

// Production Constants - All magic numbers centralized
const STREAMING_CONFIG = {
    // Point thresholds
    MIN_DISTANCE_THRESHOLD: 1.0,        // km - minimum distance between points
    MAX_TIME_THRESHOLD: 60,             // seconds - maximum time between points
    MAX_PHYSICS_POINTS: 1000,           // rolling buffer size for physics points
    MIN_POINTS_FOR_ANALYSIS: 10,        // minimum points needed for duration/period analysis

    // Extension thresholds
    EXTENSION_THRESHOLD: 0.5,           // 50% coverage before considering extension
    COMPLETION_THRESHOLD: 0.9,          // 90% coverage considered complete
    MIN_ORBITAL_PERIOD: 90 * 60,        // 90 minutes in seconds (minimum realistic period)
    MAX_ORBITAL_PERIOD: 48 * 3600,      // 48 hours in seconds (maximum realistic period)

    // Default parameters
    DEFAULT_PERIODS: 1.5,               // number of orbital periods to display
    DEFAULT_POINTS_PER_PERIOD: 64,      // points per orbital period

    // Physics constants
    EARTH_GM: 398600.4415,              // km³/s² - fallback only
    EARTH_RADIUS: 6371,                 // km - fallback only
    MIN_ALTITUDE: 200,                  // km - minimum safe altitude
    MAX_ALTITUDE: 100000,               // km - maximum reasonable altitude

    // Performance
    PARAM_EQUALITY_PRECISION: 1e-10    // precision for parameter comparison
};

/**
 * OrbitStreamer class - Handles streaming orbit data for visualization
 */
export class OrbitStreamer {
    /**
     * Create a new OrbitStreamer instance
     * @param {string} satelliteId - Unique satellite identifier
     * @param {Object} params - Streaming parameters
     * @param {number} params.periods - Number of orbital periods to display
     * @param {number} params.pointsPerPeriod - Points per orbital period
     * @param {Object} centralBodyData - Central body physics data (GM, radius, etc.)
     */
    constructor(satelliteId, params = {}, centralBodyData = null) {
        // Validate inputs
        if (!satelliteId) {
            throw new Error('OrbitStreamer requires a valid satelliteId');
        }

        this.satelliteId = satelliteId;
        this.centralBodyData = centralBodyData;

        // Normalize and validate parameters
        this.params = this._validateParams({
            periods: STREAMING_CONFIG.DEFAULT_PERIODS,
            pointsPerPeriod: STREAMING_CONFIG.DEFAULT_POINTS_PER_PERIOD,
            ...params
        });

        // Data storage
        this.physicsPoints = [];        // Points from real physics simulation
        this.predictedPoints = [];      // Points from orbit propagation

        // State tracking
        this.isExtending = false;       // Currently extending orbit?
        this.extensionProgress = 0;     // Extension progress (0-1)
        this.lastPointTime = 0;         // Timestamp of last significant point

        // Statistics
        this.stats = {
            totalPointsAdded: 0,
            totalPointsFiltered: 0,
            lastExtensionTime: 0,
            extensionCount: 0
        };
    }

    /**
     * Add a point from physics simulation
     * @param {Object} point - Physics point data
     * @param {Array<number>} point.position - [x, y, z] position in km
     * @param {Array<number>} point.velocity - [x, y, z] velocity in km/s
     * @param {number} point.time - Timestamp in milliseconds
     * @param {number} point.centralBodyNaifId - Central body NAIF ID
     * @returns {boolean} Whether to publish an update
     */
    addPoint(point) {
        try {
            // Validate point data
            if (!this._isValidPoint(point)) {
                this.stats.totalPointsFiltered++;
                return false;
            }

            // Check if we have sufficient orbit coverage
            if (this._hasSufficientCoverage()) {
                return false;
            }

            // Check if point is significant enough to keep
            if (!this._isSignificantPoint(point)) {
                this.stats.totalPointsFiltered++;
                return false;
            }

            // Add point to physics buffer
            this.physicsPoints.push({
                ...point,
                source: 'physics',
                timestamp: Date.now()
            });

            // Maintain rolling buffer
            if (this.physicsPoints.length > STREAMING_CONFIG.MAX_PHYSICS_POINTS) {
                this.physicsPoints.shift();
            }

            this.lastPointTime = point.time;
            this.stats.totalPointsAdded++;

            // Return true to indicate update should be published
            return true;

        } catch (error) {
            console.error(`[OrbitStreamer] Error adding point for satellite ${this.satelliteId}:`, error);
            return false;
        }
    }

    /**
     * Check if orbit extension is needed
     * @param {Object} newParams - Updated parameters
     * @returns {Object} Extension requirements
     * @returns {boolean} returns.needsExtension - Whether extension is needed
     * @returns {boolean} returns.needsCompleteRedraw - Whether complete redraw is needed
     */
    needsExtension(newParams = null) {
        try {
            // Check if parameters changed significantly
            if (newParams && !this._areParamsEqual(newParams, this.params)) {
                this.params = this._validateParams(newParams);
                this._clearPredictedData();
                return { needsExtension: true, needsCompleteRedraw: true };
            }

            // Don't extend if already extending
            if (this.isExtending) {
                return { needsExtension: false, needsCompleteRedraw: false };
            }

            // Don't extend if we have sufficient coverage
            if (this._hasSufficientCoverage()) {
                return { needsExtension: false, needsCompleteRedraw: false };
            }

            // Check if we have any predicted points - if not, we need extension
            const hasNoPredictions = this.predictedPoints.length === 0;

            // Check coverage percentage
            const coverage = this._calculateCoverage();
            const needsExtension = hasNoPredictions || coverage < STREAMING_CONFIG.EXTENSION_THRESHOLD;

            return {
                needsExtension,
                needsCompleteRedraw: false
            };

        } catch (error) {
            console.error(`[OrbitStreamer] Error checking extension needs for satellite ${this.satelliteId}:`, error);
            return { needsExtension: false, needsCompleteRedraw: false };
        }
    }

    /**
     * Add predicted points from orbit propagation
     * @param {Array<Object>} points - Predicted orbit points
     * @param {boolean} isComplete - Whether the prediction is complete
     */
    addPredictedPoints(points, isComplete = true) {
        try {
            if (!Array.isArray(points) || points.length === 0) {
                console.warn(`[OrbitStreamer] Invalid predicted points for satellite ${this.satelliteId}`);
                return;
            }

            // Validate and add predicted points
            const validPoints = points.filter(point => this._isValidPoint(point));

            if (validPoints.length === 0) {
                console.warn(`[OrbitStreamer] No valid predicted points for satellite ${this.satelliteId}`);
                return;
            }

            // Mark points as predicted
            const markedPoints = validPoints.map(point => ({
                ...point,
                source: 'predicted',
                timestamp: Date.now()
            }));

            this.predictedPoints = markedPoints;

            if (isComplete) {
                this.extensionProgress = 1.0;
                this.stats.extensionCount++;
            }

        } catch (error) {
            console.error(`[OrbitStreamer] Error adding predicted points for satellite ${this.satelliteId}:`, error);
        }
    }

    /**
     * Get streaming data for visualization
     * @param {Object} options - Options for data retrieval
     * @returns {Object} Streaming data package
     */
    getStreamingData() {
        try {
            // Combine physics and predicted points
            const allPoints = [...this.physicsPoints, ...this.predictedPoints];

            // Calculate metadata
            const coverage = this._calculateCoverage();
            const duration = this._getCurrentDuration();
            const estimatedPeriod = this._estimateOrbitalPeriod();

            // Calculate apsis points if we have enough data
            const apsisData = allPoints.length >= STREAMING_CONFIG.MIN_POINTS_FOR_ANALYSIS ?
                this._calculateApsisPoints(allPoints) : null;

            return {
                points: allPoints,
                metadata: {
                    satelliteId: this.satelliteId,
                    totalPoints: allPoints.length,
                    physicsPoints: this.physicsPoints.length,
                    predictedPoints: this.predictedPoints.length,
                    coverage,
                    duration,
                    estimatedPeriod,
                    isExtending: this.isExtending,
                    extensionProgress: this.extensionProgress,
                    params: { ...this.params },
                    lastUpdate: Date.now()
                },
                apsisData,
                stats: { ...this.stats }
            };

        } catch (error) {
            console.error(`[OrbitStreamer] Error getting streaming data for satellite ${this.satelliteId}:`, error);
            return {
                points: [],
                metadata: { error: error.message },
                apsisData: null,
                stats: { ...this.stats }
            };
        }
    }

    /**
     * Set extension state
     * @param {boolean} extending - Whether currently extending
     * @param {number} progress - Extension progress (0-1)
     */
    setExtensionState(extending, progress = 0) {
        this.isExtending = extending;
        this.extensionProgress = Math.max(0, Math.min(1, progress));

        if (extending) {
            this.stats.lastExtensionTime = Date.now();
        }
    }

    /**
     * Update streaming parameters
     * @param {Object} newParams - New parameters
     */
    updateParams(newParams) {
        try {
            const validatedParams = this._validateParams(newParams);

            // Check if parameters changed significantly
            if (!this._areParamsEqual(validatedParams, this.params)) {
                this.params = validatedParams;
                this._clearPredictedData();
            }

        } catch (error) {
            console.error(`[OrbitStreamer] Error updating parameters for satellite ${this.satelliteId}:`, error);
        }
    }

    /**
     * Get latest point from any source
     * @returns {Object|null} Latest point or null if no points
     */
    getLatestPoint() {
        const allPoints = [...this.physicsPoints, ...this.predictedPoints];
        if (allPoints.length === 0) return null;

        // Return point with latest timestamp
        return allPoints.reduce((latest, current) =>
            current.time > latest.time ? current : latest
        );
    }

    /**
     * Clear all data
     */
    clear() {
        this.physicsPoints = [];
        this.predictedPoints = [];
        this.isExtending = false;
        this.extensionProgress = 0;
        this.lastPointTime = 0;

        // Reset stats but keep historical counters
        this.stats.lastExtensionTime = 0;
    }

    // ================================================================
    // PRIVATE METHODS
    // ================================================================

    /**
     * Validate and normalize parameters
     * @private
     */
    _validateParams(params) {
        const validated = {
            periods: Math.max(0.1, params.periods || STREAMING_CONFIG.DEFAULT_PERIODS), // No maximum limit - user has full control
            pointsPerPeriod: Math.max(8, params.pointsPerPeriod || STREAMING_CONFIG.DEFAULT_POINTS_PER_PERIOD) // No maximum limit - user has full control
        };

        return validated;
    }

    /**
     * Validate point data
     * @private
     */
    _isValidPoint(point) {
        if (!point || typeof point !== 'object') return false;
        if (!Array.isArray(point.position) || point.position.length !== 3) return false;
        if (!Array.isArray(point.velocity) || point.velocity.length !== 3) return false;
        if (typeof point.time !== 'number') return false;

        // Check for finite values
        const allFinite = [
            ...point.position,
            ...point.velocity,
            point.time
        ].every(val => Number.isFinite(val));

        return allFinite;
    }

    /**
     * Check if point is significant enough to keep
     * @private
     */
    _isSignificantPoint(point) {
        if (this.physicsPoints.length === 0) return true;

        const lastPoint = this.physicsPoints[this.physicsPoints.length - 1];

        // Distance check
        const distance = this._calculateDistance(point.position, lastPoint.position);
        if (distance < STREAMING_CONFIG.MIN_DISTANCE_THRESHOLD) return false;

        // Time check
        const timeDiff = Math.abs(point.time - lastPoint.time) / 1000; // Convert to seconds
        if (timeDiff < STREAMING_CONFIG.MAX_TIME_THRESHOLD) return false;

        return true;
    }

    /**
     * Calculate distance between two positions
     * @private
     */
    _calculateDistance(pos1, pos2) {
        const dx = pos1[0] - pos2[0];
        const dy = pos1[1] - pos2[1];
        const dz = pos1[2] - pos2[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Check if we have sufficient orbit coverage
     * @private
     */
    _hasSufficientCoverage() {
        const coverage = this._calculateCoverage();
        return coverage >= STREAMING_CONFIG.COMPLETION_THRESHOLD;
    }

    /**
     * Calculate current coverage percentage
     * @private
     */
    _calculateCoverage() {
        const totalPoints = this.physicsPoints.length + this.predictedPoints.length;
        const requiredPoints = this.params.periods * this.params.pointsPerPeriod;

        if (requiredPoints === 0) return 0;

        const pointCoverage = Math.min(1, totalPoints / requiredPoints);

        // Also consider duration coverage if we have enough points
        if (this.physicsPoints.length >= STREAMING_CONFIG.MIN_POINTS_FOR_ANALYSIS) {
            const currentDuration = this._getCurrentDuration();
            const requiredDuration = this._calculateRequiredDuration();
            const durationCoverage = Math.min(1, currentDuration / requiredDuration);

            // Use the maximum of both coverage types
            return Math.max(pointCoverage, durationCoverage);
        }

        return pointCoverage;
    }

    /**
     * Calculate current duration coverage
     * @private
     */
    _getCurrentDuration() {
        if (this.physicsPoints.length < 2) return 0;

        const firstPoint = this.physicsPoints[0];
        const lastPoint = this.physicsPoints[this.physicsPoints.length - 1];

        return Math.abs(lastPoint.time - firstPoint.time) / 1000; // Convert to seconds
    }

    /**
     * Calculate required duration for orbit coverage
     * @private
     */
    _calculateRequiredDuration() {
        const period = this._estimateOrbitalPeriod();
        return this.params.periods * period;
    }

    /**
     * Estimate orbital period from current data
     * @private
     */
    _estimateOrbitalPeriod() {
        if (this.physicsPoints.length === 0) {
            return STREAMING_CONFIG.MIN_ORBITAL_PERIOD;
        }

        const latestPoint = this.physicsPoints[this.physicsPoints.length - 1];

        // Get gravitational parameter
        let mu = STREAMING_CONFIG.EARTH_GM;
        let centralBodyRadius = STREAMING_CONFIG.EARTH_RADIUS;

        if (this.centralBodyData) {
            mu = this.centralBodyData.GM || mu;
            centralBodyRadius = this.centralBodyData.radius || centralBodyRadius;
        }

        // Calculate orbital radius
        const r = Math.sqrt(
            latestPoint.position[0] ** 2 +
            latestPoint.position[1] ** 2 +
            latestPoint.position[2] ** 2
        );

        // Ensure reasonable orbital radius
        const minRadius = centralBodyRadius + STREAMING_CONFIG.MIN_ALTITUDE;
        const maxRadius = centralBodyRadius + STREAMING_CONFIG.MAX_ALTITUDE;
        const clampedRadius = Math.max(minRadius, Math.min(maxRadius, r));

        // Simplified circular orbit period estimate
        const period = 2 * Math.PI * Math.sqrt(clampedRadius ** 3 / mu);

        // Clamp to reasonable bounds
        return Math.max(
            STREAMING_CONFIG.MIN_ORBITAL_PERIOD,
            Math.min(STREAMING_CONFIG.MAX_ORBITAL_PERIOD, period)
        );
    }

    /**
     * Check if parameters are equal within tolerance
     * @private
     */
    _areParamsEqual(params1, params2) {
        const precision = STREAMING_CONFIG.PARAM_EQUALITY_PRECISION;

        return Math.abs(params1.periods - params2.periods) < precision &&
            Math.abs(params1.pointsPerPeriod - params2.pointsPerPeriod) < precision;
    }

    /**
     * Clear predicted data
     * @private
     */
    _clearPredictedData() {
        this.predictedPoints = [];
        this.isExtending = false;
        this.extensionProgress = 0;
    }

    /**
     * Calculate apsis points from orbit data - find next periapsis/apoapsis in trajectory
     * @private
     */
    _calculateApsisPoints(points) {
        try {
            if (!points || points.length < STREAMING_CONFIG.MIN_POINTS_FOR_ANALYSIS) {
                console.log(`[OrbitStreamer] Not enough points for apsis calculation: ${points?.length || 0}`);
                return null;
            }

            console.log(`[OrbitStreamer] Finding next apsis points from ${points.length} trajectory points`);

            // Convert points to just position arrays for the apsis finder
            const trajectoryPoints = points.map(point => point.position);
            
            // Find the next periapsis and apoapsis in the actual trajectory
            const nextApsisPoints = this._findNextApsisPoints(trajectoryPoints);
            
            if (!nextApsisPoints.periapsis && !nextApsisPoints.apoapsis) {
                console.log(`[OrbitStreamer] No apsis points found in trajectory`);
                return null;
            }

            console.log(`[OrbitStreamer] Found next apsis points:`, {
                hasPeriapsis: !!nextApsisPoints.periapsis,
                hasApoapsis: !!nextApsisPoints.apoapsis,
                periapsisPosition: nextApsisPoints.periapsis?.position,
                apoapsisPosition: nextApsisPoints.apoapsis?.position,
                periapsisDistance: nextApsisPoints.periapsis?.distance,
                apoapsisDistance: nextApsisPoints.apoapsis?.distance
            });

            // Convert to the format expected by ApsisVisualizer
            const result = {
                periapsis: nextApsisPoints.periapsis ? {
                    position: nextApsisPoints.periapsis.position,
                    distance: nextApsisPoints.periapsis.distance,
                    altitude: nextApsisPoints.periapsis.altitude
                } : null,
                apoapsis: nextApsisPoints.apoapsis ? {
                    position: nextApsisPoints.apoapsis.position,
                    distance: nextApsisPoints.apoapsis.distance,
                    altitude: nextApsisPoints.apoapsis.altitude
                } : null
            };

            return result;

        } catch (error) {
            console.error('[OrbitStreamer] Error calculating apsis points:', error);
            return null;
        }
    }

    /**
     * Find next periapsis and apoapsis points in trajectory (copied from ApsisVisualizer)
     * @param {Array} orbitPoints - Array of orbit positions [[x,y,z], ...]
     * @private
     */
    _findNextApsisPoints(orbitPoints) {
        if (!orbitPoints || orbitPoints.length < 10) {
            return { periapsis: null, apoapsis: null };
        }

        const centralBodyRadius = this.centralBodyData?.radius || 6371; // Default to Earth radius

        // Calculate distances from central body for each point
        const pointsWithDistance = orbitPoints.map((point, index) => {
            const distance = Math.sqrt(point[0] * point[0] + point[1] * point[1] + point[2] * point[2]);
            return {
                position: point,
                distance: distance,
                altitude: distance - centralBodyRadius,
                index: index
            };
        });

        // Find local minima (periapsis candidates) and maxima (apoapsis candidates)
        let nextPeriapsis = null;
        let nextApoapsis = null;

        // Look for local extrema (peaks and valleys in distance)
        for (let i = 1; i < pointsWithDistance.length - 1; i++) {
            const current = pointsWithDistance[i];
            const prev = pointsWithDistance[i - 1];
            const next = pointsWithDistance[i + 1];

            // Local minimum (periapsis candidate)
            if (current.distance < prev.distance && current.distance < next.distance) {
                if (!nextPeriapsis || current.distance < nextPeriapsis.distance) {
                    nextPeriapsis = current;
                }
            }

            // Local maximum (apoapsis candidate)  
            if (current.distance > prev.distance && current.distance > next.distance) {
                if (!nextApoapsis || current.distance > nextApoapsis.distance) {
                    nextApoapsis = current;
                }
            }
        }

        console.log(`[OrbitStreamer] Next apsis search results:`, {
            totalPoints: pointsWithDistance.length,
            nextPeriapsis: nextPeriapsis ? {
                distance: nextPeriapsis.distance,
                altitude: nextPeriapsis.altitude,
                index: nextPeriapsis.index
            } : null,
            nextApoapsis: nextApoapsis ? {
                distance: nextApoapsis.distance, 
                altitude: nextApoapsis.altitude,
                index: nextApoapsis.index
            } : null
        });

        return {
            periapsis: nextPeriapsis,
            apoapsis: nextApoapsis
        };
    }
} 