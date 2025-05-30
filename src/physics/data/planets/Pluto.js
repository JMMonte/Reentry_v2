import * as THREE from 'three';
import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const plutoMass = 1.303e22; // kg
const plutoRadius = 1188.3; // km
const plutoGM = PhysicsConstants.PHYSICS.G * plutoMass; // km³/s²

export default {
    // Basic identification
    name: 'pluto',
    naif_id: 999,
    astronomyEngineName: 'Pluto',
    parent: 'pluto_barycenter',
    type: 'dwarf_planet',
    symbol: '♇',

    // Physical properties
    mass: plutoMass, // kg
    radius: plutoRadius, // km
    GM: plutoGM, // km³/s²
    isDwarf: true, // Dwarf planet
    // j2: unknown or negligible for Pluto

    // Shape properties
    oblateness: 0.0000, // Assumed to be nearly spherical
    equatorialRadius: 1188.3, // km
    polarRadius: 1188.3, // km

    // Rotation properties
    rotationPeriod: -551855, // seconds (-6.3872 Earth days, retrograde)
    tilt: 122.53, // degrees - extreme axial tilt

    // Orbital properties (part of Pluto-Charon binary system)
    soiRadius: 5800000, // km (SOI for Pluto-Charon system around Sun)
    orbitalPeriod: 6.387230 * 24 * 3600, // seconds - same as Charon (tidally locked)
    semiMajorAxis: 5906.44e6, // km (39.48 AU from Sun - this is for heliocentric orbit)
    
    // Pluto orbits around the Pluto-Charon barycenter
    // Distance: ~2110 km from Pluto center (based on mass ratio)
    orbitalElements: {
        semiMajorAxis: 2110, // km - distance from Pluto center to barycenter
        eccentricity: 0.00016, // Same as Charon (tidally locked system)
        inclination: 0.080,    // Same as Charon's orbital plane
        longitudeOfAscendingNode: 223.046, // Same as Charon
        argumentOfPeriapsis: 0.0, // Opposite side from Charon
        meanAnomalyAtEpoch: 0.0,  // Opposite phase from Charon (180° different)
        epoch: 2451545.0,         // J2000.0
        referenceFrame: 'pluto_equatorial' // Same reference frame as Charon
    },

    // Atmospheric properties (thin, tenuous, variable)
    atmosphere: {
        thickness: 20, // km - very rough estimate of extent
        densityScaleHeight: 60, // km (highly variable)
        hazeIntensity: 0.1,
        scaleHeightMultiplier: 1.0, // Less pronounced effect for thin atm
        rayleighScaleHeight: 5, // km
        mieScaleHeight: 5, // km (tholin hazes)
        rayleighScatteringCoeff: [0.0001, 0.0001, 0.0002], // Very faint blue/grey
        mieScatteringCoeff: 0.0005,
        mieAnisotropy: 0.3,
        numLightSteps: 1,
        sunIntensity: 10,
        equatorialRadius: 1188.3,
        polarRadius: 1188.3,
        composition: {
            nitrogen: 0.98, // mole fraction
            methane: 0.01,
            carbonMonoxide: 0.005
        },
        pressure: 1e-5 // bar - surface pressure (highly variable)
    },

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'plutoTexture',
            normalMapKey: 'plutoNormalTexture',
            params: {
                normalScale: new THREE.Vector2(0.2, 0.2),
                roughness: 0.75,
                metalness: 0.05,
            }
        },
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xffefd5, // Papaya whip (pale orange-pink)
        intensity: 1188.3, // Adjusted for appearance
        helper: false
    },

    // LOD levels
    lodLevelsKey: 'default',

    // Radial grid configuration (for Pluto system if centered on Pluto itself)
    radialGridConfig: {
        markerStep: 2000, 
        labelMarkerStep: 10000, 
        circles: [
            { radius: 19591, label: 'Charon Orbit', style: 'dashed-major' }, // Approx Charon semi-major axis from Pluto
            { radius: 48000, label: 'Hydra Orbit', style: 'dashed' },
            { radius: 65000, label: 'Nix Orbit', style: 'dashed' }, 
            // Pluto's SOI w.r.t Sun is large, but its direct gravitational hold on sats is smaller
            // For a Pluto-centric view, SOI might be defined differently.
        ],
        radialLines: { count: 22 },
    },
    
    // Geological properties
    geology: {
        sputnikPlanitia: true, // Large nitrogen ice glacier
        tholinHazes: true, // Organic compounds in atmosphere
        waterIceMountains: true, // Mountains made of water ice
        cryovolcanism: 'possible'
    },

    // Orientation (IAU 2023/2025)
    poleRA: 132.993, // deg at J2000.0, +0.0*T per century
    poleDec: -6.163, // deg at J2000.0, +0.0*T per century
    spin: 302.695, // deg at J2000.0
    spinRate: -56.3625225, // deg/day (retrograde)
    orientationEpoch: 2451545.0, // JD (J2000.0)
}; 