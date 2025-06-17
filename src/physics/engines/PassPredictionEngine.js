/**
 * PassPredictionEngine.js
 * 
 * Physics-based pass prediction engine that integrates into the physics update cycle
 * Calculates POI passes centrally and streams results to UI components
 * 
 * Design principles:
 * 1. Centralized calculation in physics engine
 * 2. UI components consume results, don't trigger calculations
 * 3. Real-time updates as part of physics cycle
 * 4. Consistent physics-based predictions
 */

import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';

export class PassPredictionEngine {
    constructor(physicsEngine) {
        this.physicsEngine = physicsEngine;

        // Pass data storage - organized by POI for efficient access
        this.passData = new Map(); // Map<poiId, PassData>
        this.activePOIs = new Map(); // Map<poiId, POIData>

        // Caching for expensive calculations
        this.orbitCache = new Map(); // Map<satelliteId, CachedOrbitData>
        this.groundTrackCache = new Map(); // Map<orbitCacheKey, GroundTrackData>
        this.visibilityCache = new Map(); // Map<visibilityCacheKey, VisibilityData>

        // Update timing
        this.lastPassUpdate = 0;
        this.passUpdateInterval = 30000; // 30 seconds - passes don't change frequently

        // Configuration
        this.predictionDuration = 86400 * 7; // 7 days
        this.predictionTimeStep = 60; // 1 minute
        this.minElevation = 0; // Minimum elevation for pass detection
        this.maxRange = 2000; // Maximum range (km)

        // Cache configuration
        this.orbitCacheTimeout = 60000; // 1 minute - orbit data validity
        this.groundTrackCacheTimeout = 300000; // 5 minutes - ground track validity
        this.visibilityCacheTimeout = 10000; // 10 seconds - visibility validity

        // Performance tracking
        this.stats = {
            totalCalculations: 0,
            lastCalculationTime: 0,
            activePOICount: 0,
            totalPasses: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Register a POI for pass prediction
     * @param {string} poiId - Unique POI identifier
     * @param {Object} poiData - POI data {lat, lon, name, minElevation?, category?}
     */
    registerPOI(poiId, poiData) {
        this.activePOIs.set(poiId, {
            ...poiData,
            id: poiId,
            registeredAt: Date.now()
        });

        // Initialize empty pass data
        this.passData.set(poiId, {
            passes: new Map(), // Map<satelliteId, PassArray>
            lastUpdate: 0,
            isCalculating: false
        });

        this.stats.activePOICount = this.activePOIs.size;
    }

    /**
     * Unregister a POI from pass prediction
     * @param {string} poiId - POI identifier to remove
     */
    unregisterPOI(poiId) {
        this.activePOIs.delete(poiId);
        this.passData.delete(poiId);
        this.stats.activePOICount = this.activePOIs.size;
    }

    /**
     * Get pass data for a specific POI and satellite
     * @param {string} poiId - POI identifier
     * @param {string} satelliteId - Satellite identifier (optional)
     * @returns {Object} Pass data
     */
    getPassData(poiId, satelliteId = null) {
        const poiPassData = this.passData.get(poiId);
        if (!poiPassData) return null;

        if (satelliteId) {
            return poiPassData.passes.get(satelliteId) || [];
        }

        // Return all passes for this POI
        const allPasses = {};
        for (const [satId, passes] of poiPassData.passes) {
            allPasses[satId] = passes;
        }

        return {
            passes: allPasses,
            lastUpdate: poiPassData.lastUpdate,
            isCalculating: poiPassData.isCalculating
        };
    }

    /**
     * Update pass predictions - called from physics engine update cycle
     * @param {Date} simulationTime - Current simulation time
     */
    updatePasses(simulationTime) {
        const now = performance.now();

        // Check if it's time for pass update
        if (now - this.lastPassUpdate < this.passUpdateInterval) return;
        this.lastPassUpdate = now;

        // No POIs registered
        if (this.activePOIs.size === 0) return;

        // Clean old cache entries before calculations
        this._cleanOldCacheEntries();

        // Calculate passes for all POI-satellite combinations
        this._calculateAllPasses(simulationTime);
    }

    /**
     * Clean old cache entries to prevent memory leaks
     * @private
     */
    _cleanOldCacheEntries() {
        const now = Date.now();

        // Clean orbit cache
        for (const [key, data] of this.orbitCache) {
            if (now - data.timestamp > this.orbitCacheTimeout) {
                this.orbitCache.delete(key);
            }
        }

        // Clean ground track cache
        for (const [key, data] of this.groundTrackCache) {
            if (now - data.timestamp > this.groundTrackCacheTimeout) {
                this.groundTrackCache.delete(key);
            }
        }

        // Clean visibility cache
        for (const [key, data] of this.visibilityCache) {
            if (now - data.timestamp > this.visibilityCacheTimeout) {
                this.visibilityCache.delete(key);
            }
        }
    }

    /**
     * Calculate passes for all POIs and satellites
     * @param {Date} simulationTime - Current simulation time
     * @private
     */
    async _calculateAllPasses(simulationTime) {
        const startTime = performance.now();

        try {
            // Get all active satellites
            const satellites = this.physicsEngine.satelliteEngine?.satellites;
            if (!satellites || satellites.size === 0) return;

            // Get physics bodies
            const bodies = this.physicsEngine.bodies;
            if (!bodies) return;

            const promises = [];

            // Calculate passes for each POI
            for (const [poiId, poi] of this.activePOIs) {
                const poiPassData = this.passData.get(poiId);
                if (poiPassData.isCalculating) continue; // Skip if already calculating

                poiPassData.isCalculating = true;

                // Calculate passes for each satellite to this POI
                for (const [satelliteId, satellite] of satellites) {
                    promises.push(
                        this._calculateSatellitePasses(poiId, poi, satelliteId, satellite, bodies, simulationTime)
                    );
                }
            }

            // Wait for all calculations to complete
            await Promise.all(promises);

            // Update statistics
            this.stats.totalCalculations++;
            this.stats.lastCalculationTime = performance.now() - startTime;

            // Emit update event for UI components
            this._emitPassUpdateEvent();

        } catch (error) {
            console.error('[PassPredictionEngine] Error calculating passes:', error);
        }
    }

    /**
     * Calculate passes for a specific satellite-POI combination with caching
     * @param {string} poiId - POI identifier
     * @param {Object} poi - POI data
     * @param {string} satelliteId - Satellite identifier
     * @param {Object} satellite - Satellite state
     * @param {Object} bodies - Physics bodies
     * @param {Date} simulationTime - Current simulation time
     * @private
     */
    async _calculateSatellitePasses(poiId, poi, satelliteId, satellite, bodies, simulationTime) {
        try {
            // Check orbit cache first
            const orbitCacheKey = this._generateOrbitCacheKey(satelliteId, satellite, simulationTime);
            let orbitPoints = this._getFromOrbitCache(orbitCacheKey);

            if (!orbitPoints) {
                // Cache miss - calculate orbit
                this.stats.cacheMisses++;
                
                orbitPoints = await UnifiedSatellitePropagator.propagateOrbit({
                    satellite: {
                        position: satellite.position.toArray(),
                        velocity: satellite.velocity.toArray(),
                        centralBodyNaifId: satellite.centralBodyNaifId,
                        mass: satellite.mass || 1000,
                        crossSectionalArea: satellite.crossSectionalArea || 2.0,
                        dragCoefficient: satellite.dragCoefficient || 2.2
                    },
                    bodies,
                    duration: this.predictionDuration,
                    timeStep: this.predictionTimeStep,
                    startTime: simulationTime.getTime() / 1000,
                    includeJ2: true,
                    includeDrag: true,
                    includeThirdBody: false
                });

                // Cache the orbit data
                this._setInOrbitCache(orbitCacheKey, orbitPoints);
            } else {
                // Cache hit
                this.stats.cacheHits++;
            }

            // Convert to ground track with caching
            const groundTrackCacheKey = this._generateGroundTrackCacheKey(orbitCacheKey, satellite.centralBodyNaifId);
            let groundTrackPoints = this._getFromGroundTrackCache(groundTrackCacheKey);

            if (!groundTrackPoints) {
                // Cache miss - convert to ground track
                groundTrackPoints = await this._convertToGroundTrack(
                    orbitPoints,
                    bodies[satellite.centralBodyNaifId]
                );

                // Cache the ground track data
                this._setInGroundTrackCache(groundTrackCacheKey, groundTrackPoints);
            }

            // Calculate passes (this is POI-specific, so no global caching)
            const passes = this._calculatePasses(poi, groundTrackPoints, bodies[satellite.centralBodyNaifId]);

            // Store results
            const poiPassData = this.passData.get(poiId);
            poiPassData.passes.set(satelliteId, passes);
            poiPassData.lastUpdate = Date.now();
            poiPassData.isCalculating = false;

        } catch (error) {
            console.error(`[PassPredictionEngine] Error calculating passes for POI ${poiId}, satellite ${satelliteId}:`, error);

            // Clear calculating flag on error
            const poiPassData = this.passData.get(poiId);
            if (poiPassData) {
                poiPassData.isCalculating = false;
            }
        }
    }

    /**
     * Generate orbit cache key
     * @param {string} satelliteId - Satellite identifier
     * @param {Object} satellite - Satellite state
     * @param {Date} simulationTime - Current simulation time
     * @returns {string} Cache key
     * @private
     */
    _generateOrbitCacheKey(satelliteId, satellite, simulationTime) {
        // Round time to nearest minute for cache stability
        const roundedTime = Math.floor(simulationTime.getTime() / 60000) * 60000;
        
        // Create key from satellite state (rounded for cache efficiency)
        const posKey = satellite.position.toArray().map(x => Math.round(x * 1000) / 1000).join(',');
        const velKey = satellite.velocity.toArray().map(x => Math.round(x * 1000) / 1000).join(',');
        
        return `${satelliteId}_${roundedTime}_${posKey}_${velKey}_${satellite.centralBodyNaifId}`;
    }

    /**
     * Generate ground track cache key
     * @param {string} orbitCacheKey - Orbit cache key
     * @param {number} centralBodyNaifId - Central body NAIF ID
     * @returns {string} Cache key
     * @private
     */
    _generateGroundTrackCacheKey(orbitCacheKey, centralBodyNaifId) {
        return `gt_${orbitCacheKey}_${centralBodyNaifId}`;
    }

    /**
     * Get orbit data from cache
     * @param {string} cacheKey - Cache key
     * @returns {Array|null} Cached orbit data or null
     * @private
     */
    _getFromOrbitCache(cacheKey) {
        const cached = this.orbitCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.orbitCacheTimeout) {
            return cached.data;
        }
        return null;
    }

    /**
     * Set orbit data in cache
     * @param {string} cacheKey - Cache key
     * @param {Array} orbitData - Orbit data to cache
     * @private
     */
    _setInOrbitCache(cacheKey, orbitData) {
        this.orbitCache.set(cacheKey, {
            data: orbitData,
            timestamp: Date.now()
        });
    }

    /**
     * Get ground track data from cache
     * @param {string} cacheKey - Cache key
     * @returns {Array|null} Cached ground track data or null
     * @private
     */
    _getFromGroundTrackCache(cacheKey) {
        const cached = this.groundTrackCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.groundTrackCacheTimeout) {
            return cached.data;
        }
        return null;
    }

