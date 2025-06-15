import { PhysicsVector3 } from './PhysicsVector3.js';
import { PhysicsQuaternion } from './PhysicsQuaternion.js';
import { GeodeticUtils } from './GeodeticUtils.js';
import { OrbitalMechanics } from '../core/OrbitalMechanics.js';
import { MathUtils } from './MathUtils.js';

/**
 * CoordinateTransforms.js — Advanced Multi-Planet Coordinate System Management
 * 
 * RESPONSIBILITIES:
 * • Satellite creation from geographic coordinates or orbital elements
 * • Multi-planet coordinate system transformations using quaternions
 * • Physics engine integration for real-time planetary orientations
 * • Reference frame management (Planet-Fixed, Planet-Centered Inertial, SSB)
 * • Launch velocity calculations accounting for planetary rotation
 * • Generic celestial body support (not just Earth)
 * 
 * COORDINATE SYSTEM HIERARCHY:
 * • Solar System Barycentric (SSB): Master inertial frame for all bodies
 * • Planet-Centered Inertial (PCI): Non-rotating frame centered at planet
 * • Planet-Fixed (PF): Rotating with planet surface (like ECEF for Earth)
 * • Geographic (GEO): Latitude/longitude/altitude representation
 * 
 * KEY FEATURES:
 * • Uses physics engine quaternions for accurate planetary orientations
 * • Supports ellipsoidal planet shapes and proper geodetic calculations
 * • Handles time-dependent transformations with planetary rotation
 * • Integrates with astronomy-engine for coordinate frame conversions
 * • Works with any celestial body that has proper quaternion setup
 * 
 * USE THIS FOR:
 * • Creating satellites from lat/lon coordinates on any planet
 * • Converting between different coordinate reference frames
 * • Physics engine integration requiring accurate transformations
 * • Multi-body system coordinate calculations
 * 
 * USE GeodeticUtils.js FOR:
 * • Low-level geodetic coordinate conversions
 * • Ellipsoidal mathematics for non-spherical planets
 * • Orbital element to state vector transformations
 * 
 * Reference Frames:
 * - Planet-Fixed (PF): Rotating with the planet surface (like ECEF for Earth)
 * - Planet-Centered Inertial (PCI): Inertial frame centered at planet (like ECI for Earth) 
 * - Solar System Barycentric (SSB): Inertial frame centered at solar system barycenter
 * 
 * Design Principles:
 * 1. Use local planet quaternions from physics engine (more reliable than manual calculations)
 * 2. Proper time-dependent transformations accounting for planet rotation
 * 3. Generic implementation that works for any celestial body
 * 4. Accurate coordinate system transformations between reference frames
 */
export class CoordinateTransforms {

    /**
     * Create satellite from lat/lon using planet's local quaternion and rotation
     * @param {Object} params - Satellite parameters (lat, lon, altitude, azimuth, velocity, etc.)
     * @param {Object} planet - Planet object with quaternion, rotation rate, and physical properties
     * @param {Date} time - Current simulation time
     * @returns {Object} - { position: [x,y,z], velocity: [vx,vy,vz] } in planet-centric inertial coordinates
     */
    static createFromLatLon(params, planet, time = new Date()) {
        const {
            latitude, longitude, altitude = 400,
            velocity, azimuth = 90, angleOfAttack = 0  // Default to eastward for orbital motion
        } = params;

        // Calculate appropriate orbital velocity if not provided
        let finalVelocity = velocity;
        if (velocity === undefined) {
            // Calculate circular orbital velocity accounting for planet rotation and launch direction
            // For circular orbit, we need the surface-relative velocity that results in circular orbital velocity
            // after accounting for planet rotation
            finalVelocity = CoordinateTransforms._calculateCircularLaunchVelocity(
                latitude, longitude, altitude, azimuth, angleOfAttack, planet
            );
        }

        // 1. Calculate position in Planet-Fixed frame (rotating with surface)
        const positionPF = CoordinateTransforms._latLonAltToPlanetFixed(
            latitude, longitude, altitude, planet
        );

        // 2. Calculate velocity in Planet-Fixed frame (ENU at launch site)
        const velocityPF = CoordinateTransforms._calculatePlanetFixedVelocity(
            latitude, longitude, finalVelocity, azimuth, angleOfAttack
        );

        // 3. Transform from Planet-Fixed to Planet-Centered Inertial frame using current time
        const { position: positionPCI, velocity: velocityPCI } =
            CoordinateTransforms._transformPlanetFixedToPlanetInertial(
                positionPF, velocityPF, planet, time
            );

        return {
            position: positionPCI,
            velocity: velocityPCI
        };
    }

