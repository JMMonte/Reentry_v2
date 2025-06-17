/**
 * PassPredictionService - Analyzes ground track data to predict satellite passes over POIs
 * Provides operational data for satellite engineers
 */

import { POIVisibilityService } from './POIVisibilityService';

export class PassPredictionService {
    /**
     * Analyze ground track to find all passes over a POI
     * @param {Object} poi - Point of interest {lat, lon, name}
     * @param {Array} trackPoints - Array of track points with time, lat, lon, alt
     * @param {number} coverageRadius - Satellite coverage radius in degrees
     * @param {number} planetRadius - Planet radius in km (optional)
     * @returns {Array} Array of pass objects with AOS, LOS, duration, max elevation
     */
    static findPassesForPOI(poi, trackPoints, coverageRadius, planetRadius = null) {
        if (!trackPoints || trackPoints.length < 2) return [];
        
        const passes = [];
        let currentPass = null;
        let lastVisible = false;
        
        for (let i = 0; i < trackPoints.length; i++) {
            const point = trackPoints[i];
            const distance = POIVisibilityService.greatCircleDistance(
                poi.lat, poi.lon,
                point.lat, point.lon
            );
            
            const isVisible = distance <= coverageRadius;
            
            // AOS - Acquisition of Signal
            if (isVisible && !lastVisible) {
                currentPass = {
                    aos: point.time,
                    aosIndex: i,
                    points: [point],
                    maxElevation: 0,
                    minDistance: distance
                };
            }
            
            // Track the pass
            if (isVisible && currentPass) {
                currentPass.points.push(point);
                currentPass.minDistance = Math.min(currentPass.minDistance, distance);
                
                // Calculate elevation angle for this point
                const elevation = this.calculateElevationAngle(poi, point, planetRadius);
                currentPass.maxElevation = Math.max(currentPass.maxElevation, elevation);
            }
            
            // LOS - Loss of Signal
            if (!isVisible && lastVisible && currentPass) {
                currentPass.los = trackPoints[i-1].time;
                currentPass.losIndex = i-1;
                currentPass.duration = currentPass.los - currentPass.aos;
                
                // Calculate pass quality metrics
                currentPass.quality = this.assessPassQuality(currentPass);
                
                passes.push(currentPass);
                currentPass = null;
            }
            
            lastVisible = isVisible;
        }
        
        // Handle case where track ends while still visible
        if (currentPass && lastVisible) {
            currentPass.los = trackPoints[trackPoints.length - 1].time;
            currentPass.losIndex = trackPoints.length - 1;
            currentPass.duration = currentPass.los - currentPass.aos;
            currentPass.quality = this.assessPassQuality(currentPass);
            passes.push(currentPass);
        }
        
        return passes;
    }
    
    /**
     * Calculate elevation angle from ground station to satellite
     * @param {Object} poi - Ground station {lat, lon}
     * @param {Object} satPoint - Satellite position {lat, lon, alt}
     * @returns {number} Elevation angle in degrees
     */
    static calculateElevationAngle(poi, satPoint, planetRadius = null) {
        // Use provided planet radius, or stored radius, or Earth's radius as last resort
        const radius = planetRadius || this._planetRadius || 6371; // km
        const satAlt = satPoint.alt !== undefined ? satPoint.alt : 400; // Default altitude if not provided
        
        // Validate inputs
        if (!poi || poi.lat === undefined || poi.lon === undefined || 
            !satPoint || satPoint.lat === undefined || satPoint.lon === undefined) {
            return 0;
        }
        
        // Great circle angle
        const angle = POIVisibilityService.greatCircleDistance(
            poi.lat, poi.lon,
            satPoint.lat, satPoint.lon
        ) * Math.PI / 180;
        
        // Elevation angle calculation
        // Using the formula: sin(el) = cos(angle) - Re/(Re+h)
        // Where el is elevation, Re is planet radius, h is altitude
        const cosAngle = Math.cos(angle);
        const radiusRatio = radius / (radius + satAlt);
        
        // Calculate sin of elevation angle
        const sinEl = cosAngle - radiusRatio;
        
        // Check if satellite is below horizon
        if (sinEl < 0) {
            return 0; // Below horizon
        }
        
        // Calculate elevation angle
        const elevation = Math.asin(sinEl) * 180 / Math.PI;
        
        return Math.max(0, elevation); // Ensure non-negative
    }
    
