import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import {
    earthTexture, earthSpecTexture, earthNormalTexture,
    cloudTexture, moonTexture, moonBump
} from './textures.js';
import geojsonDataSovereignty from './ne_50m_admin_0_sovereignty.json';
import geojsonDataStates from './ne_110m_admin_1_states_provinces.json';
import {
    geojsonDataCities,
    geojsonDataAirports,
    geojsonDataSpaceports,
    geojsonDataGroundStations,
    geojsonDataObservatories,
    geojsonDataMissions
} from './geojsonData.js';

// Pre-calculate radii using constants to isolate calculation
//const earthScaledRadius = (Constants.earthRadius * Constants.metersToKm) * Constants.scale;
//const moonScaledRadius = (Constants.moonRadius * Constants.metersToKm) * Constants.scale;
//console.log(`DEBUG Pre-calculation: Earth radius = ${earthScaledRadius}, Moon radius = ${moonScaledRadius}`);

export const celestialBodiesConfig = {
    earth: {
        name: 'earth',
        symbol: '♁',
        mass: Constants.earthMass, // kg
        // Correct radius calculation: Convert meters to km, then apply desired scene scale factor (0.0001)
        radius: Constants.earthRadius * Constants.scale * Constants.metersToKm, // Scene units (~637.8)
        tilt: Constants.earthInclination, // degrees
        rotationPeriod: Constants.siderialDay, // Use sidereal day
        rotationOffset: 4.89496121, // GMST at J2000 epoch
        meshRes: 64,
        atmosphereThickness: 10,
        cloudThickness: 0.1,
        addSurface: true,
        surfaceOptions: {
            addLatitudeLines: true, latitudeStep: 10,
            addLongitudeLines: true, longitudeStep: 10,
            addCountryBorders: true,
            addStates: true, addCities: true,
            addAirports: true, addSpaceports: true,
            addGroundStations: true, addObservatories: true,
            markerSize: 0.7,
            circleSegments: 32,
            circleTextureSize: 64,
            fadeStartPixelSize: 700,
            fadeEndPixelSize: 600,
            heightOffset: 0.1
        },
        primaryGeojsonData: geojsonDataSovereignty,
        stateGeojsonData: geojsonDataStates,
        cityData: geojsonDataCities,
        airportsData: geojsonDataAirports,
        spaceportsData: geojsonDataSpaceports,
        groundStationsData: geojsonDataGroundStations,
        observatoriesData: geojsonDataObservatories,
        addLight: true,
        lightOptions: { color: 0x6699ff, intensity: 5000.5, helper: false }, // helper set to false for prod
        lodLevels: [
            { meshRes: 16, distance: 10000 },
            { meshRes: 32, distance: 5000 },
            { meshRes: 64, distance: 2000 },
            { meshRes: 128, distance: 1000 },
        ],
        dotPixelSizeThreshold: 1,
        soiRadius: 145,
        materials: {
            createSurfaceMaterial: (tm, anisotropy) => {
                const mat = new THREE.MeshPhongMaterial({
                    map: tm.getTexture('earthTexture'),
                    specularMap: tm.getTexture('earthSpecTexture'),
                    normalMap: tm.getTexture('earthNormalTexture'),
                    normalScale: new THREE.Vector2(1, 1),
                    specular: new THREE.Color('grey'),
                    shininess: 10
                });
                if (mat.map) mat.map.anisotropy = anisotropy;
                if (mat.specularMap) mat.specularMap.anisotropy = anisotropy;
                if (mat.normalMap) mat.normalMap.anisotropy = anisotropy;
                return mat;
            },
            createCloudMaterial: (tm) => new THREE.MeshLambertMaterial({
                map: tm.getTexture('cloudTexture'),
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            })
        }
    },
    moon: {
        name: 'moon',
        symbol: '☾',
        mass: Constants.moonMass, // kg
        // Correct radius calculation: Convert meters to km, then apply desired scene scale factor (0.1)
        radius: Constants.moonRadius * Constants.scale * Constants.metersToKm, // Scene units, consistent with Earth
        rotationPeriod: 29.53058867 * Constants.secondsInDay, // synodic period
        meshRes: 128,
        tilt: 0, // Tilt relative to its orbit, handled by orbital elements
        addSurface: true,
        surfaceOptions: {
            addLatitudeLines: true, latitudeStep: 10,
            addLongitudeLines: true, longitudeStep: 10,
            addMissions: true,
            fadeStartPixelSize: 700,
            fadeEndPixelSize: 600,
            markerSize: 0.7,
            circleSegments: 32,
            circleTextureSize: 64,
        },
        missionsData: geojsonDataMissions,
        addLight: true,
        lightOptions: { color: 0x6699ff, intensity: 1000.5, helper: false }, // helper set to false for prod
        lodLevels: [
            { meshRes: 16, distance: 10000 },
            { meshRes: 64, distance: 2000 },
            { meshRes: 128, distance: 500 },
        ],
        dotPixelSizeThreshold: 1,
        orbitalPeriod: 27.321661, // sidereal days
        soiRadius: 10.3,
        orbitElements: { // Base elements, argumentOfPeriapsis might be updated dynamically
            semiMajorAxis: Constants.semiMajorAxis,
            eccentricity: Constants.eccentricity,
            inclination: Constants.inclination,
            longitudeOfAscendingNode: Constants.ascendingNode,
            argumentOfPeriapsis: THREE.MathUtils.degToRad(0), // Placeholder, calculated dynamically
            mu: Constants.earthGravitationalParameter,
        },
        materials: {
            createSurfaceMaterial: (tm, anisotropy) => {
                const mat = new THREE.MeshPhongMaterial({
                    map: tm.getTexture('moonTexture'),
                    bumpMap: tm.getTexture('moonBump'),
                    bumpScale: 3.9
                });
                if (mat.map) mat.map.anisotropy = anisotropy;
                if (mat.bumpMap) mat.bumpMap.anisotropy = anisotropy;
                return mat;
            },
            createCloudMaterial: () => null,
            createGlowMaterial: () => null
        }
    },
    sun: {
        name: 'sun',
        mass: Constants.sunMass,
        // Other parameters like radius, color, intensity could be added here
        // if the Sun class is refactored to accept them.
    }
};

// Add texture definitions for easy lookup
export const textureDefinitions = [
    { key: 'earthTexture', src: earthTexture },
    { key: 'earthSpecTexture', src: earthSpecTexture },
    { key: 'earthNormalTexture', src: earthNormalTexture },
    { key: 'cloudTexture', src: cloudTexture },
    { key: 'moonTexture', src: moonTexture },
    { key: 'moonBump', src: moonBump },
];

// Add other scene-wide configs if needed
export const ambientLightConfig = { color: 0xffffff, intensity: 0.1 };
export const bloomConfig = { strength: 0.3, radius: 0.999, threshold: 0.99 }; 