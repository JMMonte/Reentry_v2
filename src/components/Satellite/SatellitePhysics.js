import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';

export class SatellitePhysics {
    constructor(satellite) {
        this.satellite = satellite;
    }

    // Convert position from scaled units to meters (for calculations)
    _getPositionInMeters() {
        if (!this.satellite.position) return null;
        return PhysicsUtils.positionToMeters(this.satellite.position);
    }

    // Get position length in meters
    _getPositionLengthInMeters() {
        const position = this._getPositionInMeters();
        return position ? position.length() : 0;
    }

    // Get position directly in km (unscaled)
    _getPositionInKm() {
        if (!this.satellite.position) return null;
        return PhysicsUtils.positionToKm(this.satellite.position);
    }

    // Convert velocity from scaled units to m/s (for calculations)
    _getVelocityInMetersPerSecond() {
        if (!this.satellite.velocity) return null;
        return PhysicsUtils.velocityToMetersPerSecond(this.satellite.velocity);
    }

    // Get velocity in km/s
    _getVelocityInKmS() {
        if (!this.satellite.velocity) return null;
        return PhysicsUtils.velocityToKmPerSecond(this.satellite.velocity);
    }

    // Get the speed in m/s
    getSpeed() {
        return PhysicsUtils.getSpeed(this._getVelocityInMetersPerSecond());
    }

    // Get the speed in km/s
    getSpeedKmS() {
        return PhysicsUtils.getSpeed(this._getVelocityInKmS());
    }

    // Returns the straight-line distance from the center of the Earth to the satellite in km
    getRadialAltitude() {
        return PhysicsUtils.getRadialAltitude(this.satellite.position);
    }

    // Returns the altitude above the Earth's surface in km
    getSurfaceAltitude() {
        return PhysicsUtils.getSurfaceAltitude(this.satellite.position);
    }

    // Returns the altitude above the reference ellipsoid in km
    getAltitude(earth) {
        return PhysicsUtils.getAltitude(this.satellite.position);
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

            // Use the centralized method from PhysicsUtils
            return PhysicsUtils.calculateOrbitalElements(positionInMeters, velocityInMPS, mu);
        } catch (error) {
            console.error('Error calculating orbital elements:', error);
            return null;
        }
    }
} 