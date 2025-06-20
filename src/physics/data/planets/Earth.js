/**
 * Earth Configuration
 * 
 * Physical, orbital, and rendering properties for Earth
 */
import { PhysicsConstants } from '../../core/PhysicsConstants.js';

// Earth physical and orbital constants (all in km, kg, or km/s)
export const earthRadius = 6371; // km
export const earthPolarRadius = 6356.752314245; // km
export const earthMass = 5.972e24; // kg
export const earthInclination = 23.5; // degrees
// Calculate GM directly to avoid circular dependency
export const earthGravitationalParameter = PhysicsConstants.PHYSICS.G * earthMass; // km^3/s^2 (G = 6.67430e-20 km³/kg/s²)
export const atmosphereSeaLevelDensity = 1.225e-9; // kg/km^3
export const atmosphereRadius = earthRadius + 100; // km
export const ballisticCoefficient = 100; // kg/m^2
export const earthSOI = 929000; // km
export const earthHillSphere = 1500000; // km

// Import geospatial data
import {
    geojsonDataCities,
    geojsonDataAirports,
    geojsonDataSpaceports,
    geojsonDataGroundStations,
    geojsonDataObservatories,
    geojsonDataSovereignty,
    geojsonDataStates
} from '@/config/geojsonData.js';

export default {
    // Basic identification
    name: 'earth',
    naif_id: 399,
    astronomyEngineName: 'Earth',
    parent: 'emb',
    type: 'planet',
    symbol: '♁',

    // Physical properties
    mass: earthMass, // kg
    radius: earthRadius, // km
    GM: earthGravitationalParameter, // km³/s²
    
    // Shape properties
    oblateness: 0.0033528106647474805,
    equatorialRadius: earthRadius, // km
    polarRadius: earthPolarRadius, // km
    
    // J2 coefficient for oblateness perturbations
    J2: 0.00108263,
    
    // Atmosphere model for drag calculations
    atmosphericModel: {
        maxAltitude: 1000, // km - above this, no drag
        minAltitude: 0, // km
        referenceAltitude: 200, // km
        referenceDensity: 2.789e-10, // kg/m³ at 200km
        scaleHeight: 50, // km - exponential decay scale
        // More accurate density model
        getDensity: function(altitude) {
            // Simple exponential model
            // Real atmosphere is much more complex with multiple layers
            if (altitude > 1000 || altitude < 0) return 0;
            
            // Different scale heights for different altitude ranges
            let scaleHeight;
            if (altitude < 100) {
                scaleHeight = 8.5; // Troposphere/stratosphere
            } else if (altitude < 300) {
                scaleHeight = 30; // Thermosphere lower
            } else {
                scaleHeight = 50; // Thermosphere upper
            }
            
            // Reference densities at different altitudes (kg/km³)
            let rho0, h0;
            if (altitude < 100) {
                rho0 = 1.225e-9; // Sea level (converted from 1.225 kg/m³)
                h0 = 0;
            } else if (altitude < 200) {
                rho0 = 5.1e-16; // 100km (converted from 5.1e-7 kg/m³)
                h0 = 100;
            } else {
                rho0 = 2.789e-19; // 200km (converted from 2.789e-10 kg/m³)
                h0 = 200;
            }
            
            return rho0 * Math.exp(-(altitude - h0) / scaleHeight);
        }
    },

    // Rotation properties
    rotationPeriod: 86164.0905, // seconds (sidereal day)
    tilt: earthInclination, // degrees - obliquity of ecliptic
    
    // Surface coordinate system alignment
    // Offset to align Astronomy Engine's celestial reference frame with surface coordinates
    // For Earth: +90° aligns prime meridian with equirectangular texture expectations
    surfaceCoordinateOffset: 90, // degrees

    // Orbital properties
    soiRadius: earthSOI, // km
    hillSphere: earthHillSphere, // km

    // Atmospheric properties
    atmosphere: {
        thickness: 70, // km
        densityScaleHeight: 10, // km
        hazeIntensity: 0.7,
        scaleHeightMultiplier: 1.0,
        rayleighScaleHeight: 10, // km
        mieScaleHeight: 1.2, // km - height at which mie scattering is significant
        rayleighScatteringCoeff: [0.015, 0.04, 0.12],
        mieScatteringCoeff: 0.0015, // - 100x less than rayleigh
        mieAnisotropy: 7.75, // mie's anisotropy factor - how much light is scattered in the forward direction
        numLightSteps: 1,
        sunIntensity: 1,
        equatorialRadius: earthRadius, // km
        polarRadius: earthPolarRadius, // km
        rho0: atmosphereSeaLevelDensity, // kg/km^3
    },

    // Cloud properties
    cloudThickness: 5, // km

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'earthTexture',
            normalMapKey: 'earthNormalTexture',
            roughnessMap: 'earthRoughnessTexture',
            params: {
                roughness: 0.8,
                metalness: 0.1,
            }
        },
        cloudConfig: {
            materialType: 'standard',
            textureKey: 'cloudTexture',
            params: {
                transparent: true,
                opacity: 0.8,
                alphaTest: 0.1,
            }
        }
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0x6699ff,
        intensity: earthRadius * 10,
        helper: false
    },

    // LOD levels for rendering optimization
    lodLevelsKey: 'default',

    // Geospatial data
    primaryGeojsonData: geojsonDataSovereignty,
    stateGeojsonData: geojsonDataStates,
    cityData: geojsonDataCities,
    airportsData: geojsonDataAirports,
    spaceportsData: geojsonDataSpaceports,
    groundStationsData: geojsonDataGroundStations,
    observatoriesData: geojsonDataObservatories,

    // Surface options to enable POIs
    surfaceOptions: {
        addLatitudeLines: true,
        addLongitudeLines: true,
        addCountryBorders: true,
        addStates: true,
        addCities: true,
        addAirports: true,
        addSpaceports: true,
        addGroundStations: true,  // Enable ground stations for Earth
        addObservatories: true,
        latitudeStep: 15,
        longitudeStep: 15
    },

    // Radial grid configuration for orbital visualization
    radialGridConfig: {
        circles: [
            { radius: 200, label: 'LEO Min', style: 'major' },
            { radius: 2000, label: 'LEO Max', style: 'major' },
            { radius: 35786, label: 'MEO Max', style: 'major' },
            { radius: 42164, label: 'GEO', style: 'major' },
            { radius: 384400, label: 'Lunar Orbit', style: 'dashed' },
            { radius: 929000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            { radius: 1_500_000, label: 'Hill Sphere', style: 'dashed-major', dashScale: 3 },
        ],
        markerStep: 100000,
        labelMarkerStep: 100000,
        radialLines: { count: 22 },
    },

    // Magnetic field properties
    magnetosphere: {
        dipoleMoment: 7.94e22, // A⋅m² - magnetic dipole moment
        tilt: 11.5, // degrees - magnetic declination
        standoffDistance: 10 * earthRadius, // km - typical magnetopause distance
        tailLength: 100 * earthRadius // km - magnetotail length
    },

    // Geological properties
    geology: {
        coreRadius: 3485, // km - inner + outer core
        mantleThickness: 2885, // km
        crustThickness: 35, // km - average continental crust
        age: 4.54e9 * 365.25 * 86400, // seconds (4.54 billion years)
        plateCount: 15 // major tectonic plates
    },

    // Orbital mechanics - EMB-relative elements for proper Earth-Moon barycenter orbit visualization
    // These represent Earth's motion around the EMB, which is influenced by lunar orbital dynamics
    orbitalElements: {
        semiMajorAxis: 4671, // km - mean Earth-EMB distance (1737.4 km * 73.4 / (73.4 + 1) ≈ 4671 km)
        eccentricity: 0.0549, // Earth-EMB eccentricity matches lunar orbital eccentricity
        inclination: 5.145, // degrees - matches Moon's inclination to ecliptic (Earth wobbles with Moon)
        longitudeOfAscendingNode: 125.012, // degrees - matches lunar node regression
        argumentOfPeriapsis: 318.063, // degrees - opposite to Moon's argument of periapsis
        meanAnomalyAtEpoch: 244.635, // degrees - opposite phase to Moon at J2000.0 (115.3654 + 180 - 50.7304)
        period: 27.321661 * 24 * 3600, // seconds - same as lunar sidereal period
        epoch: 2451545.0 // J2000.0
    },

    // Note: Earth's heliocentric orbital elements are defined in the EMB barycenter

    // Orbit visualization configuration
    orbitVisualization: {
        useSpecialEMBHandling: true, // Use special EMB handling for Earth around EMB
        orbitPoints: 720 // High resolution for Earth-EMB orbit
    },

    // Climate zones for atmospheric modeling
    climateZones: {
        tropical: { latRange: [-23.5, 23.5], avgTemp: 298 }, // K
        temperate: { latRange: [-66.5, -23.5, 23.5, 66.5], avgTemp: 283 }, // K
        polar: { latRange: [-90, -66.5, 66.5, 90], avgTemp: 253 } // K
    },

    // Orientation (IAU 2023/2025)
    poleRA: 0.00,      // deg at J2000.0, -0.641*T per century  
    poleDec: 90.00,    // deg at J2000.0, -0.557*T per century
    poleRARate: -0.641, // deg per century
    poleDecRate: -0.557, // deg per century
    spin: 190.147,     // deg at J2000.0 (restored to IAU standard, matches Astronomy Engine)
    spinRate: 360.9856235, // deg/day (sidereal rotation)
    orientationEpoch: 2451545.0 // JD (J2000.0)
}; 