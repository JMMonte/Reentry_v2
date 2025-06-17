/**
 * POIDataService.js
 * 
 * Dedicated service for managing POI (Point of Interest) data and visibility calculations.
 * Maintains clean separation between physics calculations, 3D rendering, and React UI.
 */

import { POIVisibilityService } from './POIVisibilityService.js';
import {
    geojsonDataCities, geojsonDataAirports, geojsonDataSpaceports,
    geojsonDataGroundStations, geojsonDataObservatories, geojsonDataMissions
} from '../config/geojsonData.js';

class POIDataServiceClass {
    constructor() {
        // Core POI data - processed once and cached
        this._poiData = new Map(); // planetId -> processed POI data
        this._spatialIndex = new Map(); // planetId -> spatial grid
        this._visibilityCache = new Map(); // cacheKey -> visibility results
        this._lastSatellitePositions = new Map(); // satelliteId -> last position

        // Configuration
        this._cacheTimeout = 2000; // 2 seconds cache lifetime
        this._positionThreshold = 1.0; // km - minimum movement to recalculate
        this._spatialGridSize = 10.0; // degrees for spatial indexing

        // Initialize with default Earth data
        this._initializeEarthPOIs();
    }

    /**
     * Initialize POI data for Earth from GeoJSON sources
     * @private
     */
    _initializeEarthPOIs() {
        const earthId = 399; // Earth NAIF ID

        const poiCategories = {
            cities: geojsonDataCities,
            airports: geojsonDataAirports,
            spaceports: geojsonDataSpaceports,
            groundStations: geojsonDataGroundStations,
            observatories: geojsonDataObservatories,
            missions: geojsonDataMissions
        };

        const processedPOIs = {};
        const allPOIs = [];

        Object.entries(poiCategories).forEach(([category, geoData]) => {
            if (!geoData?.features) return;

            const categoryPOIs = geoData.features.map((feature, index) => {
                const [lon, lat] = feature.geometry.coordinates;
                const poi = {
                    id: `${category}_${index}_${lat}_${lon}`,
                    category,
                    lat,
                    lon,
                    name: feature.properties?.name || feature.properties?.NAME || `${category}_${index}`,
                    properties: feature.properties || {}
                };

                allPOIs.push(poi);
                return poi;
            }).filter(poi => poi.lat !== undefined && poi.lon !== undefined);

            if (categoryPOIs.length > 0) {
                processedPOIs[category] = categoryPOIs;
            }
        });

        this._poiData.set(earthId, processedPOIs);
        this._spatialIndex.set(earthId, this._buildSpatialIndex(allPOIs));
    }

    /**
     * Process planet surface data into POI format
     * @param {number} planetId - Planet NAIF ID
     * @param {Object} planetData - Planet data with surface points
     * @returns {Object} Processed POI data
     * @private
     */
    _processPlanetPOIData(planetId, planetData) {
        if (!planetData?.surface?.points) {
            return {};
        }

        const processedPOIs = {};
        const allPOIs = [];
        let poiCounter = 0;

        Object.entries(planetData.surface.points).forEach(([category, data]) => {
            if (!Array.isArray(data)) return;

            const categoryPOIs = [];

            data.forEach(item => {
                if (item.userData?.feature) {
                    const feat = item.userData.feature;
                    const [lon, lat] = feat.geometry.coordinates;

                    const poi = {
                        id: `${planetId}_${category}_${poiCounter++}`,
                        lat,
                        lon,
                        name: feat.properties?.name || feat.properties?.NAME || feat.properties?.scalerank || `${category}_${poiCounter}`,
                        category,
                        planetId
                    };

                    categoryPOIs.push(poi);
                    allPOIs.push(poi);
                }
            });

            if (categoryPOIs.length > 0) {
                processedPOIs[category] = categoryPOIs;
            }
        });

        // Cache the processed data
        this._poiData.set(planetId, processedPOIs);
        this._spatialIndex.set(planetId, this._buildSpatialIndex(allPOIs));

        return processedPOIs;
    }

