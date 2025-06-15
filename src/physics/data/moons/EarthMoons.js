/**
 * Earth's Moons Configuration
 * 
 * Physical, orbital, and rendering properties for Earth's natural satellites
 */

import { PhysicsConstants } from '../../core/PhysicsConstants.js';
import { geojsonDataMissions } from '@/config/geojsonData.js';

// Moon physical and orbital constants (all in km, kg, or km/s)
export const moonRadius = 1737.4; // km
export const moonMass = 7.342e22; // kg
export const moonOrbitRadius = 384400; // km
export const moonGravitationalParameter = PhysicsConstants.PHYSICS.G * moonMass; // km^3/s^2

const MOON_RAD = moonRadius; // already in km

export default [
    {
        // Basic identification
        name: 'moon',
        naif_id: 301,
        astronomyEngineName: 'Moon',
        parent: 'emb',
        type: 'moon',
        symbol: '☾',

        // Physical properties
        mass: moonMass, // kg
        radius: MOON_RAD, // km
        GM: moonGravitationalParameter, // km³/s²

        // Shape properties
        oblateness: 0.0012, // Very small oblateness
        equatorialRadius: moonRadius, // km
        polarRadius: 1736.0, // km

        // Rotation properties (tidally locked)
        rotationPeriod: 27.321661 * 24 * 3600, // seconds (same as orbital period)
        tilt: 6.68, // degrees - inclination to ecliptic

        // Orbital properties
        soiRadius: 66170, // km - Sphere of Influence radius
        orbitalPeriod: 27.321661 * 24 * 3600, // seconds
        orbitalElements: {
            semiMajorAxis: moonOrbitRadius, // km - mean distance
            eccentricity: 0.0549, // mean value
            inclination: 5.145, // deg to ecliptic
            longitudeOfAscendingNode: 125.012, // deg (J2000.0, IAU 2023)
            argumentOfPeriapsis: 318.063, // deg (J2000.0, IAU 2023)
            meanAnomalyAtEpoch: 115.3654, // deg (J2000.0, IAU 2023)
            epoch: 2451545.0, // J2000.0
            referenceFrame: 'earth_equatorial'
        },

        // Orbit visualization configuration
        orbitVisualization: {
            useSpecialEMBHandling: true, // Use special EMB handling for Moon around EMB
            orbitPoints: 720 // High resolution for Moon-EMB orbit
        },

        // LOD levels
        lodLevelsKey: 'default',

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'moonTexture',
                normalMapKey: 'moonNormalTexture',
                params: {
                    roughness: 0.9,
                    metalness: 0.0,
                }
            }
        },

        // Lighting
        addLight: true,
        lightOptions: {
            color: 0xffffff,
            intensity: MOON_RAD * 10,
            helper: false
        },

        // Surface options to enable POIs (missions)
        surfaceOptions: {
            addLatitudeLines: true,
            addLongitudeLines: true,
            addCountryBorders: false, // Moon doesn't have countries
            addStates: false,         // Moon doesn't have states
            addCities: false,         // Moon doesn't have cities
            addAirports: false,       // Moon doesn't have airports
            addSpaceports: false,     // Moon doesn't have spaceports
            addGroundStations: false, // Moon doesn't have ground stations
            addObservatories: false,  // Moon doesn't have observatories
            addMissions: true,        // Moon has mission landing sites!
            latitudeStep: 15,
            longitudeStep: 15
        },

        // Radial grid configuration for orbital visualization
        radialGridConfig: {
            circles: [
                { radius: 100, label: 'LLO', style: 'major' },
                { radius: 500, label: '500 km', style: 'minor' },
                { radius: 1_000, label: '1,000 km', style: 'minor' },
                { radius: 14_500, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            ],
            radialLines: { count: 22 },
        },

        // Geological properties
        geology: {
            coreRadius: 240, // km - small iron core
            mantleThickness: 1330, // km
            crustThickness: 50, // km - average thickness
            age: 4.51e9 * PhysicsConstants.TIME.DAYS_IN_YEAR * PhysicsConstants.TIME.SECONDS_IN_DAY, // seconds (4.51 billion years)
            mariaFraction: 0.16 // fraction of surface covered by maria
        },

        // Libration properties
        libration: {
            longitudeAmplitude: 7.9, // degrees - maximum libration in longitude
            latitudeAmplitude: 6.9, // degrees - maximum libration in latitude
            period: 27.321661 * 24 * 3600 // seconds - same as orbital period
        },

        // Surface properties
        surface: {
            albedo: 0.136, // geometric albedo
            temperature: {
                day: 396, // K - maximum daytime temperature
                night: 40, // K - minimum nighttime temperature
                average: 218 // K - average temperature
            },
            regolithDepth: 0.004, // km - average regolith thickness
            craterDensity: 'high', // relative crater density
        },

        // Orientation (IAU 2023/2025)
        poleRA: 269.9949,     // deg at J2000.0
        poleDec: 66.5392,     // deg at J2000.0
        poleRARate: 0.0031,   // deg per century  
        poleDecRate: 0.0130,  // deg per century
        spin: 38.3213,        // deg at J2000.0
        spinRate: 13.17635815, // deg/day (synchronous rotation)
        orientationEpoch: 2451545.0, // JD (J2000.0)

        // Add missionsData at the top level for POI instancing
        missionsData: geojsonDataMissions,

        // Phases (for rendering and astronomical calculations)
        phases: {
            synodicPeriod: 29.530589 * 24 * 3600, // seconds - lunar month
            phaseNames: ['New', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
                'Full', 'Waning Gibbous', 'Third Quarter', 'Waning Crescent']
        }
    }
]; 