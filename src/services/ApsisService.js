/**
 * ApsisService - Business Logic for Apsis Operations
 * 
 * This service provides high-level apsis functionality that combines:
 * - Pure physics calculations from ApsisCalculations
 * - Time handling and Date objects
 * - Satellite and orbital element management
 * - Coordinate system conversions
 * 
 * This is the central interface for all apsis-related operations in the application.
 */

import { Orbital } from '../physics/PhysicsAPI.js';
import { stateToKeplerian } from '../physics/utils/KeplerianUtils.js';

export class ApsisService {
    /**
     * Get next apsis time from pre-calculated orbital elements
     * @param {Object} orbitalElements - Pre-calculated orbital elements
     * @param {string} apsisType - 'periapsis' or 'apoapsis'
     * @param {Date} currentTime - Current simulation time
     * @param {Object} centralBody - Central body data
     * @returns {Date} - Time of next apsis occurrence
     */
    static getNextApsisTimeFromElements(orbitalElements, apsisType, currentTime, centralBody) {
        try {
            // Validate pre-calculated elements
            if (!orbitalElements || !Number.isFinite(orbitalElements.semiMajorAxis) || orbitalElements.semiMajorAxis <= 0) {
                console.warn('[ApsisService] Invalid pre-calculated orbital elements');
                return new Date(currentTime.getTime() + 86400000); // Return +1 day as fallback
            }

            // For hyperbolic orbits, return fallback
            if (orbitalElements.eccentricity >= 1.0) {
                console.warn('[ApsisService] Cannot calculate apsis timing for hyperbolic orbit');
                return new Date(currentTime.getTime() + 86400000);
            }

            // Calculate orbital period using existing API
            const period = Orbital.calculatePeriodFromSMA(orbitalElements.semiMajorAxis, centralBody.GM || centralBody.mu);
            
            // Get time offset to next apsis - simplified calculation
            const targetTrueAnomaly = apsisType === 'periapsis' ? 0 : Math.PI;
            let deltaAnomaly = targetTrueAnomaly - orbitalElements.trueAnomaly;
            while (deltaAnomaly <= 0) {
                deltaAnomaly += 2 * Math.PI;
            }
            const timeOffset = (deltaAnomaly / (2 * Math.PI)) * period;

            // Return absolute time
            return new Date(currentTime.getTime() + (timeOffset * 1000));
        } catch (error) {
            console.error('[ApsisService] Error calculating next apsis time from elements:', error);
            return new Date(currentTime.getTime() + 86400000); // Return +1 day as fallback
        }
    }

    /**
     * Get next apsis time for a satellite (LEGACY METHOD - may have calculation discrepancies)
     * @param {Object} satellite - Satellite with position, velocity, centralBodyNaifId
     * @param {string} apsisType - 'periapsis' or 'apoapsis'
     * @param {Date} currentTime - Current simulation time
     * @param {Object} centralBody - Central body data
     * @returns {Date} - Time of next apsis occurrence
     */
    static getNextApsisTime(satellite, apsisType, currentTime, centralBody) {
        try {
            // Convert state to orbital elements
            const elements = stateToKeplerian(
                satellite.position,
                satellite.velocity,
                centralBody.GM || centralBody.mu
            );

            // Validate elements - basic validation
            if (!elements || !Number.isFinite(elements.semiMajorAxis) || elements.semiMajorAxis <= 0) {
                console.warn('[ApsisService] Invalid orbital elements');
                return new Date(currentTime.getTime() + 86400000); // Return +1 day as fallback
            }

            // Calculate orbital period using existing API
            const period = Orbital.calculatePeriodFromSMA(elements.semiMajorAxis, centralBody.GM || centralBody.mu);
            
            // Get time offset to next apsis - simplified calculation
            const targetTrueAnomaly = apsisType === 'periapsis' ? 0 : Math.PI;
            let deltaAnomaly = targetTrueAnomaly - elements.trueAnomaly;
            while (deltaAnomaly <= 0) {
                deltaAnomaly += 2 * Math.PI;
            }
            const timeOffset = (deltaAnomaly / (2 * Math.PI)) * period;

            // Return absolute time
            return new Date(currentTime.getTime() + (timeOffset * 1000));
        } catch (error) {
            console.error('[ApsisService] Error calculating next apsis time:', error);
            return new Date(currentTime.getTime() + 86400000); // Return +1 day as fallback
        }
    }