    /**
     * Create satellite from orbital elements using planet's gravitational parameter
     * @param {Object} params - Orbital element parameters
     * @param {Object} planet - Planet object with GM and physical properties
     * @returns {Object} - { position: [x,y,z], velocity: [vx,vy,vz] } in planet-centric inertial coordinates
     */
    static createFromOrbitalElements(params, planet) {
        const {
            semiMajorAxis, eccentricity, inclination,
            argumentOfPeriapsis, raan, trueAnomaly,
            referenceFrame = 'equatorial' // 'equatorial' or 'ecliptic'
        } = params;

        // Validate orbital elements
        if (semiMajorAxis <= 0) {
            throw new Error(`Invalid semi-major axis: ${semiMajorAxis} km (must be > 0)`);
        }
        if (eccentricity < 0) {
            throw new Error(`Invalid eccentricity: ${eccentricity} (must be >= 0)`);
        }
        if (eccentricity >= 1) {
            console.warn(`[CoordinateTransforms] Hyperbolic/parabolic orbit (e=${eccentricity}) - orbit will not be closed`);
        }

        // Get gravitational parameter with fallback
        const GM = OrbitalMechanics.getGravitationalParameter(planet); // km³/s²


        if (!GM || isNaN(GM) || GM <= 0) {
            throw new Error(`Invalid gravitational parameter GM=${GM} for planet: ${planet.name || 'unknown'}`);
        }

        // 1. Calculate orbital state vectors in the requested reference frame
        const { positionECI, velocityECI } = GeodeticUtils.calculatePositionAndVelocityFromOrbitalElements(
            semiMajorAxis, eccentricity, inclination,
            argumentOfPeriapsis, raan, trueAnomaly, GM
        );

        // 2. Transform based on reference frame
        let position, velocity;

        if (referenceFrame === 'ecliptic') {
            // Ecliptic mode: 0° inclination = ecliptic plane (scene's XY plane)
            // Use coordinates directly - already relative to scene's coordinate system
            position = [positionECI.x, positionECI.y, positionECI.z];
            velocity = [velocityECI.x, velocityECI.y, velocityECI.z];
        } else {
            // Equatorial mode: 0° inclination = planet's equatorial plane
            // Transform from ecliptic to planet's equatorial frame
            const { position: posEq, velocity: velEq } = CoordinateTransforms._transformEclipticToEquatorial(
                positionECI, velocityECI, planet
            );
            position = posEq;
            velocity = velEq;
        }


        return { position, velocity };
    }

    /**
     * Transform orbital coordinates from ecliptic frame to planet's equatorial frame
     * This rotates the coordinate system so that 0° inclination aligns with planet's equator
     */
    static _transformEclipticToEquatorial(positionECI, velocityECI, planet) {
        // Get the transformation from ecliptic to planet's equatorial plane
        // This is the inverse of the planet's orientation (equatorialGroup transformation)
        const equatorialTransform = CoordinateTransforms._getEclipticToEquatorialTransform(planet);

        // Apply transformation to position and velocity
        const positionEq_vec = positionECI.clone().applyQuaternion(equatorialTransform);
        const velocityEq_vec = velocityECI.clone().applyQuaternion(equatorialTransform);

        const position = [positionEq_vec.x, positionEq_vec.y, positionEq_vec.z];
        const velocity = [velocityEq_vec.x, velocityEq_vec.y, velocityEq_vec.z];

        return { position, velocity };
    }

