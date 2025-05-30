import {Constants} from '../../../utils/Constants.js';

const saturnMass = 5.683e26; // kg
const saturnRadius = 58232; // km
const saturnGM = Constants.G * saturnMass; // km³/s²

export default {
    // Basic identification
    name: 'saturn',
    naif_id: 699,
    astronomyEngineName: 'Saturn',
    parent: 'saturn_barycenter',
    type: 'planet',
    symbol: '♄',

    // Physical properties
    mass: saturnMass, // kg
    radius: saturnRadius, // km - equatorial radius at 1 bar
    GM: saturnGM, // km³/s²
    j2: 1.62907e-2, // J2 gravitational coefficient

    // Shape properties (most oblate planet)
    oblateness: 0.09796,
    equatorialRadius: 60268, // km
    polarRadius: 54364, // km

    // Rotation properties
    rotationPeriod: 38362, // seconds (10h 39m 22s - System III)
    tilt: 26.73, // degrees - axial tilt

    // Orbital properties
    soiRadius: 65500000, // km - Sphere of Influence radius
    orbitalPeriod: 29.457 * 365.25 * 86400, // seconds (29.457 Earth years)
    // Saturn orbital elements (J2000, VSOP87, IAU 2025, NASA Horizons)
    // Source: NASA Horizons, JPL, IAU 2023/2025, VSOP87, https://ssd.jpl.nasa.gov/horizons/
    orbitalElements: {
        semiMajorAxis: 1429400000, // km (9.53707032 AU)
        eccentricity: 0.055723219,
        inclination: 2.485240, // deg to ecliptic J2000
        longitudeOfAscendingNode: 113.662424, // deg
        argumentOfPeriapsis: 339.392263, // deg
        meanAnomalyAtEpoch: 317.020705, // deg at J2000.0 (JD 2451545.0)
        epoch: 2451545.0, // J2000.0
        referenceFrame: 'ECLIPJ2000'
    },

    // Atmospheric properties
    atmosphere: {
        limbFudgeFactor: 1.0,
        hazeIntensity: 2,
        scaleHeightMultiplier: 5.0,
        thickness: 100, // km (effective visual thickness)
        densityScaleHeight: 59.5, // km
        rayleighScaleHeight: 50, // km
        mieScaleHeight: 100, // km (hazes)
        rayleighScatteringCoeff: [0.002, 0.003, 0.006], // Pale yellow
        mieScatteringCoeff: 0.05,
        mieAnisotropy: 0.6,
        numLightSteps: 3,
        sunIntensity: 3,
        equatorialRadius: 60268,
        polarRadius: 54364,
        composition: {
            hydrogen: 0.963, // mole fraction
            helium: 0.0325,
            methane: 0.0045,
            ammonia: 0.0001
        }
    },

    // Ring system properties
    addRings: true,
    rings: {
        textureKey: 'saturnRingsTexture', // Texture for rings
        innerRadius: 66900,     // km - D Ring inner edge (approx)
        outerRadius: 140180,    // km - A Ring outer edge (main bright rings)
        // More detailed ring data can be added:
        // Main rings: C, B, A
        // Fainter rings: D, G, E, Phoebe ring
        // Cassini Division: 117580 to 122170 km
        segments: 128, // Number of segments for ring geometry
        opacity: 0.8,
        tilt: 26.73 // degrees, same as planet's axial tilt
    },

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'saturnTexture',
            params: {
                roughness: 0.95, // Gas giant, not a solid surface
                metalness: 0.0,
            }
        },
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xfff8e7, // Pale yellow
        intensity: 58232 * 3, // Adjusted for appearance
        helper: false
    },

    // LOD levels
    lodLevelsKey: 'default',

    // Radial grid configuration
    radialGridConfig: {
        markerStep: 2000000, // 2,000,000 km
        labelMarkerStep: 10000000, // 10,000,000 km
        circles: [
            { radius: 140180, label: 'A Ring Outer', style: 'dashed' },
            { radius: 500000, label: 'Rhea Orbit', style: 'dashed' },
            { radius: 1221870, label: 'Titan Orbit', style: 'dashed-major' },
            { radius: 3560000, label: 'Iapetus Orbit', style: 'dashed' },
            { radius: 10000000, label: '10,000,000 km', style: 'minor' },
            { radius: 30000000, label: '30,000,000 km', style: 'minor' },
            { radius: 65500000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
        ],
        radialLines: { count: 22 },
    },

    // Magnetic field
    magnetosphere: {
        dipoleMoment: 4.6e25, // A⋅m²
        tilt: 0, // degrees - closely aligned with rotation axis
        standoffDistance: 20 * 60268, // km - magnetopause distance
    },

    // Orientation (IAU 2023/2025)
    poleRA: 40.589, // deg at J2000.0, -0.036*T per century
    poleDec: 83.537, // deg at J2000.0, -0.004*T per century
    spin: 38.90, // deg at J2000.0
    spinRate: 810.7939024, // deg/day
    orientationEpoch: 2451545.0, // JD (J2000.0)
}; 