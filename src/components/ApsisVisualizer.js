import * as THREE from 'three';
import { Constants } from '../utils/Constants';
import { PhysicsUtils } from '../utils/PhysicsUtils';

export class ApsisVisualizer {
    constructor(scene, color) {
        this.scene = scene;
        this.color = color;
        this.initializeApsides();
    }

    initializeApsides() {
        // Create geometry for point markers
        const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
        
        // Create materials with different colors for periapsis (red) and apoapsis (blue)
        this.periapsisMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });
        this.apoapsisMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x0000ff,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });

        // Create meshes
        this.periapsisMesh = new THREE.Mesh(sphereGeometry, this.periapsisMaterial);
        this.apoapsisMesh = new THREE.Mesh(sphereGeometry, this.apoapsisMaterial);

        // Add onBeforeRender callback to maintain relative size
        const targetSize = 0.003; // Adjust this value to change the relative size
        this.periapsisMesh.onBeforeRender = (renderer, scene, camera) => {
            const distance = camera.position.distanceTo(this.periapsisMesh.position);
            const scale = distance * targetSize;
            this.periapsisMesh.scale.set(scale, scale, scale);
        };

        this.apoapsisMesh.onBeforeRender = (renderer, scene, camera) => {
            const distance = camera.position.distanceTo(this.apoapsisMesh.position);
            const scale = distance * targetSize;
            this.apoapsisMesh.scale.set(scale, scale, scale);
        };

        // Add periapsis to scene
        this.scene.add(this.periapsisMesh);
        
        // Don't set initial visibility - let it be controlled by display options
    }

    update(position, velocity) {
        const mu = Constants.earthGravitationalParameter;
        const orbitalElements = PhysicsUtils.calculateOrbitalElements(position, velocity, mu);
        
        if (!orbitalElements) {
            console.warn('No orbital elements calculated');
            return null;
        }

        const { h, e, i, omega, w } = orbitalElements;

        // Calculate distances in meters
        const rPeriapsis = (h * h / (mu * (1 + e)));
        const rApoapsis = e < 1 ? (h * h / (mu * (1 - e))) : null;

        // Convert to visualization scale
        const scaleFactor = Constants.metersToKm * Constants.scale;
        
        // Update periapsis position
        const periapsisVector = new THREE.Vector3(rPeriapsis * scaleFactor, 0, 0);
        this.rotateVector(periapsisVector, i, omega, w);
        this.periapsisMesh.position.copy(periapsisVector);

        // Update apoapsis position if orbit is elliptical
        if (rApoapsis !== null && e < 1) {
            const apoapsisVector = new THREE.Vector3(-rApoapsis * scaleFactor, 0, 0);
            this.rotateVector(apoapsisVector, i, omega, w);
            this.apoapsisMesh.position.copy(apoapsisVector);
            
            // Add apoapsis to scene only for elliptical orbits
            if (!this.apoapsisMesh.parent) {
                this.scene.add(this.apoapsisMesh);
            }
        } else {
            // Remove apoapsis from scene for non-elliptical orbits
            if (this.apoapsisMesh.parent) {
                this.scene.remove(this.apoapsisMesh);
            }
        }

        // Return altitudes in kilometers
        return {
            periapsisAltitude: (rPeriapsis - Constants.earthRadius) * Constants.metersToKm,
            apoapsisAltitude: rApoapsis ? (rApoapsis - Constants.earthRadius) * Constants.metersToKm : null
        };
    }

    rotateVector(vector, inclination, longAscNode, argPeriapsis) {
        // Apply argument of periapsis rotation
        vector.applyAxisAngle(new THREE.Vector3(0, 0, 1), argPeriapsis);
        
        // Apply inclination rotation
        vector.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclination);
        
        // Apply longitude of ascending node rotation
        vector.applyAxisAngle(new THREE.Vector3(0, 0, 1), longAscNode);
    }

    setVisible(visible) {
        this.periapsisMesh.visible = visible;
        if (this.apoapsisMesh.parent) {
            this.apoapsisMesh.visible = visible;
        }
    }

    dispose() {
        this.scene.remove(this.periapsisMesh);
        if (this.apoapsisMesh.parent) {
            this.scene.remove(this.apoapsisMesh);
        }
        this.periapsisMaterial.dispose();
        this.apoapsisMaterial.dispose();
        this.periapsisMesh.geometry.dispose();
        this.apoapsisMesh.geometry.dispose();
    }
}
