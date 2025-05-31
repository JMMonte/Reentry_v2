/**
 * CelestialOrbit - Pure data class for celestial body orbits
 * Handles orbit calculation logic without any rendering concerns
 */
export class CelestialOrbit {
    constructor(bodyId, parentId, config = {}) {
        this.bodyId = bodyId;
        this.parentId = parentId;
        this.config = config;
        
        // Orbit data
        this.points = []; // Array of THREE.Vector3
        this.period = null;
        this.lastCalculationTime = null;
        this.needsUpdate = true;
        
        // Orbit properties
        this.eccentricity = null;
        this.semiMajorAxis = null;
        this.inclination = null;
        
        // Unique identifier for this orbit
        this.id = `${bodyId}-${parentId}`;
    }
    
    /**
     * Check if this orbit needs recalculation
     */
    shouldUpdate(currentTime, timeDeltaThreshold = 86400000) { // 24 hours default
        if (!this.lastCalculationTime) return true;
        if (this.needsUpdate) return true;
        
        // Only update if significant time has passed
        const timeDelta = Math.abs(currentTime.getTime() - this.lastCalculationTime.getTime());
        return timeDelta > timeDeltaThreshold;
    }
    
    /**
     * Get time range for orbit calculation based on period
     */
    getTimeRange(currentTime) {
        if (!this.period) {
            // Default to 1 year for unknown periods
            return {
                start: new Date(currentTime.getTime() - 365.25 * 24 * 3600 * 1000 / 2),
                end: new Date(currentTime.getTime() + 365.25 * 24 * 3600 * 1000 / 2),
                duration: 365.25 * 24 * 3600 // seconds
            };
        }
        
        const halfPeriodMs = this.period * 1000 / 2;
        return {
            start: new Date(currentTime.getTime() - halfPeriodMs),
            end: new Date(currentTime.getTime() + halfPeriodMs),
            duration: this.period // seconds
        };
    }
    
    /**
     * Get optimal number of points for this orbit
     */
    getNumPoints() {
        if (!this.period) return 120; // Default
        
        // 60-200 points based on period
        return Math.min(200, Math.max(60, Math.floor(this.period / 3600)));
    }
    
    /**
     * Update orbit points and mark as calculated
     */
    updatePoints(points, currentTime) {
        this.points = points;
        this.lastCalculationTime = currentTime;
        this.needsUpdate = false;
    }
    
    /**
     * Mark orbit as needing update
     */
    invalidate() {
        this.needsUpdate = true;
    }
    
    /**
     * Get data source type for this orbit
     */
    getDataSourceType() {
        // This will be implemented by the calculator to determine routing
        return 'unknown';
    }
}