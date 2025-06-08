/**
 * POIVisibilityService - Detects which POIs are visible to satellites
 * and calculates time to next passage
 */

export class POIVisibilityService {
    /**
     * Calculate great circle distance between two points on a sphere
     * @param {number} lat1 - Latitude of point 1 in degrees
     * @param {number} lon1 - Longitude of point 1 in degrees
     * @param {number} lat2 - Latitude of point 2 in degrees
     * @param {number} lon2 - Longitude of point 2 in degrees
     * @returns {number} Distance in degrees
     */
    static greatCircleDistance(lat1, lon1, lat2, lon2) {
        const toRad = deg => deg * Math.PI / 180;
        
        const phi1 = toRad(lat1);
        const phi2 = toRad(lat2);
        const deltaPhi = toRad(lat2 - lat1);
        const deltaLambda = toRad(lon2 - lon1);
        
        const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return c * 180 / Math.PI; // Return in degrees
    }
    
    /**
     * Check if a POI is visible from a satellite
     * @param {Object} poi - {name, lat, lon}
     * @param {Object} satellite - {lat, lon, alt, coverageRadius}
     * @returns {boolean} True if POI is within satellite coverage
     */
    static isPOIVisible(poi, satellite) {
        const distance = this.greatCircleDistance(
            poi.lat, poi.lon,
            satellite.lat, satellite.lon
        );
        return distance <= satellite.coverageRadius;
    }
    
    /**
     * Get all POIs visible to a satellite
     * @param {Array} pois - Array of POI objects
     * @param {Object} satellite - Satellite with position and coverage
     * @returns {Array} Array of visible POIs
     */
    static getVisiblePOIs(pois, satellite) {
        return pois.filter(poi => this.isPOIVisible(poi, satellite));
    }
    
    /**
     * Calculate visibility status for all POIs and satellites
     * @param {Object} poiData - POI data organized by category
     * @param {Array} satellites - Array of satellites with positions and coverage
     * @returns {Object} Visibility data organized by POI
     */
    static calculateVisibility(poiData, satellites) {
        const results = {};
        
        // Flatten all POIs with their categories
        const allPOIs = [];
        Object.entries(poiData).forEach(([category, pois]) => {
            if (Array.isArray(pois)) {
                pois.forEach(poi => {
                    if (poi.lat !== undefined && poi.lon !== undefined) {
                        allPOIs.push({
                            ...poi,
                            category,
                            id: `${category}_${poi.lat}_${poi.lon}`
                        });
                    }
                });
            }
        });
        
        // Check each POI against each satellite
        allPOIs.forEach(poi => {
            const visibleSatellites = [];
            
            satellites.forEach(sat => {
                if (this.isPOIVisible(poi, sat)) {
                    visibleSatellites.push({
                        id: sat.id,
                        name: sat.name || `Satellite ${sat.id}`,
                        color: sat.color
                    });
                }
            });
            
            if (visibleSatellites.length > 0) {
                results[poi.id] = {
                    poi,
                    visibleSatellites,
                    visibilityCount: visibleSatellites.length
                };
            }
        });
        
        return results;
    }
    
    /**
     * Group visibility results by category
     * @param {Object} visibilityData - Raw visibility data
     * @returns {Object} Data grouped by category
     */
    static groupByCategory(visibilityData) {
        const grouped = {};
        
        Object.values(visibilityData).forEach(item => {
            const category = item.poi.category;
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(item);
        });
        
        // Sort each category by visibility count (descending)
        Object.keys(grouped).forEach(category => {
            grouped[category].sort((a, b) => b.visibilityCount - a.visibilityCount);
        });
        
        return grouped;
    }
    
    /**
     * Estimate time to next passage for a POI
     * This is a simplified calculation - for accurate results, 
     * we'd need to propagate orbits forward
     * @param {Object} poi - POI to check
     * @param {Array} satellites - Array of satellites
     * @param {Array} groundTracks - Ground track data for satellites
     * @returns {Object|null} Next passage info or null
     */
    static estimateNextPassage(poi, satellites, groundTracks) {
        // For now, return a placeholder
        // Full implementation would require orbit propagation
        return {
            estimatedTime: null,
            satelliteId: null,
            uncertainty: 'high'
        };
    }
}

export const poiVisibilityService = new POIVisibilityService();