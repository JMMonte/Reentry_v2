import * as THREE from 'three';
import { PhysicsConstants } from './PhysicsConstants.js';
import { GravityCalculator } from './GravityCalculator.js';
import { stateToKeplerian, solveKeplerEquation } from '../../utils/KeplerianUtils.js';

/**
 * Centralized orbital mechanics calculations for any celestial body
 * Provides body-agnostic orbital computations for the entire solar system
 */
export class OrbitalMechanics {
    
    /**
     * Calculate circular orbital velocity at given distance from any body
     * @param {Object|number} centralBodyOrGM - Central body object or GM value directly
     * @param {number} distance - Distance from center (km)
     * @returns {number} Circular orbital velocity (km/s)
     */
    static calculateCircularVelocity(centralBodyOrGM, distance) {
        return GravityCalculator.computeOrbitalVelocity(centralBodyOrGM, distance);
    }
    
    /**
     * Calculate escape velocity from any body at given distance
     * @param {Object|number} centralBodyOrGM - Central body object or GM value directly
     * @param {number} distance - Distance from center (km)
     * @returns {number} Escape velocity (km/s)
     */
    static calculateEscapeVelocity(centralBodyOrGM, distance) {
        return GravityCalculator.computeEscapeVelocity(centralBodyOrGM, distance);
    }
    
    /**
     * Calculate orbital period from position and velocity vectors
     * @param {THREE.Vector3|Array} position - Position vector (km)
     * @param {THREE.Vector3|Array} velocity - Velocity vector (km/s)
     * @param {Object|number} centralBodyOrGM - Central body or GM value
     * @returns {number} Orbital period in seconds (0 for non-elliptical orbits)
     */
    static calculateOrbitalPeriod(position, velocity, centralBodyOrGM) {
        const mu = typeof centralBodyOrGM === 'number' 
            ? centralBodyOrGM 
            : PhysicsConstants.getGravitationalParameter(centralBodyOrGM);
            
        const elements = stateToKeplerian(position, velocity, mu);
        
        if (!elements || elements.eccentricity >= 1.0) {
            return 0; // Non-elliptical orbit
        }
        
        return elements.period || 0;
    }
    
    /**
     * Calculate surface rotation velocity at given latitude for any rotating body
     * @param {Object} body - Celestial body with radius and rotation properties
     * @param {number} latitude - Latitude in degrees
     * @param {number} altitude - Altitude above surface (km, default 0)
     * @returns {number} Surface rotation velocity (km/s)
     */
    static calculateSurfaceRotationVelocity(body, latitude, altitude = 0) {
        if (!body.rotationPeriod || body.rotationPeriod === 0) {
            return 0; // No rotation (e.g., tidally locked or very slow rotation)
        }
        
        const rotationRate = (2 * Math.PI) / Math.abs(body.rotationPeriod); // rad/s
        const latRad = THREE.MathUtils.degToRad(latitude);
        const r = (body.radius || 0) + altitude;
        const distanceFromAxis = r * Math.cos(latRad);
        
        return rotationRate * distanceFromAxis; // km/s
    }
    
    /**
     * Calculate launch velocity needed for circular orbit accounting for body rotation
     * @param {Object} body - Central body with rotation properties
     * @param {number} latitude - Launch latitude (degrees)
     * @param {number} altitude - Target orbital altitude (km)
     * @param {number} azimuth - Launch azimuth (degrees, 0=North, 90=East)
     * @returns {number} Required surface-relative velocity (km/s)
     */
    static calculateLaunchVelocity(body, latitude, altitude, azimuth = 90) {
        // Required inertial velocity for circular orbit
        const orbitalRadius = (body.radius || 0) + altitude;
        const mu = PhysicsConstants.getGravitationalParameter(body);
        const vInertial = this.calculateCircularVelocity(mu, orbitalRadius);
        
        // Body rotation contribution
        const vRotation = this.calculateSurfaceRotationVelocity(body, latitude, altitude);
        
        // Calculate rotation contribution based on launch direction
        const azRad = THREE.MathUtils.degToRad(azimuth);
        const latRad = THREE.MathUtils.degToRad(latitude);
        const rotationContribution = vRotation * Math.sin(azRad) * Math.cos(latRad);
        
        // Surface-relative velocity needed
        return Math.max(0, vInertial - rotationContribution);
    }
    
