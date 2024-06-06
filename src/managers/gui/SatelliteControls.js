import { Constants } from '../../utils/Constants.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Satellite } from '../../components/Satellite.js';
import { numberToHexColor } from '../../utils/colorUtils.js';

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
            angleOfAttack: 0
        };

        const satelliteFolder = this.gui.addFolder('Satellite Launch Controls');
        satelliteFolder.add(satelliteData, 'latitude', -90, 90).name('Latitude (deg)').step(0.1).onChange(value => {
            satelliteData.latitude = value;
        }).listen();
        satelliteFolder.add(satelliteData, 'longitude', -180, 180).name('Longitude (deg)').step(0.1).onChange(value => {
            satelliteData.longitude = value;
        }).listen();
        satelliteFolder.add(satelliteData, 'altitude', 100, 50000).name('Altitude (km)').step(1).onChange(value => {
            satelliteData.altitude = value;
        }).listen();
        satelliteFolder.add(satelliteData, 'velocity', 1000, 20000).name('Velocity (m/s)').step(10).onChange(value => {
            satelliteData.velocity = value;
        }).listen();
        satelliteFolder.add(satelliteData, 'azimuth', 0, 360).name('Azimuth (deg)').step(1).onChange(value => {
            satelliteData.azimuth = value;
        }).listen();
        satelliteFolder.add(satelliteData, 'angleOfAttack', -90, 90).name('Angle of Attack (deg)').step(0.1).onChange(value => {
            satelliteData.angleOfAttack = value;
        }).listen();

        satelliteFolder.add({
            createDetailedSatellite: () => this.createSatellite(
                satelliteData.latitude,
                satelliteData.longitude,
                satelliteData.altitude * Constants.kmToMeters,
                satelliteData.velocity,
                satelliteData.azimuth,
                satelliteData.angleOfAttack
            )
        }, 'createDetailedSatellite').name('Launch Satellite');

        satelliteFolder.add({
            addCircularOrbit: () => this.createSatellite(
                satelliteData.latitude,
                satelliteData.longitude,
                satelliteData.altitude * Constants.kmToMeters,
                PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, satelliteData.altitude * Constants.kmToMeters + Constants.earthRadius),
                satelliteData.azimuth,
                satelliteData.angleOfAttack
            )
        }, 'addCircularOrbit').name('Add Circular Orbit');

        satelliteFolder.open();
    }

    createSatellite(latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
        const earthQuaternion = this.earth.rotationGroup.quaternion;
        const tiltQuaternion = this.earth.tiltGroup.quaternion;

        const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
            latitude,
            longitude,
            altitude,
            velocity,
            azimuth,
            angleOfAttack,
            earthQuaternion,
            tiltQuaternion,
        );

        // Get the next possible ID, which is the length of the satellites array
        let id = this.satellites.length;
        
        // Check if a satellite with the same ID already exists
        const existingSatellite = this.satellites.find(satellite => satellite.id === id);
        
        // If the satellite with the given ID already exists, skip creating it
        if (existingSatellite) {
            id = id + 1;
        }
        
        const color = Math.random() * 0xffffff;

        const newSatellite = new Satellite(this.scene, this.world, this.earth, this.moon, positionECEF, velocityECEF, id, color);
        this.satellites.push(newSatellite);
        this.vectors.addSatellite(newSatellite);
        this.vectors.setSatVisible(this.settings.showSatVectors);

        this.updateSatelliteGUI(newSatellite);
        this.guiManager.updateBodySelector();
        this.guiManager.enableManeuverFolder();
        this.guiManager.updateBiImpulseControls();
    }

    updateSatelliteGUI(newSatellite) {
        const satelliteFolder = this.gui.addFolder(`Satellite ${newSatellite.id}`);

        const altitudeObj = { altitude: parseFloat(newSatellite.getCurrentAltitude()).toFixed(4) };
        const velocityObj = { velocity: parseFloat(newSatellite.getCurrentVelocity()).toFixed(4) };
        const earthGravityForceObj = { earthGravityForce: parseFloat(newSatellite.getCurrentEarthGravityForce()).toFixed(4) };
        const moonGravityForceObj = { moonGravityForce: parseFloat(newSatellite.getCurrentMoonGravityForce()).toFixed(4) };
        const dragObj = { drag: parseFloat(newSatellite.getCurrentDragForce()).toFixed(8) };

        const altitudeController = satelliteFolder.add(altitudeObj, 'altitude').name('Altitude (m)').listen();
        const velocityController = satelliteFolder.add(velocityObj, 'velocity').name('Velocity (m/s)').listen();
        const earthGravityForceController = satelliteFolder.add(earthGravityForceObj, 'earthGravityForce').name('Grav. Force (N)').listen();
        const moonGravityForceController = satelliteFolder.add(moonGravityForceObj, 'moonGravityForce').name('Moon Force (N)').listen();
        const dragController = satelliteFolder.add(dragObj, 'drag').name('Drag Force (N)').listen();

        newSatellite.altitudeController = altitudeController;
        newSatellite.velocityController = velocityController;
        newSatellite.earthGravityForceController = earthGravityForceController;
        newSatellite.moonGravityForceController = moonGravityForceController;
        newSatellite.dragController = dragController;

        const colorData = {
            color: numberToHexColor(newSatellite.color)
        };

        satelliteFolder.addColor(colorData, 'color').name('Color').onChange(value => {
            newSatellite.setColor(parseInt(value.replace(/^#/, ''), 16));
        });

        satelliteFolder.add(newSatellite.mesh.scale, 'x', 0.1, 10, 0.1).name('Size').onChange(value => {
            newSatellite.mesh.scale.set(value, value, value);
        });

        satelliteFolder.add({ remove: () => this.removeSatellite(newSatellite) }, 'remove').name('Remove Satellite');
        this.guiManager.satelliteFolders[newSatellite.id] = satelliteFolder;
        satelliteFolder.open();

        newSatellite.updateAltitude = function(value) {
            altitudeObj.altitude = parseFloat(value).toFixed(4);
            altitudeController.updateDisplay();
        };

        newSatellite.updateVelocity = function(value) {
            velocityObj.velocity = parseFloat(value).toFixed(4);
            velocityController.updateDisplay();
        };

        newSatellite.updateEarthGravityForce = function(value) {
            earthGravityForceObj.earthGravityForce = parseFloat(value).toFixed(4);
            earthGravityForceController.updateDisplay();
        };

        newSatellite.updateMoonGravityForce = function(value) {
            moonGravityForceObj.moonGravityForce = parseFloat(value).toFixed(4);
            moonGravityForceController.updateDisplay();
        }

        newSatellite.updateDrag = function(value) {
            dragObj.drag = parseFloat(value).toFixed(4);
            dragController.updateDisplay();
        };
    }

    removeSatellite(satellite) {
        const index = this.satellites.indexOf(satellite);
        if (index !== -1) {
            this.satellites.splice(index, 1);
            satellite.deleteSatellite();
            this.vectors.removeSatellite(satellite); // Remove the satellite from the vectors
            const folder = this.guiManager.satelliteFolders[satellite.id];
            if (folder) {
                this.gui.removeFolder(folder);
                delete this.guiManager.satelliteFolders[satellite.id];
            }

            this.guiManager.physicsWorker.postMessage({
                type: 'removeSatellite',
                data: { id: satellite.id }
            });

            this.guiManager.updateBodySelector(); // Update the body selector after removal
        }
    }
}

export { SatelliteControls };
