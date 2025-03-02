import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { GroundTrack } from './GroundTrack.js';

export class SatelliteOrbit {
    constructor(satellite) {
        this.satellite = satellite;
        this.scene = satellite.scene;
        this.color = satellite.color;
        this.app3d = satellite.app3d;

        this.orbitLine = null;
        this.groundTrack = null;
        this.apsisVisualizer = null;

        // Performance optimization counters
        this.orbitUpdateCounter = 0;
        this.orbitUpdateInterval = 30; // Update orbit every 30 frames
        this.groundTrackUpdateCounter = 0;
        this.groundTrackUpdateInterval = 10; // Update ground track every 10 frames

        this.initialize();
    }

    initialize() {
        this.initializeOrbitLine();
        this.initializeGroundTrack();
        this.initializeApsisVisualizer();
    }

    initializeOrbitLine() {
        // Initialize orbit line
        const orbitGeometry = new THREE.BufferGeometry();
        const orbitMaterial = new THREE.LineBasicMaterial({
            color: this.color,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });
        this.orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        this.orbitLine.frustumCulled = false;
        this.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');
        this.scene.add(this.orbitLine);
    }

    initializeGroundTrack() {
        // Initialize ground track
        this.groundTrack = new GroundTrack(this.app3d.earth, this.color);
        this.groundTrack.setVisible(this.app3d.getDisplaySetting('showGroundTraces'));
    }

    initializeApsisVisualizer() {
        // Initialize apsis visualizer
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);
        this.apsisVisualizer.visible = this.app3d.getDisplaySetting('showOrbits');
    }

    update(position, velocity, scaledPosition) {
        // Update orbit line if needed
        this.orbitUpdateCounter++;
        if (this.orbitUpdateCounter >= this.orbitUpdateInterval) {
            this.orbitUpdateCounter = 0;
            if (this.orbitLine && this.orbitLine.visible) {
                this.updateOrbitLine(position, velocity);
            }
        }

        // Update ground track if needed
        this.groundTrackUpdateCounter++;
        if (this.groundTrackUpdateCounter >= this.groundTrackUpdateInterval) {
            this.groundTrackUpdateCounter = 0;
            if (this.groundTrack && this.groundTrack.visible) {
                this.groundTrack.update(scaledPosition);
            }
        }

        // Update apsis visualizer if needed
        if (this.apsisVisualizer && this.apsisVisualizer.visible) {
            this.apsisVisualizer.update(position, velocity);
        }
    }

    updateOrbitLine(position, velocity) {
        const mu = Constants.G * Constants.earthMass;
        const orbitalElements = PhysicsUtils.calculateOrbitalElements(position, velocity, mu);

        if (!orbitalElements) {
            console.warn('No orbital elements calculated');
            return;
        }

        // Compute orbit points
        const orbitPoints = PhysicsUtils.computeOrbit(orbitalElements, mu, 180);

        // Update orbit line geometry
        if (orbitPoints && orbitPoints.length > 0) {
            this.orbitLine.geometry.setFromPoints(orbitPoints);
            this.orbitLine.geometry.computeBoundingSphere();
        }
    }

    setVisible(visible) {
        this.orbitLine.visible = visible && this.app3d.getDisplaySetting('showOrbits');
        this.groundTrack.setVisible(visible && this.app3d.getDisplaySetting('showGroundTraces'));
        this.apsisVisualizer.setVisible(visible && this.app3d.getDisplaySetting('showOrbits'));
    }

    setColor(color) {
        this.color = color;

        // Update orbit line color
        if (this.orbitLine?.material) {
            this.orbitLine.material.color.set(color);
        }

        if (this.groundTrack) {
            this.groundTrack.setColor(color);
        }

        if (this.apsisVisualizer) {
            this.apsisVisualizer.setColor(color);
        }
    }

    setGroundTraceVisible(visible) {
        if (this.groundTrack) {
            this.groundTrack.setVisible(visible);
        }
    }

    dispose() {
        if (this.orbitLine) {
            this.scene.remove(this.orbitLine);
            this.orbitLine.geometry.dispose();
            this.orbitLine.material.dispose();
        }

        if (this.groundTrack) {
            this.groundTrack.dispose();
        }

        if (this.apsisVisualizer) {
            this.apsisVisualizer.dispose();
        }
    }
}
