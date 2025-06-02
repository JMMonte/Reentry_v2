/**
 * ApsisDetection - Advanced Apsis Detection for N-Body Propagated Trajectories
 * 
 * This service provides apsis detection algorithms that work with real propagated
 * satellite trajectories, including perturbations, SOI transitions, and complex
 * orbital mechanics that deviate from perfect Keplerian orbits.
 * 
 * Unlike analytical apsis calculations, this service analyzes actual trajectory
 * data to find local minima and maxima in distance from central bodies.
 */

import * as THREE from 'three';

export class ApsisDetection {
    
    /**
     * Detect all apsis points in a trajectory segment
     * @param {Array} orbitPoints - Array of orbit points with {position, time, centralBodyId}
     * @param {Object} options - Detection options
     * @returns {Array} Array of detected apsis points
     */
    static detectApsisPoints(orbitPoints, options = {}) {
        const {
            minimumSeparation = 3, // Minimum points between apsis detections
            toleranceRatio = 0.001, // Relative tolerance for local extrema
            requireAlternating = true // Require alternating periapsis/apoapsis
        } = options;

        if (!orbitPoints || orbitPoints.length < 3) {
            return [];
        }

        // Group points by central body to handle SOI transitions
        const bodySegments = this._segmentBycentralBody(orbitPoints);
        const allApsisPoints = [];

        for (const segment of bodySegments) {
            if (segment.points.length < 3) continue;

            const segmentApsis = this._detectApsisInSegment(
                segment.points, 
                segment.centralBodyId,
                { minimumSeparation, toleranceRatio, requireAlternating }
            );
            
            allApsisPoints.push(...segmentApsis);
        }

        // Sort by time
        return allApsisPoints.sort((a, b) => a.time - b.time);
    }

    /**
     * Find the next periapsis from a given position in the trajectory
     * @param {Array} orbitPoints - Array of orbit points
     * @param {number} currentTime - Current simulation time
     * @param {number} centralBodyId - ID of central body to analyze
     * @returns {Object|null} Next periapsis point or null
     */
    static findNextPeriapsis(orbitPoints, currentTime, centralBodyId) {
        return this._findNextApsis(orbitPoints, currentTime, centralBodyId, 'periapsis');
    }

    /**
     * Find the next apoapsis from a given position in the trajectory
     * @param {Array} orbitPoints - Array of orbit points
     * @param {number} currentTime - Current simulation time
     * @param {number} centralBodyId - ID of central body to analyze
     * @returns {Object|null} Next apoapsis point or null
     */
    static findNextApoapsis(orbitPoints, currentTime, centralBodyId) {
        return this._findNextApsis(orbitPoints, currentTime, centralBodyId, 'apoapsis');
    }

    /**
     * Calculate distance from satellite position to central body
     * @param {Array|THREE.Vector3} satellitePos - Satellite position [x, y, z] or Vector3
     * @param {Array|THREE.Vector3} centralBodyPos - Central body position [x, y, z] or Vector3 (default: origin)
     * @returns {number} Distance in kilometers
     */
    static calculateDistance(satellitePos, centralBodyPos = [0, 0, 0]) {
        const satPos = satellitePos.isVector3 ? 
            new THREE.Vector3(satellitePos.x, satellitePos.y, satellitePos.z) :
            new THREE.Vector3(...satellitePos);
            
        const bodyPos = centralBodyPos.isVector3 ?
            new THREE.Vector3(centralBodyPos.x, centralBodyPos.y, centralBodyPos.z) :
            new THREE.Vector3(...centralBodyPos);

        return satPos.distanceTo(bodyPos);
    }

