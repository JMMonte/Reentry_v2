import LZString from 'lz-string';
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';

/**
 * Manages simulation state: satellite creation/removal, import/export, and state sync.
 */
export class SimulationStateManager {
    /**
     * @param {App3D} app - Reference to the main App3D instance
     */
    constructor(app) {
        this.app = app;
        this.satellites = app.satellites;
    }

    /**
     * Create a satellite from parameters.
     * @param {Object} params
     * @returns {Satellite}
     */
    createSatellite(params) {
        // Ensure position and velocity are THREE.Vector3
        const safeParams = { ...params };
        if (safeParams.position) {
            if (!(safeParams.position instanceof THREE.Vector3) && typeof safeParams.position === 'object') {
                safeParams.position = new THREE.Vector3(
                    safeParams.position.x,
                    safeParams.position.y,
                    safeParams.position.z
                );
            } else if (!safeParams.position) {
                console.warn('Satellite creation skipped: missing position');
                return null;
            }
        } else {
            console.warn('Satellite creation skipped: missing position');
            return null;
        }
        if (safeParams.velocity) {
            if (!(safeParams.velocity instanceof THREE.Vector3) && typeof safeParams.velocity === 'object') {
                safeParams.velocity = new THREE.Vector3(
                    safeParams.velocity.x,
                    safeParams.velocity.y,
                    safeParams.velocity.z
                );
            } else if (!safeParams.velocity) {
                console.warn('Satellite creation skipped: missing velocity');
                return null;
            }
        } else {
            console.warn('Satellite creation skipped: missing velocity');
            return null;
        }
        // Convert from meters to simulation units (km * scale)
        const toSimUnits = (v) => v.multiplyScalar(Constants.metersToKm);
        if (safeParams.position) safeParams.position = toSimUnits(safeParams.position);
        if (safeParams.velocity) safeParams.velocity = toSimUnits(safeParams.velocity);
        // Create Three.js satellite
        const sat = this.satellites.addSatellite(safeParams);
        // Register with physics world
        if (sat && this.app.physicsWorld) {
            this.app.physicsWorld.addSatellite({
                id: sat.id,
                position: safeParams.position.clone(),
                velocity: safeParams.velocity.clone(),
                mass: safeParams.mass,
                size: safeParams.size
            });
        }
        return sat;
    }

    /**
     * Remove a satellite by ID.
     * @param {number|string} satelliteId
     */
    removeSatellite(satelliteId) {
        this.satellites.removeSatellite(satelliteId);
        // Remove from physics world
        if (this.app.physicsWorld) {
            this.app.physicsWorld.removeSatellite(satelliteId);
        }
    }

    /**
     * Import simulation state (e.g., from URL or file).
     * @param {Object} state
     */
    importState(state) {
        console.log('Importing state:', state);
        this.satellites.dispose();
        this._restoreTimeState(state);
        this._restoreDisplaySettings(state.displaySettings);
        this._restoreSatellitesArray(state.satellites);
        this._restoreCameraState(state.camera);
    }

    /**
     * Export current simulation state.
     * @returns {Object}
     */
    exportState() {
        return {
            satellites: this._serializeSatellites(),
            camera: this._serializeCameraState(),
            displaySettings: this._serializeDisplaySettings(),
            simulatedTime: this.app.timeUtils.getSimulatedTime().toISOString(),
            timeWarp: this.app.timeUtils.timeWarp
        };
    }

    /**
     * Decode simulation state from the URL hash.
     * @returns {Object|null}
     */
    static decodeFromUrlHash() {
        if (window.location.hash.startsWith('#state=')) {
            try {
                const encoded = window.location.hash.replace('#state=', '');
                const json = LZString.decompressFromEncodedURIComponent(encoded);
                if (json) {
                    const parsed = JSON.parse(json);
                    // Basic validation: must be an object, not an array/function, and only expected keys
                    if (
                        typeof parsed === 'object' &&
                        parsed !== null &&
                        !Array.isArray(parsed) &&
                        Object.keys(parsed).every(key => ['satellites', 'camera', 'displaySettings', 'simulatedTime', 'timeWarp'].includes(key))
                    ) {
                        // Validate satellites
                        if ('satellites' in parsed && !Array.isArray(parsed.satellites)) return null;
                        // Validate camera
                        if ('camera' in parsed && (typeof parsed.camera !== 'object' || parsed.camera === null || Array.isArray(parsed.camera))) return null;
                        // Validate displaySettings
                        if ('displaySettings' in parsed && (typeof parsed.displaySettings !== 'object' || parsed.displaySettings === null || Array.isArray(parsed.displaySettings))) return null;
                        return parsed;
                    }
                }
            } catch (err) {
                alert('Failed to import simulation state from URL: ' + err.message);
                console.error('Import error from URL:', err);
            }
        }
        return null;
    }