    /**
     * Build spatial index for fast POI lookups
     * @param {Array} pois - Array of POI objects
     * @returns {Map} Spatial grid index
     * @private
     */
    _buildSpatialIndex(pois) {
        const grid = new Map();
        const gridSize = this._spatialGridSize;

        pois.forEach(poi => {
            const gridX = Math.floor(poi.lon / gridSize);
            const gridY = Math.floor(poi.lat / gridSize);
            const gridKey = `${gridX},${gridY}`;

            if (!grid.has(gridKey)) {
                grid.set(gridKey, []);
            }
            grid.get(gridKey).push(poi);
        });

        return grid;
    }

    /**
     * Get POI candidates within coverage area using spatial indexing
     * @param {number} planetId - Planet NAIF ID
     * @param {number} lat - Satellite latitude
     * @param {number} lon - Satellite longitude  
     * @param {number} coverageRadius - Coverage radius in degrees
     * @returns {Array} Candidate POIs for detailed visibility check
     * @private
     */
    _getPOICandidates(planetId, lat, lon, coverageRadius) {
        const spatialIndex = this._spatialIndex.get(planetId);
        if (!spatialIndex) return [];

        const gridSize = this._spatialGridSize;
        const candidates = [];

        // Calculate grid cells to check (with buffer for coverage radius)
        const gridBuffer = Math.ceil(coverageRadius / gridSize) + 1;
        const centerGridX = Math.floor(lon / gridSize);
        const centerGridY = Math.floor(lat / gridSize);

        for (let dx = -gridBuffer; dx <= gridBuffer; dx++) {
            for (let dy = -gridBuffer; dy <= gridBuffer; dy++) {
                const gridKey = `${centerGridX + dx},${centerGridY + dy}`;
                const gridPOIs = spatialIndex.get(gridKey);
                if (gridPOIs) {
                    candidates.push(...gridPOIs);
                }
            }
        }

        return candidates;
    }

    /**
     * Check if satellite position has changed significantly
     * @param {string} satelliteId - Satellite identifier
     * @param {Object} position - Current position {lat, lon, alt}
     * @returns {boolean} True if position changed significantly
     * @private
     */
    _hasPositionChangedSignificantly(satelliteId, position) {
        const lastPos = this._lastSatellitePositions.get(satelliteId);
        if (!lastPos) return true;

        const distance = POIVisibilityService.greatCircleDistance(
            lastPos.lat, lastPos.lon,
            position.lat, position.lon
        ) * 111.32; // Convert degrees to km (approximate)

        return distance > this._positionThreshold;
    }

    /**
     * Get cache key for visibility calculation
     * @param {string} satelliteId - Satellite identifier
     * @param {Object} position - Satellite position
     * @returns {string} Cache key
     * @private
     */
    _getCacheKey(satelliteId, position) {
        // Round position to reduce cache key variations
        const roundedLat = Math.round(position.lat * 100) / 100;
        const roundedLon = Math.round(position.lon * 100) / 100;
        const roundedAlt = Math.round(position.alt);
        return `${satelliteId}_${roundedLat}_${roundedLon}_${roundedAlt}`;
    }

