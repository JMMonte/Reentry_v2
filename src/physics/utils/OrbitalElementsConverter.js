import * as THREE from 'three';
import { stateToKeplerian } from './KeplerianUtils.js';
import { CoordinateTransforms } from './CoordinateTransforms.js';

/**
 * OrbitalElementsConverter - Handles orbital element calculations with proper reference frame support
 * 
 * This module provides conversions between state vectors and orbital elements
 * with support for different reference frames (ecliptic vs planet-equatorial).
 * 
 * Reference Frames:
 * - 'ecliptic': Elements relative to ecliptic plane (interplanetary standard)
 *   - 0° inclination = ecliptic plane
 *   - 0° RAAN = vernal equinox direction
 * 
 * - 'equatorial': Elements relative to planet's equator (satellite standard)
 *   - 0° inclination = planet's equatorial plane
 *   - 0° RAAN = ascending node of planet's equator on ecliptic
 *   
 * For Earth satellites, 'equatorial' gives the familiar orbital elements where:
 * - 0° inclination = equatorial orbit
 * - 90° inclination = polar orbit
 * - RAAN measured from vernal equinox in Earth's equatorial plane
 */
export class OrbitalElementsConverter {

    /**
     * Calculate orbital elements from state vectors with reference frame support
     * @param {THREE.Vector3|Array} position - Position vector in planet-centered inertial frame (km)
     * @param {THREE.Vector3|Array} velocity - Velocity vector in planet-centered inertial frame (km/s)
     * @param {Object} centralBody - Central body object with GM, radius, etc.
     * @param {string} referenceFrame - 'ecliptic' or 'equatorial' (default: 'ecliptic')
     * @returns {Object|null} Orbital elements in the specified reference frame
     */
    static calculateOrbitalElements(position, velocity, centralBody, referenceFrame = 'ecliptic') {
        // Validate inputs (throws on failure)
        this._validateInputs(position, velocity, centralBody);
        
        try {
            // Normalize inputs and extract parameters
            const { workingPos, workingVel } = this._normalizeStateVectors(position, velocity);
            const bodyParams = this._extractCentralBodyParams(centralBody);
            
            // Calculate base orbital elements
            const elements = this._calculateBaseElements(workingPos, workingVel, bodyParams);
            if (!elements) return null;
            
            // Apply reference frame transformation if needed
            if (referenceFrame === 'equatorial') {
                this._applyEquatorialTransformation(elements, workingPos, workingVel, centralBody, bodyParams);
            }
            
            // Add metadata and return
            return this._finalizeElements(elements, referenceFrame, centralBody);
            
        } catch (error) {
            console.warn('[OrbitalElementsConverter] Calculation failed:', error.message);
            return null;
        }
    }

    /**
     * Validate input parameters
     * @private
     */
    static _validateInputs(position, velocity, centralBody) {
        if (!position || (!position.isVector3 && !Array.isArray(position))) {
            throw new Error('Position must be a THREE.Vector3 or array [x, y, z]');
        }
        if (!velocity || (!velocity.isVector3 && !Array.isArray(velocity))) {
            throw new Error('Velocity must be a THREE.Vector3 or array [vx, vy, vz]');
        }
        if (!centralBody) {
            throw new Error('Central body is required');
        }
    }

    /**
     * Normalize state vectors to consistent format
     * @private
     */
    static _normalizeStateVectors(position, velocity) {
        const workingPos = position.isVector3 ? position.clone() : new THREE.Vector3(...position);
        const workingVel = velocity.isVector3 ? velocity.clone() : new THREE.Vector3(...velocity);
        return { workingPos, workingVel };
    }

    /**
     * Extract and normalize central body parameters
     * @private
     */
    static _extractCentralBodyParams(centralBody) {
        return {
            GM: centralBody.GM || centralBody.mu,
            radius: Math.max(0, centralBody.radius || 0),
            name: centralBody.name || 'planet'
        };
    }

    /**
     * Calculate base orbital elements using standard algorithms
     * @private
     */
    static _calculateBaseElements(position, velocity, bodyParams) {
        const elements = stateToKeplerian(
            position,
            velocity,
            bodyParams.GM,
            0,
            bodyParams.radius
        );
        
        if (!elements || !this._validateElements(elements)) {
            return null;
        }
        
        return elements;
    }

