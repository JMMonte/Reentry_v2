import * as Astronomy from 'astronomy-engine';
import { solarSystemDataManager } from '../PlanetaryDataManager.js';
import { MathUtils } from '../utils/MathUtils.js';
import { PhysicsVector3 } from '../utils/PhysicsVector3.js';
import { PhysicsQuaternion } from '../utils/PhysicsQuaternion.js';

// Extract the functions we need from the Astronomy module
const { MakeTime, RotationAxis, Rotation_EQJ_ECL, RotateVector } = Astronomy;

/**
 * CelestialBodyEngine - Focused celestial body management and calculations
 * 
 * Extracted from PhysicsEngine to improve maintainability and separation of concerns.
 * Handles all celestial body operations: positions, orientations, barycenters, state management.
 */
export class CelestialBodyEngine {
    constructor() {
        // No reference to PhysicsEngine to avoid circular dependencies
        
        // Body storage
        this.bodies = {};
        
        // Barycenter calculations
        this.barycenters = new Map();
        
        // Dependency references (set via initialize)
        this.hierarchy = null;
        this.stateCalculator = null;
        this.positionManager = null;

        // Object pooling to avoid creating new objects every frame
        this._tempVec3Pool = [];
        this._tempQuatPool = [];
        this._poolIndex = 0;
        
        // Pre-allocate commonly used vectors and quaternions
        this._zeroVector = new PhysicsVector3(0, 0, 0);
        this._identityQuaternion = new PhysicsQuaternion();
        this._unitVectors = {
            x: new PhysicsVector3(1, 0, 0),
            y: new PhysicsVector3(0, 1, 0), 
            z: new PhysicsVector3(0, 0, 1)
        };
        
        // Working vectors/quaternions for calculations (reused)
        this._workVec1 = new PhysicsVector3();
        this._workVec2 = new PhysicsVector3();
        this._workVec3 = new PhysicsVector3();
        this._workQuat1 = new PhysicsQuaternion();
        this._workQuat2 = new PhysicsQuaternion();
    }

    // ================================================================
    // PUBLIC API - Core Body Management
    // ================================================================

    /**
     * Initialize the engine with required dependencies
     */
    initialize(hierarchy, stateCalculator, positionManager) {
        this.hierarchy = hierarchy;
        this.stateCalculator = stateCalculator;
        this.positionManager = positionManager;
    }

