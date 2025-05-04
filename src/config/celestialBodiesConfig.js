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

// Reusable constants
const earthRadius = 6378136.6 * Constants.scale * Constants.metersToKm;
const earthMass = 5.9722 * 10 ** 24; // kg
const moonRadius = 1737400 * Constants.scale * Constants.metersToKm;
const moonMass = 7.34767309 * 10 ** 22; // kg
const earthGravitationalParameter = Constants.G * earthMass; // m^3/s^2


export const celestialBodiesConfig = {
    earth: {
        name: 'earth',
        symbol: '♁',
        mass: earthMass, // kg
        // Correct radius calculation: Convert meters to km, then apply desired scene scale factor (0.0001)
        radius: earthRadius, // Scene units (~637.8)
        tilt: 23.439281, // degrees
        rotationPeriod: 86400, // seconds
        rotationOffset: 4.89496121, // GMST at J2000 epoch
        meshRes: 64,
        atmosphereThickness: 60, // in 10000s of meters
        cloudThickness: 2, // in 10000s of meters
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
            { meshRes: 16, distance: 500000 },
            { meshRes: 32, distance: 200000 },
            { meshRes: 64, distance: 100000 },
            { meshRes: 128, distance: 50000 },
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
        },
        radialGridConfig: {
            maxDisplayRadius: 1.5e9,
            circles: [
                { radius: 200 * Constants.kmToMeters, label: "LEO Min", style: "major" },
                { radius: 2000 * Constants.kmToMeters, label: "LEO Max", style: "major" },
                { radius: 35786 * Constants.kmToMeters, label: "MEO Max", style: "major" },
                { radius: 42164 * Constants.kmToMeters, label: "GEO", style: "major" },
                { radius: 384400000, label: 'Lunar Orbit', style: "dashed" },
                { radius: 0.929e9, label: 'SOI', style: "dashed-major", dashScale: 2 },
                { radius: 1.5e9, label: 'Hill Sphere', style: "dashed-major", dashScale: 3 }
            ],
            markerStep: 100000 * Constants.kmToMeters,
            labelMarkerStep: 100000 * Constants.kmToMeters,
            radialLines: { count: 22 },
        }
    },
    moon: {
        name: 'moon',
        symbol: '☾',
        mass: moonMass, // kg
        // Correct radius calculation: Convert meters to km, then apply desired scene scale factor (0.1)
        radius: moonRadius, // Scene units, consistent with Earth
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
            semiMajorAxis: 384400000,
            eccentricity: 0.0549,
            inclination: 5.145 * (Math.PI / 180), // Inclination in radians
            longitudeOfAscendingNode: -11.26064 * (Math.PI / 180), // Longitude of ascending node in radians
            argumentOfPeriapsis: 318.15 * (Math.PI / 180), // Argument of periapsis in radians
            mu: earthGravitationalParameter, // Gravitational parameter in m^3/s^2
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
        },
        radialGridConfig: {
            maxDisplayRadius: 14500000 * 2,
            circles: [
                { radius: 100000, label: "LLO", style: "major" },      // Major style for LLO
                { radius: 500000, label: "500km", style: "minor" },     // Minor style
                { radius: 1000000, label: "1000km", style: "minor" },    // Minor style
                { radius: 14500000, label: 'SOI', style: "dashed-major", dashScale: 2 },
            ],
            radialLines: { count: 22 },
        }
    },
    sun: {
        name: 'sun',
        mass: 1.989 * 10 ** 30,
        radius: 695700000,
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