/* -----------------------------------------------------------
 *  Celestial Bodies Configuration  •  rewritten for clarity
 * -----------------------------------------------------------
 *  – Imports
 *  – Constants & helpers
 *  – Texture lookup table
 *  – Body definitions (grouped: barycenters ▸ planets ▸ moons)
 *  – Aggregate map + fast NAIF lookup
 *  – Scene-wide settings
 * ----------------------------------------------------------- */

import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import {
    earthTexture, earthRoughnessTexture, earthNormalTexture,
    cloudTexture, moonTexture, moonNormalTexture,
    mercuryTexture, mercuryNormalTexture, venusTexture, venusAtmosphereTexture,
    marsTexture, marsNormalTexture, jupiterTexture, saturnTexture, saturnRingTexture,
    uranusRingTexture, neptuneRingTexture,
    uranusTexture, neptuneTexture,
    ioTexture, europaTexture, ganymedeTexture, callistoTexture,
    plutoTexture, plutoNormalTexture, charonTexture
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

/* ---------- Constants ---------- */
const KM_PER_M = Constants.metersToKm;
const EARTH_RAD = 6_378_136.6 * KM_PER_M;
const MOON_RAD = 1_737_400 * KM_PER_M;

/* ---------- Utility ---------- */
const generateLodLevelsForRadius = radius => {
    const res = [16, 32, 64, 128];
    const dist = [150, 75, 30, 10];
    return res.map((meshRes, i) => ({ meshRes, distance: radius * dist[i] }));
};

/* ---------- Textures ---------- */
export const textureDefinitions = [
    { key: 'earthTexture', src: earthTexture },
    { key: 'earthRoughnessTexture', src: earthRoughnessTexture },
    { key: 'earthNormalTexture', src: earthNormalTexture },
    { key: 'cloudTexture', src: cloudTexture },
    { key: 'moonTexture', src: moonTexture },
    { key: 'moonNormalTexture', src: moonNormalTexture },
    { key: 'mercuryTexture', src: mercuryTexture },
    { key: 'mercuryNormalTexture', src: mercuryNormalTexture },
    { key: 'venusTexture', src: venusTexture },
    { key: 'venusAtmosphereTexture', src: venusAtmosphereTexture },
    { key: 'marsTexture', src: marsTexture },
    { key: 'marsNormalTexture', src: marsNormalTexture },
    { key: 'jupiterTexture', src: jupiterTexture },
    { key: 'saturnTexture', src: saturnTexture },
    { key: 'saturnRingTexture', src: saturnRingTexture },
    { key: 'uranusRingTexture', src: uranusRingTexture },
    { key: 'neptuneRingTexture', src: neptuneRingTexture },
    { key: 'uranusTexture', src: uranusTexture },
    { key: 'neptuneTexture', src: neptuneTexture },
    { key: 'ioTexture', src: ioTexture },
    { key: 'europaTexture', src: europaTexture },
    { key: 'ganymedeTexture', src: ganymedeTexture },
    { key: 'callistoTexture', src: callistoTexture },
    { key: 'plutoTexture', src: plutoTexture },
    { key: 'plutoNormalTexture', src: plutoNormalTexture },
    { key: 'charonTexture', src: charonTexture },
];

/* =======================================================================
 * 1) Barycenters & System Anchors
 * ===================================================================== */
const barycenters = {
    barycenter: { name: 'ss_barycenter', naif_id: 0, type: 'barycenter' },
    emb: { name: 'emb', naif_id: 3, parent: 'ss_barycenter', type: 'barycenter' },
    mercury_barycenter: { name: 'mercury_barycenter', naif_id: 1, parent: 'ss_barycenter', type: 'barycenter' },
    venus_barycenter: { name: 'venus_barycenter', naif_id: 2, parent: 'ss_barycenter', type: 'barycenter' },
    mars_barycenter: { name: 'mars_barycenter', naif_id: 4, parent: 'ss_barycenter', type: 'barycenter' },
    jupiter_barycenter: { name: 'jupiter_barycenter', naif_id: 5, parent: 'ss_barycenter', type: 'barycenter' },
    saturn_barycenter: { name: 'saturn_barycenter', naif_id: 6, parent: 'ss_barycenter', type: 'barycenter' },
    uranus_barycenter: { name: 'uranus_barycenter', naif_id: 7, parent: 'ss_barycenter', type: 'barycenter' },
    neptune_barycenter: { name: 'neptune_barycenter', naif_id: 8, parent: 'ss_barycenter', type: 'barycenter' },
    pluto_barycenter: { name: 'pluto_barycenter', naif_id: 9, parent: 'ss_barycenter', type: 'barycenter' },
};

/* =======================================================================
 * 2) Planets
 * ===================================================================== */
const planets = {
    /* -------- Earth -------- */
    earth: {
        name: 'earth', parent: 'emb', naif_id: 399, symbol: '♁',
        radius: EARTH_RAD, rotationOffset: 4.89496121, oblateness: 0.0033528106647474805,
        cloudThickness: 5,
        primaryGeojsonData: geojsonDataSovereignty,
        stateGeojsonData: geojsonDataStates,
        cityData: geojsonDataCities,
        airportsData: geojsonDataAirports,
        spaceportsData: geojsonDataSpaceports,
        groundStationsData: geojsonDataGroundStations,
        observatoriesData: geojsonDataObservatories,
        addLight: true,
        lightOptions: { color: 0x6699ff, intensity: EARTH_RAD * 10, helper: false },
        lodLevels: generateLodLevelsForRadius(EARTH_RAD),
        soiRadius: 577178,
        atmosphere: {
            thickness: 60, densityScaleHeight: 20, hazeIntensity: 3,
            scaleHeightMultiplier: 4.0,
            rayleighScaleHeight: 8, mieScaleHeight: 1.2,
            rayleighScatteringCoeff: [0.0015, 0.004, 0.012],
            mieScatteringCoeff: 0.00015, mieAnisotropy: 0.75,
            numLightSteps: 2, sunIntensity: 6,
            equatorialRadius: EARTH_RAD,
            polarRadius: EARTH_RAD * (1 - 0.0033528106647474805),
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'earthTexture',
                normalMapKey: 'earthNormalTexture',
                roughnessMap: 'earthRoughnessTexture',
                params: {
                    normalScale: new THREE.Vector2(0.5, 0.5),
                    roughness: 0.9, metalness: 0.0,
                }
            },
            createCloudMaterial: tm => new THREE.MeshLambertMaterial({
                alphaMap: tm.getTexture('cloudTexture'),
                color: 0xffffff, transparent: true,
                blending: THREE.NormalBlending,
                depthWrite: false, depthTest: true,
            }),
        },
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
    },

    /* -------- Mercury -------- */
    mercury: {
        name: 'mercury', parent: 'mercury_barycenter', naif_id: 199, symbol: '☿',
        radius: 2439.7, rotationPeriod: 5_067_000, oblateness: 0,
        lodLevels: generateLodLevelsForRadius(2439.7),
        soiRadius: 112397,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'mercuryTexture',
                normalMapKey: 'mercuryNormalTexture',
                params: {
                    normalScale: new THREE.Vector2(0.5, 0.5),
                    roughness: 0.7, metalness: 0.1,
                }
            },
        },
        radialGridConfig: {
            markerStep: 8_000, labelMarkerStep: 40_000,
            circles: [
                { radius: 5_000, label: '5,000 km', style: 'minor' },
                { radius: 20_000, label: '20,000 km', style: 'minor' },
                { radius: 50_000, label: '50,000 km', style: 'minor' },
                { radius: 112_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
                { radius: 1_500, label: 'Magnetosphere', style: 'dashed', dashScale: 1.5 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 2439.7, helper: false },
    },

    /* -------- Venus -------- */
    venus: {
        name: 'venus', parent: 'venus_barycenter', naif_id: 299, symbol: '♀',
        radius: 6051.8, rotationPeriod: -20_997_000, oblateness: 0,
        cloudThickness: 10,
        lodLevels: generateLodLevelsForRadius(6051.8),
        soiRadius: 616183,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'venusTexture',
                params: {
                    roughness: 0.7, metalness: 0.1,
                }
            },
            createCloudMaterial: tm => {
                const matParams = { transparent: false, opacity: 1, blending: THREE.NormalBlending };
                const map = tm.getTexture('venusAtmosphereTexture');
                if (map) matParams.map = map;
                return new THREE.MeshLambertMaterial(matParams);
            },
        },
        atmosphere: {
            limbFudgeFactor: 1, hazeIntensity: 3,
            scaleHeightMultiplier: 2.5,
            thickness: 100, densityScaleHeight: 15.9,
            rayleighScaleHeight: 15.9, mieScaleHeight: 1.2,
            rayleighScatteringCoeff: [0.01, 0.008, 0.005],
            mieScatteringCoeff: 0.015, mieAnisotropy: 0.7,
            numLightSteps: 2, sunIntensity: 12,
            equatorialRadius: 6051.8, polarRadius: 6051.8,
        },
        radialGridConfig: {
            markerStep: 50_000, labelMarkerStep: 100_000,
            circles: [
                { radius: 10_000, label: '10,000 km', style: 'minor' },
                { radius: 50_000, label: '50,000 km', style: 'minor' },
                { radius: 200_000, label: '200,000 km', style: 'minor' },
                { radius: 613_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 6051.8, helper: false },
    },

    /* -------- Mars -------- */
    mars: {
        name: 'mars', parent: 'mars_barycenter', naif_id: 499, symbol: '♂',
        radius: 3389.5, rotationPeriod: 88_643, oblateness: 0.00589,
        lodLevels: generateLodLevelsForRadius(3389.5),
        soiRadius: 577178,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'marsTexture',
                normalMapKey: 'marsNormalTexture',
                params: {
                    normalScale: new THREE.Vector2(0.5, 0.5),
                    roughness: 0.8, metalness: 0.1,
                }
            },
        },
        atmosphere: {
            hazeIntensity: 4.6, thickness: 11, densityScaleHeight: 11.1,
            scaleHeightMultiplier: 4.5,
            rayleighScaleHeight: 11.1, mieScaleHeight: 1.2,
            rayleighScatteringCoeff: [0.005, 0.002, 0.001],
            mieScatteringCoeff: 0.001, mieAnisotropy: 0.8,
            numLightSteps: 2, sunIntensity: 3,
            equatorialRadius: 3389.5, polarRadius: 3389.5 * (1 - 0.00589),
        },
        radialGridConfig: {
            markerStep: 50_000, labelMarkerStep: 100_000,
            circles: [
                { radius: 10_000, label: '10,000 km', style: 'minor' },
                { radius: 50_000, label: '50,000 km', style: 'minor' },
                { radius: 200_000, label: '200,000 km', style: 'minor' },
                { radius: 573_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 3389.5, helper: false },
    },

    /* -------- Jupiter -------- */
    jupiter: {
        name: 'jupiter', parent: 'jupiter_barycenter', naif_id: 599, symbol: '♃',
        radius: 69_911, rotationPeriod: 35_730, oblateness: 0.06487,
        lodLevels: generateLodLevelsForRadius(69_911),
        soiRadius: 48198595,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'jupiterTexture',
                params: {
                    roughness: 0.9, metalness: 0.0,
                }
            },
        },
        atmosphere: {
            limbFudgeFactor: 1, hazeIntensity: 3,
            scaleHeightMultiplier: 6.0,
            thickness: 100, densityScaleHeight: 100.9,
            rayleighScaleHeight: 190.9, mieScaleHeight: 28,
            rayleighScatteringCoeff: [0.005, 0.007, 0.012],
            mieScatteringCoeff: 0.015, mieAnisotropy: 0.7,
            numLightSteps: 2, sunIntensity: 5,
            equatorialRadius: 71_492, polarRadius: 66_854,
        },
        radialGridConfig: {
            markerStep: 2_000_000, labelMarkerStep: 10_000_000,
            circles: [
                { radius: 104_867, label: '1.5 Rj (Inner Belt)', style: 'dashed', dashScale: 1.5 },
                { radius: 209_734, label: '3 Rj (Outer Belt)', style: 'dashed', dashScale: 2 },
                { radius: 10_000_000, label: '10,000,000 km', style: 'minor' },
                { radius: 30_000_000, label: '30,000,000 km', style: 'minor' },
                { radius: 48_230_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 69_911, helper: false },
    },

    /* -------- Saturn -------- */
    saturn: {
        name: 'saturn', parent: 'saturn_barycenter', naif_id: 699, symbol: '♄',
        mass: 5.6834e26, radius: 58_232, tilt: 26.73,
        rotationPeriod: 38_362, oblateness: 0.09796,
        lodLevels: generateLodLevelsForRadius(58_232),
        soiRadius: 54539583, addRings: true,
        rings: {
            innerRadius: 70_000, outerRadius: 140_000,
            textureKey: 'saturnRingTexture',
            shininess: 15, emissive: 0xffffff,
            emissiveIntensity: 3, resolution: 256,
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'saturnTexture',
                params: {
                    roughness: 0.9, metalness: 0.0,
                }
            },
        },
        atmosphere: {
            limbFudgeFactor: 1, hazeIntensity: 3,
            scaleHeightMultiplier: 20.0,
            thickness: 100, densityScaleHeight: 100.9,
            rayleighScaleHeight: 190.9, mieScaleHeight: 12,
            rayleighScatteringCoeff: [0.004, 0.007, 0.013],
            mieScatteringCoeff: 0.015, mieAnisotropy: 0.7,
            numLightSteps: 2, sunIntensity: 12,
            equatorialRadius: 60_268, polarRadius: 54_364,
        },
        radialGridConfig: {
            markerStep: 2_000_000, labelMarkerStep: 10_000_000,
            circles: [
                { radius: 60_000, label: 'Inner Belt', style: 'dashed', dashScale: 1.5 },
                { radius: 120_000, label: 'Outer Belt', style: 'dashed', dashScale: 2 },
                { radius: 10_000_000, label: '10,000,000 km', style: 'minor' },
                { radius: 30_000_000, label: '30,000,000 km', style: 'minor' },
                { radius: 55_090_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 58_232, helper: false },
    },

    /* -------- Uranus -------- */
    uranus: {
        name: 'uranus', parent: 'uranus_barycenter', naif_id: 799, symbol: '♅',
        mass: 8.6810e25, radius: 25_362, tilt: 97.77, rotationPeriod: -62_064,
        oblateness: 0.02293,
        lodLevels: generateLodLevelsForRadius(25_362),
        soiRadius: 51755377, addRings: true,
        rings: {
            innerRadius: 41000,
            outerRadius: 51500,
            textureKey: 'uranusRingTexture',
            shininess: 1,
            emissive: 0xffffff,
            emissiveIntensity: 10,
            resolution: 256,
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'uranusTexture',
                params: {
                    roughness: 0.95, metalness: 0.0,
                }
            },
        },
        atmosphere: {
            limbFudgeFactor: 1, hazeIntensity: 1.5,
            scaleHeightMultiplier: 20.5,
            thickness: 100, densityScaleHeight: 100.9,
            rayleighScaleHeight: 190.9, mieScaleHeight: 20,
            rayleighScatteringCoeff: [0.006, 0.009, 0.015],
            mieScatteringCoeff: 0.015, mieAnisotropy: 0.7,
            numLightSteps: 2, sunIntensity: 12,
            equatorialRadius: 25_559, polarRadius: 24_973,
        },
        radialGridConfig: {
            markerStep: 2_000_000, labelMarkerStep: 10_000_000,
            circles: [
                { radius: 40_000, label: 'Inner Belt', style: 'dashed', dashScale: 1.5 },
                { radius: 60_000, label: 'Outer Belt', style: 'dashed', dashScale: 2 },
                { radius: 10_000_000, label: '10,000,000 km', style: 'minor' },
                { radius: 30_000_000, label: '30,000,000 km', style: 'minor' },
                { radius: 51_720_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 25_362, helper: false },
    },

    /* -------- Neptune -------- */
    neptune: {
        name: 'neptune', parent: 'neptune_barycenter', naif_id: 899, symbol: '♆',
        mass: 1.02413e26, radius: 24_622, tilt: 28.32, rotationPeriod: 57_996,
        oblateness: 0.01708,
        lodLevels: generateLodLevelsForRadius(24_622),
        soiRadius: 86645467, addRings: true,
        rings: {
            innerRadius: 62_000, outerRadius: 65_000,
            textureKey: 'neptuneRingTexture',
            shininess: 15, emissive: 0xffffff,
            emissiveIntensity: 30, resolution: 256,
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'neptuneTexture',
                params: {
                    roughness: 0.95, metalness: 0.0,
                }
            },
        },
        atmosphere: {
            limbFudgeFactor: 1, hazeIntensity: 1.5,
            scaleHeightMultiplier: 80.5,
            thickness: 100, densityScaleHeight: 100.9,
            rayleighScaleHeight: 190.9, mieScaleHeight: 30,
            rayleighScatteringCoeff: [0.006, 0.009, 0.015],
            mieScatteringCoeff: 0.015, mieAnisotropy: 0.7,
            numLightSteps: 2, sunIntensity: 12,
            equatorialRadius: 24_764, polarRadius: 24_341,
        },
        radialGridConfig: {
            markerStep: 4_000_000, labelMarkerStep: 20_000_000,
            circles: [
                { radius: 25_000, label: 'Inner Belt', style: 'dashed', dashScale: 1.5 },
                { radius: 55_000, label: 'Outer Belt', style: 'dashed', dashScale: 2 },
                { radius: 10_000_000, label: '10,000,000 km', style: 'minor' },
                { radius: 50_000_000, label: '50,000,000 km', style: 'minor' },
                { radius: 86_360_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 24_622, helper: false },
    },

    /* -------- Pluto -------- */
    pluto: {
        name: 'pluto', parent: 'pluto_barycenter', naif_id: 999, symbol: '♇',
        mass: 1.303e22, radius: 1_188.3, tilt: 122.472,
        rotationPeriod: 6.38723 * Constants.daysInYear, oblateness: 0.02488,
        lodLevels: generateLodLevelsForRadius(1_188.3),
        soiRadius: 1_200_000,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'plutoTexture',
                normalMapKey: 'plutoNormalTexture',
                params: {
                    roughness: 0.8, metalness: 0.05,
                }
            },
        },
        radialGridConfig: {
            markerStep: 100_000, labelMarkerStep: 500_000,
            circles: [
                { radius: 100_000, label: '100,000 km', style: 'minor' },
                { radius: 1_200_000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: 1_188.3, helper: false },
    },

};
const stars = {
    /* -------- Sun -------- */
    sun: { name: 'sun', naif_id: 10, parent: 'ss_barycenter', mass: 1.989e30, radius: 695_700, type: 'star' },
};
/* =======================================================================
 * 3) Moons  (only unique fields shown)
 * ===================================================================== */
const moons = {
    /* Earth */
    moon: {
        name: 'moon', parent: 'emb', naif_id: 301, symbol: '☾',
        radius: MOON_RAD, rotationPeriod: 29.53058867 * Constants.secondsInDay,
        lodLevels: generateLodLevelsForRadius(MOON_RAD),
        soiRadius: 66170,
        missionsData: geojsonDataMissions,
        addLight: true,
        lightOptions: { color: 0xffffff, intensity: MOON_RAD * 10, helper: false },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'moonTexture',
                normalMapKey: 'moonNormalTexture',
                params: {
                    normalScale: new THREE.Vector2(0.5, 0.5),
                    roughness: 0.7, metalness: 0.1,
                }
            },
        },
        radialGridConfig: {
            circles: [
                { radius: 100, label: 'LLO', style: 'major' },
                { radius: 500, label: '500 km', style: 'minor' },
                { radius: 1_000, label: '1,000 km', style: 'minor' },
                { radius: 14_500, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },
    },

    /* Jupiter (Galileans) */
    io: {
        name: 'io',
        naif_id: 501,
        parent: 'jupiter_barycenter',
        mass: 8.9319e22,
        radius: 1_821.6,
        symbol: '🜋',
        lodLevels: generateLodLevelsForRadius(1_821.6),
        soiRadius: 7169,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'ioTexture',
                params: { roughness: 0.7, metalness: 0.1 }
            },
        },
    },
    europa: {
        name: 'europa',
        naif_id: 502,
        parent: 'jupiter_barycenter',
        mass: 4.7998e22,
        radius: 1_560.8,
        symbol: '⟁',
        lodLevels: generateLodLevelsForRadius(1_560.8),
        soiRadius: 11700,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'europaTexture',
                params: {}
            },
        },
    },
    ganymede: {
        name: 'ganymede',
        naif_id: 503,
        parent: 'jupiter_barycenter',
        mass: 1.4819e23,
        radius: 2_634.1,
        symbol: '⟁⟁',
        lodLevels: generateLodLevelsForRadius(2_634.1),
        soiRadius: 29800,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'ganymedeTexture',
                params: {}
            },
        },
    },
    callisto: {
        name: 'callisto',
        naif_id: 504,
        parent: 'jupiter_barycenter',
        mass: 1.0759e23,
        radius: 2_410.3,
        symbol: '⟁⟁⟁',
        lodLevels: generateLodLevelsForRadius(2_410.3),
        soiRadius: 74300,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'callistoTexture',
                params: {}
            },
        },
    },

    /* Mars */
    deimos: {
        name: 'deimos',
        naif_id: 402,
        parent: 'mars_barycenter',
        mass: 1.4762e15,
        radius: 6.2,
        symbol: '⧫',
        lodLevels: generateLodLevelsForRadius(6.2),
        soiRadius: 4.18,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'deimosTexture',
                params: {
                    roughness: 0.8, metalness: 0.1,
                }
            },
        },
    },
    phobos: {
        name: 'phobos',
        naif_id: 401,
        parent: 'mars_barycenter',
        mass: 1.0659e16,
        radius: 11.1,
        symbol: '◉',
        lodLevels: generateLodLevelsForRadius(11.1),
        soiRadius: 2.44,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'phobosTexture',
                params: {
                    roughness: 0.8, metalness: 0.1,
                }
            },
        },
    },

    /* Saturn (selection) */
    mimas: {
        name: 'mimas',
        naif_id: 601,
        parent: 'saturn_barycenter',
        radius: 198.2,
        symbol: 'M',
        lodLevels: generateLodLevelsForRadius(198.2),
        soiRadius: 334,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'mimasTexture',
                params: {}
            },
        },
    },
    enceladus: {
        name: 'enceladus',
        naif_id: 602,
        parent: 'saturn_barycenter',
        radius: 252.1,
        symbol: 'E',
        lodLevels: generateLodLevelsForRadius(252.1),
        soiRadius: 497,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {}
            },
        },
    },
    tethys: {
        name: 'tethys',
        naif_id: 603,
        parent: 'saturn_barycenter',
        radius: 531.1,
        symbol: 'T',
        lodLevels: generateLodLevelsForRadius(531.1),
        soiRadius: 1012,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'tethysTexture',
                params: {}
            },
        },
    },
    dione: {
        name: 'dione',
        naif_id: 604,
        parent: 'saturn_barycenter',
        radius: 561.4,
        symbol: 'D',
        lodLevels: generateLodLevelsForRadius(561.4),
        soiRadius: 1615,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'dioneTexture',
                params: {}
            },
        },
    },
    rhea: {
        name: 'rhea',
        naif_id: 605,
        parent: 'saturn_barycenter',
        radius: 763.8,
        symbol: 'R',
        lodLevels: generateLodLevelsForRadius(763.8),
        soiRadius: 3064,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'rheaTexture',
                params: {}
            },
        },
    },
    titan: {
        name: 'titan',
        naif_id: 606,
        parent: 'saturn_barycenter',
        radius: 2_574.7,
        symbol: 'Ti',
        lodLevels: generateLodLevelsForRadius(2_574.7),
        soiRadius: 53300,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'titanTexture',
                params: {}
            },
        },
    },
    iapetus: {
        name: 'iapetus',
        naif_id: 608,
        parent: 'saturn_barycenter',
        radius: 734.5,
        symbol: 'Ia',
        lodLevels: generateLodLevelsForRadius(734.5),
        soiRadius: 90300,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'iapetusTexture',
                params: {}
            },
        },
    },

    /* Uranus (selection) */
    ariel: {
        name: 'ariel',
        naif_id: 701,
        parent: 'uranus_barycenter',
        radius: 578.9,
        symbol: 'A',
        lodLevels: generateLodLevelsForRadius(578.9),
        soiRadius: 1300,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'arielTexture',
                params: {}
            },
        },
    },
    umbriel: {
        name: 'umbriel',
        naif_id: 702,
        parent: 'uranus_barycenter',
        radius: 584.7,
        symbol: 'U',
        lodLevels: generateLodLevelsForRadius(584.7),
        soiRadius: 1900,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'umbrielTexture',
                params: {}
            },
        },
    },
    titania: {
        name: 'titania',
        naif_id: 703,
        parent: 'uranus_barycenter',
        radius: 788.9,
        symbol: 'Ti',
        lodLevels: generateLodLevelsForRadius(788.9),
        soiRadius: 4200,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'titaniaTexture',
                params: {}
            },
        },
    },
    oberon: {
        name: 'oberon',
        naif_id: 704,
        parent: 'uranus_barycenter',
        radius: 761.4,
        symbol: 'O',
        lodLevels: generateLodLevelsForRadius(761.4),
        soiRadius: 6000,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'oberonTexture',
                params: {}
            },
        },
    },
    miranda: {
        name: 'miranda',
        naif_id: 705,
        parent: 'uranus_barycenter',
        radius: 235.8,
        symbol: 'M',
        lodLevels: generateLodLevelsForRadius(235.8),
        soiRadius: 240,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'mirandaTexture',
                params: {}
            },
        },
    },

    /* Neptune (selection) */
    triton: {
        name: 'triton',
        naif_id: 801,
        parent: 'neptune_barycenter',
        radius: 1_353.4,
        symbol: 'Tr',
        lodLevels: generateLodLevelsForRadius(1_353.4),
        soiRadius: 354800,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'tritonTexture',
                params: {}
            },
        },
    },
    proteus: {
        name: 'proteus',
        naif_id: 802,
        parent: 'neptune_barycenter',
        radius: 210,
        symbol: 'P',
        lodLevels: generateLodLevelsForRadius(210),
        soiRadius: 1200,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'proteusTexture',
                params: {}
            },
        },
    },
    nereid: {
        name: 'nereid',
        naif_id: 803,
        parent: 'neptune_barycenter',
        radius: 170,
        symbol: 'Ne',
        lodLevels: generateLodLevelsForRadius(170),
        soiRadius: 53800,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'nereidTexture',
                params: {}
            },
        },
    },

    /* Pluto */
    charon: {
        name: 'charon',
        naif_id: 901,
        parent: 'pluto_barycenter',
        radius: 606,
        symbol: '⚫',
        lodLevels: generateLodLevelsForRadius(606),
        soiRadius: 2200,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'charonTexture',
                params: {}
            },
        },
    },
    nix: {
        name: 'nix',
        naif_id: 902,
        parent: 'pluto_barycenter',
        radius: 25,
        symbol: 'N',
        lodLevels: generateLodLevelsForRadius(25),
        soiRadius: 1100,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'nixTexture',
                params: {}
            },
        },
    },
    hydra: {
        name: 'hydra',
        naif_id: 903,
        parent: 'pluto_barycenter',
        radius: 30,
        symbol: 'H',
        lodLevels: generateLodLevelsForRadius(30),
        soiRadius: 1400,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'hydraTexture',
                params: {}
            },
        },
    },
    kerberos: {
        name: 'kerberos',
        naif_id: 904,
        parent: 'pluto_barycenter',
        radius: 12,
        symbol: 'K',
        lodLevels: generateLodLevelsForRadius(12),
        soiRadius: 900,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'kerberosTexture',
                params: {}
            },
        },
    },
    styx: {
        name: 'styx',
        naif_id: 905,
        parent: 'pluto_barycenter',
        radius: 7,
        symbol: 'S',
        lodLevels: generateLodLevelsForRadius(7),
        soiRadius: 700,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'styxTexture',
                params: {}
            },
        },
    },
};

