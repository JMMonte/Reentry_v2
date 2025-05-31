import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const haumeaMass = 4.006e21; // kg
const haumeaRadius = 816; // km
const haumeaGM = PhysicsConstants.PHYSICS.G * haumeaMass; // km³/s²

export default {
    // Basic identification
    name: 'haumea',
    naif_id: 136108, // Official NAIF ID for Haumea
    astronomyEngineName: 'Haumea', // Note: May not be in astronomy-engine
    parent: 'haumea_barycenter',
    type: 'dwarf_planet',
    symbol: '🝻',

    // Physical properties
    mass: haumeaMass, // kg
    radius: haumeaRadius, // km mean radius (highly elongated!)
    GM: haumeaGM, // km³/s²
    isDwarf: true, // Dwarf planet

    // Shape properties - Haumea is extremely elongated due to rapid rotation
    oblateness: 0.513, // EXTREME elongation!
    equatorialRadius: 1050, // km (long axis)
    polarRadius: 513, // km (short axis)
    dimensions: [2322, 1704, 1026], // km (triaxial ellipsoid)

    // Rotation properties
    rotationPeriod: 14256, // seconds (3.96 hours - one of the fastest in the solar system!)
    tilt: 126.0, // degrees (retrograde rotation)

    // Orbital properties
    soiRadius: 150000, // km (estimated)
    orbitalPeriod: 103468 * 24 * 3600, // seconds (283 years)
    
    // Haumea has two small moons but barycenter is essentially at Haumea center
    orbitalElements: {
        semiMajorAxis: 0.0, // km - at barycenter center
        eccentricity: 0.0,
        inclination: 0.0,
        longitudeOfAscendingNode: 0.0,
        argumentOfPeriapsis: 0.0,
        meanAnomalyAtEpoch: 0.0,
        epoch: 2451545.0 // J2000.0
    },

    // Surface properties
    surface: {
        albedo: 0.804, // High albedo
        iceContent: 0.9, // Almost pure water ice
        rockContent: 0.1,
        surfaceComposition: {
            waterIce: 0.95,
            organics: 0.05
        },
        crystallineIce: true // Surface is crystalline water ice
    },

    // Ring system!
    rings: {
        innerRadius: 2287, // km
        outerRadius: 2322, // km
        thickness: 0.07, // km (70 meters)
        opacity: 0.5,
        particleSize: 'centimeter-scale'
    },

    // Internal structure
    structure: {
        coreRadius: 500, // km - rocky core (estimated)
        mantleThickness: 316, // km - icy mantle
        differentiated: true,
        homogeneous: false // Likely differentiated
    },

    // Orientation
    poleRA: 284.0, // deg at J2000.0
    poleDec: 13.0, // deg at J2000.0
    spin: 0.0, // deg at J2000.0
    spinRate: 2167.74, // deg/day (3.96 hour rotation - very fast!)
    orientationEpoch: 2451545.0, // JD (J2000.0)

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'haumeaTexture',
            params: {
                roughness: 0.3, // Very smooth crystalline ice
                metalness: 0.0
            }
        }
    },

    // Special rendering note: needs custom shape due to extreme elongation
    customShape: 'triaxial_ellipsoid',

    // LOD levels
    lodLevelsKey: 'default'
};