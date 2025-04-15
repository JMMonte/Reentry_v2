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
        if (state && Array.isArray(state.satellites)) {
            state.satellites.forEach(params => {
                if (
                    params &&
                    params.position && typeof params.position.x === 'number' && typeof params.position.y === 'number' && typeof params.position.z === 'number' &&
                    params.velocity && typeof params.velocity.x === 'number' && typeof params.velocity.y === 'number' && typeof params.velocity.z === 'number'
                ) {
                    this.createSatellite(params);
                } else {
                    console.warn('Skipped satellite with invalid position/velocity:', params);
                }
            });
        }
        // Restore camera and focus state if present
        if (state && state.camera) {
            const { position, target, spherical, focusedBody } = state.camera;
            const camControls = this.app.cameraControls;
            if (camControls && position && target && spherical) {
                // Set camera position
                camControls.camera.position.set(position.x, position.y, position.z);
                // Set controls target
                camControls.controls.target.set(target.x, target.y, target.z);
                // Set spherical coordinates
                camControls.spherical.radius = spherical.radius;
                camControls.spherical.phi = spherical.phi;
                camControls.spherical.theta = spherical.theta;
                camControls.sphericalRadius = spherical.radius;
                camControls.sphericalPhi = spherical.phi;
                camControls.sphericalTheta = spherical.theta;
                camControls.controls.update();
            }
            // Restore focused body
            if (typeof focusedBody !== 'undefined' && camControls) {
                // Use the same logic as updateSelectedBody
                if (!focusedBody || focusedBody === 'none') {
                    camControls.clearCameraTarget();
                } else if (focusedBody === 'earth') {
                    camControls.updateCameraTarget(this.app.earth);
                } else if (focusedBody === 'moon') {
                    camControls.updateCameraTarget(this.app.moon);
                } else if (typeof focusedBody === 'string' && focusedBody.startsWith('satellite-')) {
                    const satelliteId = parseInt(focusedBody.split('-')[1]);
                    const satellite = this.app.satellites.getSatellites()[satelliteId];
                    if (satellite) {
                        camControls.updateCameraTarget(satellite);
                    }
                }
            }
        }
        // Restore display settings if present
        if (state && state.displaySettings && this.app.displaySettingsManager) {
            Object.entries(state.displaySettings).forEach(([key, value]) => {
                this.app.displaySettingsManager.updateSetting(key, value);
            });
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
        return { satellites, camera, displaySettings };
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
                    return JSON.parse(json);
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