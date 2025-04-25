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
        const toSimUnits = (v) => v.multiplyScalar(Constants.metersToKm * Constants.scale);
        if (safeParams.position) safeParams.position = toSimUnits(safeParams.position);
        if (safeParams.velocity) safeParams.velocity = toSimUnits(safeParams.velocity);
        return this.satellites.addSatellite(safeParams);
    }

    /**
     * Remove a satellite by ID.
     * @param {number|string} satelliteId
     */
    removeSatellite(satelliteId) {
        this.satellites.removeSatellite(satelliteId);
    }

    /**
     * Import simulation state (e.g., from URL or file).
     * @param {Object} state
     */
    importState(state) {
        console.log('Importing state:', state);
        // Clear existing satellites and physics
        this.satellites.dispose();
        // Restore simulation time
        if (state.simulatedTime) {
            this.app.timeUtils.setSimulatedTime(state.simulatedTime);
        }
        // Restore time warp for simulation and physics
        if (state.timeWarp !== undefined) {
            this.app.timeUtils.setTimeWarp(state.timeWarp);
            this.satellites.setTimeWarp(state.timeWarp);
        }
        // Restore display settings
        if (state.displaySettings && this.app.displaySettingsManager) {
            Object.entries(state.displaySettings).forEach(([key, value]) => {
                this.app.displaySettingsManager.updateSetting(key, value);
            });
            if (this.app.displaySettingsManager.getSetting('showSatConnections')) {
                this.app._handleShowSatConnectionsChange(true);
                this.app._updateConnectionsWorkerSatellites();
            }
        }
        // Create satellites
        if (state.satellites && Array.isArray(state.satellites)) {
            state.satellites.forEach(params => {
                if (
                    params.position && typeof params.position.x === 'number' && typeof params.position.y === 'number' && typeof params.position.z === 'number' &&
                    params.velocity && typeof params.velocity.x === 'number' && typeof params.velocity.y === 'number' && typeof params.velocity.z === 'number'
                ) {
                    const sat = this.createSatellite(params);
                    // Restore maneuver nodes if present
                    if (params.maneuverNodes && Array.isArray(params.maneuverNodes)) {
                        params.maneuverNodes.forEach(nodeData => {
                            const time = new Date(nodeData.time);
                            const dv = new THREE.Vector3(nodeData.dv.x, nodeData.dv.y, nodeData.dv.z);
                            const node = sat.addManeuverNode(time, dv);
                            // Store localDV for consistent editing
                            node.localDV = dv.clone();
                            // Initialize node visualization
                            if (typeof node.update === 'function') {
                                node.update();
                            }
                        });
                    }
                } else {
                    console.warn('Skipped satellite with invalid position/velocity:', params);
                }
            });
        }
        // Restore camera state from saved state
        if (state.camera) {
            const camControls = this.app.cameraControls;
            const controls = camControls.controls;
            const camera = camControls.camera;
            // Set control target
            if (state.camera.target) {
                controls.target.set(
                    state.camera.target.x,
                    state.camera.target.y,
                    state.camera.target.z
                );
            }
            // Set camera position
            if (state.camera.position) {
                camera.position.set(
                    state.camera.position.x,
                    state.camera.position.y,
                    state.camera.position.z
                );
            }
            // Restore spherical coordinates for orbit controls
            if (state.camera.spherical) {
                camControls.sphericalRadius = state.camera.spherical.radius;
                camControls.sphericalPhi = state.camera.spherical.phi;
                camControls.sphericalTheta = state.camera.spherical.theta;
                camControls.spherical.set(
                    state.camera.spherical.radius,
                    state.camera.spherical.phi,
                    state.camera.spherical.theta
                );
            }
            // Apply control update
            controls.update();
            // Focus the loaded body if specified, otherwise clear target
            if (state.camera.focusedBody) {
                this.app.updateSelectedBody(state.camera.focusedBody);
            } else {
                camControls.clearCameraTarget();
            }
        }
        // Add more state import logic as needed
    }

    /**
     * Export current simulation state.
     * @returns {Object}
     */
    exportState() {
        const satellites = Object.values(this.satellites.getSatellites()).map(sat => {
            // Only export if position and velocity are valid
            if (
                sat.position && typeof sat.position.x === 'number' && typeof sat.position.y === 'number' && typeof sat.position.z === 'number' &&
                sat.velocity && typeof sat.velocity.x === 'number' && typeof sat.velocity.y === 'number' && typeof sat.velocity.z === 'number'
            ) {
                return {
                    id: sat.id,
                    name: sat.name,
                    position: { x: sat.position.x, y: sat.position.y, z: sat.position.z },
                    velocity: { x: sat.velocity.x, y: sat.velocity.y, z: sat.velocity.z },
                    mass: sat.mass,
                    color: sat.color,
                    // Include maneuver nodes for persistence
                    maneuverNodes: sat.maneuverNodes.map(node => ({
                        time: node.time.toISOString(),
                        dv: {
                            x: node.localDV ? node.localDV.x : node.deltaV.x,
                            y: node.localDV ? node.localDV.y : node.deltaV.y,
                            z: node.localDV ? node.localDV.z : node.deltaV.z
                        }
                    })),
                    // Add more satellite properties as needed
                };
            }
            return null;
        }).filter(Boolean);
        // Save camera and focus state
        let camera = undefined;
        const camControls = this.app.cameraControls;
        if (camControls) {
            camera = {
                position: {
                    x: camControls.camera.position.x,
                    y: camControls.camera.position.y,
                    z: camControls.camera.position.z
                },
                target: {
                    x: camControls.controls.target.x,
                    y: camControls.controls.target.y,
                    z: camControls.controls.target.z
                },
                spherical: {
                    radius: camControls.sphericalRadius,
                    phi: camControls.sphericalPhi,
                    theta: camControls.sphericalTheta
                },
                focusedBody: (() => {
                    // Try to infer the focused body from followingBody
                    if (!camControls.followingBody) return 'none';
                    if (camControls.followingBody === this.app.earth) return 'earth';
                    if (camControls.followingBody === this.app.moon) return 'moon';
                    // Try to find satellite id
                    const sats = this.app.satellites.getSatellites();
                    for (const id in sats) {
                        if (sats[id] === camControls.followingBody) {
                            return `satellite-${id}`;
                        }
                    }
                    return 'none';
                })()
            };
        }
        // Save display settings
        let displaySettings = undefined;
        if (this.app.displaySettingsManager) {
            displaySettings = { ...this.app.displaySettingsManager.settings };
        }
        return {
            satellites,
            camera,
            displaySettings,
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
} 