    /**
     * Update all bodies using the modular system
     */
    async updateAllBodies(simulationTime, bodyConfigs) {
        try {
            // Get all body configurations from PlanetaryDataManager
            const configs = bodyConfigs || solarSystemDataManager.naifToBody;



            // Handle both Map and Object configurations
            const configSize = configs instanceof Map ? configs.size : (configs ? Object.keys(configs).length : 0);
            
            if (!configs || configSize === 0) {
                console.error('[CelestialBodyEngine] No body configurations available');
                console.error('[CelestialBodyEngine] solarSystemDataManager.initialized:', solarSystemDataManager.initialized);
                console.error('[CelestialBodyEngine] solarSystemDataManager.naifToBody size:', solarSystemDataManager.naifToBody?.size);
                return { bodies: {}, barycenters: new Map() };
            }

            // Use PositionManager to update all positions hierarchically
            const updatedBodies = this.positionManager.updateAllPositions(simulationTime, configs);

        // Calculate orientations for all bodies and ensure type information is preserved
        for (const body of Object.values(updatedBodies)) {
            const orientation = this._calculateBodyOrientation(body.name, simulationTime);
            
            // Reuse existing quaternion object if it exists, otherwise create once
            if (!body.quaternion) {
                body.quaternion = new PhysicsQuaternion();
            }
            body.quaternion.copy(orientation.quaternion);
            
            body.poleRA = orientation.poleRA;
            body.poleDec = orientation.poleDec;
            body.spin = orientation.spin;
            
            // Reuse existing northPole vector if it exists, otherwise create once
            if (!body.northPole) {
                body.northPole = new PhysicsVector3();
            }
            body.northPole.copy(orientation.northPole);
            
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
                body.polarRadius = bodyConfig.polarRadius || bodyConfig.radius;
                body.equatorialRadius = bodyConfig.equatorialRadius || bodyConfig.radius;
                // Copy orientation properties for coordinate transformations
                body.tilt = bodyConfig.tilt;
                body.obliquity = bodyConfig.obliquity;
                body.poleRARate = bodyConfig.poleRARate;
                body.poleDecRate = bodyConfig.poleDecRate;
                body.spinRate = bodyConfig.spinRate;
                // Don't modify barycenter mass/GM - let them keep original values for orbital calculations
                // Physics filtering will handle excluding them from gravitational forces
            }
        }

        // Store the updated bodies
        this.bodies = updatedBodies;
        
            // Update barycenters
            this.updateBarycenters();
            
            return {
                bodies: this.bodies,
                barycenters: this.barycenters
            };
        } catch (error) {
            console.error('[CelestialBodyEngine] Error updating bodies:', error);
            console.error('[CelestialBodyEngine] Error stack:', error.stack);
            
            // Return empty state on error
            return {
                bodies: {},
                barycenters: new Map()
            };
        }
    }

    /**
     * Update barycenters (simplified version)
     */
    updateBarycenters() {
        // Always set SSB (naif 0) at origin - reuse existing if possible
        let ssb = this.barycenters.get(0);
        if (!ssb) {
            ssb = {
                naif: 0,
                name: 'Solar System Barycenter',
                position: this._zeroVector.clone(),
                velocity: this._zeroVector.clone(),
                mass: 0
            };
            this.barycenters.set(0, ssb);
        } else {
            // Just reset position/velocity to zero
            ssb.position.set(0, 0, 0);
            ssb.velocity.set(0, 0, 0);
        }

        // Special EMB calculation if both Earth and Moon are present
        const earth = this.bodies[399];
        const moon = this.bodies[301];
        if (earth && moon) {
            const totalMass = earth.mass + moon.mass;
            
            // Reuse working vectors for barycenter calculation
            const calculatedBaryPos = this._workVec1.set(0, 0, 0)
                .addScaledVector(earth.position, earth.mass / totalMass)
                .addScaledVector(moon.position, moon.mass / totalMass);
                
            const calculatedBaryVel = this._workVec2.set(0, 0, 0)
                .addScaledVector(earth.velocity, earth.mass / totalMass)
                .addScaledVector(moon.velocity, moon.mass / totalMass);
            
            // Reuse existing EMB if possible
            let emb = this.barycenters.get(3);
            if (!emb) {
                emb = {
                    naif: 3,
                    name: 'Earth-Moon Barycenter',
                    position: calculatedBaryPos.clone(),
                    velocity: calculatedBaryVel.clone(),
                    mass: totalMass
                };
                this.barycenters.set(3, emb);
            } else {
                // Update existing EMB
                emb.position.copy(calculatedBaryPos);
                emb.velocity.copy(calculatedBaryVel);
                emb.mass = totalMass;
            }
        } else if (this.bodies[3]) {
            // Fallback: use body[3] if present
            const embBody = this.bodies[3];
            let emb = this.barycenters.get(3);
            if (!emb) {
                emb = {
                    naif: 3,
                    name: embBody.name,
                    position: embBody.position.clone(),
                    velocity: embBody.velocity.clone(),
                    mass: embBody.mass
                };
                this.barycenters.set(3, emb);
            } else {
                // Update existing EMB
                emb.name = embBody.name;
                emb.position.copy(embBody.position);
                emb.velocity.copy(embBody.velocity);
                emb.mass = embBody.mass;
            }
        }

        // Add all other barycenters from bodies (skip 0 and 3, already handled)
        for (const [, body] of Object.entries(this.bodies)) {
            const numId = Number(body.naif_id);
            if ((numId === 0 || numId === 3) || !body || body.type !== 'barycenter') continue;
            
            // Reuse existing barycenter if possible
            let barycenter = this.barycenters.get(numId);
            if (!barycenter) {
                barycenter = {
                    naif: numId,
                    name: body.name,
                    position: body.position.clone(),
                    velocity: body.velocity.clone(),
                    mass: body.mass
                };
                this.barycenters.set(numId, barycenter);
            } else {
                // Update existing barycenter
                barycenter.name = body.name;
                barycenter.position.copy(body.position);
                barycenter.velocity.copy(body.velocity);
                barycenter.mass = body.mass;
            }
        }
    }

    /**
     * Find the appropriate SOI for a given global position
     * Returns the NAIF ID of the body whose SOI contains the position
     */
    findAppropriateSOI(globalPos) {
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

    // ================================================================
    // PUBLIC API - State Getters
    // ================================================================

    /**
     * Get body states for external consumers
     */
    getBodyStates() {
        const states = {};
        for (const [naifId, body] of Object.entries(this.bodies)) {
            states[naifId] = {
                naif: naifId,
                name: body.name,
                position: body.position.toArray(),
                velocity: body.velocity.toArray(),
                mass: body.mass,
                radius: body.radius,
                equatorialRadius: body.radius,
                polarRadius: body.polarRadius || body.radius,
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
                tilt: body.tilt,
                obliquity: body.obliquity,
                quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
                poleRA: body.poleRA,
                poleDec: body.poleDec,
                spin: body.spin,
                northPole: body.northPole.toArray(),
            };
        }
        return states;
    }

    /**
     * Get barycenter states for external consumers
     */
    getBarycenterStates() {
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
            
            // Extract atmosphere data from configuration
            const atmosphereThickness = body.atmosphere?.thickness || 0; // km
            const atmosphericModel = body.atmosphericModel;
            
            bodies.push({
                id: Number(naifId),
                naifId: Number(naifId),
                name: body.name,
                position: body.position.toArray(),
                radius: body.radius,
                atmosphereThickness,
                atmosphericModel: atmosphericModel ? {
                    maxAltitude: atmosphericModel.maxAltitude || 0,
                    scaleHeight: atmosphericModel.scaleHeight || 0
                } : null
            });
        }
        return bodies;
    }

    /**
     * Get body data for orbital calculations (includes mass/GM)
     * Returns: [{ id, name, position: [x, y, z], mass, GM, naifId }]
     */
    getBodiesForOrbitPropagation(simulationTime) {
        const bodies = [];
        for (const [naifId, body] of Object.entries(this.bodies)) {
            if (!body || typeof body.position?.toArray !== 'function') continue;
            bodies.push({
                id: Number(naifId),
                naifId: Number(naifId),
                name: body.name,
                position: body.position.toArray(),
                velocity: body.velocity?.toArray ? body.velocity.toArray() : [0, 0, 0],
                mass: body.mass || 0,
                GM: body.GM || 0,
                radius: body.radius || 0,
                type: body.type,
                // Include orientation data for coordinate transformations
                quaternion: body.quaternion ? [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] : [0, 0, 0, 1],
                rotationPeriod: body.rotationPeriod,
                poleRA: body.poleRA,
                poleDec: body.poleDec,
                spin: body.spin,
                spinReferenceTime: simulationTime?.getTime ? simulationTime.getTime() : Date.now(), // Time at which spin value is valid
                // Include additional orientation calculation data
                poleRARate: body.poleRARate || 0,
                poleDecRate: body.poleDecRate || 0,
                spinRate: body.spinRate || (body.rotationPeriod ? 360.0 / (body.rotationPeriod / 86400) : 0), // degrees per day
                // Include shape data for proper geodetic calculations
                equatorialRadius: body.radius,
                polarRadius: body.polarRadius || body.radius
            });
        }
        return bodies;
    }

    // ================================================================
    // PRIVATE METHODS - Orientation Calculations
    // ================================================================

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
                return this._createOrientationFromAxisInfo(axisInfo, astroTime, bodyIdentifier, bodyConfig);
            } catch {
                // Fall back to manual calculation using config data
                return this._calculateOrientationFromConfig(bodyConfig, time);
            }
        } catch {
            // Return identity quaternion as fallback - reuse working objects
            this._workQuat1.copy(this._identityQuaternion);
            this._workVec2.copy(this._unitVectors.z);
            
            return {
                quaternion: this._workQuat1,
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: this._workVec2
            };
        }
    }

    /**
     * Create orientation from Astronomy Engine axis info
     */
    _createOrientationFromAxisInfo(axisInfo, astroTime, bodyIdentifier, bodyConfig) {
        try {
            // Convert RA from hours to radians (15° per hour)
            const raRad = axisInfo.ra * (Math.PI / 12);
            const decRad = axisInfo.dec * (Math.PI / 180);
            // Normalize spin to [0, 360) degrees, then convert to [0, 2π) radians
            let normalizedSpin = ((axisInfo.spin % 360) + 360) % 360;
            
            // Apply surface coordinate alignment based on body configuration
            // This aligns Astronomy Engine's celestial reference frame with the body's
            // surface coordinate system (where longitude 0° should align with prime meridian)
            let surfaceAlignmentOffset = 0;
            if (bodyConfig && bodyConfig.surfaceCoordinateOffset !== undefined) {
                surfaceAlignmentOffset = bodyConfig.surfaceCoordinateOffset;
            }
            
            normalizedSpin = ((normalizedSpin + surfaceAlignmentOffset) % 360 + 360) % 360;
            
            const spinRad = normalizedSpin * (Math.PI / 180);

            // Create the pole direction vector in J2000 equatorial coordinates
            const poleX_eqj = Math.cos(decRad) * Math.cos(raRad);
            const poleY_eqj = Math.cos(decRad) * Math.sin(raRad);
            const poleZ_eqj = Math.sin(decRad);

            // Transform pole vector from J2000 equatorial to J2000 ecliptic using Astronomy Engine
            const poleVector_eqj = {
                x: poleX_eqj,
                y: poleY_eqj,
                z: poleZ_eqj,
                t: astroTime
            };

            const rotationMatrix = Rotation_EQJ_ECL();
            const poleVector_ecl = RotateVector(rotationMatrix, poleVector_eqj);
            const poleVector = this._workVec1.set(poleVector_ecl.x, poleVector_ecl.y, poleVector_ecl.z);

            // Calculate orientation quaternion
            const quaternion = this._calculateQuaternionFromPole(poleVector, spinRad);

            // Reuse working quaternion and vector for return values
            this._workQuat1.copy(quaternion);
            this._workVec2.copy(poleVector);
            
            return {
                quaternion: this._workQuat1,
                poleRA: axisInfo.ra,
                poleDec: axisInfo.dec,
                spin: normalizedSpin, // Use the adjusted spin value for consistency
                northPole: this._workVec2
            };
        } catch (error) {
            console.warn(`[CelestialBodyEngine] Failed to create orientation from Astronomy Engine for ${bodyIdentifier}:`, error);
            // Return identity quaternion as fallback - reuse working objects
            this._workQuat1.copy(this._identityQuaternion);
            this._workVec2.copy(this._unitVectors.z);
            
            return {
                quaternion: this._workQuat1,
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: this._workVec2
            };
        }
    }

    /**
     * Calculate orientation from configuration data (fallback)
     */
    _calculateOrientationFromConfig(bodyConfig, time) {
        if (!bodyConfig || !bodyConfig.poleRA || !bodyConfig.poleDec) {
            // Reuse working objects for fallback
            this._workQuat1.copy(this._identityQuaternion);
            this._workVec2.copy(this._unitVectors.z);
            
            return {
                quaternion: this._workQuat1,
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: this._workVec2
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
        let spin = bodyConfig.spin + (bodyConfig.spinRate || 0) * daysSinceJ2000;

        // Apply surface coordinate alignment based on body configuration
        let surfaceAlignmentOffset = 0;
        if (bodyConfig && bodyConfig.surfaceCoordinateOffset !== undefined) {
            surfaceAlignmentOffset = bodyConfig.surfaceCoordinateOffset;
        }
        
        spin = ((spin + surfaceAlignmentOffset) % 360 + 360) % 360;

        // Convert to radians
        const raRad = poleRA * (Math.PI / 180);
        const decRad = poleDec * (Math.PI / 180);
        const spinRad = spin * (Math.PI / 180);

        // Create pole vector in J2000 equatorial coordinates
        const poleVector = this._workVec1.set(
            Math.cos(decRad) * Math.cos(raRad),
            Math.cos(decRad) * Math.sin(raRad),
            Math.sin(decRad)
        );
        
        // Rotate from equatorial to ecliptic (J2000) by -23.43928 deg about X
        const obliquity = MathUtils.degToRad(23.43928);
        const eqToEclQ = PhysicsQuaternion.fromAxisAngle(this._unitVectors.x, -obliquity);
        poleVector.applyQuaternion(eqToEclQ);

        const quaternion = this._calculateQuaternionFromPole(poleVector, spinRad);

        // Reuse working objects for return values
        this._workQuat1.copy(quaternion);
        this._workVec2.copy(poleVector);

        return {
            quaternion: this._workQuat1,
            poleRA: poleRA,
            poleDec: poleDec,
            spin: spin,
            northPole: this._workVec2
        };
    }

    /**
     * Calculate quaternion from pole vector and spin
     */
    _calculateQuaternionFromPole(poleVector, spinRad) {
        // Start with the vernal equinox direction (ECLIPJ2000 X-axis)
        const vernalEquinox = this._unitVectors.x;

        // Reuse working vectors for calculations
        const poleComponent = this._workVec2.copy(vernalEquinox).projectOnVector(poleVector);
        const primeReference = this._workVec3.copy(vernalEquinox).sub(poleComponent).normalize();

        // If the result is too small (pole nearly parallel to vernal equinox), use Y-axis
        if (primeReference.length() < 0.1) {
            const yAxis = this._unitVectors.y;
            const poleComponentY = this._workVec2.copy(yAxis).projectOnVector(poleVector);
            primeReference.copy(yAxis).sub(poleComponentY).normalize();
        }

        // Apply the spin rotation to get the actual prime meridian direction
        const spinQuaternion = PhysicsQuaternion.fromAxisAngle(poleVector, spinRad);
        const primeMeridianDirection = primeReference.clone().applyQuaternion(spinQuaternion);

        // Construct the planet's coordinate system using working vectors
        const planetZ = poleVector.clone().normalize();
        const planetX = primeMeridianDirection.normalize(); // Don't clone, just normalize in place
        
        // Calculate planetY = planetX × planetZ (cross product)
        const planetY = this._workVec2.crossVectors(planetX, planetZ).normalize();

        // Ensure right-handed system
        if (planetX.dot(this._workVec3.crossVectors(planetY, planetZ)) < 0) {
            planetY.negate();
        }

        // Create rotation matrix and convert to quaternion
        // Manual quaternion calculation from rotation matrix elements
        const m11 = planetX.x, m12 = planetY.x, m13 = planetZ.x;
        const m21 = planetX.y, m22 = planetY.y, m23 = planetZ.y;
        const m31 = planetX.z, m32 = planetY.z, m33 = planetZ.z;
        
        // Convert rotation matrix to quaternion using Shepperd's method
        const trace = m11 + m22 + m33;
        let w, x, y, z;
        
        if (trace > 0) {
            const s = Math.sqrt(trace + 1.0) * 2; // s = 4 * qw
            w = 0.25 * s;
            x = (m32 - m23) / s;
            y = (m13 - m31) / s;
            z = (m21 - m12) / s;
        } else if ((m11 > m22) && (m11 > m33)) {
            const s = Math.sqrt(1.0 + m11 - m22 - m33) * 2; // s = 4 * qx
            w = (m32 - m23) / s;
            x = 0.25 * s;
            y = (m12 + m21) / s;
            z = (m13 + m31) / s;
        } else if (m22 > m33) {
            const s = Math.sqrt(1.0 + m22 - m11 - m33) * 2; // s = 4 * qy
            w = (m13 - m31) / s;
            x = (m12 + m21) / s;
            y = 0.25 * s;
            z = (m23 + m32) / s;
        } else {
            const s = Math.sqrt(1.0 + m33 - m11 - m22) * 2; // s = 4 * qz
            w = (m21 - m12) / s;
            x = (m13 + m31) / s;
            y = (m23 + m32) / s;
            z = 0.25 * s;
        }
        
        return new PhysicsQuaternion(x, y, z, w);
    }
}