    /**
     * Convert orbital elements to Cartesian state vector
     * @param {Object} elements - Orbital elements {a, e, i, Omega, omega, M0, epoch}
     * @param {number} julianDate - Current Julian date
     * @param {number} GM - Gravitational parameter (km³/s²)
     * @returns {Object} {position: Vector3, velocity: Vector3} in km and km/s
     */
    static orbitalElementsToStateVector(elements, julianDate, GM) {
        const DEG_TO_RAD = Math.PI / 180.0;
        const { a, e, i, Omega, omega, M0, epoch } = elements;

        // Convert to radians
        const i_rad = i * DEG_TO_RAD;
        const Omega_rad = Omega * DEG_TO_RAD;
        const omega_rad = omega * DEG_TO_RAD;
        const M0_rad = M0 * DEG_TO_RAD;

        // Time since epoch (days)
        const deltaT = julianDate - epoch;

        // Mean motion (rad/day)
        const n = Math.sqrt(GM / (a * a * a)) * 86400; // rad/s to rad/day

        // Current mean anomaly
        const M = M0_rad + n * deltaT;

        // Solve Kepler's equation for eccentric anomaly
        const E = solveKeplerEquation(M, e);

        // True anomaly
        const cosnu = (Math.cos(E) - e) / (1 - e * Math.cos(E));
        const sinnu = Math.sqrt(1 - e * e) * Math.sin(E) / (1 - e * Math.cos(E));
        const nu = Math.atan2(sinnu, cosnu);

        // Distance from central body
        const r = a * (1 - e * Math.cos(E));

        // Position in orbital plane
        const x_orb = r * Math.cos(nu);
        const y_orb = r * Math.sin(nu);
        const z_orb = 0;

        // Velocity in orbital plane
        const p = a * (1 - e * e);
        const h = Math.sqrt(GM * p); // angular momentum
        const vx_orb = -(h / r) * Math.sin(nu);
        const vy_orb = (h / r) * (e + Math.cos(nu));
        const vz_orb = 0;

        // Rotation matrices for 3D transformation
        const cosOmega = Math.cos(Omega_rad);
        const sinOmega = Math.sin(Omega_rad);
        const cosomega = Math.cos(omega_rad);
        const sinomega = Math.sin(omega_rad);
        const cosi = Math.cos(i_rad);
        const sini = Math.sin(i_rad);

        // Transform to 3D coordinates (ECLIPJ2000)
        const P11 = cosOmega * cosomega - sinOmega * sinomega * cosi;
        const P12 = -cosOmega * sinomega - sinOmega * cosomega * cosi;
        const P13 = sinOmega * sini;

        const P21 = sinOmega * cosomega + cosOmega * sinomega * cosi;
        const P22 = -sinOmega * sinomega + cosOmega * cosomega * cosi;
        const P23 = -cosOmega * sini;

        const P31 = sinomega * sini;
        const P32 = cosomega * sini;
        const P33 = cosi;

        // Apply rotation
        const x = P11 * x_orb + P12 * y_orb + P13 * z_orb;
        const y = P21 * x_orb + P22 * y_orb + P23 * z_orb;
        const z = P31 * x_orb + P32 * y_orb + P33 * z_orb;

        const vx = P11 * vx_orb + P12 * vy_orb + P13 * vz_orb;
        const vy = P21 * vx_orb + P22 * vy_orb + P23 * vz_orb;
        const vz = P31 * vx_orb + P32 * vy_orb + P33 * vz_orb;

        return {
            position: new THREE.Vector3(x, y, z),
            velocity: new THREE.Vector3(vx, vy, vz)
        };
    }
    
    /**
     * Calculate Hohmann transfer parameters between two circular orbits around any body
     * @param {Object} params - Transfer parameters
     * @returns {Object} Transfer details with delta-V and timing
     */
    static calculateHohmannTransfer(params) {
        const {
            centralBody,
            currentRadius,    // km from center
            targetRadius     // km from center
        } = params;
        
        const mu = PhysicsConstants.getGravitationalParameter(centralBody);
        
        // Calculate velocities
        const v1 = this.calculateCircularVelocity(mu, currentRadius);
        const v2 = this.calculateCircularVelocity(mu, targetRadius);
        
        // Transfer orbit semi-major axis
        const aTransfer = (currentRadius + targetRadius) / 2;
        
        // Transfer velocities using vis-viva equation
        const vTransfer1 = Math.sqrt(mu * (2 / currentRadius - 1 / aTransfer));
        const vTransfer2 = Math.sqrt(mu * (2 / targetRadius - 1 / aTransfer));
        
        // Delta-V calculations
        const deltaV1 = Math.abs(vTransfer1 - v1);
        const deltaV2 = Math.abs(v2 - vTransfer2);
        const totalDeltaV = deltaV1 + deltaV2;
        
        // Transfer time (half period of transfer ellipse)
        const transferTime = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / mu);
        
