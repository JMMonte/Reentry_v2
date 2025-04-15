import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { GroundTrack } from './GroundTrack.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';

export class Satellite {
    constructor({ scene, position, velocity, id, color, mass = 100, size = 1, app3d, name }) {
        this.scene = scene;
        this.id = id;
        this.name = name;
        this.color = color;
        this.mass = mass;
        this.size = size;
        this.position = position.clone();
        this.velocity = velocity.clone();
        this.initialized = false;
        this.updateBuffer = [];
        this.landed = false;

        // Performance optimization: Update counters
        this.orbitUpdateCounter = 0;
        this.orbitUpdateInterval = 30; // Update orbit every 30 frames
        this.groundTrackUpdateCounter = 0;
        this.groundTrackUpdateInterval = 10; // Update ground track every 10 frames
        this.traceUpdateCounter = 0;
        this.traceUpdateInterval = 5; // Update trace every 5 frames

        // Initialize orientation quaternion
        this.orientation = new THREE.Quaternion();
        if (velocity) {
            const upVector = new THREE.Vector3(0, 1, 0);
            const velocityDir = velocity.clone().normalize();
            this.orientation.setFromUnitVectors(upVector, velocityDir);
        }

        // Create debug window
        if (this.app3d.createDebugWindow) {
            this.app3d.createDebugWindow(this);
        }

        this.initializeVisuals();

        // Subscribe to display options changes
        this.app3d.addEventListener('displaySettingChanged', (event) => {
            const { key, value } = event.detail;
            switch (key) {
                case 'showOrbits':
                    if (this.orbitLine) this.orbitLine.visible = value;
                    if (this.apsisVisualizer) this.apsisVisualizer.visible = value;
                    break;
                case 'showTraces':
                    if (this.traceLine) this.traceLine.visible = value;
                    break;
                case 'showGroundTraces':
                    if (this.groundTrack) this.groundTrack.setVisible(value);
                    break;
                case 'showSatVectors':
                    if (this.velocityVector) this.velocityVector.visible = value;
                    if (this.orientationVector) this.orientationVector.visible = value;
                    break;
            }
        });
    }

    initializeVisuals() {
        // Satellite mesh - pyramid shape (cone with 3 segments)
        const geometry = new THREE.ConeGeometry(0.5, 2, 3); // radius: 0.5, height: 2, segments: 3 (minimum)
        // Point along +Z axis (no rotation needed - ConeGeometry already points up)
        const material = new THREE.MeshBasicMaterial({ 
            color: this.color,
            side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(Constants.satelliteRadius);

        // Add to scene
        this.scene.add(this.mesh);
        
        // Add onBeforeRender callback to maintain relative size and orientation
        const targetSize = 0.005;
        this.mesh.onBeforeRender = (renderer, scene, camera) => {
            // Only update scale and orientation if visible
            if (this.mesh.visible) {
                const distance = camera.position.distanceTo(this.mesh.position);
                const scale = distance * targetSize;
                this.mesh.scale.set(scale, scale, scale);
                
                // Update mesh orientation
                this.mesh.quaternion.copy(this.orientation);
                
                // Scale vectors with camera distance - only if they exist and are visible
                if (this.velocityVector && this.velocityVector.visible) {
                    this.velocityVector.setLength(scale * 20);
                }
                if (this.orientationVector && this.orientationVector.visible) {
                    this.orientationVector.setLength(scale * 20);
                }
            }
        };

        // Initialize vectors
        // Velocity vector (red)
        this.velocityVector = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            this.mesh.position,
            this.baseScale * 3,
            0xff0000
        );
        this.velocityVector.visible = false;
        this.scene.add(this.velocityVector);

        // Orientation vector (blue) - represents body frame z-axis
        const bodyZAxis = new THREE.Vector3(0, 1, 0);
        bodyZAxis.applyQuaternion(this.orientation);
        this.orientationVector = new THREE.ArrowHelper(
            bodyZAxis,
            this.mesh.position,
            this.baseScale * 3,
            0x0000ff
        );
        this.orientationVector.visible = false;
        this.scene.add(this.orientationVector);

        // Initialize trace line
        const traceGeometry = new THREE.BufferGeometry();
        const traceMaterial = new THREE.LineBasicMaterial({ 
            color: this.color,
            linewidth: 2,
            transparent: true,
            opacity: 0.5
        });
        this.traceLine = new THREE.Line(traceGeometry, traceMaterial);
        this.traceLine.frustumCulled = false;
        this.traceLine.visible = false;
        this.scene.add(this.traceLine);
        this.tracePoints = [];

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
        this.orbitLine.visible = false;
        this.scene.add(this.orbitLine);

        // Initialize ground track
        this.groundTrack = new GroundTrack(this.app3d.earth, this.color);
        this.groundTrack.setVisible(this.app3d.getDisplaySetting('showGroundTraces'));

        // Initialize apsis visualizer
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);
        this.apsisVisualizer.visible = false;

        // Update initial position
        if (this.position && this.velocity) {
            this.updatePosition(this.position, this.velocity);
        }
    }

