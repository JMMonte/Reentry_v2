import * as THREE from 'three';
import { SatelliteControls } from './gui/SatelliteControls.js';
import { ManeuverControls } from './gui/ManeuverControls.js';
import { DebugOptions } from './gui/DebugOptions.js';
import { BodySelector } from './gui/BodySelector.js';
import { CameraControls } from './CameraControls.js';

let GUI;
if (typeof window !== 'undefined') {
    GUI = require('dat.gui').GUI; // Import `dat.gui` only in client-side environment
}

class GUIManager {
    constructor(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker, camera, controls) {
        this.initProperties(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker, camera, controls);
        this.setupEventListeners();
        this.initGUI();
    }

    initProperties(scene, world, earth, moon, sun, satellites, vectors, settings, timeUtils, worldDebugger, physicsWorker, camera, controls) {
        if (typeof window !== 'undefined') {
            this.gui = new GUI();
        }
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
        this.cameraControls = new CameraControls(camera, controls);
        this.satelliteFolders = {};
        this.maneuverNodes = [];
        this.addGridHelper();
        // this.satelliteControls = new SatelliteControls(this.gui, this.settings, this, this.satellites, this.scene, this.world, this.earth, this.moon, this.vectors);
    }

    initGUI() {
        if (this.gui) {
            this.maneuverControls = new ManeuverControls(this.gui, this.settings, this, this.satellites, this);
        }
    }

    updateBodySelector() {
        // Remove old selector if it exists
        if (this.bodySelector) {
            this.bodySelector.updateBodySelector();
        }
    }

    enableManeuverFolder() {
        if (this.maneuverControls && !this.maneuverControls.maneuverFolder) {
            this.maneuverControls.addManeuverControls();
        }
    }

    updateBiImpulseControls() {
        if (this.maneuverControls) {
            this.maneuverControls.updateBiImpulseControls();
        }
    }

    addGridHelper() {
        this.gridHelper = new THREE.PolarGridHelper(40000, 100, 100, 64, 0x888888, 0x444444);
        this.gridHelper.visible = this.settings.showGrid;
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.opacity = 0.5;
        this.scene.add(this.gridHelper);
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

    setupEventListeners() {
        this.cameraControls.controls.addEventListener('change', this.cameraControls.updateInitialOffset.bind(this.cameraControls));
    }

    updateCameraTarget(selectedBody) {
        if (selectedBody) {
            this.cameraControls.updateCameraTarget(selectedBody);
        } else {
            this.cameraControls.clearCameraTarget();
        }
    }

    clearCameraTarget() {
        this.cameraControls.clearCameraTarget();
    }

    updateCamera() {
        this.cameraControls.updateCameraPosition();
    }

    createSatelliteFromGUI(latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
        this.satelliteControls.createSatellite(latitude, longitude, altitude, velocity, azimuth, angleOfAttack);
    }
}

export { GUIManager };
