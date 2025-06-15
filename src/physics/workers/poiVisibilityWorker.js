/**
 * POI Visibility Worker (refactored)
 * ----------------------------------
 * Performs heavy POI-satellite visibility work in a background thread.
 * All math comes from POIVisibilityService; this file only orchestrates
 * the per-satellite loop and message passing.
 */

import { POIVisibilityService as Vis } from '../../services/POIVisibilityService.js';

/**
 * Group visible POIs by category for a single satellite.
 * @param {Array} visiblePOIs
 */
function groupByCategory(visiblePOIs) {
    const grouped = {};
    visiblePOIs.forEach(poi => {
        if (!grouped[poi.category]) grouped[poi.category] = [];
        grouped[poi.category].push(poi);
    });
    return grouped;
}

/**
 * Calculate visibility for all satellites.
 * Minimal logic here – loops & grouping only; distance test is delegated.
 * @param {Array} pois Canonical POI objects (contain lat, lon, category).
 * @param {Array} sats Satellite objects with lat, lon, alt, coverageRadius, id.
 */
function calcVisibility(pois, sats) {
    const out = {};
    sats.forEach(sat => {
        const visible = Vis.getVisiblePOIs(pois, sat);
        if (visible.length) {
            out[sat.id] = {
                satellite: sat,
                visiblePOIs: groupByCategory(visible),
                totalCount: visible.length
            };
        }
    });
    return out;
}

// Worker message handler
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'CALCULATE_VISIBILITY': {
            const { pois, satellites, requestId } = data;
            try {
                const result = calcVisibility(pois, satellites);
                self.postMessage({
                    type: 'VISIBILITY_RESULT',
                    data: { result, requestId, timestamp: Date.now() }
                });
            } catch (err) {
                self.postMessage({
                    type: 'VISIBILITY_ERROR',
                    data: { error: err.message, requestId }
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