import {Constants} from '../../../utils/Constants.js';

const erisMass = 1.66e22; // kg
const erisRadius = 1163; // km
const erisGM = Constants.G * erisMass; // km³/s²

export default {
    // Basic identification
    name: 'eris',
    naif_id: 136199, // Official NAIF ID for Eris
    astronomyEngineName: 'Eris', // Note: May not be in astronomy-engine
    parent: 'eris_barycenter',
    type: 'dwarf_planet',
    symbol: '⯰',

    // Physical properties
    mass: erisMass, // kg (slightly more massive than Pluto)
    radius: erisRadius, // km mean radius
    GM: erisGM, // km³/s²
    isDwarf: true, // Dwarf planet

    // Shape properties
    oblateness: 0.0, // Assumed spherical
    equatorialRadius: 1163, // km
    polarRadius: 1163, // km

    // Rotation properties
    rotationPeriod: 93240, // seconds (25.9 hours)
    tilt: 78.3, // degrees - significant axial tilt

    // Orbital properties
    soiRadius: 580000, // km (estimated)
    orbitalPeriod: 203830 * 24 * 3600, // seconds (558 years!)
    
    // Eris has one moon (Dysnomia) but barycenter is very close to Eris center
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
        albedo: 0.96, // Extremely high albedo - very bright
        iceContent: 0.9, // Mostly methane ice
        rockContent: 0.1,
        surfaceComposition: {
            methaneIce: 0.8,
            nitrogenIce: 0.1,
            waterIce: 0.1
        }
    },

    // Internal structure
    structure: {
        coreRadius: 700, // km - rocky core (estimated)
        mantleThickness: 463, // km - icy mantle
        differentiated: true
    },

    // Orientation (estimated - not well known)
    poleRA: 0.0, // deg at J2000.0 (unknown)
    poleDec: 90.0, // deg at J2000.0 (unknown)
    spin: 0.0, // deg at J2000.0
    spinRate: 360.0 / 1.08, // deg/day (25.9 hour rotation)
    orientationEpoch: 2451545.0, // JD (J2000.0)

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'erisTexture',
            params: {
                roughness: 0.3, // Very smooth, icy surface
                metalness: 0.0
            }
        }
    },

    // LOD levels
    lodLevelsKey: 'default'
};