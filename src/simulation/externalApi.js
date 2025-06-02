/**
 * Space Mission Agent API - Comprehensive control interface for AI agent
 * This attaches a comprehensive API to window.api for AI to manage space missions.
 * @param {App3D} app3d - The App3D instance.
 */
export function setupExternalApi(app3d) {
    function serializeSatellite(sat) {
        return sat ? { id: sat.id, name: sat.name } : null;
    }

    function getBodyName(naifId) {
        // Try to get body name from physics engine data manager
        if (app3d?.physicsIntegration?.solarSystemDataManager) {
            const body = app3d.physicsIntegration.solarSystemDataManager.getBodyByNaif(parseInt(naifId));
            if (body && body.name) return body.name;
        }
        
        // Try to get from celestial bodies array
        if (app3d?.celestialBodies) {
            const body = app3d.celestialBodies.find(b => 
                (b.naifId || b.naif_id) === parseInt(naifId)
            );
            if (body && body.name) return body.name;
        }
        
        // Fallback to common body names
        const commonBodies = {
            10: 'Sun', 199: 'Mercury', 299: 'Venus', 399: 'Earth', 301: 'Moon',
            499: 'Mars', 401: 'Phobos', 402: 'Deimos', 599: 'Jupiter',
            699: 'Saturn', 799: 'Uranus', 899: 'Neptune', 999: 'Pluto'
        };
        return commonBodies[parseInt(naifId)] || `Body ${naifId}`;
    }

    function getAllAvailableBodies() {
        const bodies = [];
        
        // Method 1: Get from physics engine data manager
        if (app3d?.physicsIntegration?.solarSystemDataManager) {
            try {
                const bodyMap = app3d.physicsIntegration.solarSystemDataManager.bodies;
                if (bodyMap && bodyMap.values) {
                    Array.from(bodyMap.values()).forEach(body => {
                        bodies.push({
                            name: body.name,
                            naifId: body.naifId,
                            type: body.type,
                            radius: body.radius,
                            mass: body.mass,
                            mu: body.mu,
                            parent: body.parent,
                            hasAtmosphere: !!body.atmosphere,
                            soiRadius: body.soiRadius
                        });
                    });
                }
            } catch (error) {
                console.warn('Could not get bodies from physics engine:', error);
            }
        }
        
        // Method 2: Get from app3d.celestialBodies (fallback)
        if (bodies.length === 0 && app3d?.celestialBodies) {
            app3d.celestialBodies.forEach(body => {
                bodies.push({
                    name: body.name,
                    naifId: body.naifId || body.naif_id,
                    type: body.type,
                    radius: body.radius,
                    mass: body.mass,
                    mu: body.mu,
                    soiRadius: body.soiRadius,
                    hasAtmosphere: !!body.atmosphere,
                    parent: body.parent
                });
            });
        }
        
        return bodies;
    }

    window.api = {
        // ═══════════════════════════════════════════════════════════════════
        // SATELLITE CREATION - Modern unified interface
        // ═══════════════════════════════════════════════════════════════════
        
        /**
         * Create satellite from orbital elements (Keplerian)
         * @param {Object} params - {name, mass, size, semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly, centralBodyNaifId?}
         */
        createSatelliteFromOrbitalElements: (params) => {
            try {
                const result = app3d.createSatelliteFromOrbitalElements(params);
                return { success: true, satellite: serializeSatellite(result?.satellite || result) };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Create satellite from geographical position with custom velocity
         * @param {Object} params - {name, mass, size, latitude, longitude, altitude, velocity, azimuth, angleOfAttack}
         */
        createSatelliteFromLatLon: (params) => {
            try {
                const result = app3d.createSatelliteFromLatLon(params);
                return { success: true, satellite: serializeSatellite(result?.satellite || result) };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Create satellite from geographical position with circular orbit
         * @param {Object} params - {name, mass, size, latitude, longitude, altitude}
         */
        createSatelliteFromLatLonCircular: (params) => {
            try {
                const result = app3d.createSatelliteFromLatLonCircular(params);
                return { success: true, satellite: serializeSatellite(result?.satellite || result) };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // SATELLITE MANAGEMENT
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get list of all satellites with detailed information
         * @returns {Array} Array of satellite objects with physics data
         */
        getSatellites: () => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const result = [];

                satellites.forEach((satellite, id) => {
                    // Try multiple ways to get physics data
                    let physics = null;
                    
                    // Method 1: Direct from physics integration
                    if (app3d?.physicsIntegration?.getSatelliteState) {
                        physics = app3d.physicsIntegration.getSatelliteState(String(id));
                    }
                    
                    // Method 2: From cached physics states (if available)
                    if (!physics && window.physicsStates) {
                        physics = window.physicsStates[String(id)];
                    }
                    
                    // Method 3: Basic satellite data only
                    if (!physics) {
                        physics = { mass: satellite.mass, size: satellite.size };
                    }
                    const satData = {
                        // Basic properties
                        id: satellite.id,
                        name: satellite.name,
                        color: satellite.color,
                        
                        // Physical properties
                        mass: physics?.mass || satellite.mass,
                        size: physics?.size,
                        crossSectionalArea: physics?.crossSectionalArea,
                        dragCoefficient: physics?.dragCoefficient,
                        ballisticCoefficient: physics?.ballisticCoefficient,
                        
                        // Orbital properties
                        centralBody: getBodyName(physics?.centralBodyNaifId || satellite.centralBodyNaifId),
                        centralBodyNaifId: physics?.centralBodyNaifId || satellite.centralBodyNaifId,
                        
                        // Position data
                        position: physics?.position ? {
                            x: physics.position[0],
                            y: physics.position[1], 
                            z: physics.position[2]
                        } : null,
                        velocity: physics?.velocity ? {
                            x: physics.velocity[0],
                            y: physics.velocity[1],
                            z: physics.velocity[2]
                        } : null,
                        
                        // Geographic coordinates
                        latitude: physics?.lat,
                        longitude: physics?.lon,
                        surfaceAltitude: physics?.altitude_surface,
                        radialAltitude: physics?.altitude_radial,
                        groundTrackVelocity: physics?.ground_track_velocity,
                        
                        // Orbital elements
                        orbitalElements: physics?.orbitalElements ? {
                            semiMajorAxis: physics.orbitalElements.semiMajorAxis,
                            eccentricity: physics.orbitalElements.eccentricity,
                            inclination: physics.orbitalElements.inclination,
                            raan: physics.orbitalElements.raan,
                            argumentOfPeriapsis: physics.orbitalElements.argumentOfPeriapsis,
                            trueAnomaly: physics.orbitalElements.trueAnomaly,
                            meanAnomaly: physics.orbitalElements.meanAnomaly,
                            period: physics.orbitalElements.period
                        } : null,
                        
                        // Status
                        lastUpdate: physics?.lastUpdate
                    };
                    
                    result.push(satData);
                });
                
                return { success: true, satellites: result };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get detailed information about a specific satellite
         * @param {string|number} id - Satellite ID
         */
        getSatellite: (id) => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(String(id));
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
                }
                
                // Use the same logic as getSatellites but for single satellite
                const allSats = window.api.getSatellites();
                if (!allSats.success) return allSats;
                
                const satData = allSats.satellites.find(s => s.id === String(id));
                return { success: true, satellite: satData };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete a satellite
         * @param {string|number} id - Satellite ID
         */
        deleteSatellite: (id) => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(String(id));
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
                }
                
                satellite.delete();
                return { success: true, message: `Satellite ${id} deleted` };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // SIMULATION CONTROL
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get current simulation time
         */
        getSimulationTime: () => {
            try {
                const time = app3d?.timeUtils?.getSimulatedTime();
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
         * Set simulation time
         * @param {string|Date|number} time - ISO string, Date object, or timestamp
         */
        setSimulationTime: (time) => {
            try {
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

                if (app3d?.timeUtils?.setSimulatedTime) {
                    app3d.timeUtils.setSimulatedTime(targetTime);
                    return { success: true, time: targetTime.toISOString() };
                } else {
                    return { success: false, error: 'Time control not available' };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get current time warp factor
         */
        getTimeWarp: () => {
            try {
                const warp = app3d?.timeUtils?.getTimeWarp() || 1;
                return { success: true, timeWarp: warp };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Set time warp factor
         * @param {number} factor - Time warp multiplier
         */
        setTimeWarp: (factor) => {
            try {
                if (typeof factor !== 'number' || factor <= 0) {
                    return { success: false, error: 'Time warp must be a positive number' };
                }

                if (app3d?.simulationController?.setTimeWarp) {
                    app3d.simulationController.setTimeWarp(factor);
                    return { success: true, timeWarp: factor };
                } else {
                    return { success: false, error: 'Time warp control not available' };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // CELESTIAL BODIES
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get list of available celestial bodies
         */
        getCelestialBodies: () => {
            try {
                const bodies = getAllAvailableBodies();
                return { success: true, bodies };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Focus camera on a celestial body or satellite
         * @param {string} target - Body name or satellite ID
         */
        focusCamera: (target) => {
            try {
                if (app3d?.cameraControls?.follow) {
                    app3d.cameraControls.follow(target, app3d, true);
                    return { success: true, target };
                } else {
                    return { success: false, error: 'Camera control not available' };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // DISPLAY SETTINGS
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Update display settings
         * @param {Object} settings - Display settings to update
         */
        updateDisplaySettings: (settings) => {
            try {
                if (!app3d?.displaySettingsManager) {
                    return { success: false, error: 'Display settings not available' };
                }

                Object.entries(settings).forEach(([key, value]) => {
                    app3d.updateDisplaySetting(key, value);
                });

                return { success: true, updatedSettings: settings };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // MISSION PLANNING & MANEUVERS
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Add a maneuver node to a satellite
         * @param {string|number} satelliteId - Satellite ID
         * @param {Object} params - {executionTime, deltaV: {x, y, z}}
         */
        addManeuverNode: (satelliteId, params) => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(String(satelliteId));
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }

                const { executionTime, deltaV } = params;
                let execTime;
                
                if (executionTime instanceof Date) {
                    execTime = executionTime;
                } else if (typeof executionTime === 'string') {
                    execTime = new Date(executionTime);
                } else if (typeof executionTime === 'number') {
                    execTime = new Date(executionTime);
                } else {
                    return { success: false, error: 'Invalid execution time format' };
                }

                if (!deltaV || typeof deltaV !== 'object') {
                    return { success: false, error: 'Delta-V vector required: {x, y, z}' };
                }

                const dvVector = {
                    x: parseFloat(deltaV.x) || 0,
                    y: parseFloat(deltaV.y) || 0,
                    z: parseFloat(deltaV.z) || 0
                };

                const node = satellite.addManeuverNode(execTime, dvVector);
                return { success: true, nodeId: node.id, executionTime: execTime.toISOString() };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get all maneuver nodes for a satellite
         * @param {string|number} satelliteId - Satellite ID
         */
        getManeuverNodes: (satelliteId) => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(String(satelliteId));
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }

                const nodes = satellite.maneuverNodes.map(node => ({
                    id: node.id,
                    executionTime: node.executionTime.toISOString(),
                    deltaV: {
                        x: node.deltaV.prograde || 0,
                        y: node.deltaV.normal || 0,
                        z: node.deltaV.radial || 0
                    },
                    deltaMagnitude: node.deltaMagnitude,
                    status: node.status
                }));

                return { success: true, nodes };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete a maneuver node
         * @param {string|number} satelliteId - Satellite ID
         * @param {string} nodeId - Node ID
         */
        deleteManeuverNode: (satelliteId, nodeId) => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(String(satelliteId));
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }

                const node = satellite.maneuverNodes.find(n => n.id === nodeId);
                if (!node) {
                    return { success: false, error: `Maneuver node ${nodeId} not found` };
                }

                satellite.removeManeuverNode(node);
                return { success: true, message: `Maneuver node ${nodeId} deleted` };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Calculate Hohmann transfer parameters
         * @param {Object} params - {currentSemiMajorAxis, targetSemiMajorAxis, centralBodyNaifId?}
         */
        calculateHohmannTransfer: async (params) => {
            try {
                const { currentSemiMajorAxis, targetSemiMajorAxis, centralBodyNaifId = 399 } = params;
                
                if (!currentSemiMajorAxis || !targetSemiMajorAxis) {
                    return { success: false, error: 'Current and target semi-major axes required' };
                }

                const bodies = getAllAvailableBodies();
                const centralBody = bodies.find(b => b.naifId === centralBodyNaifId);
                
                if (!centralBody || !centralBody.mu) {
                    return { success: false, error: `Central body ${centralBodyNaifId} not found` };
                }

                // Use centralized Hohmann transfer calculation
                const { OrbitalMechanics } = await import('../physics/core/OrbitalMechanics.js');
                const result = OrbitalMechanics.calculateHohmannTransfer({
                    centralBody,
                    currentRadius: currentSemiMajorAxis,
                    targetRadius: targetSemiMajorAxis
                });
                
                const { deltaV1, deltaV2, totalDeltaV, transferTime, transferSemiMajorAxis: a_transfer } = result;

                return {
                    success: true,
                    transfer: {
                        deltaV1: deltaV1,
                        deltaV2: deltaV2,
                        totalDeltaV: totalDeltaV,
                        transferTime: transferTime,
                        transferSemiMajorAxis: a_transfer,
                        centralBody: centralBody.name
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // COMMUNICATION SYSTEMS
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get communication status for a satellite
         * @param {string|number} satelliteId - Satellite ID
         */
        getSatelliteComms: (satelliteId) => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(String(satelliteId));
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }

                // Get communication subsystem data from physics engine
                const physicsEngine = app3d?.physicsIntegration;
                if (!physicsEngine?.subsystemManager) {
                    return { success: false, error: 'Communication system not available' };
                }

                const commSubsystem = physicsEngine.subsystemManager.getSubsystem(satelliteId, 'communication');
                if (!commSubsystem) {
                    return { success: false, error: 'No communication subsystem found' };
                }

                const state = commSubsystem.getState();
                const metrics = commSubsystem.getMetrics();
                const activeConnections = commSubsystem.getActiveConnections();

                return {
                    success: true,
                    comms: {
                        status: state.status,
                        powerConsumption: state.powerConsumption,
                        isTransmitting: state.isTransmitting,
                        currentDataRate: state.currentDataRate,
                        connectionCount: state.connectionCount,
                        bestLinkQuality: state.bestLinkQuality,
                        averageLinkQuality: state.averageLinkQuality,
                        totalDataTransmitted: state.totalDataTransmitted,
                        totalDataReceived: state.totalDataReceived,
                        activeConnections: activeConnections,
                        metrics: metrics
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get all active communication links
         */
        getCommunicationLinks: () => {
            try {
                const physicsEngine = app3d?.physicsIntegration;
                if (!physicsEngine?.subsystemManager) {
                    return { success: false, error: 'Communication system not available' };
                }

                const links = [];
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                
                satellites.forEach((satellite, satelliteId) => {
                    const commSubsystem = physicsEngine.subsystemManager.getSubsystem(satelliteId, 'communication');
                    if (commSubsystem) {
                        const connections = commSubsystem.getActiveConnections();
                        connections.forEach(conn => {
                            links.push({
                                source: satelliteId,
                                target: conn.targetId,
                                targetType: conn.targetType,
                                linkQuality: conn.linkQuality,
                                dataRate: conn.dataRate,
                                distance: conn.distance,
                                elevationAngle: conn.elevationAngle
                            });
                        });
                    }
                });

                return { success: true, links };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Update communication configuration
         * @param {string|number} satelliteId - Satellite ID
         * @param {Object} config - New communication configuration
         */
        updateCommsConfig: (satelliteId, config) => {
            try {
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(String(satelliteId));
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }

                const physicsEngine = app3d?.physicsIntegration;
                if (!physicsEngine?.subsystemManager) {
                    return { success: false, error: 'Communication system not available' };
                }

                const commSubsystem = physicsEngine.subsystemManager.getSubsystem(satelliteId, 'communication');
                if (!commSubsystem) {
                    return { success: false, error: 'No communication subsystem found' };
                }

                // Update configuration
                Object.assign(commSubsystem.config, config);
                
                return { success: true, config: commSubsystem.config };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // GROUND TRACKING
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get orbital elements for a specific satellite
         * @param {string|number} id - Satellite ID
         */
        getOrbitalElements: (id) => {
            try {
                const satResult = window.api.getSatellite(id);
                if (!satResult.success) return satResult;
                
                const satellite = satResult.satellite;
                if (satellite.orbitalElements) {
                    return { 
                        success: true, 
                        elements: satellite.orbitalElements,
                        centralBody: satellite.centralBody,
                        centralBodyNaifId: satellite.centralBodyNaifId
                    };
                } else {
                    return { success: false, error: 'Orbital elements not available for this satellite' };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get ground track projection for a satellite
         * @param {string|number} id - Satellite ID
         * @param {number} duration - Duration in seconds to propagate (default: one orbit period)
         */
        getGroundTrack: (id, duration = null) => {
            try {
                const satResult = window.api.getSatellite(id);
                if (!satResult.success) return satResult;
                
                const satellite = satResult.satellite;
                if (!satellite.position || !satellite.centralBodyNaifId) {
                    return { success: false, error: 'Satellite position data not available' };
                }
                
                // For now, return the current position as a point
                // TODO: Implement actual ground track propagation
                const groundTrack = [{
                    time: new Date().toISOString(),
                    latitude: satellite.latitude || 0,
                    longitude: satellite.longitude || 0,
                    altitude: satellite.surfaceAltitude || satellite.radialAltitude || 0
                }];
                
                return { 
                    success: true, 
                    groundTrack,
                    centralBody: satellite.centralBody,
                    centralBodyNaifId: satellite.centralBodyNaifId,
                    note: 'Ground track propagation is simplified - shows current position only'
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Calculate orbital period for given parameters
         * @param {number} semiMajorAxis - Semi-major axis in km
         * @param {number} centralBodyNaifId - Central body NAIF ID (default 399=Earth)
         */
        calculateOrbitalPeriod: (semiMajorAxis, centralBodyNaifId = 399) => {
            try {
                // Get gravitational parameter for the central body
                const bodies = getAllAvailableBodies();
                const centralBody = bodies.find(b => b.naifId === centralBodyNaifId);
                
                if (!centralBody || !centralBody.mu) {
                    return { success: false, error: `Central body ${centralBodyNaifId} not found or missing gravitational parameter` };
                }
                
                // Calculate period using Kepler's third law: T = 2π√(a³/μ)
                const mu = centralBody.mu; // km³/s²
                const a = semiMajorAxis; // km
                const period = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / mu); // seconds
                
                return { 
                    success: true, 
                    period: period,
                    periodHours: period / 3600,
                    periodDays: period / 86400,
                    centralBody: centralBody.name,
                    semiMajorAxis: a,
                    mu: mu
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get sphere of influence radius for a celestial body
         * @param {number} naifId - Body NAIF ID
         */
        getSphereOfInfluence: (naifId) => {
            try {
                const bodies = getAllAvailableBodies();
                const body = bodies.find(b => b.naifId === naifId);
                
                if (!body) {
                    return { success: false, error: `Body ${naifId} not found` };
                }
                
                return { 
                    success: true, 
                    body: body.name,
                    naifId: body.naifId,
                    soiRadius: body.soiRadius,
                    soiRadiusKm: body.soiRadius,
                    hasAtmosphere: body.hasAtmosphere,
                    atmosphereHeight: body.atmosphereHeight || null
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // CODE INTERPRETER
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Handle code interpreter tool calls from OpenAI
         * Note: Actual code execution is handled by OpenAI's built-in code interpreter
         * This function just acknowledges the tool call and returns success
         * @param {Object} params - { code: string, files?: Array }
         * @returns {Object} Success acknowledgment
         */
        runCodeInterpreter: (params) => {
            console.log('[Code Interpreter] Tool call received:', params);
            
            // The actual code execution is handled by OpenAI's built-in environment
            // We just need to acknowledge the tool call was received
            return { 
                success: true, 
                message: "Code interpreter tool call received - execution handled by OpenAI",
                code: params?.code || '',
                files: params?.files || []
            };
        },

    };
} 