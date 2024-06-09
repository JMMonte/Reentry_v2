// createSatellite.js
import { Satellite } from './components/Satellite.js';
import { PhysicsUtils } from './utils/PhysicsUtils.js';
import { Constants } from './utils/Constants.js';
import { numberToHexColor } from './utils/colorUtils.js';

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

    let id = satellites.length;
    const existingSatellite = satellites.find(satellite => satellite.id === id);
    if (existingSatellite) {
        id = id + 1;
    }

    const color = Math.random() * 0xffffff;

    const newSatellite = new Satellite(scene, world, earth, moon, positionECEF, velocityECEF, id, color);

    // Ensure dummy controllers are set
    newSatellite.altitudeController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.velocityController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.earthGravityForceController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.moonGravityForceController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.dragController = { setValue: () => newSatellite, updateDisplay: () => {} };

    satellites.push(newSatellite);
    vectors.addSatellite(newSatellite);
    vectors.setSatVisible(true);

    if (gui && guiManager) {
        updateSatelliteGUI(newSatellite, satellites, gui, guiManager, vectors);
    }

    return newSatellite;
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

    console.log(positionECI, velocityECI);

    let id = satellites.length;
    const existingSatellite = satellites.find(satellite => satellite.id === id);
    if (existingSatellite) {
        id = id + 1;
    }

    const color = Math.random() * 0xffffff;

    const newSatellite = new Satellite(scene, world, earth, moon, positionECI, velocityECI, id, color);

    // Ensure dummy controllers are set
    newSatellite.altitudeController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.velocityController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.earthGravityForceController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.moonGravityForceController = { setValue: () => newSatellite, updateDisplay: () => {} };
    newSatellite.dragController = { setValue: () => newSatellite, updateDisplay: () => {} };

    satellites.push(newSatellite);
    vectors.addSatellite(newSatellite);
    vectors.setSatVisible(true);

    if (gui && guiManager) {
        updateSatelliteGUI(newSatellite, satellites, gui, guiManager, vectors);
    }

    return newSatellite;
}

function updateSatelliteGUI(newSatellite, satellites, gui, guiManager, vectors) {
    const satelliteFolder = gui.addFolder(`Satellite ${newSatellite.id}`);

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

    satelliteFolder.add({ remove: () => removeSatellite(newSatellite, satellites, vectors, gui, guiManager) }, 'remove').name('Remove Satellite');
    guiManager.satelliteFolders[newSatellite.id] = satelliteFolder;
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

        guiManager.updateBodySelector(); 
    }
}