    /**
     * Get transformation from ecliptic coordinates to planet's equatorial coordinates
     */
    static _getEclipticToEquatorialTransform(planet) {
        // First priority: Use physics engine quaternion if available
        if (planet.quaternion && Array.isArray(planet.quaternion) && planet.quaternion.length === 4) {
            const [x, y, z, w] = planet.quaternion;
            return new PhysicsQuaternion(x, y, z, w);
        }

        // Second priority: Use planet's orientation data if available
        if (planet.orientationGroup?.quaternion) {
            const q = planet.orientationGroup.quaternion;
            return new PhysicsQuaternion(q.x, q.y, q.z, q.w);
        }

        // Third priority: Calculate from tilt/obliquity if available
        if (planet.obliquity !== undefined) {
            const obliquityRad = MathUtils.degToRad(planet.obliquity);
            return PhysicsQuaternion.fromAxisAngle(new PhysicsVector3(1, 0, 0), obliquityRad);
        }

        // Fourth priority: Calculate from pole coordinates if available
        if (planet.poleRA !== undefined && planet.poleDec !== undefined) {
            const poleRArad = MathUtils.degToRad(planet.poleRA);
            const poleDecRad = MathUtils.degToRad(planet.poleDec);

            // Convert pole coordinates to vector
            const poleVector = new PhysicsVector3(
                Math.cos(poleDecRad) * Math.cos(poleRArad),
                Math.cos(poleDecRad) * Math.sin(poleRArad),
                Math.sin(poleDecRad)
            );

            return CoordinateTransforms._calculateQuaternionFromPole(poleVector, 0);
        }

        // Default: No transformation (identity quaternion)
        return new PhysicsQuaternion();
    }

    /**
     * Convert geographic coordinates to Planet-Fixed cartesian coordinates
     * Uses GeodeticUtils for proper ellipsoid mathematics
     */
    static _latLonAltToPlanetFixed(latitude, longitude, altitude, planet) {
        let result;
        // Use ellipsoidal calculation if planet has polar radius
        if (planet.polarRadius && planet.polarRadius !== planet.radius) {
            result = GeodeticUtils.latLonAltToEllipsoid(
                latitude, longitude, altitude,
                planet.radius, planet.polarRadius
            ).toArray();
        } else {
            // Use spherical calculation
            result = GeodeticUtils.latLonAltToECEF(
                latitude, longitude, altitude, planet.radius
            ).toArray();
        }


        return result;
    }



    /**
     * Calculate velocity in Planet-Fixed frame using ENU (East-North-Up) convention
     */
    static _calculatePlanetFixedVelocity(latitude, longitude, speed, azimuth, angleOfAttack) {
        const azRad = MathUtils.degToRad(azimuth);
        const aoaRad = MathUtils.degToRad(angleOfAttack);

        // Velocity components in ENU frame
        const velEast = speed * Math.cos(aoaRad) * Math.sin(azRad);
        const velNorth = speed * Math.cos(aoaRad) * Math.cos(azRad);
        const velUp = speed * Math.sin(aoaRad);

        // Convert to ECEF coordinates using GeodeticUtils
        return GeodeticUtils.enuVelocityToECEF(latitude, longitude, velEast, velNorth, velUp);
    }

