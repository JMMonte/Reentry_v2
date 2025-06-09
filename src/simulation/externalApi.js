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

    /**
     * Extract satellite ID from various input formats
     * @param {string|number|object} input - Input that might contain a satellite ID
     * @returns {string} The extracted satellite ID as a string
     */
    function extractSatelliteId(input) {
        if (typeof input === 'object' && input !== null) {
            // Try multiple possible property names
            return String(input.id || input.satelliteId || input.name || input);
        }
        return String(input);
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
         * @param {Object} params - {name, mass, size, semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly, centralBodyNaifId?, commsConfig?}
         */
        createSatelliteFromOrbitalElements: async (params) => {
            try {
                // Validate central body
                const bodies = getAllAvailableBodies();
                const centralBodyNaifId = params.centralBodyNaifId || 399; // Default to Earth
                const centralBody = bodies.find(b => b.naifId === centralBodyNaifId);
                
                if (!centralBody) {
                    return { 
                        success: false, 
                        error: `Central body ${centralBodyNaifId} not found. Available bodies: ${bodies.map(b => `${b.name} (${b.naifId})`).join(', ')}`
                    };
                }
                
                // Add default communication configuration if not provided
                const enhancedParams = {
                    ...params,
                    centralBodyNaifId,
                    // Extract communication parameters from the form if available, otherwise use defaults
                    commsConfig: params.commsConfig || {
                        preset: 'cubesat', // Use preset system like SatelliteCreator
                        antennaGain: params.antennaGain || 20, // dBi
                        transmitPower: params.transmitPower || 10, // Watts
                        antennaType: params.antennaType || 'omnidirectional',
                        transmitFrequency: params.transmitFrequency || 2.4, // GHz
                        dataRate: params.dataRate || 2400, // kbps (converted from user input)
                        minElevationAngle: params.minElevationAngle || 5, // degrees
                        networkId: params.networkId || 'default',
                        encryption: params.encryption !== undefined ? params.encryption : true,
                        enabled: params.commsEnabled !== undefined ? params.commsEnabled : true
                    }
                };
                
                // Use the unified App3D method that creates both physics and visual satellites
                let result;
                if (app3d?.createSatelliteFromOrbitalElements) {
                    // Use App3D method that creates both physics and UI satellites
                    result = await app3d.createSatelliteFromOrbitalElements(enhancedParams);
                } else if (app3d?.physicsIntegration?.physicsEngine?.createSatelliteFromOrbitalElements) {
                    // Fallback to physics engine method only
                    result = app3d.physicsIntegration.physicsEngine.createSatelliteFromOrbitalElements(
                        enhancedParams, 
                        centralBodyNaifId
                    );
                    // Physics engine returns { id, position, velocity }, so create satellite object
                    const satellite = result?.id ? { id: result.id, name: enhancedParams.name } : null;
                    result = { satellite };
                } else {
                    throw new Error('No satellite creation method available');
                }
                const satellite = result?.satellite || result;
                
                // Initialize communication subsystem if physics engine available
                if (satellite && app3d?.physicsIntegration?.subsystemManager) {
                    try {
                        app3d.physicsIntegration.subsystemManager.initializeSubsystems(
                            satellite.id,
                            { communication: enhancedParams.commsConfig }
                        );
                    } catch (subError) {
                        console.warn('Could not initialize communication subsystem:', subError);
                    }
                }
                
                return { 
                    success: true, 
                    satellite: serializeSatellite(satellite),
                    centralBody: centralBody.name,
                    message: `Satellite created orbiting ${centralBody.name}`
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Create satellite from geographical position with custom velocity
         * @param {Object} params - {name, mass, size, latitude, longitude, altitude, velocity, azimuth, angleOfAttack, planetNaifId?, commsConfig?}
         */
        createSatelliteFromLatLon: async (params) => {
            try {
                // Validate planet/central body
                const bodies = getAllAvailableBodies();
                const planetNaifId = params.planetNaifId || params.centralBodyNaifId || 399; // Default to Earth
                const planet = bodies.find(b => b.naifId === planetNaifId);
                
                if (!planet) {
                    return { 
                        success: false, 
                        error: `Planet ${planetNaifId} not found. Available bodies: ${bodies.map(b => `${b.name} (${b.naifId})`).join(', ')}`
                    };
                }
                
                // Add default communication configuration
                const enhancedParams = {
                    ...params,
                    planetNaifId,
                    centralBodyNaifId: planetNaifId,
                    // Extract communication parameters from the form if available, otherwise use defaults
                    commsConfig: params.commsConfig || {
                        preset: 'cubesat', // Use preset system like SatelliteCreator
                        antennaGain: params.antennaGain || 20, // dBi
                        transmitPower: params.transmitPower || 10, // Watts
                        antennaType: params.antennaType || 'omnidirectional',
                        transmitFrequency: params.transmitFrequency || 2.4, // GHz
                        dataRate: params.dataRate || 2400, // kbps (converted from user input)
                        minElevationAngle: params.minElevationAngle || 5, // degrees
                        networkId: params.networkId || 'default',
                        encryption: params.encryption !== undefined ? params.encryption : true,
                        enabled: params.commsEnabled !== undefined ? params.commsEnabled : true
                    }
                };
                
                // Use the unified App3D method that creates both physics and visual satellites
                let result;
                if (app3d?.createSatelliteFromLatLon) {
                    // Use App3D method that creates both physics and UI satellites
                    result = await app3d.createSatelliteFromLatLon(enhancedParams);
                } else if (app3d?.physicsIntegration?.physicsEngine?.createSatelliteFromGeographic) {
                    // Fallback to physics engine method only
                    result = app3d.physicsIntegration.physicsEngine.createSatelliteFromGeographic(
                        enhancedParams, 
                        planetNaifId
                    );
                    // Physics engine returns { id, position, velocity }, so create satellite object
                    const satellite = result?.id ? { id: result.id, name: enhancedParams.name } : null;
                    result = { satellite };
                } else {
                    throw new Error('No satellite creation method available');
                }
                const satellite = result?.satellite || result;
                
                // Initialize communication subsystem
                if (satellite && app3d?.physicsIntegration?.subsystemManager) {
                    try {
                        app3d.physicsIntegration.subsystemManager.initializeSubsystems(
                            satellite.id,
                            { communication: enhancedParams.commsConfig }
                        );
                    } catch (subError) {
                        console.warn('Could not initialize communication subsystem:', subError);
                    }
                }
                
                return { 
                    success: true, 
                    satellite: serializeSatellite(satellite),
                    planet: planet.name,
                    message: `Satellite created at ${params.latitude}°, ${params.longitude}° over ${planet.name}`
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Create satellite from geographical position with circular orbit
         * @param {Object} params - {name, mass, size, latitude, longitude, altitude, planetNaifId?, commsConfig?}
         */
        createSatelliteFromLatLonCircular: async (params) => {
            try {
                // Validate planet/central body
                const bodies = getAllAvailableBodies();
                const planetNaifId = params.planetNaifId || params.centralBodyNaifId || 399; // Default to Earth
                const planet = bodies.find(b => b.naifId === planetNaifId);
                
                if (!planet) {
                    return { 
                        success: false, 
                        error: `Planet ${planetNaifId} not found. Available bodies: ${bodies.map(b => `${b.name} (${b.naifId})`).join(', ')}`
                    };
                }
                
                // Add default communication configuration
                const enhancedParams = {
                    ...params,
                    planetNaifId,
                    centralBodyNaifId: planetNaifId,
                    // Extract communication parameters from the form if available, otherwise use defaults
                    commsConfig: params.commsConfig || {
                        preset: 'cubesat', // Use preset system like SatelliteCreator
                        antennaGain: params.antennaGain || 20, // dBi
                        transmitPower: params.transmitPower || 10, // Watts
                        antennaType: params.antennaType || 'omnidirectional',
                        transmitFrequency: params.transmitFrequency || 2.4, // GHz
                        dataRate: params.dataRate || 2400, // kbps (converted from user input)
                        minElevationAngle: params.minElevationAngle || 5, // degrees
                        networkId: params.networkId || 'default',
                        encryption: params.encryption !== undefined ? params.encryption : true,
                        enabled: params.commsEnabled !== undefined ? params.commsEnabled : true
                    }
                };
                
                // Use the unified App3D method that creates both physics and visual satellites
                let result;
                if (app3d?.createSatelliteFromLatLonCircular) {
                    // Use App3D method that creates both physics and UI satellites
                    result = await app3d.createSatelliteFromLatLonCircular(enhancedParams);
                } else if (app3d?.physicsIntegration?.physicsEngine?.createSatelliteFromGeographic) {
                    // Fallback to physics engine method only - circular orbit is handled by the parameters
                    result = app3d.physicsIntegration.physicsEngine.createSatelliteFromGeographic(
                        enhancedParams, 
                        planetNaifId
                    );
                    // Physics engine returns { id, position, velocity }, so create satellite object
                    const satellite = result?.id ? { id: result.id, name: enhancedParams.name } : null;
                    result = { satellite };
                } else {
                    throw new Error('No satellite creation method available');
                }
                const satellite = result?.satellite || result;
                
                // Initialize communication subsystem
                if (satellite && app3d?.physicsIntegration?.subsystemManager) {
                    try {
                        app3d.physicsIntegration.subsystemManager.initializeSubsystems(
                            satellite.id,
                            { communication: enhancedParams.commsConfig }
                        );
                    } catch (subError) {
                        console.warn('Could not initialize communication subsystem:', subError);
                    }
                }
                
                return { 
                    success: true, 
                    satellite: serializeSatellite(satellite),
                    planet: planet.name,
                    message: `Satellite created in circular orbit over ${planet.name}`
                };
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
                const bodies = getAllAvailableBodies();
                const result = [];

                satellites.forEach((satellite, id) => {
                    // Try multiple ways to get physics data
                    let physics = null;
                    
                    // Method 1: Direct from physics engine satellites map
                    if (app3d?.physicsIntegration?.satellites) {
                        physics = app3d.physicsIntegration.satellites.get(String(id));
                    }
                    
                    // Method 2: From satellite engine if available
                    if (!physics && app3d?.physicsIntegration?.satelliteEngine?.satellites) {
                        physics = app3d.physicsIntegration.satelliteEngine.satellites.get(String(id));
                    }
                    
                    // Method 3: Basic satellite data only
                    if (!physics) {
                        physics = { mass: satellite.mass, size: satellite.size };
                    }
                    const satData = {
                        // Basic properties
                        id: satellite.id || physics?.id,
                        name: physics?.name || satellite.name,
                        color: physics?.color !== undefined ? physics.color : satellite.color,
                        
                        // Physical properties
                        mass: physics?.mass || satellite.mass,
                        size: physics?.size || satellite.size,
                        crossSectionalArea: physics?.crossSectionalArea,
                        dragCoefficient: physics?.dragCoefficient,
                        ballisticCoefficient: physics?.ballisticCoefficient,
                        
                        // Orbital properties
                        centralBody: getBodyName(physics?.centralBodyNaifId || satellite.centralBodyNaifId),
                        centralBodyNaifId: physics?.centralBodyNaifId || satellite.centralBodyNaifId,
                        
                        // Position data - handle Vector3 objects or arrays
                        position: physics?.position ? (
                            physics.position.x !== undefined ? {
                                x: physics.position.x,
                                y: physics.position.y, 
                                z: physics.position.z
                            } : {
                                x: physics.position[0],
                                y: physics.position[1], 
                                z: physics.position[2]
                            }
                        ) : null,
                        velocity: physics?.velocity ? (
                            physics.velocity.x !== undefined ? {
                                x: physics.velocity.x,
                                y: physics.velocity.y,
                                z: physics.velocity.z
                            } : {
                                x: physics.velocity[0],
                                y: physics.velocity[1],
                                z: physics.velocity[2]
                            }
                        ) : null,
                        
                        // Geographic coordinates - calculate if not available
                        latitude: physics?.lat || (physics?.position && physics?.centralBodyNaifId ? 
                            (() => {
                                try {
                                    // Simple geographic conversion for basic use - handle both object and array formats
                                    const pos = physics.position;
                                    const [x, y, z] = pos.x !== undefined ? [pos.x, pos.y, pos.z] : [pos[0], pos[1], pos[2]];
                                    const r = Math.sqrt(x * x + y * y + z * z);
                                    const lat = Math.asin(z / r) * 180 / Math.PI;
                                    return lat;
                                } catch (e) {
                                    return null;
                                }
                            })() : null),
                        longitude: physics?.lon || (physics?.position && physics?.centralBodyNaifId ? 
                            (() => {
                                try {
                                    const pos = physics.position;
                                    const [x, y, z] = pos.x !== undefined ? [pos.x, pos.y, pos.z] : [pos[0], pos[1], pos[2]];
                                    const lon = Math.atan2(y, x) * 180 / Math.PI;
                                    return lon;
                                } catch (e) {
                                    return null;
                                }
                            })() : null),
                        surfaceAltitude: physics?.altitude_surface || (physics?.position && physics?.centralBodyNaifId ?
                            (() => {
                                try {
                                    const pos = physics.position;
                                    const [x, y, z] = pos.x !== undefined ? [pos.x, pos.y, pos.z] : [pos[0], pos[1], pos[2]];
                                    const r = Math.sqrt(x * x + y * y + z * z);
                                    const body = bodies.find(b => b.naifId === physics.centralBodyNaifId);
                                    return body ? r - body.radius : r - 6371; // Default to Earth radius
                                } catch (e) {
                                    return null;
                                }
                            })() : null),
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
                const satelliteId = extractSatelliteId(id);
                
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(satelliteId);
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }
                
                // Use the same logic as getSatellites but for single satellite
                const allSats = window.api.getSatellites();
                if (!allSats.success) return allSats;
                
                const satData = allSats.satellites.find(s => s.id === satelliteId);
                return { success: true, satellite: satData };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get current positions of all satellites
         * @param {Object} options - { satelliteIds?: Array, includeVelocity?: boolean }
         * @returns {Object} Current positions and velocities of satellites
         */
        getCurrentPositions: (options = {}) => {
            try {
                const { satelliteIds = null, includeVelocity = true } = options;
                
                // Get all satellites
                const allSats = window.api.getSatellites();
                if (!allSats.success) return allSats;
                
                let satellites = allSats.satellites;
                
                // Filter by satellite IDs if specified
                if (satelliteIds && Array.isArray(satelliteIds)) {
                    satellites = satellites.filter(s => satelliteIds.includes(s.id));
                }
                
                // Extract position (and velocity if requested) data
                const positions = satellites.map(sat => {
                    const posData = {
                        id: sat.id,
                        name: sat.name,
                        centralBody: sat.centralBody,
                        centralBodyNaifId: sat.centralBodyNaifId,
                        position: sat.position,
                        latitude: sat.latitude,
                        longitude: sat.longitude,
                        surfaceAltitude: sat.surfaceAltitude,
                        radialAltitude: sat.radialAltitude
                    };
                    
                    if (includeVelocity) {
                        posData.velocity = sat.velocity;
                        posData.groundTrackVelocity = sat.groundTrackVelocity;
                    }
                    
                    return posData;
                });
                
                return {
                    success: true,
                    positions,
                    count: positions.length,
                    timestamp: app3d?.timeUtils?.getSimulatedTime() || Date.now()
                };
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
                const satelliteId = extractSatelliteId(id);
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(satelliteId);
                if (!satellite) {
                    return { success: false, error: `Satellite ${satelliteId} not found` };
                }
                
                satellite.delete();
                return { success: true, message: `Satellite ${satelliteId} deleted` };
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
         * Get detailed information about celestial bodies
         * @param {Object} options - { type?, parentId?, includeStats? }
         * @returns {Object} Categorized celestial body information
         */
        getCelestialBodyInfo: (options = {}) => {
            try {
                const { type = null, parentId = null, includeStats = true } = options;
                const bodies = getAllAvailableBodies();
                
                // Filter bodies based on options
                let filteredBodies = bodies;
                if (type) {
                    // Since body.type might not be set, use our categorization logic
                    const bodyReference = {
                        10: 'star', 199: 'planet', 299: 'planet', 399: 'planet', 499: 'planet',
                        599: 'planet', 699: 'planet', 799: 'planet', 899: 'planet'
                    };
                    filteredBodies = filteredBodies.filter(b => {
                        if (b.type === type) return true;
                        if (type === 'planet' && bodyReference[b.naifId] === 'planet') return true;
                        if (type === 'star' && bodyReference[b.naifId] === 'star') return true;
                        if (type === 'moon' && b.parent && b.parent !== b.naifId) return true;
                        return false;
                    });
                }
                if (parentId !== null) {
                    filteredBodies = filteredBodies.filter(b => b.parent === parentId);
                }
                
                // Categorize bodies
                const categorized = {
                    stars: [],
                    planets: [],
                    moons: [],
                    dwarfPlanets: [],
                    barycenters: [],
                    other: []
                };
                
                // Common body reference
                const bodyReference = {
                    // Stars
                    10: { category: 'stars', displayName: 'Sun' },
                    // Planets
                    199: { category: 'planets', displayName: 'Mercury' },
                    299: { category: 'planets', displayName: 'Venus' },
                    399: { category: 'planets', displayName: 'Earth' },
                    499: { category: 'planets', displayName: 'Mars' },
                    599: { category: 'planets', displayName: 'Jupiter' },
                    699: { category: 'planets', displayName: 'Saturn' },
                    799: { category: 'planets', displayName: 'Uranus' },
                    899: { category: 'planets', displayName: 'Neptune' },
                    // Dwarf Planets
                    999: { category: 'dwarfPlanets', displayName: 'Pluto' },
                    2000001: { category: 'dwarfPlanets', displayName: 'Ceres' },
                    136199: { category: 'dwarfPlanets', displayName: 'Eris' },
                    136108: { category: 'dwarfPlanets', displayName: 'Haumea' },
                    136472: { category: 'dwarfPlanets', displayName: 'Makemake' },
                    // Major Moons
                    301: { category: 'moons', displayName: 'Moon (Earth)', parent: 399 },
                    401: { category: 'moons', displayName: 'Phobos (Mars)', parent: 499 },
                    402: { category: 'moons', displayName: 'Deimos (Mars)', parent: 499 },
                    501: { category: 'moons', displayName: 'Io (Jupiter)', parent: 599 },
                    502: { category: 'moons', displayName: 'Europa (Jupiter)', parent: 599 },
                    503: { category: 'moons', displayName: 'Ganymede (Jupiter)', parent: 599 },
                    504: { category: 'moons', displayName: 'Callisto (Jupiter)', parent: 599 },
                    601: { category: 'moons', displayName: 'Mimas (Saturn)', parent: 699 },
                    602: { category: 'moons', displayName: 'Enceladus (Saturn)', parent: 699 },
                    603: { category: 'moons', displayName: 'Tethys (Saturn)', parent: 699 },
                    604: { category: 'moons', displayName: 'Dione (Saturn)', parent: 699 },
                    605: { category: 'moons', displayName: 'Rhea (Saturn)', parent: 699 },
                    606: { category: 'moons', displayName: 'Titan (Saturn)', parent: 699 },
                    607: { category: 'moons', displayName: 'Hyperion (Saturn)', parent: 699 },
                    608: { category: 'moons', displayName: 'Iapetus (Saturn)', parent: 699 },
                    609: { category: 'moons', displayName: 'Phoebe (Saturn)', parent: 699 },
                    701: { category: 'moons', displayName: 'Ariel (Uranus)', parent: 799 },
                    702: { category: 'moons', displayName: 'Umbriel (Uranus)', parent: 799 },
                    703: { category: 'moons', displayName: 'Titania (Uranus)', parent: 799 },
                    704: { category: 'moons', displayName: 'Oberon (Uranus)', parent: 799 },
                    705: { category: 'moons', displayName: 'Miranda (Uranus)', parent: 799 },
                    801: { category: 'moons', displayName: 'Triton (Neptune)', parent: 899 },
                    802: { category: 'moons', displayName: 'Nereid (Neptune)', parent: 899 },
                    901: { category: 'moons', displayName: 'Charon (Pluto)', parent: 999 }
                };
                
                // Categorize and enhance bodies
                filteredBodies.forEach(body => {
                    const ref = bodyReference[body.naifId];
                    const enhancedBody = {
                        ...body,
                        displayName: ref?.displayName || body.name,
                        category: ref?.category || 'other'
                    };
                    
                    // Calculate additional stats if requested
                    if (includeStats) {
                        enhancedBody.stats = {
                            orbitalPeriodDays: body.orbitalPeriod ? body.orbitalPeriod / 86400 : null,
                            orbitalPeriodYears: body.orbitalPeriod ? body.orbitalPeriod / (365.25 * 86400) : null,
                            escapeVelocity: body.mu && body.radius ? 
                                Math.sqrt(2 * body.mu / body.radius) : null, // km/s
                            surfaceGravity: body.mu && body.radius ? 
                                body.mu / (body.radius * body.radius) : null, // km/s²
                            density: body.mass && body.radius ? 
                                body.mass / (4/3 * Math.PI * Math.pow(body.radius, 3)) : null // kg/km³
                        };
                    }
                    
                    // Add to appropriate category
                    if (body.type === 'star' || ref?.category === 'stars') {
                        categorized.stars.push(enhancedBody);
                    } else if (body.type === 'planet' || ref?.category === 'planets') {
                        categorized.planets.push(enhancedBody);
                    } else if (body.type === 'moon' || ref?.category === 'moons') {
                        categorized.moons.push(enhancedBody);
                    } else if (body.type === 'dwarf_planet' || ref?.category === 'dwarfPlanets') {
                        categorized.dwarfPlanets.push(enhancedBody);
                    } else if (body.type === 'barycenter') {
                        categorized.barycenters.push(enhancedBody);
                    } else {
                        categorized.other.push(enhancedBody);
                    }
                });
                
                // Sort each category by NAIF ID
                Object.keys(categorized).forEach(key => {
                    categorized[key].sort((a, b) => a.naifId - b.naifId);
                });
                
                return {
                    success: true,
                    bodies: categorized,
                    summary: {
                        total: filteredBodies.length,
                        stars: categorized.stars.length,
                        planets: categorized.planets.length,
                        moons: categorized.moons.length,
                        dwarfPlanets: categorized.dwarfPlanets.length,
                        barycenters: categorized.barycenters.length,
                        other: categorized.other.length
                    },
                    naifIdReference: Object.entries(bodyReference).map(([id, info]) => ({
                        naifId: parseInt(id),
                        ...info
                    })).sort((a, b) => a.naifId - b.naifId)
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get detailed information about a specific celestial body
         * @param {number|string} naifIdOrName - NAIF ID or name of the body
         * @returns {Object} Detailed body information
         */
        getCelestialBody: (naifIdOrName) => {
            try {
                const bodies = getAllAvailableBodies();
                
                // Find by NAIF ID or name
                let body = null;
                if (typeof naifIdOrName === 'number' || !isNaN(parseInt(naifIdOrName))) {
                    body = bodies.find(b => b.naifId === parseInt(naifIdOrName));
                } else {
                    body = bodies.find(b => 
                        b.name.toLowerCase() === naifIdOrName.toLowerCase()
                    );
                }
                
                if (!body) {
                    return { 
                        success: false, 
                        error: `Body '${naifIdOrName}' not found`
                    };
                }
                
                // Get parent body info if available
                let parentBody = null;
                if (body.parent) {
                    parentBody = bodies.find(b => b.naifId === body.parent);
                }
                
                // Get child bodies (moons, etc)
                const children = bodies.filter(b => b.parent === body.naifId);
                
                return {
                    success: true,
                    body: {
                        ...body,
                        parent: parentBody ? {
                            naifId: parentBody.naifId,
                            name: parentBody.name,
                            type: parentBody.type
                        } : null,
                        children: children.map(c => ({
                            naifId: c.naifId,
                            name: c.name,
                            type: c.type,
                            radius: c.radius
                        })),
                        orbitalCharacteristics: body.orbitalElements || null,
                        physicalCharacteristics: {
                            radius: body.radius,
                            mass: body.mass,
                            density: body.mass && body.radius ? 
                                body.mass / (4/3 * Math.PI * Math.pow(body.radius, 3)) : null,
                            escapeVelocity: body.mu && body.radius ? 
                                Math.sqrt(2 * body.mu / body.radius) : null,
                            surfaceGravity: body.mu && body.radius ? 
                                body.mu / (body.radius * body.radius) : null,
                            rotationPeriod: body.rotationPeriod || null,
                            hasAtmosphere: body.hasAtmosphere,
                            atmosphereHeight: body.atmosphereHeight || null
                        },
                        orbitInfo: {
                            soiRadius: body.soiRadius,
                            hillSphere: body.hillSphere || body.soiRadius,
                            orbitalPeriod: body.orbitalPeriod,
                            orbitalPeriodDays: body.orbitalPeriod ? body.orbitalPeriod / 86400 : null,
                            orbitalPeriodYears: body.orbitalPeriod ? body.orbitalPeriod / (365.25 * 86400) : null
                        }
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get available bodies for satellite creation (planets, moons, dwarf planets)
         * @returns {Object} Bodies suitable for satellite orbits
         */
        getAvailableOrbitBodies: () => {
            try {
                const bodies = getAllAvailableBodies();
                
                // Filter to bodies that can have satellites
                const orbitBodies = bodies.filter(body => {
                    // Include planets, moons, and dwarf planets, but exclude barycenters and very small bodies
                    if (body.type === 'barycenter') return false;
                    if (!body.radius || body.radius < 10) return false; // Exclude very small bodies
                    return true;
                });
                
                // Categorize for easy selection
                const categorized = {
                    planets: [],
                    moons: [],
                    dwarfPlanets: [],
                    other: []
                };
                
                const planetIds = [199, 299, 399, 499, 599, 699, 799, 899];
                const dwarfPlanetIds = [999, 2000001, 136199, 136472, 136108];
                
                orbitBodies.forEach(body => {
                    const enhanced = {
                        naifId: body.naifId,
                        name: body.name,
                        displayName: body.name.charAt(0).toUpperCase() + body.name.slice(1),
                        radius: body.radius,
                        mass: body.mass,
                        soiRadius: body.soiRadius,
                        hasAtmosphere: body.hasAtmosphere,
                        type: body.type,
                        suitable: body.radius > 100 // Mark as suitable for most satellites
                    };
                    
                    if (planetIds.includes(body.naifId)) {
                        categorized.planets.push(enhanced);
                    } else if (dwarfPlanetIds.includes(body.naifId)) {
                        categorized.dwarfPlanets.push(enhanced);
                    } else if (body.parent && body.parent !== body.naifId) {
                        categorized.moons.push(enhanced);
                    } else {
                        categorized.other.push(enhanced);
                    }
                });
                
                // Sort by NAIF ID
                Object.keys(categorized).forEach(key => {
                    categorized[key].sort((a, b) => a.naifId - b.naifId);
                });
                
                return {
                    success: true,
                    bodies: categorized,
                    recommended: [
                        { naifId: 399, name: 'Earth', reason: 'Most comprehensive data and features' },
                        { naifId: 499, name: 'Mars', reason: 'Good for interplanetary missions' },
                        { naifId: 301, name: 'Moon', reason: 'Lunar operations and Earth-Moon system' },
                        { naifId: 606, name: 'Titan', reason: 'Interesting moon with atmosphere' }
                    ],
                    total: orbitBodies.length
                };
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
                const id = extractSatelliteId(satelliteId);
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
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
                const id = extractSatelliteId(satelliteId);
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
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
                const id = extractSatelliteId(satelliteId);
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
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
                const id = extractSatelliteId(satelliteId);
                
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
                }

                // Get communication subsystem data from physics engine
                const physicsIntegration = app3d?.physicsIntegration;
                const subsystemManager = physicsIntegration?.physicsEngine?.subsystemManager;
                if (!subsystemManager) {
                    // Return basic comm data if subsystem manager not available
                    return {
                        success: true,
                        comms: {
                            status: 'nominal',
                            powerConsumption: 50,
                            isTransmitting: false,
                            currentDataRate: 0,
                            connectionCount: 0,
                            bestLinkQuality: 0,
                            averageLinkQuality: 0,
                            totalDataTransmitted: 0,
                            totalDataReceived: 0,
                            activeConnections: [],
                            metrics: {},
                            message: 'Subsystem manager not available - returning default values'
                        }
                    };
                }

                const commSubsystem = subsystemManager.getSubsystem(id, 'communication');
                if (!commSubsystem) {
                    // Return basic comm data if subsystem not found
                    return {
                        success: true,
                        comms: {
                            status: 'offline',
                            powerConsumption: 0,
                            isTransmitting: false,
                            currentDataRate: 0,
                            connectionCount: 0,
                            bestLinkQuality: 0,
                            averageLinkQuality: 0,
                            totalDataTransmitted: 0,
                            totalDataReceived: 0,
                            activeConnections: [],
                            metrics: {},
                            message: 'Communication subsystem not initialized'
                        }
                    };
                }

                // Access state and metrics directly as properties
                const state = commSubsystem.state || {};
                const metrics = commSubsystem.metrics || {};
                const activeConnections = commSubsystem.getActiveConnections ? commSubsystem.getActiveConnections() : [];

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
                const physicsIntegration = app3d?.physicsIntegration;
                const subsystemManager = physicsIntegration?.physicsEngine?.subsystemManager;
                if (!subsystemManager) {
                    return { 
                        success: true, 
                        links: [],
                        message: 'Communication subsystem manager not available'
                    };
                }

                const links = [];
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                
                satellites.forEach((satellite, satelliteId) => {
                    try {
                        const commSubsystem = subsystemManager.getSubsystem(satelliteId, 'communication');
                        if (commSubsystem) {
                            const connections = commSubsystem.getActiveConnections();
                            if (Array.isArray(connections)) {
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
                        }
                    } catch (subError) {
                        console.warn(`Error getting comms for satellite ${satelliteId}:`, subError);
                    }
                });

                return { success: true, links };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Update communication configuration for a satellite
         * Uses the same multi-fallback approach as the satellite debug window
         * @param {string|number} satelliteId - Satellite ID
         * @param {Object} config - New communication configuration (e.g., {enabled: true, transmitPower: 20, antennaGain: 15})
         */
        updateCommsConfig: (satelliteId, config) => {
            try {
                const id = extractSatelliteId(satelliteId);
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
                }

                // Method 1: Use unified communications service (preferred)
                if (app3d?.communicationsService) {
                    try {
                        app3d.communicationsService.updateSatelliteCommsConfig(id, config);
                        return { 
                            success: true, 
                            config: app3d.communicationsService.getSatelliteCommsConfig(id),
                            method: 'communicationsService'
                        };
                    } catch (serviceError) {
                        console.warn('[updateCommsConfig] Communications service failed:', serviceError);
                    }
                }

                // Method 2: Try PhysicsAPI
                if (app3d?.physicsAPI?.isReady()) {
                    try {
                        const success = app3d.physicsAPI.updateSatelliteCommsConfig(id, config);
                        if (success) {
                            return { 
                                success: true, 
                                config: config,
                                method: 'physicsAPI'
                            };
                        }
                    } catch (apiError) {
                        console.warn('[updateCommsConfig] PhysicsAPI failed:', apiError);
                    }
                }

                // Method 3: Direct physics subsystem update
                const physicsEngine = app3d?.physicsIntegration?.physicsEngine || app3d?.physicsEngine;
                if (physicsEngine?.subsystemManager) {
                    try {
                        const subsystemManager = physicsEngine.subsystemManager;
                        const success = subsystemManager.updateSubsystemConfig(id, 'communication', config);
                        if (success) {
                            const commSubsystem = subsystemManager.getSubsystem(id, 'communication');
                            return { 
                                success: true, 
                                config: commSubsystem?.config || config,
                                method: 'subsystemManager'
                            };
                        }
                    } catch (subsystemError) {
                        console.warn('[updateCommsConfig] Subsystem manager failed:', subsystemError);
                    }
                }

                // Method 4: Fallback to SatelliteCommsManager
                if (app3d?.satelliteCommsManager) {
                    try {
                        app3d.satelliteCommsManager.updateSatelliteComms(id, config);
                        
                        // Force update line-of-sight calculations when communications are changed
                        if (app3d?.lineOfSightManager?.isEnabled()) {
                            app3d._syncConnectionsWorker();
                        }
                        
                        return { 
                            success: true, 
                            config: config,
                            method: 'satelliteCommsManager'
                        };
                    } catch (managerError) {
                        console.warn('[updateCommsConfig] SatelliteCommsManager failed:', managerError);
                    }
                }

                return { 
                    success: false, 
                    error: 'No communication system available. Tried communicationsService, physicsAPI, subsystemManager, and satelliteCommsManager.' 
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Apply a communication preset to a satellite
         * @param {string|number} satelliteId - Satellite ID
         * @param {string} presetName - Preset name ('cubesat', 'communications_satellite', 'scientific_probe', 'military_satellite', 'earth_observation')
         */
        applyCommsPreset: (satelliteId, presetName) => {
            try {
                const id = extractSatelliteId(satelliteId);
                const satellites = app3d?.satellites?.getSatellitesMap() || new Map();
                const satellite = satellites.get(id);
                if (!satellite) {
                    return { success: false, error: `Satellite ${id} not found` };
                }

                // Get presets from communications service if available
                let presets = {};
                if (app3d?.communicationsService) {
                    presets = app3d.communicationsService.getPresets();
                } else {
                    // Fallback to hardcoded presets matching SatelliteCreator
                    presets = {
                        cubesat: { 
                            antennaGain: 2.0, 
                            transmitPower: 1.0, 
                            antennaType: 'omnidirectional', 
                            dataRate: 100, 
                            minElevationAngle: 10.0,
                            enabled: true 
                        },
                        communications_satellite: { 
                            antennaGain: 25.0, 
                            transmitPower: 50.0, 
                            antennaType: 'directional', 
                            dataRate: 10000, 
                            minElevationAngle: 5.0,
                            enabled: true 
                        },
                        scientific_probe: { 
                            antennaGain: 35.0, 
                            transmitPower: 20.0, 
                            antennaType: 'high_gain', 
                            dataRate: 500, 
                            minElevationAngle: 0.0,
                            enabled: true 
                        },
                        earth_observation: { 
                            antennaGain: 15.0, 
                            transmitPower: 25.0, 
                            antennaType: 'directional', 
                            dataRate: 2000, 
                            minElevationAngle: 5.0,
                            enabled: true 
                        },
                        military_satellite: { 
                            antennaGain: 20.0, 
                            transmitPower: 100.0, 
                            antennaType: 'phased_array', 
                            dataRate: 5000, 
                            minElevationAngle: 3.0,
                            enabled: true 
                        }
                    };
                }

                const preset = presets[presetName];
                if (!preset) {
                    return { 
                        success: false, 
                        error: `Preset '${presetName}' not found. Available presets: ${Object.keys(presets).join(', ')}` 
                    };
                }

                // Apply the preset using the updateCommsConfig method
                return window.api.updateCommsConfig(id, preset);
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
         * @param {Object} options - { duration?: number, numPoints?: number, includeCanvas?: boolean, canvasWidth?: number, canvasHeight?: number }
         */
        getGroundTrack: async (id, options = {}) => {
            try {
                const satResult = window.api.getSatellite(id);
                if (!satResult.success) return satResult;
                
                const satellite = satResult.satellite;
                if (!satellite.position || !satellite.centralBodyNaifId) {
                    return { success: false, error: 'Satellite position data not available' };
                }
                
                // Default options
                const {
                    duration = satellite.orbitalElements?.period || 5400, // Use orbital period or default 90 min
                    numPoints = 100,
                    includeCanvas = false,
                    canvasWidth = 1200,
                    canvasHeight = 600
                } = options;
                
                // Import required modules dynamically
                const { UnifiedSatellitePropagator } = await import('../physics/core/UnifiedSatellitePropagator.js');
                const { GroundTrackService } = await import('../services/GroundTrackService.js');
                
                // Get central body data
                const bodies = getAllAvailableBodies();
                const centralBody = bodies.find(b => b.naifId === satellite.centralBodyNaifId);
                if (!centralBody) {
                    return { success: false, error: `Central body ${satellite.centralBodyNaifId} not found` };
                }
                
                // Prepare satellite state for propagation
                const satState = {
                    position: [satellite.position.x, satellite.position.y, satellite.position.z],
                    velocity: [satellite.velocity.x, satellite.velocity.y, satellite.velocity.z],
                    centralBodyNaifId: satellite.centralBodyNaifId,
                    mass: satellite.mass || 1000,
                    crossSectionalArea: satellite.crossSectionalArea || 10,
                    dragCoefficient: satellite.dragCoefficient || 2.2
                };
                
                // Propagate orbit
                const propagatedPoints = UnifiedSatellitePropagator.propagateOrbit({
                    satellite: satState,
                    bodies: { [centralBody.naifId]: centralBody },
                    duration,
                    timeStep: duration / numPoints,
                    includeJ2: true,
                    includeDrag: false, // Typically disabled for ground track visualization
                    includeThirdBody: false
                });
                
                // Create ground track service instance
                const groundTrackService = new GroundTrackService();
                const currentTime = app3d?.timeUtils?.getSimulatedTime() || Date.now();
                
                // Convert propagated points to ground track format
                const groundTrack = [];
                for (const point of propagatedPoints) {
                    const pointTime = currentTime + point.time * 1000; // Convert seconds to ms
                    
                    // Transform ECI to surface coordinates
                    const surface = await groundTrackService.transformECIToSurface(
                        point.position,
                        satellite.centralBodyNaifId,
                        pointTime,
                        centralBody
                    );
                    
                    const trackPoint = {
                        time: new Date(pointTime).toISOString(),
                        latitude: surface.lat,
                        longitude: surface.lon,
                        altitude: surface.alt
                    };
                    
                    // Add canvas coordinates if requested
                    if (includeCanvas) {
                        const canvas = groundTrackService.projectToCanvas(
                            surface.lat, 
                            surface.lon, 
                            canvasWidth, 
                            canvasHeight
                        );
                        trackPoint.x = canvas.x;
                        trackPoint.y = canvas.y;
                    }
                    
                    groundTrack.push(trackPoint);
                }
                
                return { 
                    success: true, 
                    groundTrack,
                    centralBody: satellite.centralBody,
                    centralBodyNaifId: satellite.centralBodyNaifId,
                    duration,
                    numPoints: groundTrack.length
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get ground tracks for multiple satellites
         * @param {Array<string|number>} satelliteIds - Array of satellite IDs
         * @param {Object} options - Same options as getGroundTrack
         */
        getMultipleGroundTracks: async (satelliteIds, options = {}) => {
            try {
                if (!Array.isArray(satelliteIds)) {
                    return { success: false, error: 'satelliteIds must be an array' };
                }
                
                const results = await Promise.all(
                    satelliteIds.map(id => window.api.getGroundTrack(id, options))
                );
                
                const successful = results.filter(r => r.success);
                const failed = results.filter(r => !r.success);
                
                return {
                    success: true,
                    groundTracks: successful.map((r, i) => ({
                        satelliteId: satelliteIds[results.indexOf(r)],
                        ...r
                    })),
                    failures: failed.map((r, i) => ({
                        satelliteId: satelliteIds[results.indexOf(r)],
                        error: r.error
                    }))
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get ground track coverage analysis for a satellite
         * @param {string|number} id - Satellite ID
         * @param {Object} options - { duration, numPoints, minElevation }
         */
        getGroundTrackCoverage: async (id, options = {}) => {
            try {
                const satResult = window.api.getSatellite(id);
                if (!satResult.success) return satResult;
                
                const satellite = satResult.satellite;
                if (!satellite.position || !satellite.centralBodyNaifId) {
                    return { success: false, error: 'Satellite position data not available' };
                }
                
                const {
                    duration = satellite.orbitalElements?.period || 5400,
                    numPoints = 100,
                    minElevation = 5 // degrees
                } = options;
                
                // Get ground track first
                const trackResult = await window.api.getGroundTrack(id, { duration, numPoints });
                if (!trackResult.success) return trackResult;
                
                // Import required modules
                const { GroundTrackService } = await import('../services/GroundTrackService.js');
                const groundTrackService = new GroundTrackService();
                
                // Get central body data
                const bodies = getAllAvailableBodies();
                const centralBody = bodies.find(b => b.naifId === satellite.centralBodyNaifId);
                if (!centralBody) {
                    return { success: false, error: `Central body ${satellite.centralBodyNaifId} not found` };
                }
                
                // Calculate coverage for each point
                const coverageData = await Promise.all(
                    trackResult.groundTrack.map(async (point) => {
                        const radius = await groundTrackService.calculateCoverageRadius(
                            { lat: point.latitude, lon: point.longitude, alt: point.altitude },
                            satellite.centralBodyNaifId,
                            centralBody
                        );
                        
                        return {
                            ...point,
                            coverageRadius: radius,
                            coverageRadiusKm: radius * (Math.PI / 180) * centralBody.radius
                        };
                    })
                );
                
                // Calculate total coverage area (simplified)
                const avgCoverageRadiusKm = coverageData.reduce((sum, p) => sum + p.coverageRadiusKm, 0) / coverageData.length;
                const coverageArea = Math.PI * Math.pow(avgCoverageRadiusKm, 2);
                const bodyArea = 4 * Math.PI * Math.pow(centralBody.radius, 2);
                const coveragePercentage = (coverageArea / bodyArea) * 100;
                
                return {
                    success: true,
                    groundTrack: coverageData,
                    statistics: {
                        averageCoverageRadiusKm: avgCoverageRadiusKm,
                        approximateCoverageArea: coverageArea,
                        bodyTotalArea: bodyArea,
                        instantCoveragePercentage: coveragePercentage,
                        satelliteId: id,
                        centralBody: satellite.centralBody,
                        duration
                    }
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

        /**
         * Get ground station visibility windows along a ground track
         * @param {string|number} satelliteId - Satellite ID
         * @param {Object} groundStation - { latitude, longitude, elevation?, name? }
         * @param {Object} options - { duration?, minElevation?, numPoints? }
         */
        getGroundStationVisibility: async (satelliteId, groundStation, options = {}) => {
            try {
                if (!groundStation || groundStation.latitude === undefined || groundStation.longitude === undefined) {
                    return { success: false, error: 'Ground station must have latitude and longitude' };
                }
                
                const {
                    duration,
                    minElevation = 5, // degrees above horizon
                    numPoints = 200 // Higher resolution for visibility detection
                } = options;
                
                // Get ground track with higher resolution
                const trackResult = await window.api.getGroundTrack(satelliteId, { duration, numPoints });
                if (!trackResult.success) return trackResult;
                
                // Get central body data
                const bodies = getAllAvailableBodies();
                const centralBody = bodies.find(b => b.naifId === trackResult.centralBodyNaifId);
                if (!centralBody) {
                    return { success: false, error: `Central body ${trackResult.centralBodyNaifId} not found` };
                }
                
                const visibilityWindows = [];
                let currentWindow = null;
                
                // Check visibility for each point
                for (const point of trackResult.groundTrack) {
                    // Calculate great circle distance between satellite and ground station
                    const satLat = point.latitude * Math.PI / 180;
                    const satLon = point.longitude * Math.PI / 180;
                    const gsLat = groundStation.latitude * Math.PI / 180;
                    const gsLon = groundStation.longitude * Math.PI / 180;
                    
                    // Haversine formula
                    const dLat = gsLat - satLat;
                    const dLon = gsLon - satLon;
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                              Math.cos(satLat) * Math.cos(gsLat) *
                              Math.sin(dLon/2) * Math.sin(dLon/2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    const distanceKm = centralBody.radius * c;
                    
                    // Calculate elevation angle (simplified)
                    const horizonDistance = Math.sqrt(Math.pow(centralBody.radius + point.altitude, 2) - 
                                                    Math.pow(centralBody.radius, 2));
                    const isVisible = distanceKm < horizonDistance;
                    
                    // Approximate elevation angle
                    let elevationAngle = 0;
                    if (isVisible) {
                        const cosAngle = (Math.pow(distanceKm, 2) + Math.pow(centralBody.radius, 2) - 
                                        Math.pow(centralBody.radius + point.altitude, 2)) / 
                                        (2 * distanceKm * centralBody.radius);
                        elevationAngle = 90 - Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180 / Math.PI;
                    }
                    
                    const meetsElevation = elevationAngle >= minElevation;
                    
                    if (meetsElevation && !currentWindow) {
                        // Start new visibility window
                        currentWindow = {
                            startTime: point.time,
                            startLat: point.latitude,
                            startLon: point.longitude,
                            maxElevation: elevationAngle,
                            points: [point]
                        };
                    } else if (meetsElevation && currentWindow) {
                        // Continue current window
                        currentWindow.maxElevation = Math.max(currentWindow.maxElevation, elevationAngle);
                        currentWindow.points.push(point);
                    } else if (!meetsElevation && currentWindow) {
                        // End current window
                        currentWindow.endTime = trackResult.groundTrack[trackResult.groundTrack.indexOf(point) - 1]?.time || point.time;
                        currentWindow.duration = (new Date(currentWindow.endTime) - new Date(currentWindow.startTime)) / 1000; // seconds
                        visibilityWindows.push(currentWindow);
                        currentWindow = null;
                    }
                }
                
                // Close any open window
                if (currentWindow) {
                    currentWindow.endTime = trackResult.groundTrack[trackResult.groundTrack.length - 1].time;
                    currentWindow.duration = (new Date(currentWindow.endTime) - new Date(currentWindow.startTime)) / 1000;
                    visibilityWindows.push(currentWindow);
                }
                
                return {
                    success: true,
                    groundStation: {
                        name: groundStation.name || 'Ground Station',
                        latitude: groundStation.latitude,
                        longitude: groundStation.longitude,
                        elevation: groundStation.elevation || 0
                    },
                    satelliteId,
                    centralBody: trackResult.centralBody,
                    visibilityWindows,
                    totalWindows: visibilityWindows.length,
                    totalVisibilityTime: visibilityWindows.reduce((sum, w) => sum + w.duration, 0),
                    analysisOptions: {
                        duration: trackResult.duration,
                        minElevation,
                        numPoints: trackResult.numPoints
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // POI VISIBILITY AND PASS PREDICTION
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Get POI visibility for satellites
         * @param {Object} options - { satelliteIds?, planetNaifId?, categories? }
         * @returns {Object} Visibility data including visible POIs per satellite
         */
        getPOIVisibility: async (options = {}) => {
            try {
                const {
                    satelliteIds = null, // null means all satellites
                    planetNaifId = 399, // Default to Earth
                    categories = ['cities', 'airports', 'spaceports', 'groundStations', 'observatories', 'missions']
                } = options;

                // Get planet data
                const bodies = getAllAvailableBodies();
                const planet = bodies.find(b => b.naifId === planetNaifId);
                if (!planet) {
                    return { success: false, error: `Planet ${planetNaifId} not found` };
                }

                // Get satellites
                const allSatellites = window.api.getSatellites();
                if (!allSatellites.success) return allSatellites;

                let satellites = allSatellites.satellites;
                if (satelliteIds) {
                    satellites = satellites.filter(s => satelliteIds.includes(s.id));
                }

                // Filter satellites orbiting the specified planet
                satellites = satellites.filter(s => s.centralBodyNaifId === planetNaifId);

                // Import POI visibility service
                const { POIVisibilityService } = await import('../services/POIVisibilityService.js');

                // Get POI data from planet (if available in app3d)
                const poiData = {};
                let planetObj = null;
                
                // Try to get planet from planet manager
                if (app3d?.planetManager?.getPlanetByNaifId) {
                    planetObj = app3d.planetManager.getPlanetByNaifId(planetNaifId);
                }
                
                // Fallback: try to get from celestial bodies
                if (!planetObj && app3d?.celestialBodies) {
                    planetObj = app3d.celestialBodies.find(b => b.naifId === planetNaifId);
                }
                
                if (planetObj?.surface?.points) {
                    for (const category of categories) {
                        if (planetObj.surface.points[category]) {
                            // Handle different POI data structures
                            const categoryData = planetObj.surface.points[category];
                            if (Array.isArray(categoryData)) {
                                poiData[category] = categoryData.map(poi => {
                                    // Ensure POI has required fields
                                    if (poi.userData?.feature) {
                                        const feat = poi.userData.feature;
                                        const [lon, lat] = feat.geometry.coordinates;
                                        return {
                                            lat,
                                            lon,
                                            name: feat.properties?.name || feat.properties?.NAME
                                        };
                                    } else if (poi.lat !== undefined && poi.lon !== undefined) {
                                        return poi;
                                    } else if (poi.geometry?.coordinates) {
                                        const [lon, lat] = poi.geometry.coordinates;
                                        return {
                                            lat,
                                            lon,
                                            name: poi.properties?.name || poi.properties?.NAME
                                        };
                                    }
                                    return null;
                                }).filter(Boolean);
                            }
                        }
                    }
                }
                
                // If no POI data found, return empty result
                if (Object.keys(poiData).length === 0) {
                    return {
                        success: true,
                        planetNaifId,
                        planet: planet.name,
                        visibility: {},
                        totalSatellitesWithVisibility: 0,
                        message: 'No POI data available for this planet'
                    };
                }

                // Calculate visibility for each satellite
                const visibilityData = {};
                for (const sat of satellites) {
                    if (!sat.latitude || !sat.longitude || sat.surfaceAltitude === undefined) continue;

                    // Calculate coverage radius
                    const altitude = sat.surfaceAltitude;
                    const centralAngle = Math.acos(planet.radius / (planet.radius + altitude));
                    const coverageRadius = centralAngle * (180 / Math.PI);

                    const satelliteData = {
                        lat: sat.latitude,
                        lon: sat.longitude,
                        alt: altitude,
                        coverageRadius,
                        name: sat.name,
                        id: sat.id
                    };

                    // Flatten all POIs
                    const allPOIs = [];
                    Object.entries(poiData).forEach(([category, pois]) => {
                        if (Array.isArray(pois)) {
                            pois.forEach(poi => {
                                if (poi.lat !== undefined && poi.lon !== undefined) {
                                    allPOIs.push({
                                        ...poi,
                                        category
                                    });
                                }
                            });
                        }
                    });

                    // Find visible POIs
                    const visiblePOIs = POIVisibilityService.getVisiblePOIs(allPOIs, satelliteData);
                    
                    if (visiblePOIs.length > 0) {
                        visibilityData[sat.id] = {
                            satellite: satelliteData,
                            visiblePOIs: visiblePOIs,
                            totalCount: visiblePOIs.length,
                            byCategory: visiblePOIs.reduce((acc, poi) => {
                                if (!acc[poi.category]) acc[poi.category] = [];
                                acc[poi.category].push(poi);
                                return acc;
                            }, {})
                        };
                    }
                }

                return {
                    success: true,
                    planetNaifId,
                    planet: planet.name,
                    visibility: visibilityData,
                    totalSatellitesWithVisibility: Object.keys(visibilityData).length
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get pass schedule for a POI and satellite
         * @param {Object} poi - { lat, lon, name? }
         * @param {string|number} satelliteId - Satellite ID
         * @param {Object} options - { duration?, currentTime? }
         * @returns {Object} Pass schedule with AOS/LOS times and quality metrics
         */
        getPOIPassSchedule: async (poi, satelliteId, options = {}) => {
            try {
                if (!poi || poi.lat === undefined || poi.lon === undefined) {
                    return { success: false, error: 'POI must have lat and lon coordinates' };
                }

                const {
                    duration = 86400, // 24 hours default
                    currentTime = app3d?.timeUtils?.getSimulatedTime() || Date.now()
                } = options;

                // Get satellite data
                const satResult = window.api.getSatellite(satelliteId);
                if (!satResult.success) return satResult;

                const satellite = satResult.satellite;
                if (!satellite.centralBodyNaifId) {
                    return { success: false, error: 'Satellite central body not found' };
                }

                // Get ground track
                const trackResult = await window.api.getGroundTrack(satelliteId, {
                    duration,
                    numPoints: Math.max(200, duration / 300) // ~1 point per 5 minutes
                });
                if (!trackResult.success) return trackResult;

                // Import pass prediction service
                const { PassPredictionService } = await import('../services/PassPredictionService.js');

                // Get planet data
                const bodies = getAllAvailableBodies();
                const planet = bodies.find(b => b.naifId === satellite.centralBodyNaifId);
                if (!planet) {
                    return { success: false, error: `Planet ${satellite.centralBodyNaifId} not found` };
                }

                // Calculate coverage radius for the satellite
                const avgAltitude = trackResult.groundTrack.reduce((sum, p) => sum + p.altitude, 0) / trackResult.groundTrack.length;
                const centralAngle = Math.acos(planet.radius / (planet.radius + avgAltitude));
                const coverageRadius = centralAngle * (180 / Math.PI);

                // Find all passes
                const allPasses = PassPredictionService.findPassesForPOI(
                    poi,
                    trackResult.groundTrack,
                    coverageRadius,
                    planet.radius
                );

                // Calculate pass statistics
                const timeWindow = trackResult.duration * 1000; // Convert to ms
                const stats = PassPredictionService.calculatePassStatistics(allPasses, timeWindow);

                // Find next pass
                const nextPass = PassPredictionService.findNextPass(allPasses, currentTime);

                // Find optimal passes
                const optimalPasses = PassPredictionService.findOptimalPasses(allPasses, {
                    minElevation: 30,
                    minDuration: 5
                });

                // Separate passes by time
                const currentPass = allPasses.find(pass => 
                    pass.aos <= currentTime && pass.los >= currentTime
                );
                const upcomingPasses = allPasses.filter(pass => pass.aos > currentTime);
                const pastPasses = allPasses.filter(pass => pass.los < currentTime);

                return {
                    success: true,
                    poi: {
                        latitude: poi.lat,
                        longitude: poi.lon,
                        name: poi.name || 'POI'
                    },
                    satellite: {
                        id: satellite.id,
                        name: satellite.name,
                        centralBody: satellite.centralBody
                    },
                    currentPass,
                    nextPass,
                    upcomingPasses: upcomingPasses.slice(0, 10), // Limit to next 10
                    pastPasses: pastPasses.slice(-5), // Last 5 passes
                    optimalPasses,
                    statistics: stats,
                    analysisOptions: {
                        duration,
                        coverageRadius,
                        planetRadius: planet.radius
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get satellite coverage analysis for multiple POIs
         * @param {string|number} satelliteId - Satellite ID
         * @param {Array<Object>} pois - Array of POIs with { lat, lon, name? }
         * @param {Object} options - { duration?, currentTime? }
         * @returns {Object} Coverage analysis for all POIs
         */
        getMultiplePOICoverage: async (satelliteId, pois, options = {}) => {
            try {
                if (!Array.isArray(pois) || pois.length === 0) {
                    return { success: false, error: 'POIs must be a non-empty array' };
                }

                const results = await Promise.all(
                    pois.map(poi => window.api.getPOIPassSchedule(poi, satelliteId, options))
                );

                const successful = results.filter(r => r.success);
                const failed = results.filter(r => !r.success);

                // Aggregate statistics
                const totalPasses = successful.reduce((sum, r) => sum + r.statistics.totalPasses, 0);
                const totalCoverageTime = successful.reduce((sum, r) => sum + r.statistics.totalCoverageTime, 0);
                const avgPassDuration = totalPasses > 0 ? totalCoverageTime / totalPasses / 60000 : 0; // minutes

                return {
                    success: true,
                    satelliteId,
                    coverageResults: successful,
                    failures: failed.map((r, i) => ({
                        poi: pois[results.indexOf(r)],
                        error: r.error
                    })),
                    aggregateStatistics: {
                        totalPOIs: pois.length,
                        coveredPOIs: successful.length,
                        totalPasses,
                        totalCoverageTime,
                        avgPassDuration,
                        coveragePercentage: (successful.length / pois.length) * 100
                    }
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Get real-time POI visibility status
         * @param {Object} options - { satelliteIds?, categories?, planetNaifId? }
         * @returns {Object} Current visibility status with communication quality estimates
         */
        getCurrentPOIVisibility: async (options = {}) => {
            try {
                // Get basic visibility data
                const visibilityResult = await window.api.getPOIVisibility(options);
                if (!visibilityResult.success) return visibilityResult;

                // Enhance with communication quality estimates
                const enhancedVisibility = {};
                
                for (const [satId, data] of Object.entries(visibilityResult.visibility)) {
                    const satellite = data.satellite;
                    const planetRadius = visibilityResult.planet === 'Earth' ? 6371 : 
                                       visibilityResult.planet === 'Moon' ? 1737 : 
                                       visibilityResult.planet === 'Mars' ? 3390 : 6371;

                    enhancedVisibility[satId] = {
                        ...data,
                        visiblePOIsWithQuality: data.visiblePOIs.map(poi => {
                            // Calculate slant range and elevation angle
                            const angle = window.api.greatCircleDistance(
                                poi.lat, poi.lon,
                                satellite.lat, satellite.lon
                            ) * Math.PI / 180;

                            const cosAngle = Math.cos(angle);
                            const radiusRatio = planetRadius / (planetRadius + satellite.alt);
                            const sinEl = cosAngle - radiusRatio;
                            
                            let elevationAngle = 0;
                            if (sinEl > 0) {
                                elevationAngle = Math.asin(sinEl) * 180 / Math.PI;
                            }

                            const slantRange = Math.sqrt(
                                planetRadius * planetRadius + 
                                (planetRadius + satellite.alt) * (planetRadius + satellite.alt) - 
                                2 * planetRadius * (planetRadius + satellite.alt) * Math.cos(angle)
                            );

                            // Estimate link quality
                            let quality = 'Poor';
                            if (elevationAngle > 45) quality = 'Excellent';
                            else if (elevationAngle > 30) quality = 'Good';
                            else if (elevationAngle > 15) quality = 'Fair';
                            else if (elevationAngle > 5) quality = 'Marginal';

                            return {
                                ...poi,
                                slantRange,
                                elevationAngle,
                                linkQuality: quality,
                                pathLoss: 20 * Math.log10(slantRange * 1000) + 20 * Math.log10(2400e6) - 147.55
                            };
                        })
                    };
                }

                return {
                    success: true,
                    ...visibilityResult,
                    visibility: enhancedVisibility,
                    timestamp: new Date().toISOString()
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Helper function: Calculate great circle distance
         * @private
         */
        greatCircleDistance: (lat1, lon1, lat2, lon2) => {
            const phi1 = lat1 * Math.PI / 180;
            const phi2 = lat2 * Math.PI / 180;
            const deltaPhi = (lat2 - lat1) * Math.PI / 180;
            const deltaLambda = (lon2 - lon1) * Math.PI / 180;

            const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                      Math.cos(phi1) * Math.cos(phi2) *
                      Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

            return c * 180 / Math.PI; // Return in degrees
        },

        // ═══════════════════════════════════════════════════════════════════
        // DIAGNOSTICS AND TESTING
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Test API connectivity and return diagnostic information
         * @returns {Object} Diagnostic information about available systems
         */
        testAPI: () => {
            try {
                const diagnostics = {
                    timestamp: new Date().toISOString(),
                    apiVersion: '2.0',
                    systems: {}
                };

                // Test app3d availability
                diagnostics.systems.app3d = {
                    available: !!app3d,
                    components: {
                        satellites: !!app3d?.satellites,
                        physicsIntegration: !!app3d?.physicsIntegration,
                        planetManager: !!app3d?.planetManager,
                        timeUtils: !!app3d?.timeUtils,
                        cameraControls: !!app3d?.cameraControls,
                        displaySettingsManager: !!app3d?.displaySettingsManager,
                        celestialBodies: !!app3d?.celestialBodies
                    }
                };

                // Test physics engine
                if (app3d?.physicsIntegration) {
                    diagnostics.systems.physics = {
                        available: true,
                        components: {
                            satellites: !!app3d.physicsIntegration.satellites,
                            satelliteEngine: !!app3d.physicsIntegration.satelliteEngine,
                            subsystemManager: !!app3d.physicsIntegration.subsystemManager,
                            bodies: !!app3d.physicsIntegration.bodies
                        }
                    };
                }

                // Test data availability
                try {
                    const bodies = getAllAvailableBodies();
                    diagnostics.data = {
                        celestialBodies: bodies.length,
                        satellites: app3d?.satellites?.getSatellitesMap()?.size || 0
                    };
                } catch (e) {
                    diagnostics.data = { error: e.message };
                }

                // Test functions
                diagnostics.functions = {
                    satellite: {
                        getSatellites: typeof window.api.getSatellites === 'function',
                        getSatellite: typeof window.api.getSatellite === 'function',
                        getCurrentPositions: typeof window.api.getCurrentPositions === 'function',
                        createSatelliteFromOrbitalElements: typeof window.api.createSatelliteFromOrbitalElements === 'function',
                        createSatelliteFromLatLon: typeof window.api.createSatelliteFromLatLon === 'function',
                        createSatelliteFromLatLonCircular: typeof window.api.createSatelliteFromLatLonCircular === 'function',
                        deleteSatellite: typeof window.api.deleteSatellite === 'function'
                    },
                    celestialBodies: {
                        getCelestialBodies: typeof window.api.getCelestialBodies === 'function',
                        getCelestialBodyInfo: typeof window.api.getCelestialBodyInfo === 'function',
                        getCelestialBody: typeof window.api.getCelestialBody === 'function'
                    },
                    groundtrack: {
                        getGroundTrack: typeof window.api.getGroundTrack === 'function',
                        getGroundTrackCoverage: typeof window.api.getGroundTrackCoverage === 'function',
                        getPOIVisibility: typeof window.api.getPOIVisibility === 'function',
                        getPOIPassSchedule: typeof window.api.getPOIPassSchedule === 'function',
                        getCurrentPOIVisibility: typeof window.api.getCurrentPOIVisibility === 'function'
                    },
                    simulation: {
                        getSimulationTime: typeof window.api.getSimulationTime === 'function',
                        setSimulationTime: typeof window.api.setSimulationTime === 'function',
                        getTimeWarp: typeof window.api.getTimeWarp === 'function',
                        setTimeWarp: typeof window.api.setTimeWarp === 'function'
                    },
                    communications: {
                        getSatelliteComms: typeof window.api.getSatelliteComms === 'function',
                        getCommunicationLinks: typeof window.api.getCommunicationLinks === 'function',
                        updateCommsConfig: typeof window.api.updateCommsConfig === 'function',
                        applyCommsPreset: typeof window.api.applyCommsPreset === 'function'
                    },
                    maneuvers: {
                        addManeuverNode: typeof window.api.addManeuverNode === 'function',
                        getManeuverNodes: typeof window.api.getManeuverNodes === 'function',
                        deleteManeuverNode: typeof window.api.deleteManeuverNode === 'function',
                        calculateHohmannTransfer: typeof window.api.calculateHohmannTransfer === 'function'
                    }
                };

                return {
                    success: true,
                    diagnostics
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message,
                    stack: error.stack
                };
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