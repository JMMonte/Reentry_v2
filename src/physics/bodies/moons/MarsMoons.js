export default [
    {
        // Phobos
        name: 'phobos',
        naif_id: 401,
        parent: 'mars_barycenter',
        type: 'moon',
        symbol: '◉',
        mass: 1.0659e16, // kg
        radius: 11.2667, // km (mean radius)
        GM: 7.11e-4, // km³/s²
        dimensions: [26.8, 22.4, 18.4], // km (a x b x c)
        oblateness: 0.19, // Calculated from dimensions
        rotationPeriod: 27554, // seconds (0.3189 Earth days - synchronous with orbit)
        soiRadius: 0.020, // km - very small, Mars dominates
        orbitalPeriod: 27554, // seconds
        semiMajorAxis: 9376, // km from Mars center
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'phobosTexture',
                // normalMapKey: 'phobosNormalTexture', // If available
                params: {
                    roughness: 0.9,
                    metalness: 0.1,
                }
            },
        },
        lodLevelsKey: 'default', // Uses default LOD scheme
        orbitalElements: { // ECLIPJ2000, J2000.0 epoch
            semiMajorAxis: 9376.0, // km
            eccentricity: 0.0151,
            inclination: 1.093, // deg, to ecliptic
            longitudeOfAscendingNode: 49.713, // deg
            argumentOfPeriapsis: 286.462, // deg
            meanAnomalyAtEpoch: 150.057, // deg
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'mars_equatorial'
        },
        // Orientation (IAU 2023/2025)
        poleRA: 317.68, // deg at J2000.0, -0.108*T per century
        poleDec: 52.90, // deg at J2000.0, -0.061*T per century
        spin: 35.06, // deg at J2000.0
        spinRate: 1128.8445850, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        // Deimos
        name: 'deimos',
        naif_id: 402,
        parent: 'mars_barycenter',
        type: 'moon',
        symbol: '⧫',
        mass: 1.4762e15, // kg
        radius: 6.2, // km (mean radius)
        GM: 9.85e-5, // km³/s²
        dimensions: [15.0, 12.2, 10.4], // km (a x b x c)
        oblateness: 0.16, // Calculated from dimensions
        rotationPeriod: 109605, // seconds (1.268 Earth days - synchronous with orbit)
        soiRadius: 0.010, // km - very small
        orbitalPeriod: 109605, // seconds
        semiMajorAxis: 23463.2, // km from Mars center
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'deimosTexture',
                // normalMapKey: 'deimosNormalTexture', // If available
                params: {
                    roughness: 0.9,
                    metalness: 0.1,
                }
            },
        },
        lodLevelsKey: 'default',
        orbitalElements: { // ECLIPJ2000, J2000.0 epoch
            semiMajorAxis: 23463.2, // km
            eccentricity: 0.00033,
            inclination: 1.791, // deg, to ecliptic
            longitudeOfAscendingNode: 79.553, // deg
            argumentOfPeriapsis: 322.740, // deg
            meanAnomalyAtEpoch: 260.729, // deg
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'mars_equatorial'
        },
        // Orientation (IAU 2023/2025)
        poleRA: 316.65, // deg at J2000.0, -0.108*T per century
        poleDec: 53.52, // deg at J2000.0, -0.061*T per century
        spin: 79.41, // deg at J2000.0
        spinRate: 285.1618970, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    }
]; 