    /**
     * Transform from Planet-Fixed to Planet-Centered Inertial frame using planet's quaternion
     */
    static _transformPlanetFixedToPlanetInertial(positionPF, velocityPF, planet, time = new Date()) {
        // The physics engine has calculated the proper orientation including axial tilt and rotation

        // Get planet's rotation rate
        const rotationRate = CoordinateTransforms._calculateRotationRate(planet);

        // Use the physics engine's quaternion - it's the authoritative orientation
        if (planet.quaternion && Array.isArray(planet.quaternion) && planet.quaternion.length === 4) {
            const [x, y, z, w] = planet.quaternion;
            const planetQuaternion = new PhysicsQuaternion(x, y, z, w);

            // The physics quaternion transforms FROM planet-fixed TO inertial
            // Planet-fixed coordinates are already in the correct body-fixed system
            const positionPF_vec = PhysicsVector3.fromArray(positionPF);
            const positionPCI_vec = positionPF_vec.clone().applyQuaternion(planetQuaternion);

            // Transform velocity: PF to PCI
            const velocityPF_vec = PhysicsVector3.fromArray(velocityPF);

            // Get planet's angular velocity vector in inertial frame
            // The angular velocity is along the planet's rotation axis (north pole direction)
            const omegaPF = new PhysicsVector3(0, 0, rotationRate); // Z-axis in planet-fixed frame
            const omegaPCI = omegaPF.clone().applyQuaternion(planetQuaternion); // Transform to inertial frame

            // Calculate rotation velocity: v_rotation = ω × r (in inertial frame)
            const rotationVelocityPCI = new PhysicsVector3().crossVectors(omegaPCI, positionPCI_vec);

            // Transform surface-relative velocity to inertial frame
            const velocityPCI_vec = velocityPF_vec.clone().applyQuaternion(planetQuaternion);

            // Add rotation velocity to get total inertial velocity
            // v_inertial = v_surface_relative + v_rotation
            velocityPCI_vec.add(rotationVelocityPCI);

            return {
                position: positionPCI_vec.toArray(),
                velocity: velocityPCI_vec.toArray()
            };
        }

        // Fallback: Use simple Z-axis rotation if no physics quaternion available


        // Calculate current rotation angle from time (rotation around Z-axis only)
        const rotationAngle = rotationRate * (time.getTime() / 1000);
        const rotationQuaternion = PhysicsQuaternion.fromAxisAngle(new PhysicsVector3(0, 0, 1), rotationAngle);

        // Transform position: PF to PCI (apply rotation)
        const positionPF_vec = PhysicsVector3.fromArray(positionPF);
        const positionPCI_vec = positionPF_vec.clone().applyQuaternion(rotationQuaternion);



        // Transform velocity: PF to PCI
        const velocityPF_vec = PhysicsVector3.fromArray(velocityPF);
        const angularVelocity = new PhysicsVector3(0, 0, rotationRate);

        // Velocity transformation: v_inertial = v_rotating + ω × r
        const crossProduct = new PhysicsVector3().crossVectors(angularVelocity, positionPF_vec);
        const velocityPCI_vec = velocityPF_vec.clone().applyQuaternion(rotationQuaternion).add(crossProduct);



        return {
            position: positionPCI_vec.toArray(),
            velocity: velocityPCI_vec.toArray()
        };
    }

    /**
     * Get planet's quaternion for velocity transformation (excludes Y-up to Z-up conversion)
     */
    static _getPlanetQuaternionForVelocity(planet, time = new Date()) {
        // For most cases, velocity and position use the same quaternion
        return CoordinateTransforms._getPlanetQuaternion(planet, time);
    }

