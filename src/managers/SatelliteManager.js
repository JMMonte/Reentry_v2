import * as THREE from 'three';
import { Satellite } from '../components/Satellite/Satellite.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';

export class SatelliteManager {
    // Define display properties for satellites
    static displayProperties = {
        showSatVectors: { value: false, name: 'Sat Vectors', icon: 'Circle' },
        showOrbits: { value: true, name: 'Sat Orbits', icon: 'Circle' },
        showTraces: { value: true, name: 'Sat Traces', icon: 'LineChart' },
        showGroundTraces: { value: false, name: 'Ground Traces', icon: 'MapPin' },
        showSatConnections: { value: false, name: 'Sat Connections', icon: 'Link' }
    };

    constructor(app) {
        this.app = app;
        this._satellites = {};
        this.brightColors = [
            0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,  // Bright primary
            0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,  // Bright secondary
            0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,  // Bright tertiary
            0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,  // Bright neon
            0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF   // Bright pastel
        ];

        // Initialize display settings from static properties
        this.displaySettings = {};
        Object.entries(SatelliteManager.displayProperties).forEach(([key, prop]) => {
            this.displaySettings[key] = prop.value;
        });
    }

    // Method to get current display settings
    getDisplaySettings() {
        return this.displaySettings;
    }

    // Method to update a display setting
    updateDisplaySetting(key, value) {
        if (key in this.displaySettings) {
            this.displaySettings[key] = value;
            Object.values(this._satellites).forEach(satellite => {
                if (satellite) {
                    this.applyDisplaySettings(satellite, this.displaySettings);
                }
            });
        }
    }

    get satellites() {
        return this._satellites;
    }

    generateUniqueId() {
        let id = 0;
        while (this._satellites[id]) {
            id++;
        }
        return id;
    }

    getRandomColor() {
        return this.brightColors[Math.floor(Math.random() * this.brightColors.length)];
    }

    async createSatellite(params) {
        const { scene } = this.app;
        const id = this.generateUniqueId();
        const color = this.getRandomColor();

        const newSatellite = new Satellite({
            scene,
            position: params.position,
            velocity: params.velocity,
            id,
            color,
            mass: params.mass || 100, // kg
            size: params.size || 1, // meters
            app3d: this.app,
            name: params.name
        });

        // Get display settings from DisplayManager
        const displaySettings = this.app.displayManager?.settings || this.displaySettings;

        // Apply display settings
        this.applyDisplaySettings(newSatellite, displaySettings);

        // Force initial updates only if orbit line is visible
        if (displaySettings.showOrbits) {
            this.updateInitialState(newSatellite, params);
        }

        // Create debug window if needed
        if (this.app.createDebugWindow) {
            this.app.createDebugWindow(newSatellite);
        }

        // Add to satellites collection
        this._satellites[newSatellite.id] = newSatellite;
        this.updateSatelliteList();

        // Initialize physics
        await this.initializePhysics(newSatellite);

        return newSatellite;
    }

    async createFromLatLon(params) {
        const { earth } = this.app;
        const {
            latitude,
            longitude,
            altitude,
            velocity,
            azimuth,
            angleOfAttack = 0,
            mass,
            size,
            name
        } = params;

        const { position, velocity: satVelocity } = this.calculatePositionVelocity(
            earth,
            latitude,
            longitude,
            altitude,
            velocity,
            azimuth,
            angleOfAttack
        );

        return this.createSatellite({
            position,
            velocity: satVelocity,
            mass,
            size,
            name
        });
    }

    async createFromLatLonCircular(params) {
        const { earth } = this.app;
        const {
            latitude,
            longitude,
            altitude,
            azimuth,
            angleOfAttack = 0,
            mass,
            size,
            name
        } = params;

        // Calculate orbital velocity for circular orbit
        const radius = Constants.earthRadius + (altitude * Constants.kmToMeters);
        const orbitalVelocity = PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, radius);

        const { position, velocity } = this.calculatePositionVelocity(
            earth,
            latitude,
            longitude,
            altitude,
            orbitalVelocity,
            azimuth,
            angleOfAttack
        );

