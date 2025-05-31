/**
 * PhysicsConstants.js
 * 
 * Centralized GENERIC physics constants for simulation thresholds, validation limits,
 * numerical method tolerances, and unit conversions.
 * 
 * IMPORTANT: This file contains NO hardcoded planetary data. All celestial body
 * properties must be data-driven from the planetary configuration files.
 * 
 * Contains only:
 * - Simulation parameters (timesteps, thresholds)
 * - Validation limits (velocity/position bounds) 
 * - Generic atmospheric modeling constants
 * - Numerical method tolerances
 * - Mathematical constants and unit conversions
 * - Default satellite properties
 */

export class PhysicsConstants {
    // ========== FUNDAMENTAL PHYSICS CONSTANTS ==========
    
    /**
     * Core physical constants for orbital mechanics
     */
    static PHYSICS = {
        G: 6.67430e-20,                    // Gravitational constant in km³ kg⁻¹ s⁻² (for orbital mechanics)
        AU: 1.495978707e8,                 // Astronomical unit in km
        J2000_EPOCH: 2451545.0,            // Julian date of J2000 epoch
        C: 299792458,                      // Speed of light in m/s
        STEFAN_BOLTZMANN: 5.670374419e-8,  // Stefan-Boltzmann constant in W⋅m⁻²⋅K⁻⁴
    };

    // ========== TIME CONSTANTS ==========
    
    /**
     * Time conversion constants
     */
    static TIME = {
        MILLISECONDS_IN_DAY: 86400000,     // ms
        SECONDS_IN_DAY: 86400,             // s
        SECONDS_IN_YEAR: 31556952,         // s (365.25 days)
        SECONDS_IN_HOUR: 3600,             // s
        SECONDS_IN_MINUTE: 60,             // s
        DAYS_IN_YEAR: 365.25,              // days
        SIDEREAL_DAY: 86164,               // s - Earth sidereal day
        SIDEREAL_YEAR: 31558149,           // s - sidereal year
    };
    // ========== SIMULATION PARAMETERS ==========
    
    /**
     * Time step and simulation timing constants
     */
    static SIMULATION = {
        DEFAULT_TIME_STEP: 0.0167,        // 1/60 second for proper integration
        LARGE_TIME_STEP_WARNING: 10.0,    // seconds - warn if timestep exceeds this
        MAX_TIME_STEP: 100.0,             // seconds - absolute maximum timestep
        
        // Update intervals
        PHYSICS_UPDATE_RATE: 60,          // Hz
        LOG_THROTTLE_INTERVAL: 10000,     // ms
        SYNC_LOG_INTERVAL: 5000,          // ms
        MILLISECONDS_TO_SECONDS: 1000,
    };

    // ========== VALIDATION THRESHOLDS ==========
    
    /**
     * Velocity validation limits for different reference frames
     */
    static VELOCITY_LIMITS = {
        HELIOCENTRIC_MAX: 620,            // km/s - Mercury perihelion ~59 km/s + margin
        PLANETARY_MAX: 50,                // km/s - Escape velocity from major planets
        SATELLITE_MAX: 15,                // km/s - Typical satellite velocities
        ZERO_THRESHOLD: 1e-12,            // km/s - Consider zero below this
    };

    /**
     * Position validation limits for different contexts
     */
    static POSITION_LIMITS = {
        HELIOCENTRIC_MAX: 1e10,           // km - Beyond Neptune orbit
        PLANETARY_MAX: 1e8,               // km - Planetary system boundaries
        SATELLITE_MAX: 1e6,               // km - Satellite operation ranges
        ZERO_THRESHOLD: 1e-6,             // km - Consider zero below this
    };

    // ========== SPHERE OF INFLUENCE DETECTION ==========
    
    /**
     * SOI detection thresholds (body-agnostic)
     */
    static SOI_THRESHOLDS = {
        // Generic thresholds by body type as fraction of actual SOI radius
        PLANET_MIN_FACTOR: 0.001,         // Fraction of SOI radius for detection
        MOON_MIN_FACTOR: 0.01,            // Fraction of SOI radius for detection
        STAR_MIN_FACTOR: 0.0001,          // Fraction of SOI radius for detection
        
        // Absolute minimums (km) when SOI is very small
        ABSOLUTE_MIN_PLANET: 1000,        // km - Minimum detection threshold for planets
        ABSOLUTE_MIN_MOON: 100,           // km - Minimum detection threshold for moons
        ABSOLUTE_MIN_STAR: 10000,         // km - Minimum detection threshold for stars
    };

    // ========== ATMOSPHERIC CONSTANTS ==========
    
    /**
     * Generic atmospheric modeling constants (body-agnostic)
     */
    static ATMOSPHERIC = {
        DEFAULT_BALLISTIC_COEFFICIENT: 50,    // kg/m² - Typical satellite
        DEFAULT_THICKNESS: 100,               // km - Fallback atmosphere thickness
        DEFAULT_SURFACE_GRAVITY: 0.00981,     // km/s² - For atmospheric calculations
        
        // Unit conversions
        KG_M2_TO_KG_KM2: 1e6,               // Convert ballistic coefficient units
        M2_TO_KM2: 1e-6,                     // Convert m² to km²
        
        // Generic atmospheric model parameters
        DEFAULT_SCALE_HEIGHT: 10,             // km - Fallback scale height
        MIN_DENSITY_THRESHOLD: 1e-15,        // kg/m³ - Consider zero below this
        MAX_ALTITUDE_FACTOR: 10,             // Scale heights above surface to cut off atmosphere
    };

