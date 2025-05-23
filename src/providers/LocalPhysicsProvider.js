import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { SolarSystemManager } from '../managers/SolarSystemManager.js';

/**
 * Provides satellite physics updates using a local Web Worker.
 */
export class LocalPhysicsProvider {
    static WORKER_THROTTLE_MS = 50;

    /**
     * @param {App3D} app3d – Main App3D instance
     */
    constructor(app3d) {
        this.app3d = app3d;
        // Get SatelliteManager instance from app3d
        // Ensure app3d.satellites is already initialized when provider is constructed
        // This is true because App3D constructs SatelliteManager first, then providers.
        // Correction: App3D constructs provider, then SatelliteManager. So this won't work immediately.
        // SatelliteManager needs to set this on the provider AFTER both are created.
        // OR, provider methods get satelliteManager on-the-fly: `const sm = this.app3d.satellites;`
        // Let's go with on-the-fly access for now to avoid circular setters, unless it proves problematic.
        // this.satelliteManager = this.app3d.satellites; // Access when needed

        this._worker = null;
        this._workerReady = false;
        this._lastWorkerTick = 0; // For throttling third-body updates to worker
        this._lastTimeWarp = undefined;
        this._workerInterval = LocalPhysicsProvider.WORKER_THROTTLE_MS;

        // Pre-computed factors
        this._kmToM = 1 / Constants.metersToKm;

        // For storing third body positions to send to worker
        this._thirdBodyPositions = [];

        this.solarSystemManager = new SolarSystemManager();
    }

    initialize(initialSatellites) {
        // Dispose existing worker if it exists
        if (this._worker) {
            console.log("[LocalPhysicsProvider] Disposing existing worker before re-initialization.");
            this.dispose();
        }

        this._worker = new Worker(new URL('../workers/physicsWorker.js', import.meta.url), { type: 'module' });
        this._workerReady = false;

        this._worker.onmessage = ({ data: { type, data } }) => {
            switch (type) {
                case 'initialized':
                    this._handleWorkerInit(initialSatellites);
                    break;
                case 'satellitesUpdate':
                    this._applyWorkerUpdates(data);
                    break;
                default:
                    console.warn('[LocalPhysicsProvider] unknown msg from worker:', type);
            }
        };

        this._worker.onerror = (error) => {
            console.error('[LocalPhysicsProvider] Worker error:', error);
        };

        this._postToWorker('init', {
            earthMass: Constants.earthMass,
            moonMass: Constants.moonMass,
            G: Constants.G,
            scale: 1, // Assuming scale is handled elsewhere or not needed by worker directly
            timeStep: this.app3d.getDisplaySetting?.('physicsTimeStep') || 1,
            perturbationScale: this.app3d.getDisplaySetting?.('perturbationScale') || 1,
            // sensitivityScale: this.satelliteManager.sensitivityScale, // If sensitivity is still a concept
        });
    }

    _handleWorkerInit(initialSatellites) {
        this._workerReady = true;
        console.log("[LocalPhysicsProvider] Physics worker initialized.");

        // Add any existing satellites to the worker
        if (initialSatellites) {
            for (const sat of initialSatellites.values()) {
                this.addSatellite(sat);
            }
        }
        // Send initial bodies list so dynamicBodies is populated for the first tick
        this._syncBodiesToWorker();
    }

    addSatellite(satellite) {
        if (!this._workerReady) {
            // Queue it or wait for worker to be ready? For now, assume worker init handles initial set.
            // If satellites can be added after init, we might need a queue.
            console.warn("[LocalPhysicsProvider] Worker not ready, cannot add satellite:", satellite.id);
            return;
        }
        const f = this._kmToM;
        this._postToWorker('addSatellite', {
            id: satellite.id,
            mass: satellite.mass,
            size: satellite.size, // Assuming size is relevant for worker
            position: { x: satellite.position.x * f, y: satellite.position.y * f, z: satellite.position.z * f },
            velocity: { x: satellite.velocity.x * f, y: satellite.velocity.y * f, z: satellite.velocity.z * f },
        });
    }

    removeSatellite(satelliteId) {
        if (this._workerReady) {
            this._postToWorker('removeSatellite', { id: satelliteId });
        }
        const satelliteManager = this.app3d.satellites;
        if (satelliteManager && satelliteManager.getSatellitesMap().size === 0) {
            this._teardownWorkerIfIdle();
        }
    }

    /**
     * Main update tick from SatelliteManager.
     * @param {Map<string|number, import('../components/Satellite/Satellite.js').Satellite>} satellites
     * @param {number} currentTime - Current simulation time (epoch ms or similar)
     * @param {number} realDelta - Real time elapsed since last frame (seconds)
     * @param {number} warpedDelta - Warped simulation time elapsed (seconds)
     * @param {Array<{name: string, position: THREE.Vector3, mass: number}>} thirdBodyPositions - Array of third bodies like Sun, Moon
     */
    update() {
        if (!this._workerReady) return;

        const now = performance.now();
        const { timeWarp } = this.app3d.timeUtils;

        if (timeWarp !== this._lastTimeWarp) {
            this.setTimeWarp(timeWarp);
        }

        // Build thirdBodyPositions using SolarSystemManager
        const simDate = this.app3d.timeUtils.getSimulatedTime?.() || new Date();
        const relevantBodies = [10, 399, 301, 499, 401, 402, 599, 501, 502, 503, 504]; // Sun, Earth, Moon, Mars, Phobos, Deimos, Jupiter, Io, Europa, Ganymede, Callisto
        this._thirdBodyPositions = relevantBodies.map(naifId => {
            const state = this.solarSystemManager.getBodyState(naifId, simDate);
            const name = this.app3d.celestialBodiesConfig?.[naifId]?.name || `NAIF${naifId}`;
            const mass = Constants[`${name}Mass`] || 0;
            return {
                name,
                position: new THREE.Vector3(state.position.x, state.position.y, state.position.z),
                mass,
                quaternion: state.quaternion
            };
        });

        if (now - this._lastWorkerTick >= this._workerInterval) {
            this._syncBodiesToWorker();
            this._lastWorkerTick = now;
        }

        // The worker will send back 'satellitesUpdate' messages which are handled by _applyWorkerUpdates
        // No direct update to satellite objects here, that's done in the message handler.
    }

