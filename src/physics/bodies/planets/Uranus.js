export default {
    // Basic identification
    name: 'uranus',
    naif_id: 799,
    astronomyEngineName: 'Uranus',
    parent: 'uranus_barycenter',
    type: 'planet',
    symbol: '♅',

    // Physical properties
    mass: 8.681e25, // kg
    radius: 25362, // km - equatorial radius at 1 bar
    GM: 5.793939e6, // km³/s²
    j2: 3.34343e-3, // J2 gravitational coefficient

    // Shape properties
    oblateness: 0.02293,
    equatorialRadius: 25559, // km
    polarRadius: 24973, // km

    // Rotation properties (extreme axial tilt, retrograde rotation)
    rotationPeriod: -62064, // seconds (-17h 14m 24s, negative for retrograde-like pole)
    tilt: 97.77, // degrees - extreme axial tilt, lies on its side

    // Orbital properties
    soiRadius: 51800000, // km - Sphere of Influence radius
    orbitalPeriod: 84.011 * 365.25 * 86400, // seconds (84.011 Earth years)
    semiMajorAxis: 2875.04e6, // km (19.22 AU)

    // Atmospheric properties (ice giant)
    atmosphere: {
        limbFudgeFactor: 1.0,
        hazeIntensity: 1,
        scaleHeightMultiplier: 4.0,
        thickness: 50, // km (effective visual thickness)
        densityScaleHeight: 27.7, // km
        rayleighScaleHeight: 25, // km
        mieScaleHeight: 5,  // km (methane ice clouds/haze)
        rayleighScatteringCoeff: [0.001, 0.005, 0.010], // Cyan/blue
        mieScatteringCoeff: 0.002,
        mieAnisotropy: 0.5,
        numLightSteps: 2,
        sunIntensity: 2,
        equatorialRadius: 25559,
        polarRadius: 24973,
        composition: {
            hydrogen: 0.83, // mole fraction
            helium: 0.15,
            methane: 0.023 // Methane gives it its blue color
        }
    },
    
    // Ring system (faint, dark rings)
    addRings: true,
    rings: {
        textureKey: 'uranusRingsTexture', // Generic or specific Uranus rings texture
        innerRadius: 44720,    // km (approx for Zeta ring, innermost)
        outerRadius: 51140,    // km (approx for Mu ring, outermost main)
        segments: 64,
        opacity: 0.3, // Faint rings
        tilt: 97.77 // Aligned with equator
    },

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'uranusTexture', // Featureless or subtly banded texture
            params: {
                roughness: 0.98, // Gas/ice giant
                metalness: 0.0,
            }
        },
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xafeeee, // Pale turquoise
        intensity: 25362 * 2, // Adjusted for appearance
        helper: false
    },

    // LOD levels
    lodLevelsKey: 'default',

    // Radial grid configuration
    radialGridConfig: {
        markerStep: 1000000, 
        labelMarkerStep: 5000000, 
        circles: [
            { radius: 98000, label: 'Outer Ring', style: 'dashed' },
            { radius: 190900, label: 'Miranda Orbit', style: 'dashed' }, 
            { radius: 436300, label: 'Titania Orbit', style: 'dashed-major' }, 
            { radius: 10000000, label: '10,000,000 km', style: 'minor' },
            { radius: 30000000, label: '30,000,000 km', style: 'minor' },
            { radius: 51800000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
        ],
        radialLines: { count: 22 },
    },

    // Magnetic field (offset and tilted)
    magnetosphere: {
        dipoleMoment: 3.9e24, // A⋅m²
        tilt: 59, // degrees - offset from rotation axis
        offset: 0.3 * 25559, // km - significantly offset from planet center
        standoffDistance: 18 * 25559, // km
    },

    // Orbital mechanics from orbitalBodiesData.js
    orbitalElements: {
        semiMajorAxis: 2875040000.0,
        eccentricity: 0.0463,
        inclination: 0.773,
        longitudeOfAscendingNode: 74.006,
        argumentOfPeriapsis: 96.998,
        meanAnomalyAtEpoch: 142.2386
    },

    // Orientation (IAU 2023/2025)
    poleRA: 257.311, // deg at J2000.0, +0.000 * T per century
    poleDec: -15.175, // deg at J2000.0, +0.000 * T per century
    spin: 203.81, // deg at J2000.0
    spinRate: -501.1600928, // deg/day (retrograde)
    orientationEpoch: 2451545.0, // JD (J2000.0)
}; 