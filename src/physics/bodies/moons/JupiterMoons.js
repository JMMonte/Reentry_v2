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
        mass: 8.9319e22, // kg
        radius: 1_821.6, // km
        GM: 5.959916e3, // km³/s²
        
        // Shape properties
        oblateness: 0.0, // Nearly spherical due to tidal heating
        density: 3528, // kg/m³ - highest density of Galilean moons

        // Rotation properties (tidally locked)
        rotationPeriod: 1.769137786 * 24 * 3600, // seconds
        tilt: 0.05, // degrees - very small tilt

        // Orbital properties
        soiRadius: 7169, // km
        orbitalPeriod: 1.769137786 * 24 * 3600, // seconds
        semiMajorAxis: 421700, // km

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
        mass: 4.7998e22, // kg
        radius: 1_560.8, // km
        GM: 3.202738774e3, // km³/s²
        
        // Shape properties
        oblateness: 0.0, // Nearly spherical
        density: 3013, // kg/m³

        // Rotation properties (tidally locked)
        rotationPeriod: 3.551181 * 24 * 3600, // seconds
        tilt: 0.1, // degrees

        // Orbital properties
        soiRadius: 11700, // km
        orbitalPeriod: 3.551181 * 24 * 3600, // seconds
        semiMajorAxis: 671034, // km

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
        mass: 1.4819e23, // kg
        radius: 2_634.1, // km - larger than Mercury
        GM: 9.887834e3, // km³/s²
        
        // Shape properties
        oblateness: 0.0, // Nearly spherical
        density: 1936, // kg/m³ - lowest density of Galilean moons

        // Rotation properties (tidally locked)
        rotationPeriod: 7.15455296 * 24 * 3600, // seconds
        tilt: 0.33, // degrees

        // Orbital properties
        soiRadius: 29800, // km
        orbitalPeriod: 7.15455296 * 24 * 3600, // seconds
        semiMajorAxis: 1070412, // km

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
        mass: 1.0759e23, // kg
        radius: 2_410.3, // km
        GM: 7.179289e3, // km³/s²
        
        // Shape properties
        oblateness: 0.0, // Nearly spherical
        density: 1834, // kg/m³

        // Rotation properties (tidally locked)
        rotationPeriod: 16.6890184 * 24 * 3600, // seconds
        tilt: 0.51, // degrees

        // Orbital properties
        soiRadius: 74300, // km
        orbitalPeriod: 16.6890184 * 24 * 3600, // seconds
        semiMajorAxis: 1882709, // km

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
    }
]; 