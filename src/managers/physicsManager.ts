import { Constants } from '../utils/Constants';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { Satellite, CelestialBody, CelestialBodyType, SatelliteWithMethods } from '../types';
import App3D from '../app3d';

interface Vector3Data {
    x: number;
    y: number;
    z: number;
}

interface SatelliteData {
    id: string;
    position: Vector3Data;
    velocity: Vector3Data;
    mass: number;
}

interface CelestialBodyData {
    id: string;
    name: string;
    type: CelestialBodyType;
    position: Vector3Data;
    mass: number;
    radius: number;
}

interface PhysicsWorkerMessage {
    type: string;
    data: any;
}

interface PhysicsWorkerInitData {
    G: number;
    scale: number;
    celestialBodies: CelestialBodyData[];
}

interface PhysicsWorkerStepData {
    realDeltaTime: number;
    timeWarp: number;
    satellites: Record<string, SatelliteData>;
    celestialBodies: CelestialBodyData[];
}

export class PhysicsManager {
    private app: App3D;
    private physicsWorker: Worker | null;
    private workerInitialized: boolean;
    private world: CANNON.World | null;
    private celestialBodies: Map<string, CelestialBody>;

    constructor(app: App3D) {
        this.app = app;
        this.physicsWorker = null;
        this.workerInitialized = false;
        this.world = null;
        this.celestialBodies = new Map();
        this.initPhysicsWorld();
    }

    private findCelestialBodies(): void {
        this.celestialBodies.clear();
        this.app.scene.traverse((object: THREE.Object3D) => {
            const celestialBody = object as unknown as CelestialBody;
            if (celestialBody.name && celestialBody.mass && celestialBody.type) {
                this.celestialBodies.set(celestialBody.name, celestialBody);
            }
        });
    }

    private getCelestialBodyData(): CelestialBodyData[] {
        const bodyData: CelestialBodyData[] = [];
        this.celestialBodies.forEach(body => {
            const position = body.position;
            bodyData.push({
                id: body.name,
                name: body.name,
                type: body.type,
                position: {
                    x: position.x / (Constants.metersToKm * Constants.scale),
                    y: position.y / (Constants.metersToKm * Constants.scale),
                    z: position.z / (Constants.metersToKm * Constants.scale)
                },
                mass: body.mass,
                radius: body.radius
            });
        });
        return bodyData;
    }

    private initPhysicsWorld(): void {
        this.world = new CANNON.World();
        this.world.gravity.set(0, 0, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
        this.findCelestialBodies();
    }

    public getWorld(): CANNON.World | null {
        return this.world;
    }

    public checkWorkerNeeded(): void {
        const satelliteCount = Object.keys(this.app.satellites || {}).length;
        if (satelliteCount > 0 && !this.physicsWorker) {
            this.initWorker();
        } else if (satelliteCount === 0 && this.physicsWorker) {
            this.cleanup();
        }
    }

    private initWorker(): void {
        console.log('Initializing physics worker...');
        this.physicsWorker = new Worker(
            new URL('../workers/physicsWorker.js', import.meta.url),
            { type: 'module' }
        );
        
        this.physicsWorker.onmessage = (event: MessageEvent<PhysicsWorkerMessage>) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'satelliteUpdate':
                    const satellite = this.app.satellites?.[data.id] as SatelliteWithMethods;
                    if (satellite?.updateBuffer) {
                        satellite.updateBuffer.push(data);
                    }
                    break;
                case 'initialized':
                    console.log('Physics worker initialized successfully');
                    this.workerInitialized = true;
                    break;
                case 'error':
                    console.error('Physics worker error:', data);
                    break;
            }
        };

        // Initialize the physics worker with all celestial bodies
        const initData: PhysicsWorkerInitData = {
            G: Constants.G,
            scale: Constants.scale,
            celestialBodies: this.getCelestialBodyData()
        };

        this.physicsWorker.postMessage({
            type: 'init',
            data: initData
        });
    }

    public cleanup(): void {
        if (this.physicsWorker) {
            console.log('Cleaning up physics worker...');
            this.physicsWorker.terminate();
            this.physicsWorker = null;
            this.workerInitialized = false;
        }
        this.celestialBodies.clear();
    }

    public async waitForInitialization(): Promise<void> {
        if (!this.physicsWorker || !this.workerInitialized) {
            this.checkWorkerNeeded();
            await new Promise<void>((resolve) => {
                const checkWorker = () => {
                    if (this.workerInitialized) {
                        resolve();
                    } else {
                        setTimeout(checkWorker, 50);
                    }
                };
                checkWorker();
            });
        }
    }

    public updatePhysics(realDeltaTime: number, timeWarp: number): void {
        // Only send physics updates if we have satellites and the worker is initialized
        if (this.workerInitialized && 
            this.app.satellites && 
            Object.keys(this.app.satellites).length > 0 && 
            this.celestialBodies.size > 0) {
            
            const satelliteData: Record<string, SatelliteData> = {};
            Object.entries(this.app.satellites).forEach(([id, satellite]) => {
                satelliteData[id] = {
                    id: satellite.id,
                    position: {
                        x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                        y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                        z: satellite.position.z / (Constants.metersToKm * Constants.scale)
                    },
                    velocity: {
                        x: satellite.velocity.x / (Constants.metersToKm * Constants.scale),
                        y: satellite.velocity.y / (Constants.metersToKm * Constants.scale),
                        z: satellite.velocity.z / (Constants.metersToKm * Constants.scale)
                    },
                    mass: satellite.mass
                };
            });

            const stepData: PhysicsWorkerStepData = {
                realDeltaTime,
                timeWarp,
                satellites: satelliteData,
                celestialBodies: this.getCelestialBodyData()
            };
            
            this.physicsWorker?.postMessage({
                type: 'step',
                data: stepData
            });
        }
    }

    public async addSatellite(satellite: Satellite): Promise<void> {
        await this.waitForInitialization();

        if (this.physicsWorker && this.workerInitialized) {
            const satelliteData: SatelliteData = {
                id: satellite.id,
                position: {
                    x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                    y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                    z: satellite.position.z / (Constants.metersToKm * Constants.scale)
                },
                velocity: {
                    x: satellite.velocity.x / (Constants.metersToKm * Constants.scale),
                    y: satellite.velocity.y / (Constants.metersToKm * Constants.scale),
                    z: satellite.velocity.z / (Constants.metersToKm * Constants.scale)
                },
                mass: satellite.mass
            };

            this.physicsWorker.postMessage({
                type: 'addSatellite',
                data: satelliteData
            });
        } else {
            console.error('Physics worker not initialized when creating satellite:', satellite.id);
        }
    }

    public dispose(): void {
        this.cleanup();
        if (this.world) {
            // Clean up physics bodies
            while(this.world.bodies.length > 0) {
                this.world.removeBody(this.world.bodies[0]);
            }
            this.world = null;
        }
    }
} 