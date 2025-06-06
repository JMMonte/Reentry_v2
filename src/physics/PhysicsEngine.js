import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { SolarSystemHierarchy } from './SolarSystemHierarchy.js';
import { StateVectorCalculator } from './StateVectorCalculator.js';
import { PositionManager } from './PositionManager.js';
import { solarSystemDataManager } from './PlanetaryDataManager.js';
// Note: No longer importing Constants.js - using PhysicsConstants instead
import { OrbitalMechanics } from './core/OrbitalMechanics.js';
import { PhysicsConstants } from './core/PhysicsConstants.js';
import { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
import { SubsystemManager } from './subsystems/SubsystemManager.js';

// Extract the functions we need from the Astronomy module
const { MakeTime, RotationAxis, Rotation_EQJ_ECL, RotateVector, GeoVector, VectorObserver } = Astronomy;

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

        // Body storage
        this.bodies = {};

        // Satellite tracking (unchanged from original)
        this.satellites = new Map();
        
        // Maneuver node tracking
        this.maneuverNodes = new Map(); // Map<satelliteId, ManeuverNodeDTO[]>

        // Barycenter calculations
        this.barycenters = new Map();
        
        // Subsystem manager for physics-based satellite subsystems
        this.subsystemManager = null;
        
        // Performance optimization caches with size limits
        this._satelliteInfluenceCache = new Map(); // Cache significant bodies per satellite
        this._bodyDistanceCache = new Map(); // Cache body distances
        this._lastCacheUpdate = 0;
        this._cacheValidityPeriod = 5000; // 5 seconds
        this._maxCacheSize = 100; // Maximum entries per cache
        this._cacheCleanupThreshold = 150; // Clean up when size exceeds this
        
        // Pre-allocated vectors for calculations to avoid GC pressure
        this._tempVectors = {
            satGlobalPos: new THREE.Vector3(),
            bodyDistance: new THREE.Vector3(),
            acceleration: new THREE.Vector3(),
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3()
        };
    }

    /**
     * Initialize the physics engine
     */
    async initialize(initialTime = new Date()) {
        if (!solarSystemDataManager.initialized) {
            await solarSystemDataManager.initialize();
        }

        // Initialize core modules with the loaded config
        this.hierarchy = new SolarSystemHierarchy(solarSystemDataManager.naifToBody);
        this.stateCalculator = new StateVectorCalculator(this.hierarchy, solarSystemDataManager.naifToBody);
        this.positionManager = new PositionManager(this.hierarchy, this.stateCalculator);

        this.simulationTime = new Date(initialTime.getTime());

        // Update all positions using the new modular system
        await this._updateAllBodies();
        this._updateBarycenters();
        
        // Initialize subsystem manager after physics engine is ready
        this.subsystemManager = new SubsystemManager(this);

        return this;
    }

    /**
     * Advance the simulation by one time step
     */
    async step(deltaTime) {
        const actualDeltaTime = deltaTime || this.timeStep;
        
        // Only log if unusually large time step
        if (actualDeltaTime > PhysicsConstants.SIMULATION.LARGE_TIME_STEP_WARNING) {
            console.warn(`[PhysicsEngine] Large deltaTime in step(): ${actualDeltaTime} seconds`);
        }

        // Don't update simulation time here - it's already been set by setTime()
        // this.simulationTime = new Date(this.simulationTime.getTime() + actualDeltaTime * 1000);

        // Update all body positions and orientations
        // Note: Body positions are already updated by setTime(), so we skip this
        // await this._updateAllBodies();

        // Update barycenters are already updated by setTime()
        // this._updateBarycenters();

        // Only integrate satellite dynamics
        await this._integrateSatellites(actualDeltaTime);
        
        // Update all satellite subsystems
        if (this.subsystemManager) {
            this.subsystemManager.update(actualDeltaTime);
        }

        return {
            time: this.simulationTime,
            bodies: this._getBodyStates(),
            satellites: this._getSatelliteStates(),
            barycenters: this._getBarycenterStates()
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
        await this._updateAllBodies();
        this._updateBarycenters();
    }

    /**
     * Get current simulation state
     */
    getSimulationState() {
        return {
            time: this.simulationTime,
            bodies: this._getBodyStates(),
            satellites: this._getSatelliteStates(),
            barycenters: this._getBarycenterStates(),
            hierarchy: this.hierarchy?.hierarchy || null
        };
    }

    /**
     * Update all bodies using the modular system
     */
    async _updateAllBodies() {
        // Get all body configurations from PlanetaryDataManager
        const bodyConfigs = solarSystemDataManager.naifToBody;

        // Use PositionManager to update all positions hierarchically
        const updatedBodies = this.positionManager.updateAllPositions(this.simulationTime, bodyConfigs);

        // Calculate orientations for all bodies and ensure type information is preserved
        for (const body of Object.values(updatedBodies)) {
            const orientation = this._calculateBodyOrientation(body.name, this.simulationTime);
            body.quaternion = orientation.quaternion;
            body.poleRA = orientation.poleRA;
            body.poleDec = orientation.poleDec;
            body.spin = orientation.spin;
            body.northPole = orientation.northPole;
            
            // Ensure type information is preserved from body configuration
            const bodyConfig = solarSystemDataManager.getBodyByNaif(body.naif_id) || solarSystemDataManager.getBodyByName(body.name);
            if (bodyConfig) {
                body.type = bodyConfig.type;
                // Copy physics-related properties
                body.J2 = bodyConfig.J2;
                body.atmosphericModel = bodyConfig.atmosphericModel;
                body.GM = bodyConfig.GM;
                body.soiRadius = bodyConfig.soiRadius;
                body.rotationPeriod = bodyConfig.rotationPeriod;
                // Don't modify barycenter mass/GM - let them keep original values for orbital calculations
                // Physics filtering will handle excluding them from gravitational forces
            }
        }

        // Store the updated bodies
        this.bodies = updatedBodies;
    }

    /**
     * Calculate body orientation (extracted from original PhysicsEngine)
     */
    _calculateBodyOrientation(bodyIdentifier, time) {
        try {
            if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
                time = new Date();
            }

            let actualBodyNameForAE = bodyIdentifier;
            const bodyConfig = solarSystemDataManager.getBodyByName(bodyIdentifier) ||
                solarSystemDataManager.getBodyByNaif(parseInt(bodyIdentifier));
            if (bodyConfig && bodyConfig.astronomyEngineName) {
                actualBodyNameForAE = bodyConfig.astronomyEngineName;
            }

            // Special handling for Earth-Moon Barycenter - use Earth's orientation
            if (actualBodyNameForAE === 'EMB' || bodyIdentifier === 'emb') {
                actualBodyNameForAE = 'Earth';
            }

            const astroTime = MakeTime(time);

            // Try Astronomy Engine first
            try {
                const axisInfo = RotationAxis(actualBodyNameForAE, astroTime);
                return this._createOrientationFromAxisInfo(axisInfo, astroTime, actualBodyNameForAE);
            } catch {
                // Fall back to manual calculation using config data
                return this._calculateOrientationFromConfig(bodyConfig, time);
            }
        } catch {
            // Return identity quaternion as fallback
            return {
                quaternion: new THREE.Quaternion(),
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: new THREE.Vector3(0, 0, 1)
            };
        }
    }

    /**
     * Create orientation from Astronomy Engine axis info
     */
    _createOrientationFromAxisInfo(axisInfo, astroTime, bodyIdentifier) {
        // Convert RA from hours to radians (15° per hour)
        const raRad = axisInfo.ra * (Math.PI / 12);
        const decRad = axisInfo.dec * (Math.PI / 180);
        // Normalize spin to [0, 360) degrees, then convert to [0, 2π) radians
        let normalizedSpin = ((axisInfo.spin % 360) + 360) % 360;
        
        // Earth requires special handling due to Astronomy Engine's reference frame
        // Astronomy Engine's Earth spin is ~90° behind GMST (Greenwich Mean Sidereal Time)
        // At spin=0°, prime meridian faces 90° west of vernal equinox
        // We need to add 90° to align with the standard expectation:
        // - GMST=0h should mean prime meridian faces vernal equinox
        // - This ensures our equirectangular texture (PM at center) displays correctly
        if (bodyIdentifier === 'Earth' || bodyIdentifier === 'earth') {
            normalizedSpin = ((normalizedSpin + 90) % 360 + 360) % 360;
        }
        
        const spinRad = normalizedSpin * (Math.PI / 180);

        // Create the pole direction vector in J2000 equatorial coordinates
        const poleX_eqj = Math.cos(decRad) * Math.cos(raRad);
        const poleY_eqj = Math.cos(decRad) * Math.sin(raRad);
        const poleZ_eqj = Math.sin(decRad);

        // Transform pole vector from J2000 equatorial to J2000 ecliptic
        const poleVector_eqj = {
            x: poleX_eqj,
            y: poleY_eqj,
            z: poleZ_eqj,
            t: astroTime
        };

        const rotationMatrix = Rotation_EQJ_ECL();
        const poleVector_ecl = RotateVector(rotationMatrix, poleVector_eqj);
        const poleVector = new THREE.Vector3(poleVector_ecl.x, poleVector_ecl.y, poleVector_ecl.z);

        // Calculate orientation quaternion
        const quaternion = this._calculateQuaternionFromPole(poleVector, spinRad);

        return {
            quaternion: quaternion,
            poleRA: axisInfo.ra,
            poleDec: axisInfo.dec,
            spin: axisInfo.spin,
            northPole: poleVector
        };
    }

    /**
     * Calculate orientation from configuration data (fallback)
     */
    _calculateOrientationFromConfig(bodyConfig, time) {
        if (!bodyConfig || !bodyConfig.poleRA || !bodyConfig.poleDec) {
            return {
                quaternion: new THREE.Quaternion(),
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: new THREE.Vector3(0, 0, 1)
            };
        }

        // Convert time to Julian centuries since J2000.0
        const J2000 = new Date('2000-01-01T12:00:00.000Z');
        const centuriesSinceJ2000 = (time.getTime() - J2000.getTime()) / (365.25 * 24 * 3600 * 1000 * 100);
        const daysSinceJ2000 = (time.getTime() - J2000.getTime()) / (24 * 3600 * 1000);

        // Apply time-dependent corrections
        // Pole orientation changes slowly (rates are in degrees per century)
        const poleRA = bodyConfig.poleRA + (bodyConfig.poleRARate || 0) * centuriesSinceJ2000;
        const poleDec = bodyConfig.poleDec + (bodyConfig.poleDecRate || 0) * centuriesSinceJ2000;
        
        // Spin changes rapidly (rate is in degrees per day)
        const spin = bodyConfig.spin + (bodyConfig.spinRate || 0) * daysSinceJ2000;

        // Convert to radians
        const raRad = poleRA * (Math.PI / 180);
        const decRad = poleDec * (Math.PI / 180);
        const spinRad = spin * (Math.PI / 180);

        // Create pole vector in J2000 equatorial coordinates
        let poleVector = new THREE.Vector3(
            Math.cos(decRad) * Math.cos(raRad),
            Math.cos(decRad) * Math.sin(raRad),
            Math.sin(decRad)
        );
        // Rotate from equatorial to ecliptic (J2000) by -23.43928 deg about X
        const obliquity = THREE.MathUtils.degToRad(23.43928);
        const eqToEclQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -obliquity);
        poleVector.applyQuaternion(eqToEclQ);

        const quaternion = this._calculateQuaternionFromPole(poleVector, spinRad);

        return {
            quaternion: quaternion,
            poleRA: poleRA,
            poleDec: poleDec,
            spin: spin,
            northPole: poleVector
        };
    }

    /**
     * Calculate quaternion from pole vector and spin
     */
    _calculateQuaternionFromPole(poleVector, spinRad) {
        // Start with the vernal equinox direction (ECLIPJ2000 X-axis)
        const vernalEquinox = new THREE.Vector3(1, 0, 0);

        // Project the vernal equinox onto the planet's equatorial plane
        const poleComponent = vernalEquinox.clone().projectOnVector(poleVector);
        const primeReference = vernalEquinox.clone().sub(poleComponent).normalize();

        // If the result is too small (pole nearly parallel to vernal equinox), use Y-axis
        if (primeReference.length() < 0.1) {
            const yAxis = new THREE.Vector3(0, 1, 0);
            const poleComponentY = yAxis.clone().projectOnVector(poleVector);
            primeReference.copy(yAxis).sub(poleComponentY).normalize();
        }

        // Apply the spin rotation to get the actual prime meridian direction
        const spinQuaternion = new THREE.Quaternion().setFromAxisAngle(poleVector, spinRad);
        const primeMeridianDirection = primeReference.clone().applyQuaternion(spinQuaternion);

        // Construct the planet's coordinate system
        const planetZ = poleVector.clone().normalize();
        const planetX = primeMeridianDirection.clone().normalize();
        const planetY = new THREE.Vector3().crossVectors(planetX, planetZ).normalize();

        // Ensure right-handed system
        if (planetX.dot(new THREE.Vector3().crossVectors(planetY, planetZ)) < 0) {
            planetY.negate();
        }

        // Create rotation matrix and convert to quaternion
        const rotMatrix = new THREE.Matrix3().set(
            planetX.x, planetY.x, planetZ.x,
            planetX.y, planetY.y, planetZ.y,
            planetX.z, planetY.z, planetZ.z
        );

        return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(rotMatrix));
    }

    /**
     * Update barycenters (simplified version)
     */
    _updateBarycenters() {
        // Always set SSB (naif 0) at origin
        this.barycenters.set(0, {
            naif: 0,
            name: 'Solar System Barycenter',
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            mass: 0
        });

        // Special EMB calculation if both Earth and Moon are present
        const earth = this.bodies[399];
        const moon = this.bodies[301];
        if (earth && moon) {
            const totalMass = earth.mass + moon.mass;
            const calculatedBaryPos = new THREE.Vector3()
                .addScaledVector(earth.position, earth.mass / totalMass)
                .addScaledVector(moon.position, moon.mass / totalMass);
            const calculatedBaryVel = new THREE.Vector3()
                .addScaledVector(earth.velocity, earth.mass / totalMass)
                .addScaledVector(moon.velocity, moon.mass / totalMass);
            this.barycenters.set(3, {
                naif: 3,
                name: 'Earth-Moon Barycenter',
                position: calculatedBaryPos,
                velocity: calculatedBaryVel,
                mass: totalMass
            });
        } else if (this.bodies[3]) {
            // Fallback: use body[3] if present
            const emb = this.bodies[3];
            this.barycenters.set(3, {
                naif: 3,
                name: emb.name,
                position: emb.position.clone(),
                velocity: emb.velocity.clone(),
                mass: emb.mass
            });
        }

        // Add all other barycenters from bodies (skip 0 and 3, already handled)
        for (const [, body] of Object.entries(this.bodies)) {
            const numId = Number(body.naif_id);
            if ((numId === 0 || numId === 3) || !body || body.type !== 'barycenter') continue;
            this.barycenters.set(numId, {
                naif: numId,
                name: body.name,
                position: body.position.clone(),
                velocity: body.velocity.clone(),
                mass: body.mass
            });
        }
    }

    /**
     * Validate satellite state for reasonable values
     * @param {Object} satellite - Satellite object
     * @param {string} context - Context for logging (e.g., "before RK4", "after RK4")
     * @returns {boolean} - True if state is valid, false otherwise
     */
    _validateSatelliteState(satellite, context = "") {
        const positionMag = satellite.position.length();
        const velocityMag = satellite.velocity.length();
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        
        // Define reasonable limits - adjust based on central body
        const isSunCentered = satellite.centralBodyNaifId === 10; // Sun's NAIF ID
        const maxVelocity = isSunCentered ? PhysicsConstants.VELOCITY_LIMITS.HELIOCENTRIC_MAX : PhysicsConstants.VELOCITY_LIMITS.PLANETARY_MAX;
        const maxPosition = isSunCentered ? PhysicsConstants.POSITION_LIMITS.HELIOCENTRIC_MAX : PhysicsConstants.POSITION_LIMITS.PLANETARY_MAX;
        const minPosition = centralBody ? centralBody.radius * 0.9 : 100; // Not below surface
        
        let isValid = true;
        const warnings = [];
        
        // Check velocity
        if (velocityMag > maxVelocity) {
            warnings.push(`EXTREME VELOCITY: ${velocityMag.toFixed(3)} km/s`);
            isValid = false;
        }
        
        // Check position
        if (positionMag > maxPosition) {
            warnings.push(`EXTREME POSITION: ${positionMag.toFixed(0)} km from central body`);
            isValid = false;
        }
        
        if (positionMag < minPosition && centralBody) {
            warnings.push(`BELOW SURFACE: ${positionMag.toFixed(0)} km < radius ${centralBody.radius} km`);
            isValid = false;
        }
        
        // Check for NaN or Infinity
        if (!isFinite(positionMag) || !isFinite(velocityMag)) {
            warnings.push(`NaN or Infinity detected!`);
            isValid = false;
        }
        
        // Log warnings if any
        if (warnings.length > 0) {
            console.error(`[PhysicsEngine._validateSatelliteState] Validation failed ${context} for satellite ${satellite.id}:`);
            warnings.forEach(w => console.error(`  ${w}`));
            console.error(`  Position: ${satellite.position.toArray().map(v => v.toFixed(1)).join(', ')} km`);
            console.error(`  Velocity: ${satellite.velocity.toArray().map(v => v.toFixed(3)).join(', ')} km/s`);
            console.error(`  Central body: ${centralBody?.name || 'unknown'} (${satellite.centralBodyNaifId})`);
            
            // Log stack trace to find where this is coming from
            console.trace();
        }
        
        return isValid;
    }

    /**
     * Add satellite (planet-centric version)
     * @param {Object} satellite - Must include centralBodyNaifId (the NAIF ID of the central body)
     */
    addSatellite(satellite) {
        
        if (!satellite.centralBodyNaifId) {
            throw new Error('Satellite must specify centralBodyNaifId (NAIF ID of central body)');
        }
        // const centralBody = this.bodies[satellite.centralBodyNaifId];
        
        const id = String(satellite.id || Date.now());
        
        // Debug: Check velocity magnitude before storing
        const velArray = Array.isArray(satellite.velocity) ? satellite.velocity : 
                        (satellite.velocity.toArray ? satellite.velocity.toArray() : [0, 0, 0]);
        const velMag = Math.sqrt(velArray[0]**2 + velArray[1]**2 + velArray[2]**2);
        
        if (velMag > PhysicsConstants.VELOCITY_LIMITS.PLANETARY_MAX) {
            console.warn(`[PhysicsEngine] Extreme velocity on satellite creation: ${velMag.toFixed(3)} km/s`);
        }
        
        const satData = {
            ...satellite,
            id,
            // All positions/velocities are planet-centric (relative to central body)
            position: new THREE.Vector3().fromArray(satellite.position),
            velocity: new THREE.Vector3().fromArray(velArray),
            acceleration: new THREE.Vector3(),
            mass: satellite.mass || PhysicsConstants.SATELLITE_DEFAULTS.MASS,
            size: satellite.size || PhysicsConstants.SATELLITE_DEFAULTS.RADIUS,
            dragCoefficient: satellite.dragCoefficient || PhysicsConstants.SATELLITE_DEFAULTS.DRAG_COEFFICIENT,
            crossSectionalArea: satellite.crossSectionalArea || PhysicsConstants.SATELLITE_DEFAULTS.CROSS_SECTIONAL_AREA,
            ballisticCoefficient: satellite.ballisticCoefficient, // kg/m² - optional
            lastUpdate: this.simulationTime,
            centralBodyNaifId: satellite.centralBodyNaifId,
            // UI properties - store them here as single source of truth
            color: satellite.color || 0xffff00,
            name: satellite.name || `Satellite ${id}`,
            // Track velocity history for debugging
            velocityHistory: [{
                time: this.simulationTime.toISOString(),
                velocity: velMag,
                context: 'creation'
            }]
        };
        
        // Check SOI placement - always find the most appropriate central body
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        if (centralBody) {
            // Calculate global position
            const globalPos = satData.position.clone().add(centralBody.position);
            const globalVel = satData.velocity.clone().add(centralBody.velocity);
            
            // Find the appropriate central body
            const appropriateCentralBodyId = this._findAppropriateSOI(globalPos);
            
            if (appropriateCentralBodyId !== satellite.centralBodyNaifId) {
                
                const newCentralBody = this.bodies[appropriateCentralBodyId];
                
                
                // Convert to new reference frame
                satData.centralBodyNaifId = appropriateCentralBodyId;
                if (appropriateCentralBodyId === 0) {
                    // SSB reference
                    satData.position.copy(globalPos);
                    satData.velocity.copy(globalVel);
                } else {
                    // New body reference
                    satData.position.copy(globalPos).sub(newCentralBody.position);
                    satData.velocity.copy(globalVel).sub(newCentralBody.velocity);
                }
            }
        }
        
        // Validate initial state
        this._validateSatelliteState(satData, "on creation");
        
        
        this.satellites.set(id, satData);
        
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
        }
        
        // Dispatch event for UI updates
        this._dispatchSatelliteEvent('satelliteAdded', satData);
        return id;
    }

    /**
     * Remove satellite (unchanged from original)
     */
    removeSatellite(id) {
        const strId = String(id);
        const satellite = this.satellites.get(strId);
        if (satellite) {
            // Remove all subsystems for this satellite
            if (this.subsystemManager) {
                this.subsystemManager.removeSatellite(strId);
            }
            
            this.satellites.delete(strId);
            // Dispatch event for UI cleanup
            this._dispatchSatelliteEvent('satelliteRemoved', { id: strId });
        }
    }

    /**
     * Update satellite UI properties (color, name, etc)
     */
    updateSatelliteProperty(id, property, value) {
        const satellite = this.satellites.get(String(id));
        if (satellite) {
            satellite[property] = value;
            this._dispatchSatelliteEvent('satellitePropertyUpdated', { id, property, value });
        }
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
        if (!this.satellites.has(satelliteId)) {
            console.error(`Satellite ${satelliteId} not found`);
            return null;
        }
        
        if (!this.maneuverNodes.has(satelliteId)) {
            this.maneuverNodes.set(satelliteId, []);
        }
        
        const nodes = this.maneuverNodes.get(satelliteId);
        nodes.push(maneuverNode);
        
        // Sort by execution time
        nodes.sort((a, b) => a.executionTime.getTime() - b.executionTime.getTime());
        
        // Dispatch event for UI update
        this._dispatchSatelliteEvent('maneuverNodeAdded', {
            satelliteId,
            nodeId: maneuverNode.id,
            maneuverNode
        });
        
        return maneuverNode.id;
    }
    
    /**
     * Remove a maneuver node
     * @param {string} satelliteId - Satellite ID
     * @param {string} nodeId - Node ID to remove
     */
    removeManeuverNode(satelliteId, nodeId) {
        const nodes = this.maneuverNodes.get(satelliteId);
        if (!nodes) return;
        
        const index = nodes.findIndex(n => n.id === nodeId);
        if (index !== -1) {
            nodes.splice(index, 1);
            
            // Dispatch event for UI update
            this._dispatchSatelliteEvent('maneuverNodeRemoved', {
                satelliteId,
                nodeId
            });
        }
    }
    
    /**
     * Get maneuver nodes for a satellite
     * @param {string} satelliteId - Satellite ID
     * @returns {Array} Maneuver nodes
     */
    getManeuverNodes(satelliteId) {
        return this.maneuverNodes.get(satelliteId) || [];
    }
    
    /**
     * Execute maneuver if time has passed
     * @param {Object} satellite - Satellite object
     * @param {Date} currentTime - Current simulation time
     */
    _checkAndExecuteManeuvers(satellite, currentTime) {
        const nodes = this.maneuverNodes.get(satellite.id);
        if (!nodes || nodes.length === 0) return;
        
        // Check first node (they're sorted by time)
        const nextNode = nodes[0];
        if (currentTime >= nextNode.executionTime) {
            // Execute the maneuver
            
            // Convert local delta-V to world coordinates
            const worldDeltaV = OrbitalMechanics.localToWorldDeltaV(
                new THREE.Vector3(
                    nextNode.deltaV.prograde,
                    nextNode.deltaV.normal,
                    nextNode.deltaV.radial
                ),
                satellite.position,
                satellite.velocity
            );
            
            // Apply delta-V
            satellite.velocity.add(worldDeltaV);
            
            // Remove executed node
            nodes.shift();
            
            // Dispatch event
            this._dispatchSatelliteEvent('maneuverExecuted', {
                satelliteId: satellite.id,
                nodeId: nextNode.id,
                executionTime: nextNode.executionTime,
                deltaV: worldDeltaV.toArray(),
                newVelocity: satellite.velocity.toArray()
            });
            
            // Validate new state
            this._validateSatelliteState(satellite, "after maneuver execution");
        }
    }

    // Satellite integration methods (optimized for performance)
    async _integrateSatellites(deltaTime) {
        // Clear caches periodically
        this._clearCacheIfNeeded();
        
        for (const [, satellite] of this.satellites) {
            // Check for maneuvers before integration
            this._checkAndExecuteManeuvers(satellite, this.simulationTime);
            
            // Use UnifiedSatellitePropagator for consistent physics across all systems
            const acceleration = this._computeSatelliteAccelerationUnified(satellite);
            
            
            this._integrateRK4Unified(satellite, deltaTime);
            satellite.lastUpdate = new Date(this.simulationTime.getTime());

            // --- SOI transition logic ---
            // 1. Compute satellite's global position
            const centralBody = this.bodies[satellite.centralBodyNaifId];
            if (!centralBody) continue;
            const satGlobalPos = satellite.position.clone().add(centralBody.position);
            const satGlobalVel = satellite.velocity.clone().add(centralBody.velocity);

            // 2. Compute SOI radius for current central body
            const soiRadius = centralBody.soiRadius || 1e12; // fallback large
            const distToCentral = satellite.position.length(); // planet-centric

            // 3. If outside SOI, switch to parent body
            if (distToCentral > soiRadius) {
                // Find parent body in hierarchy
                const parentNaifId = this.hierarchy.getParent(satellite.centralBodyNaifId);
                if (parentNaifId !== undefined && this.bodies[parentNaifId]) {
                    const newCentral = this.bodies[parentNaifId];
                    // Recalculate new planet-centric state
                    const newPos = satGlobalPos.clone().sub(newCentral.position);
                    const newVel = satGlobalVel.clone().sub(newCentral.velocity);
                    // Update satellite's reference frame
                    satellite.centralBodyNaifId = parentNaifId;
                    satellite.position.copy(newPos);
                    satellite.velocity.copy(newVel);
                } else {
                    // If no parent, reference to SSB (0,0,0)
                    const newPos = satGlobalPos.clone();
                    const newVel = satGlobalVel.clone();
                    satellite.centralBodyNaifId = 0;
                    satellite.position.copy(newPos);
                    satellite.velocity.copy(newVel);
                }
            }
        }
    }

    /**
     * UNIFIED acceleration calculation using UnifiedSatellitePropagator
     * Replaces all old inconsistent acceleration methods
     */
    _computeSatelliteAccelerationUnified(satellite) {
        // Convert Three.js satellite to array format for UnifiedSatellitePropagator
        const satState = {
            position: satellite.position.toArray(),
            velocity: satellite.velocity.toArray(),
            centralBodyNaifId: satellite.centralBodyNaifId,
            mass: satellite.mass,
            crossSectionalArea: satellite.crossSectionalArea,
            dragCoefficient: satellite.dragCoefficient,
            ballisticCoefficient: satellite.ballisticCoefficient
        };

        // Convert Three.js bodies to array format
        const bodiesArray = {};
        for (const [naifId, body] of Object.entries(this.bodies)) {
            bodiesArray[naifId] = {
                ...body,
                position: body.position.toArray(),
                velocity: body.velocity.toArray()
            };
        }

        // Use UnifiedSatellitePropagator for consistent physics
        const accelArray = UnifiedSatellitePropagator.computeAcceleration(
            satState, 
            bodiesArray,
            {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                debugLogging: false
            }
        );

        // Convert back to Three.js Vector3 for PhysicsEngine compatibility
        const acceleration = new THREE.Vector3().fromArray(accelArray);

        // Store force components for visualization (simplified)
        satellite.a_total = accelArray;
        satellite.acceleration = acceleration;

        return acceleration;
    }

    // NOTE: _computeCoordinateInvariantAcceleration and _computeJ2Perturbation 
    // have been replaced by UnifiedSatellitePropagator methods

    /**
     * Compute atmospheric drag acceleration
     * Generic for any celestial body with atmosphere
     */
    _computeAtmosphericDrag(satellite) {
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        
        // Check if body has atmosphere model
        if (!centralBody || !centralBody.atmosphericModel) {
            return new THREE.Vector3(0, 0, 0);
        }

        const r = satellite.position.clone();
        const altitude = r.length() - (centralBody.radius || centralBody.equatorialRadius); // Altitude above surface in km
        
        // Use body's atmosphere limits or defaults
        const maxAlt = centralBody.atmosphericModel.maxAltitude || 1000;
        const minAlt = centralBody.atmosphericModel.minAltitude || 0;
        
        if (altitude > maxAlt || altitude < minAlt) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Use body's atmospheric density model or simplified exponential
        let density;
        if (centralBody.atmosphericModel.getDensity) {
            density = centralBody.atmosphericModel.getDensity(altitude);
        } else {
            // Fallback exponential model using body's parameters
            const h0 = centralBody.atmosphericModel.referenceAltitude || 200;
            const rho0 = centralBody.atmosphericModel.referenceDensity || 2.789e-13;
            const H = centralBody.atmosphericModel.scaleHeight || 50;
            density = rho0 * Math.exp(-(altitude - h0) / H);
        }

        // Satellite properties
        const mass = satellite.mass || 1000; // kg (use same default as in addSatellite)
        const area = satellite.crossSectionalArea || 10; // m² cross-sectional area
        const Cd = satellite.dragCoefficient || 2.2; // Drag coefficient

        // Calculate atmosphere velocity due to body rotation
        const atmosphereVel = this._calculateAtmosphereVelocity(satellite.position, centralBody);
        
        // Velocity relative to rotating atmosphere
        const relativeVel = satellite.velocity.clone().sub(atmosphereVel);
        const velMag = relativeVel.length(); // Keep in km/s for unit consistency
        
        if (velMag === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Calculate ballistic coefficient for consistent calculation
        const ballisticCoeff = mass / (Cd * area); // kg/m²
        
        // Convert ballistic coefficient from kg/m² to kg/km² for unit consistency
        const ballisticCoeffKm = ballisticCoeff * 1e6; // kg/km²
        
        // Drag acceleration magnitude: a = 0.5 * ρ * v² / (m/CdA)
        // With consistent units: density in kg/km³, velocity in km/s, ballistic coeff in kg/km²
        const dragMag = 0.5 * density * velMag * velMag / ballisticCoeffKm;
        
        // Drag direction is opposite to relative velocity
        const dragDirection = relativeVel.clone().normalize().multiplyScalar(-1);
        
        // Result is already in km/s²
        return dragDirection.multiplyScalar(dragMag);
    }

    /**
     * Calculate atmosphere velocity at a given position due to body rotation
     * @param {THREE.Vector3} position - Position relative to body center (km)
     * @param {Object} body - The celestial body
     * @returns {THREE.Vector3} - Atmosphere velocity (km/s)
     */
    _calculateAtmosphereVelocity(position, body) {
        // Get rotation period (convert from seconds to days if needed)
        const rotationPeriod = body.rotationPeriod || (body.spin ? 360 / body.spin : PhysicsConstants.TIME.SIDEREAL_DAY);
        
        if (!rotationPeriod || rotationPeriod === 0) {
            return new THREE.Vector3(0, 0, 0);
        }
        
        // Angular velocity (rad/s)
        const omega = (2 * Math.PI) / rotationPeriod;
        
        // Get body's rotation axis (pole direction)
        let rotationAxis = new THREE.Vector3(0, 0, 1); // Default to Z-axis
        
        if (body.quaternion) {
            // Transform Z-axis by body's quaternion to get actual rotation axis
            const q = body.quaternion;
            rotationAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(
                new THREE.Quaternion(q.x, q.y, q.z, q.w)
            );
        } else if (body.northPole) {
            rotationAxis = body.northPole.clone().normalize();
        }
        
        // Calculate velocity = omega × r
        // Project position onto plane perpendicular to rotation axis
        const projectedPos = position.clone().sub(
            rotationAxis.clone().multiplyScalar(position.dot(rotationAxis))
        );
        
        // Velocity is perpendicular to both rotation axis and projected position
        // v = omega × r_perp
        const atmosphereVel = new THREE.Vector3()
            .crossVectors(rotationAxis, projectedPos)
            .multiplyScalar(omega);
        
        // Convert from km/s to km/s (omega is in rad/s, position in km)
        // No conversion needed as the result is already in km/s
        
        return atmosphereVel;
    }

    /**
     * Find the appropriate SOI for a given global position
     * Returns the NAIF ID of the body whose SOI contains the position
     */
    _findAppropriateSOI(globalPos) {
        let bestBody = 0; // Default to SSB
        let smallestSOI = Infinity;
        
        // Check all bodies to find which SOI we're in
        for (const [naifId, body] of Object.entries(this.bodies)) {
            // Skip barycenters
            if (body.type === 'barycenter') continue;
            
            const distance = globalPos.distanceTo(body.position);
            const soiRadius = body.soiRadius || Infinity;
            
            // We're inside this body's SOI
            if (distance < soiRadius) {
                // Choose the smallest SOI that contains us (most specific)
                if (soiRadius < smallestSOI) {
                    bestBody = Number(naifId);
                    smallestSOI = soiRadius;
                }
            }
        }
        
        return bestBody;
    }

    /**
     * Determine which bodies have significant gravitational influence on the satellite
     * Uses caching and spatial indexing for performance optimization
     */
    _getSignificantBodies(satellite, centralBody) {
        const satAltitude = satellite.position.length();
        const cacheKey = `${satellite.centralBodyNaifId}_${Math.floor(satAltitude / 10000)}`; // 10km bins
        const now = Date.now();
        
        // Check cache validity
        if (this._satelliteInfluenceCache.has(cacheKey) && 
            (now - this._lastCacheUpdate) < this._cacheValidityPeriod) {
            return this._satelliteInfluenceCache.get(cacheKey);
        }
        
        const significantBodies = new Set();
        
        // Use temp vector to avoid allocations
        this._tempVectors.satGlobalPos.copy(satellite.position).add(centralBody.position);
        
        // Define sphere of influence based on central body and satellite altitude
        let sphereOfInfluence;
        
        switch (satellite.centralBodyNaifId) {
            case 399: // Earth
                sphereOfInfluence = Math.max(1e6, satAltitude * 5);
                // Always include key bodies for Earth satellites
                if (this.bodies[301]) significantBodies.add(301); // Moon
                if (this.bodies[10]) significantBodies.add(10); // Sun
                if (this.bodies[599]) significantBodies.add(599); // Jupiter
                if (this.bodies[699]) significantBodies.add(699); // Saturn
                break;
                
            case 499: // Mars  
                sphereOfInfluence = Math.max(5e5, satAltitude * 3);
                significantBodies.add(10); // Sun
                if (this.bodies[599]) significantBodies.add(599); // Jupiter
                break;
                
            case 301: // Moon
                sphereOfInfluence = Math.max(1e5, satAltitude * 2);
                significantBodies.add(399); // Earth
                significantBodies.add(10);  // Sun
                break;
                
            default:
                sphereOfInfluence = Math.max(1e6, satAltitude * 10);
                significantBodies.add(10); // Sun
                break;
        }
        
        // Check all bodies within sphere of influence (optimized)
        const centralGravAccel = (PhysicsConstants.PHYSICS.G * centralBody.mass) / (satAltitude * satAltitude);
        const minGravAccel = centralGravAccel * 0.0001; // 0.01% threshold
        
        for (const [, body] of Object.entries(this.bodies)) {
            const bId = Number(body.naif_id);
            if (bId === satellite.centralBodyNaifId || significantBodies.has(bId)) continue;
            
            // Use temp vector for distance calculation
            this._tempVectors.bodyDistance.copy(body.position).sub(this._tempVectors.satGlobalPos);
            const distance = this._tempVectors.bodyDistance.length();
            
            if (distance < sphereOfInfluence) {
                const gravAccel = (PhysicsConstants.PHYSICS.G * body.mass) / (distance * distance);
                if (gravAccel > minGravAccel) {
                    significantBodies.add(bId);
                }
            }
        }
        
        // Cache the result
        this._satelliteInfluenceCache.set(cacheKey, significantBodies);
        this._lastCacheUpdate = now;
        
        return significantBodies;
    }

    /**
     * UNIFIED RK4 integration using UnifiedSatellitePropagator
     * Replaces old inconsistent integration methods
     */
    _integrateRK4Unified(satellite, dt) {
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        if (!centralBody) return;

        // Validate state before integration
        this._validateSatelliteState(satellite, "before RK4");

        const vel0 = satellite.velocity.clone();

        // Convert to array format for UnifiedSatellitePropagator
        const satState = {
            position: satellite.position.toArray(),
            velocity: satellite.velocity.toArray(),
            centralBodyNaifId: satellite.centralBodyNaifId,
            mass: satellite.mass,
            crossSectionalArea: satellite.crossSectionalArea,
            dragCoefficient: satellite.dragCoefficient,
            ballisticCoefficient: satellite.ballisticCoefficient
        };

        const bodiesArray = {};
        for (const [naifId, body] of Object.entries(this.bodies)) {
            bodiesArray[naifId] = {
                ...body,
                position: body.position.toArray(),
                velocity: body.velocity.toArray()
            };
        }

        // Create acceleration function for UnifiedSatellitePropagator
        const accelerationFunc = (pos, vel) => {
            const tempSat = {
                ...satState,
                position: pos,
                velocity: vel
            };
            return UnifiedSatellitePropagator.computeAcceleration(tempSat, bodiesArray, {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true
            });
        };

        // Use UnifiedSatellitePropagator RK4 integration
        const result = UnifiedSatellitePropagator.integrateRK4(
            satState.position,
            satState.velocity,
            accelerationFunc,
            dt
        );

        // Update satellite state
        satellite.position.fromArray(result.position);
        satellite.velocity.fromArray(result.velocity);
        
        // Calculate final acceleration for storage
        const finalAccel = this._computeSatelliteAccelerationUnified(satellite);
        satellite.acceleration.copy(finalAccel);
        
        // Track velocity changes
        const oldVelMag = vel0.length();
        const newVelMag = satellite.velocity.length();
        const velChange = satellite.velocity.clone().sub(vel0).length();
        
        const accMag = finalAccel.length();
        // Add to velocity history if significant change
        if (!satellite.velocityHistory) {
            satellite.velocityHistory = [];
        }
        
        if (Math.abs(newVelMag - oldVelMag) > 0.1 || newVelMag > 50) { // Track significant changes or high velocities
            satellite.velocityHistory.push({
                time: this.simulationTime.toISOString(),
                velocity: newVelMag,
                velocityChange: velChange,
                acceleration: accMag,
                dt: dt,
                context: 'Unified RK4 integration'
            });
            
            // Keep only last 10 entries
            if (satellite.velocityHistory.length > 10) {
                satellite.velocityHistory.shift();
            }
        }
        
        // Cap extreme velocities to prevent runaway
        if (newVelMag > 299792) { // Speed of light
            console.error(`[PhysicsEngine] Capping extreme velocity for satellite ${satellite.id}`);
            satellite.velocity.normalize().multiplyScalar(100);
        }
        
        // Validate state after integration
        this._validateSatelliteState(satellite, "after RK4");
    }

    // State getters (similar to original)
    _getBodyStates() {
        const states = {};
        for (const [naifId, body] of Object.entries(this.bodies)) {
            states[naifId] = {
                naif: naifId,
                name: body.name,
                position: body.position.toArray(),
                velocity: body.velocity.toArray(),
                mass: body.mass,
                radius: body.radius,
                soiRadius: body.soiRadius, // Include SOI radius for orbit calculations
                type: body.type,
                J2: body.J2,
                atmosphericModel: body.atmosphericModel ? {
                    maxAltitude: body.atmosphericModel.maxAltitude,
                    minAltitude: body.atmosphericModel.minAltitude,
                    referenceAltitude: body.atmosphericModel.referenceAltitude,
                    referenceDensity: body.atmosphericModel.referenceDensity,
                    scaleHeight: body.atmosphericModel.scaleHeight
                    // Exclude getDensity function - can't be serialized for workers
                } : null,
                GM: body.GM,
                rotationPeriod: body.rotationPeriod,
                quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
                poleRA: body.poleRA,
                poleDec: body.poleDec,
                spin: body.spin,
                northPole: body.northPole.toArray()
            };
        }
        return states;
    }

    _getSatelliteStates() {
        const states = {};
        for (const [id, satellite] of this.satellites) {
            // Get central body for this satellite
            const centralBody = this.bodies[satellite.centralBodyNaifId];
            let altitude_radial = undefined;
            let altitude_surface = undefined;
            if (centralBody && centralBody.radius !== undefined) {
                altitude_radial = satellite.position.length();
                altitude_surface = altitude_radial - centralBody.radius;
            }
            // Compute speed
            const speed = satellite.velocity.length();
            // Optionally, add more derived fields here

            
            states[id] = {
                id: id,
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                acceleration: satellite.acceleration.toArray(),
                mass: satellite.mass,
                size: satellite.size,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient,
                ballisticCoefficient: satellite.ballisticCoefficient,
                altitude_radial,
                altitude_surface,
                speed,
                // Include UI properties
                color: satellite.color,
                name: satellite.name,
                centralBodyNaifId: satellite.centralBodyNaifId,
                // Include force components for debugging
                a_bodies: satellite.a_bodies,
                a_j2: satellite.a_j2,
                a_drag: satellite.a_drag,
                a_total: satellite.a_total,
                a_gravity_total: satellite.a_gravity_total,
                
                // Include subsystem status
                subsystems: this.subsystemManager ? 
                    this.subsystemManager.getAllSubsystemStatuses(id) : {}
            };
        }
        return states;
    }

    _getBarycenterStates() {
        const states = {};
        for (const [naifId, barycenter] of this.barycenters) {
            states[naifId] = {
                naif: naifId,
                name: barycenter.name,
                position: barycenter.position.toArray(),
                velocity: barycenter.velocity.toArray(),
                mass: barycenter.mass
            };
        }
        return states;
    }

    /**
     * Get all celestial bodies as plain JS objects for line-of-sight calculations
     * Returns: [{ id, name, position: [x, y, z], radius }]
     */
    getBodiesForLineOfSight() {
        const bodies = [];
        for (const [naifId, body] of Object.entries(this.bodies)) {
            if (!body || typeof body.position?.toArray !== 'function' || typeof body.radius !== 'number') continue;
            bodies.push({
                id: Number(naifId),
                name: body.name,
                position: body.position.toArray(),
                radius: body.radius
            });
        }
        return bodies;
    }

    /**
     * Get body data for orbital calculations (includes mass/GM)
     * Returns: [{ id, name, position: [x, y, z], mass, GM, naifId }]
     */
    getBodiesForOrbitPropagation() {
        const bodies = [];
        for (const [naifId, body] of Object.entries(this.bodies)) {
            if (!body || typeof body.position?.toArray !== 'function') continue;
            bodies.push({
                id: Number(naifId),
                naifId: Number(naifId),
                name: body.name,
                position: body.position.toArray(),
                mass: body.mass || 0,
                GM: body.GM || 0,
                radius: body.radius || 0,
                type: body.type
            });
        }
        return bodies;
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
     * Manage cache sizes and cleanup when needed (LRU eviction)
     * @private
     */
    _manageCacheSizes() {
        // Clean up satellite influence cache if too large
        if (this._satelliteInfluenceCache.size > this._cacheCleanupThreshold) {
            const entries = Array.from(this._satelliteInfluenceCache.entries());
            const entriesToRemove = entries.slice(0, this._satelliteInfluenceCache.size - this._maxCacheSize);
            
            for (const [key] of entriesToRemove) {
                this._satelliteInfluenceCache.delete(key);
            }
        }
        
        // Clean up body distance cache if too large  
        if (this._bodyDistanceCache.size > this._cacheCleanupThreshold) {
            const entries = Array.from(this._bodyDistanceCache.entries());
            const entriesToRemove = entries.slice(0, this._bodyDistanceCache.size - this._maxCacheSize);
            
            for (const [key] of entriesToRemove) {
                this._bodyDistanceCache.delete(key);
            }
        }
    }

    /**
     * Clear cached data periodically for memory management
     */
    _clearCacheIfNeeded() {
        const now = Date.now();
        if (now - this._lastCacheUpdate > this._cacheValidityPeriod * 2) {
            this._satelliteInfluenceCache.clear();
            this._bodyDistanceCache.clear();
            this._lastCacheUpdate = now;
        } else {
            // Manage cache sizes during normal operation
            this._manageCacheSizes();
        }
    }
    
    /**
     * Cleanup function to call on removal
     */
    cleanup() {
        this._satelliteInfluenceCache.clear();
        this._bodyDistanceCache.clear();
        if (this.subsystemManager) {
            this.subsystemManager.cleanup?.();
        }
    }
    

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        return {
            satelliteCount: this.satellites.size,
            bodyCount: Object.keys(this.bodies).length,
            cacheSize: this._satelliteInfluenceCache.size,
            lastCacheUpdate: this._lastCacheUpdate
        };
    }
}