    /**
     * Set ground track data in cache
     * @param {string} cacheKey - Cache key
     * @param {Array} groundTrackData - Ground track data to cache
     * @private
     */
    _setInGroundTrackCache(cacheKey, groundTrackData) {
        this.groundTrackCache.set(cacheKey, {
            data: groundTrackData,
            timestamp: Date.now()
        });
    }

    /**
     * Convert ECI orbit points to ground track
     * @param {Array} orbitPoints - Orbit points from propagation
     * @param {Object} centralBody - Central body data
     * @returns {Array} Ground track points
     * @private
     */
    async _convertToGroundTrack(orbitPoints, centralBody) {
        const groundTrackPoints = [];

        for (const point of orbitPoints) {
            const eciPosition = point.position;
            const radius = Math.sqrt(eciPosition[0] ** 2 + eciPosition[1] ** 2 + eciPosition[2] ** 2);
            const lat = Math.asin(eciPosition[2] / radius) * 180 / Math.PI;
            const lon = Math.atan2(eciPosition[1], eciPosition[0]) * 180 / Math.PI;
            const altitude = radius - centralBody.radius;

            groundTrackPoints.push({
                time: point.time * 1000, // Convert to milliseconds
                lat,
                lon,
                alt: altitude,
                position: eciPosition,
                velocity: point.velocity
            });
        }

        return groundTrackPoints;
    }

