import * as THREE from 'three';
import { GUI } from 'dat.gui';
import { Constants } from '../utils/Constants.js';
import { Satellite } from '../components/Satellite.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { numberToHexColor } from '../utils/colorUtils.js';

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

        // Set initial visibility based on settings
        this.toggleVectorVisibility(this.settings.showVectors);
        this.toggleSurfaceLinesVisibility(this.settings.showSurfaceLines);
        this.toggleOrbitVisibility(this.settings.showOrbits);
        this.toggleCitiesVisibility(this.settings.showCities);
        this.toggleAirportsVisibility(this.settings.showAirports);
        this.toggleSpaceportsVisibility(this.settings.showSpaceports);
        this.toggleCountryBordersVisibility(this.settings.showCountryBorders);
        this.toggleStatesVisibility(this.settings.showStates);
        this.toggleGroundStationsVisibility(this.settings.showGroundStations);
        this.toggleObservatoriesVisibility(this.settings.showObservatories);
        this.toggleMoonOrbitVisibility(this.settings.showMoonOrbit);
        this.toggleMoonTraceLinesVisibility(this.settings.showMoonTraces);
        this.toggleMoonSurfaceLinesVisibility(this.settings.showMoonSurfaceLines);
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
        this.addManeuverControls(); // Add this line to initialize maneuver controls

        // Add body selector folder
        this.bodySelectorFolder = this.gui.addFolder('Body Selector');
        this.addBodySelector();
    }

    addManeuverControls() {
        this.maneuverFolder = this.gui.addFolder('Maneuvers');
        this.biImpulseFolder = this.maneuverFolder.addFolder('Bi-Impulse Maneuver');

        this.biImpulseData = {
            semiMajorAxis: 7000, // Example value in km
            eccentricity: 0.1,
            inclination: 0,
            longitudeOfAscendingNode: 0,
            argumentOfPeriapsis: 0,
            maneuverMoment: 'Best Moment', // Options: Best Moment, Periapsis, Apoapsis
            selectedSatellite: 'None'
        };

        this.updateBiImpulseControls();

        // this.maneuverFolder.open();
    }

    addBiImpulseControls(parentFolder) {
        const biImpulseData = {
            semiMajorAxis: 7000, // Example value in km
            eccentricity: 0.1,
            inclination: 0,
            longitudeOfAscendingNode: 0,
            argumentOfPeriapsis: 0,
            maneuverMoment: 'Best Moment', // Options: Best Moment, Periapsis, Apoapsis
            selectedSatellite: 'None'
        };

        const satellitesList = this.satellites.reduce((acc, satellite) => {
            acc[`Satellite ${satellite.id}`] = satellite.id;
            return acc;
        }, { 'None': 'None' });

        const biImpulseFolder = parentFolder.addFolder('Bi-Impulse Maneuver');

        biImpulseFolder.add(biImpulseData, 'selectedSatellite', satellitesList).name('Select Satellite');
        biImpulseFolder.add(biImpulseData, 'semiMajorAxis', 6578, 42000).name('Semi-Major Axis (km)').step(1);
        biImpulseFolder.add(biImpulseData, 'eccentricity', 0, 1).name('Eccentricity').step(0.01);
        biImpulseFolder.add(biImpulseData, 'inclination', 0, 180).name('Inclination (deg)').step(0.1);
        biImpulseFolder.add(biImpulseData, 'longitudeOfAscendingNode', 0, 360).name('Longitude of Asc. Node (deg)').step(0.1);
        biImpulseFolder.add(biImpulseData, 'argumentOfPeriapsis', 0, 360).name('Arg. of Periapsis (deg)').step(0.1);
        biImpulseFolder.add(biImpulseData, 'maneuverMoment', ['Best Moment', 'Periapsis', 'Apoapsis']).name('Maneuver Moment');

        biImpulseFolder.add({
            executeManeuver: () => this.executeBiImpulseManeuver(biImpulseData)
        }, 'executeManeuver').name('Execute Maneuver');

        biImpulseFolder.open();
    }

    executeBiImpulseManeuver(biImpulseData) {
        const selectedSatellite = this.satellites.find(sat => `${sat.id}` === biImpulseData.selectedSatellite);
        if (!selectedSatellite) {
            console.error('No satellite selected for the maneuver.');
            return;
        }
    
        const targetElements = {
            semiMajorAxis: biImpulseData.semiMajorAxis * Constants.kmToMeters, // Convert km to meters
            eccentricity: biImpulseData.eccentricity,
            inclination: THREE.MathUtils.degToRad(biImpulseData.inclination),
            longitudeOfAscendingNode: THREE.MathUtils.degToRad(biImpulseData.longitudeOfAscendingNode),
            argumentOfPeriapsis: THREE.MathUtils.degToRad(biImpulseData.argumentOfPeriapsis),
            trueAnomaly: 0, // This will be updated based on the maneuver moment
        };
    
        selectedSatellite.setTargetOrbit(targetElements);
        selectedSatellite.maneuverCalculator.setCurrentOrbit(selectedSatellite.maneuverCalculator.currentOrbitalElements);
    
        // Determine the exact moment for the maneuver
        let maneuverTime = 0;
        switch (biImpulseData.maneuverMoment) {
            case 'Best Moment':
                const bestMoment = selectedSatellite.calculateBestMomentDeltaV(targetElements);
                maneuverTime = bestMoment.trueAnomaly;
                break;
            case 'Periapsis':
                maneuverTime = 0; // Placeholder for periapsis
                break;
            case 'Apoapsis':
                maneuverTime = Math.PI; // Placeholder for apoapsis
                break;
        }
    
        const deltaV = selectedSatellite.calculateDeltaV();
        if (deltaV) {
            selectedSatellite.addManeuverNode(maneuverTime, deltaV.normalize(), deltaV.length());
            selectedSatellite.renderTargetOrbit(targetElements); // Render the target orbit
            selectedSatellite.renderManeuverNode(maneuverTime); // Render the maneuver node
        }
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
            'Godspeed (3000)': 3000,
            'Plaid (10000)': 10000,
            'Harambe (30000)': 30000,
            'Multiverse (100000)': 100000,
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

    addDisplayOptions() {
        const displayFolder = this.gui.addFolder('Display Options');
    
        const options = [
            { key: 'showGrid', name: 'Grid', method: this.toggleGridVisibility.bind(this) },
            { key: 'showVectors', name: 'Vectors', method: this.toggleVectorVisibility.bind(this) },
            { key: 'showSatVectors', name: 'Sat Vectors', method: this.toggleSatelliteVectorsVisibility.bind(this) },
            { key: 'showSurfaceLines', name: 'Surface Lines', method: this.toggleSurfaceLinesVisibility.bind(this) },
            { key: 'showOrbits', name: 'Sat Orbits', method: this.toggleOrbitVisibility.bind(this) },
            { key: 'showTraces', name: 'Sat Traces', method: this.toggleSatTracesVisibility.bind(this) },
            { key: 'showCities', name: 'Cities', method: this.toggleCitiesVisibility.bind(this) },
            { key: 'showAirports', name: 'Airports', method: this.toggleAirportsVisibility.bind(this) },
            { key: 'showSpaceports', name: 'Spaceports', method: this.toggleSpaceportsVisibility.bind(this) },
            { key: 'showObservatories', name: 'Observatories', method: this.toggleObservatoriesVisibility.bind(this) },
            { key: 'showGroundStations', name: 'Ground Stations', method: this.toggleGroundStationsVisibility.bind(this) },
            { key: 'showCountryBorders', name: 'Country Borders', method: this.toggleCountryBordersVisibility.bind(this) },
            { key: 'showStates', name: 'States', method: this.toggleStatesVisibility.bind(this) },
            { key: 'showMoonOrbit', name: 'Moon Orbit', method: this.toggleMoonOrbitVisibility.bind(this)},
            { key: 'showMoonTraces', name: 'Moon Trace Lines', method: this.toggleMoonTraceLinesVisibility.bind(this) },
            { key: 'showMoonSurfaceLines', name: 'Moon Surface Lines', method: this.toggleMoonSurfaceLinesVisibility.bind(this) }
        ];
    
        options.forEach(option => {
            displayFolder.add(this.settings, option.key).name(option.name).onChange(option.method);
        });
    
        // displayFolder.open();
    }

    toggleGridVisibility(value) {
        this.gridHelper.visible = value;
    }

    toggleVectorVisibility(value) {
        this.vectors.setVisible(value);
    }

    toggleSatelliteVectorsVisibility(value) {
        this.vectors.setSatVisible(value);
    }

    toggleSurfaceLinesVisibility(value) {
        this.earth.setSurfaceLinesVisible(value);
    }

    toggleOrbitVisibility(value) {
        this.satellites.forEach(satellite => {
            satellite.setOrbitVisible(value);
        });
    }

    toggleSatTracesVisibility(value) {
        this.satellites.forEach(satellite => {
            satellite.setTraceVisible(value);
        });
    }

    toggleMoonOrbitVisibility(value) {
        this.moon.setOrbitVisible(value);
    }

    toggleMoonSurfaceLinesVisibility(value) {
        this.moon.setSurfaceDetailsVisible(value);
    }

    toggleMoonTraceLinesVisibility(value) {
        this.moon.setTraceVisible(value);
    }

    toggleCitiesVisibility(value) {
        this.earth.setCitiesVisible(value);
    }

    toggleAirportsVisibility(value) {
        this.earth.setAirportsVisible(value);
    }

    toggleObservatoriesVisibility(value) {
        this.earth.setObservatoriesVisible(value);
    }

    toggleSpaceportsVisibility(value) {
        this.earth.setSpaceportsVisible(value);
    }

    toggleGroundStationsVisibility(value) {
        this.earth.setGroundStationVisible(value);
    }

    toggleCountryBordersVisibility(value) {
        this.earth.setCountryBordersVisible(value);
    }

    toggleStatesVisibility(value) {
        this.earth.setStatesVisible(value);
    }

    addDebugOptions() {
        const debugFolder = this.gui.addFolder('Debugging');
        debugFolder.add(this.settings, 'showDebugger').name('Show Physics Debug').onChange(this.toggleDebuggerVisibility.bind(this));
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

        // Create a new body selector with the updated bodies list
        this.bodySelector = this.bodySelectorFolder.add({
            selectedBody: 'None'
        }, 'selectedBody', Object.keys(bodies)).name('Select Body');

        this.bodySelector.onChange((value) => {
            this.selectedBody = bodies[value];
            if (this.selectedBody) {
                this.updateCameraTarget();
            } else {
                this.clearCameraTarget();
            }
        });

        this.bodySelectorFolder.open(); // Ensure the folder is open
    }

    updateBodySelector() {
        // Remove old selector if it exists
        if (this.bodySelector) {
            this.bodySelectorFolder.remove(this.bodySelector);
        }

        // Add a new body selector with the updated bodies list
        this.addBodySelector();
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
        const offset = new THREE.Vector3();
        offset.copy(this.camera.position).sub(this.controls.target);
        this.spherical.setFromVector3(offset);
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

        const id = this.satellites.length;
        const color = Math.random() * 0xffffff;

        const newSatellite = new Satellite(this.scene, this.world, this.earth, this.moon, positionECEF, velocityECEF, id, color);
        this.satellites.push(newSatellite);
        this.vectors.addSatellite(newSatellite); // Add the satellite to the vectors
        this.vectors.setSatVisible(this.settings.showSatVectors); // Ensure satellite vectors are visible

        this.updateSatelliteGUI(newSatellite);
        this.updateBodySelector(); // Update the body selector with new satellite

        this.enableManeuverFolder(); // Enable the maneuver folder
        this.updateBiImpulseControls(); // Update the list of spacecraft
    }

    enableManeuverFolder() {
        if (!this.maneuverFolder) {
            this.addManeuverControls();
        }
        this.maneuverFolder.domElement.style.display = 'block';
    }

    updateBiImpulseControls() {
        if (this.selectedSatelliteController) {
            this.biImpulseFolder.remove(this.selectedSatelliteController);
        }

        const satellitesList = this.satellites.reduce((acc, satellite) => {
            acc[`Satellite ${satellite.id}`] = `${satellite.id}`; // Ensure ID is a string
            return acc;
        }, { 'None': 'None' });

        this.selectedSatelliteController = this.biImpulseFolder.add(this.biImpulseData, 'selectedSatellite', satellitesList).name('Select Satellite');
        
        if (this.semiMajorAxisController) {
            this.biImpulseFolder.remove(this.semiMajorAxisController);
            this.biImpulseFolder.remove(this.eccentricityController);
            this.biImpulseFolder.remove(this.inclinationController);
            this.biImpulseFolder.remove(this.longitudeOfAscendingNodeController);
            this.biImpulseFolder.remove(this.argumentOfPeriapsisController);
            this.biImpulseFolder.remove(this.maneuverMomentController);
            this.biImpulseFolder.remove(this.executeManeuverController);
        }

        this.semiMajorAxisController = this.biImpulseFolder.add(this.biImpulseData, 'semiMajorAxis', 6578, 42000).name('Semi-Major Axis (km)').step(1);
        this.eccentricityController = this.biImpulseFolder.add(this.biImpulseData, 'eccentricity', 0, 1).name('Eccentricity').step(0.01);
        this.inclinationController = this.biImpulseFolder.add(this.biImpulseData, 'inclination', 0, 180).name('Inclination (deg)').step(0.1);
        this.longitudeOfAscendingNodeController = this.biImpulseFolder.add(this.biImpulseData, 'longitudeOfAscendingNode', 0, 360).name('Longitude of Asc. Node (deg)').step(0.1);
        this.argumentOfPeriapsisController = this.biImpulseFolder.add(this.biImpulseData, 'argumentOfPeriapsis', 0, 360).name('Arg. of Periapsis (deg)').step(0.1);
        this.maneuverMomentController = this.biImpulseFolder.add(this.biImpulseData, 'maneuverMoment', ['Best Moment', 'Periapsis', 'Apoapsis']).name('Maneuver Moment');
        this.executeManeuverController = this.biImpulseFolder.add({
            executeManeuver: () => this.executeBiImpulseManeuver(this.biImpulseData)
        }, 'executeManeuver').name('Execute Maneuver');

        this.biImpulseFolder.open();
    }

    updateSatelliteGUI(newSatellite) {
        const satelliteFolder = this.gui.addFolder(`Satellite ${newSatellite.id}`);

        const altitudeObj = { altitude: parseFloat(newSatellite.getCurrentAltitude()).toFixed(4) };
        const velocityObj = { velocity: parseFloat(newSatellite.getCurrentVelocity()).toFixed(4) };
        const earthGravityForceObj = { earthGravityForce: parseFloat(newSatellite.getCurrentEarthGravityForce()).toFixed(4) };
        const dragObj = { drag: parseFloat(newSatellite.getCurrentDragForce()).toFixed(8) };

        const altitudeController = satelliteFolder.add(altitudeObj, 'altitude').name('Altitude (m)').listen();
        const velocityController = satelliteFolder.add(velocityObj, 'velocity').name('Velocity (m/s)').listen();
        const earthGravityForceController = satelliteFolder.add(earthGravityForceObj, 'earthGravityForce').name('Grav. Force (N)').listen();
        const dragController = satelliteFolder.add(dragObj, 'drag').name('Drag Force (N)').listen();

        newSatellite.altitudeController = altitudeController;
        newSatellite.velocityController = velocityController;
        newSatellite.earthGravityForceController = earthGravityForceController;
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

        newSatellite.updateearthGravityForce = function(value) {
            earthGravityForceObj.earthGravityForce = parseFloat(value).toFixed(4);
            earthGravityForceController.updateDisplay();
        };

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

    update() {
        this.smoothTransition();
        this.updateCameraPosition(); // Call updateCameraPosition within the update loop
    }

    smoothTransition() {
        if (this.needsSmoothTransition && this.followingBody) {
            const currentPosition = new THREE.Vector3();
            currentPosition.copy(this.controls.target);
            const targetPosition = this.getBodyPosition(this.followingBody);

            if (!currentPosition.equals(targetPosition)) {
                const smoothFactor = 0.1;
                currentPosition.lerp(targetPosition, smoothFactor);
                this.controls.target.copy(currentPosition);

                const cameraTargetPosition = new THREE.Vector3();
                cameraTargetPosition.copy(currentPosition).add(this.initialOffset);
                this.camera.position.copy(cameraTargetPosition);

                this.controls.update();
            } else {
                this.needsSmoothTransition = false; // Transition complete
            }
        }
    }
}

export { GUIManager };
