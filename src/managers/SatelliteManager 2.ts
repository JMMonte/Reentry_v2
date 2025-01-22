import * as THREE from 'three';
import { Satellite } from '../components/Satellite/Satellite';
import { PhysicsUtils } from '../utils/PhysicsUtils';
import { Constants } from '../utils/Constants';
import { Manager } from '../types';

interface DisplayProperty {
    value: boolean;
    name: string;
    icon: string;
}

interface DisplayProperties {
    [key: string]: DisplayProperty;
}

interface DisplaySettings {
    [key: string]: boolean;
    showSatVectors: boolean;
    showOrbits: boolean;
    showTraces: boolean;
    showGroundTraces: boolean;
    showSatConnections: boolean;
}

interface SatelliteParams {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    mass?: number;
    size?: number;
    name?: string;
}

interface LatLonParams {
    latitude: number;
    longitude: number;
    altitude: number;
    velocity: number;
    azimuth: number;
    angleOfAttack?: number;
    mass?: number;
    size?: number;
    name?: string;
}

interface OrbitalElementsParams {
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    raan: number;
    argumentOfPeriapsis: number;
    trueAnomaly: number;
    mass?: number;
    size?: number;
    name?: string;
}

interface App3D {
    scene: THREE.Scene;
    earth?: {
        rotationGroup?: THREE.Group;
        tiltGroup?: THREE.Group;
    };
    displayManager?: {
        settings: DisplaySettings;
    };
    physicsManager: {
        checkWorkerNeeded: () => void;
        waitForInitialization: () => Promise<void>;
        addSatellite: (satellite: Satellite) => Promise<void>;
    };
    connectionManager?: {
        setEnabled: (enabled: boolean) => void;
    };
    createDebugWindow?: (satellite: Satellite) => void;
}

interface SatelliteCollection {
    [key: string | number]: Satellite;
}

interface SatelliteInfo {
    id: string | number;
    name: string;
}

export class SatelliteManager implements Manager {
    // Define display properties for satellites
    static displayProperties: DisplayProperties = {
        showSatVectors: { value: false, name: 'Sat Vectors', icon: 'Circle' },
        showOrbits: { value: true, name: 'Sat Orbits', icon: 'Circle' },
        showTraces: { value: true, name: 'Sat Traces', icon: 'LineChart' },
        showGroundTraces: { value: false, name: 'Ground Traces', icon: 'MapPin' },
        showSatConnections: { value: false, name: 'Sat Connections', icon: 'Link' }
    };

    private app: App3D;
    private _satellites: SatelliteCollection;
    private brightColors: number[];
    private displaySettings: DisplaySettings;

    constructor(app: App3D) {
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
        this.displaySettings = {} as DisplaySettings;
        Object.entries(SatelliteManager.displayProperties).forEach(([key, prop]) => {
            this.displaySettings[key] = prop.value;
        });
    }

    public async initialize(): Promise<void> {
        // No additional initialization needed as it's done in constructor
        return Promise.resolve();
    }

    // Method to get current display settings
    public getDisplaySettings(): DisplaySettings {
        return this.displaySettings;
    }

    // Method to update a display setting
    public updateDisplaySetting(key: string, value: boolean): void {
        if (key in this.displaySettings) {
            this.displaySettings[key] = value;
            Object.values(this._satellites).forEach(satellite => {
                if (satellite) {
                    this.applyDisplaySettings(satellite, this.displaySettings);
                }
            });
        }
    }

    public get satellites(): SatelliteCollection {
        return this._satellites;
    }

    private generateUniqueId(): number {
        let id = 0;
        while (this._satellites[id]) {
            id++;
        }
        return id;
    }

    private getRandomColor(): number {
        return this.brightColors[Math.floor(Math.random() * this.brightColors.length)];
    }

    public async createSatellite(params: SatelliteParams): Promise<Satellite> {
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

    public async createFromLatLon(params: LatLonParams): Promise<Satellite> {
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
            angleOfAttack,
            false  // velocity is already in km/s
        );

        return this.createSatellite({
            position,
            velocity: satVelocity,
            mass,
            size,
            name
        });
    }

    public async createFromLatLonCircular(params: Omit<LatLonParams, 'velocity'>): Promise<Satellite> {
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
            angleOfAttack,
            true  // velocity is in m/s
        );