    /**
     * Calculate passes from ground track
     * @param {Object} poi - POI data
     * @param {Array} groundTrackPoints - Ground track points
     * @param {Object} centralBody - Central body data
     * @returns {Array} Pass objects
     * @private
     */
    _calculatePasses(poi, groundTrackPoints, centralBody) {
        const passes = [];
        let currentPass = null;
        let lastVisible = false;

        for (let i = 0; i < groundTrackPoints.length; i++) {
            const point = groundTrackPoints[i];

            // Calculate visibility
            const visibility = this._calculateVisibility(poi, point, centralBody);
            const isVisible = visibility.elevation >= this.minElevation &&
                visibility.range <= this.maxRange &&
                visibility.elevation > 0;

            // AOS - Acquisition of Signal
            if (isVisible && !lastVisible) {
                currentPass = {
                    aos: point.time,
                    aosIndex: i,
                    points: [point],
                    maxElevation: visibility.elevation,
                    minRange: visibility.range,
                    maxElevationTime: point.time,
                    visibility: [visibility],
                    satelliteId: point.satelliteId,
                    poiId: poi.id
                };
            }

            // Track the pass
            if (isVisible && currentPass) {
                currentPass.points.push(point);
                currentPass.visibility.push(visibility);

                if (visibility.elevation > currentPass.maxElevation) {
                    currentPass.maxElevation = visibility.elevation;
                    currentPass.maxElevationTime = point.time;
                }

                if (visibility.range < currentPass.minRange) {
                    currentPass.minRange = visibility.range;
                }
            }

            // LOS - Loss of Signal
            if (!isVisible && lastVisible && currentPass) {
                currentPass.los = groundTrackPoints[i - 1].time;
                currentPass.losIndex = i - 1;
                currentPass.duration = currentPass.los - currentPass.aos;
                currentPass.quality = this._assessPassQuality(currentPass);

                passes.push(currentPass);
                currentPass = null;
            }

            lastVisible = isVisible;
        }

        // Handle case where track ends while still visible
        if (currentPass && lastVisible) {
            currentPass.los = groundTrackPoints[groundTrackPoints.length - 1].time;
            currentPass.losIndex = groundTrackPoints.length - 1;
            currentPass.duration = currentPass.los - currentPass.aos;
            currentPass.quality = this._assessPassQuality(currentPass);
            passes.push(currentPass);
        }

        return passes;
    }

