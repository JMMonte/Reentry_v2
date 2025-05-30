/**
 * Sun Configuration
 * 
 * Physical, orbital, and rendering properties for the Sun
 */

import {Constants} from '../../../utils/Constants.js';

const sunMass = 1.989e30; // kg
const sunRadius = 695_700; // km
const sunGM = Constants.G * sunMass; // km³/s² - Note: Constants.G is already in km³/kg/s²

export default {
    // Basic identification
    name: 'sun',
    naif_id: 10,
    astronomyEngineName: 'Sun',
    parent: 'ss_barycenter',
    type: 'star',
    symbol: '☉',

    // Physical properties
    mass: sunMass, // kg
    radius: sunRadius, // km
    GM: sunGM, // km³/s² - Standard gravitational parameter
    
    // Rotation properties
    rotationPeriod: 25.05 * 24 * 3600, // seconds (25.05 days at equator)
    rotationRate: 2 * Math.PI / (25.05 * 24 * 3600), // rad/s - angular velocity
    oblateness: 9e-6, // Very small oblateness
    tilt: 7.25, // degrees - inclination to ecliptic
    
    // Orbital properties
    soiRadius: 1e12, // km - Effectively infinite within the solar system
    hillSphere: 1e12, // km - The Sun dominates the entire solar system

    // Rendering properties
    materials: {
        surfaceConfig: {
            materialType: 'emissive',
            color: 0xffffff,
            emissive: 0xffff00,
            emissiveIntensity: 1.0,
            params: {
                roughness: 1.0,
                metalness: 0.0
            }
        }
    },

    // Lighting (Sun is the primary light source)
    addLight: true,
    lightOptions: {
        type: 'directional',
        color: 0xffffff,
        intensity: 3.0,
        castShadow: true,
        helper: false
    },

    // LOD levels for rendering optimization
    lodLevelsKey: 'default',

    // Solar atmosphere/corona properties
    atmosphere: {
        type: 'corona',
        thickness: 2000, // km - visible corona extent
        temperature: 1e6, // K - corona temperature
        density: 1e-12, // kg/m³ - corona density
        emissiveIntensity: 0.1
    },

    // Radial grid configuration for visualization
    radialGridConfig: {
        circles: [
            { radius: 695_700, label: 'Photosphere', style: 'major' },
            { radius: 695_700 * 1.5, label: 'Corona', style: 'minor' },
            { radius: 0.1 * 149597870.7, label: '0.1 AU', style: 'dashed' },
            { radius: 0.3 * 149597870.7, label: '0.3 AU', style: 'dashed' },
            { radius: 1.0 * 149597870.7, label: '1 AU (Earth)', style: 'major' },
            { radius: 5.2 * 149597870.7, label: '5.2 AU (Jupiter)', style: 'major' }
        ],
        markerStep: 50_000_000, // 50,000 km
        labelMarkerStep: 100_000_000, // 100,000 km
        radialLines: { count: 24 }
    },

    // Physics properties
    physics: {
        gravitationalInfluence: 'dominant', // Primary gravitational body
        stellarWind: {
            velocity: 400, // km/s - typical solar wind speed
            density: 5e6, // particles/m³ - proton density at 1 AU
            magneticField: 5e-9 // T - interplanetary magnetic field
        },
        solarCycle: {
            period: 11 * 365.25 * 24 * 3600, // seconds (11 years)
            currentPhase: 0 // 0-1, where 0 is solar minimum, 0.5 is solar maximum
        }
    },

    // Astronomical properties
    astronomy: {
        spectralClass: 'G2V',
        luminosity: 3.828e26, // W
        surfaceTemperature: 5778, // K
        age: 4.6e9 * 365.25 * 24 * 3600, // seconds (4.6 billion years)
        metallicity: 0.0122 // Z - fraction of mass in elements heavier than helium
    },

    // Rotational properties
    poleRA: 286.13, // deg at J2000.0, +0.0*T per century
    poleDec: 63.87, // deg at J2000.0, +0.0*T per century
    spin: 286.13, // deg at J2000.0
    spinRate: 0.00001990986, // deg/day (retrograde)
    orientationEpoch: 2451545.0, // JD (J2000.0)
}; 