    /**
     * Assess pass quality based on elevation and duration
     * @param {Object} pass - Pass object with maxElevation and duration
     * @returns {Object} Quality assessment
     */
    static assessPassQuality(pass) {
        const durationMinutes = pass.duration / 60000; // Convert ms to minutes
        
        let rating = 'Poor';
        let score = 0;
        
        // Elevation-based scoring
        if (pass.maxElevation > 75) {
            score += 5;
        } else if (pass.maxElevation > 60) {
            score += 4;
        } else if (pass.maxElevation > 45) {
            score += 3;
        } else if (pass.maxElevation > 30) {
            score += 2;
        } else if (pass.maxElevation > 15) {
            score += 1;
        }
        
        // Duration-based scoring
        if (durationMinutes > 10) {
            score += 3;
        } else if (durationMinutes > 7) {
            score += 2;
        } else if (durationMinutes > 4) {
            score += 1;
        }
        
        // Overall rating
        if (score >= 7) {
            rating = 'Excellent';
        } else if (score >= 5) {
            rating = 'Good';
        } else if (score >= 3) {
            rating = 'Fair';
        } else if (score >= 1) {
            rating = 'Marginal';
        }
        
        return {
            rating,
            score,
            factors: {
                elevation: pass.maxElevation,
                duration: durationMinutes,
                centerDistance: pass.minDistance
            }
        };
    }
    
    /**
     * Calculate pass statistics for operational planning
     * @param {Array} passes - Array of pass objects
     * @param {number} timeWindow - Time window in milliseconds
     * @returns {Object} Statistics object
     */
    static calculatePassStatistics(passes, timeWindow) {
        if (!passes || passes.length === 0) {
            return {
                totalPasses: 0,
                avgPassDuration: 0,
                avgMaxElevation: 0,
                avgTimeBetweenPasses: 0,
                excellentPasses: 0,
                goodPasses: 0,
                fairPasses: 0,
                marginalPasses: 0,
                poorPasses: 0,
                totalCoverageTime: 0,
                coveragePercentage: 0
            };
        }
        
        const stats = {
            totalPasses: passes.length,
            avgPassDuration: 0,
            avgMaxElevation: 0,
            avgTimeBetweenPasses: 0,
            excellentPasses: 0,
            goodPasses: 0,
            fairPasses: 0,
            marginalPasses: 0,
            poorPasses: 0,
            totalCoverageTime: 0,
            coveragePercentage: 0
        };
        
        let totalDuration = 0;
        let totalElevation = 0;
        let timeBetweenSum = 0;
        
        passes.forEach((pass, index) => {
            totalDuration += pass.duration;
            totalElevation += pass.maxElevation;
            
            // Count pass qualities
            switch (pass.quality.rating) {
                case 'Excellent':
                    stats.excellentPasses++;
                    break;
                case 'Good':
                    stats.goodPasses++;
                    break;
                case 'Fair':
                    stats.fairPasses++;
                    break;
                case 'Marginal':
                    stats.marginalPasses++;
                    break;
                default:
                    stats.poorPasses++;
            }
            
            // Calculate time between passes
            if (index > 0) {
                const timeBetween = pass.aos - passes[index - 1].los;
                timeBetweenSum += timeBetween;
            }
        });
        
        stats.avgPassDuration = totalDuration / passes.length / 60000; // minutes
        stats.avgMaxElevation = totalElevation / passes.length;
        stats.totalCoverageTime = totalDuration / 60000; // minutes
        
        if (passes.length > 1) {
            stats.avgTimeBetweenPasses = timeBetweenSum / (passes.length - 1) / 60000; // minutes
        }
        
        if (timeWindow > 0) {
            stats.coveragePercentage = (totalDuration / timeWindow) * 100;
        }
        
        return stats;
    }
    