    /**
     * Calculate visibility parameters
     * @param {Object} poi - POI data
     * @param {Object} satPoint - Satellite ground track point
     * @param {Object} centralBody - Central body data
     * @returns {Object} Visibility data
     * @private
     */
    _calculateVisibility(poi, satPoint, centralBody) {
        // Convert POI to ECI coordinates (simplified)
        const poiRadius = centralBody.radius + (poi.alt || 0);
        const poiLat = poi.lat * Math.PI / 180;
        const poiLon = poi.lon * Math.PI / 180;

        const poiECI = [
            poiRadius * Math.cos(poiLat) * Math.cos(poiLon),
            poiRadius * Math.cos(poiLat) * Math.sin(poiLon),
            poiRadius * Math.sin(poiLat)
        ];

        // Calculate range vector
        const rangeVector = [
            satPoint.position[0] - poiECI[0],
            satPoint.position[1] - poiECI[1],
            satPoint.position[2] - poiECI[2]
        ];

        const range = Math.sqrt(rangeVector[0] ** 2 + rangeVector[1] ** 2 + rangeVector[2] ** 2);

        // Calculate elevation (simplified)
        const poiToCenter = [-poiECI[0], -poiECI[1], -poiECI[2]];
        const poiToCenterMag = Math.sqrt(poiToCenter[0] ** 2 + poiToCenter[1] ** 2 + poiToCenter[2] ** 2);
        const poiToCenterUnit = poiToCenter.map(x => x / poiToCenterMag);

        const rangeUnit = rangeVector.map(x => x / range);
        const dotProduct = poiToCenterUnit[0] * rangeUnit[0] +
            poiToCenterUnit[1] * rangeUnit[1] +
            poiToCenterUnit[2] * rangeUnit[2];

        const elevation = (Math.PI / 2 - Math.acos(Math.abs(dotProduct))) * 180 / Math.PI;
        const azimuth = Math.atan2(rangeVector[1], rangeVector[0]) * 180 / Math.PI;

        return {
            elevation: Math.max(0, elevation),
            azimuth: azimuth < 0 ? azimuth + 360 : azimuth,
            range
        };
    }