        return this.createSatellite({
            position,
            velocity,
            mass,
            size,
            name
        });
    }

    async createFromOrbitalElements(params) {
        const {
            semiMajorAxis,
            eccentricity,
            inclination,
            raan,
            argumentOfPeriapsis,
            trueAnomaly,
            mass,
            size,
            name
        } = params;

        const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
            semiMajorAxis * Constants.kmToMeters,
            eccentricity,
            inclination * (-1), // Invert inclination
            raan,
            argumentOfPeriapsis,
            trueAnomaly
        );

        const position = new THREE.Vector3(
            positionECI.x * Constants.metersToKm * Constants.scale,
            positionECI.y * Constants.metersToKm * Constants.scale,
            positionECI.z * Constants.metersToKm * Constants.scale
        );

        const velocity = new THREE.Vector3(
            velocityECI.x * Constants.metersToKm * Constants.scale,
            velocityECI.y * Constants.metersToKm * Constants.scale,
            velocityECI.z * Constants.metersToKm * Constants.scale
        );

        return this.createSatellite({
            position,
            velocity,
            mass,
            size,
            name
        });
    }

    calculatePositionVelocity(earth, latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
        const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
        const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

        const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
            latitude,
            longitude,
            altitude * Constants.kmToMeters,
            velocity * Constants.kmToMeters,
            azimuth,
            angleOfAttack,
            earthQuaternion,
            tiltQuaternion
        );

        return {
            position: new THREE.Vector3(
                positionECEF.x * Constants.metersToKm * Constants.scale,
                positionECEF.y * Constants.metersToKm * Constants.scale,
                positionECEF.z * Constants.metersToKm * Constants.scale
            ),
            velocity: new THREE.Vector3(
                velocityECEF.x * Constants.metersToKm * Constants.scale,
                velocityECEF.y * Constants.metersToKm * Constants.scale,
                velocityECEF.z * Constants.metersToKm * Constants.scale
            )
        };
    }

    applyDisplaySettings(satellite, displaySettings) {
        const { showOrbits, showTraces, showGroundTraces, showSatVectors } = displaySettings;

        satellite.orbitLine.visible = showOrbits;
        if (satellite.apsisVisualizer) {
            satellite.apsisVisualizer.visible = showOrbits;
        }
        satellite.traceLine.visible = showTraces;
        if (satellite.groundTrack) {
            satellite.groundTrack.visible = showGroundTraces;
        }
        if (satellite.velocityVector) {
            satellite.velocityVector.visible = showSatVectors;
        }
        if (satellite.orientationVector) {
            satellite.orientationVector.visible = showSatVectors;
        }
    }

    updateInitialState(satellite, params) {
        if (satellite.orbitLine && satellite.orbitLine.visible) {
            satellite.updateOrbitLine(params.position, params.velocity);
        }
        if (satellite.traceLine && satellite.traceLine.visible) {
            const scaledPosition = new THREE.Vector3(
                params.position.x * Constants.metersToKm * Constants.scale,
                params.position.y * Constants.metersToKm * Constants.scale,
                params.position.z * Constants.metersToKm * Constants.scale
            );
            satellite.tracePoints.push(scaledPosition.clone());
            satellite.traceLine.geometry.setFromPoints(satellite.tracePoints);
            satellite.traceLine.geometry.computeBoundingSphere();
        }
    }

    async initializePhysics(satellite) {
        // Check if physics worker is needed and initialize it
        this.app.physicsManager.checkWorkerNeeded();
        await this.app.physicsManager.waitForInitialization();
        await this.app.physicsManager.addSatellite(satellite);
    }

    updateSatelliteList() {
        const satelliteData = Object.fromEntries(
            Object.entries(this._satellites)
                .filter(([_, sat]) => sat && sat.id != null && sat.name)
                .map(([id, sat]) => [id, {
                    id: sat.id,
                    name: sat.name
                }])
        );
        
        document.dispatchEvent(new CustomEvent('satelliteListUpdated', {
            detail: {
                satellites: satelliteData
            }
        }));
    }

    removeSatellite(satelliteId) {
        const satellite = this._satellites[satelliteId];
        if (satellite) {
            const satelliteInfo = {
                id: satellite.id,
                name: satellite.name
            };
            
            satellite.dispose();
            delete this._satellites[satelliteId];
            
            document.dispatchEvent(new CustomEvent('satelliteDeleted', {
                detail: satelliteInfo
            }));
            
            this.updateSatelliteList();
        }
    }

    dispose() {
        // Dispose of all satellites
        Object.values(this._satellites).forEach(satellite => {
            if (satellite.dispose) {
                satellite.dispose();
            }
        });
        this._satellites = {};
    }
} 