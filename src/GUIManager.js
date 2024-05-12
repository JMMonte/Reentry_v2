import { GUI } from 'dat.gui';
import { Constants } from './Constants.js';
import { Satellite } from './Satellite.js';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { PhysicsUtils } from './PhysicsUtils.js';  // Ensure this is imported
import { ChartManager } from './ChartManager.js';

class GUIManager {
    constructor(scene, world, earth, satellites, vectors, settings, timeUtils, worldDebugger) {
        this.gui = new GUI();
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.satellites = satellites;
        this.vectors = vectors;
        this.settings = settings;
        this.timeUtils = timeUtils;
        this.worldDebugger = worldDebugger;
        this.satelliteFolders = []; // Store GUI folders for each satellite

        // Create PolarGridHelper
        this.gridHelper = new THREE.PolarGridHelper(10000, 100, 100, 64, 0x888888, 0x444444); // Modify size, divisions, and colors as needed
        this.gridHelper.visible = this.settings.showGrid;
        this.gridHelper.material.transparent = true; // Add transparency
        this.gridHelper.material.opacity = 0.5; // Set opacity value (0.0 - 1.0)
        this.scene.add(this.gridHelper);

        this.setupGUI();
    }

    setupGUI() {
        // Time Warp Settings
        this.gui.add(
            this.settings, 
            'timeWarp', {
                'Paused': 0,
                'Normal (1x)': 1,
                'Fast (10)': 10,
                'Faster (100)': 100,
                'Ludicrous (1000)': 1000,
                'Insanity (10000)': 10000,
                'Dr. Strange (100000)': 100000,
            })
            .name('Time Warp')
            .onChange(value => {
                this.timeUtils.setTimeWarp(value);
                this.world.timeScale = value;
            });

        // Simulated Time Display
        this.gui.add(this.settings, 'simulatedTime').name('Simulated Time').listen();

        // Satellite Launch Control
        this.gui.add(this.settings, 'altitude', 0, 100000).name('Altitude');
        this.gui.add({ createSatellite: () => this.createSatellite() }, 'createSatellite').name('Launch Satellite');

        // Display Options
        const displayFolder = this.gui.addFolder('Display Options');
        displayFolder.add(this.settings, 'showGrid').name('Show Grid').onChange(value => {
            this.gridHelper.visible = value;  // Direct control over GridHelper visibility
        });
        displayFolder.add(this.settings, 'showVectors').name('Show Vectors').onChange(value => {
            this.vectors.setVisible(value);
        });

        // Debug Settings
        const debugFolder = this.gui.addFolder('Debugging');
        debugFolder.add(this.settings, 'showDebugger').name('Show Physics Debug').onChange(value => this.worldDebugger.enabled = value);

        displayFolder.open();
        debugFolder.open();
    }

    createSatellite() {
        const altitude = this.settings.altitude * Constants.kmToMeters;  // Altitude in simulation units
        const radiusInMeters = Constants.earthRadius + altitude; // Total radius in simulation units
        const radiusInUnits = radiusInMeters * Constants.metersToKm * Constants.scale; // Convert to Three.js units

        const speedMetersPerSecond = PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, radiusInMeters);
        const speedInSimulationUnits = speedMetersPerSecond * Constants.metersToKm * Constants.scale; // Convert to Three.js units

        const position = new CANNON.Vec3(0, 0, radiusInUnits);
        const velocity = new CANNON.Vec3(speedInSimulationUnits, 0, 0); // Keep velocity in m/s for consistency with physics engine

        const newSatellite = new Satellite(this.scene, this.world, this.earth, position, velocity);
        this.satellites.push(newSatellite);
        this.vectors.addSatellite(newSatellite);
        this.updateSatelliteGUI(newSatellite);
        ChartManager.resetData();
    }

    removeSatellite(satellite) {
        const index = this.satellites.indexOf(satellite);
        if (index !== -1) {
            this.satellites.splice(index, 1);
            satellite.deleteSatellite(); // Assuming there is a delete method in Satellite
            this.vectors.removeSatellite(satellite);
            this.gui.removeFolder(this.satelliteFolders[index]);
            this.satelliteFolders.splice(index, 1);
            this.updateAllSatelliteFolders(); // Update the labels of all remaining satellite folders
        }
    }

    updateSatelliteGUI(newSatellite) {
        const satelliteFolder = this.gui.addFolder(`Satellite ${this.satellites.length}`);

        // Create GUI elements for altitude, velocity, and acceleration
        const altitudeController = satelliteFolder.add({ altitude: 0 }, 'altitude').name('Altitude (m)').listen();
        const velocityController = satelliteFolder.add({ velocity: 0 }, 'velocity').name('Velocity (m/s)').listen();
        const accelerationController = satelliteFolder.add({ acceleration: 0 }, 'acceleration').name('Acc. (m/s^2)').listen();
        const dragController = satelliteFolder.add({ drag: 0 }, 'drag').name('Drag Force (N)').listen();

        // Store references to controllers for real-time updates
        newSatellite.altitudeController = altitudeController;
        newSatellite.velocityController = velocityController;
        newSatellite.accelerationController = accelerationController;
        newSatellite.dragController = dragController;

        const initialColor = '#' + newSatellite.mesh.material.color.getHexString();

        satelliteFolder.addColor({ color: initialColor }, 'color').name('Color').onChange(value => {
            // Convert hex string to numeric format on change
            const numericColor = parseInt(value.replace(/^#/, ''), 16);
            newSatellite.setColor(numericColor);
        
        });
        satelliteFolder.add(newSatellite.mesh.scale, 'x', 0.1, 10, 0.1).name('Size').onChange(value => {
            newSatellite.mesh.scale.set(value, value, value);
        });
        satelliteFolder.add({ remove: () => this.removeSatellite(newSatellite) }, 'remove').name('Remove Satellite');
        this.satelliteFolders.push(satelliteFolder); // Store the reference to the folder

        // Set decimal precision to 4
        satelliteFolder.__controllers.forEach(controller => {
            controller.__precision = 4;
        });

        // open the folder
        satelliteFolder.open();
    }

    updateAllSatelliteFolders() {
        this.satelliteFolders.forEach((folder, idx) => {
            folder.name = `Satellite ${idx + 1}`;
        });
    }
}

export { GUIManager };
