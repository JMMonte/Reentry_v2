/**
 * Earth's Moons Configuration
 * 
 * Physical, orbital, and rendering properties for Earth's natural satellites
 */

import * as THREE from 'three';
import { metersToKm } from '../../../config/constants-lite.js';
import { geojsonDataMissions } from '../../../config/geojsonData.js';

const MOON_RAD = 1_737_400 * metersToKm;

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
        mass: 7.342e22, // kg
        radius: MOON_RAD, // km
        GM: 4.9048695e3, // km³/s² - Standard gravitational parameter
        
        // Shape properties
        oblateness: 0.0012, // Very small oblateness
        equatorialRadius: 1738.1, // km
        polarRadius: 1736.0, // km

        // Rotation properties (tidally locked)
        rotationPeriod: 27.321661 * 24 * 3600, // seconds (same as orbital period)
        tilt: 6.68, // degrees - inclination to ecliptic

        // Orbital properties
        soiRadius: 66170, // km - Sphere of Influence radius
        orbitalPeriod: 27.321661 * 24 * 3600, // seconds
        semiMajorAxis: 384400, // km - average distance from Earth

        // Rendering properties
        materials: {
            surfaceConfig: {
                materialType: 'standard',
                textureKey: 'moonTexture',
                normalMapKey: 'moonNormalTexture',
                params: {
                    normalScale: new THREE.Vector2(0.5, 0.5),
                    roughness: 0.7,
                    metalness: 0.1,
                }
            },
        },

        // Lighting
        addLight: true,
        lightOptions: {
            color: 0xffffff,
            intensity: MOON_RAD * 10,
            helper: false
        },

        // LOD levels for rendering optimization
        lodLevelsKey: 'default',

        // Mission data
        missionsData: geojsonDataMissions,

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
            age: 4.51e9 * 365.25 * 24 * 3600, // seconds (4.51 billion years)
            mariaFraction: 0.16 // fraction of surface covered by maria
        },

        // Orbital mechanics
        orbitalElements: {
            semiMajorAxis: 384400, // km
            eccentricity: 0.0549,
            inclination: 5.145, // degrees - to ecliptic
            longitudeOfAscendingNode: 125.08, // degrees
            argumentOfPeriapsis: 318.15, // degrees
            meanAnomalyAtEpoch: 135.27 // degrees at J2000.0
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
            regolithDepth: 4, // meters - average regolith thickness
            craterDensity: 'high' // relative crater density
        },

        // Phases (for rendering and astronomical calculations)
        phases: {
            synodicPeriod: 29.530589 * 24 * 3600, // seconds - lunar month
            phaseNames: ['New', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 
                        'Full', 'Waning Gibbous', 'Third Quarter', 'Waning Crescent']
        }
    }
]; 