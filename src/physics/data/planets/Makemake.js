import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const makemakeMass = 3.1e21; // kg
const makemakeRadius = 715; // km
const makemakeGM = PhysicsConstants.PHYSICS.G * makemakeMass; // km³/s²

export default {
    // Basic identification
    name: 'makemake',
    naif_id: 136472, // Official NAIF ID for Makemake
    astronomyEngineName: 'Makemake', // Note: May not be in astronomy-engine
    parent: 'makemake_barycenter',
    type: 'dwarf_planet',
    symbol: '🝼',

    // Physical properties
    mass: makemakeMass, // kg (estimated)
    radius: makemakeRadius, // km mean radius
    GM: makemakeGM, // km³/s²
    isDwarf: true, // Dwarf planet

    // Shape properties
    oblateness: 0.05, // Slightly oblate
    equatorialRadius: 751, // km
    polarRadius: 678, // km

    // Rotation properties
    rotationPeriod: 82080, // seconds (22.83 hours)
    tilt: 29.0, // degrees (estimated)

    // Orbital properties
    soiRadius: 100000, // km (estimated)
    orbitalPeriod: 112897 * 24 * 3600, // seconds (309 years)
    
    // Makemake has one small moon (S/2015 (136472) 1) but barycenter is at Makemake center
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
        albedo: 0.81, // Very high albedo
        iceContent: 0.85, // Mostly methane and ethane ice
        rockContent: 0.15,
        surfaceComposition: {
            methaneIce: 0.7,
            ethaneIce: 0.15,
            nitrogenIce: 0.05,
            waterIce: 0.1
        },
        color: 'reddish' // Slightly reddish due to tholins
    },

    // Internal structure (estimated)
    structure: {
        coreRadius: 400, // km - rocky core
        mantleThickness: 315, // km - icy mantle
        differentiated: true
    },

    // Orientation (not well known)
    poleRA: 0.0, // deg at J2000.0 (unknown)
    poleDec: 90.0, // deg at J2000.0 (unknown)
    spin: 0.0, // deg at J2000.0
    spinRate: 360.0 / 0.9511, // deg/day (22.83 hour rotation)
    orientationEpoch: 2451545.0, // JD (J2000.0)

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'makemakeTexture',
            params: {
                roughness: 0.3, // Smooth icy surface
                metalness: 0.0,
                color: 0xFFCCBB // Slight reddish tint
            }
        }
    },

    // LOD levels
    lodLevelsKey: 'default'
};