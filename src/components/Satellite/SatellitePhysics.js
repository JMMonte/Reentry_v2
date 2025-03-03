import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class SatellitePhysics {
    constructor(satellite) {
        this.satellite = satellite;
    }

    // Convert position from scaled units to meters (for calculations)
    _getPositionInMeters() {
        if (!this.satellite.position) return null;

        // The key insight: position values are already extremely large and likely represent km directly
        // These values are around 57M km, which puts the satellite way outside solar system
        // This suggests the position is already in meters but was incorrectly scaled

        // Return the position directly as meters
        return new THREE.Vector3(
            this.satellite.position.x,
            this.satellite.position.y,
            this.satellite.position.z
        );
    }

    // Get position length in meters
    _getPositionLengthInMeters() {
        const position = this._getPositionInMeters();
        return position ? position.length() : 0;
    }

    // Get position directly in km (unscaled)
    _getPositionInKm() {
        if (!this.satellite.position) return null;

        // The satellite.position is stored in meters (from the updatePosition method)
        // We need to convert it to kilometers
        return new THREE.Vector3(
            this.satellite.position.x * Constants.metersToKm,
            this.satellite.position.y * Constants.metersToKm,
            this.satellite.position.z * Constants.metersToKm
        );
    }

    // Convert velocity from scaled units to m/s (for calculations)
    _getVelocityInMetersPerSecond() {
        if (!this.satellite.velocity) return null;

        // The satellite.velocity is already stored in m/s (from the updatePosition method)
        return new THREE.Vector3(
            this.satellite.velocity.x,
            this.satellite.velocity.y,
            this.satellite.velocity.z
        );
    }

    // Get velocity in km/s
    _getVelocityInKmS() {
        if (!this.satellite.velocity) return null;

        // Convert velocity to km/s
        return new THREE.Vector3(
            this.satellite.velocity.x * Constants.metersToKm,
            this.satellite.velocity.y * Constants.metersToKm,
            this.satellite.velocity.z * Constants.metersToKm
        );
    }

    // Get the speed in m/s
    getSpeed() {
        const velocity = this._getVelocityInMetersPerSecond();
        return velocity ? velocity.length() : 0;
    }

    // Get the speed in km/s
    getSpeedKmS() {
        const velocity = this._getVelocityInKmS();
        return velocity ? velocity.length() : 0;
    }

    // Returns the straight-line distance from the center of the Earth to the satellite in km
    getRadialAltitude() {
        const positionM = this._getPositionInMeters();
        if (!positionM) return 0;

        // Calculate distance from Earth center in meters, then convert to km and subtract Earth radius in km
        return positionM.length() * Constants.metersToKm - Constants.earthRadius * Constants.metersToKm;
    }

    // Returns the altitude above the Earth's surface in km
    getSurfaceAltitude() {
        if (!this.satellite.position) return 0;

        // Get position length in meters
        const positionLengthM = this._getPositionInMeters().length();

        // Earth radius in meters (already defined as such in Constants)
        const earthRadiusM = Constants.earthRadius;

        // Calculate altitude in meters and convert to km
        return (positionLengthM - earthRadiusM) * Constants.metersToKm;
    }

    // Returns the altitude above the reference ellipsoid in km
    getAltitude(earth) {
        if (!earth || !this.satellite.position) return 0;

        // Get position in km
        const positionKm = this._getPositionInKm();

        // Earth radius in km
        const earthRadiusKm = Constants.earthRadius * Constants.metersToKm;

        // Calculate distance in km
        return positionKm.length() - earthRadiusKm;
    }

    // Returns the orbital elements of the satellite's orbit
    getOrbitalElements() {
        if (!this.satellite.position || !this.satellite.velocity) return null;

        try {
            // Get position in meters and velocity in m/s
            const positionInMeters = this._getPositionInMeters();
            const velocityInMPS = this._getVelocityInMetersPerSecond();

            if (!positionInMeters || !velocityInMPS) {
                console.error('Unable to get position or velocity for orbital elements calculation');
                return null;
            }

            // Standard gravitational parameter of the Earth in m^3/s^2
            const mu = Constants.G * Constants.earthMass;

            // Position and velocity magnitudes
            const r = positionInMeters.length(); // Position magnitude in meters
            const v = velocityInMPS.length(); // Velocity magnitude in m/s

            // Angular momentum vector h = r × v
            const h_vector = new THREE.Vector3().crossVectors(positionInMeters, velocityInMPS);
            const h = h_vector.length(); // Angular momentum magnitude

            // Radial velocity
            const vr = velocityInMPS.clone().dot(positionInMeters) / r;

            // Eccentricity vector calculation 
            // Calculate the first term: (v^2 - μ/r)r
            const term1 = positionInMeters.clone().multiplyScalar((v * v - mu / r) / mu);

            // Calculate the second term: (r·v)v / μ
            const term2 = velocityInMPS.clone().multiplyScalar(positionInMeters.clone().dot(velocityInMPS) / mu);

            // Subtract to get e = ((v^2 - μ/r)r - (r·v)v) / μ
            const e_vector = term1.sub(term2);
            const eccentricity = e_vector.length();

            // Specific orbital energy
            const specificEnergy = (v * v / 2) - (mu / r);

            // Semi-major axis (a = -μ/(2ε))
            // For hyperbolic orbits (e > 1, ε > 0), a is negative
            // For elliptical orbits (e < 1, ε < 0), a is positive
            // For parabolic orbits (e = 1, ε = 0), a is infinite
            let semiMajorAxis;
            if (Math.abs(specificEnergy) < 1e-10) {
                // Parabolic orbit
                semiMajorAxis = Infinity;
            } else {
                semiMajorAxis = -mu / (2 * specificEnergy);
            }

            // For inclination, we need the angular momentum vector z-component
            const inclination = Math.acos(h_vector.z / h); // Inclination in radians

            // Node vector (perpendicular to angular momentum and z-axis)
            // n = k × h where k is the unit vector along z-axis
            const nodeVector = new THREE.Vector3(0, 0, 1).cross(h_vector);
            const nodeLength = nodeVector.length();

            // Calculate longitude of ascending node
            let longitudeOfAscendingNode = 0;
            if (nodeLength > 1e-10) {
                // n is not zero, so orbit is inclined
                nodeVector.normalize();
                longitudeOfAscendingNode = Math.acos(nodeVector.x);
                if (nodeVector.y < 0) {
                    longitudeOfAscendingNode = 2 * Math.PI - longitudeOfAscendingNode;
                }
            }

            // Calculate argument of periapsis
            let argumentOfPeriapsis = 0;
            if (nodeLength > 1e-10 && eccentricity > 1e-10) {
                // Neither circular nor equatorial orbit
                const dotProduct = nodeVector.dot(e_vector) / eccentricity;
                argumentOfPeriapsis = Math.acos(Math.min(1, Math.max(-1, dotProduct))); // Clamp to avoid floating point errors
                if (e_vector.z < 0) {
                    argumentOfPeriapsis = 2 * Math.PI - argumentOfPeriapsis;
                }
            }

            // Calculate true anomaly
            let trueAnomaly = 0;
            if (eccentricity > 1e-10) {
                // Non-circular orbit
                const dotProduct = e_vector.dot(positionInMeters) / (eccentricity * r);
                trueAnomaly = Math.acos(Math.min(1, Math.max(-1, dotProduct))); // Clamp to avoid floating point errors
                if (vr < 0) {
                    trueAnomaly = 2 * Math.PI - trueAnomaly;
                }
            } else if (nodeLength > 1e-10) {
                // Circular inclined orbit
                const dotProduct = nodeVector.dot(positionInMeters) / r;
                trueAnomaly = Math.acos(Math.min(1, Math.max(-1, dotProduct))); // Clamp to avoid floating point errors
                if (h_vector.dot(new THREE.Vector3().crossVectors(nodeVector, positionInMeters)) < 0) {
                    trueAnomaly = 2 * Math.PI - trueAnomaly;
                }
            } else {
                // Circular equatorial orbit
                trueAnomaly = Math.acos(positionInMeters.x / r);
                if (positionInMeters.y < 0) {
                    trueAnomaly = 2 * Math.PI - trueAnomaly;
                }
            }

            // Calculate period (only valid for elliptical orbits)
            let period = null;
            if (semiMajorAxis > 0 && isFinite(semiMajorAxis)) {
                period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
            }

            // Calculate periapsis and apoapsis distances (only valid for elliptical orbits)
            let periapsisDistance = null;
            let apoapsisDistance = null;
            let periapsisAltitude = null;
            let apoapsisAltitude = null;

            if (eccentricity < 1 && eccentricity >= 0) {
                // Elliptical orbit (including circular when e=0)
                periapsisDistance = semiMajorAxis * (1 - eccentricity); // in meters
                apoapsisDistance = semiMajorAxis * (1 + eccentricity);  // in meters

                // Convert distances to km
                const periapsisDistanceKm = periapsisDistance * Constants.metersToKm;
                const apoapsisDistanceKm = apoapsisDistance * Constants.metersToKm;

                // Calculate altitudes
                const earthRadiusKm = Constants.earthRadius * Constants.metersToKm;
                periapsisAltitude = periapsisDistanceKm - earthRadiusKm;
                apoapsisAltitude = apoapsisDistanceKm - earthRadiusKm;
            }

            // Convert values to appropriate units for display
            const semiMajorAxisKm = isFinite(semiMajorAxis) ? semiMajorAxis * Constants.metersToKm : null;

            // Convert radians to degrees
            const inclinationDeg = (inclination * 180 / Math.PI).toFixed(2);
            const longitudeOfAscendingNodeDeg = (longitudeOfAscendingNode * 180 / Math.PI).toFixed(2);
            const argumentOfPeriopsisDeg = (argumentOfPeriapsis * 180 / Math.PI).toFixed(2);
            const trueAnomalyDeg = (trueAnomaly * 180 / Math.PI).toFixed(2);

            const result = {
                semiMajorAxis: semiMajorAxisKm,
                eccentricity: eccentricity,
                inclination: inclinationDeg,
                longitudeOfAscendingNode: longitudeOfAscendingNodeDeg,
                argumentOfPeriapsis: argumentOfPeriopsisDeg,
                trueAnomaly: trueAnomalyDeg,
                period: period,
                h: h,
                specificEnergy: specificEnergy,
                periapsisDistance: periapsisDistance ? periapsisDistance * Constants.metersToKm : null,
                periapsisAltitude: periapsisAltitude,
                apoapsisDistance: apoapsisDistance ? apoapsisDistance * Constants.metersToKm : null,
                apoapsisAltitude: apoapsisAltitude
            };

            return result;
        } catch (error) {
            console.error('Error calculating orbital elements:', error);
            return null;
        }
    }
} 