    updatePosition(position, velocity) {
        // Store current state (in meters)
        this.position = position.clone();
        this.velocity = velocity.clone();

        // Convert from meters to scaled kilometers for visualization
        const scaledPosition = new THREE.Vector3(
            position.x * Constants.metersToKm * Constants.scale,
            position.y * Constants.metersToKm * Constants.scale,
            position.z * Constants.metersToKm * Constants.scale
        );

        // Update satellite mesh position
        this.mesh.position.copy(scaledPosition);

        // Update vectors only if they're visible
        if (this.velocityVector && this.velocityVector.visible) {
            const normalizedVelocity = this.velocity.clone().normalize();
            this.velocityVector.position.copy(scaledPosition);
            this.velocityVector.setDirection(normalizedVelocity);
        }

        if (this.orientationVector && this.orientationVector.visible) {
            const bodyZAxis = new THREE.Vector3(0, 1, 0);
            bodyZAxis.applyQuaternion(this.orientation);
            this.orientationVector.position.copy(scaledPosition);
            this.orientationVector.setDirection(bodyZAxis);
        }

        // Update trace line
        if (this.traceLine && this.traceLine.visible && this.tracePoints) {
            this.traceUpdateCounter++;
            if (this.traceUpdateCounter >= this.traceUpdateInterval) {
                this.traceUpdateCounter = 0;
                this.tracePoints.push(scaledPosition.clone());
                if (this.tracePoints.length > 1000) {
                    this.tracePoints.shift();
                }
                this.traceLine.geometry.setFromPoints(this.tracePoints);
                this.traceLine.geometry.computeBoundingSphere();
            }
        }

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

        // Notify debug window about position update, but don't force it open
        if (this.debugWindow?.onPositionUpdate) {
            this.debugWindow.onPositionUpdate();
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
        
        // Update apsis visualizer
        if (this.apsisVisualizer && this.apsisVisualizer.visible) {
            this.apsisVisualizer.update(position, velocity);
        }

        // Force visibility update
        if (this.orbitLine) {
            this.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');
        }
    }

    updateSatellite(currentTime, realDeltaTime, warpedDeltaTime) {
        // Process any buffered physics updates
        while (this.updateBuffer.length > 0) {
            const update = this.updateBuffer.shift();
            if (update) {
                const position = new THREE.Vector3(
                    update.position[0],
                    update.position[1],
                    update.position[2]
                );
                const velocity = new THREE.Vector3(
                    update.velocity[0],
                    update.velocity[1],
                    update.velocity[2]
                );
                this.updatePosition(position, velocity);
            }
        }
    }

    setVisible(visible) {
        this.mesh.visible = visible;
        this.traceLine.visible = visible && window.app3d.getDisplaySetting('showTraces');
        this.orbitLine.visible = visible && window.app3d.getDisplaySetting('showOrbits');
        this.groundTrack.setVisible(visible && window.app3d.getDisplaySetting('showGroundTraces'));
        // Show apsis markers only if orbit is visible
        this.apsisVisualizer.setVisible(visible && window.app3d.getDisplaySetting('showOrbits'));
    }

    setVectorsVisible(visible) {
        if (this.velocityVector) {
            this.velocityVector.visible = visible;
        }
        if (this.orientationVector) {
            this.orientationVector.visible = visible;
        }
    }

    getSpeed() {
        return this.velocity ? this.velocity.length() : 0;
    }

    getRadialAltitude() {
        return this.position ? (this.position.length() * Constants.metersToKm) : 0;
    }

    getSurfaceAltitude() {
        if (!this.position) return 0;
        return (this.position.length() - Constants.earthRadius) * Constants.metersToKm;
    }

    getOrbitalElements() {
        if (!this.position || !this.velocity) return null;

        const mu = Constants.G * Constants.earthMass;
        const r = this.position.clone();
        const v = this.velocity.clone();
        
        // Calculate specific angular momentum
        const h = new THREE.Vector3().crossVectors(r, v);
        const h_mag = h.length();
        
        // Calculate specific orbital energy
        const v2 = v.lengthSq();
        const r_mag = r.length();
        const energy = (v2 / 2) - (mu / r_mag);
        
        // Calculate semi-major axis (in meters)
        const sma = -mu / (2 * energy);
        
        // Calculate eccentricity vector
        const ev = new THREE.Vector3()
            .crossVectors(v, h)
            .divideScalar(mu)
            .sub(r.clone().divideScalar(r_mag));
        
        const ecc = ev.length();

        // Calculate inclination
        const inc = Math.acos(h.z / h_mag) * (180 / Math.PI);

        // Calculate node vector (points to ascending node)
        const n = new THREE.Vector3(0, 0, 1).cross(h);
        const n_mag = n.length();

        // Calculate longitude of ascending node (Ω)
        let lan = Math.acos(n.x / n_mag) * (180 / Math.PI);
        if (n.y < 0) lan = 360 - lan;

        // Calculate argument of periapsis (ω)
        let aop = Math.acos(n.dot(ev) / (n_mag * ecc)) * (180 / Math.PI);
        if (ev.z < 0) aop = 360 - aop;

        // Calculate true anomaly (ν)
        let ta = Math.acos(ev.dot(r) / (ecc * r_mag)) * (180 / Math.PI);
        if (r.dot(v) < 0) ta = 360 - ta;

        // Calculate orbital period
        const period = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);

        // Calculate periapsis and apoapsis distances (in meters)
        const periapsis = sma * (1 - ecc);
        const apoapsis = sma * (1 + ecc);

        return {
            semiMajorAxis: sma * Constants.metersToKm,
            eccentricity: ecc,
            inclination: inc,
            longitudeOfAscendingNode: lan,
            argumentOfPeriapsis: aop,
            trueAnomaly: ta,
            period: period,
            specificAngularMomentum: h_mag,
            specificOrbitalEnergy: energy,
            periapsisAltitude: (periapsis - Constants.earthRadius) * Constants.metersToKm,
            apoapsisAltitude: (apoapsis - Constants.earthRadius) * Constants.metersToKm,
            periapsisRadial: periapsis * Constants.metersToKm,
            apoapsisRadial: apoapsis * Constants.metersToKm
        };
    }

