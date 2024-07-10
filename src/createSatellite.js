import { Satellite } from './components/Satellite.js';
import { PhysicsUtils } from './utils/PhysicsUtils.js';
import { Constants } from './utils/Constants.js';
import { numberToHexColor } from './utils/colorUtils.js';
import { numberToHexColor } from './utils/colorUtils.js';

export function createSatellite(scene, world, earth, moon, satellites, vectors, gui, guiManager, initialPosition, initialVelocity) {
    let id = satellites.length;
    const existingSatellite = satellites.find(satellite => satellite.id === id);
    if (existingSatellite) {
        id = id + 1;
    }

    const color = Math.random() * 0xffffff;
    const newSatellite = new Satellite(scene, world, earth, moon, initialPosition, initialVelocity, id, color);

    // Ensure dummy controllers are set
    setupDummyControllers(newSatellite);

    satellites.push(newSatellite);
    vectors.addSatellite(newSatellite);
    vectors.setSatVisible(true);

    if (gui && guiManager) {
        updateSatelliteGUI(newSatellite, satellites, gui, guiManager, vectors);
    }

    // Dispatch satellite added event
    document.dispatchEvent(new CustomEvent('satelliteAdded'));

    return newSatellite;
}


export function createSatelliteFromLatLon(scene, world, earth, moon, satellites, vectors, gui, guiManager, latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
    const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
    const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

    const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
        latitude,
        longitude,
        altitude * Constants.kmToMeters,
        velocity,
        azimuth,
        angleOfAttack,
        earthQuaternion,
        tiltQuaternion
    );

    return createSatellite(scene, world, earth, moon, satellites, vectors, gui, guiManager, positionECEF, velocityECEF);
}

export function createSatelliteFromLatLonCircular(scene, world, earth, moon, satellites, vectors, gui, guiManager, latitude, longitude, altitude, azimuth) {
    const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
    const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

    // Calculate the radius from the center of the Earth to the satellite
    const radius = Constants.earthRadius + (altitude * Constants.kmToMeters);

    // Calculate the orbital velocity for a circular orbit
    const orbitalVelocity = PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, radius);

    // Assuming angle of attack for a circular orbit is zero
    const angleOfAttack = 0;

    const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
        latitude,
        longitude,
        altitude * Constants.kmToMeters,
        orbitalVelocity,
        azimuth,
        angleOfAttack,
        earthQuaternion,
        tiltQuaternion
    );

    return createSatellite(scene, world, earth, moon, satellites, vectors, gui, guiManager, positionECEF, velocityECEF);
}

export function createSatelliteFromOrbitalElements(scene, world, earth, moon, satellites, vectors, gui, guiManager, semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly) {
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        inclination,
        raan,
        argumentOfPeriapsis,
        trueAnomaly
    );

    return createSatellite(scene, world, earth, moon, satellites, vectors, gui, guiManager, positionECI, velocityECI);
}

function setupDummyControllers(newSatellite) {
    newSatellite.altitudeController = { setValue: () => newSatellite, updateDisplay: () => { } };
    newSatellite.velocityController = { setValue: () => newSatellite, updateDisplay: () => { } };
    newSatellite.earthGravityForceController = { setValue: () => newSatellite, updateDisplay: () => { } };
    newSatellite.moonGravityForceController = { setValue: () => newSatellite, updateDisplay: () => { } };
    newSatellite.dragController = { setValue: () => newSatellite, updateDisplay: () => { } };
    newSatellite.periapsisAltitudeController = { setValue: () => newSatellite, updateDisplay: () => { } };
    newSatellite.apoapsisAltitudeController = { setValue: () => newSatellite, updateDisplay: () => { } };
}

