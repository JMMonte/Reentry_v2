import { PhysicsVector3 } from '../utils/PhysicsVector3.js';
import { PhysicsQuaternion } from '../utils/PhysicsQuaternion.js';

/**
 * GroundTrackProjectionService
 * 
 * Centralizes groundtrack projection calculations in the physics system.
 * Converts satellite 3D positions to equirectangular coordinates (lat/lon)
 * considering planet rotation and orientation.
 */
export class GroundTrackProjectionService {
    constructor() {
        // Working vectors to avoid allocations
        this._workVec1 = new PhysicsVector3();
        this._workVec2 = new PhysicsVector3();
        this._workVec3 = new PhysicsVector3();
        this._workQuat1 = new PhysicsQuaternion();
    }

    /**
     * Project satellite positions to planet surface coordinates for all satellites
     * @param {Object} satellites - Satellites data from physics engine
     * @param {Object} bodies - Celestial bodies data from physics engine  
     * @param {Date} simulationTime - Current simulation time
     * @returns {Object} Object keyed by planet NAIF ID, containing arrays of satellite ground positions
     */
    projectSatellitesToGroundTracks(satellites, bodies, simulationTime) {

        const groundTracks = {};

        // Group satellites by their central body
        const satellitesByPlanet = {};
        Object.entries(satellites).forEach(([id, satellite]) => {
            const centralBodyNaifId = satellite.centralBodyNaifId;
            if (!centralBodyNaifId) {
                console.warn('[GroundTrackProjectionService] Satellite missing centralBodyNaifId:', id, satellite);
                return;
            }
            if (!satellitesByPlanet[centralBodyNaifId]) {
                satellitesByPlanet[centralBodyNaifId] = [];
            }
            satellitesByPlanet[centralBodyNaifId].push({ id, ...satellite });
        });

        // Process each planet's satellites
        Object.entries(satellitesByPlanet).forEach(([planetNaifId, planetSatellites]) => {
            const planetData = bodies[planetNaifId];
            if (!planetData) return;

            const projectedPositions = [];

            planetSatellites.forEach(satellite => {
                try {
                    const groundPosition = this.projectSatelliteToGroundTrack(
                        satellite.position,
                        planetData,
                        simulationTime
                    );

                    // Normalize longitude to handle equirectangular edge effects
                    let normalizedLon = groundPosition.lon;
                    while (normalizedLon > 180) normalizedLon -= 360;
                    while (normalizedLon < -180) normalizedLon += 360;
                    
                    // Clamp latitude to valid range
                    const clampedLat = Math.max(-90, Math.min(90, groundPosition.lat));

                    projectedPositions.push({
                        id: satellite.id,
                        lat: clampedLat,
                        lon: normalizedLon,
                        alt: groundPosition.alt,
                        color: satellite.color,
                        centralBodyNaifId: satellite.centralBodyNaifId
                    });
                } catch (error) {
                    console.warn(`[GroundTrackProjectionService] Failed to project satellite ${satellite.id}:`, error);
                }
            });

            if (projectedPositions.length > 0) {
                groundTracks[planetNaifId] = projectedPositions;
            }
        });

        return groundTracks;
    }

    /**
     * Project a single satellite position to planet surface coordinates
     * @param {Array|PhysicsVector3} satellitePosition - Satellite position in planet-centric inertial coordinates [x, y, z] km
     * @param {Object} planetData - Planet data containing quaternion, radius, etc.
     * @param {Date} simulationTime - Current simulation time
     * @returns {{lat: number, lon: number, alt: number}} Latitude (-90 to 90), longitude (-180 to 180), altitude (km)
     */
    projectSatelliteToGroundTrack(satellitePosition, planetData, simulationTime) {
        // Convert position to PhysicsVector3 if needed
        const satPos = Array.isArray(satellitePosition) 
            ? this._workVec1.set(satellitePosition[0], satellitePosition[1], satellitePosition[2])
            : this._workVec1.copy(satellitePosition);

        // Get planet's current orientation quaternion
        const planetQuaternion = this._getPlanetQuaternion(planetData, simulationTime);

        // Transform from planet-centric inertial to planet-fixed coordinates
        const planetFixedPosition = this._transformInertialToPlanetFixed(satPos, planetQuaternion);

        // Convert planet-fixed cartesian to geodetic coordinates
        const geodetic = this._cartesianToGeodetic(planetFixedPosition, planetData);

        return {
            lat: geodetic.latitude,
            lon: geodetic.longitude,
            alt: geodetic.altitude
        };
    }

    /**
     * Get planet's current quaternion for transformation
     * @private
     */
    _getPlanetQuaternion(planetData, simulationTime) {
        // Priority 1: Use physics engine quaternion if available
        if (planetData.quaternion && Array.isArray(planetData.quaternion) && planetData.quaternion.length === 4) {
            const [x, y, z, w] = planetData.quaternion;
            return this._workQuat1.set(x, y, z, w);
        }

        // Priority 2: Calculate from rotation period and time
        if (planetData.rotationPeriod) {
            const rotationRate = this._calculateRotationRate(planetData);
            const rotationAngle = rotationRate * (simulationTime.getTime() / 1000); // Convert to seconds

            // Create rotation quaternion around Z-axis (assuming standard orientation)
            return this._workQuat1.setFromAxisAngle(new PhysicsVector3(0, 0, 1), rotationAngle);
        }

        // Priority 3: Calculate from pole coordinates if available
        if (planetData.poleRA !== undefined && planetData.poleDec !== undefined) {
            const poleRArad = (planetData.poleRA * Math.PI) / 180;
            const poleDecRad = (planetData.poleDec * Math.PI) / 180;

            // Convert pole coordinates to vector
            const poleVector = this._workVec2.set(
                Math.cos(poleDecRad) * Math.cos(poleRArad),
                Math.cos(poleDecRad) * Math.sin(poleRArad),
                Math.sin(poleDecRad)
            );

            // Calculate spin angle if available
            let spinRad = 0;
            if (planetData.spin !== undefined) {
                spinRad = (planetData.spin * Math.PI) / 180;
            } else if (planetData.rotationPeriod) {
                const rotationRate = this._calculateRotationRate(planetData);
                spinRad = rotationRate * (simulationTime.getTime() / 1000);
            }

            return this._calculateQuaternionFromPole(poleVector, spinRad);
        }

        // Default: Identity quaternion (no rotation)
        return this._workQuat1.set(0, 0, 0, 1);
    }