    dispose() {
        // Reset cursor if this was the hovered object
        if (this.mesh && window.app3d && window.app3d.hoveredObject === this.mesh) {
            document.body.style.cursor = 'default';
            window.app3d.hoveredObject = null;
        }

        // Remove from scene
        if (this.mesh) {
            this.mesh.removeFromParent();
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.traceLine) {
            this.scene.remove(this.traceLine);
            this.traceLine.geometry.dispose();
            this.traceLine.material.dispose();
        }
        if (this.orbitLine) {
            this.scene.remove(this.orbitLine);
            this.orbitLine.geometry.dispose();
            this.orbitLine.material.dispose();
        }
        if (this.velocityVector) {
            this.velocityVector.dispose();
        }
        if (this.orientationVector) {
            this.orientationVector.dispose();
        }
        if (this.groundTrack) {
            this.groundTrack.dispose();
        }
        if (this.apsisVisualizer) {
            this.apsisVisualizer.dispose();
        }

        // Remove from app3d satellites list
        if (this.app3d && this.app3d.satellites) {
            delete this.app3d.satellites[this.id];
            // Update satellite list in UI
            if (this.app3d.updateSatelliteList) {
                this.app3d.updateSatelliteList();
            }
        }
    }

    getAltitude(earth) {
        if (!earth || !this.position) return 0;
        return (this.position.length() - earth.radius) * Constants.metersToKm;
    }

    setColor(color) {
        this.color = color;

        // Update mesh color
        if (this.mesh?.material) {
            this.mesh.material.color.set(color);
            // Only set emissive if the material supports it
            if (this.mesh.material.emissive) {
                this.mesh.material.emissive.copy(new THREE.Color(color).multiplyScalar(0.2));
            }
        }

        // Update trace line color
        if (this.traceLine?.material) {
            this.traceLine.material.color.set(color);
        }

        // Update orbit line color
        if (this.orbitLine?.material) {
            this.orbitLine.material.color.set(color);
        }
        this.groundTrack.setColor(color);
    }

    setGroundTraceVisible(visible) {
        this.groundTrack.setVisible(visible);
    }

    updateVectors() {
        const scaledPosition = this.mesh.position;
        
        if (this.velocityVector && this.velocityVector.visible) {
            this.velocityVector.position.copy(scaledPosition);
            const normalizedVelocity = this.velocity.clone().normalize();
            this.velocityVector.setDirection(normalizedVelocity);
            this.velocityVector.setLength(this.baseScale * 20);
        }

        if (this.orientationVector && this.orientationVector.visible) {
            this.orientationVector.position.copy(scaledPosition);
            const bodyZAxis = new THREE.Vector3(0, 1, 0);
            bodyZAxis.applyQuaternion(this.orientation);
            this.orientationVector.setDirection(bodyZAxis);
            this.orientationVector.setLength(this.baseScale * 20);
        }
    }
}