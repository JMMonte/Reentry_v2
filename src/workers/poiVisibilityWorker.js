/**
 * POI Visibility Worker
 * 
 * Handles computationally intensive POI visibility calculations in a Web Worker
 * to keep the main thread responsive.
 */

/**
 * Calculate great circle distance between two points
 * @param {number} lat1 - Latitude 1 in degrees
 * @param {number} lon1 - Longitude 1 in degrees
 * @param {number} lat2 - Latitude 2 in degrees
 * @param {number} lon2 - Longitude 2 in degrees
 * @returns {number} Distance in degrees
 */
function greatCircleDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c) / 111.32; // Convert km to degrees (approximate)
}

/**
 * Check if a POI is visible from satellite position
 * @param {Object} poi - POI object with lat, lon
 * @param {Object} satellite - Satellite object with lat, lon, coverageRadius
 * @returns {boolean} True if POI is visible
 */
function isPOIVisible(poi, satellite) {
    const distance = greatCircleDistance(
        poi.lat, poi.lon,
        satellite.lat, satellite.lon
    );
    return distance <= satellite.coverageRadius;
}

/**
 * Calculate visibility for all POI-satellite combinations
 * @param {Array} pois - Array of POI objects
 * @param {Array} satellites - Array of satellite objects
 * @returns {Object} Visibility results grouped by satellite
 */
function calculateVisibility(pois, satellites) {
    const result = {};
    
    satellites.forEach(satellite => {
        const visiblePOIs = [];
        
        pois.forEach(poi => {
            if (isPOIVisible(poi, satellite)) {
                visiblePOIs.push(poi);
            }
        });
        
        if (visiblePOIs.length > 0) {
            // Group by category
            const grouped = {};
            visiblePOIs.forEach(poi => {
                if (!grouped[poi.category]) {
                    grouped[poi.category] = [];
                }
                grouped[poi.category].push(poi);
            });
            
            result[satellite.id] = {
                satellite,
                visiblePOIs: grouped,
                totalCount: visiblePOIs.length
            };
        }
    });
    
    return result;
}

// Worker message handler
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'CALCULATE_VISIBILITY': {
            try {
                const { pois, satellites, requestId } = data;
                
                // Perform the calculation
                const result = calculateVisibility(pois, satellites);
                
                // Send result back to main thread
                self.postMessage({
                    type: 'VISIBILITY_RESULT',
                    data: {
                        result,
                        requestId,
                        timestamp: Date.now()
                    }
                });
            } catch (error) {
                self.postMessage({
                    type: 'VISIBILITY_ERROR',
                    data: {
                        error: error.message,
                        requestId: data.requestId
                    }
                });
            }
            break;
        }
        
        case 'PING': {
            self.postMessage({
                type: 'PONG',
                data: { timestamp: Date.now() }
            });
            break;
        }
        
        default:
            console.warn('[POIVisibilityWorker] Unknown message type:', type);
    }
};