    /**
     * Get comprehensive apsis data for a satellite
     * @param {Object} satellite - Satellite with position, velocity, centralBodyNaifId
     * @param {Object} centralBody - Central body data
     * @param {Date} currentTime - Current simulation time
     * @param {Object} options - Additional options
     * @returns {Object} - Complete apsis information with timing
     */
    static getApsisData(satellite, centralBody, currentTime, options = {}) {
        try {
            // Validate inputs first
            if (!satellite || !centralBody) {
                console.warn('[ApsisService] Missing satellite or central body data');
                return this._getEmptyApsisData();
            }

            // Validate satellite position and velocity
            if (!satellite.position || !satellite.velocity) {
                console.warn('[ApsisService] Satellite missing position or velocity data');
                return this._getEmptyApsisData();
            }

            // Ensure position and velocity are valid arrays or Vector3 objects
            const position = Array.isArray(satellite.position) ? satellite.position : 
                            (satellite.position.toArray ? satellite.position.toArray() : [satellite.position.x, satellite.position.y, satellite.position.z]);
            const velocity = Array.isArray(satellite.velocity) ? satellite.velocity : 
                            (satellite.velocity.toArray ? satellite.velocity.toArray() : [satellite.velocity.x, satellite.velocity.y, satellite.velocity.z]);

            // Validate that position and velocity have valid numbers
            if (position.length !== 3 || velocity.length !== 3 || 
                position.some(v => !Number.isFinite(v)) || velocity.some(v => !Number.isFinite(v))) {
                console.warn('[ApsisService] Invalid position or velocity values:', { position, velocity });
                return this._getEmptyApsisData();
            }

            // Validate central body GM
            const mu = centralBody.GM || centralBody.mu;
            if (!mu || !Number.isFinite(mu) || mu <= 0) {
                console.warn('[ApsisService] Invalid central body GM:', mu);
                return this._getEmptyApsisData();
            }

            // Convert state to orbital elements
            const elements = stateToKeplerian(position, velocity, mu);

            // Add central body radius for altitude calculations
            if (elements) {
                elements.centralBodyRadius = centralBody.radius || 0;
            }

            // Validate elements - basic validation
            if (!elements || !Number.isFinite(elements.semiMajorAxis) || elements.semiMajorAxis <= 0) {
                console.warn('[ApsisService] Invalid orbital elements');
                return this._getEmptyApsisData();
            }

            // Calculate orbital period using existing API
            const period = Orbital.calculatePeriodFromSMA(elements.semiMajorAxis, mu);

            // Calculate apsis radii
            const periapsisRadius = elements.semiMajorAxis * (1 - elements.eccentricity);
            const apoapsisRadius = elements.eccentricity < 1.0 
                ? elements.semiMajorAxis * (1 + elements.eccentricity)
                : null;

            // Calculate time offsets to next apsis points
            const currentTrueAnomaly = elements.trueAnomaly;
            
            // Periapsis time offset
            let deltaToPeri = 0 - currentTrueAnomaly;
            while (deltaToPeri <= 0) {
                deltaToPeri += 2 * Math.PI;
            }
            const periapsisTimeOffset = (deltaToPeri / (2 * Math.PI)) * period;
            
            // Apoapsis time offset (for elliptical orbits)
            let deltaToApo = Math.PI - currentTrueAnomaly;
            while (deltaToApo <= 0) {
                deltaToApo += 2 * Math.PI;
            }
            const apoapsisTimeOffset = (deltaToApo / (2 * Math.PI)) * period;

            // Create apsis info structure
            const apsisInfo = {
                periapsis: {
                    radius: periapsisRadius,
                    altitude: periapsisRadius - (centralBody.radius || 0),
                    position: [periapsisRadius, 0, 0], // Simplified position at periapsis
                    timeOffset: periapsisTimeOffset
                }
            };

            if (apoapsisRadius) {
                apsisInfo.apoapsis = {
                    radius: apoapsisRadius,
                    altitude: apoapsisRadius - (centralBody.radius || 0),
                    position: [-apoapsisRadius, 0, 0], // Simplified position at apoapsis
                    timeOffset: apoapsisTimeOffset
                };
            }

            // Add timing information
            const currentTimeMs = currentTime.getTime();
            
            const result = {
                elements,
                period,
                periapsis: {
                    ...apsisInfo.periapsis,
                    nextTime: new Date(currentTimeMs + (apsisInfo.periapsis.timeOffset * 1000))
                }
            };

            // Add apoapsis data for elliptical orbits
            if (apsisInfo.apoapsis) {
                result.apoapsis = {
                    ...apsisInfo.apoapsis,
                    nextTime: new Date(currentTimeMs + (apsisInfo.apoapsis.timeOffset * 1000))
                };
            }

            // Add visualization data if requested
            if (options.includeVisualization) {
                result.visualization = this._createVisualizationData(result, centralBody);
            }

            return result;
        } catch (error) {
            console.error('[ApsisService] Error getting apsis data:', error);
            return this._getEmptyApsisData();
        }
    }

    /**
     * Get next periapsis time (convenience method)
     * @param {Object} satellite - Satellite data
     * @param {Object} centralBody - Central body data  
     * @param {Date} currentTime - Current simulation time
     * @returns {Date} - Next periapsis time
     */
    static getNextPeriapsisTime(satellite, centralBody, currentTime) {
        return this.getNextApsisTime(satellite, 'periapsis', currentTime, centralBody);
    }

