import { SolarSystemHierarchy } from './SolarSystemHierarchy.js';
import { StateVectorCalculator } from './StateVectorCalculator.js';
import { PositionManager } from './PositionManager.js';
import { solarSystemDataManager } from './PlanetaryDataManager.js';
import { PhysicsConstants } from './core/PhysicsConstants.js';
import { SubsystemManager } from './subsystems/SubsystemManager.js';
import { SatelliteEngine } from './engines/SatelliteEngine.js';
import { CelestialBodyEngine } from './engines/CelestialBodyEngine.js';
import { PassPredictionEngine } from './engines/PassPredictionEngine.js';
import { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
import * as PhysicsAPI from './PhysicsAPI.js';
import { GroundTrackProjectionService } from './services/GroundTrackProjectionService.js';
// PropagationMetrics import removed - using stub data for performance optimization


/**
 * Physics Engine
 * 
 * Clean, modular architecture with separated concerns:
 * - SolarSystemHierarchy: manages parent-child relationships
 * - StateVectorCalculator: handles orbital mechanics
 * - PositionManager: handles hierarchical positioning
 * - OrientationCalculator: handles rotation and axial tilt
 */
export class PhysicsEngine {
    constructor() {
        // Core modules will be initialized in initialize()
        this.hierarchy = null;
        this.stateCalculator = null;
        this.positionManager = null;

        // Simulation state
        this.simulationTime = new Date();
        this.timeStep = PhysicsConstants.SIMULATION.DEFAULT_TIME_STEP;

        // Satellite engine - handles all satellite operations
        this.satelliteEngine = new SatelliteEngine(this);
        
        // Set up references for satellite engine after PhysicsAPI is available
        // This will be done in initialize() after modules are ready

        // Celestial body engine - handles all celestial body operations
        this.celestialBodyEngine = new CelestialBodyEngine();

        // Pass prediction engine - handles POI pass calculations
        this.passPredictionEngine = new PassPredictionEngine(this);

        // Delegate storage to respective engines for backward compatibility
        this.satellites = this.satelliteEngine.satellites;
        this.maneuverNodes = this.satelliteEngine.maneuverNodes;

        // Delegate body/barycenter storage to CelestialBodyEngine
        this.bodies = this.celestialBodyEngine.bodies;
        this.barycenters = this.celestialBodyEngine.barycenters;

        // Subsystem manager for physics-based satellite subsystems
        this.subsystemManager = null;

        this.groundTrackProjectionService = new GroundTrackProjectionService();

        // Expose methods to window for React components
        this._exposePerformanceMetrics();
    }

    /**
     * Initialize the physics engine
     */
    async initialize(initialTime = new Date()) {
        if (!solarSystemDataManager.initialized) {
            await solarSystemDataManager.initialize();
        }

        // Expose solarSystemDataManager for legacy compatibility
        this.solarSystemDataManager = solarSystemDataManager;

        // Initialize core modules with the loaded config
        this.hierarchy = new SolarSystemHierarchy(solarSystemDataManager.naifToBody);
        this.stateCalculator = new StateVectorCalculator(this.hierarchy, solarSystemDataManager.naifToBody);
        this.positionManager = new PositionManager(this.hierarchy, this.stateCalculator);

        // Initialize celestial body engine
        this.celestialBodyEngine.initialize(this.hierarchy, this.stateCalculator, this.positionManager);

        this.simulationTime = new Date(initialTime.getTime());

        // Update all positions using the celestial body engine
        const result = await this.celestialBodyEngine.updateAllBodies(this.simulationTime, solarSystemDataManager.naifToBody);
        this.bodies = result.bodies;
        this.barycenters = result.barycenters;

        // Initialize subsystem manager after physics engine is ready
        this.subsystemManager = new SubsystemManager(this);

        // Now that all modules are initialized, set up PhysicsAPI reference for satellite engine
        this.satelliteEngine.setPhysicsAPI(PhysicsAPI);

        // Expose performance metrics to window for React components
        this._exposePerformanceMetrics();

        return this;
    }

    /**
     * Advance the simulation by one time step
     * @param {number} deltaTime - Time step in seconds
     * @param {number} timeWarp - Current time warp factor
     */
    async step(deltaTime, timeWarp = 1) {
        const actualDeltaTime = deltaTime || this.timeStep;

        // Only log if deltaTime exceeds 1 day (86400 seconds)
        // High timewarps are expected to have very large timesteps
        const warningThreshold = 86400.0; // 1 day

        if (actualDeltaTime > warningThreshold) {
            console.warn(`[PhysicsEngine] Very large deltaTime in step(): ${actualDeltaTime} seconds (${(actualDeltaTime / 86400).toFixed(2)} days)`);
        }

        // Advance simulation time by deltaTime * timeWarp
        const timeAdvanceMs = actualDeltaTime * timeWarp * 1000;
        this.simulationTime = new Date(this.simulationTime.getTime() + timeAdvanceMs);
        
        // Update all body positions for the new simulation time
        const result = await this.celestialBodyEngine.updateAllBodies(this.simulationTime);
        this.bodies = result.bodies;
        this.barycenters = result.barycenters;

        // Only integrate satellite dynamics - delegate to SatelliteEngine
        await this.satelliteEngine.integrateSatellites(
            actualDeltaTime,
            this.bodies,
            this.hierarchy,
            this.simulationTime,
            this.subsystemManager,
            timeWarp
        );

        // Update all satellite subsystems
        if (this.subsystemManager) {
            this.subsystemManager.update(actualDeltaTime);
        }

        // Update pass predictions (centralized calculation)
        if (this.passPredictionEngine) {
            this.passPredictionEngine.updatePasses(this.simulationTime);
        }

        return {
            time: this.simulationTime,
            bodies: this.celestialBodyEngine.getBodyStates(),
            satellites: this.satelliteEngine.getSatelliteStates(this.bodies, this.simulationTime),
            barycenters: this.celestialBodyEngine.getBarycenterStates()
        };
    }

    /**
     * Set simulation time and immediately update all body positions
     */
    async setTime(newTime) {
        if (!newTime || !(newTime instanceof Date) || isNaN(newTime.getTime())) {
            return;
        }

        this.simulationTime = new Date(newTime.getTime());
        const result = await this.celestialBodyEngine.updateAllBodies(this.simulationTime);
        this.bodies = result.bodies;
        this.barycenters = result.barycenters;
    }

    /**
     * Get current simulation state
     */
    getSimulationState() {
        const bodies = this.celestialBodyEngine.getBodyStates();
        const satellites = this.satelliteEngine.getSatelliteStates(
            this.bodies, 
            this.simulationTime, 
            this.getBodiesForOrbitPropagation.bind(this)
        );

        // Generate ground track projections for all satellites
        const groundTracks = this.groundTrackProjectionService.projectSatellitesToGroundTracks(
            satellites,
            bodies,
            this.simulationTime
        );

        return {
            time: this.simulationTime,
            bodies: bodies,
            satellites: satellites,
            barycenters: this.celestialBodyEngine.getBarycenterStates(),
            hierarchy: this.hierarchy?.hierarchy || null,
            groundTracks: groundTracks // Add ground track data organized by planet NAIF ID
        };
    }

    /**
     * Get current simulation time
     */
    getSimulatedTime() {
        return this.simulationTime;
    }


    /**
     * Add satellite (planet-centric version) - DELEGATED TO SatelliteEngine
     * @param {Object} satellite - Must include centralBodyNaifId (the NAIF ID of the central body)
     */
    addSatellite(satellite) {
        const id = this.satelliteEngine.addSatellite(
            satellite,
            this.bodies,
            this.simulationTime,
            this._findAppropriateSOI.bind(this)
        );

        // Add communication subsystem with user-provided or default configuration
        let finalCommsConfig = null;
        if (this.subsystemManager) {
            const commsConfig = satellite.commsConfig || {};
            finalCommsConfig = {
                // Use provided config or defaults
                enabled: commsConfig.enabled ?? true,
                antennaGain: commsConfig.antennaGain ?? 12.0,
                transmitPower: commsConfig.transmitPower ?? 10.0,
                transmitFrequency: commsConfig.transmitFrequency ?? 2.4,
                dataRate: commsConfig.dataRate ?? 1000,
                antennaType: commsConfig.antennaType ?? 'omnidirectional',
                minElevationAngle: commsConfig.minElevationAngle ?? 5.0,
                networkId: commsConfig.networkId ?? 'default',
                encryption: commsConfig.encryption ?? true,
                protocols: ['inter_satellite', 'ground_station']
            };
            this.subsystemManager.addSubsystem(id, 'communication', finalCommsConfig);
        } else {
            console.warn(`[PhysicsEngine] No subsystemManager available when creating satellite ${id}`);
        }

        // Get the created satellite data for the event
        const createdSatellite = this.satellites.get(id);
        if (createdSatellite) {
            // Dispatch satelliteAdded event for UI synchronization
            this._dispatchSatelliteEvent('satelliteAdded', {
                id,
                name: createdSatellite.name,
                position: createdSatellite.position.toArray(),
                velocity: createdSatellite.velocity.toArray(),
                mass: createdSatellite.mass,
                color: createdSatellite.color,
                centralBodyNaifId: createdSatellite.centralBodyNaifId,
                size: createdSatellite.size,
                crossSectionalArea: createdSatellite.crossSectionalArea,
                dragCoefficient: createdSatellite.dragCoefficient,
                commsConfig: finalCommsConfig || satellite.commsConfig || { preset: 'cubesat', enabled: true }
            });
        }

        return id;
    }

    /**
     * Remove satellite - DELEGATED TO SatelliteEngine
     */
    removeSatellite(id) {
        const strId = String(id);

        // Get satellite data before removal for the event
        const satellite = this.satellites.get(strId);

        // Remove all subsystems for this satellite
        if (this.subsystemManager) {
            this.subsystemManager.removeSatellite(strId);
        }

        const result = this.satelliteEngine.removeSatellite(id);

        // Dispatch satelliteRemoved event for UI synchronization
        if (satellite) {
            this._dispatchSatelliteEvent('satelliteRemoved', { id: strId });
        }

        return result;
    }

    /**
     * Update satellite UI properties - DELEGATED TO SatelliteEngine
     */
    updateSatelliteProperty(id, property, value) {
        const result = this.satelliteEngine.updateSatelliteProperty(id, property, value);
        
        // Dispatch satellitePropertyUpdated event for UI synchronization
        this._dispatchSatelliteEvent('satellitePropertyUpdated', {
            id: String(id),
            property,
            value
        });
        
        return result;
    }

    /**
     * Dispatch satellite events for UI synchronization
     */
    _dispatchSatelliteEvent(eventType, data) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(eventType, { detail: data }));
        }
    }

    /**
     * Add a maneuver node for a satellite
     * @param {string} satelliteId - Satellite ID
     * @param {Object} maneuverNode - Maneuver node DTO
     * @returns {string} Node ID
     */
    addManeuverNode(satelliteId, maneuverNode) {
        return this.satelliteEngine.addManeuverNode(satelliteId, maneuverNode);
    }


    /**
     * Remove a maneuver node
     * @param {string} satelliteId - Satellite ID
     * @param {string} nodeId - Node ID to remove
     */
    removeManeuverNode(satelliteId, nodeId) {
        return this.satelliteEngine.removeManeuverNode(satelliteId, nodeId);
    }

    /**
     * Get maneuver nodes for a satellite
     * @param {string} satelliteId - Satellite ID
     * @returns {Array} Maneuver nodes
     */
    getManeuverNodes(satelliteId) {
        return this.satelliteEngine.getManeuverNodes(satelliteId);
    }


    /**
     * Find the appropriate SOI for a given global position
     * Returns the NAIF ID of the body whose SOI contains the position
     */
    _findAppropriateSOI(globalPos) {
        return this.celestialBodyEngine.findAppropriateSOI(globalPos);
    }


    /**
     * Get all celestial bodies as plain JS objects for line-of-sight calculations
     * Returns: [{ id, name, position: [x, y, z], radius }]
     */
    getBodiesForLineOfSight() {
        return this.celestialBodyEngine.getBodiesForLineOfSight();
    }

    /**
     * Get body data for orbital calculations
     * Returns: [{ id, name, position: [x, y, z], mass, GM, naifId }]
     */
    getBodiesForOrbitPropagation() {
        return this.celestialBodyEngine.getBodiesForOrbitPropagation(this.simulationTime);
    }

    /**
     * Get all satellites as plain JS objects for line-of-sight calculations
     * Returns: [{ id, position: [x, y, z] }] where position is absolute in solar system coordinates
     */
    getSatellitesForLineOfSight() {
        const sats = [];
        for (const [id, sat] of this.satellites) {
            if (!sat || typeof sat.position?.toArray !== 'function') continue;

            // Get satellite's relative position
            const relativePos = sat.position.toArray();

            // Get central body's absolute position to transform to absolute coordinates
            const centralBody = this.bodies[sat.centralBodyNaifId];
            let absolutePos = relativePos;

            if (centralBody && centralBody.position) {
                const centralBodyPos = centralBody.position.toArray();
                absolutePos = [
                    relativePos[0] + centralBodyPos[0],
                    relativePos[1] + centralBodyPos[1],
                    relativePos[2] + centralBodyPos[2]
                ];
            }

            sats.push({
                id,
                position: absolutePos,
                centralBodyNaifId: sat.centralBodyNaifId // Include for debugging
            });
        }
        return sats;
    }

    /**
     * Cleanup function to call on removal
     */
    async cleanup() {
        if (this.subsystemManager) {
            this.subsystemManager.cleanup?.();
        }
        if (this.satelliteEngine) {
            await this.satelliteEngine.cleanup?.();
        }
        if (this.celestialBodyEngine) {
            this.celestialBodyEngine.cleanup?.();
        }
    }


    /**
     * Create satellite from geographic coordinates using consistent physics engine data
     * This is the centralized, authoritative method for satellite creation
     * @param {Object} params - Satellite parameters including lat, lon, altitude, etc.
     * @param {number} centralBodyNaifId - NAIF ID of the central body
     * @returns {Object} - { id, position, velocity } in planet-centric inertial coordinates
     */
    createSatelliteFromGeographic(params, centralBodyNaifId = 399) {
        return this.satelliteEngine.createSatelliteFromGeographic(
            params,
            centralBodyNaifId,
            this.bodies,
            this.simulationTime,
            this.getBodiesForOrbitPropagation.bind(this),
            this.addSatellite.bind(this)
        );
    }

    createSatelliteFromOrbitalElements(params, centralBodyNaifId = 399) {
        return this.satelliteEngine.createSatelliteFromOrbitalElements(
            params,
            centralBodyNaifId,
            this.bodies,
            this.getBodiesForOrbitPropagation.bind(this),
            this.addSatellite.bind(this)
        );
    }

    /**
     * Propagate orbit for a satellite (synchronous fallback for frontend)
     * This provides a centralized physics API for orbit propagation without workers
     * @param {string} satelliteId - Satellite ID
     * @param {Object} options - Propagation options
     * @returns {Array} Orbit points
     */
    propagateOrbit(satelliteId, options = {}) {
        const satellite = this.satelliteEngine.satellites.get(satelliteId);
        if (!satellite) {
            throw new Error(`Satellite ${satelliteId} not found`);
        }

        // Convert bodies to format expected by UnifiedSatellitePropagator
        const bodies = {};
        for (const [naifId, body] of Object.entries(this.bodies)) {
            bodies[naifId] = {
                naifId: parseInt(naifId),
                position: body.position.toArray(),
                velocity: body.velocity.toArray(),
                mass: body.mass,
                radius: body.radius,
                GM: body.GM,
                J2: body.J2,
                type: body.type
            };
        }

        // Get current simulation time
        const currentSimTime = this.simulationTime || new Date();
        const startTimeSeconds = currentSimTime.getTime() / 1000; // Convert to seconds since epoch

        const propagationParams = {
            satellite: {
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                centralBodyNaifId: satellite.centralBodyNaifId,
                mass: satellite.mass,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient
            },
            bodies,
            duration: options.duration || 5400,
            timeStep: options.timeStep || 60,
            startTime: startTimeSeconds, // Use current simulation time
            maxPoints: options.maxPoints,
            includeJ2: options.includeJ2 !== false,
            includeDrag: options.includeDrag !== false,
            includeThirdBody: options.includeThirdBody !== false,
            method: options.method || this.satelliteEngine.getIntegrationMethod(),
            perturbationScale: options.perturbationScale || 1.0
        };

        // Use UnifiedSatellitePropagator directly (physics layer can do this)
        return UnifiedSatellitePropagator.propagateOrbit(propagationParams);
    }

    /**
     * Expose essential API to window for React components
     * @private
     */
    _exposePerformanceMetrics() {
        if (typeof window !== 'undefined') {
            if (!window.physicsAPI) {
                window.physicsAPI = {};
            }
            
            // Expose worker control methods (essential functionality)
            window.physicsAPI.setUseWorkers = (useWorkers) => {
                this.satelliteEngine.setUseWorkers(useWorkers);
            };
            
            // Expose debug methods (essential for debugging)
            window.physicsAPI.debugCelestialBodies = () => {
                return {
                    bodiesCount: Object.keys(this.bodies).length,
                    bodies: this.bodies,
                    barycentersCount: this.barycenters?.size || 0,
                    barycenters: this.barycenters
                };
            };
        }
    }

}