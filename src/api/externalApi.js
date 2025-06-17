/**
 * Space Mission Agent API - Thin event-driven wrapper for AI agent
 * This provides a simplified API interface that delegates to existing services
 * and communicates via events rather than doing heavy lifting
 * @param {App3D} app3d - The App3D instance.
 */
export function setupExternalApi(app3d) {
    // Simple event emitter for API events
    class APIEventEmitter {
        constructor() {
            this._events = {};
        }
        
        on(event, listener) {
            if (!this._events[event]) this._events[event] = [];
            this._events[event].push(listener);
            return this;
        }
        
        emit(event, ...args) {
            if (!this._events[event]) return false;
            this._events[event].forEach(listener => listener(...args));
            return true;
        }
    }

    const apiEvents = new APIEventEmitter();

    // Helper to extract satellite ID from various input formats
    function extractSatelliteId(input) {
        if (typeof input === 'object' && input !== null) {
            return String(input.id || input.satelliteId || input.name || input);
        }
        return String(input);
    }

    // Helper to serialize satellite data for external consumption
    function serializeSatellite(sat) {
        return sat ? { id: sat.id, name: sat.name } : null;
    }

    window.api = {
        // Event system for external monitoring
        events: apiEvents,

        // ═══════════════════════════════════════════════════════════════════
        // SATELLITE CREATION - Unified satellite creation methods
        // ═══════════════════════════════════════════════════════════════════
        
        /**
         * Unified satellite creation method - routes to appropriate method based on mode
         */
        createSatellite: async (params) => {
            try {
                if (params.mode === 'latlon') {
                    if (params.circular) {
                        return await window.api.createSatelliteFromLatLonCircular(params);
                    } else {
                        return await window.api.createSatelliteFromLatLon(params);
                    }
                } else if (params.mode === 'orbital') {
                    return await window.api.createSatelliteFromOrbitalElements(params);
                } else {
                    return { success: false, error: 'Unknown satellite creation mode. Use "latlon" or "orbital".' };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Create satellite from orbital elements - delegates to physics engine
         */
        createSatelliteFromOrbitalElements: async (params) => {
            try {
                if (!app3d?.physicsIntegration?.physicsEngine) {
                    return { success: false, error: 'Physics engine not available' };
                }

                apiEvents.emit('satelliteCreationStarted', { type: 'orbitalElements', params });

                const naifId = params.centralBodyNaifId || params.planetNaifId || app3d.selectedBody?.naifId || 399;
                const physicsResult = app3d.physicsIntegration.physicsEngine.createSatelliteFromOrbitalElements(params, naifId);

                // Create UI satellite
                const uiSatellite = await app3d.satellites.createUISatellite(physicsResult.id, {
                    planetConfig: app3d.bodiesByNaifId?.[naifId] || { naifId },
                    color: params.color,
                    name: params.name
                });

                const response = { 
                    success: true, 
                    satellite: serializeSatellite(uiSatellite),
                    message: `Satellite created from orbital elements`
                };
                apiEvents.emit('satelliteCreated', response);
                return response;
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('satelliteCreationFailed', response);
                return response;
            }
        },

        /**
         * Create satellite from geographical position - delegates to physics engine  
         */
        createSatelliteFromLatLon: async (params) => {
            try {
                if (!app3d?.physicsIntegration?.physicsEngine) {
                    return { success: false, error: 'Physics engine not available' };
                }

                apiEvents.emit('satelliteCreationStarted', { type: 'latLon', params });

                const naifId = params.centralBodyNaifId || params.planetNaifId || app3d.selectedBody?.naifId || 399;
                const physicsResult = app3d.physicsIntegration.physicsEngine.createSatelliteFromGeographic(params, naifId);

                // Create UI satellite
                const uiSatellite = await app3d.satellites.createUISatellite(physicsResult.id, {
                    planetConfig: app3d.bodiesByNaifId?.[naifId] || { naifId },
                    color: params.color,
                    name: params.name
                });

                const response = { 
                    success: true, 
                    satellite: serializeSatellite(uiSatellite),
                    message: `Satellite created at ${params.latitude}°, ${params.longitude}°`
                };
                apiEvents.emit('satelliteCreated', response);
                return response;
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('satelliteCreationFailed', response);
                return response;
            }
        },

        /**
         * Create satellite from geographical position with circular orbit
         */
        createSatelliteFromLatLonCircular: async (params) => {
            try {
                apiEvents.emit('satelliteCreationStarted', { type: 'latLonCircular', params });

                // Circular orbit is just a special case of lat/lon with circular=true
                const result = await window.api.createSatelliteFromLatLon({ ...params, circular: true });
                
                if (result.success) {
                    const response = { 
                        ...result,
                        message: `Satellite created in circular orbit`
                    };
                    apiEvents.emit('satelliteCreated', response);
                    return response;
                } else {
                    throw new Error(result.error || 'Failed to create satellite');
                }
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('satelliteCreationFailed', response);
                return response;
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // SATELLITE MANAGEMENT - Delegates to SatelliteManager
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get list of all satellites - delegates to SatelliteManager
         */
        getSatellites: () => {
            try {
                if (!app3d?.satellites) {
                    return { success: false, error: 'Satellite manager not available' };
                }

                const satellites = [];
                const satelliteMap = app3d.satellites.getSatellitesMap();
                
                satelliteMap.forEach((satellite) => {
                    satellites.push({
                        id: satellite.id,
                        name: satellite.name,
                        color: satellite.color,
                        centralBodyNaifId: satellite.centralBodyNaifId
                    });
                });
                
                const response = { success: true, satellites };
                apiEvents.emit('satellitesQueried', response);
                return response;
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get detailed information about a specific satellite
         */
        getSatellite: (id) => {
            try {
                const satelliteId = extractSatelliteId(id);
                
                if (!app3d?.satellites) {
                    return { success: false, error: 'Satellite manager not available' };
                }

                const satellites = app3d.satellites.getSatellitesMap();
                const satellite = satellites.get(satelliteId);
                
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }
                
                const response = { 
                    success: true, 
                    satellite: {
                        id: satellite.id,
                        name: satellite.name,
                        color: satellite.color,
                        centralBodyNaifId: satellite.centralBodyNaifId
                    }
                };
                apiEvents.emit('satelliteQueried', response);
                return response;
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete a satellite - delegates to SatelliteManager
         */
        deleteSatellite: (id) => {
            try {
                const satelliteId = extractSatelliteId(id);
                
                if (!app3d?.satellites) {
                    return { success: false, error: 'Satellite manager not available' };
                }

                const satellites = app3d.satellites.getSatellitesMap();
                const satellite = satellites.get(satelliteId);
                
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }
                
                apiEvents.emit('satelliteDeletionStarted', { satelliteId });
                
                satellite.delete();
                
                const response = { success: true, message: `Satellite ${satelliteId} deleted` };
                apiEvents.emit('satelliteDeleted', response);
                return response;
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('satelliteDeletionFailed', response);
                return response;
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // SIMULATION CONTROL - Delegates to SimulationController
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get current simulation time - delegates to TimeUtils
         */
        getSimulationTime: () => {
            try {
                if (!app3d?.timeUtils) {
                    return { success: false, error: 'Time utilities not available' };
                }

                const time = app3d.timeUtils.getSimulatedTime();
                return { 
                    success: true, 
                    time: time ? new Date(time).toISOString() : null,
                    timestamp: time ? new Date(time).getTime() : null
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Set simulation time - delegates to TimeUtils
         */
        setSimulationTime: (time) => {
            try {
                if (!app3d?.timeUtils) {
                    return { success: false, error: 'Time utilities not available' };
                }

                let targetTime;
                if (typeof time === 'string') {
                    targetTime = new Date(time);
                } else if (time instanceof Date) {
                    targetTime = time;
                } else if (typeof time === 'number') {
                    targetTime = new Date(time);
                } else {
                    return { success: false, error: 'Invalid time format' };
                }

                apiEvents.emit('timeChangeStarted', { targetTime: targetTime.toISOString() });
                
                app3d.timeUtils.setSimulatedTime(targetTime);
                
                const response = { success: true, time: targetTime.toISOString() };
                apiEvents.emit('timeChanged', response);
                return response;
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('timeChangeFailed', response);
                return response;
            }
        },

        /**
         * Set time warp factor - delegates to SimulationController
         */
        setTimeWarp: (factor) => {
            try {
                if (typeof factor !== 'number' || factor <= 0 || isNaN(factor)) {
                    return { success: false, error: 'Time warp must be a positive number' };
                }

                if (!app3d?.simulationController) {
                    return { success: false, error: 'Simulation controller not available' };
                }

                apiEvents.emit('timeWarpChangeStarted', { factor });
                
                app3d.simulationController.setTimeWarp(factor);
                
                const response = { success: true, timeWarp: factor };
                apiEvents.emit('timeWarpChanged', response);
                return response;
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('timeWarpChangeFailed', response);
                return response;
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // CELESTIAL BODIES - Delegates to existing body data
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get list of available celestial bodies
         */
        getCelestialBodies: () => {
            try {
                const bodies = [];
                
                if (app3d?.celestialBodies) {
                    app3d.celestialBodies.forEach(body => {
                        bodies.push({
                            name: body.name,
                            naifId: body.naifId || body.naif_id,
                            type: body.type,
                            radius: body.radius,
                            mass: body.mass
                        });
                    });
                }
                
                return { success: true, bodies };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Focus camera on target - delegates to SmartCamera
         */
        focusCamera: (target) => {
            try {
                if (!app3d?.cameraControls?.follow) {
                    return { success: false, error: 'Camera control not available' };
                }

                apiEvents.emit('cameraFocusStarted', { target });
                
                app3d.cameraControls.follow(target, app3d, true);
                
                const response = { success: true, target };
                apiEvents.emit('cameraFocused', response);
                return response;
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('cameraFocusFailed', response);
                return response;
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // COMMUNICATIONS - Delegates to CommunicationsService
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get communication status for a satellite
         */
        getSatelliteComms: (satelliteId) => {
            try {
                const id = extractSatelliteId(satelliteId);
                
                if (!app3d?.communicationsService) {
                    return { success: false, error: 'Communications service not available' };
                }

                const comms = app3d.communicationsService.getSatelliteComms(id);
                return { success: true, comms };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Update communication configuration - delegates to CommunicationsService
         */
        updateCommsConfig: (satelliteId, config) => {
            try {
                const id = extractSatelliteId(satelliteId);
                
                if (!app3d?.communicationsService) {
                    return { success: false, error: 'Communications service not available' };
                }

                apiEvents.emit('commsConfigUpdateStarted', { satelliteId: id, config });
                
                const updatedConfig = app3d.communicationsService.updateSatelliteCommsConfig(id, config);
                
                const response = { success: true, config: updatedConfig };
                apiEvents.emit('commsConfigUpdated', response);
                return response;
            } catch (error) {
                const response = { success: false, error: error.message };
                apiEvents.emit('commsConfigUpdateFailed', response);
                return response;
            }
        },

        /**
         * Get all available communication presets - delegates to CommunicationsService
         */
        getCommsPresets: () => {
            try {
                if (!app3d?.communicationsService) {
                    return { success: false, error: 'Communications service not available' };
                }

                const presets = app3d.communicationsService.getPresets();
                
                const response = { success: true, presets };
                apiEvents.emit('commsPresetsQueried', response);
                return response;
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Apply communication preset - delegates to CommunicationsService
         */
        applyCommsPreset: (satelliteId, presetName) => {
            try {
                const id = extractSatelliteId(satelliteId);
                
                if (!app3d?.communicationsService) {
                    return { success: false, error: 'Communications service not available' };
                }

                const presets = app3d.communicationsService.getPresets();
                const preset = presets[presetName];
                
                if (!preset) {
                    return { 
                        success: false, 
                        error: `Preset '${presetName}' not found. Available: ${Object.keys(presets).join(', ')}` 
                    };
                }

                return window.api.updateCommsConfig(id, preset);
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // SPECIALIZED SERVICES - Direct delegation
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get ground track - delegates to GroundTrackService
         */
        getGroundTrack: async (id, options = {}) => {
            try {
                if (!app3d?.groundTrackService) {
                    return { success: false, error: 'Ground track service not available' };
                }

                return await app3d.groundTrackService.getGroundTrack(id, options);
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get POI visibility - delegates to POIVisibilityService
         */
        getPOIVisibility: async (options = {}) => {
            try {
                if (!app3d?.poiVisibilityService) {
                    return { success: false, error: 'POI visibility service not available' };
                }

                return await app3d.poiVisibilityService.getPOIVisibility(options);
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // DIAGNOSTICS - Minimal system status
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Test API connectivity and return basic system status
         */
        testAPI: () => {
            try {
                const services = {
                    satellites: !!app3d?.satellites,
                    physics: !!app3d?.physicsIntegration,
                    communications: !!app3d?.communicationsService,
                    timeUtils: !!app3d?.timeUtils,
                    groundTrack: !!app3d?.groundTrackService,
                    poiVisibility: !!app3d?.poiVisibilityService,
                    simulation: !!app3d?.simulationController
                };

                const response = {
                    success: true,
                    timestamp: new Date().toISOString(),
                    apiVersion: '4.0-thin',
                    services,
                    satelliteCount: app3d?.satellites?.getSatellitesMap()?.size || 0
                };

                apiEvents.emit('apiTested', response);
                return response;
            } catch (error) {
                return { success: false, error: error.message };
            }
        }
    };

    // Listen to system events and forward relevant ones to API consumers
    const systemEventMap = {
        'satelliteAdded': 'satelliteAdded',
        'satelliteRemoved': 'satelliteRemoved', 
        'timeUpdate': 'timeUpdated',
        'physicsUpdate': 'physicsUpdated'
    };

    Object.entries(systemEventMap).forEach(([systemEvent, apiEvent]) => {
        window.addEventListener(systemEvent, (event) => {
            apiEvents.emit(apiEvent, event.detail);
        });
    });

    // Emit API ready event
    setTimeout(() => {
        apiEvents.emit('apiReady', { 
            version: '4.0-thin',
            timestamp: new Date().toISOString() 
        });
    }, 0);
} 