    _applyWorkerUpdates(payload) {
        if (!payload || !Array.isArray(payload)) {
            console.warn("[LocalPhysicsProvider] Invalid payload from worker:", payload);
            return;
        }
        const satelliteManager = this.app3d.satellites;
        if (!satelliteManager) {
            console.error("[LocalPhysicsProvider] SatelliteManager not available on app3d instance.");
            return;
        }
        for (const u of payload) {
            // Get the satellite instance from SatelliteManager
            const sat = satelliteManager.getSatellitesMap().get(u.id);
            if (!sat) {
                // console.warn(`[LocalPhysicsProvider] Satellite not found for ID: ${u.id}`);
                continue;
            }

            // Worker sends position in METERS and velocity in M/S.
            // Satellite.updatePosition() expects position in METERS and velocity in M/S.
            
            // Ensure temporary vectors exist on the satellite object or create them here if preferred.
            // Reusing vectors on `sat` (like `sat._tmpPos`) is fine if Satellite.js defines them for this purpose.
            // For clarity, let's create them here if they might not exist or are used differently by Satellite.js.
            const newPosition = new THREE.Vector3(u.position[0], u.position[1], u.position[2]);
            const newVelocity = new THREE.Vector3(u.velocity[0], u.velocity[1], u.velocity[2]);

            // Call the Satellite's method to update its physics state and visuals tied to that state.
            sat.updatePosition(newPosition, newVelocity, u.debug); // u.debug is propagated if physicsWorker sends it
        }
    }

    _syncBodiesToWorker() {
        if (!this._workerReady) return;

        const bodiesForWorker = this._thirdBodyPositions.map(body => ({
            name: body.name,
            // Convert positions to meters for the worker (assuming _thirdBodyPositions are in km from SatelliteManager)
            position: {
                x: body.position.x * this._kmToM, // km to m
                y: body.position.y * this._kmToM, // km to m
                z: body.position.z * this._kmToM, // km to m
            },
            mass: body.mass,
        }));

        this._postToWorker('updateBodies', { bodies: bodiesForWorker });
    }

    setTimeWarp(value) {
        this._lastTimeWarp = value;
        this._postToWorker('setTimeWarp', { value });
    }

    setPhysicsTimeStep(value) {
        this._postToWorker('setTimeStep', { value });
    }

    // If sensitivityScale is still a thing for the local worker
    // setSensitivityScale(value) {
    //     this._postToWorker('setSensitivityScale', { value: value });
    // }

    _postToWorker(type, data = {}) {
        this._worker?.postMessage({ type, data });
    }

    _teardownWorkerIfIdle() {
        // This logic might be better placed in SatelliteManager,
        // as it knows if there are *any* satellites requiring *any* provider.
        // For now, keeping it simple: if this provider is active and no sats, terminate.
        const satelliteManager = this.app3d.satellites;
        if (this._worker && satelliteManager && satelliteManager.getSatellitesMap().size === 0) {
            this.dispose();
        }
    }

    dispose() {
        if (this._worker) {
            console.log("[LocalPhysicsProvider] Disposed.");
            this._worker.terminate();
            this._worker = null;
        }
        this._workerReady = false;
        this._lastWorkerTick = 0;
        this._lastTimeWarp = 1;
        this._thirdBodyPositions = [];
    }

    /**
     * Returns the current simulation state needed for handover (satellites, time, etc.).
     */
    getCurrentState() {
        // Extract satellites and any other relevant state
        const satelliteManager = this.app3d.satellites;
        const satellites = satelliteManager ? Array.from(satelliteManager.getSatellitesMap().values()) : [];
        const simTime = this.app3d.timeUtils?.getSimulatedTime?.() || new Date();
        return {
            satellites,
            simTime,
            // Add more state as needed (e.g., time warp, settings)
        };
    }

    /**
     * Initialize this provider with a given state (satellites, time, etc.).
     * @param {Object} state
     */
    initializeWithState(state) {
        if (state?.satellites) {
            this.initialize(new Map(state.satellites.map(sat => [sat.id, sat])));
        } else {
            this.initialize();
        }
        
        // For local physics, use setSimulatedTime instead of setSimTimeFromServer
        if (state?.simTime && this.app3d.timeUtils) {
            // Validate the time data first
            const timeToSet = state.simTime instanceof Date ? state.simTime : new Date(state.simTime);
            
            if (!isNaN(timeToSet.getTime())) {
                // Use setSimulatedTime for local physics (more appropriate than setSimTimeFromServer)
                this.app3d.timeUtils.setSimulatedTime(timeToSet);
            } else {
                console.warn('[LocalPhysicsProvider] Invalid simulation time in state, using current time');
            }
        }
    }
} 