/* =======================================================================
 * 4) Aggregation
 * ===================================================================== */
export const celestialBodiesConfig = {
    ...barycenters,
    ...planets,
    ...moons,
    ...stars,
};

export const naifIdToConfig = Object.fromEntries(
    Object.values(celestialBodiesConfig)
        .filter(cfg => typeof cfg.naif_id === 'number')
        .map(cfg => [cfg.naif_id, cfg]),
);

/* =======================================================================
 * 5) Scene-wide options
 * ===================================================================== */
export const ambientLightConfig = { color: 0xffffff, intensity: 0.1 };
export const bloomConfig = { strength: 0.3, radius: 0.999, threshold: 0.99 };

export const orbitColors = {
    emb: 0x888888, earth: 0x3366cc, moon: 0xcccccc,
    mercury: 0x999999, venus: 0xffcc66, mars: 0xff3300,
    jupiter: 0xff9933, saturn: 0xffff66, uranus: 0x66ccff,
    neptune: 0x3366ff,
    io: 0x999999, europa: 0x999999, ganymede: 0x999999, callisto: 0x999999,
    ss_barycenter: 0x999999, jupiter_barycenter: 0x999999,
    saturn_barycenter: 0x999999, uranus_barycenter: 0x999999,
    neptune_barycenter: 0x999999, pluto_barycenter: 0x999999,
    barycenter: 0x999999, sun: 0xffffff,
};

// Export the individual body groups for direct usage
export { barycenters, planets, moons, stars };