    /**
     * Get planet's current quaternion calculated from rotation data
     */
    static _getPlanetQuaternion(planet, time = new Date()) {
        // Priority 1: Use physics engine quaternion if available
        if (planet.quaternion && Array.isArray(planet.quaternion) && planet.quaternion.length === 4) {
            const [x, y, z, w] = planet.quaternion;
            return new PhysicsQuaternion(x, y, z, w);
        }

        // Priority 2: Use Three.js orientation group quaternion if available
        if (planet.orientationGroup?.quaternion) {
            const q = planet.orientationGroup.quaternion;
            return new PhysicsQuaternion(q.x, q.y, q.z, q.w);
        }

        // Priority 3: Calculate from rotation period and time
        if (planet.rotationPeriod) {
            const rotationRate = CoordinateTransforms._calculateRotationRate(planet);
            const rotationAngle = rotationRate * (time.getTime() / 1000); // Convert to seconds

            // Create rotation quaternion around Z-axis (assuming standard orientation)
            return PhysicsQuaternion.fromAxisAngle(new PhysicsVector3(0, 0, 1), rotationAngle);
        }

        // Priority 4: Calculate from pole coordinates if available
        if (planet.poleRA !== undefined && planet.poleDec !== undefined) {
            const poleRArad = MathUtils.degToRad(planet.poleRA);
            const poleDecRad = MathUtils.degToRad(planet.poleDec);

            // Convert pole coordinates to vector
            const poleVector = new PhysicsVector3(
                Math.cos(poleDecRad) * Math.cos(poleRArad),
                Math.cos(poleDecRad) * Math.sin(poleRArad),
                Math.sin(poleDecRad)
            );

            // Calculate spin angle if available
            let spinRad = 0;
            if (planet.spin !== undefined) {
                spinRad = MathUtils.degToRad(planet.spin);
            } else if (planet.rotationPeriod) {
                const rotationRate = CoordinateTransforms._calculateRotationRate(planet);
                spinRad = rotationRate * (time.getTime() / 1000);
            }

            return CoordinateTransforms._calculateQuaternionFromPole(poleVector, spinRad);
        }

        // Default: Identity quaternion (no rotation)
        return new PhysicsQuaternion();
    }

    /**
     * Calculate quaternion from pole vector and spin angle
     * This method mirrors the physics engine's orientation calculation
     */
    static _calculateQuaternionFromPole(poleVector, spinRad) {
        // Normalize pole vector
        const pole = poleVector.clone().normalize();

        // Calculate the rotation needed to align Z-axis with pole
        const zAxis = new PhysicsVector3(0, 0, 1);
        const rotationAxis = new PhysicsVector3().crossVectors(zAxis, pole);
        const rotationAngle = Math.acos(MathUtils.clamp(zAxis.dot(pole), -1, 1));

        let poleQuaternion;
        if (rotationAxis.length() < 1e-10) {
            // Pole is already aligned with Z-axis or opposite
            if (pole.z > 0) {
                poleQuaternion = new PhysicsQuaternion(); // Identity
            } else {
                poleQuaternion = PhysicsQuaternion.fromAxisAngle(new PhysicsVector3(1, 0, 0), Math.PI);
            }
        } else {
            rotationAxis.normalize();
            poleQuaternion = PhysicsQuaternion.fromAxisAngle(rotationAxis, rotationAngle);
        }

        // Apply spin rotation around the pole
        const spinQuaternion = PhysicsQuaternion.fromAxisAngle(pole, spinRad);

        // Combine rotations: first align pole, then apply spin
        return PhysicsQuaternion.multiply(spinQuaternion, poleQuaternion);
    }

    /**
     * Calculate planet's rotation rate if not provided
     */
    static _calculateRotationRate(planet) {
        if (planet.rotationPeriod) {
            return (2 * Math.PI) / Math.abs(planet.rotationPeriod); // rad/s
        }

        // Default to Earth's rotation rate if not specified
        const earthRotationPeriod = 86164.1; // seconds (sidereal day)
        return (2 * Math.PI) / earthRotationPeriod;
    }

    /**
     * Get planet's angular velocity vector in inertial frame
     */
    static _getPlanetAngularVelocity(planet, rotationRate, planetQuaternion) {
        // Angular velocity is along the planet's rotation axis (north pole)
        // In planet-fixed frame, this is typically the Z-axis
        const omegaPF = new PhysicsVector3(0, 0, rotationRate);

        // Transform to inertial frame using planet's quaternion
        const omegaPCI = omegaPF.clone().applyQuaternion(planetQuaternion);

        return omegaPCI;
    }