    /**
     * Validate calculated orbital elements
     * @private
     */
    static _validateElements(elements) {
        return elements.semiMajorAxis > 0 && 
               elements.eccentricity >= 0 && 
               !isNaN(elements.inclination);
    }

    /**
     * Apply equatorial reference frame transformation
     * @private
     */
    static _applyEquatorialTransformation(elements, workingPos, workingVel, centralBody, bodyParams) {
        const quaternion = this._normalizeQuaternion(centralBody.quaternion);
        if (!quaternion) {
            console.warn('[OrbitalElementsConverter] No valid quaternion for equatorial transformation');
            return;
        }
        
        try {
            // Transform vectors to equatorial frame
            const { transformedPos, transformedVel } = this._transformVectors(workingPos, workingVel, quaternion);
            
            // Recalculate elements in new frame
            const equatorialElements = this._calculateBaseElements(transformedPos, transformedVel, bodyParams);
            if (equatorialElements) {
                Object.assign(elements, equatorialElements);
            }
        } catch (error) {
            console.warn('[OrbitalElementsConverter] Equatorial transformation failed:', error.message);
        }
    }

    /**
     * Transform position and velocity vectors using quaternion
     * @private
     */
    static _transformVectors(position, velocity, quaternion) {
        const inverseQuaternion = quaternion.clone().invert();
        const transformedPos = position.clone().applyQuaternion(inverseQuaternion);
        const transformedVel = velocity.clone().applyQuaternion(inverseQuaternion);
        return { transformedPos, transformedVel };
    }

    /**
     * Normalize quaternion from various input formats to THREE.Quaternion
     * @private
     * @param {*} quaternion - Input quaternion in various formats
     * @returns {THREE.Quaternion|null} Normalized quaternion or null if invalid
     */
    static _normalizeQuaternion(quaternion) {
        if (!quaternion) return null;
        
        // Handle array format [x, y, z, w]
        if (Array.isArray(quaternion) && quaternion.length === 4) {
            const [x, y, z, w] = quaternion;
            return new THREE.Quaternion(x, y, z, w);
        }
        
        // Handle Three.js Quaternion object
        if (quaternion.isQuaternion || (quaternion._x !== undefined && quaternion._w !== undefined)) {
            return quaternion.clone ? quaternion.clone() : 
                   new THREE.Quaternion(quaternion._x, quaternion._y, quaternion._z, quaternion._w);
        }
        
        return null;
    }

    /**
     * Finalize elements with metadata
     * @private
     */
    static _finalizeElements(elements, referenceFrame, centralBody) {
        // Add reference frame metadata
        elements.referenceFrame = referenceFrame;
        elements.referenceFrameNote = this._generateFrameNote(referenceFrame, centralBody);
        
        // Ensure all angles are in valid range [0, 360)
        this._normalizeAngles(elements);
        
        return elements;
    }

    /**
     * Generate reference frame description
     * @private
     */
    static _generateFrameNote(referenceFrame, centralBody) {
        if (referenceFrame === 'equatorial') {
            const bodyName = centralBody.name || 'planet';
            return `Elements relative to ${bodyName}'s equator`;
        }
        return 'Elements relative to ecliptic plane';
    }

    /**
     * Normalize angles to [0, 360) degree range
     * @private
     */
    static _normalizeAngles(elements) {
        const angleFields = ['inclination', 'longitudeOfAscendingNode', 'argumentOfPeriapsis', 'trueAnomaly'];
        
        angleFields.forEach(field => {
            if (elements[field] !== undefined) {
                elements[field] = this._normalizeAngle(elements[field]);
            }
        });
    }

    /**
     * Normalize single angle to [0, 360) range
     * @private
     */
    static _normalizeAngle(angle) {
        angle = angle % 360;
        return angle < 0 ? angle + 360 : angle;
    }

