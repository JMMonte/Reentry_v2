/**
 * GroundTrackService - Handles groundtrack physics calculations and coordinate transformations
 * Pure physics layer - no Three.js or React dependencies
 */

import { CoordinateTransforms } from '../physics/utils/CoordinateTransforms.js';
import Physics from '../physics/PhysicsAPI.js';

export class GroundTrackService {
    constructor() {
        this.subscribers = new Set();
    }

    /**
     * Transform ECI position to planet surface coordinates
     * @param {Array} eciPosition - [x, y, z] in kilometers from planet center
     * @param {number} planetNaifId - Planet NAIF ID
     * @param {number} timeMs - Time in milliseconds since epoch
     * @param {Object} planetState - Optional current planet state from physics engine
     * @returns {Object} {lat, lon, alt} in degrees, degrees, kilometers
     */
    async transformECIToSurface(eciPosition, planetNaifId, timeMs, planetState = null) {
        if (!eciPosition || planetNaifId === undefined) {
            console.warn('[GroundTrackService] Invalid input:', { eciPosition, planetNaifId });
            return { lat: 0, lon: 0, alt: 0 };
        }

        try {
            // Try to use provided planet state first (has current orientation)
            let planetData = planetState;
            
            // In worker context, planet data must be provided
            if (!planetData) {
                console.warn(`[GroundTrackService] Planet data not provided for NAIF ID: ${planetNaifId}`);
                return { lat: 0, lon: 0, alt: 0 };
            }

            // Validate that planet data has required fields for coordinate transformation
            if (!planetData.radius) {
                console.warn(`[GroundTrackService] Planet data missing radius for NAIF ID: ${planetNaifId}`);
                return { lat: 0, lon: 0, alt: 0 };
            }

            // If quaternion is missing, create a simple fallback for basic coordinate conversion
            if (!planetData.quaternion) {
                console.warn(`[GroundTrackService] Planet data missing quaternion for NAIF ID: ${planetNaifId}, using simple spherical conversion`);
                
                // Simple spherical coordinate conversion as fallback
                return Physics.Coordinates.cartesianToSphericalLatLonAlt(eciPosition, planetData.radius);
            }

            const time = new Date(timeMs);
            const velocity = [0, 0, 0]; // Not needed for position transform

            // Transform from planet-centered inertial to planet-fixed frame
            const result = CoordinateTransforms.transformCoordinates(
                eciPosition, 
                velocity, 
                'planet-inertial', 
                'planet-fixed', 
                planetData, 
                time
            );
            
            // Convert planet-fixed cartesian to geodetic coordinates
            const geo = CoordinateTransforms.planetFixedToLatLonAlt(result.position, planetData);
            
            return {
                lat: geo[0],
                lon: geo[1], 
                alt: geo[2]
            };
        } catch (error) {
            console.warn('[GroundTrackService] Failed to transform ECI to surface coordinates:', error);
            return { lat: 0, lon: 0, alt: 0 };
        }
    }

    /**
     * Project lat/lon to equirectangular canvas coordinates with proper edge handling
     * @param {number} lat - Latitude in degrees [-90, 90]
     * @param {number} lon - Longitude in degrees [-180, 180]
     * @param {number} width - Canvas width in pixels
     * @param {number} height - Canvas height in pixels
     * @returns {Object} {x, y} canvas coordinates
     */
    projectToCanvas(lat, lon, width, height) {
        // Normalize longitude to [-180, 180] range
        const normalizedLon = ((lon + 180) % 360 + 360) % 360 - 180;
        
        // Equirectangular projection
        const x = ((normalizedLon + 180) / 360) * width;
        const y = ((90 - lat) / 180) * height;
        
        return { x, y };
    }

    /**
     * Check if longitude difference indicates crossing the dateline
     * @param {number} lon1 - Previous longitude
     * @param {number} lon2 - Current longitude  
     * @returns {boolean} True if crossing dateline
     */
    isDatelineCrossing(lon1, lon2) {
        if (lon1 === undefined || lon2 === undefined) return false;
        return Math.abs(lon2 - lon1) > 180;
    }

