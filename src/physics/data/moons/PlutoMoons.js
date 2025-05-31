import {PhysicsConstants} from '../../core/PhysicsConstants.js';
const charonMass = 1.586e21;
const nixMass = 4.5e16;
const hydraMass = 4.8e16;
const kerberosMass = 1.65e16;
const styxMass = 7.5e15;


export default [
    {
        name: 'charon',
        naif_id: 901,
        parent: 'pluto_barycenter',
        type: 'moon',
        symbol: '◉',
        astronomyEngineName: 'Charon',
        mass: charonMass, // kg
        radius: 606, // km
        GM: PhysicsConstants.PHYSICS.G * charonMass, // km³/s² (1.62e11 / 1e9)
        density: 1702, // kg/m³
        rotationPeriod: 6.387230 * 24 * 3600, // Synchronous with Pluto
        orbitalPeriod: 6.387230 * 24 * 3600, // Same as Pluto's rotation
        orbitalElements: {
            semiMajorAxis: 17536,
            eccentricity: 0.00016,
            inclination: 0.080,
            longitudeOfAscendingNode: 223.046,
            argumentOfPeriapsis: 180.0,
            meanAnomalyAtEpoch: 180.0,
            epoch: 2451545.0,
            referenceFrame: 'pluto_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'charonTexture',
                params: { roughness: 0.7, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            binarySystem: true, // Pluto-Charon is essentially a binary system
            tidally_locked: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 132.993, // deg at J2000.0, +0.0*T per century
        poleDec: -6.163, // deg at J2000.0, +0.0*T per century
        spin: 122.695, // deg at J2000.0
        spinRate: 56.3625225, // deg/day (same as orbital period)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'nix',
        naif_id: 902,
        parent: 'pluto_barycenter',
        type: 'moon',
        symbol: '⬟',
        astronomyEngineName: 'Nix',
        mass: nixMass, // kg
        radius: 49.8, // km
        GM: PhysicsConstants.PHYSICS.G * nixMass, // km³/s² (3.0e6 / 1e9)
        density: 856, // kg/m³
        rotationPeriod: 43.9 * 3600, // seconds (43.9 hours, chaotic rotation)
        orbitalPeriod: 24.86 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 48694.0,
            eccentricity: 0.002,
            inclination: 0.133,
            longitudeOfAscendingNode: 223.1,
            argumentOfPeriapsis: 180.0,
            meanAnomalyAtEpoch: 180.0,
            epoch: 2451545.0,
            referenceFrame: 'pluto_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'nixTexture',
                params: { roughness: 0.9, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            irregularShape: true,
            chaoticRotation: true
        },
        // Orientation (chaotic - approximate)
        poleRA: 132.993, // deg (assumed similar to Pluto)
        poleDec: -6.163, // deg
        spin: 0.0, // deg (chaotic)
        spinRate: 196.4, // deg/day (43.9 hour rotation)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'hydra',
        naif_id: 903,
        parent: 'pluto_barycenter',
        type: 'moon',
        symbol: '⬢',
        astronomyEngineName: 'Hydra',
        mass: hydraMass, // kg
        radius: 50.9, // km (irregular)
        GM: PhysicsConstants.PHYSICS.G * hydraMass, // km³/s² (3.2e6 / 1e9)
        density: 862, // kg/m³
        rotationPeriod: 10.3 * 3600, // seconds (10.3 hours, chaotic rotation)
        orbitalPeriod: 38.20 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 64738.0,
            eccentricity: 0.005,
            inclination: 0.242,
            longitudeOfAscendingNode: 223.2,
            argumentOfPeriapsis: 180.0,
            meanAnomalyAtEpoch: 180.0,
            epoch: 2451545.0,
            referenceFrame: 'pluto_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'hydraTexture',
                params: { roughness: 0.9, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            irregularShape: true,
            chaoticRotation: true
        },
        // Orientation (chaotic - approximate)
        poleRA: 132.993, // deg (assumed similar to Pluto)
        poleDec: -6.163, // deg
        spin: 0.0, // deg (chaotic)
        spinRate: 838.8, // deg/day (10.3 hour rotation)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'kerberos',
        naif_id: 904,
        parent: 'pluto_barycenter',
        type: 'moon',
        symbol: '⬣',
        astronomyEngineName: 'Kerberos',
        mass: kerberosMass, // kg
        radius: 19, // km (irregular)
        GM: PhysicsConstants.PHYSICS.G * kerberosMass, // km³/s² (1.1e6 / 1e9)
        isDwarf: true, // Small moon
        density: 1400, // kg/m³ (estimated)
        rotationPeriod: 32.17 * 24 * 3600, // seconds (synchronous)
        orbitalPeriod: 32.17 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: 57783.0,
            eccentricity: 0.003,
            inclination: 0.389,
            longitudeOfAscendingNode: 223.15,
            argumentOfPeriapsis: 180.0,
            meanAnomalyAtEpoch: 180.0,
            epoch: 2451545.0,
            referenceFrame: 'pluto_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'kerberosTexture',
                params: { roughness: 0.9, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            irregularShape: true,
            tidally_locked: true
        },
        // Orientation (assumed tidally locked)
        poleRA: 132.993, // deg (assumed similar to Pluto)
        poleDec: -6.163, // deg
        spin: 0.0, // deg
        spinRate: 11.2, // deg/day (32.17 day rotation)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    },
    {
        name: 'styx',
        naif_id: 905,
        parent: 'pluto_barycenter',
        type: 'moon',
        symbol: '⬤',
        astronomyEngineName: 'Styx',
        mass: styxMass, // kg
        radius: 16, // km (irregular)
        GM: PhysicsConstants.PHYSICS.G * styxMass, // km³/s² (4.8e5 / 1e9)
        isDwarf: true, // Small moon
        density: 1500, // kg/m³ (est)
        rotationPeriod: 3.24 * 24 * 3600, // Not tidally locked
        orbitalPeriod: 20.16155 * 24 * 3600,
        orbitalElements: {
            semiMajorAxis: 42656.0,
            eccentricity: 0.005,
            inclination: 0.81,
            longitudeOfAscendingNode: 223.0,
            argumentOfPeriapsis: 180.0,
            meanAnomalyAtEpoch: 180.0,
            epoch: 2451545.0,
            referenceFrame: 'pluto_equatorial'
        },
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'styxTexture',
                params: { roughness: 0.85, metalness: 0.05 }
            }
        },
        lodLevelsKey: 'default',
        details: {
            irregularShape: true
        },
        // Orientation (IAU 2023/2025)
        poleRA: 132.993, // deg at J2000.0, +0.0*T per century
        poleDec: -6.163, // deg at J2000.0, +0.0*T per century
        spin: 122.695, // deg at J2000.0
        spinRate: -56.3625225, // deg/day (retrograde, matches Pluto)
        orientationEpoch: 2451545.0, // JD (J2000.0)
    }
]; 