import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import {
    earthTexture, earthSpecTexture, earthNormalTexture,
    cloudTexture, moonTexture, moonBump,
    mercuryTexture, venusTexture, venusAtmosphereTexture,
    marsTexture, marsNormalTexture, jupiterTexture, saturnTexture, saturnRingTexture,
    uranusTexture, neptuneTexture,
    ioTexture, europaTexture, ganymedeTexture, callistoTexture
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
const earthRadius = 6378136.6 * Constants.metersToKm;
const earthMass = 5.9722 * 10 ** 24; // kg
const moonRadius = 1737400 * Constants.metersToKm;
const moonMass = 7.34767309 * 10 ** 22; // kg
const earthGravitationalParameter = Constants.G * earthMass; // m^3/s^2

// Utility function to generate LODs based on radius
function generateLodLevelsForRadius(radius) {
    // Mesh resolutions for sphere geometry
    const meshResolutions = [16, 32, 64, 128];
    // Distance multipliers for LOD switching (tweak as needed)
    const distanceMultipliers = [150, 75, 30, 10];
    return meshResolutions.map((meshRes, i) => ({
        meshRes,
        distance: radius * distanceMultipliers[i]
    }));
}

export const celestialBodiesConfig = {
    barycenter: {
        name: 'barycenter',
        // No parent (root of the system)
    },
    emb: {
        name: 'emb',
        parent: 'barycenter',
        // orbitType: 'relative',
        // Optionally, add mass, radius, etc. if needed
    },
    earth: {
        name: 'earth',
        parent: 'emb',
        // orbitType: 'relative',
        symbol: '♁',
        mass: earthMass, // kg
        // Correct radius calculation: Convert meters to km, then apply desired scene scale factor (0.0001)
        radius: earthRadius, // Scene units (~637.8)
        tilt: 23.439281, // degrees
        rotationPeriod: 86400, // seconds
        rotationOffset: 4.89496121, // GMST at J2000 epoch
        oblateness: 0.0033528106647474805,
        cloudThickness: 2, // in kilometers
        addSurface: true,
        surfaceOptions: {
            addLatitudeLines: true, latitudeStep: 10,
            addLongitudeLines: true, longitudeStep: 10,
            addCountryBorders: true,
            addStates: true, addCities: true,
            addAirports: true, addSpaceports: true,
            addGroundStations: true, addObservatories: true,
            markerSize: 0.7,
            circleSegments: 8,
            circleTextureSize: 32,
            fadeStartPixelSize: 700,
            fadeEndPixelSize: 600,
            heightOffset: 0
        },
        primaryGeojsonData: geojsonDataSovereignty,
        stateGeojsonData: geojsonDataStates,
        cityData: geojsonDataCities,
        airportsData: geojsonDataAirports,
        spaceportsData: geojsonDataSpaceports,
        groundStationsData: geojsonDataGroundStations,
        observatoriesData: geojsonDataObservatories,
        addLight: true,
        lightOptions: { color: 0x6699ff, intensity: earthRadius * 10, helper: false }, // scaled to scene radius
        lodLevels: generateLodLevelsForRadius(earthRadius),
        dotPixelSizeThreshold: 1,
        soiRadius: 145,
        // --- Atmosphere parameters for volumetric raymarching ---
        atmosphere: {
            thickness: 60, // km
            densityScaleHeight: 20.0,
            rayleighScatteringCoeff: [0.0015, 0.004, 0.012],
            mieScatteringCoeff: 0.00015,
            mieAnisotropy: 0.75, // g
            numLightSteps: 4,
            sunIntensity: 6.0,
            equatorialRadius: earthRadius, // km
            polarRadius: earthRadius * (1 - 0.0033528106647474805), // km
        },
        materials: {
            createSurfaceMaterial: (tm) => {
                return new THREE.MeshPhongMaterial({
                    map: tm.getTexture('earthTexture'),
                    normalMap: tm.getTexture('earthNormalTexture'),
                    specularMap: tm.getTexture('earthSpecTexture'),
                    emissive: 0x000000,
                    shininess: 150,
                    specular: 0x888888,
                    normalScale: new THREE.Vector2(1, 1),
                });
            },
            createCloudMaterial: (tm) => new THREE.MeshLambertMaterial({
                alphaMap: tm.getTexture('cloudTexture'),
                color: 0xffffff,
                transparent: true,
                blending: THREE.NormalBlending,
                depthWrite: false,
                depthTest: true
            })
        },
        radialGridConfig: {
            maxDisplayRadius: 1.5e6,
            circles: [
                { radius: 200, label: "LEO Min", style: "major" },
                { radius: 2000, label: "LEO Max", style: "major" },
                { radius: 35786, label: "MEO Max", style: "major" },
                { radius: 42164, label: "GEO", style: "major" },
                { radius: 384400, label: 'Lunar Orbit', style: "dashed" },
                { radius: 929000, label: 'SOI', style: "dashed-major", dashScale: 2 },
                { radius: 1500000, label: 'Hill Sphere', style: "dashed-major", dashScale: 3 }
            ],
            markerStep: 100000,
            labelMarkerStep: 100000,
            radialLines: { count: 22 },
        }
    },
    moon: {
        name: 'moon',
        parent: 'emb',
        symbol: '☾',
        mass: moonMass, // kg
        // Correct radius calculation: Convert meters to km, then apply desired scene scale factor (0.1)
        radius: moonRadius, // Scene units, consistent with Earth
        rotationPeriod: 29.53058867 * Constants.secondsInDay, // synodic period
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
        lightOptions: { color: 0xffffff, intensity: moonRadius * 10, helper: false }, // scaled to scene radius
        lodLevels: generateLodLevelsForRadius(moonRadius),
        dotPixelSizeThreshold: 1,
        soiRadius: 10.3,
        orbitElements: { // Base elements, argumentOfPeriapsis might be updated dynamically
            semiMajorAxis: 384400000,
            eccentricity: 0.0549,
            inclination: 5.145 * (Math.PI / 180), // Inclination in radians
            longitudeOfAscendingNode: -11.26064 * (Math.PI / 180), // Longitude of ascending node in radians
            argumentOfPeriapsis: 318.15 * (Math.PI / 180), // Argument of periapsis in radians
            mu: earthGravitationalParameter, // Gravitational parameter in m^3/s^2
        },
        // orbitType: 'relative',
        // atmosphere: {
        //     thickness: 0, // No atmosphere
        //     densityScaleHeight: 0,
        //     rayleighScatteringCoeff: [0,0,0],
        //     mieScatteringCoeff: 0,
        //     mieAnisotropy: 0,
        //     numLightSteps: 0,
        //     sunIntensity: 0
        // },
        materials: {
            createSurfaceMaterial: (tm) => {
                const mat = new THREE.MeshPhongMaterial({
                    map: tm.getTexture('moonTexture'),
                    bumpMap: tm.getTexture('moonBump'),
                    bumpScale: 3.9
                });
                // Anisotropy is set globally by TextureManager based on settings
                return mat;
            },
            createCloudMaterial: () => null,
            createGlowMaterial: () => null
        },
        radialGridConfig: {
            maxDisplayRadius: 14500 * 2,
            circles: [
                { radius: 100, label: "LLO", style: "major" },      // Major style for LLO
                { radius: 500, label: "500km", style: "minor" },     // Minor style
                { radius: 1000, label: "1000km", style: "minor" },    // Minor style
                { radius: 14500, label: 'SOI', style: "dashed-major", dashScale: 2 },
            ],
            radialLines: { count: 22 },
        }
    },
    sun: {
        name: 'sun',
        parent: 'barycenter',
        mass: 1.989 * 10 ** 30,
        radius: 695700000,
    },
    mercury: {
        name: 'mercury',
        symbol: '☿',
        mass: 3.3011e23, // kg
        radius: 2439.7, // km
        tilt: 0.034, // degrees
        rotationPeriod: 5067000, // seconds (58.6 Earth days)
        oblateness: 0.0000,
        lodLevels: generateLodLevelsForRadius(2439.7),
        dotPixelSizeThreshold: 1,
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshPhongMaterial({
                map: tm.getTexture('mercuryTexture'),
                shininess: 5
            })
        },
        atmosphere: { thickness: 0 }, // Negligible atmosphere
        // Sphere-of-influence multiplier (planet radius * soiRadius = SOI in km)
        soiRadius: 46,
        // Radial grid to show SOI around Mercury
        radialGridConfig: {
            maxDisplayRadius: 112000,
            markerStep: 8000,
            labelMarkerStep: 40000,
            circles: [
                { radius: 5000, label: '5,000 km', style: 'minor' },
                { radius: 20000, label: '20,000 km', style: 'minor' },
                { radius: 50000, label: '50,000 km', style: 'minor' },
                { radius: 112000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
                { radius: 1500, label: 'Magnetosphere', style: 'dashed', dashScale: 1.5 }
            ],
            radialLines: { count: 22 }
        },
        parent: 'barycenter',
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 2439.7, helper: false },
    },
    venus: {
        name: 'venus',
        symbol: '♀',
        mass: 4.8675e24, // kg
        radius: 6051.8, // km
        tilt: 177.36, // degrees (retrograde rotation)
        rotationPeriod: -20997000, // seconds (-243 Earth days)
        oblateness: 0.0000,
        cloudThickness: 10, // km
        lodLevels: generateLodLevelsForRadius(6051.8),
        dotPixelSizeThreshold: 1,
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshPhongMaterial({
                map: tm.getTexture('venusTexture'),
                shininess: 10
            }),
            // Use venus atmosphere texture for clouds/haze
            createCloudMaterial: (tm) => new THREE.MeshLambertMaterial({
                map: tm.getTexture('venusAtmosphereTexture'),
                transparent: false,
                opacity: 1.0, // Adjust opacity
                blending: THREE.NormalBlending
            })
        },
        atmosphere: {
            // Increase limb fudge for a brighter bottom limb on Venus
            limbFudgeFactor: 1.0,
            hazeIntensity: 0.6,
            thickness: 100, // km
            densityScaleHeight: 15.9, // km (approx)
            rayleighScatteringCoeff: [0.01, 0.008, 0.005],
            mieScatteringCoeff: 0.015,
            mieAnisotropy: 0.7,
            numLightSteps: 4,
            sunIntensity: 12.0, // Base intensity (dynamic scaling handles distance)
            equatorialRadius: 6051.8,
            polarRadius: 6051.8,
        },
        // Sphere-of-influence multiplier for Venus
        soiRadius: 101,
        // Radial grid to show SOI around Venus
        radialGridConfig: {
            maxDisplayRadius: 613000,
            markerStep: 50000,
            labelMarkerStep: 100000,
            circles: [
                { radius: 10000, label: '10,000 km', style: 'minor' },
                { radius: 50000, label: '50,000 km', style: 'minor' },
                { radius: 200000, label: '200,000 km', style: 'minor' },
                { radius: 613000, label: 'SOI', style: 'dashed-major', dashScale: 2 }
            ],
            radialLines: { count: 22 }
        },
        parent: 'barycenter',
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 6051.8, helper: false },
    },
    mars: {
        name: 'mars',
        symbol: '♂',
        mass: 6.4171e23, // kg
        radius: 3389.5, // km
        tilt: 25.19, // degrees
        rotationPeriod: 88643, // seconds (1.026 Earth days)
        oblateness: 0.00589,
        lodLevels: generateLodLevelsForRadius(3389.5),
        dotPixelSizeThreshold: 1,
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshPhongMaterial({
                map: tm.getTexture('marsTexture'),
                shininess: 5,
                normalMap: tm.getTexture('marsNormalTexture'),
                normalScale: new THREE.Vector2(0.5, 0.5)
            })
        },
        atmosphere: {
            hazeIntensity: 0.6,
            thickness: 11, // km
            densityScaleHeight: 11.1, // km
            rayleighScatteringCoeff: [0.005, 0.002, 0.001],
            mieScatteringCoeff: 0.001,
            mieAnisotropy: 0.8,
            numLightSteps: 4,
            sunIntensity: 3.0, // Base intensity (dynamic scaling handles distance)
            equatorialRadius: 3389.5,
            polarRadius: 3389.5 * (1 - 0.00589),
        },
        // Sphere-of-influence multiplier for Mars
        soiRadius: 169,
        // Radial grid to show SOI around Mars
        radialGridConfig: {
            maxDisplayRadius: 573000,
            markerStep: 50000,
            labelMarkerStep: 100000,
            circles: [
                { radius: 10000, label: '10,000 km', style: 'minor' },
                { radius: 50000, label: '50,000 km', style: 'minor' },
                { radius: 200000, label: '200,000 km', style: 'minor' },
                { radius: 573000, label: 'SOI', style: 'dashed-major', dashScale: 2 }
            ],
            radialLines: { count: 22 }
        },
        parent: 'barycenter',
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 3389.5, helper: false },
    },
    jupiter: {
        name: 'jupiter',
        symbol: '♃',
        mass: 1.8982e27, // kg
        radius: 69911, // km (mean volumetric)
        tilt: 3.13, // degrees
        rotationPeriod: 35730, // seconds (0.41 Earth days)
        oblateness: 0.06487,
        lodLevels: generateLodLevelsForRadius(69911),
        dotPixelSizeThreshold: 1,
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshLambertMaterial({
                map: tm.getTexture('jupiterTexture')
            })
        },
        atmosphere: {
            hazeIntensity: 0.6,
            thickness: 7000, // km (absolute atmosphere height)
            densityScaleHeightFraction: 0.003, // 0.3% of radius
            rayleighScatteringCoeff: [0.024, 0.048, 0.144],
            mieScatteringCoeff: 0.012,
            mieAnisotropy: 0.5,
            numLightSteps: 4,
            sunIntensity: 3.0,
            equatorialRadius: 71492, // km
            polarRadius: 66854, // km
        },
        // Sphere-of-influence multiplier for Jupiter
        soiRadius: 690,
        // Radial grid to show SOI around Jupiter
        radialGridConfig: {
            maxDisplayRadius: 48230000,
            markerStep: 2000000,
            labelMarkerStep: 10000000,
            circles: [
                { radius: 104867, label: '1.5 Rj (Inner Belt)', style: 'dashed', dashScale: 1.5 },
                { radius: 209734, label: '3 Rj (Outer Belt)', style: 'dashed', dashScale: 2 },
                { radius: 10000000, label: '10,000,000 km', style: 'minor' },
                { radius: 30000000, label: '30,000,000 km', style: 'minor' },
                { radius: 48230000, label: 'SOI', style: 'dashed-major', dashScale: 2 }
            ],
            radialLines: { count: 22 }
        },
        parent: 'barycenter',
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 69911, helper: false },
    },
    // Galilean moons of Jupiter
    io: {
        name: 'io',
        symbol: '♃1',
        parent: 'jupiter',
        mass: 8.931938e22, // kg
        radius: 1821.6,   // km
        orbitElements: {
            semiMajorAxis: 421800000,               // m
            eccentricity: 0.0041,
            inclination: 0.036 * (Math.PI / 180),   // rad
            longitudeOfAscendingNode: 43.977 * (Math.PI / 180), // rad
            argumentOfPeriapsis: 84.129 * (Math.PI / 180),      // rad
            mu: Constants.G * 1.8982e27             // m^3/s^2 (Jupiter)
        },
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshPhongMaterial({
                map: tm.getTexture('ioTexture')
            })
        },
    },
    europa: {
        name: 'europa',
        symbol: '♃2',
        parent: 'jupiter',
        mass: 4.799844e22, // kg
        radius: 1560.8,   // km
        orbitElements: {
            semiMajorAxis: 671034000,               // m
            eccentricity: 0.009,                    
            inclination: 0.466 * (Math.PI / 180),   // rad
            longitudeOfAscendingNode: 219.106 * (Math.PI / 180),
            argumentOfPeriapsis: 88.97 * (Math.PI / 180),
            mu: Constants.G * 1.8982e27
        },
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshPhongMaterial({
                map: tm.getTexture('europaTexture')
            })
        },
    },
    ganymede: {
        name: 'ganymede',
        symbol: '♃3',
        parent: 'jupiter',
        mass: 1.4819e23,  // kg
        radius: 2634.1,   // km
        orbitElements: {
            semiMajorAxis: 1070412000,              // m
            eccentricity: 0.0013,
            inclination: 0.177 * (Math.PI / 180),   // rad
            longitudeOfAscendingNode: 63.552 * (Math.PI / 180),
            argumentOfPeriapsis: 192.417 * (Math.PI / 180),
            mu: Constants.G * 1.8982e27
        },
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshPhongMaterial({
                map: tm.getTexture('ganymedeTexture')
            })
        },
    },
    callisto: {
        name: 'callisto',
        symbol: '♃4',
        parent: 'jupiter',
        mass: 1.0759e23,  // kg
        radius: 2410.3,   // km
        orbitElements: {
            semiMajorAxis: 1882709000,              // m
            eccentricity: 0.0074,
            inclination: 0.192 * (Math.PI / 180),   // rad
            longitudeOfAscendingNode: 298.848 * (Math.PI / 180),
            argumentOfPeriapsis: 52.643 * (Math.PI / 180),
            mu: Constants.G * 1.8982e27
        },
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshPhongMaterial({
                map: tm.getTexture('callistoTexture')
            })
        },
    },
    saturn: {
        name: 'saturn',
        symbol: '♄',
        mass: 5.6834e26, // kg
        radius: 58232, // km (mean volumetric)
        tilt: 26.73, // degrees
        rotationPeriod: 38362, // seconds (0.44 Earth days)
        oblateness: 0.09796,
        lodLevels: generateLodLevelsForRadius(58232),
        dotPixelSizeThreshold: 1,
        addRings: true,
        rings: {
            innerRadius: 70000, // km (just outside Saturn's equator)
            outerRadius: 140000, // km (typical for Saturn's main rings)
            textureKey: 'saturnRingTexture',
            shininess: 15,
            emissive: 0xffffff, // bright white emissive
            emissiveIntensity: 3.0, // strong base emissive
            resolution: 256
        },
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshLambertMaterial({
                map: tm.getTexture('saturnTexture')
            })
        },
        atmosphere: {
            hazeIntensity: 0.6,
            thickness: 5800, // km
            densityScaleHeightFraction: 0.003,
            rayleighScatteringCoeff: [0.018, 0.036, 0.108],
            mieScatteringCoeff: 0.009,
            mieAnisotropy: 0.5,
            numLightSteps: 4,
            sunIntensity: 2.5,
            equatorialRadius: 60268, // km
            polarRadius: 54364, // km
        },
        // Sphere-of-influence multiplier for Saturn
        soiRadius: 946,
        // Radial grid to show SOI around Saturn
        radialGridConfig: {
            maxDisplayRadius: 55090000,
            markerStep: 2000000,
            labelMarkerStep: 10000000,
            circles: [
                { radius: 60000, label: 'Inner Belt', style: 'dashed', dashScale: 1.5 },
                { radius: 120000, label: 'Outer Belt', style: 'dashed', dashScale: 2 },
                { radius: 10000000, label: '10,000,000 km', style: 'minor' },
                { radius: 30000000, label: '30,000,000 km', style: 'minor' },
                { radius: 55090000, label: 'SOI', style: 'dashed-major', dashScale: 2 }
            ],
            radialLines: { count: 22 }
        },
        parent: 'barycenter',
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 58232, helper: false },
    },
    uranus: {
        name: 'uranus',
        symbol: '♅',
        mass: 8.6810e25, // kg
        radius: 25362, // km (mean volumetric)
        tilt: 97.77, // degrees (extreme tilt)
        rotationPeriod: -62064, // seconds (-0.72 Earth days, retrograde)
        oblateness: 0.02293,
        lodLevels: generateLodLevelsForRadius(25362),
        dotPixelSizeThreshold: 1,
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshLambertMaterial({
                map: tm.getTexture('uranusTexture')
            })
        },
        atmosphere: {
            hazeIntensity: 0.6,
            thickness: 2500, // km
            densityScaleHeightFraction: 0.003,
            rayleighScatteringCoeff: [0.012, 0.024, 0.072],
            mieScatteringCoeff: 0.006,
            mieAnisotropy: 0.5,
            numLightSteps: 4,
            sunIntensity: 1.5,
            equatorialRadius: 25559, // km
            polarRadius: 24973, // km
        },
        // Sphere-of-influence multiplier for Uranus
        soiRadius: 2039,
        // Radial grid to show SOI around Uranus
        radialGridConfig: {
            maxDisplayRadius: 51720000,
            markerStep: 2000000,
            labelMarkerStep: 10000000,
            circles: [
                { radius: 40000, label: 'Inner Belt', style: 'dashed', dashScale: 1.5 },
                { radius: 60000, label: 'Outer Belt', style: 'dashed', dashScale: 2 },
                { radius: 10000000, label: '10,000,000 km', style: 'minor' },
                { radius: 30000000, label: '30,000,000 km', style: 'minor' },
                { radius: 51720000, label: 'SOI', style: 'dashed-major', dashScale: 2 }
            ],
            radialLines: { count: 22 }
        },
        parent: 'barycenter',
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 25362, helper: false },
    },
    neptune: {
        name: 'neptune',
        symbol: '♆',
        mass: 1.02413e26, // kg
        radius: 24622, // km (mean volumetric)
        tilt: 28.32, // degrees
        rotationPeriod: 57996, // seconds (0.67 Earth days)
        oblateness: 0.01708,
        lodLevels: generateLodLevelsForRadius(24622),
        dotPixelSizeThreshold: 1,
        materials: {
            createSurfaceMaterial: (tm) => new THREE.MeshLambertMaterial({
                map: tm.getTexture('neptuneTexture')
            })
        },
        atmosphere: {
            hazeIntensity: 0.6,
            thickness: 2400, // km
            densityScaleHeightFraction: 0.003,
            rayleighScatteringCoeff: [0.012, 0.024, 0.072],
            mieScatteringCoeff: 0.006,
            mieAnisotropy: 0.5,
            numLightSteps: 4,
            sunIntensity: 1.5,
            equatorialRadius: 24764, // km
            polarRadius: 24341, // km
        },
        // Sphere-of-influence multiplier for Neptune
        soiRadius: 3508,
        // Radial grid to show SOI around Neptune
        radialGridConfig: {
            maxDisplayRadius: 86360000,
            markerStep: 4000000,
            labelMarkerStep: 20000000,
            circles: [
                { radius: 25000, label: 'Inner Belt', style: 'dashed', dashScale: 1.5 },
                { radius: 55000, label: 'Outer Belt', style: 'dashed', dashScale: 2 },
                { radius: 10000000, label: '10,000,000 km', style: 'minor' },
                { radius: 50000000, label: '50,000,000 km', style: 'minor' },
                { radius: 86360000, label: 'SOI', style: 'dashed-major', dashScale: 2 }
            ],
            radialLines: { count: 22 }
        },
        parent: 'barycenter',
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 24622, helper: false },
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
    { key: 'mercuryTexture', src: mercuryTexture },
    { key: 'venusTexture', src: venusTexture },
    { key: 'venusAtmosphereTexture', src: venusAtmosphereTexture },
    { key: 'marsTexture', src: marsTexture },
    { key: 'marsNormalTexture', src: marsNormalTexture },
    { key: 'jupiterTexture', src: jupiterTexture },
    { key: 'saturnTexture', src: saturnTexture },
    { key: 'saturnRingTexture', src: saturnRingTexture },
    { key: 'uranusTexture', src: uranusTexture },
    { key: 'neptuneTexture', src: neptuneTexture },
    { key: 'ioTexture', src: ioTexture },
    { key: 'europaTexture', src: europaTexture },
    { key: 'ganymedeTexture', src: ganymedeTexture },
    { key: 'callistoTexture', src: callistoTexture },
];

// Add other scene-wide configs if needed
export const ambientLightConfig = { color: 0xffffff, intensity: 0.1 };
export const bloomConfig = { strength: 0.3, radius: 0.999, threshold: 0.99 };

// Orbit colors for each celestial body orbit
export const orbitColors = {
    emb: 0x888888,
    earth: 0x3366cc,
    moon: 0xcccccc,
    mercury: 0x999999,
    venus: 0xffcc66,
    mars: 0xff3300,
    jupiter: 0xff9933,
    saturn: 0xffff66,
    uranus: 0x66ccff,
    neptune: 0x3366ff,
    io: 0x999999,
    europa: 0x999999,
    ganymede: 0x999999,
    callisto: 0x999999
}; 