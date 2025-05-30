import {Constants} from '../../../utils/Constants.js';

const venusMass = 4.867e24; // kg
const venusRadius = 6051.8; // km
const venusGM = Constants.G * venusMass; // km³/s²

export default {
    // Basic identification
    name: 'venus',
    naif_id: 299,
    astronomyEngineName: 'Venus',
    parent: 'venus_barycenter',
    type: 'planet',
    symbol: '♀',

    // Physical properties
    mass: venusMass, // kg
    radius: venusRadius, // km
    GM: venusGM, // km³/s²
    j2: 4.458e-6, // J2 gravitational coefficient

    // Shape properties
    oblateness: 0, // Nearly perfect sphere
    equatorialRadius: 6051.8, // km
    polarRadius: 6051.8, // km

    // Rotation properties (retrograde and very slow)
    rotationPeriod: -20996500, // seconds (-243.015 Earth days, negative for retrograde)
    tilt: 177.36, // degrees - effectively upside down

    // Orbital properties
    soiRadius: 616000, // km - Sphere of Influence radius
    orbitalPeriod: 224.7 * 86400, // seconds (224.7 Earth days)
    semiMajorAxis: 108.2e6, // km (0.72 AU)

    // Atmospheric properties (dense CO2 atmosphere)
    atmosphere: {
        thickness: 190, // km - extends very high
        densityScaleHeight: 15.9, // km
        hazeIntensity: 5,
        scaleHeightMultiplier: 2.0,
        rayleighScaleHeight: 15, // km (approx)
        mieScaleHeight: 7,    // km (sulfuric acid clouds)
        rayleighScatteringCoeff: [0.001, 0.001, 0.0005], // Whitish-yellow
        mieScatteringCoeff: 0.05, // Dense clouds
        mieAnisotropy: 0.7,
        numLightSteps: 4, // More steps for dense atmosphere
        sunIntensity: 3,
        equatorialRadius: 6051.8,
        polarRadius: 6051.8,
        composition: {
            carbonDioxide: 0.965,
            nitrogen: 0.035,
            sulfurDioxide: 0.00015, // (SO2)
            argon: 0.00007
        },
        pressure: 92 // bar - surface pressure (92 times Earth's)
    },

    // Cloud properties (thick sulfuric acid clouds)
    cloudThickness: 20, // km - main cloud deck thickness
    cloudTopAltitude: 70, // km - altitude of cloud tops

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'venusTexture', // Surface texture (often radar maps)
            // No normal map by default, surface obscured by clouds
            params: {
                roughness: 0.5, // Hypothetical surface roughness
                metalness: 0.1,
            }
        },
        cloudConfig: {
            textureKey: 'venusCloudTexture',
            cloudType: 'opaque', // Venus uses opaque clouds
            opacity: 0.95, // Dense clouds
            color: 0xffffff,
        },
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xfff4d9, // Yellowish white
        intensity: 6051.8 * 7, // Adjusted for appearance
        helper: false
    },

    // LOD levels
    lodLevelsKey: 'default',

    // Radial grid configuration
    radialGridConfig: {
        markerStep: 30000,
        labelMarkerStep: 150000,
        circles: [
            { radius: 10000, label: '10,000 km', style: 'minor' },
            { radius: 50000, label: '50,000 km', style: 'minor' },
            { radius: 200000, label: '200,000 km', style: 'minor' },
            { radius: 616000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
        ],
        radialLines: { count: 22 },
    },

    // Magnetic field (very weak or non-existent)
    magnetosphere: {
        dipoleMoment: null,
        fieldStrength: 5e-9, // T - extremely weak, if any intrinsic field
        type: 'induced' // Primarily induced by solar wind interaction
    },

    // Geological properties
    geology: {
        coreRadius: 3200, // km - estimated iron core
        mantleThickness: 2800, // km - silicate mantle
        crustThickness: 50, // km - average
        surfaceAge: 300e6 * 365.25 * 86400, // seconds (300-600 million years old surface)
        volcanism: 'extensive' // Shield volcanoes, pancake domes
    },

    // Orbital mechanics from orbitalBodiesData.js
    orbitalElements: {
        semiMajorAxis: 108208000.0,
        eccentricity: 0.0067,
        inclination: 3.3947,
        longitudeOfAscendingNode: 76.680,
        argumentOfPeriapsis: 54.884,
        meanAnomalyAtEpoch: 50.416
    },

    // Surface temperature (extreme greenhouse effect)
    surfaceTemperature: 735 // K (462 °C)
}; 