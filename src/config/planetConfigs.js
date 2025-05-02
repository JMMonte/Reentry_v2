import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { OrbitalRegimes } from './OrbitalRegimes.js';

export const planetConfigs = {
    Sun: {
        name: 'Sun',
        radius: 696340000, // meters
        rotationPeriod: 2192832, // seconds (approx 25.38 days)
        meshRes: 64,
        materials: {
            surface: { type: 'emissive', map: 'sunmap.jpg', emissiveIntensity: 1.5 }
        },
        addLight: true,
        lightOptions: {
            intensity: 5000, // Adjust intensity as needed
            distance: 0, // Infinite distance
            decay: 0 // No decay
        },
        symbol: '☉'
    },
    Earth: {
        name: 'Earth',
        radius: Constants.earthRadius, // meters
        oblateness: Constants.earthOblateness,
        rotationPeriod: Constants.earthRotationPeriod, // seconds
        orbitalPeriod: Constants.earthOrbitalPeriod, // days
        tilt: Constants.earthTilt, // degrees
        rotationOffset: Constants.earthInitialRotation, // radians
        meshRes: 128,
        atmosphereRes: 128,
        cloudRes: 128,
        atmosphereThickness: Constants.earthAtmosphereHeight, // meters
        cloudThickness: Constants.earthCloudHeight, // meters
        materials: {
            surface: { map: 'earthmap1k.jpg', specularMap: 'earthspec1k.jpg', normalMap: 'earthnorm1k.jpg', normalScale: new THREE.Vector2(0.5, 0.5), specular: new THREE.Color('grey') },
            clouds: { map: 'earthcloudmap.jpg', transparent: true, opacity: 0.2 },
            atmosphere: { /* uses default shader */ }
        },
        addSurface: true,
        surfaceOptions: {
            addLatitudeLines: false,
            latitudeStep: 10,
            addLongitudeLines: false,
            longitudeStep: 10,
            addCountryBorders: true,
            addStates: true,
            addCities: true,
            addAirports: true,
            addSpaceports: true,
            addGroundStations: true,
            addObservatories: true,
            addMissions: true
        },
        primaryGeojsonData: null, // geojsonDataSovereignty,
        stateGeojsonData: null, // geojsonDataStates,
        cityData: null, // geojsonDataCities,
        airportsData: null, // geojsonDataAirports,
        spaceportsData: null, // geojsonDataSpaceports,
        groundStationsData: null, // geojsonDataGroundStations,
        observatoriesData: null, // geojsonDataObservatories,
        missionsData: null, // geojsonDataMissions,
        lodLevels: [
            { meshRes: 128, distance: 0 },
            { meshRes: 64, distance: Constants.earthRadius * 5 },
            { meshRes: 32, distance: Constants.earthRadius * 20 },
        ],
        dotPixelSizeThreshold: 4, // Switch to dot when smaller than 4 pixels
        dotColor: 0x6699ff,
        soiRadius: Constants.earthSOI / Constants.earthRadius, // SOI radius as a multiple of planet radius
        symbol: '🜨',
        radialGridConfig: {
          maxDisplayRadius: Constants.earthHillSphere,
          circles: [
            { radius: OrbitalRegimes.LEO.min, label: "LEO Min", style: "solid" },
            { radius: OrbitalRegimes.LEO.max, label: "LEO Max", style: "solid" },
            { radius: OrbitalRegimes.MEO.min, label: "MEO Min", style: "solid" },
            { radius: OrbitalRegimes.MEO.max, label: "MEO Max", style: "solid" },
            { radius: OrbitalRegimes.GEO.altitude, label: "GEO", style: "solid" },
            { radius: OrbitalRegimes.HEO.perigee, label: "HEO Peri.", style: "dashed" },
            { radius: OrbitalRegimes.HEO.apogee, label: "HEO Apo.", style: "dashed" },
            { radius: Constants.moonOrbitRadius, label: 'Lunar Orbit', style: "dashed" },
            { radius: Constants.earthSOI, label: 'SOI', style: "dashed", dashScale: 2 },
            { radius: Constants.earthHillSphere, label: 'Hill Sphere', style: "dashed", dashScale: 3 }
          ],
          markerStep: 50000 * Constants.kmToMeters,
          labelMarkerStep: 100000 * Constants.kmToMeters,
          radialLines: {
            count: 12
          },
          fadeFactors: {
            start: 0.05,
            end: 0.2
          }
        }
    },
    Moon: {
        name: 'Moon',
        radius: Constants.moonRadius, // meters
        rotationPeriod: Constants.moonRotationPeriod, // seconds
        orbitalPeriod: Constants.moonOrbitalPeriod, // days
        meshRes: 64,
        materials: {
            surface: { map: 'moonmap1k.jpg', bumpMap: 'moonbump1k.jpg', bumpScale: 0.002 }
        },
        orbitElements: {
          semiMajorAxis: Constants.moonOrbitRadius + Constants.earthRadius,
          eccentricity: 0.0549,
          inclination: 5.145,
          mu: Constants.earthMu
        },
        lodLevels: [
          { meshRes: 64, distance: 0 },
          { meshRes: 32, distance: Constants.moonRadius * 10 },
          { meshRes: 16, distance: Constants.moonRadius * 50 },
        ],
        dotPixelSizeThreshold: 2,
        dotColor: 0xaaaaaa,
        symbol: '☾'
    }
} 