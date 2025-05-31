/**
 * Jupiter Configuration
 * 
 * Physical, orbital, and rendering properties for Jupiter
 */

import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const jupiterMass = 1.8982e27; // kg
const jupiterRadius = 69_911; // km
const jupiterGM = PhysicsConstants.PHYSICS.G * jupiterMass; // km³/s²

export default {
    // Basic identification
    name: 'jupiter',
    naif_id: 599,
    astronomyEngineName: 'Jupiter',
    parent: 'jupiter_barycenter',
    type: 'planet',
    symbol: '♃',

    // Physical properties
    mass: jupiterMass, // kg
    radius: jupiterRadius, // km - equatorial radius
    GM: jupiterGM, // km³/s² - Standard gravitational parameter
    j2: 1.4736e-2,
    
    // Shape properties (highly oblate due to rapid rotation)
    oblateness: 0.06487,
    equatorialRadius: 71_492, // km
    polarRadius: 66_854, // km

    // Rotation properties (fastest rotating planet)
    rotationPeriod: 35730, // seconds (9h 55m 30s)
    tilt: 3.13, // degrees - small axial tilt

    // Orbital properties
    soiRadius: 48_230_000, // km - Sphere of Influence radius
    orbitalPeriod: 11.862 * 365.25 * 24 * 3600, // seconds (11.862 years)
    semiMajorAxis: 778.5e6, // km - 5.2 AU

    // Atmospheric properties
    atmosphere: {
        limbFudgeFactor: 1,
        hazeIntensity: 2,
        scaleHeightMultiplier: 2.0,
        thickness: 200, // km - effective atmosphere thickness
        densityScaleHeight: 10.9, // km
        rayleighScaleHeight: 30.9, // km
        mieScaleHeight: 28, // km
        rayleighScatteringCoeff: [0.05, 0.07, 0.12],
        mieScatteringCoeff: 0.015,
        mieAnisotropy: 7.7,
        numLightSteps: 1,
        sunIntensity: 5,
        equatorialRadius: 71_492,
        polarRadius: 66_854,
        composition: {
            hydrogen: 0.898, // mass fraction
            helium: 0.102,
            methane: 0.0003,
            ammonia: 0.0001,
            hydrogenSulfide: 0.00001
        }
    },

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'jupiterTexture',
            params: {
                roughness: 0.9,
                metalness: 0.0,
            }
        },
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xffcc99,
        intensity: 69_911,
        helper: false
    },

    // LOD levels for rendering optimization
    lodLevelsKey: 'default',

    // Radial grid configuration for orbital visualization
    radialGridConfig: {
        markerStep: 2_000_000, // 2,000,000 km
        labelMarkerStep: 10_000_000, // 10,000,000 km
        circles: [
            { radius: 104_867, label: '1.5 Rj (Inner Belt)', style: 'dashed', dashScale: 1.5 },
            { radius: 209_734, label: '3 Rj (Outer Belt)', style: 'dashed', dashScale: 2 },
            { radius: 10_000_000, label: '10,000,000 km', style: 'minor' },
            { radius: 30_000_000, label: '30,000,000 km', style: 'minor' },
            { radius: 48_230_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
        ],
        radialLines: { count: 22 },
    },

    // Magnetic field properties (strongest in solar system)
    magnetosphere: {
        dipoleMoment: 1.55e27, // A⋅m² - magnetic dipole moment
        tilt: 9.6, // degrees - magnetic declination
        standoffDistance: 42 * 69_911, // km - magnetopause distance
        tailLength: 650e6, // km - extends beyond Saturn's orbit
        radiationBelts: {
            inner: { radius: 1.5 * 69_911, intensity: 'extreme' },
            outer: { radius: 3.0 * 69_911, intensity: 'high' }
        }
    },

    // Internal structure
    structure: {
        coreRadius: 7000, // km - rocky/metallic core
        coreType: 'fuzzy', // partially dissolved core
        coreMass: 7e24, // kg - estimated core mass
        metallicHydrogenRadius: 55000, // km
        molecularHydrogenRadius: 69911, // km - to visible surface
        temperature: {
            core: 20000, // K - core temperature
            surface: 165, // K - 1 bar level temperature
            cloudTops: 110 // K - visible cloud temperature
        }
    },

    // Note: Jupiter's heliocentric orbital elements are defined in the Jupiter barycenter
    // Jupiter's position relative to its barycenter is calculated via astronomy-engine

    // Great Red Spot properties
    greatRedSpot: {
        longitude: 43, // degrees - System II longitude
        latitude: -22, // degrees
        width: 16350, // km
        height: 13020, // km
        windSpeed: 0.120, // km/s - maximum wind speed
        age: 350 * 365.25 * 24 * 3600, // seconds (at least 350 years old)
        color: 0xcc6633 // reddish-brown color
    },

    // Atmospheric dynamics (windSpeed in km/s)
    atmosphericBands: {
        equatorialZone: { latitude: [-7, 7], windSpeed: 0.1 }, // km/s eastward
        northEquatorialBelt: { latitude: [7, 20], windSpeed: -0.05 }, // km/s westward
        southEquatorialBelt: { latitude: [-20, -7], windSpeed: -0.07 }, // km/s westward
        northTemperateZone: { latitude: [20, 40], windSpeed: 0.04 }, // km/s eastward
        southTemperateZone: { latitude: [-40, -20], windSpeed: 0.06 } // km/s eastward
    },

    // Trojan asteroids
    trojans: {
        l4Count: 4800, // estimated number at L4 Lagrange point
        l5Count: 2400, // estimated number at L5 Lagrange point
        totalMass: 2e20 // kg - estimated total mass
    },

    // Orientation (IAU 2023/2025)
    poleRA: 268.056595, // deg at J2000.0, -0.006499*T per century
    poleDec: 64.495303, // deg at J2000.0, +0.002413*T per century
    spin: 284.95, // deg at J2000.0
    spinRate: 870.5360000, // deg/day
    orientationEpoch: 2451545.0, // JD (J2000.0)
}; 