import * as THREE from 'three';
import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const marsMass = 6.417e23; // kg
const marsRadius = 3389.5; // km
const marsGM = PhysicsConstants.PHYSICS.G * marsMass; // km³/s²

export default {
    // Basic identification
    name: 'mars',
    naif_id: 499,
    astronomyEngineName: 'Mars',
    parent: 'mars_barycenter',
    type: 'planet',
    symbol: '♂',

    // Physical properties
    mass: marsMass, // kg
    radius: marsRadius, // km
    GM: marsGM, // km³/s²
    J2: 1.96045e-3, // J2 gravitational coefficient (uppercase for consistency)

    // Shape properties
    oblateness: 0.00648,
    equatorialRadius: 3396.2, // km
    polarRadius: 3376.2, // km

    // Rotation properties
    rotationPeriod: 88642.66, // seconds (24h 37m 22s - a Martian sol)
    tilt: 25.19, // degrees - axial tilt similar to Earth's

    // Orbital properties
    soiRadius: 577000, // km - Sphere of Influence radius
    orbitalPeriod: 686.98 * 86400, // seconds (686.98 Earth days)
    semiMajorAxis: 227.9e6, // km (1.52 AU)

    // Atmospheric model for drag calculations  
    atmosphericModel: {
        maxAltitude: 200, // km - much thinner than Earth
        minAltitude: 0,
        referenceAltitude: 100, // km
        referenceDensity: 2.0e-11, // kg/m³ at 100km (much thinner than Earth)
        scaleHeight: 10.8 // km - Mars scale height
    },

    // Atmospheric properties for visual rendering
    atmosphere: {
        thickness: 40, // km - more visible haze
        densityScaleHeight: 5, // km - more extended haze
        hazeIntensity: 0.9, // much more visible haze
        scaleHeightMultiplier: 1.0, // more exaggerated for visual effect
        rayleighScaleHeight: 5, // km
        mieScaleHeight: 1.5,   // km (dust)
        rayleighScatteringCoeff: [0.1, 0.04, 0.02], // Reddish, but more visible
        mieScatteringCoeff: 0.0001, // More dust scattering
        mieAnisotropy: 10.85, // Strong forward scattering
        numLightSteps: 1,
        sunIntensity: 4, // Brighter for visual effect
        equatorialRadius: 3396.2,
        polarRadius: 3376.2,
        composition: { // Predominantly CO2
            carbonDioxide: 0.9532,
            nitrogen: 0.027,
            argon: 0.016,
            oxygen: 0.0013,
            carbonMonoxide: 0.0008
        },
        pressure: 0.006 // bar - surface pressure (0.6% of Earth's)
    },

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'marsTexture',
            normalMapKey: 'marsNormalTexture',
            params: {
                normalScale: new THREE.Vector2(0.3, 0.3),
                roughness: 0.8,
                metalness: 0.1,
            }
        },
        // No clouds usually, but dust storms can occur
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xffccaa, // Reddish hint
        intensity: 3389.5 * 5, // Adjusted for appearance
        helper: false
    },

    // LOD levels
    lodLevelsKey: 'default',

    // Radial grid configuration
    radialGridConfig: {
        markerStep: 20000,
        labelMarkerStep: 100000,
        circles: [
            { radius: 9376, label: 'Phobos Orbit', style: 'dashed' }, // Approx. Phobos semi-major axis
            { radius: 23463, label: 'Deimos Orbit', style: 'dashed' }, // Approx. Deimos semi-major axis
            { radius: 50000, label: '50,000 km', style: 'minor' },
            { radius: 200000, label: '200,000 km', style: 'minor' },
            { radius: 577000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
        ],
        radialLines: { count: 22 },
    },

    // Magnetic field (very weak, localized)
    magnetosphere: {
        dipoleMoment: null, // No global dipole field
        fieldStrength: 5e-9, // T - surface field strength (crustal magnetism)
        type: 'induced' // Primarily induced by solar wind interaction
    },

    // Geological properties
    geology: {
        coreRadius: 1800, // km - estimated
        mantleThickness: 1500, // km - estimated
        crustThickness: 50, // km - average
        olympusMonsHeight: 21.9, // km - tallest volcano in solar system
        vallesMarinerisLength: 4000, // km - vast canyon system
    },

    // Note: Mars's heliocentric orbital elements are defined in the Mars barycenter
    // Mars's position relative to its barycenter is calculated via astronomy-engine
    
    // Polar caps
    polarCaps: {
        north: { material: 'water_ice', extent: 1000 }, // km diameter in summer
        south: { material: 'co2_ice_water_ice', extent: 350 } // km diameter in summer
    },

    // Orientation (IAU 2023/2025)
    poleRA: 317.68143, // deg at J2000.0, -0.1061*T per century
    poleDec: 52.88650, // deg at J2000.0, -0.0609*T per century
    spin: 176.630, // deg at J2000.0
    spinRate: 350.89198226, // deg/day
    orientationEpoch: 2451545.0, // JD (J2000.0)
}; 