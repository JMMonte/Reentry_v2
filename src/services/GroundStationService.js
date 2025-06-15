/**
 * GroundStationService.js
 * 
 * Dedicated service for managing ground station data and coordinate processing.
 * Maintains clean separation between data processing and 3D rendering.
 * Works with the existing planet data system to support multi-planet ground stations.
 */

import Physics from '../physics/PhysicsAPI.js';

class GroundStationServiceClass {
    constructor() {
        this._processedStations = new Map(); // planetId -> processed stations
        this._planetDataCache = new Map(); // Cache for planet data
    }

    /**
     * Initialize ground stations for a planet from its configuration data
     * @param {Object} planetData - Planet configuration object
     * @private
     */
    _initializePlanetGroundStations(planetData) {
        const planetId = planetData.naifId;
        
        // Check if planet supports ground stations
        if (!planetData.surfaceOptions?.addGroundStations || !planetData.groundStationsData?.features) {
            this._processedStations.set(planetId, []);
            return;
        }

        const processedStations = planetData.groundStationsData.features.map(feature => {
            const [lon, lat] = feature.geometry.coordinates;
            const altitude = feature.properties.altitude || 0; // km above sea level
            
            // Convert lat/lon/alt to Cartesian coordinates using Physics API
            const position = Physics.Coordinates.latLonAltToCartesian(lat, lon, altitude);
            
            return {
                id: feature.properties.gps_code || feature.properties.name,
                name: feature.properties.name,
                latitude: lat,
                longitude: lon,
                altitude: altitude,
                position: position,
                elevation: 0, // Minimum elevation angle (configurable)
                properties: feature.properties,
                planetId: planetId
            };
        });

        this._processedStations.set(planetId, processedStations);
    }

    /**
     * Initialize ground stations from planet data
     * @param {Object} planetData - Planet configuration object
     */
    initializeFromPlanetData(planetData) {
        if (!planetData || planetData.naifId === undefined || planetData.naifId === null) {
            console.warn('[GroundStationService] Invalid planet data provided - missing naifId');
            return;
        }

        this._planetDataCache.set(planetData.naifId, planetData);
        this._initializePlanetGroundStations(planetData);
    }

    /**
     * Initialize ground stations for multiple planets
     * @param {Array} planetsData - Array of planet configuration objects
     */
    initializeFromPlanetsData(planetsData) {
        if (!Array.isArray(planetsData)) {
            console.warn('[GroundStationService] Invalid planets data provided');
            return;
        }

        planetsData.forEach(planetData => {
            this.initializeFromPlanetData(planetData);
        });
    }

    /**
     * Get all planets that have ground stations
     * @returns {Array} Array of planet IDs that support ground stations
     */
    getPlanetsWithGroundStations() {
        const planetsWithStations = [];
        
        for (const [planetId, stations] of this._processedStations.entries()) {
            if (stations.length > 0) {
                planetsWithStations.push(planetId);
            }
        }
        
        return planetsWithStations;
    }

    /**
     * Check if a planet supports ground stations
     * @param {number} planetId - Planet NAIF ID
     * @returns {boolean} True if planet supports ground stations
     */
    planetSupportsGroundStations(planetId) {
        const planetData = this._planetDataCache.get(planetId);
        return planetData?.surfaceOptions?.addGroundStations === true;
    }

    /**
     * Get ground stations for a specific planet
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {Array} Array of ground station objects
     */
    getGroundStations(planetId = 399) {
        return this._processedStations.get(planetId) || [];
    }

    /**
     * Get all ground stations (legacy compatibility - returns Earth stations)
     * @returns {Array} Array of ground station objects for Earth
     */
    getAllGroundStations() {
        return this.getGroundStations(399); // Earth NAIF ID
    }

    /**
     * Get ground station by ID
     * @param {string} stationId - Ground station ID
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {Object|null} Ground station object or null if not found
     */
    getGroundStationById(stationId, planetId = 399) {
        const stations = this.getGroundStations(planetId);
        return stations.find(station => station.id === stationId) || null;
    }

    /**
     * Get ground stations within a geographic region
     * @param {Object} bounds - Geographic bounds {north, south, east, west} in degrees
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {Array} Array of ground stations within bounds
     */
    getGroundStationsInRegion(bounds, planetId = 399) {
        const stations = this.getGroundStations(planetId);
        const { north, south, east, west } = bounds;

        return stations.filter(station => {
            const { latitude, longitude } = station;
            return latitude >= south && latitude <= north &&
                longitude >= west && longitude <= east;
        });
    }

