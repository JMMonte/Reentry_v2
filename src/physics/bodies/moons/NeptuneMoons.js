export default [
    {
        name: 'triton',
        naif_id: 801,
        parent: 'neptune_barycenter',
        type: 'moon',
        symbol: '⧫',
        mass: 2.14e22, // kg
        radius: 1353.4, // km
        GM: 1420, // km³/s² (1.42e12 / 1e9)
        density: 2061, // kg/m³
        rotationPeriod: -5.877 * 24 * 3600, // Synchronous, retrograde
        orbitalPeriod: -5.877 * 24 * 3600, // Retrograde orbit
        orbitalElements: {
            semiMajorAxis: 354800.0,
            eccentricity: 0.000,
            inclination: 157.3,
            longitudeOfAscendingNode: 178.1,
            argumentOfPeriapsis: 0.0,
            meanAnomalyAtEpoch: 63.0,
            epoch: 2451545.0,
            referenceFrame: 'neptune_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'tritonTexture',
                params: { roughness: 0.6, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            cryovolcanism: true, // Nitrogen geysers
            capturedKuiperObject: true,
            retrogradeOrbit: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 299.36, // deg at J2000.0, -0.70*T per century
        poleDec: 43.46, // deg at J2000.0, -0.51*T per century
        spin: 296.53, // deg at J2000.0
        spinRate: -61.2572637, // deg/day (retrograde)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'proteus',
        naif_id: 802,
        parent: 'neptune_barycenter',
        type: 'moon',
        symbol: '⬟',
        mass: 4.4e19, // kg
        radius: 210, // km
        GM: 0.21, // km³/s² (2.1e8 / 1e9)
        density: 1300, // kg/m³
        rotationPeriod: 1.122315 * 24 * 3600, // Synchronous
        orbitalPeriod: 1.122315 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 117600.0,
            eccentricity: 0.000,
            inclination: 0.0,
            longitudeOfAscendingNode: 0.0,
            argumentOfPeriapsis: 0.0,
            meanAnomalyAtEpoch: 276.8,
            epoch: 2451545.0,
            referenceFrame: 'neptune_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'proteusTexture',
                params: { roughness: 0.8, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            irregularShape: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 299.36, // deg at J2000.0, -0.70*T per century
        poleDec: 43.46, // deg at J2000.0, -0.51*T per century
        spin: 0.0, // deg at J2000.0
        spinRate: -360.0, // deg/day (retrograde, matches orbital period)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'nereid',
        naif_id: 803,
        parent: 'neptune_barycenter',
        type: 'moon',
        symbol: '⬢',
        mass: 3.1e19, // kg
        radius: 170, // km
        GM: 0.29, // km³/s² (2.9e8 / 1e9)
        density: 1500, // kg/m³ (estimated)
        rotationPeriod: 11.52 * 3600, // seconds (11.52 hours, not synchronous)
        orbitalPeriod: 360.14 * 24 * 3600, // Highly eccentric orbit
        orbitalElements: {
            semiMajorAxis: 5513900.0,
            eccentricity: 0.751,
            inclination: 5.1,
            longitudeOfAscendingNode: 319.5,
            argumentOfPeriapsis: 296.8,
            meanAnomalyAtEpoch: 318.5,
            epoch: 2451545.0,
            referenceFrame: 'neptune_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'nereidTexture',
                params: { roughness: 0.9, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            irregularShape: true,
            highlyEccentricOrbit: true
        },
        // Orientation (assumed)
        poleRA: 299.36, // deg (assumed aligned with Neptune)
        poleDec: 43.46, // deg 
        spin: 0.0, // deg 
        spinRate: 31.1, // deg/day (11.52 hour rotation)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    }
];