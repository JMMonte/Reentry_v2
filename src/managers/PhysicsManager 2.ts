import { Constants } from '../utils/Constants';
import * as CANNON from 'cannon-es';
import { Manager } from '../types';

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface SatelliteData {
    id: string;
    position: Vector3;
    velocity: Vector3;
    mass: number;
}

interface PhysicsWorkerMessage {
    type: 'satelliteUpdate' | 'initialized' | 'error';
    data: any;
}

interface PhysicsWorkerInitData {
    earthMass: number;
    moonMass: number;
    G: number;
    scale: number;
}

interface PhysicsStepData {
    realDeltaTime: number;
    timeWarp: number;
    satellites: { [key: string]: SatelliteData };
    earthPosition: Vector3;
    earthRadius: number;
    moonPosition: Vector3;
}

interface App3D {
    satellites: { [key: string]: Satellite };
    earth: {
        earthBody: CANNON.Body;
    };
    moon: {
        moonBody: CANNON.Body;
    };
}

interface Satellite {
    id: string;
    position: Vector3;
    velocity: Vector3;
    mass: number;
    updateBuffer: any[];
}

export class PhysicsManager implements Manager {
    private app: App3D;
    private physicsWorker: Worker | null;
    private workerInitialized: boolean;
    private world: CANNON.World | null;

    constructor(app: App3D) {
        this.app = app;
        this.physicsWorker = null;
        this.workerInitialized = false;
        this.world = null;
        this.initPhysicsWorld();
    }

    public async initialize(): Promise<void> {
        // No additional initialization needed as it's done in constructor
        return Promise.resolve();
    }

    private initPhysicsWorld(): void {
        this.world = new CANNON.World();
        this.world.gravity.set(0, 0, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        (this.world.solver as any).iterations = 10; // Type assertion needed for CANNON.js solver
    }

    public getWorld(): CANNON.World | null {
        return this.world;
    }

    public checkWorkerNeeded(): void {
        const satelliteCount = Object.keys(this.app.satellites).length;
        if (satelliteCount > 0 && !this.physicsWorker) {
            this.initWorker();
        } else if (satelliteCount === 0 && this.physicsWorker) {
            this.cleanup();
        }
    }

    private initWorker(): void {
        console.log('Initializing physics worker...');
        this.physicsWorker = new Worker(new URL('../workers/physicsWorker.ts', import.meta.url), { type: 'module' });
        
        this.physicsWorker.onmessage = (event: MessageEvent<PhysicsWorkerMessage>) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'satelliteUpdate':
                    const satellite = this.app.satellites[data.id];
                    if (satellite) {
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

        // Initialize the physics worker
        const initData: PhysicsWorkerInitData = {
            earthMass: Constants.earthMass,
            moonMass: Constants.moonMass,
            G: Constants.G,
            scale: Constants.scale
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
        if (this.workerInitialized && Object.keys(this.app.satellites).length > 0 && this.app.earth && this.app.moon) {
            const satelliteData: { [key: string]: SatelliteData } = {};
            Object.entries(this.app.satellites).forEach(([id, satellite]) => {
                satelliteData[id] = {
                    id: satellite.id,
                    position: {
                        x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                        y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                        z: satellite.position.z / (Constants.metersToKm * Constants.scale)
                    },
                    velocity: satellite.velocity,
                    mass: satellite.mass
                };
            });
            
            const stepData: PhysicsStepData = {
                realDeltaTime,
                timeWarp,
                satellites: satelliteData,
                earthPosition: {
                    x: this.app.earth.earthBody.position.x / (Constants.metersToKm * Constants.scale),
                    y: this.app.earth.earthBody.position.y / (Constants.metersToKm * Constants.scale),
                    z: this.app.earth.earthBody.position.z / (Constants.metersToKm * Constants.scale)
                },
                earthRadius: Constants.earthRadius,
                moonPosition: {
                    x: this.app.moon.moonBody.position.x / (Constants.metersToKm * Constants.scale),
                    y: this.app.moon.moonBody.position.y / (Constants.metersToKm * Constants.scale),
                    z: this.app.moon.moonBody.position.z / (Constants.metersToKm * Constants.scale)
                }
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
                velocity: satellite.velocity,
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