    // ========== NUMERICAL METHOD CONSTANTS ==========
    
    /**
     * Tolerances and parameters for numerical methods
     */
    static NUMERICAL = {
        // Integration tolerances
        KEPLER_TOLERANCE: 1e-6,              // Kepler equation convergence
        INTEGRATION_ABS_TOL: 1e-6,           // Absolute tolerance for integrators
        INTEGRATION_REL_TOL: 1e-6,           // Relative tolerance for integrators
        MIN_INTEGRATION_STEP: 1e-6,          // Minimum step size for adaptive methods
        
        // Physical constants for calculations
        PRECESSION_CONSTANT: 38710000,       // Precession calculation factor
        
        // Convergence criteria
        MAX_ITERATIONS: 100,                 // Maximum iterations for iterative methods
        CONVERGENCE_TOLERANCE: 1e-12,        // General convergence criterion
        
        // RK45 Butcher tableau coefficients (for performance)
        RK45_A: [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84],
        RK45_B: [5179/57600, 0, 7571/16695, 393/640, -92097/339200, 187/2100, 1/40],
        RK45_C: [0, 1/4, 3/8, 12/13, 1, 1/2],
    };

    // ========== DEFAULT SATELLITE PROPERTIES ==========
    
    /**
     * Default properties for satellite objects
     */
    static SATELLITE_DEFAULTS = {
        MASS: 1000,                          // kg - Typical small satellite
        CROSS_SECTIONAL_AREA: 2,             // m² - Typical satellite area
        DRAG_COEFFICIENT: 2.2,               // Dimensionless - Typical Cd for satellites
        BALLISTIC_COEFFICIENT: 50,           // kg/m² - mass/area ratio
        RADIUS: 1,                           // m - For visualization
        
        // Maneuver defaults
        MIN_BURN_TIME: 0.1,                  // seconds
        MAX_BURN_TIME: 3600,                 // seconds (1 hour)
        MIN_DELTA_V: 0.001,                  // km/s
        MAX_DELTA_V: 20,                     // km/s
    };

    // ========== MATHEMATICAL CONSTANTS ==========
    
    /**
     * Mathematical and unit conversion constants
     */
    static MATH = {
        // Angular conversions
        DEG_TO_RAD: Math.PI / 180,
        RAD_TO_DEG: 180 / Math.PI,
        HOURS_TO_RAD: Math.PI / 12,          // For right ascension conversion
        
        // Common mathematical constants
        TWO_PI: 2 * Math.PI,
        HALF_PI: Math.PI / 2,
    };

    // ========== UTILITY METHODS ==========
    
    /**
     * Check if a velocity is within realistic bounds for its context
     * @param {number} velocity - Velocity magnitude in km/s
     * @param {string} context - 'heliocentric', 'planetary', or 'satellite'
     * @returns {boolean} True if velocity is realistic
     */
    static isValidVelocity(velocity, context = 'planetary') {
        const limits = this.VELOCITY_LIMITS;
        switch (context.toLowerCase()) {
            case 'heliocentric':
                return velocity >= 0 && velocity <= limits.HELIOCENTRIC_MAX;
            case 'planetary':
                return velocity >= 0 && velocity <= limits.PLANETARY_MAX;
            case 'satellite':
                return velocity >= 0 && velocity <= limits.SATELLITE_MAX;
            default:
                return velocity >= 0 && velocity <= limits.PLANETARY_MAX;
        }
    }

    /**
     * Check if a position is within realistic bounds for its context
     * @param {number} position - Position magnitude in km
     * @param {string} context - 'heliocentric', 'planetary', or 'satellite'
     * @returns {boolean} True if position is realistic
     */
    static isValidPosition(position, context = 'planetary') {
        const limits = this.POSITION_LIMITS;
        switch (context.toLowerCase()) {
            case 'heliocentric':
                return position >= 0 && position <= limits.HELIOCENTRIC_MAX;
            case 'planetary':
                return position >= 0 && position <= limits.PLANETARY_MAX;
            case 'satellite':
                return position >= 0 && position <= limits.SATELLITE_MAX;
            default:
                return position >= 0 && position <= limits.PLANETARY_MAX;
        }
    }

    /**
     * Get default atmospheric thickness when no data available
     * @returns {number} Default atmospheric thickness in km
     */
    static getDefaultAtmosphereThickness() {
        return this.ATMOSPHERIC.DEFAULT_THICKNESS;
    }

    /**
     * Get SOI threshold for a body type (data-driven)
     * @param {string} bodyType - 'planet', 'moon', 'star', etc.
     * @param {number} soiRadius - Actual SOI radius in km
     * @returns {number} Detection threshold in km
     */
    static getSOIThreshold(bodyType, soiRadius) {
        const thresholds = this.SOI_THRESHOLDS;
        
        let factor, absoluteMin;
        switch (bodyType.toLowerCase()) {
            case 'moon':
                factor = thresholds.MOON_MIN_FACTOR;
                absoluteMin = thresholds.ABSOLUTE_MIN_MOON;
                break;
            case 'star':
                factor = thresholds.STAR_MIN_FACTOR;
                absoluteMin = thresholds.ABSOLUTE_MIN_STAR;
                break;
            case 'planet':
            default:
                factor = thresholds.PLANET_MIN_FACTOR;
                absoluteMin = thresholds.ABSOLUTE_MIN_PLANET;
                break;
        }
        
        return Math.max(soiRadius * factor, absoluteMin);
    }
}

export default PhysicsConstants;