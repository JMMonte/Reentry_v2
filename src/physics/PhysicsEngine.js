import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { SolarSystemHierarchy } from './SolarSystemHierarchy.js';
import { StateVectorCalculator } from './StateVectorCalculator.js';
import { PositionManager } from './PositionManager.js';
import { planetaryDataManager } from './bodies/PlanetaryDataManager.js';
import { Constants } from '../utils/Constants.js';

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
        this.timeStep = 60; // seconds

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
        if (!planetaryDataManager.initialized) {
            await planetaryDataManager.initialize();
        }

        // Initialize core modules with the loaded config
        this.hierarchy = new SolarSystemHierarchy(planetaryDataManager.naifToBody);
        // Debug: print parent for each major planet
        const majorPlanets = [199, 299, 399, 499, 599, 699, 799, 899]; // Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
        for (const naifId of majorPlanets) {
            const info = this.hierarchy.getBodyInfo(naifId);
            if (info) {
                console.log(`[HierarchyDebug] ${info.name} (NAIF ${naifId}) parent: ${info.parent}`);
            }
        }
        this.stateCalculator = new StateVectorCalculator(this.hierarchy, planetaryDataManager.naifToBody);
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

        // Update simulation time
        this.simulationTime = new Date(this.simulationTime.getTime() + actualDeltaTime * 1000);

        // Update all body positions and orientations
        await this._updateAllBodies();

        // Update barycenters
        this._updateBarycenters();

        // Integrate satellite dynamics (unchanged)
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
        const bodyConfigs = planetaryDataManager.naifToBody;

        // Use PositionManager to update all positions hierarchically
        const updatedBodies = this.positionManager.updateAllPositions(this.simulationTime, bodyConfigs);

        // Calculate orientations for all bodies
        for (const body of Object.values(updatedBodies)) {
            const orientation = this._calculateBodyOrientation(body.name, this.simulationTime);
            body.quaternion = orientation.quaternion;
            body.poleRA = orientation.poleRA;
            body.poleDec = orientation.poleDec;
            body.spin = orientation.spin;
            body.northPole = orientation.northPole;
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
            const bodyConfig = planetaryDataManager.getBodyByName(bodyIdentifier) ||
                planetaryDataManager.getBodyByNaif(parseInt(bodyIdentifier));
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
     * Add satellite (planet-centric version)
     * @param {Object} satellite - Must include centralBodyNaifId (the NAIF ID of the central body)
     */
    addSatellite(satellite) {
        console.log('[PhysicsEngine] addSatellite called with', satellite);
        if (!satellite.centralBodyNaifId) {
            throw new Error('Satellite must specify centralBodyNaifId (NAIF ID of central body)');
        }
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        if (centralBody) {
            console.log(`[PhysicsEngine] Central body ${satellite.centralBodyNaifId} (${centralBody.name}): global position:`, centralBody.position?.toArray?.(), 'mass:', centralBody.mass);
        } else {
            console.warn(`[PhysicsEngine] Central body ${satellite.centralBodyNaifId} not found at satellite creation!`);
        }
        console.log('[PhysicsEngine] Satellite initial planet-centric position:', satellite.position, 'velocity:', satellite.velocity);
        
        const id = String(satellite.id || Date.now());
        const satData = {
            ...satellite,
            id,
            // All positions/velocities are planet-centric (relative to central body)
            position: new THREE.Vector3().fromArray(satellite.position),
            velocity: new THREE.Vector3().fromArray(satellite.velocity),
            acceleration: new THREE.Vector3(),
            mass: satellite.mass || 1000,
            dragCoefficient: satellite.dragCoefficient || 2.2,
            crossSectionalArea: satellite.crossSectionalArea || 10,
            lastUpdate: this.simulationTime,
            centralBodyNaifId: satellite.centralBodyNaifId,
            // UI properties - store them here as single source of truth
            color: satellite.color || 0xffff00,
            name: satellite.name || `Satellite ${id}`
        };
        
        this.satellites.set(id, satData);
        console.log('[PhysicsEngine] satellites after add:', Array.from(this.satellites.keys()));
        
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
            console.log('[PhysicsEngine] Removed satellite', strId);
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
        for (const [, satellite] of this.satellites) {
            const acceleration = this._computeSatelliteAcceleration(satellite);
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
                const parentNaifId = this.hierarchy.getParentNaifId(satellite.centralBodyNaifId);
                if (parentNaifId !== undefined && this.bodies[parentNaifId]) {
                    const newCentral = this.bodies[parentNaifId];
                    // Recalculate new planet-centric state
                    const newPos = satGlobalPos.clone().sub(newCentral.position);
                    const newVel = satGlobalVel.clone().sub(newCentral.velocity);
                    // Log transition
                    console.log(`[PhysicsEngine] Satellite ${satellite.id} exited SOI of ${centralBody.name}, switching to ${newCentral.name}`);
                    // Update satellite's reference frame
                    satellite.centralBodyNaifId = parentNaifId;
                    satellite.position.copy(newPos);
                    satellite.velocity.copy(newVel);
                } else {
                    // If no parent, reference to SSB (0,0,0)
                    const newPos = satGlobalPos.clone();
                    const newVel = satGlobalVel.clone();
                    console.log(`[PhysicsEngine] Satellite ${satellite.id} exited all SOIs, switching to SSB`);
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
        // Satellite's global position
        const satGlobalPos = satellite.position.clone().add(centralBody.position);

        // --- Compute satellite's global acceleration ---
        for (const [bodyId, body] of Object.entries(this.bodies)) {
            const r = new THREE.Vector3().subVectors(body.position, satGlobalPos);
            const distance = r.length();
            let accVec = new THREE.Vector3();
            if (distance > 0) {
                const gravAccel = (Constants.G * body.mass) / (distance * distance * distance);
                accVec.copy(r).multiplyScalar(gravAccel);
                totalAccel.add(accVec);
            }
            a_bodies[bodyId] = [accVec.x, accVec.y, accVec.z];
        }

        // --- Compute central body's global acceleration ---
        const centralAccel = new THREE.Vector3();
        for (const [bodyId, body] of Object.entries(this.bodies)) {
            if (bodyId == satellite.centralBodyNaifId) continue; // skip self
            const r = new THREE.Vector3().subVectors(body.position, centralBody.position);
            const distance = r.length();
            if (distance > 0) {
                const gravAccel = (Constants.G * body.mass) / (distance * distance * distance);
                centralAccel.add(r.multiplyScalar(gravAccel));
            }
        }

        // --- Subtract central body's acceleration to get planet-centric acceleration ---
        totalAccel.sub(centralAccel);

        // Attach per-body gravity to satellite for UI
        satellite.a_bodies = a_bodies;
        satellite.a_j2 = [0, 0, 0];
        satellite.a_drag = [0, 0, 0];
        satellite.a_total = [totalAccel.x, totalAccel.y, totalAccel.z];
        return totalAccel;
    }

    _integrateRK4(satellite, acceleration, dt) {
        // All integration is done in planet-centric frame
        // But force calculations use global positions
        const centralBody = this.bodies[satellite.centralBodyNaifId];
        if (!centralBody) return;

        const pos0 = satellite.position.clone(); // planet-centric
        const vel0 = satellite.velocity.clone();
        const acc0 = acceleration;

        // k1
        const k1v = acc0.clone().multiplyScalar(dt);
        const k1p = vel0.clone().multiplyScalar(dt);

        // k2
        const pos1 = pos0.clone().addScaledVector(k1p, 0.5);
        const vel1 = vel0.clone().addScaledVector(k1v, 0.5);
        // Compute acceleration at pos1 (convert to global)
        const acc1 = this._computeSatelliteAcceleration({ ...satellite, position: pos1 });
        const k2v = acc1.clone().multiplyScalar(dt);
        const k2p = vel1.clone().multiplyScalar(dt);

        // k3
        const pos2 = pos0.clone().addScaledVector(k2p, 0.5);
        const vel2 = vel0.clone().addScaledVector(k2v, 0.5);
        const acc2 = this._computeSatelliteAcceleration({ ...satellite, position: pos2 });
        const k3v = acc2.clone().multiplyScalar(dt);
        const k3p = vel2.clone().multiplyScalar(dt);

        // k4
        const pos3 = pos0.clone().add(k3p);
        const vel3 = vel0.clone().add(k3v);
        const acc3 = this._computeSatelliteAcceleration({ ...satellite, position: pos3 });
        const k4v = acc3.clone().multiplyScalar(dt);
        const k4p = vel3.clone().multiplyScalar(dt);

        // Final update (planet-centric)
        satellite.position.copy(pos0)
            .addScaledVector(k1p, 1 / 6)
            .addScaledVector(k2p, 1 / 3)
            .addScaledVector(k3p, 1 / 3)
            .addScaledVector(k4p, 1 / 6);

        satellite.velocity.copy(vel0)
            .addScaledVector(k1v, 1 / 6)
            .addScaledVector(k2v, 1 / 3)
            .addScaledVector(k3v, 1 / 3)
            .addScaledVector(k4v, 1 / 6);

        satellite.acceleration.copy(acceleration);
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

            states[id] = {
                id: id,
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                acceleration: satellite.acceleration.toArray(),
                mass: satellite.mass,
                altitude_radial,
                altitude_surface,
                speed,
                // Include UI properties
                color: satellite.color,
                name: satellite.name,
                centralBodyNaifId: satellite.centralBodyNaifId
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