    /**
     * Interpolate position at a specific time between two orbit points
     * @param {Object} point1 - First orbit point {position, time}
     * @param {Object} point2 - Second orbit point {position, time}
     * @param {number} targetTime - Time to interpolate to
     * @returns {Array} Interpolated position [x, y, z]
     */
    static interpolatePosition(point1, point2, targetTime) {
        if (point1.time === point2.time) {
            return [...point1.position];
        }

        const factor = (targetTime - point1.time) / (point2.time - point1.time);
        
        return [
            point1.position[0] + factor * (point2.position[0] - point1.position[0]),
            point1.position[1] + factor * (point2.position[1] - point1.position[1]),
            point1.position[2] + factor * (point2.position[2] - point1.position[2])
        ];
    }

    /**
     * Find precise apsis timing using interpolation
     * @param {Array} orbitPoints - Orbit points around the apsis
     * @param {number} apsisIndex - Index of approximate apsis point
     * @param {string} apsisType - 'periapsis' or 'apoapsis'
     * @returns {Object} Refined apsis point with precise timing
     */
    static refineApsisPoint(orbitPoints, apsisIndex, apsisType) {
        if (apsisIndex < 1 || apsisIndex >= orbitPoints.length - 1) {
            // Can't refine edge points
            const point = orbitPoints[apsisIndex];
            return {
                type: apsisType,
                time: point.time,
                position: [...point.position],
                distance: this.calculateDistance(point.position),
                centralBodyId: point.centralBodyId
            };
        }

        const prevPoint = orbitPoints[apsisIndex - 1];
        const apsisPoint = orbitPoints[apsisIndex];
        const nextPoint = orbitPoints[apsisIndex + 1];

        // Calculate distances
        const prevDistance = this.calculateDistance(prevPoint.position);
        const apsisDistance = this.calculateDistance(apsisPoint.position);
        const nextDistance = this.calculateDistance(nextPoint.position);

        // Use quadratic interpolation to find precise extremum
        const t1 = prevPoint.time;
        const t2 = apsisPoint.time;
        const t3 = nextPoint.time;

        const d1 = prevDistance;
        const d2 = apsisDistance;
        const d3 = nextDistance;

        // Fit quadratic: d = at² + bt + c
        // Find minimum/maximum of quadratic
        const dt1 = t1 - t2;
        const dt3 = t3 - t2;
        
        const a = ((d1 - d2) / dt1 - (d3 - d2) / dt3) / (dt1 - dt3);
        const b = (d1 - d2) / dt1 - a * dt1;

        let refinedTime = t2;
        if (Math.abs(a) > 1e-10) {
            // Find extremum: dt/dt = 2at + b = 0 => t = -b/(2a)
            const deltaT = -b / (2 * a);
            refinedTime = t2 + deltaT;
            
            // Clamp to reasonable bounds
            refinedTime = Math.max(t1, Math.min(t3, refinedTime));
        }

        // Interpolate position at refined time
        let refinedPosition;
        if (refinedTime <= t2) {
            refinedPosition = this.interpolatePosition(prevPoint, apsisPoint, refinedTime);
        } else {
            refinedPosition = this.interpolatePosition(apsisPoint, nextPoint, refinedTime);
        }

        return {
            type: apsisType,
            time: refinedTime,
            position: refinedPosition,
            distance: this.calculateDistance(refinedPosition),
            centralBodyId: apsisPoint.centralBodyId,
            refined: true
        };
    }