    /**
     * Group passes by time period for scheduling
     * @param {Array} passes - Array of pass objects
     * @returns {Object} Passes grouped by hour
     */
    static groupPassesByHour(passes) {
        const grouped = {};
        
        passes.forEach(pass => {
            const hour = new Date(pass.aos).getHours();
            if (!grouped[hour]) {
                grouped[hour] = [];
            }
            grouped[hour].push(pass);
        });
        
        return grouped;
    }
    
    /**
     * Find next pass from current time
     * @param {Array} passes - Array of pass objects
     * @param {number} currentTime - Current time in milliseconds
     * @returns {Object|null} Next pass or null
     */
    static findNextPass(passes, currentTime) {
        for (const pass of passes) {
            if (pass.aos > currentTime) {
                return {
                    ...pass,
                    timeToAOS: pass.aos - currentTime
                };
            }
        }
        return null;
    }
    
    /**
     * Find optimal passes for data downlink
     * @param {Array} passes - Array of pass objects
     * @param {Object} criteria - Selection criteria
     * @returns {Array} Optimal passes
     */
    static findOptimalPasses(passes, criteria = {}) {
        const {
            minElevation = 15,
            minDuration = 3, // minutes
            preferredHours = null,
            maxPasses = 5
        } = criteria;
        
        let filtered = passes.filter(pass => 
            pass.maxElevation >= minElevation &&
            pass.duration >= minDuration * 60000
        );
        
        if (preferredHours && preferredHours.length > 0) {
            filtered = filtered.filter(pass => {
                const hour = new Date(pass.aos).getHours();
                return preferredHours.includes(hour);
            });
        }
        
        // Sort by quality score
        filtered.sort((a, b) => b.quality.score - a.quality.score);
        
        return filtered.slice(0, maxPasses);
    }

    /**
     * Calculate estimated visibility duration for a POI from satellite altitude
     * This provides a quick estimate for UI display - for precise calculations use orbit propagation
     * @param {Object} satellite - Satellite object with altitude
     * @param {Object} planetData - Planet data with radius
     * @returns {number} Estimated visibility duration in minutes
     */
    static calculateVisibilityDuration(satellite, planetData = null) {
        try {
            const altitude = satellite.alt;
            const planetRadius = planetData?.radius || this._planetRadius || 6371; // km

            if (!altitude || altitude <= 0) {
                return 0;
            }

            // Calculate the arc length of visibility using coverage radius
            const centralAngle = Math.acos(planetRadius / (planetRadius + altitude));
            const visibilityArcKm = centralAngle * planetRadius;

            // Estimate satellite ground speed
            // For LEO satellites: v ≈ √(GM/r) where r = planetRadius + altitude
            const GM = 3.986004418e5; // Earth's GM in km³/s² (approximate for other planets)
            const orbitalRadius = planetRadius + altitude;
            const orbitalSpeed = Math.sqrt(GM / orbitalRadius); // km/s
            
            // Ground speed is approximately orbital speed (simplified)
            const groundSpeed = orbitalSpeed;
            
            // Duration = arc length / ground speed
            const durationSeconds = visibilityArcKm / groundSpeed;
            
            return Math.round(durationSeconds / 60); // Return in minutes
        } catch (error) {
            console.warn('Error calculating visibility duration:', error);
            return 0;
        }
    }

    /**
     * Calculate satellite coverage radius in degrees
     * @param {number} altitude - Satellite altitude in km
     * @param {Object} planetData - Planet data with radius
     * @returns {number} Coverage radius in degrees
     */
    static calculateCoverageRadius(altitude, planetData = null) {
        try {
            const planetRadius = planetData?.radius || this._planetRadius || 6371; // km
            
            if (!altitude || altitude <= 0) {
                return 0;
            }

            // Calculate maximum central angle visible from satellite
            const centralAngle = Math.acos(planetRadius / (planetRadius + altitude));
            
            // Convert to degrees
            return centralAngle * (180 / Math.PI);
        } catch (error) {
            console.warn('Error calculating coverage radius:', error);
            return 0;
        }
    }
}

export const passPredictionService = new PassPredictionService();