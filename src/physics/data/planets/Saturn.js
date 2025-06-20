import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const saturnMass = 5.683e26; // kg
const saturnRadius = 58232; // km
const saturnGM = PhysicsConstants.PHYSICS.G * saturnMass; // km³/s²

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
    soiRadius: 54800000, // km - Sphere of Influence radius
    orbitalPeriod: 29.5 * 365.25 * 86400, // seconds (29.5 Earth years)
    semiMajorAxis: 1.434e9, // km (9.58 AU)

    // Atmospheric model for drag calculations
    atmosphericModel: {
        maxAltitude: 4000, // km - Saturn's extensive atmosphere and thermosphere
        minAltitude: 0,
        referenceAltitude: 100, // km - above 1-bar level
        referenceDensity: 0.09, // kg/m³ at 100km (less dense than Jupiter)
        scaleHeight: 30, // km - Saturn scale height
        getDensity: function(altitude) {
            // Custom density model for Saturn's atmosphere
            if (altitude > this.maxAltitude) return 0;
            return this.referenceDensity * Math.exp(-(altitude - this.referenceAltitude) / this.scaleHeight);
        }
    },

    // Atmospheric properties (dense H2/He atmosphere)
    atmosphere: {
        limbFudgeFactor: 1.0,
        hazeIntensity: 2,
        scaleHeightMultiplier: 1.0,
        thickness: 200, // km (effective visual thickness)
        densityScaleHeight: 50.5, // km
        rayleighScaleHeight: 100, // km
        mieScaleHeight: 2, // km (hazes)
        rayleighScatteringCoeff: [0.02, 0.03, 0.06], // Pale yellow
        mieScatteringCoeff: 0.005,
        mieAnisotropy: 10.6,
        numLightSteps: 1,
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