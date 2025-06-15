/**
 * PhysicsAPI - Unified Physics Interface
 * 
 * 🚀 The main physics API for the Darksun space simulation application.
 * This is now the primary interface for ALL physics calculations.
 * 
 * ✨ Key Features:
 * - 📊 Domain-organized: Orbital, Atmosphere, Bodies, Coordinates, Utils
 * - 🎯 Zero initialization: Ready to use immediately
 * - 🔧 Self-sufficient: Physics directory works independently
 * - ⚡ Performance optimized: Centralized calculations with caching
 * - 🧩 Modular: Import only what you need
 * 
 * 📖 Design Philosophy:
 * - Static functions for pure calculations (no state)
 * - Predictable, consistent API across all domains
 * - Clear separation of concerns by physics domain
 * - Works as an embedded backend for the application
 * 
 * 🎯 Migration Status: ✅ COMPLETED
 * All components now use this new unified API structure.
 */


// Core physics modules
import { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
import { OrbitalMechanics } from './core/OrbitalMechanics.js';
import { GravityCalculator } from './core/GravityCalculator.js';
import { AtmosphericModels } from './core/AtmosphericModels.js';
import { PhysicsConstants } from './core/PhysicsConstants.js';

// Physics utilities
import { GeodeticUtils } from './utils/GeodeticUtils.js';
import { CoordinateTransforms } from './utils/CoordinateTransforms.js';
import { MathUtils } from './utils/MathUtils.js';

// State management
import { StateVectorCalculator } from './StateVectorCalculator.js';
import { PositionManager } from './PositionManager.js';
import { SolarSystemHierarchy } from './SolarSystemHierarchy.js';

// Body data
import { solarSystemDataManager } from './PlanetaryDataManager.js';

/**
 * Orbital Mechanics Calculations
 */
export const Orbital = {
    /**
     * Calculate orbital elements from state vector
     */
    calculateElements: (position, velocity, centralBody) => {
        return OrbitalMechanics.calculateOrbitalElements(position, velocity, centralBody);
    },

    /**
     * Calculate state vector from orbital elements
     */
    calculateStateVector: (elements, centralBody) => {
        return OrbitalMechanics.elementsToStateVector(elements, centralBody);
    },

    /**
     * Propagate orbit forward in time using UnifiedSatellitePropagator
     */
    propagateOrbit: (initialState, timeStep, duration, centralBody) => {
        // Convert to UnifiedSatellitePropagator format
        const satellite = {
            position: Array.isArray(initialState.position) ? initialState.position : initialState.position.toArray(),
            velocity: Array.isArray(initialState.velocity) ? initialState.velocity : initialState.velocity.toArray(),
            centralBodyNaifId: centralBody.naifId || centralBody.naif_id || 399,
            mass: initialState.mass || 1000,
            crossSectionalArea: initialState.crossSectionalArea || 10,
            dragCoefficient: initialState.dragCoefficient || 2.2
        };

        const bodies = { [satellite.centralBodyNaifId]: centralBody };

        return UnifiedSatellitePropagator.propagateOrbit({
            satellite,
            bodies,
            duration,
            timeStep,
            includeJ2: true,
            includeDrag: true,
            includeThirdBody: false // Single body propagation for API compatibility
        });
    },

    /**
     * Calculate circular velocity at radius
     */
    circularVelocity: (centralBody, radius) => {
        return OrbitalMechanics.calculateCircularVelocity(centralBody, radius);
    },

    /**
     * Calculate transfer orbit between two orbits
     */
    calculateTransfer: (fromOrbit, toOrbit, centralBody) => {
        return OrbitalMechanics.calculateTransfer(fromOrbit, toOrbit, centralBody);
    },

    /**
     * Calculate Hohmann transfer with comprehensive parameters (compatibility)
     */
    calculateHohmannTransfer: (params) => {
        const {
            currentPosition,
            targetPeriapsis,
            targetApoapsis,
            bodyRadius,
            mu
        } = params;

        const r_current = currentPosition.length();
        const r_target = bodyRadius + (targetPeriapsis || targetApoapsis || 0);

        const velocities = OrbitalMechanics.calculateHohmannTransfer({
            centralBody: { GM: mu },
            currentRadius: r_current,
            targetRadius: r_target
        });

        return {
            deltaV1: velocities.velocities.transferDeparture - Math.sqrt(mu / r_current),
            deltaV2: Math.sqrt(mu / r_target) - velocities.velocities.transferArrival,
            totalDeltaV: Math.abs(velocities.velocities.transferDeparture - Math.sqrt(mu / r_current)) +
                Math.abs(Math.sqrt(mu / r_target) - velocities.velocities.transferArrival),
            transferTime: velocities.transferTime || (Math.PI * Math.sqrt(Math.pow((r_current + r_target) / 2, 3) / mu)),
            burn1: { planeChangeComponent: 0 },
            burn2: { planeChangeComponent: 0 }
        };
    },


    /**
     * Get next periapsis time
     */
    nextPeriapsis: (position, velocity, centralBody, currentTime) => {
        return OrbitalMechanics.calculateNextApsis(position, velocity, centralBody, 'periapsis', currentTime);
    },

    /**
     * Get next apoapsis time
     */
    nextApoapsis: (position, velocity, centralBody, currentTime) => {
        return OrbitalMechanics.calculateNextApsis(position, velocity, centralBody, 'apoapsis', currentTime);
    },

    /**
     * Calculate orbital period from semi-major axis
     */
    calculatePeriodFromSMA: (semiMajorAxis, centralBody) => {
        const mu = typeof centralBody === 'number' ? centralBody :
            (centralBody.GM || centralBody.gravitationalParameter);
        return 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
    },

    /**
     * Calculate orbital period from position and velocity vectors
     */
    calculateOrbitalPeriod: (position, velocity, centralBodyOrGM) => {
        return OrbitalMechanics.calculateOrbitalPeriod(position, velocity, centralBodyOrGM);
    },

    /**
     * Preview a maneuver - calculate post-burn orbit points
     * This uses the SAME physics as actual maneuver execution
     */
    previewManeuver: (params) => {
        const {
            satellite,
            deltaV, // { prograde, normal, radial } in km/s
            executionTime,
            physicsEngine,
            duration = null, // optional override
            isPreview = false // true for temporary previews, false for permanent nodes
        } = params;

        try {
            // Get central body
            const centralBodyId = satellite.centralBodyNaifId;
            const centralBody = physicsEngine.bodies?.[centralBodyId];
            if (!centralBody) {
                throw new Error(`Central body ${centralBodyId} not found`);
            }

            // Handle nested maneuvers - get existing maneuver nodes and propagate through them
            const currentTime = physicsEngine.getSimulatedTime();

            // Get existing maneuver nodes from physics engine with error handling
            // Only include existing nodes for preview calculations, not for permanent node visualization
            let existingNodes = [];
            if (isPreview) {
                try {
                    existingNodes = physicsEngine.satelliteEngine?.getManeuverNodes?.(satellite.id) || [];
                    if (!Array.isArray(existingNodes)) {
                        existingNodes = [];
                    }
                } catch (error) {
                    console.warn('[PhysicsAPI.previewManeuver] Error getting existing nodes:', error);
                    existingNodes = [];
                }
            }

            // Sort nodes by execution time with error handling
            const sortedNodes = [...existingNodes].sort((a, b) => {
                try {
                    const timeA = a.executionTime instanceof Date ? a.executionTime.getTime() : new Date(a.executionTime).getTime();
                    const timeB = b.executionTime instanceof Date ? b.executionTime.getTime() : new Date(b.executionTime).getTime();
                    return timeA - timeB;
                } catch (error) {
                    console.warn('[PhysicsAPI.previewManeuver] Error sorting nodes:', error);
                    return 0;
                }
            });

            // Find nodes that execute before our preview time
            const nodesBeforePreview = sortedNodes.filter(node => {
                try {
                    const nodeTime = node.executionTime instanceof Date ? node.executionTime : new Date(node.executionTime);
                    return nodeTime.getTime() < executionTime.getTime();
                } catch (error) {
                    console.warn('[PhysicsAPI.previewManeuver] Error filtering node:', error);
                    return false;
                }
            });

            let maneuverPosition, maneuverVelocity;

            // Get initial satellite state
            let currentPos = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
            let currentVel = satellite.velocity.toArray ? satellite.velocity.toArray() : satellite.velocity;
            let lastTime = currentTime;

            // If we have nodes before this preview, propagate through them
            if (nodesBeforePreview.length > 0) {
                // Propagate through each existing maneuver
                for (const node of nodesBeforePreview) {
                    try {
                        const nodeTime = node.executionTime instanceof Date ? node.executionTime : new Date(node.executionTime);
                        const timeDiff = (nodeTime.getTime() - lastTime) / 1000; // seconds

                        if (timeDiff > 0) {
                            // Propagate to this maneuver
                            const propagation = UnifiedSatellitePropagator.propagateOrbit({
                                satellite: {
                                    position: currentPos,
                                    velocity: currentVel,
                                    centralBodyNaifId: centralBodyId,
                                    mass: satellite.mass,
                                    crossSectionalArea: satellite.crossSectionalArea,
                                    dragCoefficient: satellite.dragCoefficient
                                },
                                bodies: physicsEngine.bodies,
                                duration: timeDiff,
                                timeStep: Math.min(60, Math.max(1, timeDiff / 100)),
                                includeJ2: true,
                                includeDrag: true,
                                includeThirdBody: false
                            });

                            if (propagation && propagation.length > 0) {
                                const stateAtNode = propagation[propagation.length - 1];
                                currentPos = stateAtNode.position;
                                currentVel = stateAtNode.velocity;
                            }
                        }

                        // Apply the existing maneuver's deltaV
                        currentVel = Utils.vector.applyDeltaV(currentVel, node.deltaV, currentPos);
                        lastTime = nodeTime.getTime();
                    } catch (error) {
                        console.warn('[PhysicsAPI.previewManeuver] Error processing existing maneuver:', error);
                        // Skip this maneuver and continue
                        continue;
                    }
                }

                // Now propagate from last maneuver to preview time
                const finalTimeDiff = (executionTime.getTime() - lastTime) / 1000;

                if (Math.abs(finalTimeDiff) < 1) {
                    // Preview time is very close to last maneuver
                    maneuverPosition = currentPos;
                    maneuverVelocity = currentVel;
                } else {
                    // Propagate from last maneuver to preview time
                    const finalProp = UnifiedSatellitePropagator.propagateOrbit({
                        satellite: {
                            position: currentPos,
                            velocity: currentVel,
                            centralBodyNaifId: centralBodyId,
                            mass: satellite.mass,
                            crossSectionalArea: satellite.crossSectionalArea,
                            dragCoefficient: satellite.dragCoefficient
                        },
                        bodies: physicsEngine.bodies,
                        duration: finalTimeDiff,
                        timeStep: Math.min(60, Math.max(1, Math.abs(finalTimeDiff) / 100)),
                        includeJ2: true,
                        includeDrag: true,
                        includeThirdBody: false
                    });

                    if (finalProp && finalProp.length > 0) {
                        const finalState = finalProp[finalProp.length - 1];
                        maneuverPosition = finalState.position;
                        maneuverVelocity = finalState.velocity;
                    } else {
                        maneuverPosition = currentPos;
                        maneuverVelocity = currentVel;
                    }
                }
            } else {
                // No existing maneuvers - propagate directly from current satellite state
                const timeToManeuver = (executionTime.getTime() - currentTime) / 1000;

                if (Math.abs(timeToManeuver) < 1) {
                    // Immediate maneuver - use current state
                    maneuverPosition = currentPos;
                    maneuverVelocity = currentVel;
                } else {
                    // Propagate to maneuver time
                    const propagation = UnifiedSatellitePropagator.propagateOrbit({
                        satellite: {
                            position: currentPos,
                            velocity: currentVel,
                            centralBodyNaifId: centralBodyId,
                            mass: satellite.mass,
                            crossSectionalArea: satellite.crossSectionalArea,
                            dragCoefficient: satellite.dragCoefficient
                        },
                        bodies: physicsEngine.bodies,
                        duration: timeToManeuver,
                        timeStep: Math.min(60, Math.max(1, Math.abs(timeToManeuver) / 100)),
                        includeJ2: true,
                        includeDrag: true,
                        includeThirdBody: false
                    });

                    if (!propagation || propagation.length === 0) {
                        throw new Error('Failed to propagate to maneuver time');
                    }

                    const stateAtManeuver = propagation[propagation.length - 1];
                    maneuverPosition = stateAtManeuver.position;
                    maneuverVelocity = stateAtManeuver.velocity;
                }
            }

            // Apply delta-V using same method as actual maneuvers
            const postManeuverVelocity = Utils.vector.applyDeltaV(
                maneuverVelocity,
                deltaV,
                maneuverPosition
            );

            // Calculate post-burn orbit duration
            const orbitDuration = duration || Utils.time.calculateManeuverOrbitDuration(
                maneuverPosition,
                postManeuverVelocity,
                centralBody
            );

            // Propagate post-burn orbit using same system as actual maneuvers
            const postBurnOrbit = UnifiedSatellitePropagator.propagateOrbit({
                satellite: {
                    position: maneuverPosition,
                    velocity: postManeuverVelocity,
                    centralBodyNaifId: centralBodyId,
                    mass: satellite.mass,
                    crossSectionalArea: satellite.crossSectionalArea,
                    dragCoefficient: satellite.dragCoefficient
                },
                bodies: physicsEngine.bodies,
                duration: orbitDuration,
                timeStep: Math.max(30, orbitDuration / 200), // ~200 points per orbit
                includeJ2: true,
                includeDrag: false, // No drag for preview clarity
                includeThirdBody: false
            });

            return {
                maneuverPosition,
                postManeuverVelocity,
                orbitPoints: postBurnOrbit || [],
                duration: orbitDuration,
                centralBody // Include central body for coordinate conversion in visualization layer
            };

        } catch (error) {
            console.error('[PhysicsAPI.Orbital.previewManeuver] Error:', error);
            return {
                maneuverPosition: null,
                postManeuverVelocity: null,
                orbitPoints: [],
                duration: 0,
                error: error.message
            };
        }
    }
};

/**
 * Atmospheric Calculations
 */
export const Atmosphere = {
    /**
     * Get atmospheric density at altitude
     */
    getDensity: (bodyName, altitude) => {
        const models = new AtmosphericModels();
        return models.getDensity(bodyName, altitude);
    },

    /**
     * Calculate atmospheric drag force
     */
    calculateDrag: (velocity, density, area, dragCoeff) => {
        const models = new AtmosphericModels();
        return models.calculateDrag(velocity, density, area, dragCoeff);
    },

    /**
     * Calculate atmospheric scale height
     */
    getScaleHeight: (bodyName) => {
        const models = new AtmosphericModels();
        return models.getScaleHeight(bodyName);
    }
};

/**
 * Coordinate System Transformations
 */
export const Coordinates = {
    /**
     * Convert lat/lon/alt to state vector
     */
    fromLatLonAlt: (latitude, longitude, altitude, velocity, azimuth, angleOfAttack, planet) => {
        return CoordinateTransforms.createFromLatLonCircular(
            latitude, longitude, altitude, velocity, azimuth, angleOfAttack, planet
        );
    },

    /**
     * Convert state vector to lat/lon/alt
     */
    toLatLonAlt: (position, velocity, planet) => {
        return CoordinateTransforms.stateVectorToLatLonAlt(position, velocity, planet);
    },

    /**
     * Transform between coordinate systems
     */
    transform: (coords, fromSystem, toSystem, body) => {
        return CoordinateTransforms.transform(coords, fromSystem, toSystem, body);
    },

    /**
     * Convert lat/lon/alt to cartesian coordinates (Earth-specific convenience method)
     * @param {number} latitude - Latitude in degrees
     * @param {number} longitude - Longitude in degrees
     * @param {number} altitude - Altitude in km (default: 0)
     * @returns {Array} [x, y, z] position in km
     */
    latLonAltToCartesian: (latitude, longitude, altitude = 0) => {
        return GeodeticUtils.latLonAltToCartesianEarth(latitude, longitude, altitude);
    },

    /**
     * Convert cartesian coordinates to spherical lat/lon/alt
     * @param {Array} position - [x, y, z] cartesian position in km
     * @param {number} radius - Planet radius in km
     * @returns {Object} {lat, lon, alt} in degrees and km
     */
    cartesianToSphericalLatLonAlt: (position, radius) => {
        return GeodeticUtils.cartesianToSphericalLatLonAlt(position, radius);
    }
};

/**
 * Celestial Body Operations
 */
export const Bodies = {
    /**
     * Get planetary data for a body
     */
    getData: (bodyIdentifier) => {
        const manager = solarSystemDataManager;
        // Try to get by NAIF ID first (if it's a number), then by name
        if (typeof bodyIdentifier === 'number') {
            return manager.getBodyByNaif(bodyIdentifier);
        } else {
            return manager.getBodyByName(bodyIdentifier);
        }
    },

    /**
     * Get gravitational parameter
     */
    getGM: (bodyIdentifier) => {
        return OrbitalMechanics.getGravitationalParameter(bodyIdentifier);
    },

    /**
     * Get body rotation rate (rad/s)
     */
    getRotationRate: (body) => {
        const period = body.rotationPeriod || PhysicsConstants.TIME.SECONDS_IN_DAY; // Default to 1 day in seconds
        return (2 * Math.PI) / Math.abs(period);
    },

    /**
     * Get body position at time
     */
    getPosition: (bodyName, time) => {
        const hierarchy = new SolarSystemHierarchy();
        return hierarchy.getBodyPosition(bodyName, time);
    },

    /**
     * Get all available bodies
     */
    getAll: () => {
        const manager = solarSystemDataManager;
        return Array.from(manager.bodies.values());
    },

    /**
     * Get body data by NAIF ID
     */
    getByNaif: (naifId) => {
        const manager = solarSystemDataManager;
        return manager.getBodyByNaif(naifId);
    }
};

/**
 * Force Calculations
 */
export const Forces = {
    /**
     * Calculate gravitational acceleration
     */
    gravity: (position, centralBody, otherBodies = []) => {
        const calculator = new GravityCalculator();
        return calculator.calculateAcceleration(position, centralBody, otherBodies);
    },

    /**
     * Calculate satellite acceleration (all forces) using UnifiedSatellitePropagator
     */
    satelliteAcceleration: (satellite, centralBody) => {
        // Convert to UnifiedSatellitePropagator format
        const satState = {
            position: Array.isArray(satellite.position) ? satellite.position : satellite.position.toArray(),
            velocity: Array.isArray(satellite.velocity) ? satellite.velocity : satellite.velocity.toArray(),
            centralBodyNaifId: centralBody.naifId || centralBody.naif_id || 399,
            mass: satellite.mass || 1000,
            crossSectionalArea: satellite.crossSectionalArea || 10,
            dragCoefficient: satellite.dragCoefficient || 2.2
        };

        // Convert central body to array format
        const bodies = {
            [satState.centralBodyNaifId]: {
                ...centralBody,
                position: Array.isArray(centralBody.position) ? centralBody.position : centralBody.position?.toArray() || [0, 0, 0],
                velocity: Array.isArray(centralBody.velocity) ? centralBody.velocity : centralBody.velocity?.toArray() || [0, 0, 0]
            }
        };

        const accelArray = UnifiedSatellitePropagator.computeAcceleration(satState, bodies, {
            includeJ2: true,
            includeDrag: true,
            includeThirdBody: false
        });

        // Return as array for physics layer compatibility
        return accelArray;
    }
};

/**
 * Physics Constants - Single Source of Truth
 */
export const Constants = {
    /**
     * Fundamental physics constants
     */
    PHYSICS: PhysicsConstants.PHYSICS,

    /**
     * Time conversion constants
     */
    TIME: PhysicsConstants.TIME,

    /**
     * Simulation parameters
     */
    SIMULATION: PhysicsConstants.SIMULATION,

    /**
     * Validation limits
     */
    VELOCITY_LIMITS: PhysicsConstants.VELOCITY_LIMITS,
    POSITION_LIMITS: PhysicsConstants.POSITION_LIMITS,

    /**
     * Atmospheric constants
     */
    ATMOSPHERIC: PhysicsConstants.ATMOSPHERIC,

    /**
     * Numerical method constants
     */
    NUMERICAL: PhysicsConstants.NUMERICAL,

    /**
     * Default satellite properties
     */
    SATELLITE_DEFAULTS: PhysicsConstants.SATELLITE_DEFAULTS,

    /**
     * Mathematical constants
     */
    MATH: PhysicsConstants.MATH,

    /**
     * SOI detection thresholds
     */
    SOI_THRESHOLDS: PhysicsConstants.SOI_THRESHOLDS,

    // Legacy compatibility (deprecated - use PHYSICS.* or TIME.* instead)
    get G() { return this.PHYSICS.G; },
    get AU() { return this.PHYSICS.AU; },
    get siderialDay() { return this.TIME.SIDEREAL_DAY; },
    get secondsInDay() { return this.TIME.SECONDS_IN_DAY; },
    get ECLIPIC_J2000_JD() { return this.PHYSICS.J2000_EPOCH; },
};

/**
 * Utility Functions
 */
export const Utils = {
    /**
     * Geodetic coordinate utilities
     */
    geodetic: GeodeticUtils,

    /**
     * Convert units
     */
    convert: {
        degreesToRadians: MathUtils.degToRad,
        radiansToDegrees: MathUtils.radToDeg,
        kmToAU: (km) => km / PhysicsConstants.PHYSICS.AU,
        auToKm: (au) => au * PhysicsConstants.PHYSICS.AU
    },

    /**
     * Time utilities
     */
    time: {
        /**
         * Compute execution time based on mode and parameters
         */
        computeExecutionTime: (currentTime, timeMode, params) => {
            if (timeMode === 'offset') {
                const secs = parseFloat(params.offsetSec) || 0;
                return new Date(currentTime.getTime() + secs * 1000);
            } else if (timeMode === 'datetime') {
                const newTime = new Date(currentTime);
                newTime.setUTCHours(params.hours);
                newTime.setUTCMinutes(params.minutes);
                newTime.setUTCSeconds(params.seconds);
                newTime.setUTCMilliseconds(params.milliseconds || 0);
                return newTime;
            }
            return currentTime;
        },

        /**
         * Calculate appropriate duration for maneuver orbit visualization
         */
        calculateManeuverOrbitDuration: (position, velocity, centralBody) => {
            // Calculate orbital characteristics
            const r = Utils.vector.magnitude(position);
            const v = Utils.vector.magnitude(velocity);
            const mu = centralBody.GM || (Constants.PHYSICS.G * centralBody.mass);

            // Calculate specific orbital energy
            const energy = (v * v) / 2 - mu / r;
            const isHyperbolic = energy >= 0;

            if (!isHyperbolic) {
                // Elliptical orbit - show 1.5 periods or max 24 hours
                const a = -mu / (2 * energy);
                const period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
                return Math.min(period * 1.5, 86400); // 1.5 orbits or 24 hours max
            } else {
                // Hyperbolic/parabolic - show 4 hours of escape trajectory
                return 3600 * 4;
            }
        }
    },

    /**
     * Vector operations
     */
    vector: {
        magnitude: (vec) => {
            // Support both array and object formats
            if (Array.isArray(vec)) {
                return Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);
            }
            return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
        },
        normalize: (vec) => {
            const mag = Utils.vector.magnitude(vec);
            if (Array.isArray(vec)) {
                return [vec[0] / mag, vec[1] / mag, vec[2] / mag];
            }
            return [vec.x / mag, vec.y / mag, vec.z / mag];
        },
        dot: (a, b) => {
            if (Array.isArray(a)) {
                return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
            }
            return a.x * b.x + a.y * b.y + a.z * b.z;
        },
        cross: (a, b) => {
            if (Array.isArray(a)) {
                return [
                    a[1] * b[2] - a[2] * b[1],
                    a[2] * b[0] - a[0] * b[2],
                    a[0] * b[1] - a[1] * b[0]
                ];
            }
            return [
                a.y * b.z - a.z * b.y,
                a.z * b.x - a.x * b.z,
                a.x * b.y - a.y * b.x
            ];
        },

        /**
         * Convert local delta-V (prograde, normal, radial) to world coordinates
         */
        localToWorldDeltaV: (localDV, position, velocity) => {
            return OrbitalMechanics.localToWorldDeltaV(localDV, position, velocity);
        },

        /**
         * Convert world delta-V to local coordinates (prograde, normal, radial)
         */
        worldToLocalDeltaV: (worldDV, position, velocity) => {
            return OrbitalMechanics.worldToLocalDeltaV(worldDV, position, velocity);
        },

        /**
         * Apply delta-V in local orbital frame (prograde, normal, radial)
         */
        applyDeltaV: (velocity, deltaV, position) => {
            // Convert arrays to ensure we have array format
            const pos = Array.isArray(position) ? position : [position.x, position.y, position.z];
            const vel = Array.isArray(velocity) ? velocity : [velocity.x, velocity.y, velocity.z];

            // Calculate local orbital frame
            const r = Utils.vector.normalize(pos);
            const h = Utils.vector.cross(pos, vel);
            const n = Utils.vector.normalize(h);
            const t = Utils.vector.cross(n, r);

            // Apply delta-V components
            return [
                vel[0] + deltaV.prograde * t[0] + deltaV.normal * n[0] + deltaV.radial * r[0],
                vel[1] + deltaV.prograde * t[1] + deltaV.normal * n[1] + deltaV.radial * r[1],
                vel[2] + deltaV.prograde * t[2] + deltaV.normal * n[2] + deltaV.radial * r[2]
            ];
        }
    }
};

/**
 * Advanced Operations (for power users)
 */
export const Advanced = {
    /**
     * Direct access to core components
     */
    UnifiedSatellitePropagator,
    OrbitalMechanics,
    GravityCalculator,
    AtmosphericModels,
    StateVectorCalculator,
    PositionManager,
    SolarSystemHierarchy,
    solarSystemDataManager
};

/**
 * Default export for convenience
 */
export default {
    Orbital,
    Atmosphere,
    Coordinates,
    Bodies,
    Forces,
    Utils,
    Advanced
};