function updateSatelliteGUI(newSatellite, satellites, gui, guiManager, vectors) {
    const satelliteFolder = gui.addFolder(`Satellite ${newSatellite.id}`);

    const altitudeObj = { altitude: parseFloat(newSatellite.getCurrentAltitude()).toFixed(4) };
    const velocityObj = { velocity: parseFloat(newSatellite.getCurrentVelocity()).toFixed(4) };
    const earthGravityForceObj = { earthGravityForce: parseFloat(newSatellite.getCurrentEarthGravityForce()).toFixed(4) };
    const moonGravityForceObj = { moonGravityForce: parseFloat(newSatellite.getCurrentMoonGravityForce()).toFixed(4) };
    const dragObj = { drag: parseFloat(newSatellite.getCurrentDragForce()).toFixed(8) };
    const periapsisAltitudeObj = { periapsisAltitude: parseFloat(newSatellite.getPeriapsisAltitude()).toFixed(4) };
    const apoapsisAltitudeObj = { apoapsisAltitude: parseFloat(newSatellite.getApoapsisAltitude()).toFixed(4) };

    const altitudeController = satelliteFolder.add(altitudeObj, 'altitude').name('Altitude (m)').listen();
    const velocityController = satelliteFolder.add(velocityObj, 'velocity').name('Velocity (m/s)').listen();
    const earthGravityForceController = satelliteFolder.add(earthGravityForceObj, 'earthGravityForce').name('Grav. Force (N)').listen();
    const moonGravityForceController = satelliteFolder.add(moonGravityForceObj, 'moonGravityForce').name('Moon Force (N)').listen();
    const dragController = satelliteFolder.add(dragObj, 'drag').name('Drag Force (N)').listen();
    const periapsisAltitudeController = satelliteFolder.add(periapsisAltitudeObj, 'periapsisAltitude').name('Periapsis alt. (m)').listen();
    const apoapsisAltitudeController = satelliteFolder.add(apoapsisAltitudeObj, 'apoapsisAltitude').name('Apoapsis alt. (m)').listen();

    newSatellite.altitudeController = altitudeController;
    newSatellite.velocityController = velocityController;
    newSatellite.earthGravityForceController = earthGravityForceController;
    newSatellite.moonGravityForceController = moonGravityForceController;
    newSatellite.dragController = dragController;
    newSatellite.periapsisAltitudeController = periapsisAltitudeController;
    newSatellite.apoapsisAltitudeController = apoapsisAltitudeController;

    const colorData = {
        color: numberToHexColor(newSatellite.color)
    };

    satelliteFolder.addColor(colorData, 'color').name('Color').onChange(value => {
        newSatellite.setColor(parseInt(value.replace(/^#/, ''), 16));
    });

    satelliteFolder.add(newSatellite.mesh.scale, 'x', 0.1, 10, 0.1).name('Size').onChange(value => {
        newSatellite.mesh.scale.set(value, value, value);
    });

    satelliteFolder.add({ remove: () => removeSatellite(newSatellite, satellites, vectors, gui, guiManager) }, 'remove').name('Remove Satellite');
    guiManager.satelliteFolders[newSatellite.id] = satelliteFolder;
    satelliteFolder.open();

    newSatellite.updateAltitude = function (value) {
        altitudeObj.altitude = parseFloat(value).toFixed(4);
        altitudeController.updateDisplay();
    };

    newSatellite.updateVelocity = function (value) {
        velocityObj.velocity = parseFloat(value).toFixed(4);
        velocityController.updateDisplay();
    };

    newSatellite.updateEarthGravityForce = function (value) {
        earthGravityForceObj.earthGravityForce = parseFloat(value).toFixed(4);
        earthGravityForceController.updateDisplay();
    };

    newSatellite.updateMoonGravityForce = function (value) {
        moonGravityForceObj.moonGravityForce = parseFloat(value).toFixed(4);
        moonGravityForceController.updateDisplay();
    };

    newSatellite.updateDrag = function (value) {
        dragObj.drag = parseFloat(value).toFixed(4);
        dragController.updateDisplay();
    };

    newSatellite.updatePeriapsisAltitude = function (value) {
        periapsisAltitudeObj.periapsisAltitude = parseFloat(value).toFixed(4);
        periapsisAltitudeController.updateDisplay();
    };

    newSatellite.updateApoapsisAltitude = function (value) {
        apoapsisAltitudeObj.apoapsisAltitude = parseFloat(value).toFixed(4);
        apoapsisAltitudeController.updateDisplay();
    };
}

function removeSatellite(satellite, satellites, vectors, gui, guiManager) {
    const index = satellites.indexOf(satellite);
    if (index !== -1) {
        satellites.splice(index, 1);
        satellite.deleteSatellite();
        vectors.removeSatellite(satellite);
        const folder = guiManager.satelliteFolders[satellite.id];
        if (folder) {
            gui.removeFolder(folder);
            delete guiManager.satelliteFolders[satellite.id];
        }

        guiManager.physicsWorker.postMessage({
            type: 'removeSatellite',
            data: { id: satellite.id }
        });

        // Dispatch satellite removed event
        document.dispatchEvent(new CustomEvent('satelliteRemoved'));

        guiManager.updateBodySelector();
    }
}

