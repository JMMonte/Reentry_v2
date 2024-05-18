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
    constructor(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker, camera, controls) {
        this.initProperties(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker, camera, controls);
        this.initGUI();
        this.setupEventListeners();
    }

    initProperties(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker, camera, controls) {
        this.gui = new GUI();
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.moon = moon;
        this.sun = sun;
        this.satellites = satellites;
        this.vectors = vectors;
        this.settings = settings;
        this.timeUtils = timeUtils;
        this.worldDebugger = worldDebugger;
        this.physicsWorker = physicsWorker;
        this.camera = camera;
        this.controls = controls;
        this.satelliteFolders = {};
        this.addGridHelper();
        this.followingBody = null; // Track the body to follow
        this.initialOffset = new THREE.Vector3(); // Initial offset between camera and target
        this.targetPosition = new THREE.Vector3(); // Position to smoothly transition to
        this.needsSmoothTransition = false; // Flag to indicate if a smooth transition is needed

        // Spherical coordinates
        this.spherical = new THREE.Spherical();
        this.updateSphericalFromCamera();

        // Enable panning
        this.controls.enablePan = true;

        // Listen to orbit control changes to update the spherical coordinates
        this.controls.addEventListener('change', () => {
            this.updateSphericalFromCamera();
        });
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
        this.addBodySelector();
    }

    setupEventListeners() {
        this.controls.addEventListener('change', this.updateInitialOffset.bind(this));
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

    addBodySelector() {
        const bodies = {
            None: null,
            Earth: this.earth,
            Moon: this.moon,
            ...this.satellites.reduce((acc, satellite) => {
                acc[`Satellite ${satellite.id}`] = satellite;
                return acc;
            }, {})
        };

        const bodySelector = this.gui.add({
            selectedBody: 'None'
        }, 'selectedBody', Object.keys(bodies)).name('Select Body');

        bodySelector.onChange((value) => {
            this.selectedBody = bodies[value];
            if (this.selectedBody) {
                this.updateCameraTarget();
            } else {
                this.clearCameraTarget();
            }
        });

        this.bodySelector = bodySelector; // Save the selector for later updates
    }

    updateCameraTarget() {
        if (this.selectedBody) {
            this.followingBody = this.selectedBody;
            const targetPosition = this.getBodyPosition(this.selectedBody);
            this.initialOffset.copy(this.camera.position).sub(this.controls.target);
            this.controls.target.copy(targetPosition);
            this.camera.position.copy(targetPosition).add(this.initialOffset);
            this.controls.update();
            this.targetPosition.copy(targetPosition); // Set target position for smooth transition
            this.needsSmoothTransition = true; // Enable smooth transition
        }
    }

    clearCameraTarget() {
        this.followingBody = null;
        // this.controls.target.set(0, 0, 0); // Reset the camera controller target
        // this.camera.position.set(0, 0, 10000); // Reset the camera position (or any default position)
        this.controls.update();
    }

    getBodyPosition(body) {
        if (body.getMesh) {
            return body.getMesh().position;
        } else if (body.mesh) {
            return body.mesh.position;
        } else {
            return new THREE.Vector3();
        }
    }

    updateInitialOffset() {
        if (this.followingBody) {
            const targetPosition = this.getBodyPosition(this.followingBody);
            this.initialOffset.copy(this.camera.position).sub(targetPosition);
        }
    }

    updateSphericalFromCamera() {
        // Update spherical coordinates based on the current camera position relative to the orbit target
        this.spherical.setFromVector3(this.camera.position.clone().sub(this.controls.target));
    }

    updateCameraPosition() {
        if (this.followingBody) {
            const targetPosition = this.getBodyPosition(this.followingBody);
            this.targetPosition.copy(targetPosition);

            // Smoothly interpolate the orbit target to the new position
            if (this.needsSmoothTransition) {
                this.controls.target.lerp(this.targetPosition, 0.05); // Adjust the lerp factor as needed
                if (this.controls.target.distanceTo(this.targetPosition) < 0.01) {
                    this.controls.target.copy(this.targetPosition);
                    this.needsSmoothTransition = false;
                }
            } else {
                this.controls.target.copy(this.targetPosition);
            }

            // Update camera position based on spherical coordinates and user input (pan)
            const deltaPosition = new THREE.Vector3().setFromSpherical(this.spherical);
            this.camera.position.copy(this.controls.target).add(deltaPosition);
            this.controls.update();
        }
    }

    createSatellite(latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
        const color = Math.random() * 0xffffff;
        const id = this.satellites.length > 0 ? Math.max(...this.satellites.map(sat => sat.id)) + 1 : 1;
    
        // Retrieve Earth's rotation quaternion and tilt quaternion
        const earthQuaternion = this.earth.rotationGroup.quaternion;
        const tiltQuaternion = this.earth.tiltGroup.quaternion;
    
        const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
            latitude, 
            longitude, 
            altitude, 
            velocity, 
            azimuth, 
            angleOfAttack, 
            this.timeUtils,
            earthQuaternion,
            tiltQuaternion,
        );
    
        const newSatellite = new Satellite(this.scene, this.world, this.earth, this.moon, positionECEF, velocityECEF, id, color);
        this.satellites.push(newSatellite);
        this.vectors.addSatellite(newSatellite);
        this.updateSatelliteGUI(newSatellite);
    
        this.physicsWorker.postMessage({
            type: 'createSatellite',
            data: newSatellite.serialize()
        });
    
        this.updateBodySelector(); // Update the body selector with new satellite
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

            this.physicsWorker.postMessage({
                type: 'removeSatellite',
                data: { id: satellite.id }
            });

            this.updateBodySelector(); // Update the body selector after removal
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

    updateBodySelector() {
        const bodies = {
            None: null,
            Earth: this.earth,
            Moon: this.moon,
            ...this.satellites.reduce((acc, satellite) => {
                acc[`Satellite ${satellite.id}`] = satellite;
                return acc;
            }, {})
        };

        this.bodySelector.remove(); // Remove the old selector

        const bodySelector = this.gui.add({
            selectedBody: 'None'
        }, 'selectedBody', Object.keys(bodies)).name('Select Body');

        bodySelector.onChange((value) => {
            this.selectedBody = bodies[value];
            if (this.selectedBody) {
                this.updateCameraTarget();
            } else {
                this.clearCameraTarget();
            }
        });

        this.bodySelector = bodySelector; // Save the new selector
    }
}

export { GUIManager };
