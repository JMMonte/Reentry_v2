import * as THREE from 'three';
import { Satellite as SatelliteComponent } from '../components/Satellite/Satellite';
import { PhysicsUtils } from '../utils/PhysicsUtils';
import { Constants } from '../utils/Constants';
import type { 
    App3D, 
    DisplayPropertyDefinition,
    DisplayPropertyDefinitions,
    DisplayPropertyValue,
    DisplayPropertyValues,
    Satellite,
    CelestialBody,
    SatelliteWithMethods,
    OrbitalParameters
} from '../types';

interface SatelliteParams {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    mass?: number;
    size?: number;
    name?: string;
    referenceBody?: string; // Name of the celestial body this satellite orbits
    orbitalParameters?: OrbitalParameters;
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
    referenceBody?: string;
}

interface OrbitalElementParams {
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    raan: number;
    argumentOfPeriapsis: number;
    trueAnomaly: number;
    mass?: number;
    size?: number;
    name?: string;
    referenceBody?: string;
}

interface PositionVelocityResult {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
}

export class SatelliteManager {
    public static displayProperties: DisplayPropertyDefinitions = {
        showOrbits: {
            label: 'Show Orbits',
            category: 'satellites',
            type: 'boolean',
            defaultValue: true
        },
        showTraces: {
            label: 'Show Ground Traces',
            category: 'satellites',
            type: 'boolean',
            defaultValue: true
        },
        showVectors: {
            label: 'Show Velocity Vectors',
            category: 'satellites',
            type: 'boolean',
            defaultValue: false
        }
    };

    private app: App3D;
    private _satellites: Record<string, SatelliteWithMethods>;
    private displaySettings: Record<string, boolean>;
    private brightColors: number[];
    private celestialBodies: Map<string, CelestialBody>;

