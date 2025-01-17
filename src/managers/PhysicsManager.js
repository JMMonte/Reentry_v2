import { Constants } from '../utils/Constants.js';
import * as CANNON from 'cannon-es';

export class PhysicsManager {
    constructor(app) {
        this.app = app;
        this.physicsWorker = null;
        this.workerInitialized = false;
        this.world = null;
        this.initPhysicsWorld();
    }

    initPhysicsWorld() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, 0, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
    }

    getWorld() {
        return this.world;
    }

    checkWorkerNeeded() {
        const satelliteCount = Object.keys(this.app.satellites).length;
        if (satelliteCount > 0 && !this.physicsWorker) {
            this.initWorker();
        } else if (satelliteCount === 0 && this.physicsWorker) {
            this.cleanup();
        }
    }

    initWorker() {
        console.log('Initializing physics worker...');
        this.physicsWorker = new Worker(new URL('../workers/physicsWorker.js', import.meta.url), { type: 'module' });
        
        this.physicsWorker.onmessage = (event) => {
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
        this.physicsWorker.postMessage({
            type: 'init',
            data: {
                earthMass: Constants.earthMass,
                moonMass: Constants.moonMass,
                G: Constants.G,
                scale: Constants.scale
            }
        });
    }

    cleanup() {
        if (this.physicsWorker) {
            console.log('Cleaning up physics worker...');
            this.physicsWorker.terminate();
            this.physicsWorker = null;
            this.workerInitialized = false;
        }
    }

    async waitForInitialization() {
        if (!this.physicsWorker || !this.workerInitialized) {
            this.checkWorkerNeeded();
            await new Promise((resolve) => {
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

    updatePhysics(realDeltaTime, timeWarp) {
        // Only send physics updates if we have satellites and the worker is initialized
        if (this.workerInitialized && Object.keys(this.app.satellites).length > 0 && this.app.earth && this.app.moon) {
            const satelliteData = {};
            Object.entries(this.app.satellites).forEach(([id, satellite]) => {
                satelliteData[id] = {
                    id: satellite.id,
                    position: {
                        x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                        y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                        z: satellite.position.z / (Constants.metersToKm * Constants.scale)
                    },
                    velocity: {
                        x: satellite.velocity.x,
                        y: satellite.velocity.y,
                        z: satellite.velocity.z
                    },
                    mass: satellite.mass
                };
            });
            
            this.physicsWorker.postMessage({
                type: 'step',
                data: {
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
                }
            });
        }
    }

    async addSatellite(satellite) {
        await this.waitForInitialization();

        if (this.physicsWorker && this.workerInitialized) {
            this.physicsWorker.postMessage({
                type: 'addSatellite',
                data: {
                    id: satellite.id,
                    position: {
                        x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                        y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                        z: satellite.position.z / (Constants.metersToKm * Constants.scale)
                    },
                    velocity: {
                        x: satellite.velocity.x,
                        y: satellite.velocity.y,
                        z: satellite.velocity.z
                    },
                    mass: satellite.mass
                }
            });
        } else {
            console.error('Physics worker not initialized when creating satellite:', satellite.id);
        }
    }

    dispose() {
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