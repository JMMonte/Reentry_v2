import {Constants} from '../../../utils/Constants.js';

const ceresMass = 9.3835e20; // kg
const ceresRadius = 469.73; // km
const ceresGM = Constants.G * ceresMass; // km³/s²

export default {
    // Basic identification
    name: 'ceres',
    naif_id: 2000001,  // Using 2000000+ range to avoid conflict with Mercury Barycenter
    astronomyEngineName: 'Ceres', // Note: May not be in astronomy-engine
    parent: 'ceres_barycenter',
    type: 'dwarf_planet',
    symbol: '⚳',

    // Physical properties
    mass: ceresMass, // kg
    radius: ceresRadius, // km mean radius
    GM: ceresGM, // km³/s²
    isDwarf: true, // Dwarf planet

    // Shape properties
    oblateness: 0.076, // Slightly oblate
    equatorialRadius: 487.0, // km
    polarRadius: 455.0, // km

    // Rotation properties
    rotationPeriod: 32667, // seconds (9.074 hours)
    tilt: 4.0, // degrees - very small axial tilt

    // Orbital properties
    soiRadius: 1500, // km (estimated)
    orbitalPeriod: 1680.5 * 24 * 3600, // seconds (4.60 years)
    
    // Ceres orbits alone (no significant moons), so it's at barycenter center
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
        albedo: 0.09, // Low albedo, dark surface
        iceContent: 0.25, // Significant water ice
        rockContent: 0.75,
        craterDensity: 'high'
    },

    // Internal structure
    structure: {
        coreRadius: 280, // km - rocky core
        mantleThickness: 190, // km - icy mantle
        differentiated: true,
        possibleSubsurfaceOcean: true,
        oceanDepth: 100 // km - if present
    },

    // Orientation (IAU values)
    poleRA: 291.418, // deg at J2000.0
    poleDec: 66.764, // deg at J2000.0
    spin: 170.650, // deg at J2000.0
    spinRate: 952.1532, // deg/day
    orientationEpoch: 2451545.0, // JD (J2000.0)

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'ceresTexture',
            params: {
                roughness: 0.9,
                metalness: 0.0
            }
        }
    },

    // LOD levels
    lodLevelsKey: 'default'
};