    constructor(app: App3D) {
        this.app = app;
        this._satellites = {};
        this.celestialBodies = new Map();
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
            this.displaySettings[key] = prop.value as boolean;
        });

        this.findCelestialBodies();
    }

    private findCelestialBodies(): void {
        this.celestialBodies.clear();
        this.app.scene.traverse((object: THREE.Object3D) => {
            const celestialBody = object as unknown as CelestialBody;
            if (celestialBody.name && celestialBody.mass) {
                this.celestialBodies.set(celestialBody.name, celestialBody);
            }
        });
    }

    private getCelestialBody(name: string): CelestialBody | null {
        return this.celestialBodies.get(name) || null;
    }

    private getPrimaryBody(): CelestialBody | null {
        // Find the celestial body with the highest mass (assumed to be the primary body)
        let primaryBody: CelestialBody | null = null;
        let maxMass = 0;

        this.celestialBodies.forEach(body => {
            if (body.mass > maxMass) {
                maxMass = body.mass;
                primaryBody = body;
            }
        });

        return primaryBody;
    }

    public getDisplaySettings(): Record<string, boolean> {
        return { ...this.displaySettings };
    }

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

    public get satellites(): Record<string, SatelliteWithMethods> {
        return this._satellites;
    }

    private generateUniqueId(): string {
        let id = 0;
        while (this._satellites[id.toString()]) {
            id++;
        }
        return id.toString();
    }

    private getRandomColor(): number {
        return this.brightColors[Math.floor(Math.random() * this.brightColors.length)];
    }

    public async createSatellite(params: SatelliteParams): Promise<SatelliteWithMethods> {
        const { scene } = this.app;
        const id = this.generateUniqueId();
        const color = this.getRandomColor();

        const newSatellite = new SatelliteComponent({
            scene,
            position: params.position,
            velocity: params.velocity,
            id,
            color,
            mass: params.mass || 100, // kg
            size: params.size || 1, // meters
            app3d: this.app,
            name: params.name
        }) as unknown as SatelliteWithMethods;

        // Get display settings from DisplayManager or use default
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

    public async createFromLatLon(params: LatLonParams): Promise<SatelliteWithMethods> {
        const referenceBody = this.getCelestialBody(params.referenceBody || 'Earth') || this.getPrimaryBody();
        if (!referenceBody) {
            throw new Error('No reference body found in scene');
        }

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
            referenceBody,
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
            name,
            referenceBody: referenceBody.name
        });
    }

    public async createFromLatLonCircular(params: Omit<LatLonParams, 'velocity'>): Promise<SatelliteWithMethods> {
        const referenceBody = this.getCelestialBody(params.referenceBody || 'Earth') || this.getPrimaryBody();
        if (!referenceBody) {
            throw new Error('No reference body found in scene');
        }

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
        const radius = referenceBody.radius + (altitude * Constants.kmToMeters);
        const orbitalVelocity = PhysicsUtils.calculateOrbitalVelocity(referenceBody.mass, radius);

        const { position, velocity } = this.calculatePositionVelocity(
            referenceBody,
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
            name,
            referenceBody: referenceBody.name
        });
    }

    public async createFromOrbitalElements(params: OrbitalElementParams): Promise<SatelliteWithMethods> {
        const referenceBody = this.getCelestialBody(params.referenceBody || 'Earth') || this.getPrimaryBody();
        if (!referenceBody) {
            throw new Error('No reference body found in scene');
        }

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

        const orbitalParameters: OrbitalParameters = {
            semiMajorAxis,
            eccentricity,
            inclination,
            longitudeOfAscendingNode: raan,
            argumentOfPeriapsis,
            meanAnomaly: trueAnomaly // Note: This is an approximation, should be converted
        };

        return this.createSatellite({
            position,
            velocity,
            mass,
            size,
            name,
            referenceBody: referenceBody.name,
            orbitalParameters
        });
    }

    private calculatePositionVelocity(
        referenceBody: CelestialBody,
        latitude: number,
        longitude: number,
        altitude: number,
        velocity: number,
        azimuth: number,
        angleOfAttack: number
    ): PositionVelocityResult {
        const rotationQuaternion = (referenceBody as any).rotationGroup?.quaternion || new THREE.Quaternion();
        const tiltQuaternion = (referenceBody as any).tiltGroup?.quaternion || new THREE.Quaternion();

        const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
            latitude,
            longitude,
            altitude * Constants.kmToMeters,
            velocity * Constants.kmToMeters,
            azimuth,
            angleOfAttack,
            rotationQuaternion,
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

    private applyDisplaySettings(satellite: SatelliteWithMethods, displaySettings: Record<string, boolean>): void {
        if (satellite.setVectorsVisible) {
            satellite.setVectorsVisible(displaySettings.showVectors);
        }
        if (satellite.setOrbitVisible) {
            satellite.setOrbitVisible(displaySettings.showOrbits);
        }
        if (satellite.setTraceVisible) {
            satellite.setTraceVisible(displaySettings.showTraces);
        }
        if (satellite.setGroundTraceVisible) {
            satellite.setGroundTraceVisible(displaySettings.showTraces);
        }
    }

    private updateInitialState(satellite: SatelliteWithMethods, params: SatelliteParams): void {
        if (satellite.updateOrbit) {
            satellite.updateOrbit();
        }
        if (satellite.updateTrace) {
            satellite.updateTrace();
        }
        if (satellite.updateGroundTrace) {
            satellite.updateGroundTrace();
        }
    }

    private async initializePhysics(satellite: SatelliteWithMethods): Promise<void> {
        if (this.app.physicsManager) {
            await this.app.physicsManager.addSatellite(satellite);
        }
    }

    public updateSatelliteList(): void {
        if (this.app.updateSatelliteList) {
            this.app.updateSatelliteList();
        }
    }

    public removeSatellite(satelliteId: string): void {
        const satellite = this._satellites[satelliteId];
        if (satellite) {
            // Remove debug window if it exists
            if (this.app.removeDebugWindow) {
                this.app.removeDebugWindow(Number(satelliteId));
            }

            // Dispose of satellite resources
            if (satellite.dispose) {
                satellite.dispose();
            }

            // Remove from collection
            delete this._satellites[satelliteId];
            this.updateSatelliteList();
        }
    }

    public dispose(): void {
        // Remove all satellites
        Object.keys(this._satellites).forEach(id => {
            this.removeSatellite(id);
        });
        this.celestialBodies.clear();
    }
} 