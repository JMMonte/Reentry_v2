import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

/**
 * Centralized atmospheric models and drag calculations
 * Handles atmospheric density profiles and aerodynamic forces
 */
export class AtmosphericModels {
    /**
     * Earth's rotation rate (rad/s)
     */
    static OMEGA_EARTH = 2 * Math.PI / Constants.siderialDay;

    /**
     * Default ballistic coefficient for satellites (kg/m²)
     * Note: This is in kg/m² but positions are in km, so we need to convert
     */
    static DEFAULT_BALLISTIC_COEFFICIENT = 50; // kg/m²

    /**
     * Calculate atmospheric density using exponential model
     * @param {number} altitude - Altitude above surface (km)
     * @param {Object} atmosphere - Atmosphere parameters
     * @returns {number} - Atmospheric density (kg/km³)
     */
    static calculateDensity(altitude, atmosphere) {
        if (!atmosphere || altitude < 0) return 0;

        const {
            thickness = 100, // km
            densityScaleHeight = 8.5, // km
            density = 1.225e-3, // kg/km³ at sea level (converted from kg/m³)
            rho0 = density // Alternative name for sea level density
        } = atmosphere;

        // Above atmosphere
        if (altitude > thickness) return 0;

        // Exponential atmosphere model
        const seaLevelDensity = rho0 || density;
        return seaLevelDensity * Math.exp(-altitude / densityScaleHeight);
    }

    /**
     * Compute drag acceleration on a body
     * @param {Array|THREE.Vector3} position - Position relative to planet center (km)
     * @param {Array|THREE.Vector3} velocity - Velocity relative to planet center (km/s)
     * @param {Object} planet - Planet with atmosphere and rotation properties
     * @param {number} ballisticCoefficient - Ballistic coefficient (mass/area/Cd) in kg/m²
     * @returns {Array} - Drag acceleration [ax, ay, az] (km/s²)
     */
    static computeDragAcceleration(position, velocity, planet, ballisticCoefficient = null) {
        if (!planet || !planet.atmosphere || !planet.radius) {
            return [0, 0, 0];
        }

        // Convert inputs to arrays if needed
        const p = position instanceof THREE.Vector3 ? position.toArray() : position;
        const v = velocity instanceof THREE.Vector3 ? velocity.toArray() : velocity;
        
        const [x, y, z] = p;
        const r = Math.sqrt(x * x + y * y + z * z);
        const altitude = r - planet.radius;

        // Check if above atmosphere
        const thickness = planet.atmosphere.thickness || 100;
        if (altitude <= 0 || altitude > thickness) {
            return [0, 0, 0];
        }

        // Calculate atmospheric density
        const rho = this.calculateDensity(altitude, planet.atmosphere);
        if (rho === 0) return [0, 0, 0];

        // Atmospheric velocity due to planet rotation
        const omega = planet.rotationPeriod 
            ? (2 * Math.PI / planet.rotationPeriod) 
            : this.OMEGA_EARTH;
        
        // Atmosphere co-rotates with planet (simplified model)
        const vAtm = [-omega * y, omega * x, 0];
        
        // Relative velocity
        const vr = [
            v[0] - vAtm[0],
            v[1] - vAtm[1],
            v[2] - vAtm[2]
        ];
        
        const vrMag = Math.sqrt(vr[0] * vr[0] + vr[1] * vr[1] + vr[2] * vr[2]);
        if (vrMag === 0) return [0, 0, 0];

        // Use provided ballistic coefficient or planet default
        const Bc = ballisticCoefficient || planet.ballisticCoefficient || this.DEFAULT_BALLISTIC_COEFFICIENT;
        
        // Convert Bc from kg/m² to kg/km² for consistency with km units
        const BcKm = Bc * 1e6;
        
        // Drag acceleration magnitude: a = -0.5 * ρ * v² / (m/CdA)
        const aMag = 0.5 * rho * vrMag * vrMag / BcKm;
        
        // Direction opposite to relative velocity
        const factor = -aMag / vrMag;
        
        return [
            factor * vr[0],
            factor * vr[1],
            factor * vr[2]
        ];
    }

