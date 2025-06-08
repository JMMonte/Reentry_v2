import { SolarSystemHierarchy } from './SolarSystemHierarchy.js';
import { StateVectorCalculator } from './StateVectorCalculator.js';
import { PositionManager } from './PositionManager.js';
import { solarSystemDataManager } from './PlanetaryDataManager.js';
import { PhysicsConstants } from './core/PhysicsConstants.js';
import { SubsystemManager } from './subsystems/SubsystemManager.js';
import { SatelliteEngine } from './engines/SatelliteEngine.js';
import { CelestialBodyEngine } from './engines/CelestialBodyEngine.js';


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
        this.satelliteEngine = new SatelliteEngine();

        // Celestial body engine - handles all celestial body operations
        this.celestialBodyEngine = new CelestialBodyEngine();

        // Delegate storage to respective engines for backward compatibility
        this.satellites = this.satelliteEngine.satellites;
        this.maneuverNodes = this.satelliteEngine.maneuverNodes;

        // Delegate body/barycenter storage to CelestialBodyEngine
        this.bodies = this.celestialBodyEngine.bodies;
        this.barycenters = this.celestialBodyEngine.barycenters;

        // Subsystem manager for physics-based satellite subsystems
        this.subsystemManager = null;
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

        // Don't update simulation time here - it's already been set by setTime()
        // this.simulationTime = new Date(this.simulationTime.getTime() + actualDeltaTime * 1000);

        // Update all body positions and orientations
        // Note: Body positions are already updated by setTime(), so we skip this
        // await this._updateAllBodies();

        // Update barycenters are already updated by setTime()
        // this._updateBarycenters();

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
        return {
            time: this.simulationTime,
            bodies: this.celestialBodyEngine.getBodyStates(),
            satellites: this.satelliteEngine.getSatelliteStates(this.bodies, this.simulationTime),
            barycenters: this.celestialBodyEngine.getBarycenterStates(),
            hierarchy: this.hierarchy?.hierarchy || null
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

        // Add default communication subsystem to all satellites
        if (this.subsystemManager) {
            this.subsystemManager.addSubsystem(id, 'communication', {
                // Default communication configuration
                antennaGain: 12.0,
                transmitPower: 10.0,
                transmitFrequency: 2.4,
                dataRate: 1000,
                protocols: ['inter_satellite', 'ground_station']
            });
        } else {
            console.warn(`[PhysicsEngine] No subsystemManager available when creating satellite ${id}`);
        }

        return id;
    }

    /**
     * Remove satellite - DELEGATED TO SatelliteEngine
     */
    removeSatellite(id) {
        const strId = String(id);

        // Remove all subsystems for this satellite
        if (this.subsystemManager) {
            this.subsystemManager.removeSatellite(strId);
        }

        return this.satelliteEngine.removeSatellite(id);
    }

    /**
     * Update satellite UI properties - DELEGATED TO SatelliteEngine
     */
    updateSatelliteProperty(id, property, value) {
        return this.satelliteEngine.updateSatelliteProperty(id, property, value);
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
    cleanup() {
        if (this.subsystemManager) {
            this.subsystemManager.cleanup?.();
        }
        if (this.satelliteEngine) {
            this.satelliteEngine.cleanup?.();
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

}