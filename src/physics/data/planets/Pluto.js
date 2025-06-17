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

    // Orbital properties
    soiRadius: 6400000, // km - Sphere of Influence radius
    orbitalPeriod: 248 * 365.25 * 86400, // seconds (248 Earth years)
    semiMajorAxis: 5.906e9, // km (39.48 AU)

    // Multi-body system configuration
    multiBodySystemComponent: true, // Enable general multi-body system positioning based on all moon positions
    
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

    // Atmospheric model for drag calculations
    atmosphericModel: {
        maxAltitude: 1600, // km - Pluto's extended atmosphere (New Horizons data)
        minAltitude: 0,
        referenceAltitude: 50, // km - above surface
        referenceDensity: 1e-8, // kg/m³ at 50km (very thin nitrogen atmosphere)
        scaleHeight: 50, // km - Pluto scale height
        getDensity: function(altitude) {
            // Thin nitrogen atmosphere discovered by New Horizons
            if (altitude > this.maxAltitude) return 0;
            return this.referenceDensity * Math.exp(-(altitude - this.referenceAltitude) / this.scaleHeight);
        }
    },

    // Atmospheric properties (thin nitrogen atmosphere)
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

    // NOTE: Material configurations moved to frontend PlanetMaterials.js
    // This physics data file should only contain pure physics properties

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0xffefd5, // Papaya whip (pale orange-pink)
        intensity: 1188.3, // Adjusted for appearance
        helper: false
    },

    // LOD levels
    lodLevelsKey: 'default',

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'plutoTexture',
            params: {
                roughness: 0.8,
                metalness: 0.05,
            }
        }
    },

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