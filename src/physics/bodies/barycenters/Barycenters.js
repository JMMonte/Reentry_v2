/**
 * Solar System Barycenters Configuration
 * 
 * Defines all barycentric reference points in the solar system
 * These are gravitational centers around which bodies orbit
 */

export default [
    {
        name: 'ss_barycenter',
        naif_id: 0,
        astronomyEngineName: 'SSB', // Solar System Barycenter
        type: 'barycenter',
        parent: null, // Root of the solar system
        mass: 0, // Computed dynamically from all bodies
        description: 'Solar System Barycenter - the center of mass of the entire solar system',
        radius: 0
    },
    {
        name: 'emb',
        naif_id: 3,
        astronomyEngineName: 'EMB', // Earth-Moon Barycenter
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 4.035032e5, // km³/s² - Combined Earth-Moon system
        mass: 6.0458e24, // kg - Earth + Moon combined mass
        description: 'Earth-Moon Barycenter',
        radius: 0
    },
    {
        name: 'mercury_barycenter',
        naif_id: 1,
        astronomyEngineName: 'Mercury',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 2.2032e4, // km³/s²
        mass: 3.301e23, // kg
        description: 'Mercury System Barycenter (essentially Mercury center)',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 57909050.0, // km (0.387 AU)
            eccentricity: 0.2056,
            inclination: 7.005,
            longitudeOfAscendingNode: 48.331,
            argumentOfPeriapsis: 29.124,
            meanAnomalyAtEpoch: 174.796,
            epoch: 2451545.0
        }
    },
    {
        name: 'venus_barycenter',
        naif_id: 2,
        astronomyEngineName: 'Venus',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 3.24859e5, // km³/s²
        mass: 4.867e24, // kg
        description: 'Venus System Barycenter (essentially Venus center)',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 108208000.0,
            eccentricity: 0.0067,
            inclination: 3.3947,
            longitudeOfAscendingNode: 76.680,
            argumentOfPeriapsis: 54.884,
            meanAnomalyAtEpoch: 50.416,
            epoch: 2451545.0
        }
    },
    {
        name: 'mars_barycenter',
        naif_id: 4,
        astronomyEngineName: 'Mars',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 4.282837e4, // km³/s²
        mass: 6.417e23, // kg - Mars + moons combined mass
        description: 'Mars System Barycenter',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 227939200.0,
            eccentricity: 0.0935,
            inclination: 1.850,
            longitudeOfAscendingNode: 49.558,
            argumentOfPeriapsis: 286.502,
            meanAnomalyAtEpoch: 19.373,
            epoch: 2451545.0
        }
    },
    {
        name: 'jupiter_barycenter',
        naif_id: 5,
        astronomyEngineName: 'Jupiter',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 1.26686534e8, // km³/s²
        mass: 1.898e27, // kg - Jupiter + moons combined mass
        description: 'Jupiter System Barycenter',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 778500000.0,
            eccentricity: 0.0489,
            inclination: 1.303,
            longitudeOfAscendingNode: 100.464,
            argumentOfPeriapsis: 273.867,
            meanAnomalyAtEpoch: 20.020,
            epoch: 2451545.0
        }
    },
    {
        name: 'saturn_barycenter',
        naif_id: 6,
        astronomyEngineName: 'Saturn',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 3.7931187e7, // km³/s²
        mass: 5.683e26, // kg - Saturn + moons combined mass
        description: 'Saturn System Barycenter',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 1433530000.0,
            eccentricity: 0.0565,
            inclination: 2.485,
            longitudeOfAscendingNode: 113.665,
            argumentOfPeriapsis: 339.392,
            meanAnomalyAtEpoch: 317.020,
            epoch: 2451545.0
        }
    },
    {
        name: 'uranus_barycenter',
        naif_id: 7,
        astronomyEngineName: 'Uranus',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 5.793939e6, // km³/s²
        mass: 8.681e25, // kg - Uranus + moons combined mass
        description: 'Uranus System Barycenter',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 2875040000.0,
            eccentricity: 0.0463,
            inclination: 0.773,
            longitudeOfAscendingNode: 74.006,
            argumentOfPeriapsis: 96.998,
            meanAnomalyAtEpoch: 142.2386,
            epoch: 2451545.0
        }
    },
    {
        name: 'neptune_barycenter',
        naif_id: 8,
        astronomyEngineName: 'Neptune',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 6.836529e6, // km³/s²
        mass: 1.024e26, // kg - Neptune + moons combined mass
        description: 'Neptune System Barycenter',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 4504450000.0,
            eccentricity: 0.0097,
            inclination: 1.770,
            longitudeOfAscendingNode: 131.784,
            argumentOfPeriapsis: 273.187,
            meanAnomalyAtEpoch: 256.228,
            epoch: 2451545.0
        }
    },
    {
        name: 'pluto_barycenter',
        naif_id: 9,
        astronomyEngineName: 'Pluto',
        parent: 'ss_barycenter',
        type: 'barycenter',
        GM: 9.818e2, // km³/s²
        mass: 1.471e22, // kg - Pluto + moons combined mass
        description: 'Pluto System Barycenter',
        radius: 0,
        orbitalElements: {
            semiMajorAxis: 5906440628.0,
            eccentricity: 0.2488,
            inclination: 17.16,
            longitudeOfAscendingNode: 110.299,
            argumentOfPeriapsis: 113.834,
            meanAnomalyAtEpoch: 14.53,
            epoch: 2451545.0
        }
    }
]; 