import { PhysicsVector3 } from '../utils/PhysicsVector3.js';

/**
 * Centralized atmospheric models and drag calculations
 * Handles atmospheric density profiles and aerodynamic forces
 */
export class AtmosphericModels {
    // Note: Rotation rates should be calculated dynamically from body data

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
            density = 1.225e-9, // kg/km³ at sea level (converted from 1.225 kg/m³)
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
     * @param {Array|PhysicsVector3} position - Position relative to planet center (km)
     * @param {Array|PhysicsVector3} velocity - Velocity relative to planet center (km/s)
     * @param {Object} planet - Planet with atmosphere and rotation properties
     * @param {number} ballisticCoefficient - Ballistic coefficient (mass/area/Cd) in kg/m²
     * @returns {Array} - Drag acceleration [ax, ay, az] (km/s²)
     */
    static computeDragAcceleration(position, velocity, planet, ballisticCoefficient = null) {
        if (!planet || (!planet.atmosphere && !planet.atmosphericModel) || !planet.radius) {
            return [0, 0, 0];
        }

        // Convert inputs to arrays if needed  
        const p = Array.isArray(position) ? position : (position?.toArray ? position.toArray() : [position.x || 0, position.y || 0, position.z || 0]);
        const v = Array.isArray(velocity) ? velocity : (velocity?.toArray ? velocity.toArray() : [velocity.x || 0, velocity.y || 0, velocity.z || 0]);
        
        const [x, y, z] = p;
        const r = Math.sqrt(x * x + y * y + z * z);
        const altitude = r - planet.radius;

        // Check if above atmosphere - try both atmosphere and atmosphericModel
        const atmosphereConfig = planet.atmosphere || planet.atmosphericModel;
        const thickness = atmosphereConfig.thickness || atmosphereConfig.maxAltitude || 100;
        if (altitude <= 0 || altitude > thickness) {
            return [0, 0, 0];
        }

        // Calculate atmospheric density
        let rho;
        if (planet.atmosphericModel && planet.atmosphericModel.getDensity) {
            rho = planet.atmosphericModel.getDensity(altitude);
        } else {
            // Fallback calculation using simplified exponential model
            // The referenceDensity is at referenceAltitude, need to extrapolate to current altitude
            const referenceAlt = atmosphereConfig.referenceAltitude || 0;
            const referenceDensity = atmosphereConfig.referenceDensity || 1.225; // kg/m³
            const scaleHeight = atmosphereConfig.scaleHeight || 50;
            
            // Calculate density directly using exponential model at current altitude
            // Convert from kg/m³ to kg/km³ and apply exponential decay
            rho = (referenceDensity * 1e9) * Math.exp(-(altitude - referenceAlt) / scaleHeight);
        }
        if (rho === 0) return [0, 0, 0];

        // Atmospheric velocity due to planet rotation
        const omega = planet.rotationPeriod 
            ? (2 * Math.PI / planet.rotationPeriod) 
            : 0; // No rotation if period not specified
        
        // Proper 3D atmospheric co-rotation with planetary tilt
        // Earth's rotation axis is tilted 23.5° from the ecliptic normal
        const tilt = planet.tilt ? (planet.tilt * Math.PI / 180) : 0; // Convert to radians
        
        // Rotation vector in planetary frame (accounting for tilt)
        // For Earth: rotation axis points toward celestial north pole, tilted from Z-axis
        const rotationAxis = [
            Math.sin(tilt), // X-component of rotation axis
            0,              // Y-component (assuming rotation in XZ plane)
            Math.cos(tilt)  // Z-component of rotation axis
        ];
        
        // Atmospheric velocity = ω × r (cross product of rotation vector with position)
        const vAtm = [
            omega * (rotationAxis[1] * z - rotationAxis[2] * y),
            omega * (rotationAxis[2] * x - rotationAxis[0] * z),
            omega * (rotationAxis[0] * y - rotationAxis[1] * x)
        ];
        
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
     * @param {Array|PhysicsVector3} position - Position in solar system (km)
     * @param {Map|Object} bodyMap - Map of NAIF ID to body data
     * @returns {Object|null} - Host planet or null
     */
    static findHostPlanet(position, bodyMap) {
        const p = Array.isArray(position) ? position : (position?.toArray ? position.toArray() : [position.x || 0, position.y || 0, position.z || 0]);
        
        let closestBody = null;
        let closestDistance = Infinity;

        // Check all bodies with atmospheres
        const bodies = bodyMap instanceof Map ? Array.from(bodyMap.values()) : Object.values(bodyMap);
        
        for (const body of bodies) {
            if (!body.atmosphere || !body.radius) continue;
            
            const bodyPos = Array.isArray(body.position) ? body.position : (body.position?.toArray ? body.position.toArray() : [0, 0, 0]);
            
            // Calculate distance using array coordinates
            const dx = p[0] - bodyPos[0];
            const dy = p[1] - bodyPos[1];
            const dz = p[2] - bodyPos[2];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
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
     * @param {Array|PhysicsVector3} position - Position relative to planet center (km)
     * @param {Object} planet - Planet with atmosphere and radius
     * @returns {boolean} - True if in atmosphere
     */
    static isInAtmosphere(position, planet) {
        if (!planet || (!planet.atmosphere && !planet.atmosphericModel) || !planet.radius) return false;
        
        const p = position instanceof PhysicsVector3 ? position : PhysicsVector3.fromArray(position);
        const r = p.length();
        const altitude = r - planet.radius;
        
        const atmosphereConfig = planet.atmosphere || planet.atmosphericModel;
        const thickness = atmosphereConfig.thickness || atmosphereConfig.maxAltitude || 100;
        
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