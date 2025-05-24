/**
 * Earth Configuration
 * 
 * Physical, orbital, and rendering properties for Earth
 */

import * as THREE from 'three';
import { metersToKm } from '../../../config/constants-lite.js';

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

const EARTH_RAD = 6_378_136.6 * metersToKm;

export default {
    // Basic identification
    name: 'earth',
    naif_id: 399,
    astronomyEngineName: 'Earth',
    parent: 'emb',
    type: 'planet',
    symbol: '♁',

    // Physical properties
    mass: 5.972e24, // kg
    radius: EARTH_RAD, // km
    GM: 3.986004418e5, // km³/s² - Standard gravitational parameter
    
    // Shape properties
    oblateness: 0.0033528106647474805,
    equatorialRadius: 6378.137, // km
    polarRadius: 6356.752, // km

    // Rotation properties
    rotationPeriod: 86164.0905, // seconds (23h 56m 4s sidereal day)
    tilt: 23.44, // degrees - obliquity of ecliptic

    // Orbital properties
    soiRadius: 929000, // km - Sphere of Influence radius
    hillSphere: 1500000, // km - Hill sphere radius

    // Atmospheric properties
    atmosphere: {
        thickness: 60, // km - effective atmosphere thickness
        densityScaleHeight: 20, // km
        hazeIntensity: 3,
        scaleHeightMultiplier: 4.0,
        rayleighScaleHeight: 8, // km
        mieScaleHeight: 1.2, // km
        rayleighScatteringCoeff: [0.0015, 0.004, 0.012],
        mieScatteringCoeff: 0.00015,
        mieAnisotropy: 0.75,
        numLightSteps: 2,
        sunIntensity: 6,
        equatorialRadius: EARTH_RAD,
        polarRadius: EARTH_RAD * (1 - 0.0033528106647474805),
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
        createCloudMaterial: tm => new THREE.MeshLambertMaterial({
            alphaMap: tm.getTexture('cloudTexture'),
            color: 0xffffff,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
            depthTest: true,
        }),
    },

    // Lighting
    addLight: true,
    lightOptions: {
        color: 0x6699ff,
        intensity: EARTH_RAD * 10,
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
        standoffDistance: 10 * EARTH_RAD, // km - typical magnetopause distance
        tailLength: 100 * EARTH_RAD // km - magnetotail length
    },

    // Geological properties
    geology: {
        coreRadius: 3485, // km - inner + outer core
        mantleThickness: 2885, // km
        crustThickness: 35, // km - average continental crust
        age: 4.54e9 * 365.25 * 24 * 3600, // seconds (4.54 billion years)
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

    // Climate zones for atmospheric modeling
    climateZones: {
        tropical: { latRange: [-23.5, 23.5], avgTemp: 298 }, // K
        temperate: { latRange: [-66.5, -23.5, 23.5, 66.5], avgTemp: 283 }, // K
        polar: { latRange: [-90, -66.5, 66.5, 90], avgTemp: 253 } // K
    }
}; 