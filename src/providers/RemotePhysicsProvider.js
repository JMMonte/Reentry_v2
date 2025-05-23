/**
 * Provides satellite physics updates received from a remote backend.
 */
// import * as THREE from 'three'; // Keep for potential future use with Vector3 etc.
import { Constants } from '../utils/Constants.js'; // Keep for potential future use
import axios from 'axios'; // For making HTTP requests

const MAX_CONSECUTIVE_FAILURES = 3; // Number of failures before triggering fail-safe

export class RemotePhysicsProvider {
    /**
     * @param {App3D} app3d – Main App3D instance
     */
    constructor(app3d) {
        this.app3d = app3d;
        // Access satelliteManager via this.app3d.satellites when needed.
        this.isInitialized = false;
        this.consecutiveFailures = 0;
        this.failSafeTripped = false;
        console.log("[RemotePhysicsProvider] Instantiated.");
    }

    _handleApiSuccess() {
        this.consecutiveFailures = 0;
        // If the fail-safe was previously tripped and connection is now good,
        // we might want to reset this flag, allowing it to trip again if future failures occur.
        // However, the switch to local is one-way for now via this auto-failsafe.
        // If the user manually switches back to remote, this provider instance might be new
        // or its state (like failSafeTripped) should be reset.
        // For simplicity, this success just resets the counter.
    }

    _handleApiFailure(methodName, error) {
        this.consecutiveFailures++;
        console.error(`[RemotePhysicsProvider] API call ${methodName} failed (${this.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error.response ? error.response.data : error.message);

        if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !this.failSafeTripped) {
            this.failSafeTripped = true; // Prevent multiple dispatches
            console.warn("[RemotePhysicsProvider] Maximum consecutive API failures reached. Triggering fail-safe.");
            window.dispatchEvent(new CustomEvent('remotePhysicsFailed'));
            // Note: failSafeTripped remains true for this instance.
            // If the app manually switches back to remote, a new instance of RemotePhysicsProvider
            // will be created with failSafeTripped = false, or this one needs explicit reset.
        }
    }

    initialize(initialSatellites) {
        // For remote provider, initialization might involve ensuring simSocket is ready
        // or subscribing to specific satellite update messages if simSocket handles that.
        // For now, it's fairly passive until data arrives.
        this.isInitialized = true;
        console.log("[RemotePhysicsProvider] Initialized.");
        if (initialSatellites && initialSatellites.size > 0) {
            console.log("[RemotePhysicsProvider] Initial satellites present:", initialSatellites.size);
            // Potentially, request updates for these from backend if not automatic.
            // Or, if satellites are added via UI and this provider is active,
            // they will be individually sent to the backend via addSatellite.
        }
        // Reset failure count on successful initialization or re-initialization
        this._handleApiSuccess();
    }

    async addSatellite(satellite) {
        if (!this.isInitialized) {
            console.warn("[RemotePhysicsProvider] Not initialized. Cannot add satellite.");
            return;
        }
        const sessionId = this.app3d.sessionId;
        if (!sessionId) {
            console.error("[RemotePhysicsProvider] Session ID not found. Cannot add satellite.");
            return;
        }

        // Prepare satellite data for the backend as per PHYSICS_MANUAL.md
        // The manual specifies: { sat_id, mass, pos, vel, frame, central_body, bc, size }
        // Assuming satellite.position and satellite.velocity are THREE.Vector3 in km and km/s respectively for the API.
        // The manual is a bit inconsistent, createSatellite shows no units, getState shows km, km/s.
        // LocalPhysicsProvider sends meters to its worker.
        // Let's assume the backend expects km for position and km/s for velocity for satellite creation,
        // matching its getState response format for consistency.
        // If the backend expects meters, conversion satellite.position.clone().multiplyScalar(1000) would be needed.
        // For now, assuming App3D's satellite objects store position in km and velocity in km/s if they are to be sent directly.
        // Satellite.js uses meters internally for its position and m/s for velocity.
        // So we need to convert.
        const posKm = [
            satellite.position.x * Constants.metersToKm,
            satellite.position.y * Constants.metersToKm,
            satellite.position.z * Constants.metersToKm
        ];
        const velKms = [
            satellite.velocity.x * Constants.metersToKm,
            satellite.velocity.y * Constants.metersToKm,
            satellite.velocity.z * Constants.metersToKm
        ];

        const payload = {
            sat_id: satellite.id,
            mass: satellite.mass,
            pos: posKm, //阵列 in km
            vel: velKms, // array in km/s
            frame: satellite.frame || 'ECLIPJ2000', // Default if not specified
            central_body: satellite.centralBodyNaifId || 399, // Default to Earth if not specified
            bc: satellite.ballisticCoefficient, // Assuming this property exists
            size: satellite.size // Assuming this property exists (e.g., for drag area)
        };

        try {
            const url = `http://localhost:8000/satellite?session_id=${sessionId}`;
            await axios.post(url, payload);
            console.log(`[RemotePhysicsProvider] Satellite ${satellite.id} data sent to backend.`);
            this._handleApiSuccess();
        } catch (error) {
            // console.error(`[RemotePhysicsProvider] Failed to add satellite ${satellite.id} to backend:`, error.response ? error.response.data : error.message);
            this._handleApiFailure('addSatellite', error);
        }
    }

