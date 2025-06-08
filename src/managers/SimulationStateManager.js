import LZString from 'lz-string';
import * as THREE from 'three';

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
        // Create Three.js satellite
        const sat = this.satellites.addSatellite(safeParams);
        return sat;
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

        this.satellites.dispose();
        this._restoreTimeState(state);
        this._restoreDisplaySettings(state.displaySettings);
        this._restoreSatellitesArray(state.satellites);
        this._restoreCameraState(state.camera);
        // Restore additional state elements
        this._restoreSelectedBody(state.selectedBody);
        this._restoreGroundStations(state.groundStations);
        this._restoreCommunicationLinks(state.communicationLinks);
        this._restoreManeuverExecutions(state.maneuverExecutions);
        this._restoreUIState(state.uiState);
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
            timeWarp: this.app.timeUtils.timeWarp,
            // Additional state elements
            selectedBody: this._serializeSelectedBody(),
            groundStations: this._serializeGroundStations(),
            communicationLinks: this._serializeCommunicationLinks(),
            maneuverExecutions: this._serializeManeuverExecutions(),
            uiState: this._serializeUIState()
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
                        Object.keys(parsed).every(key => ['satellites', 'camera', 'displaySettings', 'simulatedTime', 'timeWarp', 'selectedBody', 'groundStations', 'communicationLinks', 'maneuverExecutions', 'uiState'].includes(key))
                    ) {
                        // Validate satellites
                        if ('satellites' in parsed && !Array.isArray(parsed.satellites)) return null;
                        // Validate camera
                        if ('camera' in parsed && (typeof parsed.camera !== 'object' || parsed.camera === null || Array.isArray(parsed.camera))) return null;
                        // Validate displaySettings
                        if ('displaySettings' in parsed && (typeof parsed.displaySettings !== 'object' || parsed.displaySettings === null || Array.isArray(parsed.displaySettings))) return null;
                        // Validate new optional fields
                        if ('selectedBody' in parsed && parsed.selectedBody !== null && (typeof parsed.selectedBody !== 'object' || Array.isArray(parsed.selectedBody))) return null;
                        if ('groundStations' in parsed && parsed.groundStations !== null && !Array.isArray(parsed.groundStations)) return null;
                        if ('communicationLinks' in parsed && parsed.communicationLinks !== null && !Array.isArray(parsed.communicationLinks)) return null;
                        if ('maneuverExecutions' in parsed && parsed.maneuverExecutions !== null && !Array.isArray(parsed.maneuverExecutions)) return null;
                        if ('uiState' in parsed && parsed.uiState !== null && (typeof parsed.uiState !== 'object' || Array.isArray(parsed.uiState))) return null;
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
        if (state.simulatedTime !== undefined && state.timeWarp !== undefined) {
            this.app.timeUtils.setSimTimeFromServer(state.simulatedTime, state.timeWarp);
        }
        // satellites.setTimeWarp should be handled by server-driven updates
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
            // Validate position and velocity values are finite numbers
            const positionValid = params.position?.x !== undefined && params.position?.y !== undefined && params.position?.z !== undefined &&
                                isFinite(params.position.x) && isFinite(params.position.y) && isFinite(params.position.z);
            
            const velocityValid = params.velocity?.x !== undefined && params.velocity?.y !== undefined && params.velocity?.z !== undefined &&
                                isFinite(params.velocity.x) && isFinite(params.velocity.y) && isFinite(params.velocity.z);
            
            if (positionValid && velocityValid) {
                // Pass all serialized properties to createSatellite, only if they exist
                const satParams = {
                    ...params
                };
                
                // Only include properties that were actually serialized (not undefined)
                if (params.size !== undefined) satParams.size = params.size;
                if (params.crossSectionalArea !== undefined) satParams.crossSectionalArea = params.crossSectionalArea;
                if (params.dragCoefficient !== undefined) satParams.dragCoefficient = params.dragCoefficient;
                if (params.ballisticCoefficient !== undefined) satParams.ballisticCoefficient = params.ballisticCoefficient;
                if (params.centralBodyNaifId !== undefined) satParams.centralBodyNaifId = params.centralBodyNaifId;
                if (params.orbitSimProperties !== undefined) satParams.orbitSimProperties = params.orbitSimProperties;
                if (params.commsConfig !== undefined) satParams.commsConfig = params.commsConfig;
                
                // Log detailed info about what we're trying to create
                console.log(`[SimulationStateManager] Creating satellite from state:`, {
                    id: params.id,
                    position: params.position,
                    velocity: params.velocity,
                    centralBodyNaifId: params.centralBodyNaifId
                });
                
                const sat = this.createSatellite(satParams);
                
                if (!sat) {
                    console.warn('[SimulationStateManager] Failed to create satellite:', params);
                    return;
                }
                
                console.log(`[SimulationStateManager] Successfully created satellite ${sat.id}`);
                
                // Validate satellite was created with valid position/velocity
                if (sat.position && Array.isArray(sat.position.toArray)) {
                    const posArray = sat.position.toArray();
                    const velArray = sat.velocity.toArray();
                    if (!posArray.every(v => isFinite(v)) || !velArray.every(v => isFinite(v))) {
                        console.error(`[SimulationStateManager] Satellite ${sat.id} created with invalid values:`, {
                            position: posArray,
                            velocity: velArray
                        });
                    }
                }
                
                // Restore maneuver nodes
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
                console.warn('[SimulationStateManager] Skipping satellite with invalid position/velocity values:', {
                    id: params.id,
                    position: params.position,
                    velocity: params.velocity,
                    positionValid,
                    velocityValid
                });
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
        cameraState.focusedBody ? this.app.updateSelectedBody(cameraState.focusedBody, true) : camControls.clearCameraTarget();
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
                // Physical properties
                size: sat.size,
                crossSectionalArea: sat.crossSectionalArea,
                dragCoefficient: sat.dragCoefficient,
                ballisticCoefficient: sat.ballisticCoefficient,
                // Orbital properties
                centralBodyNaifId: sat.centralBodyNaifId,
                // Visualization properties
                orbitSimProperties: sat.orbitSimProperties ? {
                    periods: sat.orbitSimProperties.periods,
                    pointsPerPeriod: sat.orbitSimProperties.pointsPerPeriod
                } : undefined,
                // Communications properties
                commsConfig: sat.commsConfig ? {
                    enabled: sat.commsConfig.enabled,
                    preset: sat.commsConfig.preset,
                    antennaGain: sat.commsConfig.antennaGain,
                    transmitPower: sat.commsConfig.transmitPower,
                    dataRate: sat.commsConfig.dataRate,
                    minElevationAngle: sat.commsConfig.minElevationAngle,
                    frequency: sat.commsConfig.frequency,
                    receiverSensitivity: sat.commsConfig.receiverSensitivity,
                    antennaPattern: sat.commsConfig.antennaPattern
                } : undefined,
                // Maneuver nodes
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

    // Additional serialization methods
    _serializeSelectedBody() {
        if (!this.app.selectedBody) return null;
        return {
            naifId: this.app.selectedBody.naifId,
            name: this.app.selectedBody.name
        };
    }

    _serializeGroundStations() {
        // Ground stations are typically loaded from config and don't need full serialization
        // Just track which ones are active/visible
        const groundStations = this.app.groundStations;
        if (!groundStations || !Array.isArray(groundStations)) return null;
        
        return groundStations
            .filter(station => station.visible !== false)
            .map(station => ({
                id: station.id,
                visible: station.visible,
                // Add any custom properties that might have been modified
            }));
    }

    _serializeCommunicationLinks() {
        // Serialize active communication links
        const commsManager = this.app.satelliteCommsManager;
        if (!commsManager) return null;
        
        const links = [];
        if (commsManager.activeConnections) {
            commsManager.activeConnections.forEach((connections, satelliteId) => {
                connections.forEach(conn => {
                    links.push({
                        satelliteId,
                        targetId: conn.targetId,
                        type: conn.type,
                        // Don't serialize computed values like signal strength
                    });
                });
            });
        }
        return links;
    }

    _serializeManeuverExecutions() {
        // Serialize any in-progress maneuver executions
        const maneuverManager = this.app.maneuverManager;
        if (!maneuverManager) return null;
        
        const executions = [];
        // Check if there are any active maneuver executions
        if (maneuverManager.activeExecutions) {
            maneuverManager.activeExecutions.forEach((execution, nodeId) => {
                executions.push({
                    nodeId,
                    satelliteId: execution.satelliteId,
                    startTime: execution.startTime,
                    progress: execution.progress,
                    // Other execution state
                });
            });
        }
        return executions;
    }

    _serializeUIState() {
        // Serialize relevant UI state
        return {
            // Open windows/panels
            satelliteDebugWindows: this._getOpenSatelliteDebugWindows(),
            maneuverWindows: this._getOpenManeuverWindows(),
            // Selected objects
            selectedSatelliteId: this.app.selectedSatelliteId,
            // Active modes
            maneuverMode: this.app.maneuverMode,
            // Add other UI state as needed
        };
    }

    _getOpenSatelliteDebugWindows() {
        // This would need to be tracked by the UI components
        // For now, return empty array
        return [];
    }

    _getOpenManeuverWindows() {
        // This would need to be tracked by the UI components
        // For now, return empty array
        return [];
    }

    // Additional restoration methods
    _restoreSelectedBody(selectedBody) {
        if (!selectedBody || !selectedBody.naifId) return;
        
        // Find the body by NAIF ID
        const body = this.app.bodiesByNaifId?.[selectedBody.naifId];
        if (body) {
            this.app.updateSelectedBody(body);
        }
    }

    _restoreGroundStations(groundStations) {
        // Ground stations are loaded from config, so we just restore visibility
        if (!groundStations || !Array.isArray(groundStations)) return;
        
        // This would need implementation in the ground station manager
        // For now, just log
        console.log('[SimulationStateManager] Ground station state restoration not yet implemented');
    }

    _restoreCommunicationLinks(links) {
        if (!links || !Array.isArray(links)) return;
        
        // Communication links will be rebuilt automatically based on satellite positions
        // But we could force a rebuild here if needed
        if (this.app.satelliteCommsManager) {
            // Force update of all connections after satellites are loaded
            this._commsUpdateTimeout = setTimeout(() => {
                // Get current satellites and recalculate communication links
                const satellites = Array.from(this.app.physicsIntegration?.physicsEngine?.satellites?.values() || []);
                const bodies = this.app.physicsIntegration?.physicsEngine?.bodies || {};
                
                if (satellites.length > 0) {
                    this.app.satelliteCommsManager.calculateCommunicationLinks(satellites, bodies);
                    console.log('[SimulationStateManager] Recalculated communication links for imported state');
                }
                this._commsUpdateTimeout = null;
            }, 1000); // Delay to ensure satellites are loaded
        }
    }

    _restoreManeuverExecutions(executions) {
        if (!executions || !Array.isArray(executions)) return;
        
        // Restore any in-progress maneuver executions
        // This would need implementation in the maneuver manager
        console.log('[SimulationStateManager] Maneuver execution restoration not yet implemented');
    }

    _restoreUIState(uiState) {
        if (!uiState) return;
        
        // Restore UI state elements
        if (uiState.selectedSatelliteId) {
            // Select the satellite after a delay to ensure it's loaded
            this._uiRestoreTimeout = setTimeout(() => {
                const satellite = this.satellites.getSatellite(uiState.selectedSatelliteId);
                if (satellite) {
                    // Trigger satellite selection
                    this.app.selectedSatelliteId = uiState.selectedSatelliteId;
                }
                this._uiRestoreTimeout = null;
            }, 500);
        }
        
        // Restore other UI state as needed
        if (uiState.maneuverMode !== undefined) {
            this.app.maneuverMode = uiState.maneuverMode;
        }
    }

    /**
     * Cleanup method to dispose of resources and prevent memory leaks
     */
    dispose() {
        // Clear any pending timeouts
        if (this._commsUpdateTimeout) {
            clearTimeout(this._commsUpdateTimeout);
            this._commsUpdateTimeout = null;
        }
        
        if (this._uiRestoreTimeout) {
            clearTimeout(this._uiRestoreTimeout);
            this._uiRestoreTimeout = null;
        }
        
        // Clear references
        this.app = null;
        this.satellites = null;
    }
} 