    /**
     * Calculate planet's rotation rate in rad/s
     * @private
     */
    _calculateRotationRate(planetData) {
        if (planetData.rotationPeriod) {
            return (2 * Math.PI) / Math.abs(planetData.rotationPeriod);
        }
        // Default to Earth's rotation rate if no period available
        return (2 * Math.PI) / 86400; // 1 day in seconds
    }

    /**
     * Calculate quaternion from pole vector and spin angle
     * @private
     */
    _calculateQuaternionFromPole(poleVector, spinRad) {
        // Start with the vernal equinox direction (X-axis)
        const vernalEquinox = this._workVec3.set(1, 0, 0);

        // Project vernal equinox onto plane perpendicular to pole
        const poleComponent = vernalEquinox.clone().projectOnVector(poleVector);
        const primeReference = vernalEquinox.sub(poleComponent).normalize();

        // If the result is too small (pole nearly parallel to vernal equinox), use Y-axis
        if (primeReference.length() < 0.1) {
            const yAxis = this._workVec3.set(0, 1, 0);
            const poleComponentY = yAxis.clone().projectOnVector(poleVector);
            primeReference.copy(yAxis).sub(poleComponentY).normalize();
        }

        // Apply the spin rotation to get the actual prime meridian direction
        const spinQuaternion = new PhysicsQuaternion().setFromAxisAngle(poleVector, spinRad);
        const primeMeridianDirection = primeReference.clone().applyQuaternion(spinQuaternion);

        // Construct the planet's coordinate system
        const planetZ = poleVector.clone().normalize();
        const planetX = primeMeridianDirection.normalize();
        const planetY = new PhysicsVector3().crossVectors(planetZ, planetX).normalize();

        // Create rotation matrix and convert to quaternion
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

    /**
     * Transform from planet-centric inertial to planet-fixed coordinates
     * @private
     */
    _transformInertialToPlanetFixed(inertialPosition, planetQuaternion) {
        // Apply inverse rotation (conjugate quaternion) to transform from inertial to fixed frame
        const conjugateQuaternion = planetQuaternion.clone().invert();
        return inertialPosition.clone().applyQuaternion(conjugateQuaternion);
    }

    /**
     * Convert planet-fixed cartesian coordinates to geodetic coordinates
     * Uses equirectangular projection with 0,0 at center
     * @private
     */
    _cartesianToGeodetic(planetFixedPosition, planetData) {
        const { x, y, z } = planetFixedPosition;
        const radius = planetData.radius || 6371; // Default to Earth radius in km

        // Calculate distance from planet center
        const r = Math.sqrt(x * x + y * y + z * z);
        
        // Calculate altitude
        const altitude = r - radius;

        // Calculate latitude (angle from equatorial plane)
        // Latitude ranges from -90° (south pole) to +90° (north pole)
        const latitude = Math.asin(Math.max(-1, Math.min(1, z / r))) * (180 / Math.PI);

        // Calculate longitude (angle around Z-axis)
        // Longitude ranges from -180° to +180° (equirectangular with 0,0 at center)
        let longitude = Math.atan2(y, x) * (180 / Math.PI);
        
        // Ensure longitude is in [-180, 180] range
        if (longitude > 180) longitude -= 360;
        if (longitude < -180) longitude += 360;

        return {
            latitude,
            longitude,
            altitude
        };
    }

    /**
     * Project latitude/longitude to equirectangular canvas coordinates
     * @param {number} lat - Latitude in degrees (-90 to 90)
     * @param {number} lon - Longitude in degrees (-180 to 180)  
     * @param {number} canvasWidth - Canvas width in pixels
     * @param {number} canvasHeight - Canvas height in pixels
     * @returns {{x: number, y: number}} Canvas coordinates
     */
    static projectToCanvas(lat, lon, canvasWidth, canvasHeight) {
        // Convert longitude from [-180, 180] to [0, canvasWidth]
        const x = ((lon + 180) / 360) * canvasWidth;
        
        // Convert latitude from [-90, 90] to [canvasHeight, 0] (inverted Y)
        const y = ((90 - lat) / 180) * canvasHeight;
        
        return { x, y };
    }

    /**
     * Check if longitude crossing represents a dateline crossing
     * @param {number} prevLon - Previous longitude
     * @param {number} currentLon - Current longitude  
     * @returns {boolean} True if this is a dateline crossing
     */
    static isDatelineCrossing(prevLon, currentLon) {
        if (prevLon === undefined || currentLon === undefined) return false;
        
        // Detect large longitude jumps (> 180°) indicating dateline crossing
        const lonDiff = Math.abs(currentLon - prevLon);
        return lonDiff > 180;
    }
} 