    /**
     * Process groundtrack points with proper edge navigation
     * @param {Array} rawPoints - Array of {time, position} objects with ECI coordinates
     * @param {number} planetNaifId - Planet NAIF ID
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {Object} planetState - Optional planet state from physics bodies
     * @returns {Array} Processed canvas points with edge handling
     */
    async processGroundTrack(rawPoints, planetNaifId, width, height, planetState = null) {
        if (!rawPoints.length || planetNaifId === undefined) return [];

        const processedPoints = [];
        let prevLon = undefined;

        for (let i = 0; i < rawPoints.length; i++) {
            const point = rawPoints[i];
            if (!point.position || point.time === undefined) continue;

            // Transform ECI to surface coordinates
            const surface = await this.transformECIToSurface(
                [point.position.x, point.position.y, point.position.z],
                planetNaifId,
                point.time,
                planetState
            );

            // Project to canvas coordinates
            const canvas = this.projectToCanvas(surface.lat, surface.lon, width, height);

            // Detect dateline crossing
            const isDatelineCross = this.isDatelineCrossing(prevLon, surface.lon);

            processedPoints.push({
                x: canvas.x,
                y: canvas.y,
                lat: surface.lat,
                lon: surface.lon,
                alt: surface.alt,
                time: point.time,
                isDatelineCrossing: isDatelineCross
            });

            prevLon = surface.lon;
        }

        return processedPoints;
    }

    /**
     * Calculate satellite coverage footprint radius
     * @param {Object} surfacePos - {lat, lon, alt} satellite position
     * @param {number} planetNaifId - Planet NAIF ID
     * @returns {Promise<number>} Coverage radius in degrees
     */
    async calculateCoverageRadius(surfacePos, planetNaifId, planetData = null) {
        try {
            // Planet data must be provided in worker context
            if (!planetData) {
                console.warn('calculateCoverageRadius: Planet data not provided');
                return 0;
            }

            const planetRadius = planetData.radius;
            const altitude = surfacePos.alt;
            
            // Calculate maximum central angle visible from satellite
            const centralAngle = Math.acos(planetRadius / (planetRadius + altitude));
            
            // Convert to degrees for coverage radius
            return centralAngle * (180 / Math.PI);
        } catch (error) {
            console.warn('Failed to calculate coverage radius:', error);
            return 0;
        }
    }

    /**
     * Get current satellite positions for a planet
     * @param {Object} satellites - Satellites object keyed by ID
     * @param {number} planetNaifId - Planet NAIF ID
     * @param {number} currentTime - Current simulation time in ms
     * @returns {Promise<Array>} Array of {id, lat, lon, alt} objects
     */
    async getCurrentPositions(satellites, planetNaifId, currentTime) {
        if (!satellites || planetNaifId === undefined) return [];

        const filteredSatellites = Object.values(satellites)
            .filter(sat => sat.centralBodyNaifId === planetNaifId && sat.position);

        const positions = await Promise.all(
            filteredSatellites.map(async (sat) => {
                const surface = await this.transformECIToSurface(
                    [sat.position[0], sat.position[1], sat.position[2]],
                    planetNaifId,
                    currentTime
                );
                
                return {
                    id: sat.id,
                    lat: surface.lat,
                    lon: surface.lon,
                    alt: surface.alt,
                    color: sat.color
                };
            })
        );

        return positions;
    }

    /**
     * Subscribe to groundtrack updates
     * @param {Function} callback - Callback function for updates
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Notify all subscribers of groundtrack updates
     * @param {Object} data - Update data
     */
    notifySubscribers(data) {
        this.subscribers.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('GroundTrackService subscriber error:', error);
            }
        });
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.subscribers.clear();
    }
}

// Export singleton instance
export const groundTrackService = new GroundTrackService();