    /**
     * Assess pass quality
     * @param {Object} pass - Pass data
     * @returns {Object} Quality assessment
     * @private
     */
    _assessPassQuality(pass) {
        const durationMinutes = pass.duration / 60000;

        let score = 0;

        // Elevation scoring
        if (pass.maxElevation > 75) score += 5;
        else if (pass.maxElevation > 60) score += 4;
        else if (pass.maxElevation > 45) score += 3;
        else if (pass.maxElevation > 30) score += 2;
        else if (pass.maxElevation > 15) score += 1;

        // Duration scoring
        if (durationMinutes > 10) score += 3;
        else if (durationMinutes > 7) score += 2;
        else if (durationMinutes > 4) score += 1;

        let rating = 'Poor';
        if (score >= 7) rating = 'Excellent';
        else if (score >= 5) rating = 'Good';
        else if (score >= 3) rating = 'Fair';
        else if (score >= 1) rating = 'Marginal';

        return {
            rating,
            score,
            isPhysicsBased: true,
            factors: {
                elevation: pass.maxElevation,
                duration: durationMinutes,
                minRange: pass.minRange
            }
        };
    }

    /**
     * Emit pass update event for UI components
     * @private
     */
    _emitPassUpdateEvent() {
        // Calculate total passes
        let totalPasses = 0;
        for (const [, poiPassData] of this.passData) {
            for (const [, passes] of poiPassData.passes) {
                totalPasses += passes.length;
            }
        }

        this.stats.totalPasses = totalPasses;

        // Emit custom event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('passDataUpdate', {
                detail: {
                    engine: this,
                    stats: this.stats,
                    timestamp: Date.now()
                }
            }));
        }
    }

    /**
     * Cleanup engine state
     */
    cleanup() {
        this.orbitCache.clear();
        this.groundTrackCache.clear();
        this.visibilityCache.clear();
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            predictions: 0,
            visibilityCalculations: 0
        };
    }
} 