    /**
     * Validate orbit data for apsis detection
     * @param {Array} orbitPoints - Orbit points to validate
     * @returns {Object} Validation result {isValid, errors}
     */
    static validateOrbitData(orbitPoints) {
        const errors = [];

        if (!Array.isArray(orbitPoints)) {
            errors.push('Orbit points must be an array');
            return { isValid: false, errors };
        }

        if (orbitPoints.length < 3) {
            errors.push('At least 3 orbit points required for apsis detection');
        }

        for (let i = 0; i < orbitPoints.length; i++) {
            const point = orbitPoints[i];
            
            if (!point.position || !Array.isArray(point.position) || point.position.length !== 3) {
                errors.push(`Point ${i}: position must be array of 3 numbers`);
            }
            
            if (typeof point.time !== 'number' || !isFinite(point.time)) {
                errors.push(`Point ${i}: time must be a finite number`);
            }
            
            if (point.centralBodyId === undefined) {
                errors.push(`Point ${i}: centralBodyId is required`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Private: Segment orbit points by central body for SOI transitions
     * @private
     */
    static _segmentBycentralBody(orbitPoints) {
        const segments = [];
        let currentSegment = null;

        for (const point of orbitPoints) {
            if (!currentSegment || currentSegment.centralBodyId !== point.centralBodyId) {
                // Start new segment
                currentSegment = {
                    centralBodyId: point.centralBodyId,
                    points: []
                };
                segments.push(currentSegment);
            }
            
            currentSegment.points.push(point);
        }

        return segments;
    }

    /**
     * Private: Detect apsis points within a single central body segment
     * @private
     */
    static _detectApsisInSegment(points, centralBodyId, options) {
        const { minimumSeparation, toleranceRatio, requireAlternating } = options;
        const apsisPoints = [];

        if (points.length < 3) return apsisPoints;

        // Calculate distances for all points
        const distances = points.map((point, index) => ({
            distance: this.calculateDistance(point.position),
            index: index,
            point: point
        }));

        let lastApsisIndex = -1;
        let lastApsisType = null;

        // Helper function to add apsis point
        const addApsisPoint = (index, type) => {
            if (lastApsisIndex === -1 || index - lastApsisIndex >= minimumSeparation) {
                if (!requireAlternating || lastApsisType !== type) {
                    const refinedApsis = this.refineApsisPoint(points, index, type);
                    refinedApsis.index = index;
                    apsisPoints.push(refinedApsis);
                    lastApsisType = type;
                    lastApsisIndex = index;
                    return true;
                }
            }
            return false;
        };

        // Check first point (compare with second point and assume circular/extended orbit)
        if (distances.length >= 2) {
            const first = distances[0];
            const second = distances[1];
            const last = distances[distances.length - 1];
            
            // Check if first point is a local extremum (comparing with last and second)
            if (first.distance < second.distance && first.distance < last.distance) {
                addApsisPoint(0, 'periapsis');
            } else if (first.distance > second.distance && first.distance > last.distance) {
                addApsisPoint(0, 'apoapsis');
            }
        }

        // Check middle points
        for (let i = 1; i < distances.length - 1; i++) {
            const prev = distances[i - 1];
            const curr = distances[i];
            const next = distances[i + 1];

            // Check for local minimum (periapsis)
            if (curr.distance < prev.distance && curr.distance < next.distance) {
                addApsisPoint(i, 'periapsis');
            }
            // Check for local maximum (apoapsis)
            else if (curr.distance > prev.distance && curr.distance > next.distance) {
                addApsisPoint(i, 'apoapsis');
            }
        }

        // Check last point (compare with second-to-last and first point)
        if (distances.length >= 2) {
            const last = distances[distances.length - 1];
            const secondLast = distances[distances.length - 2];
            const first = distances[0];
            
            // Only check if we don't already have both types or if allowing duplicates
            if (last.distance < secondLast.distance && last.distance < first.distance) {
                addApsisPoint(distances.length - 1, 'periapsis');
            } else if (last.distance > secondLast.distance && last.distance > first.distance) {
                addApsisPoint(distances.length - 1, 'apoapsis');
            }
        }

        return apsisPoints;
    }

    /**
     * Private: Find next apsis of specified type from current time
     * @private
     */
    static _findNextApsis(orbitPoints, currentTime, centralBodyId, apsisType) {
        // Find current position in trajectory
        let currentIndex = 0;
        for (let i = 0; i < orbitPoints.length; i++) {
            if (orbitPoints[i].time >= currentTime) {
                currentIndex = i;
                break;
            }
        }

        // Get points from current position onwards
        const futurePoints = orbitPoints.slice(currentIndex);

        // Filter by central body if specified
        const relevantPoints = centralBodyId ? 
            futurePoints.filter(p => p.centralBodyId === centralBodyId) :
            futurePoints;

        if (relevantPoints.length < 3) {
            return null;
        }

        // Detect all apsis points in future trajectory
        const detectedApsis = this.detectApsisPoints(relevantPoints, {
            minimumSeparation: 1,
            toleranceRatio: 0.001,
            requireAlternating: false
        });

        // Find first apsis of requested type
        for (const apsis of detectedApsis) {
            if (apsis.type === apsisType && apsis.time > currentTime) {
                return apsis;
            }
        }

        return null;
    }

    /**
     * Get statistical summary of apsis points for analysis
     * @param {Array} apsisPoints - Array of detected apsis points
     * @returns {Object} Statistical summary
     */
    static getApsisStatistics(apsisPoints) {
        if (!apsisPoints || apsisPoints.length === 0) {
            return {
                count: 0,
                periapsisCount: 0,
                apoapsisCount: 0,
                averagePeriod: 0,
                distanceRange: { min: 0, max: 0 }
            };
        }

        const periapsis = apsisPoints.filter(a => a.type === 'periapsis');
        const apoapsis = apsisPoints.filter(a => a.type === 'apoapsis');

        // Calculate average period (time between consecutive periapsis)
        let averagePeriod = 0;
        if (periapsis.length > 1) {
            const periods = [];
            for (let i = 1; i < periapsis.length; i++) {
                periods.push(periapsis[i].time - periapsis[i-1].time);
            }
            averagePeriod = periods.reduce((sum, p) => sum + p, 0) / periods.length;
        }

        // Distance range
        const distances = apsisPoints.map(a => a.distance);
        const distanceRange = {
            min: Math.min(...distances),
            max: Math.max(...distances)
        };

        return {
            count: apsisPoints.length,
            periapsisCount: periapsis.length,
            apoapsisCount: apoapsis.length,
            averagePeriod,
            distanceRange,
            eccentricity: distanceRange.max > 0 ? 
                (distanceRange.max - distanceRange.min) / (distanceRange.max + distanceRange.min) : 0
        };
    }

    /**
     * Check if trajectory has chaotic or irregular apsis pattern
     * @param {Array} apsisPoints - Array of detected apsis points
     * @returns {Object} Analysis result {isChaotic, irregularityScore, reasons}
     */
    static analyzeChaos(apsisPoints) {
        if (apsisPoints.length < 4) {
            return {
                isChaotic: false,
                irregularityScore: 0,
                reasons: ['Insufficient data for chaos analysis']
            };
        }

        const reasons = [];
        let irregularityScore = 0;

        // Check alternating pattern
        let alternatingCount = 0;
        for (let i = 1; i < apsisPoints.length; i++) {
            if (apsisPoints[i].type !== apsisPoints[i-1].type) {
                alternatingCount++;
            }
        }
        const alternatingRatio = alternatingCount / (apsisPoints.length - 1);
        
        if (alternatingRatio < 0.8) {
            irregularityScore += 0.3;
            reasons.push('Non-alternating apsis pattern');
        }

        // Check period consistency
        const periapsis = apsisPoints.filter(a => a.type === 'periapsis');
        if (periapsis.length > 2) {
            const periods = [];
            for (let i = 1; i < periapsis.length; i++) {
                periods.push(periapsis[i].time - periapsis[i-1].time);
            }
            
            const avgPeriod = periods.reduce((sum, p) => sum + p, 0) / periods.length;
            const periodVariation = Math.sqrt(
                periods.reduce((sum, p) => sum + Math.pow(p - avgPeriod, 2), 0) / periods.length
            ) / avgPeriod;
            
            if (periodVariation > 0.1) {
                irregularityScore += periodVariation;
                reasons.push('High period variation');
            }
        }

        return {
            isChaotic: irregularityScore > 0.5,
            irregularityScore,
            reasons
        };
    }
}