    /**
     * Calculate POI visibility for satellites with caching and spatial optimization
     * @param {Array} satellites - Array of satellite objects with position data
     * @param {number} planetId - Planet NAIF ID (default: 399 for Earth)
     * @param {Object} planetData - Planet data for radius calculation
     * @returns {Object} Visibility data grouped by satellite
     */
    calculateVisibility(satellites, planetId, planetData) {
        // First try to get cached POI data
        let poiData = this._poiData.get(planetId);

        // If no cached data and we have planetData, process it
        if (!poiData && planetData?.surface?.points) {
            poiData = this._processPlanetPOIData(planetId, planetData);
        }

        if (!poiData || !satellites || satellites.length === 0) {
            return {};
        }

        const result = {};
        const currentTime = Date.now();

        satellites.forEach(satellite => {
            const position = {
                lat: satellite.lat,
                lon: satellite.lon,
                alt: satellite.alt,
                id: satellite.id,
                name: satellite.name,
                color: satellite.color
            };

            // Check if we need to recalculate for this satellite
            const cacheKey = this._getCacheKey(satellite.id, position);
            const cachedResult = this._visibilityCache.get(cacheKey);

            if (cachedResult && (currentTime - cachedResult.timestamp) < this._cacheTimeout) {
                result[satellite.id] = cachedResult.data;
                return;
            }

            // Only recalculate if position changed significantly
            if (!this._hasPositionChangedSignificantly(satellite.id, position)) {
                const lastCacheKey = this._lastSatellitePositions.get(satellite.id)?.cacheKey;
                const lastResult = this._visibilityCache.get(lastCacheKey);
                if (lastResult) {
                    result[satellite.id] = lastResult.data;
                    return;
                }
            }

            // Calculate coverage radius using physics-based calculation
            const coverageRadius = Math.acos(
                (planetData?.radius || 6371) / ((planetData?.radius || 6371) + position.alt)
            ) * 180 / Math.PI;

            const satelliteData = {
                ...position,
                coverageRadius
            };

            // Get POI candidates using spatial indexing
            const candidates = this._getPOICandidates(planetId, position.lat, position.lon, coverageRadius);

            // Calculate visibility for candidates only
            const visiblePOIs = POIVisibilityService.getVisiblePOIs(candidates, satelliteData);

            if (visiblePOIs.length > 0) {
                // Group by category
                const grouped = {};
                visiblePOIs.forEach(poi => {
                    if (!grouped[poi.category]) {
                        grouped[poi.category] = [];
                    }
                    grouped[poi.category].push(poi);
                });

                const visibilityData = {
                    satellite: satelliteData,
                    visiblePOIs: grouped,
                    totalCount: visiblePOIs.length
                };

                result[satellite.id] = visibilityData;

                // Cache the result
                this._visibilityCache.set(cacheKey, {
                    data: visibilityData,
                    timestamp: currentTime
                });
            }

            // Update last position
            this._lastSatellitePositions.set(satellite.id, {
                ...position,
                cacheKey
            });
        });

        // Clean up old cache entries
        this._cleanupCache(currentTime);

        return result;
    }

    /**
     * Get processed POI data for a planet
     * @param {number} planetId - Planet NAIF ID
     * @returns {Object} POI data grouped by category
     */
    getPOIData(planetId) {
        if (!planetId) return {};
        return this._poiData.get(planetId) || {};
    }

    /**
     * Get all POIs for a planet as flat array
     * @param {number} planetId - Planet NAIF ID  
     * @returns {Array} All POIs for the planet
     */
    getAllPOIs(planetId) {
        if (!planetId) return [];
        const poiData = this._poiData.get(planetId);
        if (!poiData) return [];

        const allPOIs = [];
        Object.values(poiData).forEach(categoryPOIs => {
            allPOIs.push(...categoryPOIs);
        });
        return allPOIs;
    }

    /**
     * Clean up old cache entries
     * @param {number} currentTime - Current timestamp
     * @private
     */
    _cleanupCache(currentTime) {
        const maxCacheAge = this._cacheTimeout * 3; // Keep cache 3x longer than timeout

        for (const [key, entry] of this._visibilityCache.entries()) {
            if (currentTime - entry.timestamp > maxCacheAge) {
                this._visibilityCache.delete(key);
            }
        }

        // Limit cache size as safeguard
        if (this._visibilityCache.size > 1000) {
            const oldestEntries = Array.from(this._visibilityCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
                .slice(0, 500); // Remove oldest half

            oldestEntries.forEach(([key]) => {
                this._visibilityCache.delete(key);
            });
        }
    }

    /**
     * Clear all caches (useful for testing or when satellite configuration changes)
     */
    clearCache() {
        this._visibilityCache.clear();
        this._lastSatellitePositions.clear();
    }
}

const poiDataService = new POIDataServiceClass();
export { poiDataService };