    /**
     * Calculate circular orbital velocity for given altitude and planet
     */
    static _calculateCircularOrbitalVelocity(altitude, planet) {
        const GM = OrbitalMechanics.getGravitationalParameter(planet);
        const radius = planet.radius + altitude;
        return Math.sqrt(GM / radius); // km/s
    }

    /**
     * Calculate the surface-relative launch velocity needed to achieve a circular orbit
     * accounting for planet rotation and launch direction
     */
    static _calculateCircularLaunchVelocity(latitude, longitude, altitude, azimuth, angleOfAttack, planet) {
        // Use the proven OrbitalMechanics implementation
        return OrbitalMechanics.calculateLaunchVelocity(planet, latitude, altitude, azimuth);
    }

    /**
     * Calculate the rotation velocity at a given latitude and altitude
     * @param {number} latitude - Latitude in degrees
     * @param {number} altitude - Altitude in km
     * @param {Object} planet - Planet object
     * @returns {number} - Rotation velocity in km/s
     */
    static _calculateRotationVelocityAtLocation(latitude, altitude, planet) {
        return OrbitalMechanics.calculateSurfaceRotationVelocity(planet, latitude, altitude);
    }

    /**
     * Transform coordinates between different reference frames
     * @param {Array} position - [x, y, z] position in source frame (km)
     * @param {Array} velocity - [vx, vy, vz] velocity in source frame (km/s)
     * @param {string} fromFrame - Source reference frame ('PF', 'PCI', 'SSB', 'GEO')
     * @param {string} toFrame - Target reference frame ('PF', 'PCI', 'SSB', 'GEO')
     * @param {Object} planet - Planet object with quaternion and physical properties
     * @param {Date} time - Time for transformation
     * @returns {Object} - { position: [x,y,z], velocity: [vx,vy,vz] } in target frame
     */
    static transformCoordinates(position, velocity, fromFrame, toFrame, planet, time = new Date()) {
        // Convert input to arrays if needed
        const pos = Array.isArray(position) ? position : [position.x, position.y, position.z];
        const vel = Array.isArray(velocity) ? velocity : [velocity.x, velocity.y, velocity.z];

        // If same frame, return as-is
        if (fromFrame === toFrame) {
            return { position: pos, velocity: vel };
        }

        // Handle different transformation paths
        if (fromFrame === 'planet-fixed' && toFrame === 'planet-inertial') {
            return CoordinateTransforms._transformPlanetFixedToPlanetInertial(pos, vel, planet, time);
        } else if (fromFrame === 'planet-inertial' && toFrame === 'planet-fixed') {
            return CoordinateTransforms._transformPlanetInertialToPlanetFixed(pos, vel, planet, time);
        } else if (fromFrame === 'planet-inertial' && toFrame === 'ssb') {
            return CoordinateTransforms._transformPlanetInertialToSSB(pos, vel, planet);
        } else if (fromFrame === 'ssb' && toFrame === 'planet-inertial') {
            return CoordinateTransforms._transformSSBToPlanetInertial(pos, vel, planet);
        } else {
            throw new Error(`Unsupported coordinate transformation: ${fromFrame} -> ${toFrame}`);
        }
    }

