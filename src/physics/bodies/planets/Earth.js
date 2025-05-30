/**
 * Earth Configuration
 * 
 * Physical, orbital, and rendering properties for Earth
 */

import * as THREE from 'three';
import { Constants } from '../../../utils/Constants.js';

// Earth physical and orbital constants (all in km, kg, or km/s)
export const earthRadius = 6371; // km
export const earthPolarRadius = 6356.752314245; // km
export const earthMass = 5.972e24; // kg
export const earthInclination = 23.5; // degrees
export const earthGravitationalParameter = Constants.G * earthMass; // km^3/s^2
export const atmosphereSeaLevelDensity = 1.225e-3; // kg/km^3
export const atmosphereRadius = earthRadius + 100; // km
export const ballisticCoefficient = 100; // kg/m^2
export const earthSOI = 929000; // km
export const earthHillSphere = 1500000; // km

// Import geospatial data
import geojsonDataSovereignty from '../../../config/ne_50m_admin_0_sovereignty.json';
import geojsonDataStates from '../../../config/ne_110m_admin_1_states_provinces.json';
import {
    geojsonDataCities,
    geojsonDataAirports,
    geojsonDataSpaceports,
    geojsonDataGroundStations,
    geojsonDataObservatories
} from '../../../config/geojsonData.js';

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
            
            // Reference densities at different altitudes (kg/m³)
            let rho0, h0;
            if (altitude < 100) {
                rho0 = 1.225; // Sea level
                h0 = 0;
            } else if (altitude < 200) {
                rho0 = 5.1e-7; // 100km
                h0 = 100;
            } else {
                rho0 = 2.789e-10; // 200km
                h0 = 200;
            }
            
            return rho0 * Math.exp(-(altitude - h0) / scaleHeight);
        }
    },

    // Rotation properties
    rotationPeriod: Constants.siderialDay, // seconds (sidereal day)
    tilt: earthInclination, // degrees - obliquity of ecliptic

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
                normalScale: new THREE.Vector2(0.5, 0.5),
                roughness: 0.9,
                metalness: 0.0,
            }
        },
        cloudConfig: {
            textureKey: 'cloudTexture',
            cloudType: 'transparent', // Earth uses transparent clouds
            opacity: 1.0,
            color: 0xffffff,
        },
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
        age: 4.54e9 * Constants.daysInYear * Constants.secondsInDay, // seconds (4.54 billion years)
        plateCount: 15 // major tectonic plates
    },

    // Orbital mechanics
    orbitalElements: {
        semiMajorAxis: 149597870.7, // km - 1 AU
        eccentricity: 0.0167086,
        inclination: 0.00005, // degrees - relative to ecliptic
        longitudeOfAscendingNode: -11.26064, // degrees
        argumentOfPeriapsis: 114.20783, // degrees
        meanAnomalyAtEpoch: 358.617 // degrees at J2000.0
    },

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
    }
}; 