        return this.createSatellite({
            position,
            velocity,
            mass,
            size,
            name
        });
    }

    public async createFromOrbitalElements(params: OrbitalElementsParams): Promise<Satellite> {
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
            velocityECI.x,
            velocityECI.y,
            velocityECI.z
        );

        return this.createSatellite({
            position,
            velocity,
            mass,
            size,
            name
        });
    }

    private calculatePositionVelocity(
        earth: App3D['earth'],
        latitude: number,
        longitude: number,
        altitude: number,
        velocity: number,
        azimuth: number,
        angleOfAttack: number,
        isMetersPerSecond = false
    ): { position: THREE.Vector3; velocity: THREE.Vector3 } {
        const earthQuaternion = earth?.rotationGroup?.quaternion || new THREE.Quaternion();
        const tiltQuaternion = earth?.tiltGroup?.quaternion || new THREE.Quaternion();

        // Convert to km/s if input is in m/s, otherwise keep as km/s
        const velocityKmS = isMetersPerSecond ? velocity / Constants.kmToMeters : velocity;

        const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
            latitude,
            longitude,
            altitude * Constants.kmToMeters,
            velocityKmS,  // Pass in km/s
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
                velocityECEF.x * Constants.kmToMeters,  // Convert back to m/s
                velocityECEF.y * Constants.kmToMeters,
                velocityECEF.z * Constants.kmToMeters
            )
        };
    }

    private applyDisplaySettings(satellite: Satellite, displaySettings: DisplaySettings): void {
        const { showOrbits, showTraces, showGroundTraces, showSatVectors, showSatConnections } = displaySettings;

        if (satellite.orbitLine) {
            satellite.orbitLine.visible = showOrbits;
        }
        if (satellite.apsisVisualizer) {
            (satellite.apsisVisualizer as unknown as { visible: boolean }).visible = showOrbits;
        }
        if (satellite.traceLine) {
            satellite.traceLine.visible = showTraces;
        }
        if (satellite.groundTrack) {
            satellite.groundTrack.setVisible(showGroundTraces);
        }
        if (satellite.velocityVector) {
            satellite.velocityVector.visible = showSatVectors;
        }
        if (satellite.orientationVector) {
            satellite.orientationVector.visible = showSatVectors;
        }

        // Update connection manager
        if (this.app.connectionManager) {
            this.app.connectionManager.setEnabled(showSatConnections);
        }
    }

    private updateInitialState(satellite: Satellite, params: SatelliteParams): void {
        if (satellite.orbitLine && satellite.orbitLine.visible) {
            satellite.updateOrbitLine(params.position, params.velocity);
        }
        if (satellite.traceLine && satellite.traceLine.visible && satellite.tracePoints) {
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

    private async initializePhysics(satellite: Satellite): Promise<void> {
        // Check if physics worker is needed and initialize it
        this.app.physicsManager.checkWorkerNeeded();
        await this.app.physicsManager.waitForInitialization();
        await this.app.physicsManager.addSatellite(satellite);
    }

    private updateSatelliteList(): void {
        const satelliteData = Object.fromEntries(
            Object.entries(this._satellites)
                .filter(([_, sat]) => sat && sat.id != null && sat.name)
                .map(([id, sat]) => [id, {
                    id: sat.id,
                    name: sat.name
                }])
        );

        document.dispatchEvent(new CustomEvent<{ satellites: Record<string, SatelliteInfo> }>('satelliteListUpdated', {
            detail: {
                satellites: satelliteData
            }
        }));
    }

    public removeSatellite(satelliteId: string | number): void {
        const satellite = this._satellites[satelliteId];
        if (satellite) {
            const satelliteInfo: SatelliteInfo = {
                id: satellite.id,
                name: satellite.name
            };

            satellite.dispose();
            delete this._satellites[satelliteId];

            document.dispatchEvent(new CustomEvent<SatelliteInfo>('satelliteDeleted', {
                detail: satelliteInfo
            }));

            this.updateSatelliteList();
        }
    }

    public dispose(): void {
        // Dispose of all satellites
        Object.values(this._satellites).forEach(satellite => {
            if (satellite.dispose) {
                satellite.dispose();
            }
        });
        this._satellites = {};
    }
} 