import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const neptuneMass = 1.024e26; // kg
const neptuneRadius = 24622; // km
const neptuneGM = PhysicsConstants.PHYSICS.G * neptuneMass; // km³/s²

export default {
    // Basic identification
    name: 'neptune',
    naif_id: 899,
    astronomyEngineName: 'Neptune',
    parent: 'neptune_barycenter',
    type: 'planet',
    symbol: '♆',

    // Physical properties
    mass: neptuneMass, // kg (corrected from 1.02413e26 for consistency with other sources if needed)
    radius: neptuneRadius, // km - equatorial radius at 1 bar
    GM: neptuneGM, // km³/s²
    j2: 3.411e-3, // J2 gravitational coefficient

    // Shape properties
    oblateness: 0.01708,
    equatorialRadius: 24764, // km
    polarRadius: 24341, // km

    // Rotation properties
    rotationPeriod: 57996, // seconds (16h 6m 36s)
    tilt: 28.32, // degrees - axial tilt

    // Orbital properties
    soiRadius: 86800000, // km - Sphere of Influence radius
    orbitalPeriod: 164.8 * 365.25 * 86400, // seconds (164.8 Earth years)
    semiMajorAxis: 4.515e9, // km (30.18 AU)

    // Atmospheric model for drag calculations
    atmosphericModel: {
        maxAltitude: 3000, // km - Neptune ice giant atmosphere extent
        minAltitude: 0,
        referenceAltitude: 50, // km - above 1-bar level
        referenceDensity: 0.045, // kg/m³ at 50km (ice giant atmosphere)
        scaleHeight: 20, // km - Neptune scale height
        getDensity: function(altitude) {
            // Custom density model for Neptune's ice giant atmosphere
            if (altitude > this.maxAltitude) return 0;
            return this.referenceDensity * Math.exp(-(altitude - this.referenceAltitude) / this.scaleHeight);
        }
    },

    // Atmospheric properties (H2/He with ices)
    atmosphere: {
        limbFudgeFactor: 1.0,
        hazeIntensity: 1.5,
        scaleHeightMultiplier: 3.5,
        thickness: 50, // km (effective visual thickness)
        densityScaleHeight: 19.7, // km
        rayleighScaleHeight: 20, // km
        mieScaleHeight: 4,  // km (methane ice clouds/haze)
        rayleighScatteringCoeff: [0.0005, 0.004, 0.012], // Deep blue
        mieScatteringCoeff: 0.003,
        mieAnisotropy: 0.4,
        numLightSteps: 2,
        sunIntensity: 5,
        equatorialRadius: 24764,
        polarRadius: 24341,
        composition: {
            hydrogen: 0.80, // mole fraction
            helium: 0.19,
            methane: 0.015 // Methane contributes to blue color
        },
        greatDarkSpot: true // Historically observed, variable feature
    },

    // Ring system (faint, dusty rings)
    addRings: true,
    rings: {
        textureKey: 'neptuneRingsTexture', // Generic or specific Neptune rings texture
        innerRadius: 53200,    // km (Galle Ring)
        outerRadius: 62930,    // km (Adams Ring)
        segments: 64,
        opacity: 0.2, // Very faint rings
        tilt: 28.32, // Aligned with equator
        arcs: true // Adams ring has prominent arcs (Liberté, Égalité, Fraternité, Courage)
    },

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'neptuneTexture',
            params: {
                roughness: 0.98, // Gas/ice giant
                metalness: 0.0,
            }
        },
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xadd8e6, // Light blue
        intensity: 24622 * 1.5, // Adjusted for appearance
        helper: false
    },

    // LOD levels
    lodLevelsKey: 'default',

    // Radial grid configuration
    radialGridConfig: {
        markerStep: 2000000, 
        labelMarkerStep: 10000000, 
        circles: [
            { radius: 62930, label: 'Adams Ring Outer', style: 'dashed' },
            { radius: 354800, label: 'Triton Orbit', style: 'dashed-major' }, 
            { radius: 10000000, label: '10,000,000 km', style: 'minor' },
            { radius: 50000000, label: '50,000,000 km', style: 'minor' },
            { radius: 86900000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
        ],
        radialLines: { count: 22 },
    },

    // Magnetic field (offset and tilted)
    magnetosphere: {
        dipoleMoment: 2.2e24, // A⋅m²
        tilt: 47, // degrees - offset from rotation axis
        offset: 0.55 * 24764, // km - significantly offset from planet center
        standoffDistance: 23 * 24764, // km
    },

    // Note: Neptune's heliocentric orbital elements are defined in the Neptune barycenter
    // Neptune's position relative to its barycenter is calculated via astronomy-engine

    // Orientation (IAU 2023/2025)
    poleRA: 299.36, // deg at J2000.0, -0.70*T per century
    poleDec: 43.46, // deg at J2000.0, -0.51*T per century
    spin: 253.18, // deg at J2000.0
    spinRate: 536.3128492, // deg/day
    orientationEpoch: 2451545.0, // JD (J2000.0)
}; 