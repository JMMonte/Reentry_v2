import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { PhysicsUtils } from './PhysicsUtils.js';
import { Constants } from './Constants.js';

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
    static createFromLatLon(params, planet, time = new Date()) {
        const {
            latitude, longitude, altitude = 400,
            velocity, azimuth = 0, angleOfAttack = 0
        } = params;

        // Calculate appropriate orbital velocity if not provided
        const finalVelocity = velocity !== undefined ? velocity : 
            SatelliteCoordinates._calculateCircularOrbitalVelocity(altitude, planet);

        console.log(`[SatelliteCoordinates] Creating from lat/lon: lat=${latitude}°, lon=${longitude}°, alt=${altitude}km, vel=${finalVelocity.toFixed(3)}km/s, az=${azimuth}°`);

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
                positionPF, velocityPF, planet, time
            );

        console.log(`[SatelliteCoordinates] Final PCI coordinates: pos=[${positionPCI.map(p => p.toFixed(2)).join(', ')}] km, vel=[${velocityPCI.map(v => v.toFixed(3)).join(', ')}] km/s`);

        return {
            position: positionPCI,
            velocity: velocityPCI
        };
    }

    /**
     * Create satellite from orbital elements using planet's gravitational parameter
     * @param {Object} params - Orbital element parameters
     * @param {Object} planet - Planet object with GM and physical properties
     * @param {Date} time - Current simulation time  
     * @returns {Object} - { position: [x,y,z], velocity: [vx,vy,vz] } in planet-centric inertial coordinates
     */
    static createFromOrbitalElements(params, planet) {
        const {
            semiMajorAxis, eccentricity, inclination,
            argumentOfPeriapsis, raan, trueAnomaly
        } = params;

        // Get gravitational parameter with fallback
        const GM = planet.GM || (planet.mass * Constants.G); // km³/s²
        
        console.log(`[SatelliteCoordinates] Creating from orbital elements: a=${semiMajorAxis}km, e=${eccentricity}, i=${inclination}°, ω=${argumentOfPeriapsis}°, Ω=${raan}°, f=${trueAnomaly}°`);
        console.log(`[SatelliteCoordinates] Using GM=${GM} km³/s² for ${planet.name || 'planet'}`);

        if (!GM || isNaN(GM) || GM <= 0) {
            throw new Error(`Invalid gravitational parameter GM=${GM} for planet: ${planet.name || 'unknown'}`);
        }

        // 1. Calculate orbital state vectors in standard orbital plane (PCI frame)
        const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
            semiMajorAxis, eccentricity, inclination,
            argumentOfPeriapsis, raan, trueAnomaly, GM
        );

        // 2. The result is already in Planet-Centered Inertial frame
        const position = [positionECI.x, positionECI.y, positionECI.z];
        const velocity = [velocityECI.x, velocityECI.y, velocityECI.z];
        
        console.log(`[SatelliteCoordinates] Final PCI coordinates: pos=[${position.map(p => p.toFixed(2)).join(', ')}] km, vel=[${velocity.map(v => v.toFixed(3)).join(', ')}] km/s`);

        return { position, velocity };
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

        console.log(`[SatelliteCoordinates] Planet-Fixed position: [${X.toFixed(2)}, ${Y.toFixed(2)}, ${Z.toFixed(2)}] km`);
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

        console.log(`[SatelliteCoordinates] Planet-Fixed velocity: [${velocity.x.toFixed(3)}, ${velocity.y.toFixed(3)}, ${velocity.z.toFixed(3)}] km/s (ENU: E=${eastVel.toFixed(3)}, N=${northVel.toFixed(3)}, U=${verticalSpeed.toFixed(3)})`);
        return [velocity.x, velocity.y, velocity.z];
    }

    /**
     * Transform from Planet-Fixed (rotating) to Planet-Centered Inertial frame
     * This is the core transformation that accounts for planet rotation
     */
    static _transformPlanetFixedToPlanetInertial(positionPF, velocityPF, planet, time) {
        // Get planet's current orientation from physics engine quaternion
        const planetQuaternion = SatelliteCoordinates._getPlanetQuaternion(planet, time);
        
        // Get planet's rotation rate (rad/s)
        const rotationRate = planet.rotationRate || SatelliteCoordinates._calculateRotationRate(planet);
        
        console.log(`[SatelliteCoordinates] Planet rotation rate: ${rotationRate.toExponential(3)} rad/s (period: ${(2 * Math.PI / rotationRate / 3600).toFixed(2)} hours)`);

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

        console.log(`[SatelliteCoordinates] Transformation PF→PCI: rotation component added [${rotationVelocity.x.toFixed(3)}, ${rotationVelocity.y.toFixed(3)}, ${rotationVelocity.z.toFixed(3)}] km/s`);

        return { position: positionPCI, velocity: velocityPCI };
    }

    /**
     * Get planet's current quaternion from physics engine or calculate from Astronomy Engine
     */
    static _getPlanetQuaternion(planet) {
        // 1. Try to get quaternion from physics engine (preferred)
        if (planet.quaternion && Array.isArray(planet.quaternion) && planet.quaternion.length === 4) {
            // Convert [x, y, z, w] to THREE.Quaternion
            const [x, y, z, w] = planet.quaternion;
            console.log(`[SatelliteCoordinates] Using physics engine quaternion for ${planet.name}: [${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}, ${w.toFixed(3)}]`);
            return new THREE.Quaternion(x, y, z, w);
        }

        // 2. Try to get from Three.js object if available
        if (planet.mesh?.quaternion) {
            console.log(`[SatelliteCoordinates] Using Three.js mesh quaternion for ${planet.name}`);
            return planet.mesh.quaternion.clone();
        }

        // 3. Try to get from planet's rotation group
        if (planet.getRotationGroup?.()?.quaternion) {
            console.log(`[SatelliteCoordinates] Using rotation group quaternion for ${planet.name}`);
            return planet.getRotationGroup().quaternion.clone();
        }

        // 4. For now, skip Astronomy Engine (it's causing NaN issues)
        // TODO: Implement proper Astronomy Engine quaternion conversion
        
        // 5. Ultimate fallback: identity quaternion (no rotation)
        console.warn(`[SatelliteCoordinates] No quaternion available for planet ${planet.name || 'unknown'}, using identity`);
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
        // Try to get from planet properties
        if (planet.rotationRate) {
            return planet.rotationRate; // rad/s
        }
        
        // Try to calculate from rotation period
        if (planet.rotationPeriod) {
            return 2 * Math.PI / planet.rotationPeriod; // Convert period (s) to angular velocity (rad/s)
        }
        
        // Fallback values for known bodies (sidereal rotation rates in rad/s)
        const knownRotationRates = {
            399: 7.2921159e-5, // Earth
            301: 2.6617e-6,    // Moon (tidally locked, but still has slight rotation)
            499: 7.0882e-5,    // Mars
            599: 1.7585e-4,    // Jupiter
            699: 1.6378e-4,    // Saturn
            799: 1.0124e-4,    // Uranus
            899: 1.0833e-4,    // Neptune
        };
        
        const naifId = planet.naif_id || planet.naifId;
        if (naifId && knownRotationRates[naifId]) {
            console.log(`[SatelliteCoordinates] Using known rotation rate for NAIF ${naifId}`);
            return knownRotationRates[naifId];
        }
        
        // Ultimate fallback: Earth's rotation rate
        console.warn(`[SatelliteCoordinates] No rotation rate found for planet ${planet.name || 'unknown'}, using Earth's rate`);
        return 7.2921159e-5;
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
        const GM = planet.GM || (planet.mass * Constants.G); // km³/s² (gravitational parameter)
        
        if (!GM || GM <= 0) {
            throw new Error(`Invalid gravitational parameter for planet ${planet.name || 'unknown'}: GM=${GM}`);
        }
        
        const orbitalVel = Math.sqrt(GM / r); // km/s
        console.log(`[SatelliteCoordinates] Circular orbital velocity: ${orbitalVel.toFixed(3)} km/s at ${altitude} km altitude around ${planet.name || 'planet'}`);
        return orbitalVel;
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

        console.log(`[SatelliteCoordinates] Transforming ${fromFrame}→${toFrame}`);

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