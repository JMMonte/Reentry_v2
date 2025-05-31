import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { PhysicsUtils } from './PhysicsUtils.js';
import { Bodies } from '../PhysicsAPI.js';
import { OrbitalMechanics } from '../core/OrbitalMechanics.js';

/**
 * Advanced satellite coordinate system using local planet quaternions and proper reference frame transformations.
 * This system is generic and works with any celestial body that has a quaternion orientation in our physics engine.
 * 
 * Reference Frames:
 * - Planet-Fixed (PF): Rotating with the planet surface (like ECEF for Earth)
 * - Planet-Centered Inertial (PCI): Inertial frame centered at planet (like ECI for Earth) 
 * - Solar System Barycentric (SSB): Inertial frame centered at solar system barycenter
 * 
 * Key Design Principles:
 * 1. Use local planet quaternions from physics engine (more reliable than Astronomy Engine orientations)
 * 2. Proper time-dependent transformations accounting for planet rotation
 * 3. Generic implementation that works for any celestial body
 * 4. Accurate coordinate system transformations between reference frames
 */
export class SatelliteCoordinates {
    
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

        // Debug input params
        // console.log(`[SatelliteCoordinates.createFromLatLon] alt=${altitude} km, vel=${velocity === undefined ? 'circular' : velocity + ' km/s'}`);

        // Calculate appropriate orbital velocity if not provided
        let finalVelocity = velocity;
        if (velocity === undefined) {
            // Calculate circular orbital velocity accounting for planet rotation and launch direction
            
            // For circular orbit, we need the surface-relative velocity that results in circular orbital velocity
            // after accounting for planet rotation
            finalVelocity = SatelliteCoordinates._calculateCircularLaunchVelocity(
                latitude, longitude, altitude, azimuth, angleOfAttack, planet
            );
        }

        // console.log(`[SatelliteCoordinates] Creating from lat/lon: lat=${latitude}°, lon=${longitude}°, alt=${altitude}km, vel=${finalVelocity.toFixed(3)}km/s, az=${azimuth}°`);

        // 1. Calculate position in Planet-Fixed frame (rotating with surface)
        const positionPF = SatelliteCoordinates._latLonAltToPlanetFixed(
            latitude, longitude, altitude, planet
        );

        // 2. Calculate velocity in Planet-Fixed frame (ENU at launch site)
        const velocityPF = SatelliteCoordinates._calculatePlanetFixedVelocity(
            latitude, longitude, finalVelocity, azimuth, angleOfAttack
        );

        // 3. Transform from Planet-Fixed to Planet-Centered Inertial frame
        const { position: positionPCI, velocity: velocityPCI } = 
            SatelliteCoordinates._transformPlanetFixedToPlanetInertial(
                positionPF, velocityPF, planet
            );

