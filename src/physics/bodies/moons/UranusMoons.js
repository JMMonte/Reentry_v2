export default [
    {
        name: 'ariel',
        naif_id: 701,
        parent: 'uranus_barycenter',
        type: 'moon',
        symbol: '⧫',
        astronomyEngineName: 'Ariel',
        mass: 1.353e21, // kg
        radius: 578.9, // km
        GM: 8.663, // km³/s²
        density: 1353, // kg/m³
        rotationPeriod: 2.52 * 24 * 3600, // Synchronous
        orbitalPeriod: 2.52 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 190900.0,
            eccentricity: 0.001,
            inclination: 0.0,
            longitudeOfAscendingNode: 0.0,
            argumentOfPeriapsis: 83.3,
            meanAnomalyAtEpoch: 119.8,
            epoch: 2451545.0,
            referenceFrame: 'uranus_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'arielTexture',
                params: { roughness: 0.7, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            canyons: true,
            brightSurface: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 257.43, // deg at J2000.0, +0.00*T per century
        poleDec: -15.10, // deg at J2000.0, +0.00*T per century
        spin: 156.22, // deg at J2000.0
        spinRate: 142.8356681, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'umbriel',
        naif_id: 702,
        parent: 'uranus_barycenter',
        type: 'moon',
        symbol: '⬟',
        astronomyEngineName: 'Umbriel',
        mass: 1.172e21, // kg
        radius: 584.7, // km
        GM: 7.89, // km³/s²
        density: 1399, // kg/m³
        rotationPeriod: 4.14 * 24 * 3600, // Synchronous
        orbitalPeriod: 4.14 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 266000.0,
            eccentricity: 0.004,
            inclination: 0.1,
            longitudeOfAscendingNode: 195.5,
            argumentOfPeriapsis: 157.5,
            meanAnomalyAtEpoch: 258.3,
            epoch: 2451545.0,
            referenceFrame: 'uranus_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'umbrielTexture',
                params: { roughness: 0.8, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            darkSurface: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 257.43, // deg at J2000.0, +0.00*T per century
        poleDec: -15.10, // deg at J2000.0, +0.00*T per century
        spin: 108.05, // deg at J2000.0
        spinRate: 86.8688923, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'titania',
        naif_id: 703,
        parent: 'uranus_barycenter',
        type: 'moon',
        symbol: '⬢',
        astronomyEngineName: 'Titania',
        mass: 3.527e21, // kg
        radius: 788.9, // km
        GM: 23.2, // km³/s²
        density: 1711, // kg/m³
        rotationPeriod: 8.71 * 24 * 3600, // Synchronous
        orbitalPeriod: 8.71 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 436300.0,
            eccentricity: 0.001,
            inclination: 0.1,
            longitudeOfAscendingNode: 26.4,
            argumentOfPeriapsis: 202.0,
            meanAnomalyAtEpoch: 53.2,
            epoch: 2451545.0,
            referenceFrame: 'uranus_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'titaniaTexture',
                params: { roughness: 0.7, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            largeCanyons: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 257.43, // deg at J2000.0, +0.00*T per century
        poleDec: -15.10, // deg at J2000.0, +0.00*T per century
        spin: 77.74, // deg at J2000.0
        spinRate: 41.351431, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'oberon',
        naif_id: 704,
        parent: 'uranus_barycenter',
        type: 'moon',
        symbol: '⬣',
        astronomyEngineName: 'Oberon',
        mass: 3.014e21, // kg
        radius: 761.4, // km
        GM: 20.4, // km³/s²
        density: 1563, // kg/m³
        rotationPeriod: 13.46 * 24 * 3600, // Synchronous
        orbitalPeriod: 13.46 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 583400.0,
            eccentricity: 0.001,
            inclination: 0.1,
            longitudeOfAscendingNode: 30.5,
            argumentOfPeriapsis: 182.4,
            meanAnomalyAtEpoch: 139.7,
            epoch: 2451545.0,
            referenceFrame: 'uranus_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'oberonTexture',
                params: { roughness: 0.8, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            manyCraters: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 257.43, // deg at J2000.0, +0.00*T per century
        poleDec: -15.10, // deg at J2000.0, +0.00*T per century
        spin: 6.77, // deg at J2000.0
        spinRate: 26.7394932, // deg/day
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'miranda',
        naif_id: 705,
        parent: 'uranus_barycenter',
        type: 'moon',
        symbol: '⬤',
        astronomyEngineName: 'Miranda',
        mass: 6.59e19, // kg
        radius: 235.8, // km
        GM: 0.44, // km³/s²
        isDwarf: true, // Smallest major moon of Uranus
        density: 1200, // kg/m³
        rotationPeriod: 1.413479 * 24 * 3600, // Synchronous
        orbitalPeriod: 1.413479 * 24 * 3600,
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'mirandaTexture',
                params: { roughness: 0.9, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            coronae: true,
            extremeTerrain: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 257.43, // deg at J2000.0, +0.000*T per century
        poleDec: -15.10, // deg at J2000.0, +0.000*T per century
        spin: 142.835, // deg at J2000.0
        spinRate: -142.835, // deg/day (retrograde, matches orbital period)
        orientationEpoch: 2451545.0, // JD (J2000.0)
        orbitalElements: {
            semiMajorAxis: 129900.0,
            eccentricity: 0.001,
            inclination: 4.4,
            longitudeOfAscendingNode: 100.7,
            argumentOfPeriapsis: 155.6,
            meanAnomalyAtEpoch: 72.4,
            epoch: 2451545.0,
            referenceFrame: 'uranus_equatorial'
        },
    }
]; 