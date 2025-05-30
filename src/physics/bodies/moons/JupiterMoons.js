import {Constants} from '../../../utils/Constants.js';
// mass in kg, radius in km, GM in km³/s²
// Mass values validated and updated (2025) from NASA/JPL and latest IAU sources:
// https://ssd.jpl.nasa.gov/moons/planets/jupiter
// https://nssdc.gsfc.nasa.gov/planetary/factsheet/
const ioMass        = 8.9319e22;  // kg
const europaMass    = 4.7998e22;  // kg
const ganymedeMass  = 1.4819e23;  // kg
const callistoMass  = 1.0759e23;  // kg
const amaltheaMass  = 7.17e18;    // kg  (Galileo fly-by GM)
const himaliaMass   = 9.56e18;    // kg
const elaraMass     = 7.77e17;    // kg
const pasiphaeMass  = 1.72e17;    // kg
const sinopeMass    = 7.77e16;    // kg
const lysitheaMass  = 7.77e16;    // kg
const carmeMass     = 8.69e16;    // kg
const anankeMass    = 1.68e16;    // kg
const ledaMass      = 5.68e15;    // kg  (NASA Jovian-Satellite Fact Sheet, 2025)   
const thebeMass     = 8.0e17;     // kg  (NASA Jovian-Satellite Fact Sheet, 2025)


/**
 * Jupiter's Moons Configuration
 * 
 * Physical, orbital, and rendering properties for Jupiter's major moons
 * Focuses on the Galilean moons: Io, Europa, Ganymede, Callisto
 */

