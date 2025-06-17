/**
 * Sun Configuration
 * 
 * Physical, orbital, and rendering properties for the Sun
 */

// Sun physical constants - authoritative NASA/JPL values
const sunMass = 1.9885e30; // kg
const sunRadius = 695700; // km
const sunGM = 132712440041.93938; // km³/s² - NASA/JPL authoritative value

export default {
    // Basic identification
    name: 'sun',
    naif_id: 10,
    astronomyEngineName: 'Sun',
    parent: 'ss_barycenter',
    type: 'star',
    symbol: '☉',

    // Physical properties
    mass: sunMass, // kg
    radius: sunRadius, // km
    GM: sunGM, // km³/s² - Standard gravitational parameter
    
    // Rotation properties
    rotationPeriod: 25.05 * 24 * 3600, // seconds (25.05 days at equator)
    rotationRate: 2 * Math.PI / (25.05 * 24 * 3600), // rad/s - angular velocity
    oblateness: 9e-6, // Very small oblateness
    tilt: 7.25, // degrees - inclination to ecliptic
    
    // Orbital properties
    soiRadius: 1e12, // km - Effectively infinite within the solar system
    hillSphere: 1e12, // km - The Sun dominates the entire solar system
    orbitalPeriod: Infinity, // The Sun doesn't orbit anything in our solar system
    semiMajorAxis: 0, // km

    // Orbital mechanics constants for position calculations
    orbitalConstants: {
        // Mean anomaly coefficients (degrees)
        meanAnomalyBase: 357.5291, // degrees at epoch
        meanAnomalyRate: 0.98560028, // degrees per day
        
        // Mean longitude coefficients (degrees)
        meanLongitudeBase: 280.4665, // degrees at epoch
        meanLongitudeRate: 0.98564736, // degrees per day
        
        // Orbital eccentricity
        eccentricity: 0.0167,
        
        // Equation of center coefficients (for accurate position)
        equationOfCenter: {
            c1: 1.9148, // first order coefficient
            c2: 0.0200, // second order coefficient  
            c3: 0.0003  // third order coefficient
        },
        
        // Additional orbital mechanics constants
        greenwich: {
            base: 280.46061837, // degrees - Greenwich hour angle at J2000
            rate: 360.98564736629, // degrees per day
            t2Coefficient: 0.000387933, // T² coefficient
            t3Coefficient: 1.0 / 38710000 // T³ coefficient
        }
    },

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'emissive',
            color: 0xffffff,
            emissive: 0xffff00,
            emissiveIntensity: 1.0,
            params: {
                roughness: 1.0,
                metalness: 0.0
            }
        }
    },

    // Lens flare configuration for visual effects
    lensFlare: {
        // Reference distance for scaling lens flare size (1 AU - Earth's orbital radius)
        referenceDistance: 149597870.7, // km (1 AU)
        
        // Lens flare element specifications
        elements: [
            { 
                url: '/assets/texture/lensflare/lensflare0.png', 
                size: 700, 
                distance: 0.0,
                description: 'Main flare'
            },
            { 
                url: '/assets/texture/lensflare/lensflare2.png', 
                size: 512, 
                distance: 0.6,
                description: 'Secondary flare'
            },
            { 
                url: '/assets/texture/lensflare/lensflare3.png', 
                size: 60, 
                distance: 0.7,
                description: 'Small streak 1'
            },
            { 
                url: '/assets/texture/lensflare/lensflare3.png', 
                size: 70, 
                distance: 0.9,
                description: 'Small streak 2'
            },
            { 
                url: '/assets/texture/lensflare/lensflare3.png', 
                size: 120, 
                distance: 1.0,
                description: 'Small streak 3'
            }
        ],
        
        // Scaling parameters
        scaling: {
            minScale: 0.05,      // Minimum scale factor
            maxScale: 10.0,      // Maximum scale factor
            minDistance: 2       // Minimum distance as multiple of Sun radius
        }
    },

    // Lighting (Sun is the primary light source)
    addLight: true,
    lightOptions: {
        type: 'directional',
        color: 0xffffff,
        intensity: 3.0,
        castShadow: true,
        helper: false
    },

    // LOD levels for rendering optimization
    lodLevelsKey: 'default',

    // Solar atmosphere/corona properties
    atmosphere: {
        type: 'corona',
        thickness: 2000, // km - visible corona extent
        temperature: 1e6, // K - corona temperature
        density: 1e-12, // kg/m³ - corona density
        emissiveIntensity: 0.1
    },

    // Radial grid configuration for visualization
    radialGridConfig: {
        circles: [
            { radius: 695_700, label: 'Photosphere', style: 'major' },
            { radius: 695_700 * 1.5, label: 'Corona', style: 'minor' },
            { radius: 0.1 * 149597870.7, label: '0.1 AU', style: 'dashed' },
            { radius: 0.3 * 149597870.7, label: '0.3 AU', style: 'dashed' },
            { radius: 1.0 * 149597870.7, label: '1 AU (Earth)', style: 'major' },
            { radius: 5.2 * 149597870.7, label: '5.2 AU (Jupiter)', style: 'major' }
        ],
        markerStep: 50_000_000, // 50,000 km
        labelMarkerStep: 100_000_000, // 100,000 km
        radialLines: { count: 24 }
    },

    // Physics properties
    physics: {
        gravitationalInfluence: 'dominant', // Primary gravitational body
        stellarWind: {
            velocity: 400, // km/s - typical solar wind speed
            density: 5e6, // particles/m³ - proton density at 1 AU
            magneticField: 5e-9 // T - interplanetary magnetic field
        },
        solarCycle: {
            period: 11 * 365.25 * 24 * 3600, // seconds (11 years)
            currentPhase: 0 // 0-1, where 0 is solar minimum, 0.5 is solar maximum
        }
    },

    // Astronomical properties
    astronomy: {
        spectralClass: 'G2V',
        luminosity: 3.828e26, // W
        surfaceTemperature: 5778, // K
        age: 4.6e9 * 365.25 * 24 * 3600, // seconds (4.6 billion years)
        metallicity: 0.0122 // Z - fraction of mass in elements heavier than helium
    },

    // Rotational properties
    poleRA: 286.13, // deg at J2000.0, +0.0*T per century
    poleDec: 63.87, // deg at J2000.0, +0.0*T per century
    spin: 286.13, // deg at J2000.0
    spinRate: 0.00001990986, // deg/day (retrograde)
    orientationEpoch: 2451545.0, // JD (J2000.0)

    // Atmospheric model for drag calculations (corona and solar wind)
    atmosphericModel: {
        maxAltitude: 1000000, // km - Solar corona extends millions of km
        minAltitude: 0,
        referenceAltitude: 10000, // km - above photosphere
        referenceDensity: 1e-12, // kg/m³ at 10000km (very tenuous corona)
        scaleHeight: 50000, // km - large scale height for corona
        getDensity: function(altitude) {
            // Solar corona and solar wind - very tenuous but extended
            if (altitude > this.maxAltitude) return 0;
            // Corona density decreases more slowly than planetary atmospheres
            return this.referenceDensity * Math.exp(-(altitude - this.referenceAltitude) / this.scaleHeight);
        }
    },

    // Surface and atmospheric properties
}; 