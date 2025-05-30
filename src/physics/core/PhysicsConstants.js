/**
 * PhysicsConstants.js
 * 
 * Centralized physics constants and gravitational parameters
 * Eliminates duplication of GM values and physics constants across the codebase
 */

import { Constants } from '../../utils/Constants.js';

export class PhysicsConstants {
    /**
     * Get gravitational parameter (GM) for a celestial body
     * @param {number|string|Object} bodyIdentifier - NAIF ID, name, or body object
     * @returns {number} Gravitational parameter in km³/s²
     */
    static getGravitationalParameter(bodyIdentifier) {
        // If it's already a body object with GM or mass
        if (typeof bodyIdentifier === 'object' && bodyIdentifier !== null) {
            if (bodyIdentifier.GM) return bodyIdentifier.GM;
            if (bodyIdentifier.mass) return Constants.G * bodyIdentifier.mass;
            return this._getGMByNaifId(bodyIdentifier.naifId || bodyIdentifier.naif_id);
        }
        
        // If it's a NAIF ID (number)
        if (typeof bodyIdentifier === 'number') {
            return this._getGMByNaifId(bodyIdentifier);
        }
        
        // If it's a name (string)
        if (typeof bodyIdentifier === 'string') {
            return this._getGMByName(bodyIdentifier.toLowerCase());
        }
        
        // Default fallback
        console.warn(`[PhysicsConstants] Unknown body identifier: ${bodyIdentifier}, using Earth GM`);
        return Constants.earthGravitationalParameter;
    }
    
    /**
     * Get GM by NAIF ID using authoritative values
     * @private
     */
    static _getGMByNaifId(naifId) {
        // Authoritative GM values from NASA/JPL (km³/s²)
        const GM_VALUES = {
            // Sun and planets
            10: 132712440041.93938,  // Sun
            199: 22031.78,           // Mercury  
            299: 324858.592,         // Venus
            399: 398600.4415,        // Earth
            499: 42828.375214,       // Mars
            599: 126686531.900,      // Jupiter
            699: 37931206.234,       // Saturn
            799: 5793951.256,        // Uranus
            899: 6835099.97,         // Neptune
            999: 869.6,              // Pluto
            
            // Major moons
            301: 4902.800066,        // Moon (Earth)
            401: 0.7087,             // Phobos (Mars)
            402: 0.09593,            // Deimos (Mars)
            501: 5959.916,           // Io (Jupiter)
            502: 3202.739,           // Europa (Jupiter)
            503: 9887.834,           // Ganymede (Jupiter)
            504: 7179.289,           // Callisto (Jupiter)
            601: 2.503522,           // Mimas (Saturn)
            602: 7.20482,            // Enceladus (Saturn)
            603: 41.49,              // Tethys (Saturn)
            604: 73.12,              // Dione (Saturn)
            605: 154.0,              // Rhea (Saturn)
            606: 8978.13,            // Titan (Saturn)
            607: 1.20,               // Iapetus (Saturn)
            701: 5.69,               // Ariel (Uranus)
            702: 8.7,                // Umbriel (Uranus)
            703: 23.0,               // Titania (Uranus)
            704: 13.4,               // Oberon (Uranus)
            801: 1428.5,             // Triton (Neptune)
            901: 102.3,              // Charon (Pluto)
            
            // Dwarf planets and asteroids
            1: 62.65,                // Ceres
            134340: 869.6,           // Pluto (alternative ID)
            136108: 1.57,            // Haumea
            136199: 1.7,             // Eris
            136472: 0.8              // Makemake
        };
        
        return GM_VALUES[naifId] || null;
    }
    
    /**
     * Get GM by common name
     * @private
     */
    static _getGMByName(name) {
        const NAME_TO_NAIF = {
            'sun': 10,
            'mercury': 199,
            'venus': 299,
            'earth': 399,
            'mars': 499,
            'jupiter': 599,
            'saturn': 699,
            'uranus': 799,
            'neptune': 899,
            'pluto': 999,
            'moon': 301,
            'phobos': 401,
            'deimos': 402,
            'io': 501,
            'europa': 502,
            'ganymede': 503,
            'callisto': 504,
            'titan': 606,
            'triton': 801,
            'charon': 901,
            'ceres': 1,
            'haumea': 136108,
            'eris': 136199,
            'makemake': 136472
        };
        
        const naifId = NAME_TO_NAIF[name];
        return naifId ? this._getGMByNaifId(naifId) : null;
    }
    