    /**
     * Add custom ground station
     * @param {Object} stationData - Ground station data {name, latitude, longitude, altitude, etc.}
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {string} Station ID
     */
    addGroundStation(stationData, planetId = 399) {
        const { name, latitude, longitude, altitude = 0 } = stationData;

        if (latitude === undefined || longitude === undefined) {
            throw new Error('Ground station must have latitude and longitude');
        }

        // Generate unique ID
        const stationId = stationData.id || `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Convert coordinates to cartesian
        const position = Physics.Coordinates.latLonAltToCartesian(latitude, longitude, altitude);

        const station = {
            id: stationId,
            name: name || stationId,
            latitude,
            longitude,
            altitude,
            position,
            elevation: stationData.elevation || 0,
            properties: stationData.properties || {},
            custom: true
        };

        // Add to the appropriate planet's stations
        if (!this._processedStations.has(planetId)) {
            this._processedStations.set(planetId, []);
        }

        this._processedStations.get(planetId).push(station);

        // No legacy array to update - using getter pattern

        return stationId;
    }

    /**
     * Remove ground station
     * @param {string} stationId - Ground station ID
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {boolean} True if station was removed
     */
    removeGroundStation(stationId, planetId = 399) {
        const stations = this._processedStations.get(planetId);
        if (!stations) return false;

        const index = stations.findIndex(station => station.id === stationId);
        if (index === -1) return false;

                stations.splice(index, 1);

        return true;
    }

    /**
     * Get ground stations formatted for communication calculations
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {Array} Array of ground stations with communication properties
     */
    getGroundStationsForComms(planetId = 399) {
        const stations = this.getGroundStations(planetId);

        return stations.map(station => ({
            id: station.id,
            name: station.name,
            position: station.position,
            latitude: station.latitude,
            longitude: station.longitude,
            altitude: station.altitude,
            minElevationAngle: station.elevation || 5, // Default 5 degrees
            frequency: station.properties?.frequency || 2400, // Default 2.4 GHz
            power: station.properties?.power || 1000, // Default 1kW
            antennaGain: station.properties?.antennaGain || 20, // Default 20 dBi
            type: 'ground_station'
        }));
    }

    /**
     * Update ground station properties
     * @param {string} stationId - Ground station ID
     * @param {Object} updates - Properties to update
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {boolean} True if station was updated
     */
    updateGroundStation(stationId, updates, planetId = 399) {
        const station = this.getGroundStationById(stationId, planetId);
        if (!station) return false;

        // Update properties
        Object.assign(station, updates);

        // Recalculate position if coordinates changed
        if (updates.latitude !== undefined || updates.longitude !== undefined || updates.altitude !== undefined) {
            station.position = Physics.Coordinates.latLonAltToCartesian(
                station.latitude,
                station.longitude,
                station.altitude
            );
        }

        return true;
    }

    /**
     * Get statistics about ground stations
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     * @returns {Object} Statistics object
     */
    getStatistics(planetId = 399) {
        const stations = this.getGroundStations(planetId);

        return {
            total: stations.length,
            custom: stations.filter(s => s.custom).length,
            byRegion: this._getRegionalDistribution(stations),
            altitudeRange: this._getAltitudeRange(stations)
        };
    }

    /**
     * Get regional distribution of ground stations
     * @param {Array} stations - Array of ground stations
     * @returns {Object} Regional distribution
     * @private
     */
    _getRegionalDistribution(stations) {
        const regions = {
            northAmerica: 0,
            southAmerica: 0,
            europe: 0,
            asia: 0,
            africa: 0,
            oceania: 0,
            antarctica: 0
        };

        stations.forEach(station => {
            const { latitude, longitude } = station;

            if (latitude > 60) {
                regions.antarctica++;
            } else if (latitude > 35 && longitude > -130 && longitude < -60) {
                regions.northAmerica++;
            } else if (latitude < 35 && latitude > -60 && longitude > -120 && longitude < -30) {
                regions.southAmerica++;
            } else if (latitude > 35 && longitude > -15 && longitude < 60) {
                regions.europe++;
            } else if (latitude > -10 && longitude > 60 && longitude < 180) {
                regions.asia++;
            } else if (latitude > -35 && latitude < 35 && longitude > -20 && longitude < 60) {
                regions.africa++;
            } else if (latitude > -50 && longitude > 110 && longitude < 180) {
                regions.oceania++;
            }
        });

        return regions;
    }

    /**
     * Get altitude range of ground stations
     * @param {Array} stations - Array of ground stations
     * @returns {Object} Altitude range
     * @private
     */
    _getAltitudeRange(stations) {
        if (stations.length === 0) return { min: 0, max: 0, average: 0 };

        const altitudes = stations.map(s => s.altitude);
        return {
            min: Math.min(...altitudes),
            max: Math.max(...altitudes),
            average: altitudes.reduce((sum, alt) => sum + alt, 0) / altitudes.length
        };
    }

    /**
     * Clear all custom ground stations
     * @param {number} planetId - Planet NAIF ID (default: Earth = 399)
     */
    clearCustomStations(planetId = 399) {
        const stations = this._processedStations.get(planetId);
        if (!stations) return;

                // Remove only custom stations
        const filtered = stations.filter(station => !station.custom);
        this._processedStations.set(planetId, filtered);
    }
}

// Create singleton instance
const GroundStationService = new GroundStationServiceClass();

export { GroundStationService };
export default GroundStationService; 