    async removeSatellite(satelliteId) {
        if (!this.isInitialized) {
            console.warn("[RemotePhysicsProvider] Not initialized. Cannot remove satellite.");
            return;
        }
        const sessionId = this.app3d.sessionId;
        if (!sessionId) {
            console.error("[RemotePhysicsProvider] Session ID not found. Cannot remove satellite.");
            return;
        }

        try {
            const url = `http://localhost:8000/satellite/${satelliteId}?session_id=${sessionId}`;
            await axios.delete(url);
            console.log(`[RemotePhysicsProvider] Satellite ${satelliteId} removal request sent to backend.`);
            this._handleApiSuccess();
        } catch (error) {
            // console.error(`[RemotePhysicsProvider] Failed to remove satellite ${satelliteId} from backend:`, error.response ? error.response.data : error.message);
            this._handleApiFailure('removeSatellite', error);
        }
    }

    /**
     * Called by simSocket.js (or a similar intermediary) when new satellite state data arrives from the backend.
     * @param {string|number} satelliteId
     * @param {Array<number>} positionArray - [x, y, z] in km (simulation units)
     * @param {Array<number>} velocityArray - [vx, vy, vz] in m/s (simulation units)
     * @param {Object} [debugData] - Optional debug data from backend
     */
    receiveSatelliteUpdateFromBackend(satelliteId, positionArray, velocityArray, debugData) {
        if (!this.isInitialized) {
            console.warn("[RemotePhysicsProvider] Received update before initialization. Skipping.");
            return;
        }
        const satelliteManager = this.app3d.satellites;
        if (!satelliteManager) {
            console.error("[RemotePhysicsProvider] SatelliteManager not available on app3d instance.");
            return;
        }

        const sat = satelliteManager.getSatellitesMap().get(satelliteId);
        if (!sat) {
            // console.warn(`[RemotePhysicsProvider] Received update for unknown satellite ID: ${satelliteId}`);
            return;
        }

        // The original SatelliteManager.updateSatelliteFromBackend method directly called sat.updateFromBackend.
        // We will replicate that here.
        // Ensure Satellite.js has `updateFromBackend` or `updatePositionFromPhysics` or similar.

        // Let's assume positionArray is [x,y,z] in km and velocityArray is [vx,vy,vz] in m/s
        // which matches the original `updateSatelliteFromBackend` in SatelliteManager.
        // If backend sends in different units (e.g., meters for position), conversion is needed here.

        sat.updateFromBackend(positionArray, velocityArray, debugData);
    }

    /**
     * Main update tick from SatelliteManager.
     * For the remote provider, this is likely a no-op as updates are pushed from the backend.
     * It could be used for requesting updates if the backend uses a pull model, but typically it's push.
     */
    // eslint-disable-next-line no-unused-vars
    update(satellites, currentTime, realDelta, warpedDelta, thirdBodyPositions) {
        // No specific action needed here if updates are purely event-driven from backend.
        // If backend requires periodic "keep-alive" or state sync requests for satellites,
        // this would be the place to do it.
    }

    // eslint-disable-next-line no-unused-vars
    async setTimeWarp(value) {
        if (!this.isInitialized) {
            console.warn("[RemotePhysicsProvider] Not initialized. Cannot set timewarp.");
            return;
        }
        const sessionId = this.app3d.sessionId;
        if (!sessionId) {
            console.error("[RemotePhysicsProvider] Session ID not found. Cannot set timewarp.");
            return;
        }
        // PHYSICS_MANUAL.md: POST /session/{session_id}/timewarp?factor={timewarp_factor}
        try {
            const url = `http://localhost:8000/session/${sessionId}/timewarp?factor=${value}`;
            const response = await axios.post(url);
            console.log("[RemotePhysicsProvider] Timewarp set on backend:", response.data);
            this._handleApiSuccess();
            // Optionally, update local timewarp state if backend confirms a different value,
            // though App.jsx seems to handle this by updating app3d.timeUtils.setLocalTimeWarp
        } catch (error) {
            // console.error("[RemotePhysicsProvider] Failed to set timewarp on backend:", error.response ? error.response.data : error.message);
            this._handleApiFailure('setTimeWarp', error);
        }
    }

    // eslint-disable-next-line no-unused-vars
    setPhysicsTimeStep(value) {
        // Similar to setTimeWarp, this might need to be communicated to the backend.
        // console.log("[RemotePhysicsProvider] setPhysicsTimeStep called with:", value, "(no backend action implemented)");
    }

    dispose() {
        this.isInitialized = false;
        // Unsubscribe from any simSocket messages if subscriptions were made.
        console.log("[RemotePhysicsProvider] Disposed.");
    }

    /**
     * Returns the current simulation state needed for handover (satellites, time, etc.).
     */
    getCurrentState() {
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
        
        // For remote physics, validate time data before calling setSimTimeFromServer
        if (state?.simTime && this.app3d.timeUtils?.setSimTimeFromServer) {
            // Validate the time data first
            const timeToSet = state.simTime instanceof Date ? state.simTime : new Date(state.simTime);
            
            if (!isNaN(timeToSet.getTime())) {
                // Use default timeWarp of 1 if not provided in state
                const timeWarp = state.timeWarp || 1;
                this.app3d.timeUtils.setSimTimeFromServer(timeToSet, timeWarp);
            } else {
                console.warn('[RemotePhysicsProvider] Invalid simulation time in state, skipping time update');
            }
        }
    }
} 