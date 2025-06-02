import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { PhysicsUtils } from './PhysicsUtils.js';
// Removed Bodies import to avoid circular dependency
import { OrbitalMechanics } from '../core/OrbitalMechanics.js';

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
 * USE PhysicsUtils.js FOR:
 * • Low-level mathematical orbital calculations
 * • Earth-specific ECEF/ECI transformations
 * • Classical orbital mechanics without physics engine integration
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
    static createFromLatLon(params, planet) {
        const {
            latitude, longitude, altitude = 400,
            velocity, azimuth = 0, angleOfAttack = 0
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

        // 3. Transform from Planet-Fixed to Planet-Centered Inertial frame
        const { position: positionPCI, velocity: velocityPCI } =
            CoordinateTransforms._transformPlanetFixedToPlanetInertial(
                positionPF, velocityPF, planet
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
        const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
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
        // For orbital calculations, we need the planet's axial tilt without the Y-up to Z-up conversion
        // The orientationGroup contains the planet's true orientation (axial tilt)
        if (planet.orientationGroup?.quaternion) {
            return planet.orientationGroup.quaternion.clone();
        }

        // Fallback: for Earth, the equatorial plane is rotated ~23.5° from ecliptic
        // This is the obliquity of the ecliptic
        if (planet.name === 'Earth' || planet.naifId === 399) {
            const obliquity = THREE.MathUtils.degToRad(23.44); // Earth's obliquity
            const earthEquatorialTransform = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0), // Rotate around X-axis
                obliquity
            );
            return earthEquatorialTransform;
        }

        // For other planets, fallback to identity (no transformation)
        console.warn(`[CoordinateTransforms] No equatorial transformation available for ${planet.name || 'unknown'}, using identity`);
        return new THREE.Quaternion(); // Identity
    }

    /**
     * Convert geographic coordinates to Planet-Fixed cartesian coordinates
     * Uses PhysicsUtils for proper ellipsoid mathematics
     */
    static _latLonAltToPlanetFixed(latitude, longitude, altitude, planet) {
        // Planet physical parameters
        const equatorialRadius = planet.radius || planet.equatorialRadius || 6378.137; // km
        const polarRadius = planet.polarRadius || equatorialRadius; // km, fallback to spherical
        
        // Use PhysicsUtils for the actual conversion to avoid code duplication
        const positionVector = PhysicsUtils.latLonAltToEllipsoid(
            latitude, longitude, altitude, equatorialRadius, polarRadius
        );
        
        return [positionVector.x, positionVector.y, positionVector.z];
    }

    /**
     * Calculate velocity in Planet-Fixed frame using proper ENU transformation
     */
    static _calculatePlanetFixedVelocity(latitude, longitude, speed, azimuth, angleOfAttack) {
        const lat = THREE.MathUtils.degToRad(latitude);
        const lon = THREE.MathUtils.degToRad(longitude);
        const az = THREE.MathUtils.degToRad(azimuth);
        const aoa = THREE.MathUtils.degToRad(angleOfAttack);

        // Calculate local ENU (East-North-Up) basis vectors in Planet-Fixed coordinates
        const up = new THREE.Vector3(
            Math.cos(lat) * Math.cos(lon),
            Math.cos(lat) * Math.sin(lon),
            Math.sin(lat)
        ).normalize();

        const north = new THREE.Vector3(
            -Math.sin(lat) * Math.cos(lon),
            -Math.sin(lat) * Math.sin(lon),
            Math.cos(lat)
        ).normalize();

        const east = new THREE.Vector3().crossVectors(north, up).normalize();

        // Decompose velocity: horizontal (in local horizon) and vertical components
        const horizontalSpeed = speed * Math.cos(aoa);
        const verticalSpeed = speed * Math.sin(aoa);

        // Azimuth: 0° = North, 90° = East, 180° = South, 270° = West
        const northVel = horizontalSpeed * Math.cos(az);
        const eastVel = horizontalSpeed * Math.sin(az);

        // Combine velocity components in Planet-Fixed frame
        const velocity = new THREE.Vector3()
            .addScaledVector(north, northVel)
            .addScaledVector(east, eastVel)
            .addScaledVector(up, verticalSpeed);

        return [velocity.x, velocity.y, velocity.z];
    }

    /**
     * Transform from Planet-Fixed (rotating) to Planet-Centered Inertial frame
     * This is the core transformation that accounts for planet rotation
     */
    static _transformPlanetFixedToPlanetInertial(positionPF, velocityPF, planet, time = new Date()) {
        // Get planet's current orientation from physics engine quaternion
        // For velocity transformation, we need to exclude the equatorial rotation that converts Y-up to Z-up
        const planetQuaternion = CoordinateTransforms._getPlanetQuaternionForVelocity(planet, time);

        // Get planet's rotation rate (rad/s)
        const rotationRate = planet.rotationRate || CoordinateTransforms._calculateRotationRate(planet);

        // Calculate rotation velocity at this location for reference
        // const lat = Math.atan2(positionPF[2], Math.sqrt(positionPF[0]**2 + positionPF[1]**2));

        // 1. Transform position: Planet-Fixed to Planet-Centered Inertial
        // PCI = Q * PF (where Q is the rotation from PF to PCI)
        const positionPCI_vec = new THREE.Vector3(...positionPF).applyQuaternion(planetQuaternion);
        const positionPCI = [positionPCI_vec.x, positionPCI_vec.y, positionPCI_vec.z];

        // 2. Transform velocity: Account for planet rotation
        // v_PCI = Q * v_PF + ω × (Q * r_PF)
        // where ω is the angular velocity vector of the planet

        // Planet's angular velocity vector (along rotation axis)
        const omegaVector = CoordinateTransforms._getPlanetAngularVelocity(planet, rotationRate, planetQuaternion);

        // Transform velocity to inertial frame
        const velocityPF_vec = new THREE.Vector3(...velocityPF);
        const velocityPCI_rotated = velocityPF_vec.clone().applyQuaternion(planetQuaternion);

        // Add rotation velocity: ω × r
        const rotationVelocity = new THREE.Vector3().crossVectors(omegaVector, positionPCI_vec);
        const velocityPCI_vec = velocityPCI_rotated.add(rotationVelocity);

        const velocityPCI = [velocityPCI_vec.x, velocityPCI_vec.y, velocityPCI_vec.z];


        return { position: positionPCI, velocity: velocityPCI };
    }



    /**
     * Get planet's quaternion for velocity transformation (excludes Y-up to Z-up conversion)
     */
    static _getPlanetQuaternionForVelocity(planet, time = new Date()) {
        // For velocity calculations, we want orientation and rotation but NOT the equatorial Y->Z conversion
        if (planet.orientationGroup && planet.rotationGroup) {
            // Only compose orientation and rotation, skip equatorial
            const orientationQ = planet.orientationGroup.quaternion.clone();
            const rotationQ = planet.rotationGroup.quaternion.clone();

            const composedQ = new THREE.Quaternion()
                .multiplyQuaternions(orientationQ, rotationQ);

            return composedQ;
        }

        // Fall back to full quaternion if groups not available
        return CoordinateTransforms._getPlanetQuaternion(planet, time);
    }

    /**
     * Get planet's current quaternion calculated from rotation data
     */
    static _getPlanetQuaternion(planet, time = new Date()) {
        // For pure physics calculations, compute quaternion from rotation data
        if (planet.rotationPeriod && planet.tilt !== undefined) {
            // Calculate current rotation angle
            const rotationPeriod = planet.rotationPeriod; // seconds
            const currentTime = time.getTime() / 1000; // seconds since epoch
            const rotationAngle = (2 * Math.PI * currentTime / rotationPeriod) % (2 * Math.PI);
            
            // Create quaternion from axial tilt and rotation
            const tiltRad = THREE.MathUtils.degToRad(planet.tilt || 0);
            const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tiltRad);
            const rotationQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotationAngle);
            
            // Combine tilt and rotation
            return new THREE.Quaternion().multiplyQuaternions(tiltQ, rotationQ);
        }

        // Fallback: Try to get from Three.js scene objects (for UI integration)
        if (planet.orientationGroup && planet.equatorialGroup && planet.rotationGroup) {
            // Compose the complete transformation
            const orientationQ = planet.orientationGroup.quaternion.clone();
            const equatorialQ = planet.equatorialGroup.quaternion.clone();
            const rotationQ = planet.rotationGroup.quaternion.clone();

            return new THREE.Quaternion()
                .multiplyQuaternions(orientationQ, equatorialQ)
                .multiply(rotationQ);
        }

        // Fallback: Try to get quaternion from physics engine
        if (planet.quaternion && Array.isArray(planet.quaternion) && planet.quaternion.length === 4) {
            const [x, y, z, w] = planet.quaternion;
            return new THREE.Quaternion(x, y, z, w);
        }

        // Ultimate fallback: identity quaternion (no rotation)
        console.warn(`[CoordinateTransforms] No rotation data available for planet ${planet.name || 'unknown'}, using identity`);
        return new THREE.Quaternion(); // Identity quaternion
    }


    /**
     * Calculate planet's rotation rate if not provided
     */
    static _calculateRotationRate(planet) {
        // Calculate rotation rate directly from rotationPeriod to avoid circular dependency
        if (planet.rotationPeriod && planet.rotationPeriod > 0) {
            return 2 * Math.PI / planet.rotationPeriod; // rad/s
        }
        return 0; // No rotation if period not specified
    }

    /**
     * Get planet's angular velocity vector in inertial frame
     */
    static _getPlanetAngularVelocity(planet, rotationRate, planetQuaternion) {
        // Angular velocity is along the planet's rotation axis (north pole)
        // In planet-fixed frame, this is typically the Z-axis
        const omegaPF = new THREE.Vector3(0, 0, rotationRate);

        // Transform to inertial frame using planet's quaternion
        const omegaPCI = omegaPF.clone().applyQuaternion(planetQuaternion);

        return omegaPCI;
    }

    /**
     * Calculate circular orbital velocity for given altitude and planet
     */
    static _calculateCircularOrbitalVelocity(altitude, planet) {
        const r = planet.radius + altitude; // Total distance from center in km
        const orbitalVel = OrbitalMechanics.calculateCircularVelocity(planet, r); // km/s

        return orbitalVel;
    }

    /**
     * Calculate the surface-relative launch velocity needed to achieve a circular orbit
     * accounting for planet rotation and launch direction
     */
    static _calculateCircularLaunchVelocity(latitude, longitude, altitude, azimuth, angleOfAttack, planet) {
        // Get the required inertial velocity for circular orbit
        const vCircularInertial = CoordinateTransforms._calculateCircularOrbitalVelocity(altitude, planet);

        // Get planet rotation rate at this altitude
        const rotationRate = planet.rotationRate || CoordinateTransforms._calculateRotationRate(planet);
        const lat = THREE.MathUtils.degToRad(latitude);
        const az = THREE.MathUtils.degToRad(azimuth);
        const aoa = THREE.MathUtils.degToRad(angleOfAttack);

        // For circular orbit at given altitude, we need velocity tangent to the surface
        // The angle of attack should be 0 for circular orbit
        if (Math.abs(angleOfAttack) > 1) {
            console.warn(`[CoordinateTransforms] Non-zero angle of attack (${angleOfAttack}°) for circular orbit - orbit won't be perfectly circular`);
        }

        // Calculate the planet's rotation velocity vector at this location
        // In planet-fixed coordinates, the rotation velocity is ω × r
        // where ω = [0, 0, rotationRate] (assuming Z-up rotation axis)
        // and r is the position vector
        const positionPF = CoordinateTransforms._latLonAltToPlanetFixed(latitude, longitude, altitude, planet);
        const omega = new THREE.Vector3(0, 0, rotationRate);
        const posVec = new THREE.Vector3(...positionPF);
        const rotationVelocityVec = new THREE.Vector3().crossVectors(omega, posVec);


        // Get the local ENU basis vectors
        const up = new THREE.Vector3(
            Math.cos(lat) * Math.cos(THREE.MathUtils.degToRad(longitude)),
            Math.cos(lat) * Math.sin(THREE.MathUtils.degToRad(longitude)),
            Math.sin(lat)
        ).normalize();

        const north = new THREE.Vector3(
            -Math.sin(lat) * Math.cos(THREE.MathUtils.degToRad(longitude)),
            -Math.sin(lat) * Math.sin(THREE.MathUtils.degToRad(longitude)),
            Math.cos(lat)
        ).normalize();

        const east = new THREE.Vector3().crossVectors(north, up).normalize();

        // The rotation velocity in ENU coordinates
        // At the equator pointing east, at poles it's zero
        // const rotVelEast = rotationVelocityVec.dot(east);
        // const rotVelNorth = rotationVelocityVec.dot(north);

        // For a circular orbit, we need the velocity vector to have magnitude vCircularInertial
        // in the inertial frame after accounting for rotation
        // 
        // v_inertial = v_surface + v_rotation
        // |v_inertial| = vCircularInertial
        //
        // The launch direction affects how much rotation helps:
        // - Due East (90°): maximum benefit from rotation
        // - Due West (270°): maximum penalty from rotation  
        // - Due North/South (0°/180°): rotation perpendicular to motion

        // Decompose the desired inertial velocity direction based on azimuth
        const inertialDir = new THREE.Vector3()
            .addScaledVector(north, Math.cos(az) * Math.cos(aoa))
            .addScaledVector(east, Math.sin(az) * Math.cos(aoa))
            .addScaledVector(up, Math.sin(aoa));

        // Project rotation velocity onto launch direction
        const rotationProjection = rotationVelocityVec.dot(inertialDir);

        // The surface-relative speed needed
        // For the simplified case with AoA ≈ 0, this reduces to:
        // v_surface = v_inertial - rotation_contribution
        const vSurfaceRelative = vCircularInertial - rotationProjection;


        // Ensure we return a positive velocity
        return Math.max(vSurfaceRelative, 0.1);
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
        // If same frame, return as-is
        if (fromFrame === toFrame) {
            return { position: [...position], velocity: [...velocity] };
        }


        // Define transformation paths
        switch (`${fromFrame}→${toFrame}`) {
            // Planet-Fixed ↔ Planet-Centered Inertial
            case 'PF→PCI':
                return CoordinateTransforms._transformPlanetFixedToPlanetInertial(position, velocity, planet, time);

            case 'PCI→PF':
                return CoordinateTransforms._transformPlanetInertialToPlanetFixed(position, velocity, planet, time);

            // Geographic ↔ Planet-Fixed (Geographic is just lat/lon/alt representation of PF)
            case 'GEO→PF': {
                // Assumes position = [latitude°, longitude°, altitude km]
                const posPF = CoordinateTransforms._latLonAltToPlanetFixed(
                    position[0], position[1], position[2], planet
                );
                // For velocity, we need azimuth and angle of attack
                const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
                const velPF = CoordinateTransforms._calculatePlanetFixedVelocity(
                    position[0], position[1], speed, 0, 0 // Default azimuth=0, AoA=0
                );
                return { position: posPF, velocity: velPF };
            }

            case 'PF→GEO': {
                // Convert cartesian to geographic
                const geo = CoordinateTransforms.planetFixedToLatLonAlt(position, planet);
                // Velocity would need to be converted to speed/azimuth/AoA
                return { position: geo, velocity: [...velocity] };
            }

            // Planet-Centered Inertial ↔ Solar System Barycentric
            case 'PCI→SSB':
                return CoordinateTransforms._transformPlanetInertialToSSB(position, velocity, planet);

            case 'SSB→PCI':
                return CoordinateTransforms._transformSSBToPlanetInertial(position, velocity, planet);

            // Compound transformations
            case 'PF→SSB': {
                // PF → PCI → SSB
                const pci1 = CoordinateTransforms.transformCoordinates(position, velocity, 'PF', 'PCI', planet, time);
                return CoordinateTransforms.transformCoordinates(pci1.position, pci1.velocity, 'PCI', 'SSB', planet, time);
            }

            case 'SSB→PF': {
                // SSB → PCI → PF
                const pci2 = CoordinateTransforms.transformCoordinates(position, velocity, 'SSB', 'PCI', planet, time);
                return CoordinateTransforms.transformCoordinates(pci2.position, pci2.velocity, 'PCI', 'PF', planet, time);
            }

            default:
                return { position: [...position], velocity: [...velocity] };
        }
    }

    /**
     * Transform from Planet-Centered Inertial to Planet-Fixed frame (inverse of existing method)
     */
    static _transformPlanetInertialToPlanetFixed(positionPCI, velocityPCI, planet, time) {
        // Get planet's current orientation
        const planetQuaternion = CoordinateTransforms._getPlanetQuaternion(planet, time);
        const rotationRate = planet.rotationRate || CoordinateTransforms._calculateRotationRate(planet);

        // Inverse quaternion for reverse transformation
        const inverseQuaternion = planetQuaternion.clone().invert();

        // Transform position: PF = Q^-1 * PCI
        const positionPCI_vec = new THREE.Vector3(...positionPCI);
        const positionPF_vec = positionPCI_vec.clone().applyQuaternion(inverseQuaternion);

        // Transform velocity: v_PF = Q^-1 * (v_PCI - ω × r_PCI)
        const omegaVector = CoordinateTransforms._getPlanetAngularVelocity(planet, rotationRate, planetQuaternion);
        const rotationVelocity = new THREE.Vector3().crossVectors(omegaVector, positionPCI_vec);

        const velocityPCI_vec = new THREE.Vector3(...velocityPCI);
        const velocityPF_vec = velocityPCI_vec.sub(rotationVelocity).applyQuaternion(inverseQuaternion);

        return {
            position: [positionPF_vec.x, positionPF_vec.y, positionPF_vec.z],
            velocity: [velocityPF_vec.x, velocityPF_vec.y, velocityPF_vec.z]
        };
    }

    /**
     * Convert Planet-Fixed cartesian to geographic coordinates
     * Uses PhysicsUtils for proper ellipsoid mathematics
     * @param {Array} positionPF - [x, y, z] in planet-fixed frame (km)
     * @param {Object} planet - Planet object with radius and polarRadius
     * @returns {Array} [latitude, longitude, altitude] in degrees and km
     */
    static planetFixedToLatLonAlt(positionPF, planet) {
        const [X, Y, Z] = positionPF;

        // Planet parameters
        const equatorialRadius = planet.radius || planet.equatorialRadius || 6378.137;
        const polarRadius = planet.polarRadius || equatorialRadius;
        
        // Use PhysicsUtils for the conversion to avoid code duplication
        const geodetic = PhysicsUtils.ecefToGeodetic(X, Y, Z, equatorialRadius, polarRadius);
        
        return [geodetic.latitude, geodetic.longitude, geodetic.altitude];
    }

    /**
     * Transform from Planet-Centered Inertial to Solar System Barycentric
     */
    static _transformPlanetInertialToSSB(positionPCI, velocityPCI, planet) {
        // Need planet's position and velocity in SSB frame
        if (!planet.position || !planet.velocity) {
            console.warn('[CoordinateTransforms] Planet SSB state not available, returning PCI coordinates');
            return { position: [...positionPCI], velocity: [...velocityPCI] };
        }

        // Simple addition: r_SSB = r_planet + r_PCI
        const planetPos = Array.isArray(planet.position) ? planet.position :
            [planet.position.x, planet.position.y, planet.position.z];
        const planetVel = Array.isArray(planet.velocity) ? planet.velocity :
            [planet.velocity.x, planet.velocity.y, planet.velocity.z];

        return {
            position: [
                positionPCI[0] + planetPos[0],
                positionPCI[1] + planetPos[1],
                positionPCI[2] + planetPos[2]
            ],
            velocity: [
                velocityPCI[0] + planetVel[0],
                velocityPCI[1] + planetVel[1],
                velocityPCI[2] + planetVel[2]
            ]
        };
    }

    /**
     * Transform from Solar System Barycentric to Planet-Centered Inertial
     */
    static _transformSSBToPlanetInertial(positionSSB, velocitySSB, planet) {
        // Need planet's position and velocity in SSB frame
        if (!planet.position || !planet.velocity) {
            console.warn('[CoordinateTransforms] Planet SSB state not available, returning SSB coordinates');
            return { position: [...positionSSB], velocity: [...velocitySSB] };
        }

        // Simple subtraction: r_PCI = r_SSB - r_planet
        const planetPos = Array.isArray(planet.position) ? planet.position :
            [planet.position.x, planet.position.y, planet.position.z];
        const planetVel = Array.isArray(planet.velocity) ? planet.velocity :
            [planet.velocity.x, planet.velocity.y, planet.velocity.z];

        return {
            position: [
                positionSSB[0] - planetPos[0],
                positionSSB[1] - planetPos[1],
                positionSSB[2] - planetPos[2]
            ],
            velocity: [
                velocitySSB[0] - planetVel[0],
                velocitySSB[1] - planetVel[1],
                velocitySSB[2] - planetVel[2]
            ]
        };
    }

    /**
     * Utility: Convert position/velocity arrays to Three.js vectors
     */
    static toVector3(array) {
        return new THREE.Vector3(...(array || [0, 0, 0]));
    }

    /**
     * Utility: Convert Three.js vectors to position/velocity arrays  
     */
    static toArray(vector) {
        return [vector.x, vector.y, vector.z];
    }
}