    /**
     * Get next apoapsis time (convenience method)
     * @param {Object} satellite - Satellite data
     * @param {Object} centralBody - Central body data
     * @param {Date} currentTime - Current simulation time  
     * @returns {Date} - Next apoapsis time
     */
    static getNextApoapsisTime(satellite, centralBody, currentTime) {
        return this.getNextApsisTime(satellite, 'apoapsis', currentTime, centralBody);
    }

    /**
     * Get apsis altitude information
     * @param {Object} satellite - Satellite data
     * @param {Object} centralBody - Central body data
     * @returns {Object} - {periapsisAltitude, apoapsisAltitude} in km
     */
    static getApsisAltitudes(satellite, centralBody) {
        try {
            const elements = stateToKeplerian(
                satellite.position,
                satellite.velocity,
                centralBody.GM || centralBody.mu
            );

            const periapsisRadius = elements.semiMajorAxis * (1 - elements.eccentricity);
            const apoapsisRadius = elements.eccentricity < 1.0 
                ? elements.semiMajorAxis * (1 + elements.eccentricity)
                : null;
            
            return {
                periapsisAltitude: periapsisRadius - centralBody.radius,
                apoapsisAltitude: apoapsisRadius ? apoapsisRadius - centralBody.radius : Infinity
            };
        } catch (error) {
            console.error('[ApsisService] Error calculating apsis altitudes:', error);
            return { periapsisAltitude: 0, apoapsisAltitude: 0 };
        }
    }

    /**
     * Check if orbit will impact surface before next apsis
     * @param {Object} satellite - Satellite data
     * @param {Object} centralBody - Central body data
     * @returns {Object} - {willImpact: boolean, timeToImpact?: number}
     */
    static checkApsisImpact(satellite, centralBody) {
        const altitudes = this.getApsisAltitudes(satellite, centralBody);
        
        return {
            willImpact: altitudes.periapsisAltitude <= 0,
            impactType: altitudes.periapsisAltitude <= 0 ? 'periapsis' : null,
            timeToImpact: altitudes.periapsisAltitude <= 0 ? 
                this.getNextPeriapsisTime(satellite, centralBody, new Date()) : null
        };
    }

    /**
     * Create visualization data for rendering layers
     * @private
     */
    static _createVisualizationData(apsisData) {
        const visualization = {
            periapsis: {
                position: apsisData.periapsis.position,
                radius: apsisData.periapsis.radius,
                altitude: apsisData.periapsis.altitude,
                color: [1.0, 0.0, 0.0], // Red for periapsis
                visible: true
            }
        };

        if (apsisData.apoapsis) {
            visualization.apoapsis = {
                position: apsisData.apoapsis.position,
                radius: apsisData.apoapsis.radius,
                altitude: apsisData.apoapsis.altitude,
                color: [0.0, 0.0, 1.0], // Blue for apoapsis
                visible: true
            };
        }

        return visualization;
    }

    /**
     * Get empty apsis data structure for error cases
     * @private
     */
    static _getEmptyApsisData() {
        return {
            elements: null,
            period: 0,
            periapsis: {
                radius: 0,
                altitude: 0,
                position: [0, 0, 0],
                velocity: [0, 0, 0],
                timeOffset: 0,
                nextTime: new Date()
            },
            apoapsis: null
        };
    }

    /**
     * Batch process apsis data for multiple satellites
     * @param {Array} satellites - Array of satellite objects
     * @param {Object} centralBody - Central body data
     * @param {Date} currentTime - Current simulation time
     * @returns {Map} - Map of satellite ID to apsis data
     */
    static getBatchApsisData(satellites, centralBody, currentTime) {
        const results = new Map();
        
        for (const satellite of satellites) {
            if (satellite.id) {
                results.set(satellite.id, this.getApsisData(satellite, centralBody, currentTime));
            }
        }
        
        return results;
    }

    /**
     * Get apsis information for orbit visualization
     * Used by orbit rendering systems to show apsis markers
     * @param {Array} orbitPoints - Array of orbit positions
     * @param {Object} centralBody - Central body data
     * @returns {Object} - Apsis positions for visualization
     */
    static getOrbitApsisPoints(orbitPoints, centralBody) {
        if (!orbitPoints || orbitPoints.length < 3) {
            return { periapsis: null, apoapsis: null };
        }

        // Find periapsis (closest point) and apoapsis (farthest point)
        let minDistance = Infinity;
        let maxDistance = 0;
        let periapsisPoint = null;
        let apoapsisPoint = null;

        for (const point of orbitPoints) {
            const distance = Math.sqrt(point[0] ** 2 + point[1] ** 2 + point[2] ** 2);
            
            if (distance < minDistance) {
                minDistance = distance;
                periapsisPoint = [...point];
            }
            
            if (distance > maxDistance) {
                maxDistance = distance;
                apoapsisPoint = [...point];
            }
        }

        return {
            periapsis: periapsisPoint ? {
                position: periapsisPoint,
                radius: minDistance,
                altitude: minDistance - centralBody.radius
            } : null,
            apoapsis: apoapsisPoint ? {
                position: apoapsisPoint,
                radius: maxDistance,
                altitude: maxDistance - centralBody.radius
            } : null
        };
    }
}