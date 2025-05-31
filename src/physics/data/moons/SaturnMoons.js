import {PhysicsConstants} from '../../core/PhysicsConstants.js';
const mimasMass = 3.7493e19;
const enceladusMass = 1.08022e20;
const tethysMass = 6.17449e20;
const dioneMass = 1.095452e21;
const rheaMass = 2.306518e21;
const titanMass = 1.3452e23;
const iapetusMass = 1.805635e21;
export default [
    {
        name: 'mimas',
        naif_id: 601,
        parent: 'saturn_barycenter',
        type: 'moon',
        symbol: 'Ⅰ',
        mass: mimasMass, // kg
        radius: 198.2, // km (mean radius)
        GM: PhysicsConstants.PHYSICS.G * mimasMass, // km³/s²
        isDwarf: true, // Small moon
        density: 1148, // kg/m³
        rotationPeriod: 0.942422 * 24 * 3600, // Synchronous
        orbitalPeriod: 0.942422 * 24 * 3600, // days to seconds
        orbitalElements: {
            semiMajorAxis: 185539.0,
            eccentricity: 0.0196,
            inclination: 1.574,
            longitudeOfAscendingNode: 66.2,
            argumentOfPeriapsis: 160.4,
            meanAnomalyAtEpoch: 275.3,
            epoch: 2451545.0,
            referenceFrame: 'saturn_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'mimasTexture',
                params: { roughness: 0.8, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: { // Herschel Crater, etc.
            herschelCraterDiameter: 139 // km
        },
        // Orientation (IAU 2023/2025)
        poleRA: 40.66, // deg at J2000.0, -0.036*T per century
        poleDec: 83.52, // deg at J2000.0, -0.004*T per century
        spin: 42.39, // deg at J2000.0
        spinRate: 381.9945550, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'enceladus',
        naif_id: 602,
        parent: 'saturn_barycenter',
        type: 'moon',
        symbol: 'Ⅱ',
        mass: enceladusMass, // kg
        radius: 252.1, // km (mean radius)
        GM: PhysicsConstants.PHYSICS.G * enceladusMass, // km³/s²
        density: 1609, // kg/m³
        rotationPeriod: 1.370218 * 24 * 3600, // Synchronous
        orbitalPeriod: 1.370218 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 238042.0,
            eccentricity: 0.0047,
            inclination: 0.009,
            longitudeOfAscendingNode: 0.0,
            argumentOfPeriapsis: 119.5,
            meanAnomalyAtEpoch: 57.0,
            epoch: 2451545.0,
            referenceFrame: 'saturn_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: { roughness: 0.3, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.05 } // Slight glow for cryovolcanism
            }
        },
        lodLevelsKey: 'default',
        details: {
            cryovolcanism: true,
            subsurfaceOcean: true,
            tigerStripes: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 40.66, // deg at J2000.0, -0.036*T per century
        poleDec: 83.52, // deg at J2000.0, -0.004*T per century
        spin: 257.33, // deg at J2000.0
        spinRate: 262.7318996, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'tethys',
        naif_id: 603,
        parent: 'saturn_barycenter',
        type: 'moon',
        symbol: 'Ⅲ',
        mass: tethysMass, // kg
        radius: 531.1, // km (mean radius)
        GM: PhysicsConstants.PHYSICS.G * tethysMass, // km³/s²
        density: 973, // kg/m³ (low density - mostly ice)
        rotationPeriod: 1.887802 * 24 * 3600, // Synchronous
        orbitalPeriod: 1.887802 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 294672.0,
            eccentricity: 0.0001,
            inclination: 1.091,
            longitudeOfAscendingNode: 273.0,
            argumentOfPeriapsis: 335.3,
            meanAnomalyAtEpoch: 0.0,
            epoch: 2451545.0,
            referenceFrame: 'saturn_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'tethysTexture',
                params: { roughness: 0.7, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            odysseusCraterDiameter: 450, // km
            ithacaChasmaLength: 2000 // km
        },
        // Orientation (IAU 2023/2025)
        poleRA: 40.66, // deg at J2000.0, -0.036*T per century
        poleDec: 83.52, // deg at J2000.0, -0.004*T per century
        spin: 0.00, // deg at J2000.0
        spinRate: 190.6979085, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'dione',
        naif_id: 604,
        parent: 'saturn_barycenter',
        type: 'moon',
        symbol: 'Ⅳ',
        mass: dioneMass, // kg
        radius: 561.4, // km (mean radius)
        GM: PhysicsConstants.PHYSICS.G * dioneMass, // km³/s²
        density: 1476, // kg/m³
        rotationPeriod: 2.736915 * 24 * 3600, // Synchronous
        orbitalPeriod: 2.736915 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 377415.0,
            eccentricity: 0.0022,
            inclination: 0.028,
            longitudeOfAscendingNode: 0.0,
            argumentOfPeriapsis: 116.0,
            meanAnomalyAtEpoch: 212.0,
            epoch: 2451545.0,
            referenceFrame: 'saturn_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'dioneTexture',
                params: { roughness: 0.6, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            wispyTerrain: true // Bright ice cliffs
        },
        // Orientation (IAU 2023/2025)
        poleRA: 40.66, // deg at J2000.0, -0.036*T per century
        poleDec: 83.52, // deg at J2000.0, -0.004*T per century
        spin: 357.00, // deg at J2000.0
        spinRate: 131.5349316, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'rhea',
        naif_id: 605,
        parent: 'saturn_barycenter',
        type: 'moon',
        symbol: 'Ⅴ',
        mass: rheaMass, // kg
        radius: 763.8, // km (mean radius)
        GM: PhysicsConstants.PHYSICS.G * rheaMass, // km³/s²
        density: 1236, // kg/m³
        rotationPeriod: 4.518212 * 24 * 3600, // Synchronous
        orbitalPeriod: 4.518212 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 527108.0,
            eccentricity: 0.001,
            inclination: 0.345,
            longitudeOfAscendingNode: 133.7,
            argumentOfPeriapsis: 44.3,
            meanAnomalyAtEpoch: 31.5,
            epoch: 2451545.0,
            referenceFrame: 'saturn_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'rheaTexture',
                params: { roughness: 0.7, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            possibleRingSystem: false // Early claims, largely refuted
        },
        // Orientation (IAU 2023/2025)
        poleRA: 40.66, // deg at J2000.0, -0.036*T per century
        poleDec: 83.52, // deg at J2000.0, -0.004*T per century
        spin: 90.00, // deg at J2000.0
        spinRate: 79.6900478, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'titan',
        naif_id: 606,
        parent: 'saturn_barycenter',
        type: 'moon',
        symbol: 'Ⅵ',
        mass: titanMass, // kg (largest moon of Saturn)
        radius: 2574.73, // km (larger than Mercury)
        GM: PhysicsConstants.PHYSICS.G * titanMass, // km³/s²
        density: 1882, // kg/m³
        rotationPeriod: 15.945 * 24 * 3600, // Synchronous
        orbitalPeriod: 15.945 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 1221870.0,
            eccentricity: 0.0288,
            inclination: 0.34854,
            longitudeOfAscendingNode: 78.6,
            argumentOfPeriapsis: 78.3,
            meanAnomalyAtEpoch: 11.7,
            epoch: 2451545.0,
            referenceFrame: 'saturn_equatorial'
        },
        cloudThickness: 100, // km
        atmosphere: {
            thickness: 200, // km - visible haze layer
            densityScaleHeight: 15, // km (approx for lower atmosphere)
            pressure: 1.45, // bar (surface pressure)
            composition: { nitrogen: 0.95, methane: 0.049, hydrogen: 0.001 },
            hazeIntensity: 5, // Stronger haze
            scaleHeightMultiplier: 3.0,
            rayleighScaleHeight: 20, // km
            mieScaleHeight: 20, // km (tholin haze layers)
            rayleighScatteringCoeff: [0.00005, 0.0002, 0.01], // Even more blue
            mieScatteringCoeff: 0.02, // More haze
            mieAnisotropy: 0.7,
            numLightSteps: 3,
            sunIntensity: 4.0, // Brighter blue haze
            equatorialRadius: 2574.73 + 200, // Including atmosphere for rendering
            polarRadius: 2574.73 + 200,
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'titanTexture',
                params: { roughness: 0.6, metalness: 0.1 }
            },
            cloudConfig: {
                textureKey: 'titanCloudTexture',
                cloudType: 'opaque', // Titan uses opaque cloud layers
                opacity: 1.0, // Fully opaque
            },
        },
        lodLevelsKey: 'default',
        details: {
            liquidMethaneLakes: true,
            denseAtmosphere: true,
            cryovolcanism: 'possible'
        },
        // Orientation (IAU 2023/2025)
        poleRA: 40.66, // deg at J2000.0, -0.036*T per century
        poleDec: 83.52, // deg at J2000.0, -0.004*T per century
        spin: 186.5855, // deg at J2000.0
        spinRate: 22.5769768, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'iapetus',
        naif_id: 608,
        parent: 'saturn_barycenter',
        type: 'moon',
        symbol: 'Ⅷ',
        mass: iapetusMass, // kg
        radius: 734.5, // km (mean radius)
        GM: PhysicsConstants.PHYSICS.G * iapetusMass, // km³/s²
        density: 1083, // kg/m³
        rotationPeriod: 79.3215 * 24 * 3600, // Synchronous
        orbitalPeriod: 79.3215 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 3560820.0,
            eccentricity: 0.0283,
            inclination: 15.47,
            longitudeOfAscendingNode: 86.5,
            argumentOfPeriapsis: 254.5,
            meanAnomalyAtEpoch: 74.8,
            epoch: 2451545.0,
            referenceFrame: 'saturn_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'iapetusTexture', // Two-tone surface
                params: { roughness: 0.8, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            twoToneColoration: true, // Dark leading hemisphere, bright trailing
            equatorialRidge: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 317.143, // deg at J2000.0, -0.108*T per century
        poleDec: 75.47, // deg at J2000.0, -0.061*T per century
        spin: 77.70, // deg at J2000.0
        spinRate: 4.5601155, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    }
]; 