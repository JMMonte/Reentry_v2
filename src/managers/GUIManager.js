import * as THREE from 'three';
import { GUI } from 'dat.gui';
import { Constants } from '../utils/Constants.js';
import { Satellite } from '../components/Satellite.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';

function numberToHexColor(colorNumber) {
    const integerColor = Math.floor(colorNumber) & 0xFFFFFF;
    const hexColor = integerColor.toString(16).padStart(6, '0');
    return `#${hexColor}`;
}

class GUIManager {
    constructor(scene, world, earth, moon, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker) {
        this.initProperties(scene, world, earth, moon, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker);
        this.initGUI();
    }

    initProperties(scene, world, earth, moon, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker) {
        this.gui = new GUI();
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.moon = moon; // Add the moon
        this.satellites = satellites;
        this.vectors = vectors;
        this.settings = settings;
        this.timeUtils = timeUtils;
        this.worldDebugger = worldDebugger;
        this.physicsWorker = physicsWorker;
        this.satelliteFolders = {};
        this.addGridHelper();
    }

    addGridHelper() {
        this.gridHelper = new THREE.PolarGridHelper(40000, 100, 100, 64, 0x888888, 0x444444);
        this.gridHelper.visible = this.settings.showGrid;
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.opacity = 0.5;
        this.scene.add(this.gridHelper);
    }

    initGUI() {
        this.addTimeControls();
        this.addSimulationDisplay();
        this.addSatelliteControls();
        this.addDisplayOptions();
        this.addDebugOptions();
    }

    addTimeControls() {
        this.gui.add(this.settings, 'timeWarp', {
            'Paused': 0,
            'Normal (1x)': 1,
            'Fast (3)': 3,
            'Faster (10)': 10,
            'Ludicrous (30)': 30,
            'Thanos (100)': 100,
            'Mr. Spock (300)': 300,
            'Dr. Strange (1000)': 1000,
            'Godspeed (3000)': 3000
        }).name('Time Warp').onChange(this.updateTimeWarp.bind(this));
    }

    updateTimeWarp(value) {
        this.timeUtils.setTimeWarp(value);
        this.world.timeScale = value;
        this.world.solver.iterations = value ** 2;
    }

    addSimulationDisplay() {
        this.gui.add(this.settings, 'simulatedTime').name('Simulated Time').listen();
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
        satelliteFolder.add(satelliteData, 'latitude', -90, 90).name('Latitude (deg)').step(0.1).listen();
        satelliteFolder.add(satelliteData, 'longitude', -180, 180).name('Longitude (deg)').step(0.1).listen();
        satelliteFolder.add(satelliteData, 'altitude', 100, 50000).name('Altitude (km)').step(1).listen();
        satelliteFolder.add(satelliteData, 'velocity', 1000, 20000).name('Velocity (m/s)').step(10).listen();
        satelliteFolder.add(satelliteData, 'azimuth', 0, 360).name('Azimuth (deg)').step(1).listen();
        satelliteFolder.add(satelliteData, 'angleOfAttack', -90, 90).name('Angle of Attack (deg)').step(0.1).listen();

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

    addDisplayOptions() {
        const displayFolder = this.gui.addFolder('Display Options');
        displayFolder.add(this.settings, 'showGrid').name('Show Grid').onChange(this.toggleGridVisibility.bind(this));
        displayFolder.add(this.settings, 'showVectors').name('Show Vectors').onChange(this.toggleVectorVisibility.bind(this));
        displayFolder.open();
    }

    toggleGridVisibility(value) {
        this.gridHelper.visible = value;
    }

    toggleVectorVisibility(value) {
        this.vectors.setVisible(value);
    }

    addDebugOptions() {
        const debugFolder = this.gui.addFolder('Debugging');
        debugFolder.add(this.settings, 'showDebugger').name('Show Physics Debug').onChange(this.toggleDebuggerVisibility.bind(this));
        debugFolder.open();
    }

    toggleDebuggerVisibility(value) {
        this.worldDebugger.enabled = value;
    }

    createSatellite(latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
        const color = Math.random() * 0xffffff;
        const id = this.satellites.length > 0 ? Math.max(...this.satellites.map(sat => sat.id)) + 1 : 1;
        const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(latitude, longitude, altitude, velocity, azimuth, angleOfAttack, this.timeUtils);
        const newSatellite = new Satellite(this.scene, this.world, this.earth, this.moon, positionECEF, velocityECEF, id, color);
        this.satellites.push(newSatellite);
        this.vectors.addSatellite(newSatellite);
        this.updateSatelliteGUI(newSatellite);
    
        // Notify worker to create satellite
        this.physicsWorker.postMessage({
            type: 'createSatellite',
            data: newSatellite.serialize()
        });
    }
    
    removeSatellite(satellite) {
        const index = this.satellites.indexOf(satellite);
        if (index !== -1) {
            this.satellites.splice(index, 1);
            satellite.deleteSatellite();
            this.vectors.removeSatellite(satellite);
            const folder = this.satelliteFolders[satellite.id];
            if (folder) {
                this.gui.removeFolder(folder);
                delete this.satelliteFolders[satellite.id];
            }
    
            // Notify worker to remove satellite
            this.physicsWorker.postMessage({
                type: 'removeSatellite',
                data: { id: satellite.id }
            });
        }
    }

    updateSatelliteGUI(newSatellite) {
        const satelliteFolder = this.gui.addFolder(`Satellite ${newSatellite.id}`);

        const altitudeObj = { altitude: parseFloat(newSatellite.altitude).toFixed(4) };
        const velocityObj = { velocity: parseFloat(newSatellite.velocity).toFixed(4) };
        const accelerationObj = { acceleration: parseFloat(newSatellite.acceleration).toFixed(4) };
        const dragObj = { drag: parseFloat(newSatellite.drag).toFixed(8) };

        const altitudeController = satelliteFolder.add(altitudeObj, 'altitude').name('Altitude (m)').listen();
        const velocityController = satelliteFolder.add(velocityObj, 'velocity').name('Velocity (m/s)').listen();
        const accelerationController = satelliteFolder.add(accelerationObj, 'acceleration').name('Acc. (m/s^2)').listen();
        const dragController = satelliteFolder.add(dragObj, 'drag').name('Drag Force (N)').listen();

        newSatellite.altitudeController = altitudeController;
        newSatellite.velocityController = velocityController;
        newSatellite.accelerationController = accelerationController;
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
        this.satelliteFolders[newSatellite.id] = satelliteFolder;
        satelliteFolder.open();

        // Update functions to ensure the GUI displays values with 4 decimals
        newSatellite.updateAltitude = function(value) {
            altitudeObj.altitude = parseFloat(value).toFixed(4);
            altitudeController.updateDisplay();
        };

        newSatellite.updateVelocity = function(value) {
            velocityObj.velocity = parseFloat(value).toFixed(4);
            velocityController.updateDisplay();
        };

        newSatellite.updateAcceleration = function(value) {
            accelerationObj.acceleration = parseFloat(value).toFixed(4);
            accelerationController.updateDisplay();
        };

        newSatellite.updateDrag = function(value) {
            dragObj.drag = parseFloat(value).toFixed(4);
            dragController.updateDisplay();
        };
    }
}

export { GUIManager };