        // console.log(`[SatelliteCoordinates] Final PCI coordinates: pos=[${positionPCI.map(p => p.toFixed(2)).join(', ')}] km, vel=[${velocityPCI.map(v => v.toFixed(3)).join(', ')}] km/s`);

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
            console.warn(`[SatelliteCoordinates] Hyperbolic/parabolic orbit (e=${eccentricity}) - orbit will not be closed`);
        }

        // Get gravitational parameter with fallback
        const GM = OrbitalMechanics.getGravitationalParameter(planet); // km³/s²
        
        // Creating from orbital elements with GM=${GM} km³/s²

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
            // Using ecliptic reference frame (scene coordinates)
        } else {
            // Equatorial mode: 0° inclination = planet's equatorial plane
            // Transform from ecliptic to planet's equatorial frame
            const { position: posEq, velocity: velEq } = SatelliteCoordinates._transformEclipticToEquatorial(
                positionECI, velocityECI, planet
            );
            position = posEq;
            velocity = velEq;
            // Using equatorial reference frame (planet's equator)
        }
        
        // Final coordinates calculated

        return { position, velocity };
    }

    /**
     * Transform orbital coordinates from ecliptic frame to planet's equatorial frame
     * This rotates the coordinate system so that 0° inclination aligns with planet's equator
     */
    static _transformEclipticToEquatorial(positionECI, velocityECI, planet) {
        // Get the transformation from ecliptic to planet's equatorial plane
        // This is the inverse of the planet's orientation (equatorialGroup transformation)
        const equatorialTransform = SatelliteCoordinates._getEclipticToEquatorialTransform(planet);
        
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
            // Using orientationGroup quaternion
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
            // Using Earth obliquity transformation
            return earthEquatorialTransform;
        }
        
        // For other planets, fallback to identity (no transformation)
        console.warn(`[SatelliteCoordinates] No equatorial transformation available for ${planet.name || 'unknown'}, using identity`);
        return new THREE.Quaternion(); // Identity
    }

    /**
     * Convert geographic coordinates to Planet-Fixed cartesian coordinates
     * Uses proper ellipsoid mathematics for accurate positioning
     */
    static _latLonAltToPlanetFixed(latitude, longitude, altitude, planet) {
        const lat = THREE.MathUtils.degToRad(latitude);
        const lon = THREE.MathUtils.degToRad(longitude);
        
        // Planet physical parameters
        const a = planet.radius || planet.equatorialRadius || 6378.137; // Equatorial radius (km)
        const b = planet.polarRadius || a; // Polar radius (km) - fallback to spherical
        
        // Calculate ellipticity and eccentricity
        const f = (a - b) / a; // Flattening
        const e2 = f * (2 - f); // First eccentricity squared
        
        // Prime vertical radius of curvature
        const sinLat = Math.sin(lat);
        const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);

        // Planet-Fixed coordinates (like ECEF for Earth)
        const X = (N + altitude) * Math.cos(lat) * Math.cos(lon);
        const Y = (N + altitude) * Math.cos(lat) * Math.sin(lon);
        const Z = ((1 - e2) * N + altitude) * Math.sin(lat);

        // console.log(`[SatelliteCoordinates] Planet-Fixed position: [${X.toFixed(2)}, ${Y.toFixed(2)}, ${Z.toFixed(2)}] km`);
        return [X, Y, Z];
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

        // Only log for debugging when needed
        // console.log(`[SatelliteCoordinates] PF velocity: speed=${speed.toFixed(3)} km/s, az=${azimuth}°, AoA=${angleOfAttack}°`);
        return [velocity.x, velocity.y, velocity.z];
    }

    /**
     * Transform from Planet-Fixed (rotating) to Planet-Centered Inertial frame
     * This is the core transformation that accounts for planet rotation
     */
    static _transformPlanetFixedToPlanetInertial(positionPF, velocityPF, planet) {
        // Get planet's current orientation from physics engine quaternion
        // For velocity transformation, we need to exclude the equatorial rotation that converts Y-up to Z-up
        const planetQuaternion = SatelliteCoordinates._getPlanetQuaternionForVelocity(planet);
        
        // Get planet's rotation rate (rad/s)
        const rotationRate = planet.rotationRate || SatelliteCoordinates._calculateRotationRate(planet);
        
        // Calculate rotation velocity at this location for reference
        // const lat = Math.atan2(positionPF[2], Math.sqrt(positionPF[0]**2 + positionPF[1]**2));
        // Calculate rotation velocity at location (for future use)
        // SatelliteCoordinates._calculateRotationVelocityAtLocation(
        //     THREE.MathUtils.radToDeg(lat), 
        //     new THREE.Vector3(...positionPF).length() - planet.radius,
        //     planet
        // );
        // console.log(`[SatelliteCoordinates] Rotation velocity at latitude ${THREE.MathUtils.radToDeg(lat).toFixed(1)}°: ${rotVelAtLocation.toFixed(3)} km/s`);
        
        // console.log(`[SatelliteCoordinates] Planet rotation rate: ${rotationRate.toExponential(3)} rad/s (period: ${(2 * Math.PI / rotationRate / 3600).toFixed(2)} hours)`);

        // 1. Transform position: Planet-Fixed to Planet-Centered Inertial
        // PCI = Q * PF (where Q is the rotation from PF to PCI)
        const positionPCI_vec = new THREE.Vector3(...positionPF).applyQuaternion(planetQuaternion);
        const positionPCI = [positionPCI_vec.x, positionPCI_vec.y, positionPCI_vec.z];

        // 2. Transform velocity: Account for planet rotation
        // v_PCI = Q * v_PF + ω × (Q * r_PF)
        // where ω is the angular velocity vector of the planet
        
        // Planet's angular velocity vector (along rotation axis)
        const omegaVector = SatelliteCoordinates._getPlanetAngularVelocity(planet, rotationRate, planetQuaternion);
        
        // Transform velocity to inertial frame
        const velocityPF_vec = new THREE.Vector3(...velocityPF);
        const velocityPCI_rotated = velocityPF_vec.clone().applyQuaternion(planetQuaternion);
        
        // Add rotation velocity: ω × r
        const rotationVelocity = new THREE.Vector3().crossVectors(omegaVector, positionPCI_vec);
        const velocityPCI_vec = velocityPCI_rotated.add(rotationVelocity);
        
        const velocityPCI = [velocityPCI_vec.x, velocityPCI_vec.y, velocityPCI_vec.z];

        // Only log key info
        // console.log(`[SatelliteCoordinates] PF→PCI: rotation vel=${rotationVelocity.length().toFixed(3)} km/s, final speed=${velocityPCI_vec.length().toFixed(3)} km/s`);

        return { position: positionPCI, velocity: velocityPCI };
    }

    /**
     * Transform orbital coordinates (relative to vernal equinox) to planet's inertial frame
     * This accounts for the planet's orientation but NOT its current rotation
     */
    static _transformOrbitalToInertial(positionECI, velocityECI, planet) {
        // Get planet's base orientation (without current rotation)
        const baseQuaternion = SatelliteCoordinates._getPlanetBaseOrientation(planet);
        
        // Transform position and velocity from standard orbital frame to planet's inertial frame
        const positionInertial_vec = positionECI.clone().applyQuaternion(baseQuaternion);
        const velocityInertial_vec = velocityECI.clone().applyQuaternion(baseQuaternion);
        
        const position = [positionInertial_vec.x, positionInertial_vec.y, positionInertial_vec.z];
        const velocity = [velocityInertial_vec.x, velocityInertial_vec.y, velocityInertial_vec.z];
        
        return { position, velocity };
    }

    /**
     * Get planet's base orientation (orientation + equatorial alignment, but no daily rotation)
     * This represents the vernal equinox direction for the planet
     */
    static _getPlanetBaseOrientation(planet) {
        // Get base orientation without daily rotation
        if (planet.orientationGroup && planet.equatorialGroup) {
            // Compose orientation and equatorial alignment, but skip rotation
            const orientationQ = planet.orientationGroup.quaternion.clone();
            const equatorialQ = planet.equatorialGroup.quaternion.clone();
            
            const baseQ = new THREE.Quaternion().multiplyQuaternions(orientationQ, equatorialQ);
            
            // Using base orientation (orientation * equatorial, no rotation)
            return baseQ;
        }

        // Fallback: try to get from physics engine (should not include rotation)
        if (planet.quaternion && Array.isArray(planet.quaternion) && planet.quaternion.length === 4) {
            const [x, y, z, w] = planet.quaternion;
            // Using physics engine base quaternion
            return new THREE.Quaternion(x, y, z, w);
        }
        
        // Ultimate fallback: identity (no transformation)
        console.warn(`[SatelliteCoordinates] No base orientation available for planet ${planet.name || 'unknown'}, using identity`);
        return new THREE.Quaternion();
    }

    /**
     * Get planet's quaternion for velocity transformation (excludes Y-up to Z-up conversion)
     */
    static _getPlanetQuaternionForVelocity(planet) {
        // For velocity calculations, we want orientation and rotation but NOT the equatorial Y->Z conversion
        if (planet.orientationGroup && planet.rotationGroup) {
            // Only compose orientation and rotation, skip equatorial
            const orientationQ = planet.orientationGroup.quaternion.clone();
            const rotationQ = planet.rotationGroup.quaternion.clone();
            
            const composedQ = new THREE.Quaternion()
                .multiplyQuaternions(orientationQ, rotationQ);
            
            // Using velocity quaternion (orientation * rotation, no equatorial)
            return composedQ;
        }
        
        // Fall back to full quaternion if groups not available
        return SatelliteCoordinates._getPlanetQuaternion(planet);
    }
    
    /**
     * Get planet's current quaternion from physics engine or calculate from Astronomy Engine
     */
    static _getPlanetQuaternion(planet) {
        // Get the complete transformation from planet surface to inertial space
        // This requires composing: orientationGroup * equatorialGroup * rotationGroup
        
        if (planet.orientationGroup && planet.equatorialGroup && planet.rotationGroup) {
            // Compose the complete transformation
            const orientationQ = planet.orientationGroup.quaternion.clone();
            const equatorialQ = planet.equatorialGroup.quaternion.clone();
            const rotationQ = planet.rotationGroup.quaternion.clone();
            
            // Apply transformations in order: rotation * equatorial * orientation
            const composedQ = new THREE.Quaternion()
                .multiplyQuaternions(orientationQ, equatorialQ)
                .multiply(rotationQ);
            
            // console.log(`[SatelliteCoordinates] Using composed quaternion for ${planet.name} (orientation * equatorial * rotation)`);
            return composedQ;
        }

        // Fallback: Try to get from planet's rotation group (current daily rotation position)
        if (planet.getRotationGroup?.()?.quaternion) {
            // Using current rotation group quaternion
            return planet.getRotationGroup().quaternion.clone();
        }

        // Fallback: Try to get from planet's rotation group directly
        if (planet.rotationGroup?.quaternion) {
            // Using current rotationGroup quaternion
            return planet.rotationGroup.quaternion.clone();
        }

        // Fallback: Try to get quaternion from physics engine (may not include current rotation)
        if (planet.quaternion && Array.isArray(planet.quaternion) && planet.quaternion.length === 4) {
            // Convert [x, y, z, w] to THREE.Quaternion
            const [x, y, z, w] = planet.quaternion;
            // Using physics engine quaternion
            return new THREE.Quaternion(x, y, z, w);
        }
        
        // Ultimate fallback: identity quaternion (no rotation)
        console.warn(`[SatelliteCoordinates] No quaternion available for planet ${planet.name || 'unknown'}, using identity`);
        // For the Sun and other bodies without proper quaternion setup, this is acceptable
        // as they don't have significant rotation effects for most satellite calculations
        return new THREE.Quaternion(); // Identity quaternion
    }

    /**
     * Calculate planet quaternion using Astronomy Engine for known bodies
     */
    static _calculatePlanetQuaternionFromAstronomy(naifId, time) {
        try {
            // Convert JavaScript Date to Astronomy Engine time
            const astroTime = Astronomy.MakeTime(time);
            
            // Get rotation axis and rotation matrix for the body
            let rotationData;
            switch (naifId) {
                case 399: // Earth
                    rotationData = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
                    break;
                case 301: // Moon  
                    rotationData = Astronomy.RotationAxis(Astronomy.Body.Moon, astroTime);
                    break;
                case 499: // Mars
                    rotationData = Astronomy.RotationAxis(Astronomy.Body.Mars, astroTime);
                    break;
                // Add more bodies as needed
                default:
                    return null; // Unsupported body
            }

            if (rotationData) {
                // Convert rotation axis data to quaternion
                // This is a simplified conversion - full implementation would require
                // proper transformation from Astronomy Engine's coordinate system
                const { north_pole_ra, north_pole_dec, spin } = rotationData;
                
                // Convert RA/Dec of north pole to quaternion
                // This is an approximation - proper implementation needs more work
                const ra = THREE.MathUtils.degToRad(north_pole_ra);
                const dec = THREE.MathUtils.degToRad(north_pole_dec);
                const rotation = THREE.MathUtils.degToRad(spin);
                
                // Create quaternion from Euler angles (simplified)
                const quaternion = new THREE.Quaternion();
                quaternion.setFromEuler(new THREE.Euler(dec, ra, rotation, 'XYZ'));
                
                return quaternion;
            }
        } catch (error) {
            console.warn(`[SatelliteCoordinates] Astronomy Engine calculation failed:`, error);
        }
        
        return null;
    }

    /**
     * Calculate planet's rotation rate if not provided
     */
    static _calculateRotationRate(planet) {
        // Use PhysicsAPI to get rotation rate
        return Bodies.getRotationRate(planet);
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
        
        // Debug calculation
        // console.log(`[_calculateCircularOrbitalVelocity] r=${r} km, v=${orbitalVel.toFixed(3)} km/s`);
        return orbitalVel;
    }
    
    /**
     * Calculate the surface-relative launch velocity needed to achieve a circular orbit
     * accounting for planet rotation and launch direction
     */
    static _calculateCircularLaunchVelocity(latitude, longitude, altitude, azimuth, angleOfAttack, planet) {
        // Get the required inertial velocity for circular orbit
        const vCircularInertial = SatelliteCoordinates._calculateCircularOrbitalVelocity(altitude, planet);
        
        // Get planet rotation rate at this altitude
        const rotationRate = planet.rotationRate || SatelliteCoordinates._calculateRotationRate(planet);
        const lat = THREE.MathUtils.degToRad(latitude);
        const az = THREE.MathUtils.degToRad(azimuth);
        const aoa = THREE.MathUtils.degToRad(angleOfAttack);
        
        // For circular orbit at given altitude, we need velocity tangent to the surface
        // The angle of attack should be 0 for circular orbit
        if (Math.abs(angleOfAttack) > 1) {
            console.warn(`[SatelliteCoordinates] Non-zero angle of attack (${angleOfAttack}°) for circular orbit - orbit won't be perfectly circular`);
        }
        
        // Calculate the planet's rotation velocity vector at this location
        // In planet-fixed coordinates, the rotation velocity is ω × r
        // where ω = [0, 0, rotationRate] (assuming Z-up rotation axis)
        // and r is the position vector
        const positionPF = SatelliteCoordinates._latLonAltToPlanetFixed(latitude, longitude, altitude, planet);
        const omega = new THREE.Vector3(0, 0, rotationRate);
        const posVec = new THREE.Vector3(...positionPF);
        const rotationVelocityVec = new THREE.Vector3().crossVectors(omega, posVec);
        
        // Calculate the magnitude of rotation velocity at this latitude
        const rotationVelMagnitude = rotationVelocityVec.length();
        
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
        
        console.log(`[SatelliteCoordinates._calculateCircularLaunchVelocity] Circular orbit calculation:`);
        console.log(`  Inertial velocity: ${vCircularInertial.toFixed(3)} km/s, Rotation: ${rotationVelMagnitude.toFixed(3)} km/s`);
        console.log(`  Azimuth: ${azimuth}°, Rotation contribution: ${rotationProjection.toFixed(3)} km/s`);
        console.log(`  Surface velocity needed: ${vSurfaceRelative.toFixed(3)} km/s`);
        
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

        // console.log(`[SatelliteCoordinates] Transforming ${fromFrame}→${toFrame}`);

        // Define transformation paths
        switch (`${fromFrame}→${toFrame}`) {
            // Planet-Fixed ↔ Planet-Centered Inertial
            case 'PF→PCI':
                return SatelliteCoordinates._transformPlanetFixedToPlanetInertial(position, velocity, planet, time);
            
            case 'PCI→PF':
                return SatelliteCoordinates._transformPlanetInertialToPlanetFixed(position, velocity, planet, time);

            // Geographic ↔ Planet-Fixed (Geographic is just lat/lon/alt representation of PF)
            case 'GEO→PF': {
                // Assumes position = [latitude°, longitude°, altitude km]
                const posPF = SatelliteCoordinates._latLonAltToPlanetFixed(
                    position[0], position[1], position[2], planet
                );
                // For velocity, we need azimuth and angle of attack
                const speed = Math.sqrt(velocity[0]**2 + velocity[1]**2 + velocity[2]**2);
                const velPF = SatelliteCoordinates._calculatePlanetFixedVelocity(
                    position[0], position[1], speed, 0, 0 // Default azimuth=0, AoA=0
                );
                return { position: posPF, velocity: velPF };
            }

            case 'PF→GEO': {
                // Convert cartesian to geographic
                const geo = SatelliteCoordinates.planetFixedToLatLonAlt(position, planet);
                // Velocity would need to be converted to speed/azimuth/AoA
                console.warn('[SatelliteCoordinates] PF→GEO velocity transformation not fully implemented');
                return { position: geo, velocity: [...velocity] };
            }

            // Planet-Centered Inertial ↔ Solar System Barycentric
            case 'PCI→SSB':
                return SatelliteCoordinates._transformPlanetInertialToSSB(position, velocity, planet);

            case 'SSB→PCI':
                return SatelliteCoordinates._transformSSBToPlanetInertial(position, velocity, planet);

            // Compound transformations
            case 'PF→SSB': {
                // PF → PCI → SSB
                const pci1 = SatelliteCoordinates.transformCoordinates(position, velocity, 'PF', 'PCI', planet, time);
                return SatelliteCoordinates.transformCoordinates(pci1.position, pci1.velocity, 'PCI', 'SSB', planet, time);
            }

            case 'SSB→PF': {
                // SSB → PCI → PF
                const pci2 = SatelliteCoordinates.transformCoordinates(position, velocity, 'SSB', 'PCI', planet, time);
                return SatelliteCoordinates.transformCoordinates(pci2.position, pci2.velocity, 'PCI', 'PF', planet, time);
            }

            default:
                console.warn(`[SatelliteCoordinates] Transformation ${fromFrame}→${toFrame} not supported`);
                return { position: [...position], velocity: [...velocity] };
        }
    }

    /**
     * Transform from Planet-Centered Inertial to Planet-Fixed frame (inverse of existing method)
     */
    static _transformPlanetInertialToPlanetFixed(positionPCI, velocityPCI, planet, time) {
        // Get planet's current orientation
        const planetQuaternion = SatelliteCoordinates._getPlanetQuaternion(planet, time);
        const rotationRate = planet.rotationRate || SatelliteCoordinates._calculateRotationRate(planet);
        
        // Inverse quaternion for reverse transformation
        const inverseQuaternion = planetQuaternion.clone().invert();
        
        // Transform position: PF = Q^-1 * PCI
        const positionPCI_vec = new THREE.Vector3(...positionPCI);
        const positionPF_vec = positionPCI_vec.clone().applyQuaternion(inverseQuaternion);
        
        // Transform velocity: v_PF = Q^-1 * (v_PCI - ω × r_PCI)
        const omegaVector = SatelliteCoordinates._getPlanetAngularVelocity(planet, rotationRate, planetQuaternion);
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
     * @param {Array} positionPF - [x, y, z] in planet-fixed frame (km)
     * @param {Object} planet - Planet object with radius and polarRadius
     * @returns {Array} [latitude, longitude, altitude] in degrees and km
     */
    static planetFixedToLatLonAlt(positionPF, planet) {
        const [X, Y, Z] = positionPF;
        
        // Planet parameters
        const a = planet.radius || planet.equatorialRadius || 6378.137;
        const b = planet.polarRadius || a;
        const e2 = 1 - (b * b) / (a * a);
        
        // Longitude is straightforward
        const longitude = Math.atan2(Y, X) * 180 / Math.PI;
        
        // Latitude requires iteration
        const p = Math.sqrt(X * X + Y * Y);
        let lat = Math.atan2(Z, p);
        let N, altitude;
        
        // Iterate to converge on latitude
        for (let i = 0; i < 5; i++) {
            const sinLat = Math.sin(lat);
            N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
            altitude = p / Math.cos(lat) - N;
            lat = Math.atan2(Z, p * (1 - e2 * N / (N + altitude)));
        }
        
        const latitude = lat * 180 / Math.PI;
        
        return [latitude, longitude, altitude];
    }

    /**
     * Transform from Planet-Centered Inertial to Solar System Barycentric
     */
    static _transformPlanetInertialToSSB(positionPCI, velocityPCI, planet) {
        // Need planet's position and velocity in SSB frame
        if (!planet.position || !planet.velocity) {
            console.warn('[SatelliteCoordinates] Planet SSB state not available, returning PCI coordinates');
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
            console.warn('[SatelliteCoordinates] Planet SSB state not available, returning SSB coordinates');
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