    /**
     * Calculate GM from mass using consistent G constant
     * @param {number} mass - Mass in kg
     * @returns {number} GM in km³/s²
     */
    static calculateGM(mass) {
        return Constants.G * mass;
    }
    
    /**
     * Get mass from GM using consistent G constant
     * @param {number} gm - Gravitational parameter in km³/s²
     * @returns {number} Mass in kg
     */
    static getMassFromGM(gm) {
        return gm / Constants.G;
    }
    
    /**
     * Get all available NAIF IDs with GM values
     * @returns {number[]} Array of NAIF IDs
     */
    static getAvailableNaifIds() {
        return Object.keys(this._getGMByNaifId(0) || {}).map(Number);
    }
    
    /**
     * Check if a body has a known GM value
     * @param {number|string|Object} bodyIdentifier - Body identifier
     * @returns {boolean} True if GM is known
     */
    static hasGravitationalParameter(bodyIdentifier) {
        return this.getGravitationalParameter(bodyIdentifier) !== null;
    }
    
    /**
     * Get physical constants commonly used in orbital mechanics
     */
    static get ORBITAL_MECHANICS() {
        return {
            // Gravitational constant
            G: Constants.G,
            
            // Common reference values
            EARTH_RADIUS: 6371.0,           // km
            EARTH_GM: 398600.4415,          // km³/s²
            EARTH_J2: 0.00108263,           // Oblateness coefficient
            EARTH_SIDEREAL_DAY: 86164.0905, // seconds
            
            MOON_RADIUS: 1737.4,            // km
            MOON_GM: 4902.800066,           // km³/s²
            
            SUN_RADIUS: 695700,             // km
            SUN_GM: 132712440041.93938,     // km³/s²
            
            // Useful conversion factors
            AU: 149597870.7,                // km (Astronomical Unit)
            PARSEC: 3.0857e13,              // km
            LIGHT_YEAR: 9.4607e12,          // km
            
            // Time constants
            JULIAN_CENTURY: 36525,          // days
            J2000_EPOCH: 2451545.0,         // Julian Day Number
            
            // Angular conversions
            DEG_TO_RAD: Math.PI / 180,
            RAD_TO_DEG: 180 / Math.PI,
            HOURS_TO_RAD: Math.PI / 12,     // For right ascension
            
            // Velocity scales
            EARTH_ESCAPE_VELOCITY: 11.186,  // km/s
            SOLAR_ESCAPE_VELOCITY: 617.5    // km/s at Earth's orbit
        };
    }
    
    /**
     * Get atmospheric constants for common bodies
     */
    static get ATMOSPHERIC_CONSTANTS() {
        return {
            EARTH: {
                SEA_LEVEL_DENSITY: 1.225,      // kg/m³
                SCALE_HEIGHT: 8.5,             // km
                ATMOSPHERIC_RADIUS: 100,        // km (approximate)
                MEAN_MOLECULAR_MASS: 0.029,     // kg/mol
                SURFACE_PRESSURE: 101325        // Pa
            },
            MARS: {
                SEA_LEVEL_DENSITY: 0.020,      // kg/m³
                SCALE_HEIGHT: 11.1,            // km
                ATMOSPHERIC_RADIUS: 80,         // km
                MEAN_MOLECULAR_MASS: 0.043,     // kg/mol (mostly CO2)
                SURFACE_PRESSURE: 610           // Pa
            },
            VENUS: {
                SEA_LEVEL_DENSITY: 67.0,       // kg/m³
                SCALE_HEIGHT: 15.9,            // km
                ATMOSPHERIC_RADIUS: 250,        // km
                MEAN_MOLECULAR_MASS: 0.043,     // kg/mol (CO2)
                SURFACE_PRESSURE: 9200000       // Pa
            },
            TITAN: {
                SEA_LEVEL_DENSITY: 5.3,        // kg/m³
                SCALE_HEIGHT: 19.7,            // km
                ATMOSPHERIC_RADIUS: 200,        // km
                MEAN_MOLECULAR_MASS: 0.028,     // kg/mol (N2)
                SURFACE_PRESSURE: 146700        // Pa
            }
        };
    }
}