    /**
     * Transform from Planet-Centered Inertial to Planet-Fixed frame (inverse of existing method)
     */
    static _transformPlanetInertialToPlanetFixed(positionPCI, velocityPCI, planet, time) {
        // Get planet's current quaternion (orientation)
        const planetQuaternion = CoordinateTransforms._getPlanetQuaternion(planet, time);

        // Get planet's angular velocity
        const rotationRate = CoordinateTransforms._calculateRotationRate(planet);
        const angularVelocity = CoordinateTransforms._getPlanetAngularVelocity(planet, rotationRate, planetQuaternion);

        // Transform position: PCI to PF (apply inverse rotation)
        const positionPCI_vec = PhysicsVector3.fromArray(positionPCI);
        const positionPF_vec = positionPCI_vec.clone().applyQuaternion(planetQuaternion.getConjugate());

        // Transform velocity: PCI to PF (subtract rotation effect)
        const velocityPCI_vec = PhysicsVector3.fromArray(velocityPCI);
        const crossProduct = new PhysicsVector3().crossVectors(angularVelocity, positionPCI_vec);
        const velocityPF_vec = velocityPCI_vec.clone().sub(crossProduct).applyQuaternion(planetQuaternion.getConjugate());

        return {
            position: positionPF_vec.toArray(),
            velocity: velocityPF_vec.toArray()
        };
    }

    /**
     * Convert Planet-Fixed cartesian to geographic coordinates
     * Uses GeodeticUtils for proper ellipsoid mathematics
     * @param {Array} positionPF - [x, y, z] in planet-fixed frame (km)
     * @param {Object} planet - Planet object with radius and polarRadius
     * @returns {Array} [latitude, longitude, altitude] in degrees and km
     */
    static planetFixedToLatLonAlt(positionPF, planet) {
        const pos = Array.isArray(positionPF) ? positionPF : [positionPF.x, positionPF.y, positionPF.z];

        // Use ellipsoidal calculation if planet has polar radius
        if (planet.polarRadius && planet.polarRadius !== planet.radius) {
            return GeodeticUtils.ecefToGeodetic(pos[0], pos[1], pos[2], planet.radius, planet.polarRadius);
        } else {
            // Use spherical calculation
            return GeodeticUtils.cartesianToGeodetic(pos[0], pos[1], pos[2]);
        }
    }

    /**
     * Transform from Planet-Centered Inertial to Solar System Barycentric
     */
    static _transformPlanetInertialToSSB(positionPCI, velocityPCI, planet) {
        // Add planet's position and velocity to get SSB coordinates
        const planetPos = planet.position || [0, 0, 0];
        const planetVel = planet.velocity || [0, 0, 0];

        const pos = Array.isArray(positionPCI) ? positionPCI : [positionPCI.x, positionPCI.y, positionPCI.z];
        const vel = Array.isArray(velocityPCI) ? velocityPCI : [velocityPCI.x, velocityPCI.y, velocityPCI.z];

        return {
            position: [
                pos[0] + planetPos[0],
                pos[1] + planetPos[1],
                pos[2] + planetPos[2]
            ],
            velocity: [
                vel[0] + planetVel[0],
                vel[1] + planetVel[1],
                vel[2] + planetVel[2]
            ]
        };
    }

    /**
     * Transform from Solar System Barycentric to Planet-Centered Inertial
     */
    static _transformSSBToPlanetInertial(positionSSB, velocitySSB, planet) {
        // Subtract planet's position and velocity to get PCI coordinates
        const planetPos = planet.position || [0, 0, 0];
        const planetVel = planet.velocity || [0, 0, 0];

        const pos = Array.isArray(positionSSB) ? positionSSB : [positionSSB.x, positionSSB.y, positionSSB.z];
        const vel = Array.isArray(velocitySSB) ? velocitySSB : [velocitySSB.x, velocitySSB.y, velocitySSB.z];

        return {
            position: [
                pos[0] - planetPos[0],
                pos[1] - planetPos[1],
                pos[2] - planetPos[2]
            ],
            velocity: [
                vel[0] - planetVel[0],
                vel[1] - planetVel[1],
                vel[2] - planetVel[2]
            ]
        };
    }

    /**
     * Utility: Convert position/velocity arrays to PhysicsVector3 (utility function)
     */
    static toVector3(array) {
        return new PhysicsVector3(array[0], array[1], array[2]);
    }

    /**
     * Utility: Convert PhysicsVector3 to array (utility function)
     */
    static toArray(vector) {
        return [vector.x, vector.y, vector.z];
    }
}