    /**
     * Find the host planet for a given position
     * @param {Array|THREE.Vector3} position - Position in solar system (km)
     * @param {Map|Object} bodyMap - Map of NAIF ID to body data
     * @returns {Object|null} - Host planet or null
     */
    static findHostPlanet(position, bodyMap) {
        const p = position instanceof THREE.Vector3 ? position : new THREE.Vector3().fromArray(position);
        
        let closestBody = null;
        let closestDistance = Infinity;

        // Check all bodies with atmospheres
        const bodies = bodyMap instanceof Map ? Array.from(bodyMap.values()) : Object.values(bodyMap);
        
        for (const body of bodies) {
            if (!body.atmosphere || !body.radius) continue;
            
            const bodyPos = body.position instanceof THREE.Vector3 
                ? body.position 
                : new THREE.Vector3().fromArray(body.position || [0, 0, 0]);
            
            const distance = p.distanceTo(bodyPos);
            
            // Check if within atmosphere
            const atmRadius = body.radius + (body.atmosphere.thickness || 100);
            if (distance < atmRadius && distance < closestDistance) {
                closestDistance = distance;
                closestBody = body;
            }
        }

        return closestBody;
    }

    /**
     * Calculate terminal velocity in atmosphere
     * @param {number} altitude - Altitude above surface (km)
     * @param {Object} atmosphere - Atmosphere parameters
     * @param {number} ballisticCoefficient - Ballistic coefficient (kg/m²)
     * @param {number} g - Surface gravity (km/s²)
     * @returns {number} - Terminal velocity (km/s)
     */
    static calculateTerminalVelocity(altitude, atmosphere, ballisticCoefficient, g = 0.00981) {
        const rho = this.calculateDensity(altitude, atmosphere);
        if (rho === 0) return Infinity;
        
        // Convert Bc from kg/m² to kg/km²
        const BcKm = ballisticCoefficient * 1e6;
        
        // v_terminal = sqrt(2 * m * g / (ρ * Cd * A))
        // With Bc = m / (Cd * A), we get:
        // v_terminal = sqrt(2 * Bc * g / ρ)
        return Math.sqrt(2 * BcKm * g / rho);
    }

    /**
     * Calculate heating rate during atmospheric entry
     * @param {number} velocity - Velocity relative to atmosphere (km/s)
     * @param {number} density - Atmospheric density (kg/km³)
     * @param {number} radius - Vehicle radius (km)
     * @returns {number} - Heating rate (W/m²)
     */
    static calculateHeatingRate(velocity, density, radius = 0.001) {
        // Simplified heating model: q = k * sqrt(ρ/r) * v³
        // k is a constant depending on vehicle shape (~1.83e-4 for blunt bodies)
        const k = 1.83e-4;
        
        // Convert units for standard heating formula
        const densityKgM3 = density * 1e-9; // kg/km³ to kg/m³
        const velocityMS = velocity * 1000; // km/s to m/s
        const radiusM = radius * 1000; // km to m
        
        return k * Math.sqrt(densityKgM3 / radiusM) * Math.pow(velocityMS, 3);
    }

    /**
     * Check if a body has entered atmosphere
     * @param {Array|THREE.Vector3} position - Position relative to planet center (km)
     * @param {Object} planet - Planet with atmosphere and radius
     * @returns {boolean} - True if in atmosphere
     */
    static isInAtmosphere(position, planet) {
        if (!planet || !planet.atmosphere || !planet.radius) return false;
        
        const p = position instanceof THREE.Vector3 ? position : new THREE.Vector3().fromArray(position);
        const r = p.length();
        const altitude = r - planet.radius;
        const thickness = planet.atmosphere.thickness || 100;
        
        return altitude > 0 && altitude <= thickness;
    }

    /**
     * Calculate atmospheric scale height from temperature
     * @param {number} temperature - Atmospheric temperature (K)
     * @param {number} molecularMass - Mean molecular mass (kg/mol)
     * @param {number} g - Surface gravity (m/s²)
     * @returns {number} - Scale height (km)
     */
    static calculateScaleHeight(temperature, molecularMass = 0.029, g = 9.81) {
        const R = 8.314; // Universal gas constant (J/mol/K)
        const H = (R * temperature) / (molecularMass * g); // meters
        return H / 1000; // Convert to km
    }
}