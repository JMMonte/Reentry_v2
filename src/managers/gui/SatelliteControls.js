import { Constants } from '../../utils/Constants.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { createSatelliteFromLatLon, createSatelliteFromOrbitalElements } from '../../createSatellite.js';

class SatelliteControls {
    constructor(gui, settings, guiManager, satellites, scene, world, earth, moon, vectors) {
        if (typeof window !== 'undefined') {
            this.gui = gui;
            this.settings = settings;
            this.guiManager = guiManager;
            this.satellites = satellites;
            this.scene = scene;
            this.world = world;
            this.earth = earth;
            this.moon = moon;
            this.vectors = vectors;
            this.satelliteFolders = {};
            this.addSatelliteControls();
        }
    }

    addSatelliteControls() {
        const satelliteData = {
            latitude: 0,
            longitude: 0,
            altitude: 500,
            velocity: 7800,
            azimuth: 90,
            angleOfAttack: 0,
            semiMajorAxis: 7000,
            eccentricity: 0,
            inclination: 0,
            raan: 0,
            argumentOfPeriapsis: 0,
            trueAnomaly: 0
        };

        const satelliteFolder = this.gui.addFolder('Satellite Launch Controls');
        
        // Lat/Lon based satellite creation
        const latLonFolder = satelliteFolder.addFolder('Latitude/Longitude Based');
        latLonFolder.add(satelliteData, 'latitude', -90, 90).name('Latitude (deg)').step(0.1).onChange(value => {
            satelliteData.latitude = value;
        }).listen();
        latLonFolder.add(satelliteData, 'longitude', -180, 180).name('Longitude (deg)').step(0.1).onChange(value => {
            satelliteData.longitude = value;
        }).listen();
        latLonFolder.add(satelliteData, 'altitude', 100, 50000).name('Altitude (km)').step(1).onChange(value => {
            satelliteData.altitude = value;
        }).listen();
        latLonFolder.add(satelliteData, 'velocity', 1000, 20000).name('Velocity (m/s)').step(10).onChange(value => {
            satelliteData.velocity = value;
        }).listen();
        latLonFolder.add(satelliteData, 'azimuth', 0, 360).name('Azimuth (deg)').step(1).onChange(value => {
            satelliteData.azimuth = value;
        }).listen();
        latLonFolder.add(satelliteData, 'angleOfAttack', -90, 90).name('Angle of Attack (deg)').step(0.1).onChange(value => {
            satelliteData.angleOfAttack = value;
        }).listen();

        latLonFolder.add({
            createDetailedSatellite: () => this.createSatelliteFromLatLon(
                satelliteData.latitude,
                satelliteData.longitude,
                satelliteData.altitude,
                satelliteData.velocity,
                satelliteData.azimuth,
                satelliteData.angleOfAttack
            )
        }, 'createDetailedSatellite').name('Launch Satellite');

        latLonFolder.add({
            addCircularOrbit: () => this.createSatelliteFromLatLon(
                satelliteData.latitude,
                satelliteData.longitude,
                satelliteData.altitude,
                PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, satelliteData.altitude * Constants.kmToMeters + Constants.earthRadius),
                satelliteData.azimuth,
                satelliteData.angleOfAttack
            )
        }, 'addCircularOrbit').name('Add Circular Orbit');

        latLonFolder.open();
        
        // Orbital elements based satellite creation
        const orbitalElementsFolder = satelliteFolder.addFolder('Orbital Elements Based');
        orbitalElementsFolder.add(satelliteData, 'semiMajorAxis', 6678, 42000).name('Semi-Major Axis (km)').step(1).onChange(value => {
            satelliteData.semiMajorAxis = value;
        }).listen();
        orbitalElementsFolder.add(satelliteData, 'eccentricity', 0, 1).name('Eccentricity').step(0.01).onChange(value => {
            satelliteData.eccentricity = value;
        }).listen();
        orbitalElementsFolder.add(satelliteData, 'inclination', 0, 180).name('Inclination (deg)').step(0.1).onChange(value => {
            satelliteData.inclination = value;
        }).listen();
        orbitalElementsFolder.add(satelliteData, 'raan', 0, 360).name('RAAN (deg)').step(0.1).onChange(value => {
            satelliteData.raan = value;
        }).listen();
        orbitalElementsFolder.add(satelliteData, 'argumentOfPeriapsis', 0, 360).name('Argument of Periapsis (deg)').step(0.1).onChange(value => {
            satelliteData.argumentOfPeriapsis = value;
        }).listen();
        orbitalElementsFolder.add(satelliteData, 'trueAnomaly', 0, 360).name('True Anomaly (deg)').step(0.1).onChange(value => {
            satelliteData.trueAnomaly = value;
        }).listen();

        orbitalElementsFolder.add({
            createSatellite: () => this.createSatelliteFromOrbitalElements(
                satelliteData.semiMajorAxis,
                satelliteData.eccentricity,
                satelliteData.inclination,
                satelliteData.raan,
                satelliteData.argumentOfPeriapsis,
                satelliteData.trueAnomaly
            )
        }, 'createSatellite').name('Launch Satellite');

        orbitalElementsFolder.open();
        
        satelliteFolder.open();
    }

    createSatelliteFromLatLon(latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
        createSatelliteFromLatLon(
            this.scene,
            this.world,
            this.earth,
            this.moon,
            this.satellites,
            this.vectors,
            this.gui,
            this.guiManager,
            latitude,
            longitude,
            altitude,
            velocity,
            azimuth,
            angleOfAttack
        );
    }

    createSatelliteFromOrbitalElements(semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly) {
        createSatelliteFromOrbitalElements(
            this.scene,
            this.world,
            this.earth,
            this.moon,
            this.satellites,
            this.vectors,
            this.gui,
            this.guiManager,
            semiMajorAxis,
            eccentricity,
            inclination,
            raan,
            argumentOfPeriapsis,
            trueAnomaly
        );
    }
}

export { SatelliteControls };