    /**
     * Encode simulation state to a URL hash string.
     * @param {Object} state
     * @returns {string}
     */
    static encodeToUrlHash(state) {
        const json = JSON.stringify(state);
        const compressed = LZString.compressToEncodedURIComponent(json);
        return `#state=${compressed}`;
    }

    _restoreTimeState(state) {
        state.simulatedTime && this.app.timeUtils.setSimulatedTime(state.simulatedTime);
        if (state.timeWarp !== undefined) {
            this.app.timeUtils.setTimeWarp(state.timeWarp);
            this.satellites.setTimeWarp(state.timeWarp);
        }
    }

    _restoreDisplaySettings(settings) {
        if (settings && this.app.displaySettingsManager) {
            Object.entries(settings).forEach(([key, value]) => {
                this.app.displaySettingsManager.updateSetting(key, value);
            });
            if (this.app.displaySettingsManager.getSetting('showSatConnections')) {
                // Enable satellite connections via display setting to trigger proper toggles
                this.app.updateDisplaySetting('showSatConnections', true);
            }
        }
    }

    _restoreSatellitesArray(satellites) {
        if (!Array.isArray(satellites)) return;
        satellites.forEach(params => {
            if (
                params.position?.x !== undefined && params.position?.y !== undefined && params.position?.z !== undefined &&
                params.velocity?.x !== undefined && params.velocity?.y !== undefined && params.velocity?.z !== undefined
            ) {
                const sat = this.createSatellite(params);
                if (params.maneuverNodes) {
                    params.maneuverNodes.forEach(nodeData => {
                        const time = new Date(nodeData.time);
                        const dv = new THREE.Vector3(nodeData.dv.x, nodeData.dv.y, nodeData.dv.z);
                        const node = sat.addManeuverNode(time, dv);
                        node.localDV = dv.clone();
                        node.update?.();
                    });
                }
            } else {
                console.warn('Skipped satellite with invalid position/velocity:', params);
            }
        });
    }

    _restoreCameraState(cameraState) {
        if (!cameraState) return;
        const camControls = this.app.cameraControls;
        const { controls, camera } = camControls;
        cameraState.target && controls.target.set(cameraState.target.x, cameraState.target.y, cameraState.target.z);
        cameraState.position && camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
        if (cameraState.spherical) {
            camControls.sphericalRadius = cameraState.spherical.radius;
            camControls.sphericalPhi = cameraState.spherical.phi;
            camControls.sphericalTheta = cameraState.spherical.theta;
            camControls.spherical.set(cameraState.spherical.radius, cameraState.spherical.phi, cameraState.spherical.theta);
        }
        controls.update();
        cameraState.focusedBody ? this.app.updateSelectedBody(cameraState.focusedBody) : camControls.clearCameraTarget();
    }

    _serializeSatellites() {
        return Object.values(this.satellites.getSatellites())
            .filter(sat => sat.position && sat.velocity)
            .map(sat => ({
                id: sat.id,
                name: sat.name,
                position: { x: sat.position.x, y: sat.position.y, z: sat.position.z },
                velocity: { x: sat.velocity.x, y: sat.velocity.y, z: sat.velocity.z },
                mass: sat.mass,
                color: sat.color,
                maneuverNodes: sat.maneuverNodes.map(node => ({
                    time: node.time.toISOString(),
                    dv: {
                        x: node.localDV?.x ?? node.deltaV.x,
                        y: node.localDV?.y ?? node.deltaV.y,
                        z: node.localDV?.z ?? node.deltaV.z
                    }
                }))
            }));
    }

    _serializeCameraState() {
        const camControls = this.app.cameraControls;
        if (!camControls) return undefined;
        return {
            position: { x: camControls.camera.position.x, y: camControls.camera.position.y, z: camControls.camera.position.z },
            target: { x: camControls.controls.target.x, y: camControls.controls.target.y, z: camControls.controls.target.z },
            spherical: { radius: camControls.sphericalRadius, phi: camControls.sphericalPhi, theta: camControls.sphericalTheta },
            focusedBody: (() => {
                const fb = camControls.followTarget;
                if (!fb) return 'none';
                if (fb === this.app.earth) return 'earth';
                if (fb === this.app.moon) return 'moon';
                const sats = this.app.satellites.getSatellites();
                for (const id in sats) if (sats[id] === fb) return `satellite-${id}`;
                return 'none';
            })()
        };
    }

    _serializeDisplaySettings() {
        return this.app.displaySettingsManager ? { ...this.app.displaySettingsManager.settings } : undefined;
    }
} 