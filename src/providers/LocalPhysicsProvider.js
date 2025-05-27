import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';

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

        // For storing third body positions to send to worker
        this._thirdBodyPositions = [];
    }

    initialize(initialSatellites) {
        // Dispose existing worker if it exists
        if (this._worker) {
            console.log("[LocalPhysicsProvider] Disposing existing worker before re-initialization.");
            this.dispose();
        }

        this._worker = new Worker(new URL('../workers/modernPhysicsWorker.js', import.meta.url), { type: 'module' });
        this._workerReady = false;

        this._worker.onmessage = ({ data: { type, data } }) => {
            console.log('[LocalPhysicsProvider] Received from worker:', { type, data });
            switch (type) {
                case 'initialized':
                    this._handleWorkerInit(initialSatellites);
                    break;
                case 'satellitesUpdate':
                    this._applyWorkerUpdates(data);
                    break;
                case 'simulationUpdate':
                    // Handle simulation state updates from the worker
                    this._handleSimulationUpdate(data);
                    // Also update satellites for robustness
                    if (data && data.state && data.state.satellites) {
                        this._applyWorkerUpdates(Object.values(data.state.satellites));
                    }
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
            scale: 1,
            timeStep: this.app3d.getDisplaySetting?.('physicsTimeStep') || 1,
            perturbationScale: this.app3d.getDisplaySetting?.('perturbationScale') || 1,
            satellites: Array.from((this.app3d.satellites?.getSatellitesMap?.() || new Map()).values()).map(sat => ({
                id: sat.id,
                mass: sat.mass,
                size: sat.size,
                position: [sat.position.x, sat.position.y, sat.position.z],
                velocity: [sat.velocity.x, sat.velocity.y, sat.velocity.z],
                centralBodyNaifId: sat.centralBodyNaifId,
            }))
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
        // Send position and velocity as arrays (not objects) to the worker
        this._postToWorker('addSatellite', {
            id: satellite.id,
            mass: satellite.mass,
            size: satellite.size, // Assuming size is relevant for worker
            position: [satellite.position.x, satellite.position.y, satellite.position.z],
            velocity: [satellite.velocity.x, satellite.velocity.y, satellite.velocity.z],
            centralBodyNaifId: satellite.centralBodyNaifId,
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

        // Build thirdBodyPositions using PhysicsEngine only
        const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
        if (physicsEngine) {
            const relevantBodies = [10, 399, 301, 499, 401, 402, 599, 501, 502, 503, 504]; // Sun, Earth, Moon, Mars, Phobos, Deimos, Jupiter, Io, Europa, Ganymede, Callisto
            this._thirdBodyPositions = relevantBodies.map(naifId => {
                const bodyState = physicsEngine.bodies[naifId];
                if (bodyState) {
                    return {
                        name: `NAIF${naifId}`,
                        position: new THREE.Vector3(
                            bodyState.position[0],
                            bodyState.position[1],
                            bodyState.position[2]
                        ),
                        mass: bodyState.mass || Constants[`NAIF${naifId}Mass`] || 0,
                        quaternion: bodyState.quaternion || new THREE.Quaternion()
                    };
                } else {
                    // Fallback for bodies not in physics engine
                    console.warn(`[LocalPhysicsProvider] No physics data for NAIF ${naifId}`);
                    return null;
                }
            }).filter(body => body !== null);
        }

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
                continue;
            }

            // Pass arrays directly as expected by Satellite._updateFromBackend
            sat._updateFromBackend(u.position, u.velocity, u);
        }
    }

    _handleSimulationUpdate(data) {
        // Handle simulation state updates from the worker
        // This can be used for debugging or synchronizing simulation state
        // For now, just log that we received it to avoid warnings
        if (data && data.state) {
            // Optional: could expose this data for debugging or monitoring
            // console.debug('[LocalPhysicsProvider] Simulation update received:', data);
        }
    }

    _syncBodiesToWorker() {
        if (!this._workerReady) return;

        // Send positions in km as-is
        const bodiesForWorker = this._thirdBodyPositions.map(body => ({
            name: body.name,
            position: {
                x: body.position.x, // km
                y: body.position.y, // km
                z: body.position.z, // km
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
        console.log('[LocalPhysicsProvider] Sending to worker:', { type, data });
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