    /**
     * Convert orbital elements between reference frames
     * @param {Object} elements - Orbital elements object
     * @param {string} fromFrame - Source reference frame ('ecliptic' or 'equatorial')
     * @param {string} toFrame - Target reference frame ('ecliptic' or 'equatorial')
     * @param {Object} centralBody - Central body for equatorial frame
     * @returns {Object} Orbital elements in target frame
     */
    static convertOrbitalElements(elements, fromFrame, toFrame, centralBody) {
        if (fromFrame === toFrame) {
            return { ...elements, referenceFrame: toFrame };
        }

        // Convert to state vectors first
        const stateVectors = CoordinateTransforms.createFromOrbitalElements({
            semiMajorAxis: elements.semiMajorAxis || elements.a,
            eccentricity: elements.eccentricity || elements.e,
            inclination: elements.inclination,
            argumentOfPeriapsis: elements.argumentOfPeriapsis || elements.arg_p,
            raan: elements.longitudeOfAscendingNode || elements.lan,
            trueAnomaly: elements.trueAnomaly || elements.nu,
            referenceFrame: fromFrame
        }, centralBody);

        // Recalculate in target frame
        return this.calculateOrbitalElements(
            stateVectors.position,
            stateVectors.velocity,
            centralBody,
            toFrame
        );
    }

    /**
     * Get human-readable description of orbital elements
     * @param {Object} elements - Orbital elements
     * @returns {Object} Descriptions of what each element means in the current frame
     */
    static getOrbitalElementDescriptions(elements) {
        const frame = elements.referenceFrame || 'ecliptic';

        if (frame === 'equatorial') {
            return {
                inclination: "Angle between orbit and planet's equator (0° = equatorial, 90° = polar)",
                longitudeOfAscendingNode: "Angle from vernal equinox to ascending node in equatorial plane",
                argumentOfPeriapsis: "Angle from ascending node to periapsis in orbital plane",
                trueAnomaly: "Current angle from periapsis to satellite in orbital plane"
            };
        } else {
            return {
                inclination: "Angle between orbit and ecliptic plane",
                longitudeOfAscendingNode: "Angle from vernal equinox to ascending node in ecliptic",
                argumentOfPeriapsis: "Angle from ascending node to periapsis in orbital plane",
                trueAnomaly: "Current angle from periapsis to satellite in orbital plane"
            };
        }
    }

    /**
     * Format orbital elements for display with proper units and precision
     * @param {Object} elements - Orbital elements
     * @param {boolean} detailed - Include additional parameters
     * @returns {Object} Formatted elements ready for display
     */
    static formatOrbitalElements(elements, detailed = false) {
        const formatted = {
            semiMajorAxis: {
                value: elements.semiMajorAxis?.toFixed(2),
                unit: 'km',
                label: 'Semi-Major Axis'
            },
            eccentricity: {
                value: elements.eccentricity?.toFixed(6),
                unit: '',
                label: 'Eccentricity'
            },
            inclination: {
                value: elements.inclination?.toFixed(2),
                unit: '°',
                label: 'Inclination'
            },
            longitudeOfAscendingNode: {
                value: elements.longitudeOfAscendingNode?.toFixed(2),
                unit: '°',
                label: 'LAN (Ω)'
            },
            argumentOfPeriapsis: {
                value: elements.argumentOfPeriapsis?.toFixed(2),
                unit: '°',
                label: 'Arg of Periapsis (ω)'
            },
            trueAnomaly: {
                value: elements.trueAnomaly?.toFixed(2),
                unit: '°',
                label: 'True Anomaly (ν)'
            },
            period: {
                value: elements.period ? (elements.period / 60).toFixed(2) : 'N/A',
                unit: 'min',
                label: 'Orbital Period'
            },
            referenceFrame: {
                value: elements.referenceFrame || 'ecliptic',
                unit: '',
                label: 'Reference Frame'
            }
        };

        if (detailed) {
            formatted.meanAnomaly = {
                value: elements.meanAnomaly?.toFixed(2) || elements.M0 ? (elements.M0 * 180 / Math.PI).toFixed(2) : 'N/A',
                unit: '°',
                label: 'Mean Anomaly (M)'
            };
            formatted.periapsisAltitude = {
                value: elements.periapsisAltitude?.toFixed(2),
                unit: 'km',
                label: 'Periapsis Altitude'
            };
            formatted.apoapsisAltitude = {
                value: elements.apoapsisAltitude?.toFixed(2),
                unit: 'km',
                label: 'Apoapsis Altitude'
            };
        }

        return formatted;
    }
}