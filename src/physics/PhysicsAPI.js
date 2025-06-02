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

import * as THREE from 'three';

// Core physics modules
import { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
import { OrbitalMechanics } from './core/OrbitalMechanics.js';
import { GravityCalculator } from './core/GravityCalculator.js';
import { AtmosphericModels } from './core/AtmosphericModels.js';

// Physics utilities
import { PhysicsUtils } from './utils/PhysicsUtils.js';
import { CoordinateTransforms } from './utils/CoordinateTransforms.js';

// State management
import { StateVectorCalculator } from './StateVectorCalculator.js';
import { PositionManager } from './PositionManager.js';
import { SolarSystemHierarchy } from './SolarSystemHierarchy.js';

// Body data
import { solarSystemDataManager } from './PlanetaryDataManager.js';

// Constants
import { PhysicsConstants } from './core/PhysicsConstants.js';

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
        const period = body.rotationPeriod || 86400; // Default to 1 day in seconds
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
        return manager.getAllBodies();
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
    satelliteAcceleration: (satellite, centralBody, atmosphericData) => {
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

        // Return in original format (Three.js Vector3 for compatibility)
        return new THREE.Vector3().fromArray(accelArray);
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
     * Physics utilities
     */
    physics: PhysicsUtils,

    /**
     * Convert units
     */
    convert: {
        degreesToRadians: (degrees) => degrees * (Math.PI / 180),
        radiansToDegrees: (radians) => radians * (180 / Math.PI),
        kmToAU: (km) => km / 149597870.7,
        auToKm: (au) => au * 149597870.7
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
        }
    },

    /**
     * Vector operations
     */
    vector: {
        magnitude: (vec) => Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z),
        normalize: (vec) => {
            const mag = Utils.vector.magnitude(vec);
            return new THREE.Vector3(vec.x / mag, vec.y / mag, vec.z / mag);
        },
        dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
        cross: (a, b) => new THREE.Vector3(
            a.y * b.z - a.z * b.y,
            a.z * b.x - a.x * b.z,
            a.x * b.y - a.y * b.x
        ),
        
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