        return {
            deltaV1,
            deltaV2,
            totalDeltaV,
            transferTime,
            transferSemiMajorAxis: aTransfer,
            velocities: {
                initial: v1,
                transferDeparture: vTransfer1,
                transferArrival: vTransfer2,
                final: v2
            }
        };
    }
    
    /**
     * Calculate optimal inclination change delta-V at any point in orbit
     * @param {number} velocity - Current velocity magnitude (km/s)
     * @param {number} inclinationChange - Inclination change required (degrees)
     * @returns {number} Delta-V required for plane change (km/s)
     */
    static calculateInclinationChangeDeltaV(velocity, inclinationChange) {
        const changeRad = THREE.MathUtils.degToRad(Math.abs(inclinationChange));
        return 2 * velocity * Math.sin(changeRad / 2);
    }
    
    /**
     * Calculate sphere of influence radius for any body
     * @param {Object} body - Celestial body
     * @param {Object} parent - Parent body (what the body orbits)
     * @param {number} semiMajorAxis - Body's orbital radius around parent (km)
     * @returns {number} SOI radius (km)
     */
    static calculateSOIRadius(body, parent, semiMajorAxis) {
        return GravityCalculator.computeSOIRadius(
            { mass: body.mass }, 
            { mass: parent.mass }, 
            semiMajorAxis
        );
    }
    
    /**
     * Calculate orbital elements from state vectors for any body
     * @param {THREE.Vector3|Array} position - Position vector (km)
     * @param {THREE.Vector3|Array} velocity - Velocity vector (km/s) 
     * @param {Object|number} centralBodyOrGM - Central body or GM value
     * @param {number} bodyRadius - Central body radius for altitude calculations (km, optional)
     * @returns {Object} Complete orbital elements
     */
    static calculateOrbitalElements(position, velocity, centralBodyOrGM, bodyRadius = 0) {
        const mu = typeof centralBodyOrGM === 'number' 
            ? centralBodyOrGM 
            : PhysicsConstants.getGravitationalParameter(centralBodyOrGM);
            
        return stateToKeplerian(position, velocity, mu, 0, bodyRadius);
    }
    
    /**
     * Calculate time to next apsis (periapsis or apoapsis) for any orbit
     * @param {THREE.Vector3|Array} position - Current position (km)
     * @param {THREE.Vector3|Array} velocity - Current velocity (km/s)
     * @param {Object|number} centralBodyOrGM - Central body or GM value
     * @param {string} apsisType - 'periapsis' or 'apoapsis'
     * @param {Date} currentTime - Current time
     * @returns {Date} Time of next apsis
     */
    static calculateNextApsis(position, velocity, centralBodyOrGM, apsisType, currentTime) {
        const mu = typeof centralBodyOrGM === 'number' 
            ? centralBodyOrGM 
            : PhysicsConstants.getGravitationalParameter(centralBodyOrGM);
            
        const elements = stateToKeplerian(position, velocity, mu);
        
        if (!elements || elements.eccentricity >= 1.0) {
            // Non-elliptical orbit - return current time
            return currentTime;
        }
        
        // Calculate time to next apsis based on current true anomaly
        const currentAnomaly = THREE.MathUtils.degToRad(elements.trueAnomaly);
        let targetAnomaly;
        
        if (apsisType === 'periapsis') {
            targetAnomaly = 0; // Periapsis at true anomaly = 0
        } else {
            targetAnomaly = Math.PI; // Apoapsis at true anomaly = π
        }
        
        // Calculate angular distance to target
        let angularDistance = targetAnomaly - currentAnomaly;
        if (angularDistance < 0) {
            angularDistance += 2 * Math.PI; // Next occurrence
        }
        
        // Convert to time using mean motion
        const period = elements.period || 0;
        if (period === 0) return currentTime;
        
        const meanMotion = 2 * Math.PI / period;
        const timeToApsis = angularDistance / meanMotion;
        
        return new Date(currentTime.getTime() + timeToApsis * 1000);
    }
    
    /**
     * Calculate gravitational parameter for any body (with caching)
     * @param {Object|string|number} bodyIdentifier - Body object, name, or NAIF ID
     * @returns {number} Gravitational parameter (km³/s²)
     */
    static getGravitationalParameter(bodyIdentifier) {
        return PhysicsConstants.getGravitationalParameter(bodyIdentifier);
    }
    
    /**
     * Convert between different orbital element representations
     * @param {number} semiMajorAxis - Semi-major axis (km)
     * @param {number} eccentricity - Eccentricity
     * @param {number} bodyRadius - Central body radius (km)
     * @returns {Object} Periapsis and apoapsis radii and altitudes
     */
    static orbitalElementsToApsides(semiMajorAxis, eccentricity, bodyRadius) {
        const periapsisRadius = semiMajorAxis * (1 - eccentricity);
        const apoapsisRadius = semiMajorAxis * (1 + eccentricity);
        
        return {
            periapsisRadius,
            apoapsisRadius,
            periapsisAltitude: periapsisRadius - bodyRadius,
            apoapsisAltitude: apoapsisRadius - bodyRadius
        };
    }
    
    /**
     * Convert altitudes to orbital elements
     * @param {number} periapsisAltitude - Periapsis altitude (km)
     * @param {number} apoapsisAltitude - Apoapsis altitude (km)
     * @param {number} bodyRadius - Central body radius (km)
     * @returns {Object} Semi-major axis and eccentricity
     */
    static apsidesToOrbitalElements(periapsisAltitude, apoapsisAltitude, bodyRadius) {
        const rp = bodyRadius + periapsisAltitude;
        const ra = bodyRadius + apoapsisAltitude;
        const semiMajorAxis = (rp + ra) / 2;
        const eccentricity = (ra - rp) / (ra + rp);
        
        return { semiMajorAxis, eccentricity };
    }
    
    /**
     * Transform local delta-V (prograde/normal/radial) to world coordinates
     * @param {THREE.Vector3} localDV - Local delta-V vector
     * @param {THREE.Vector3|Array} position - Position vector
     * @param {THREE.Vector3|Array} velocity - Velocity vector
     * @returns {THREE.Vector3} World delta-V vector
     */
    static localToWorldDeltaV(localDV, position, velocity) {
        const pos = position.isVector3 ? position : new THREE.Vector3(...position);
        const vel = velocity.isVector3 ? velocity : new THREE.Vector3(...velocity);
        
        // Create local reference frame
        const prograde = vel.clone().normalize();
        const radial = pos.clone().normalize();
        const normal = new THREE.Vector3().crossVectors(radial, prograde).normalize();
        
        // Transform to world coordinates
        return new THREE.Vector3()
            .addScaledVector(prograde, localDV.x)  // Prograde component
            .addScaledVector(normal, localDV.y)    // Normal component  
            .addScaledVector(radial, localDV.z);   // Radial component
    }
    
    /**
     * Transform world delta-V to local coordinates (prograde/normal/radial)
     * @param {THREE.Vector3} worldDV - World delta-V vector
     * @param {THREE.Vector3|Array} position - Position vector
     * @param {THREE.Vector3|Array} velocity - Velocity vector
     * @returns {THREE.Vector3} Local delta-V vector (prograde, normal, radial)
     */
    static worldToLocalDeltaV(worldDV, position, velocity) {
        const pos = position.isVector3 ? position : new THREE.Vector3(...position);
        const vel = velocity.isVector3 ? velocity : new THREE.Vector3(...velocity);
        
        // Create local reference frame
        const prograde = vel.clone().normalize();
        const radial = pos.clone().normalize();
        const normal = new THREE.Vector3().crossVectors(radial, prograde).normalize();
        
        // Project world delta-V onto local axes
        return new THREE.Vector3(
            worldDV.dot(prograde),  // Prograde component
            worldDV.dot(normal),    // Normal component
            worldDV.dot(radial)     // Radial component
        );
    }
    
    /**
     * Calculate delta-V magnitude
     * @param {number} x - X component (km/s)
     * @param {number} y - Y component (km/s)
     * @param {number} z - Z component (km/s)
     * @returns {number} Magnitude (km/s)
     */
    static calculateDeltaVMagnitude(x, y, z) {
        return Math.sqrt(x * x + y * y + z * z);
    }
    
    /**
     * Check if a position is within a body's sphere of influence
     * @param {THREE.Vector3|Array} position - Position to check
     * @param {Object} body - Celestial body with position and soiRadius
     * @returns {boolean} True if within SOI
     */
    static isWithinSOI(position, body) {
        return GravityCalculator.isWithinSOI(position, body);
    }
    
    /**
     * Find the dominant gravitational body at a position
     * @param {THREE.Vector3|Array} position - Position to check
     * @param {Array} bodies - Array of celestial bodies
     * @returns {Object|null} Dominant body or null
     */
    static findDominantBody(position, bodies) {
        return GravityCalculator.findDominantBody(position, bodies);
    }
}