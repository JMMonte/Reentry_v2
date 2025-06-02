/**
 * OrbitCacheManager.js
 * 
 * Manages caching of calculated orbit data
 */

export class OrbitCacheManager {
    constructor() {
        // Orbit data cache
        this.orbitCache = new Map(); // satelliteId -> { points, timestamp, hash }
    }

    /**
     * Get cached orbit data for satellite
     */
    getCachedOrbit(satelliteId) {
        return this.orbitCache.get(satelliteId);
    }

    /**
     * Cache orbit data for satellite
     */
    setCachedOrbit(satelliteId, orbitData) {
        this.orbitCache.set(satelliteId, orbitData);
    }

    /**
     * Remove cached orbit for satellite
     */
    removeCachedOrbit(satelliteId) {
        this.orbitCache.delete(satelliteId);
    }

    /**
     * Check if satellite state has changed significantly
     */
    hasStateChanged(satellite, cached) {
        if (!cached || !cached.initialPosition) return true;
        
        // Don't check current position - it's always changing!
        // Instead, check if we're still on the same orbit by comparing central body
        // and checking if a maneuver has occurred
        if (satellite.centralBodyNaifId !== cached.centralBodyNaifId) {
            return true;
        }
        
        // Check if a maneuver has occurred by looking for a significant velocity change
        // This would be set by the physics engine when a maneuver executes
        if (satellite.lastManeuverTime && (!cached.lastManeuverTime || 
            satellite.lastManeuverTime > cached.lastManeuverTime)) {
            return true;
        }
        
        return false;
    }

    /**
     * Compute simple hash of satellite physical state only
     */
    computeStateHash(satellite) {
        // Handle both Vector3 and array formats
        const pos = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
        const vel = satellite.velocity.toArray ? satellite.velocity.toArray() : satellite.velocity;
        // Only include physical state, not display settings
        return `${pos[0].toFixed(3)},${pos[1].toFixed(3)},${pos[2].toFixed(3)},${vel[0].toFixed(3)},${vel[1].toFixed(3)},${vel[2].toFixed(3)},${satellite.centralBodyNaifId}`;
    }

    /**
     * Check if cached orbit needs extension
     */
    needsExtension(cached, requestedPeriods) {
        if (!cached) return false;
        const cachedPeriods = cached.maxPeriods || 0;
        return requestedPeriods > cachedPeriods;
    }

    /**
     * Create cache entry for orbit data
     */
    createCacheEntry(points, params, satellite, physicsEngine) {
        return {
            points: points,
            timestamp: Date.now(),
            hash: params.hash,
            maxPeriods: params.maxPeriods,
            initialPosition: params.existingPoints?.length > 0 && params.existingPoints[0].position 
                ? params.existingPoints[0].position 
                : params.satellite.position,
            initialVelocity: params.existingPoints?.length > 0 && params.existingPoints[0].velocity
                ? params.existingPoints[0].velocity
                : params.satellite.velocity,
            calculationTime: params.calculationTime || (physicsEngine.simulationTime?.getTime() || Date.now()),
            centralBodyNaifId: params.satellite.centralBodyNaifId,
            lastManeuverTime: satellite?.lastManeuverTime,
            partial: false, // Mark as complete
            // Add propagation metadata for debug window
            duration: params.duration,
            pointsPerPeriod: params.pointsPerPeriod,
            requestedPeriods: params.requestedPeriods,
            pointCount: points.length
        };
    }

    /**
     * Create partial cache entry for interrupted calculations
     */
    createPartialCacheEntry(points, params, physicsEngine) {
        return {
            points: points,
            timestamp: Date.now(),
            hash: params.hash,
            maxPeriods: params.maxPeriods,
            initialPosition: params.satellite.position,
            initialVelocity: params.satellite.velocity,
            calculationTime: physicsEngine.simulationTime?.getTime() || Date.now(),
            partial: true,
            // Add propagation metadata for debug window
            duration: params.duration,
            pointsPerPeriod: params.pointsPerPeriod,
            requestedPeriods: params.requestedPeriods,
            pointCount: points.length
        };
    }

    /**
     * Clear all cached orbits
     */
    clearAll() {
        this.orbitCache.clear();
    }

    /**
     * Get all cached satellite IDs
     */
    getCachedSatelliteIds() {
        return Array.from(this.orbitCache.keys());
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            totalCached: this.orbitCache.size,
            cacheEntries: Array.from(this.orbitCache.entries()).map(([id, data]) => ({
                satelliteId: id,
                pointCount: data.points?.length || 0,
                isPartial: data.partial || false,
                timestamp: data.timestamp
            }))
        };
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.clearAll();
    }
}