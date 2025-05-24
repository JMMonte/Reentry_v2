/**
 * Sun Configuration
 * 
 * Physical, orbital, and rendering properties for the Sun
 */

export default {
    // Basic identification
    name: 'sun',
    naif_id: 10,
    astronomyEngineName: 'Sun',
    parent: 'ss_barycenter',
    type: 'star',
    symbol: '☉',

    // Physical properties
    mass: 1.989e30, // kg
    radius: 695_700, // km
    GM: 1.32712442018e11, // km³/s² - Standard gravitational parameter
    
    // Rotation properties
    rotationPeriod: 25.05 * 24 * 3600, // seconds (25.05 days at equator)
    oblateness: 9e-6, // Very small oblateness
    tilt: 7.25, // degrees - inclination to ecliptic

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
    }
}; 