export default [
    {
        // Io - Most volcanically active body in solar system
        name: 'io',
        naif_id: 501,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '🜋',

        // Physical properties
        mass: ioMass, // kg
        radius: 1_821.6, // km
        GM: Constants.G * ioMass, // km³/s²

        // Shape properties
        oblateness: 0.0, // Nearly spherical due to tidal heating
        density: 3528, // kg/m³ - highest density of Galilean moons

        // Rotation properties (tidally locked)
        rotationPeriod: 1.769137786 * 24 * 3600, // seconds
        tilt: 0.05, // degrees - very small tilt

        // Orbital properties
        soiRadius: 7169, // km
        orbitalPeriod: 1.769137786 * 24 * 3600, // seconds
        // Latest orbital elements for Io (JPL, IAU 2023/2025, J2000.0 epoch)
        orbitalElements: {
            semiMajorAxis: 421_800, // km (JPL Horizons, 2025)
            eccentricity: 0.0041,   // JPL Horizons, 2025
            inclination: 0.036,     // deg, to Jupiter's equator (JPL/IAU 2025)
            longitudeOfAscendingNode: 43.977, // deg (J2000.0, IAU 2025)
            argumentOfPeriapsis: 84.129,      // deg (J2000.0, IAU 2025)
            meanAnomalyAtEpoch: 171.016,      // deg (J2000.0, IAU 2025)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'ioTexture',
                params: {
                    roughness: 0.7,
                    metalness: 0.1
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Volcanic activity
        volcanism: {
            activeVolcanoes: 400, // estimated number
            sulfurComposition: 0.9, // fraction of surface sulfur compounds
            plumesHeight: 500, // km - maximum plume height
            heatFlow: 2.5e14, // W - total heat flow
            lakaTemperature: 2000 // K - hottest lava temperatures
        },

        // Atmosphere (very thin)
        atmosphere: {
            pressure: 0.3e-9, // bar - extremely thin
            composition: {
                sulfurDioxide: 0.9,
                sulfur: 0.1
            }
        },

        // Orientation (IAU 2023/2025)
        poleRA: 268.05, // deg at J2000.0, -0.009*T per century
        poleDec: 64.50, // deg at J2000.0, +0.003*T per century
        spin: 200.39, // deg at J2000.0
        spinRate: 203.4889538, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },

    {
        // Europa - Subsurface ocean moon
        name: 'europa',
        naif_id: 502,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁',

        // Physical properties
        mass: europaMass, // kg
        radius: 1_560.8, // km
        GM: Constants.G * europaMass, // km³/s²

        // Shape properties
        oblateness: 0.0, // Nearly spherical
        density: 3013, // kg/m³

        // Rotation properties (tidally locked)
        rotationPeriod: 3.551181 * 24 * 3600, // seconds
        tilt: 0.1, // degrees

        // Orbital properties
        soiRadius: 11700, // km
        orbitalPeriod: 3.551181 * 24 * 3600, // seconds
        // Updated orbital elements for Europa (JPL Horizons, epoch J2000.0)
        // Source: https://ssd.jpl.nasa.gov/horizons/app.html#/ (2025)
        orbitalElements: {
            semiMajorAxis: 671100, // km (mean distance from Jupiter)
            eccentricity: 0.0094,
            inclination: 0.470, // deg, to Jupiter's equator
            longitudeOfAscendingNode: 219.106, // deg (J2000.0)
            argumentOfPeriapsis: 88.970, // deg (J2000.0)
            meanAnomalyAtEpoch: 128.117, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'europaTexture',
                params: {
                    roughness: 0.5, // very smooth ice surface
                    metalness: 0.0
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Subsurface ocean
        ocean: {
            depth: 60, // km - estimated ocean depth
            saltContent: 'high', // likely salty water
            iceShellThickness: 15, // km - average ice shell thickness
            tidalHeating: true,
            habitabilityPotential: 'high'
        },

        // Surface properties
        surface: {
            iceComposition: 0.95, // fraction water ice
            lineae: true, // linear features indicating tectonic activity
            chaosRegions: true, // disrupted terrain
            albedo: 0.67 // high reflectivity due to ice
        },

        // Orientation (IAU 2023/2025)
        poleRA: 268.08, // deg at J2000.0, -0.009*T per century
        poleDec: 64.51, // deg at J2000.0, +0.003*T per century
        spin: 83.10, // deg at J2000.0
        spinRate: 101.3747235, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },

    {
        // Ganymede - Largest moon in solar system
        name: 'ganymede',
        naif_id: 503,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁',

        // Physical properties
        mass: ganymedeMass, // kg
        radius: 2_634.1, // km - larger than Mercury
        GM: Constants.G * ganymedeMass, // km³/s²

        // Shape properties
        oblateness: 0.0, // Nearly spherical
        density: 1936, // kg/m³ - lowest density of Galilean moons

        // Rotation properties (tidally locked)
        rotationPeriod: 7.15455296 * 24 * 3600, // seconds
        tilt: 0.33, // degrees

        // Orbital properties
        soiRadius: 29800, // km
        orbitalPeriod: 7.15455296 * 24 * 3600, // seconds
        // Ganymede orbital elements (latest IAU 2023/2025, JPL Horizons, and NASA fact sheet cross-checked)
        orbitalElements: {
            semiMajorAxis: 1_070_400, // km (mean, JPL Horizons)
            eccentricity: 0.0013, // JPL Horizons (2025)
            inclination: 0.177, // deg, to Jupiter's equator (JPL Horizons, IAU 2023)
            longitudeOfAscendingNode: 63.552, // deg (J2000.0, IAU 2023)
            argumentOfPeriapsis: 192.417, // deg (J2000.0, IAU 2023)
            meanAnomalyAtEpoch: 317.337, // deg (J2000.0, IAU 2023)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'ganymedeTexture',
                params: {
                    roughness: 0.7,
                    metalness: 0.0
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Magnetic field (only moon with intrinsic magnetic field)
        magnetosphere: {
            dipoleMoment: 1.3e13, // A⋅m²
            fieldStrength: 719e-9, // T at equator
            aurorae: true // HST observations of oxygen aurorae
        },

        // Internal structure
        structure: {
            coreRadius: 700, // km - iron core
            mantleThickness: 1315, // km - rock/ice mantle
            iceShellThickness: 800, // km - outer ice shell
            oceanDepth: 100, // km - subsurface ocean
            differentiated: true
        },

        // Surface composition
        surface: {
            darkTerrain: 0.4, // fraction ancient cratered terrain
            brightTerrain: 0.6, // fraction younger grooved terrain
            waterIce: 0.5, // fraction water ice
            rockMinerals: 0.5 // fraction rocky materials
        },

        // Orientation (IAU 2023/2025)
        poleRA: 268.20, // deg at J2000.0, -0.009*T per century
        poleDec: 64.57, // deg at J2000.0, +0.003*T per century
        spin: 44.064, // deg at J2000.0
        spinRate: 50.3176081, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },

    {
        // Callisto - Most heavily cratered body in solar system
        name: 'callisto',
        naif_id: 504,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁',

        // Physical properties
        mass: callistoMass, // kg
        radius: 2_410.3, // km
        GM: Constants.G * callistoMass, // km³/s²

        // Shape properties
        oblateness: 0.0, // Nearly spherical
        density: 1834, // kg/m³

        // Rotation properties (tidally locked)
        rotationPeriod: 16.6890184 * 24 * 3600, // seconds
        tilt: 0.51, // degrees

        // Orbital properties
        soiRadius: 74300, // km
        orbitalPeriod: 16.6890184 * 24 * 3600, // seconds
        // Callisto orbital elements (latest IAU/NASA JPL data, 2025)
        // Source: JPL Horizons, IAU WGCCRE 2023/2025, NASA factsheets
        orbitalElements: {
            semiMajorAxis: 1_882_709, // km
            eccentricity: 0.0074,
            inclination: 0.192, // deg, to Jupiter's equator (IAU 2023)
            longitudeOfAscendingNode: 298.848, // deg (J2000.0)
            argumentOfPeriapsis: 56.218, // deg (J2000.0)
            meanAnomalyAtEpoch: 357.913, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'callistoTexture',
                params: {
                    roughness: 0.7, // heavily cratered surface
                    metalness: 0.0
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            craterDensity: 'maximum', // most heavily cratered
            albedo: 0.22, // dark surface
            iceContent: 0.4, // significant water ice
            rockContent: 0.6, // rocky materials
            valhallaCrater: {
                diameter: 3800, // km - largest multi-ring structure
                age: 4e9 * 365.25 * 24 * 3600 // seconds - very ancient
            }
        },

        // Internal structure (least differentiated)
        structure: {
            differentiated: false, // undifferentiated rock-ice mixture
            coreRadius: 0, // no distinct core
            iceRockMixture: true,
            possibleSubsurfaceOcean: true, // thin ocean possible
            oceanDepth: 10 // km - if present
        },

        // Radiation environment
        radiation: {
            dosage: 'moderate', // outside main radiation belts
            shielding: 'natural' // distance provides some protection
        },

        // Orientation (IAU 2023/2025)
        poleRA: 268.72, // deg at J2000.0, -0.009*T per century
        poleDec: 64.83, // deg at J2000.0, +0.003*T per century
        spin: 259.51, // deg at J2000.0
        spinRate: 21.5710715, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    // Non-Galilean moons
    {
        // Amalthea - Inner irregular moon
        name: 'amalthea',
        naif_id: 505,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁',

        // Physical properties
        mass: amaltheaMass, // kg (0.075e20)
        radius: 83.5, // km mean radius (125x73x64 km)
        GM: Constants.G * amaltheaMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.32, // Very irregular shape
        density: 3100, // kg/m³

        // Rotation properties (tidally locked)
        rotationPeriod: 0.498179 * 24 * 3600, // seconds
        tilt: 0.0, // degrees - tidally locked

        // Orbital properties
        soiRadius: 2.2, // km (very small)
        orbitalPeriod: 0.498179 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 181_400, // km
            eccentricity: 0.003,
            inclination: 0.38, // deg, to Jupiter's equator
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.9, // very rough, reddish surface
                    metalness: 0.0,
                    color: 0xAA5533 // reddish color
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.09, // dark surface
            color: 'red', // reddest object in solar system
            sulfurCompounds: true // from Io's volcanic activity
        },

        // Radiation environment
        radiation: {
            dosage: 'extreme', // deep within radiation belts
            shielding: 'none'
        },

        // Orientation (tidally locked)
        poleRA: 268.05, // deg at J2000.0
        poleDec: 64.49, // deg at J2000.0
        spin: 0.0, // deg at J2000.0
        spinRate: 722.6314560, // deg/day (synchronous)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        // Himalia - Largest irregular moon, leader of Himalia group
        name: 'himalia',
        naif_id: 506,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁',

        // Physical properties
        mass: himaliaMass, // kg (0.095e20)
        radius: 85.0, // km mean radius
        GM: Constants.G * himaliaMass, // km³/s² (calculated from mass)
        isDwarf: true, // Irregular captured asteroid

        // Shape properties
        oblateness: 0.0, // Roughly spherical
        density: 2600, // kg/m³ (assumed, C-type asteroid)

        // Rotation properties
        rotationPeriod: 0.4 * 24 * 3600, // seconds (9.6 hours)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 120, // km (estimated)
        orbitalPeriod: 250.5662 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 11_461_000, // km
            eccentricity: 0.162,
            inclination: 27.50, // deg, to Jupiter's equator
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.8,
                    metalness: 0.0,
                    color: 0x666666 // grey, C-type asteroid
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.03, // very dark
            asteroidType: 'C', // carbonaceous
            captured: true // likely captured asteroid
        },

        // Group leader
        groupLeader: true,
        group: 'himalia',

        // Orientation (approximate)
        poleRA: 0.0, // deg at J2000.0 (unknown)
        poleDec: 90.0, // deg at J2000.0 (unknown)
        spin: 0.0, // deg at J2000.0
        spinRate: 900.0, // deg/day (0.4 day period)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        // Thebe - Inner moon, feeds Jupiter's Gossamer ring
        name: 'thebe',
        naif_id: 514,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: thebeMass, // kg (0.008e20)
        radius: 49.3, // km mean radius (58x49x42 km)
        GM: Constants.G * thebeMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small inner moon

        // Shape properties
        oblateness: 0.3, // Irregular shape
        density: 3000, // kg/m³ (assumed)

        // Rotation properties (tidally locked)
        rotationPeriod: 0.6745 * 24 * 3600, // seconds
        tilt: 0.0, // degrees - tidally locked

        // Orbital properties
        soiRadius: 1.3, // km (very small)
        orbitalPeriod: 0.6745 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 221_900, // km
            eccentricity: 0.018,
            inclination: 1.08, // deg, to Jupiter's equator
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.9,
                    metalness: 0.0,
                    color: 0x886644 // brownish
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.047, // dark surface
            dustSource: true // contributes to Jupiter's ring system
        },

        // Ring association
        ringContributor: 'gossamer',

        // Radiation environment
        radiation: {
            dosage: 'extreme', // within radiation belts
            shielding: 'none'
        },

        // Orientation (tidally locked)
        poleRA: 268.05, // deg at J2000.0
        poleDec: 64.49, // deg at J2000.0
        spin: 0.0, // deg at J2000.0
        spinRate: 533.7004100, // deg/day (synchronous)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        // Elara - Second largest member of Himalia group
        name: 'elara',
        naif_id: 507,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: elaraMass, // kg (0.008e20)
        radius: 40.0, // km mean radius
        GM: Constants.G * elaraMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.0, // Roughly spherical
        density: 2600, // kg/m³ (assumed, C-type asteroid)

        // Rotation properties
        rotationPeriod: 0.5 * 24 * 3600, // seconds (12 hours)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 50, // km (estimated)
        orbitalPeriod: 259.6528 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 11_741_000, // km
            eccentricity: 0.217,
            inclination: 26.63, // deg, to Jupiter's equator
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.8,
                    metalness: 0.0,
                    color: 0x666666 // grey, C-type asteroid
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.04, // very dark
            asteroidType: 'C', // carbonaceous
            captured: true // likely captured asteroid
        },

        // Group member
        group: 'himalia',

        // Orientation (approximate)
        poleRA: 0.0, // deg at J2000.0 (unknown)
        poleDec: 90.0, // deg at J2000.0 (unknown)
        spin: 0.0, // deg at J2000.0
        spinRate: 720.0, // deg/day (0.5 day period)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },

    {
        // Pasiphae - Largest retrograde irregular moon
        name: 'pasiphae',
        naif_id: 508,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: pasiphaeMass, // kg
        radius: 29.0, // km (diameter 58 km)
        GM: Constants.G * pasiphaeMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.0, // Irregular
        density: 2600, // kg/m³ (assumed, C-type asteroid)

        // Rotation properties
        rotationPeriod: 0.5 * 24 * 3600, // seconds (unknown, assumed)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 40, // km (estimated)
        orbitalPeriod: 743.6 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 23_500_000, // km
            eccentricity: 0.295,
            inclination: 143.04, // deg, retrograde orbit
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.9,
                    metalness: 0.0,
                    color: 0x666666 // grey, C-type asteroid
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.04, // very dark
            asteroidType: 'C', // carbonaceous
            captured: true, // captured asteroid
            retrograde: true
        },

        // Group leader
        groupLeader: true,
        group: 'pasiphae',
    },

    {
        // Sinope - Retrograde irregular moon
        name: 'sinope',
        naif_id: 509,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: sinopeMass, // kg
        radius: 18.0, // km (diameter 36 km)
        GM: Constants.G * sinopeMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.0, // Irregular
        density: 2600, // kg/m³ (assumed)

        // Rotation properties
        rotationPeriod: 0.5 * 24 * 3600, // seconds (unknown, assumed)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 25, // km (estimated)
        orbitalPeriod: 758.9 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 23_700_000, // km
            eccentricity: 0.25,
            inclination: 158.0, // deg, retrograde orbit
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.9,
                    metalness: 0.0,
                    color: 0xAA6666 // reddish
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.04, // very dark
            color: 'red',
            captured: true,
            retrograde: true
        },

        // Group member
        group: 'pasiphae',
    },

    {
        // Lysithea - Member of Himalia group
        name: 'lysithea',
        naif_id: 510,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: lysitheaMass, // kg
        radius: 12.0, // km (diameter 24 km)
        GM: Constants.G * lysitheaMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.0, // Irregular
        density: 2600, // kg/m³ (assumed)

        // Rotation properties
        rotationPeriod: 0.5 * 24 * 3600, // seconds (unknown, assumed)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 17, // km (estimated)
        orbitalPeriod: 259.22 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 11_720_000, // km
            eccentricity: 0.107,
            inclination: 28.3, // deg, to Jupiter's equator
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.8,
                    metalness: 0.0,
                    color: 0x666666 // grey
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.04, // very dark
            asteroidType: 'C', // carbonaceous
            captured: true
        },

        // Group member
        group: 'himalia',
    },

    {
        // Carme - Member of Pasiphae group (retrograde)
        name: 'carme',
        naif_id: 511,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: carmeMass, // kg
        radius: 20.0, // km (diameter 40 km)
        GM: Constants.G * carmeMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.0, // Irregular
        density: 2600, // kg/m³ (assumed)

        // Rotation properties
        rotationPeriod: 0.5 * 24 * 3600, // seconds (unknown, assumed)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 28, // km (estimated)
        orbitalPeriod: 692.0 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 22_600_000, // km
            eccentricity: 0.25,
            inclination: 163.0, // deg, retrograde orbit
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.9,
                    metalness: 0.0,
                    color: 0x666666 // grey
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.04, // very dark
            asteroidType: 'C', // carbonaceous
            captured: true,
            retrograde: true
        },

        // Group member
        group: 'pasiphae',
    },

    {
        // Ananke - Member of Pasiphae group (retrograde)
        name: 'ananke',
        naif_id: 512,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: anankeMass, // kg
        radius: 14.0, // km (diameter 28 km)
        GM: Constants.G * anankeMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.0, // Irregular
        density: 2600, // kg/m³ (assumed)

        // Rotation properties
        rotationPeriod: 0.5 * 24 * 3600, // seconds (unknown, assumed)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 20, // km (estimated)
        orbitalPeriod: 630.0 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 21_200_000, // km
            eccentricity: 0.22,
            inclination: 147.0, // deg, retrograde orbit
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.9,
                    metalness: 0.0,
                    color: 0x886666 // light reddish-grey
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.04, // very dark
            color: 'light-red',
            asteroidType: 'C', // carbonaceous
            captured: true,
            retrograde: true
        },

        // Group member
        group: 'pasiphae',
    },

    {
        // Leda - Smallest member of Himalia group
        name: 'leda',
        naif_id: 513,
        parent: 'jupiter_barycenter',
        type: 'moon',
        symbol: '⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁⟁',

        // Physical properties
        mass: ledaMass, // kg
        radius: 8.0, // km (diameter 16 km)
        GM: Constants.G * ledaMass, // km³/s² (calculated from mass)
        isDwarf: true, // Small irregular moon

        // Shape properties
        oblateness: 0.0, // Irregular
        density: 2600, // kg/m³ (assumed)

        // Rotation properties
        rotationPeriod: 0.5 * 24 * 3600, // seconds (unknown, assumed)
        tilt: 0.0, // degrees (unknown)

        // Orbital properties
        soiRadius: 11, // km (estimated)
        orbitalPeriod: 238.72 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 11_094_000, // km
            eccentricity: 0.148,
            inclination: 26.1, // deg, to Jupiter's equator
            longitudeOfAscendingNode: 0.0, // deg (J2000.0)
            argumentOfPeriapsis: 0.0, // deg (J2000.0)
            meanAnomalyAtEpoch: 0.0, // deg (J2000.0)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'jupiter_equatorial'
        },

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'enceladusTexture',
                params: {
                    roughness: 0.8,
                    metalness: 0.0,
                    color: 0x666666 // grey
                }
            },
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Surface properties
        surface: {
            albedo: 0.04, // very dark
            asteroidType: 'C', // carbonaceous
            captured: true
        },

        // Group member
        group: 'himalia',
    },
]; 