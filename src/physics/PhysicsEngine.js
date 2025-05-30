import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { SolarSystemHierarchy } from './SolarSystemHierarchy.js';
import { StateVectorCalculator } from './StateVectorCalculator.js';
import { PositionManager } from './PositionManager.js';
import { solarSystemDataManager } from './bodies/PlanetaryDataManager.js';
import { Constants } from '../utils/Constants.js';
import { integrateRK4 } from './integrators/OrbitalIntegrators.js';

// Extract the functions we need from the Astronomy module
const { MakeTime, RotationAxis, Rotation_EQJ_ECL, RotateVector } = Astronomy;

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
        this.timeStep = 0.0167; // Default to 1/60 second for proper satellite integration

        // Body storage
        this.bodies = {};

        // Satellite tracking (unchanged from original)
        this.satellites = new Map();

        // Barycenter calculations
        this.barycenters = new Map();
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

        return this;
    }

    /**
     * Advance the simulation by one time step
     */
    async step(deltaTime) {
        const actualDeltaTime = deltaTime || this.timeStep;
        
        // Only log if unusually large time step
        if (actualDeltaTime > 10.0) {
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
            barycenters: this._getBarycenterStates()
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
                return this._createOrientationFromAxisInfo(axisInfo, astroTime);
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
    _createOrientationFromAxisInfo(axisInfo, astroTime) {
        // Convert RA from hours to radians (15° per hour)
        const raRad = axisInfo.ra * (Math.PI / 12);
        const decRad = axisInfo.dec * (Math.PI / 180);
        const spinRad = axisInfo.spin * (Math.PI / 180);

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

        // Apply time-dependent corrections (simplified)
        const poleRA = bodyConfig.poleRA + (bodyConfig.poleRARate || 0) * centuriesSinceJ2000;
        const poleDec = bodyConfig.poleDec + (bodyConfig.poleDecRate || 0) * centuriesSinceJ2000;
        const spin = bodyConfig.spin + (bodyConfig.spinRate || 0) * centuriesSinceJ2000;

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

        // Apply 90° correction around the pole to fix surface orientation
        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(poleVector, Math.PI / 2);
        primeMeridianDirection.applyQuaternion(correctionQuaternion);

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
        for (const [naifId, body] of Object.entries(this.bodies)) {
            const numId = Number(naifId);
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
        
        // Define reasonable limits
        const maxVelocity = 50; // km/s - anything above this is suspicious
        const maxPosition = 1e8; // 100 million km - very far from any body
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
        console.log('[PhysicsEngine.addSatellite] Adding satellite with:');
        console.log('  Position:', satellite.position);
        console.log('  Velocity:', satellite.velocity);
        
        if (!satellite.centralBodyNaifId) {
            throw new Error('Satellite must specify centralBodyNaifId (NAIF ID of central body)');
        }
        // const centralBody = this.bodies[satellite.centralBodyNaifId];
        
        const id = String(satellite.id || Date.now());
        
        // Debug: Check velocity magnitude before storing
        const velArray = Array.isArray(satellite.velocity) ? satellite.velocity : 
                        (satellite.velocity.toArray ? satellite.velocity.toArray() : [0, 0, 0]);
        const velMag = Math.sqrt(velArray[0]**2 + velArray[1]**2 + velArray[2]**2);
        
        if (velMag > 50) {
            console.error(`[PhysicsEngine.addSatellite] EXTREME VELOCITY on creation for satellite ${id}:`);
            console.error(`  Velocity array: [${velArray[0].toFixed(3)}, ${velArray[1].toFixed(3)}, ${velArray[2].toFixed(3)}] km/s`);
            console.error(`  Velocity magnitude: ${velMag.toFixed(3)} km/s`);
            console.error(`  Input velocity:`, satellite.velocity);
        }
        
        const satData = {
            ...satellite,
            id,
            // All positions/velocities are planet-centric (relative to central body)
            position: new THREE.Vector3().fromArray(satellite.position),
            velocity: new THREE.Vector3().fromArray(velArray),
            acceleration: new THREE.Vector3(),
            mass: satellite.mass || 1000, // kg - typical small satellite
            size: satellite.size || 1, // m - radius for visualization
            dragCoefficient: satellite.dragCoefficient || 2.2,
            crossSectionalArea: satellite.crossSectionalArea || 2, // m² - more realistic for 1000kg satellite
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
                const distanceFromCentral = satData.position.length();
                const soiRadius = centralBody.soiRadius || 1e12;
                const newCentralBody = this.bodies[appropriateCentralBodyId];
                
                if (distanceFromCentral > soiRadius) {
                    console.log(`[PhysicsEngine.addSatellite] Satellite outside ${centralBody.name} SOI (${distanceFromCentral.toFixed(0)} km > ${soiRadius.toFixed(0)} km)`);
                } else {
                    console.log(`[PhysicsEngine.addSatellite] Satellite is within ${newCentralBody?.name || 'SSB'} SOI despite being within ${centralBody.name} SOI`);
                }
                
                console.log(`[PhysicsEngine.addSatellite] Switching central body from ${centralBody.name} to ${newCentralBody?.name || 'SSB'}`);
                
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
        
        // Final check
        const storedVelMag = satData.velocity.length();
        if (storedVelMag > 50) {
            console.error(`[PhysicsEngine.addSatellite] Stored velocity still extreme: ${storedVelMag.toFixed(3)} km/s`);
        }
        
        this.satellites.set(id, satData);
        
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
            this.satellites.delete(strId);
            // console.log('[PhysicsEngine] Removed satellite', strId);
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

    // Satellite integration methods (copied from original PhysicsEngine)
    async _integrateSatellites(deltaTime) {
        // Debug: Log integration call (every 10 seconds)
        if (!this._lastIntegrateLogTime || Date.now() - this._lastIntegrateLogTime > 10000) {
            // console.log(`[PhysicsEngine] _integrateSatellites called with deltaTime: ${deltaTime} seconds, ${this.satellites.size} satellites`);
            this._lastIntegrateLogTime = Date.now();
        }
        
        for (const [, satellite] of this.satellites) {
            // Check velocity BEFORE computing acceleration
            const velBeforeAccel = satellite.velocity.length();
            if (velBeforeAccel > 50) {
                console.error(`[PhysicsEngine._integrateSatellites] HIGH VELOCITY BEFORE acceleration computation: ${velBeforeAccel.toFixed(3)} km/s for satellite ${satellite.id}`);
            }
            
            const acceleration = this._computeSatelliteAcceleration(satellite);
            
            // Check velocity AFTER computing acceleration but BEFORE integration
            const velAfterAccel = satellite.velocity.length();
            if (velAfterAccel > 50 && velAfterAccel !== velBeforeAccel) {
                console.error(`[PhysicsEngine._integrateSatellites] VELOCITY CHANGED during acceleration computation!`);
                console.error(`  Before: ${velBeforeAccel.toFixed(3)} km/s`);
                console.error(`  After: ${velAfterAccel.toFixed(3)} km/s`);
            }
            
            this._integrateRK4(satellite, acceleration, deltaTime);
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
                    // Log transition
                    // console.log(`[PhysicsEngine] Satellite ${satellite.id} exited SOI of ${centralBody.name}, switching to ${newCentral.name}`);
                    // Update satellite's reference frame
                    satellite.centralBodyNaifId = parentNaifId;
                    satellite.position.copy(newPos);
                    satellite.velocity.copy(newVel);
                } else {
                    // If no parent, reference to SSB (0,0,0)
                    const newPos = satGlobalPos.clone();
                    const newVel = satGlobalVel.clone();
                    // console.log(`[PhysicsEngine] Satellite ${satellite.id} exited all SOIs, switching to SSB`);
                    satellite.centralBodyNaifId = 0;
                    satellite.position.copy(newPos);
                    satellite.velocity.copy(newVel);
                }
            }
        }
    }

    _computeSatelliteAcceleration(satellite) {
        const totalAccel = new THREE.Vector3();
        const a_bodies = {};
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        if (!centralBody) {
            console.warn(`[PhysicsEngine] Central body ${satellite.centralBodyNaifId} not found for satellite ${satellite.id}`);
            return totalAccel;
        }
        // Convert satellite from planet-centric to solar system coordinates
        const satGlobalPos = satellite.position.clone().add(centralBody.position);
        
        // Debug logging for extreme velocity issue
        const velMag = satellite.velocity.length();
        if (velMag > 50) { // Log if velocity exceeds 50 km/s
            console.warn(`[PhysicsEngine._computeSatelliteAcceleration] HIGH VELOCITY DETECTED for satellite ${satellite.id}:`);
            console.warn(`  Velocity: ${satellite.velocity.toArray().map(v => v.toFixed(3)).join(', ')} km/s`);
            console.warn(`  Velocity magnitude: ${velMag.toFixed(3)} km/s`);
            console.warn(`  Position: ${satellite.position.toArray().map(v => v.toFixed(1)).join(', ')} km`);
            console.warn(`  Central body: ${centralBody.name} (${satellite.centralBodyNaifId})`);
        }
        
        // Debug logging for extreme cases
        const debugAccel = false; // Disabled - was causing excessive logging for normal satellites

        // === GRAVITATIONAL ACCELERATION FROM SIGNIFICANT BODIES ONLY ===
        // Apply sphere of influence filtering to avoid computational issues
        const significantBodies = this._getSignificantBodies(satellite, centralBody);
        
        // Debug: Check for suspiciously massive bodies
        if (debugAccel) {
            for (const [bodyId, body] of Object.entries(this.bodies)) {
                if (body.mass > 2e30) { // More massive than the Sun
                    console.warn(`[PhysicsEngine] WARNING: Body ${body.name} (${bodyId}) has extreme mass: ${body.mass.toExponential(3)} kg`);
                }
            }
        }
        
        // First pass: Calculate accelerations from ALL bodies for consistency
        const allBodyAccels = {};
        for (const [bodyId, body] of Object.entries(this.bodies)) {
            // Skip barycenters and invalid bodies
            if (body.type === 'barycenter') continue;
            if (!body.position || !body.mass || body.mass <= 0) continue;
            
            const r = new THREE.Vector3().subVectors(body.position, satGlobalPos);
            const distance = r.length();
            
            if (distance > 1e-6) { // Avoid near-zero distances
                const gravAccel = (Constants.G * body.mass) / (distance * distance);
                const accVec = r.clone().normalize().multiplyScalar(gravAccel);
                totalAccel.add(accVec);
                allBodyAccels[bodyId] = accVec.clone();
            }
        }
        
        // Second pass: Store significant bodies for visualization
        // For debugging, we can store ALL bodies to see their contributions
        const storeAllBodies = true; // Set to false for production to save memory
        
        for (const [bodyId, body] of Object.entries(this.bodies)) {
            const shouldStore = storeAllBodies || 
                               bodyId == satellite.centralBodyNaifId || 
                               significantBodies.has(Number(bodyId));
            
            if (shouldStore && allBodyAccels[bodyId]) {
                a_bodies[bodyId] = [allBodyAccels[bodyId].x, allBodyAccels[bodyId].y, allBodyAccels[bodyId].z];
                
                // Debug large accelerations only if truly suspicious (> 100 km/s² which would be extreme)
                const accVec = allBodyAccels[bodyId];
                if (accVec.length() > 100) {
                    console.warn(`[PhysicsEngine] Extremely large acceleration from ${body.name} (${bodyId}):`);
                    console.warn(`  Type: ${body.type || 'unknown'}`);
                    console.warn(`  Acceleration: ${accVec.length().toExponential(3)} km/s²`);
                    console.warn(`  Distance: ${body.position.distanceTo(satGlobalPos).toFixed(1)} km`);
                    console.warn(`  Mass: ${body.mass.toExponential(3)} kg`);
                    console.warn(`  GM: ${(Constants.G * body.mass).toExponential(3)} km³/s²`);
                }
            }
        }

        // === COMPUTE CENTRAL BODY'S ACCELERATION (for reference frame correction) ===
        // CRITICAL: Must include ALL bodies, not just significant ones, for consistency
        const centralAccel = new THREE.Vector3();
        for (const [bodyId, body] of Object.entries(this.bodies)) {
            if (bodyId == satellite.centralBodyNaifId) continue; // skip self
            
            // Skip barycenters
            if (body.type === 'barycenter') continue;
            
            // Skip invalid bodies
            if (!body.position || !body.mass || body.mass <= 0) continue;
            
            const r = new THREE.Vector3().subVectors(body.position, centralBody.position);
            const distance = r.length();
            if (distance > 1e-6) { // Avoid near-zero distances
                const gravAccel = (Constants.G * body.mass) / (distance * distance);
                const accVec = r.clone().normalize().multiplyScalar(gravAccel);
                centralAccel.add(accVec);
            }
        }

        // Subtract central body's acceleration to get planet-centric acceleration
        totalAccel.sub(centralAccel);
        
        // if (debugAccel) {
        //     console.log(`[PhysicsEngine] Satellite ${satellite.id} acceleration components:`);
        //     console.log(`  Total accel before central subtraction: ${totalAccel.clone().add(centralAccel).length().toFixed(6)} km/s²`);
        //     console.log(`  Central body accel: ${centralAccel.length().toFixed(6)} km/s²`);
        //     console.log(`  Net gravitational accel: ${totalAccel.length().toFixed(6)} km/s²`);
        // }

        // === J2 PERTURBATION (Earth oblateness) ===
        const j2Accel = this._computeJ2Perturbation(satellite, centralBody);
        totalAccel.add(j2Accel);

        // === ATMOSPHERIC DRAG ===
        const dragAccel = this._computeAtmosphericDrag(satellite);
        totalAccel.add(dragAccel);
        
        // if (debugAccel) {
        //     console.log(`  J2 accel: ${j2Accel.length().toFixed(6)} km/s²`);
        //     console.log(`  Drag accel: ${dragAccel.length().toFixed(6)} km/s²`);
        //     console.log(`  TOTAL ACCELERATION: ${totalAccel.length().toFixed(6)} km/s²`);
        // }

        // === STORE FORCE COMPONENTS FOR VISUALIZATION ===
        satellite.a_bodies = a_bodies;
        satellite.a_j2 = [j2Accel.x, j2Accel.y, j2Accel.z];
        satellite.a_drag = [dragAccel.x, dragAccel.y, dragAccel.z];
        satellite.a_total = [totalAccel.x, totalAccel.y, totalAccel.z];
        
        // Calculate total gravity for visualization (sum of all body contributions)
        const gravityTotal = new THREE.Vector3();
        for (const accel of Object.values(allBodyAccels)) {
            gravityTotal.add(accel);
        }
        satellite.a_gravity_total = [gravityTotal.x, gravityTotal.y, gravityTotal.z];
        
        // Debug logging for extreme accelerations
        const accelMag = totalAccel.length();
        if (accelMag > 0.1) { // More than 0.1 km/s² is high
            console.warn(`[PhysicsEngine._computeSatelliteAcceleration] HIGH ACCELERATION for satellite ${satellite.id}:`);
            console.warn(`  Total acceleration: ${totalAccel.toArray().map(v => v.toFixed(6)).join(', ')} km/s²`);
            console.warn(`  Acceleration magnitude: ${accelMag.toFixed(6)} km/s²`);
            console.warn(`  J2 contribution: ${j2Accel.length().toFixed(6)} km/s²`);
            console.warn(`  Drag contribution: ${dragAccel.length().toFixed(6)} km/s²`);
        }
        
        return totalAccel;
    }

    /**
     * Compute J2 perturbation acceleration (body's oblateness effect)
     * Generic for any celestial body with J2 coefficient
     */
    _computeJ2Perturbation(satellite, centralBody) {
        // Check if body has J2 coefficient
        if (!centralBody.J2 || centralBody.J2 === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Use body's J2 coefficient and radius
        const J2 = centralBody.J2;
        const Re = centralBody.radius || centralBody.equatorialRadius;
        const mu = centralBody.GM || (Constants.G * centralBody.mass); // Gravitational parameter

        // Satellite position relative to central body (planet-centric)
        const r = satellite.position.clone();
        const rMag = r.length();
        
        if (rMag < Re * 1.1) {
            // Too close to surface, skip J2 calculation
            return new THREE.Vector3(0, 0, 0);
        }

        // Get central body's orientation quaternion to determine pole direction
        const centralBodyState = this.bodies[satellite.centralBodyNaifId];
        let poleDirection = new THREE.Vector3(0, 0, 1); // Default to Z-axis
        
        if (centralBodyState?.quaternion) {
            // Transform Z-axis by body's quaternion to get actual pole direction
            const q = centralBodyState.quaternion;
            poleDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(
                new THREE.Quaternion(q.x, q.y, q.z, q.w)
            );
        }

        // Project satellite position onto pole direction to get z-component
        const z = r.dot(poleDirection);
        
        // J2 acceleration components
        const factor = -1.5 * J2 * mu * (Re * Re) / (rMag ** 5);
        
        // Radial component
        const radialComp = r.clone().multiplyScalar(factor * (1 - 5 * (z * z) / (rMag * rMag)));
        
        // Polar component  
        const polarComp = poleDirection.clone().multiplyScalar(factor * z * (3 - 5 * (z * z) / (rMag * rMag)));
        
        return radialComp.add(polarComp);
    }

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
        const velMag = relativeVel.length() * 1000; // Convert km/s to m/s
        
        if (velMag === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Drag force magnitude: F = -0.5 * rho * v² * Cd * A
        const dragMag = 0.5 * density * velMag * velMag * Cd * area / mass;
        
        // Drag direction is opposite to relative velocity
        const dragDirection = relativeVel.clone().normalize().multiplyScalar(-1);
        
        // Convert back to km/s²
        return dragDirection.multiplyScalar(dragMag / 1000);
    }

    /**
     * Calculate atmosphere velocity at a given position due to body rotation
     * @param {THREE.Vector3} position - Position relative to body center (km)
     * @param {Object} body - The celestial body
     * @returns {THREE.Vector3} - Atmosphere velocity (km/s)
     */
    _calculateAtmosphereVelocity(position, body) {
        // Get rotation period (convert from seconds to days if needed)
        const rotationPeriod = body.rotationPeriod || (body.spin ? 360 / body.spin : Constants.siderialDay);
        
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
     * This prevents computational issues from distant solar system body perturbations
     */
    _getSignificantBodies(satellite, centralBody) {
        const significantBodies = new Set();
        const satGlobalPos = satellite.position.clone().add(centralBody.position);
        const satAltitude = satellite.position.length(); // Distance from central body center
        
        // Define sphere of influence based on central body and satellite altitude
        let sphereOfInfluence;
        
        switch (satellite.centralBodyNaifId) {
            case 399: // Earth
                sphereOfInfluence = Math.max(1e6, satAltitude * 5); // At least 1M km or 5x satellite altitude
                // Always include Moon for Earth satellites
                if (this.bodies[301]) significantBodies.add(301); // Moon
                // Always include Sun for Earth satellites
                if (this.bodies[10]) significantBodies.add(10); // Sun
                // Include other planets if they exist
                if (this.bodies[599]) significantBodies.add(599); // Jupiter
                if (this.bodies[699]) significantBodies.add(699); // Saturn
                break;
                
            case 499: // Mars  
                sphereOfInfluence = Math.max(5e5, satAltitude * 3); // 500k km or 3x altitude
                // Include Sun for Mars satellites
                significantBodies.add(10); // Sun
                // Include Jupiter for Mars (significant perturbation)
                if (this.bodies[599]) significantBodies.add(599); // Jupiter
                break;
                
            case 301: // Moon (if satellite around Moon)
                sphereOfInfluence = Math.max(1e5, satAltitude * 2); // 100k km or 2x altitude  
                // Include Earth for lunar satellites
                significantBodies.add(399); // Earth
                significantBodies.add(10);  // Sun
                break;
                
            default:
                // For other bodies, use conservative sphere of influence
                sphereOfInfluence = Math.max(1e6, satAltitude * 10);
                // Always include Sun
                significantBodies.add(10); // Sun
                break;
        }
        
        // Check all bodies within sphere of influence
        for (const [bodyId, body] of Object.entries(this.bodies)) {
            const bId = Number(bodyId);
            if (bId === satellite.centralBodyNaifId) continue; // Skip central body (handled separately)
            if (significantBodies.has(bId)) continue; // Already added
            
            const distance = body.position.distanceTo(satGlobalPos);
            if (distance < sphereOfInfluence) {
                // Additional check: only include if gravitational acceleration is significant
                const gravAccel = (Constants.G * body.mass) / (distance * distance);
                const centralGravAccel = (Constants.G * centralBody.mass) / (satAltitude * satAltitude);
                
                // Include if perturbation is at least 0.01% of central body's gravity (more inclusive)
                if (gravAccel > centralGravAccel * 0.0001) {
                    significantBodies.add(bId);
                }
            }
        }
        
        return significantBodies;
    }

    _integrateRK4(satellite, acceleration, dt) {
        // All integration is done in planet-centric frame
        // But force calculations use global positions
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        if (!centralBody) return;

        // Validate state before integration
        this._validateSatelliteState(satellite, "before RK4");

        const pos0 = satellite.position.clone(); // planet-centric
        const vel0 = satellite.velocity.clone();
        
        // Debug: Check for extreme accelerations
        const accMag = acceleration.length();
        if (accMag > 1.0) { // More than 1 km/s² is suspicious
            console.warn(`[PhysicsEngine] EXTREME ACCELERATION DETECTED for satellite ${satellite.id}: ${accMag.toFixed(3)} km/s²`);
            console.warn(`  Position: ${pos0.toArray().map(v => v.toFixed(1)).join(', ')} km`);
            console.warn(`  Velocity: ${vel0.toArray().map(v => v.toFixed(3)).join(', ')} km/s (mag: ${vel0.length().toFixed(3)})`);
            console.warn(`  Acceleration: ${acceleration.toArray().map(v => v.toFixed(6)).join(', ')} km/s²`);
            console.warn(`  dt: ${dt} seconds`);
            console.warn(`  Central body: ${centralBody.name} (${satellite.centralBodyNaifId})`);
        }

        // Create acceleration function for the integrator
        const accelerationFunc = (position, velocity) => {
            return this._computeSatelliteAcceleration({ ...satellite, position, velocity });
        };

        // Use centralized RK4 integration
        const { position: newPosition, velocity: newVelocity } = integrateRK4(
            satellite.position,
            satellite.velocity,
            accelerationFunc,
            dt
        );

        // Update satellite state
        satellite.position.copy(newPosition);
        satellite.velocity.copy(newVelocity);
        satellite.acceleration.copy(acceleration);
        
        // Track velocity changes
        const oldVelMag = vel0.length();
        const newVelMag = satellite.velocity.length();
        const velChange = satellite.velocity.clone().sub(vel0).length();
        
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
                context: 'RK4 integration'
            });
            
            // Keep only last 10 entries
            if (satellite.velocityHistory.length > 10) {
                satellite.velocityHistory.shift();
            }
        }
        
        // Debug: Check for extreme velocities
        if (newVelMag > 100) { // More than 100 km/s is very suspicious
            console.error(`[PhysicsEngine] EXTREME VELOCITY after RK4 for satellite ${satellite.id}: ${newVelMag.toFixed(3)} km/s`);
            console.error(`  Old velocity: ${vel0.length().toFixed(3)} km/s`);
            console.error(`  Velocity change: ${velChange.toFixed(3)} km/s in ${dt} seconds`);
            console.error(`  Effective acceleration: ${(velChange/dt).toFixed(3)} km/s²`);
            console.error(`  Computed acceleration: ${accMag.toFixed(3)} km/s²`);
            console.error(`  Velocity history:`, satellite.velocityHistory);
            
            // Cap velocity to prevent runaway
            if (newVelMag > 299792) { // Speed of light
                console.error(`  CAPPING VELOCITY TO 100 km/s to prevent runaway!`);
                satellite.velocity.normalize().multiplyScalar(100);
            }
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

            // Debug extreme velocity issue
            if (speed > 50) {
                console.error(`[PhysicsEngine._getSatelliteStates] EXTREME VELOCITY for satellite ${id}:`);
                console.error(`  Velocity: ${satellite.velocity.toArray().map(v => v.toFixed(3)).join(', ')} km/s`);
                console.error(`  Speed: ${speed.toFixed(3)} km/s`);
                console.error(`  Position: ${satellite.position.toArray().map(v => v.toFixed(1)).join(', ')} km`);
                console.error(`  Central body: ${centralBody?.name || 'unknown'} (${satellite.centralBodyNaifId})`);
                console.error(`  Velocity history:`, satellite.velocityHistory);
            }
            
            // Additional check: Compare with stored velocity
            const velArray = satellite.velocity.toArray();
            const storedSpeed = Math.sqrt(velArray[0]**2 + velArray[1]**2 + velArray[2]**2);
            if (Math.abs(storedSpeed - speed) > 0.001) {
                console.error(`[PhysicsEngine._getSatelliteStates] VELOCITY MISMATCH!`);
                console.error(`  Speed from .length(): ${speed}`);
                console.error(`  Speed from array: ${storedSpeed}`);
            }
            
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
                a_gravity_total: satellite.a_gravity_total
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
     * Get all satellites as plain JS objects for line-of-sight calculations
     * Returns: [{ id, position: [x, y, z] }]
     */
    getSatellitesForLineOfSight() {
        const sats = [];
        for (const [id, sat] of this.satellites) {
            if (!sat || typeof sat.position?.toArray !== 'function') continue;
            sats.push({
                id,
                position: sat.position.toArray()
            });
        }
        return sats;
    }
}