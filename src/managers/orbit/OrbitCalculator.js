import * as THREE from 'three';
import { stateToKeplerian, getPositionAtTrueAnomaly } from '../../utils/KeplerianUtils.js';
import { Constants } from '../../utils/Constants.js';
import { PhysicsAPI } from '../../physics/PhysicsAPI.js';

/**
 * OrbitCalculator handles pure orbital mechanics calculations
 * without any rendering or UI concerns
 */
export class OrbitCalculator {
    constructor() {
        // Default thresholds for orbit validation
        this.defaultThresholds = {
            minDistance: 1e3, // 1 km default
            minSpeed: 1e-3 // 1 mm/s default
        };
    }

    /**
     * Calculate orbital elements from position and velocity
     */
    calculateOrbitalElements(relativePosition, relativeVelocity, parentMass, bodyName = '', parentNaif = 0, bodyConfig = null) {
        const mu = PhysicsAPI.getGravitationalParameter({ mass: parentMass });

        // Transform to planet's equatorial coordinates if this is a moon orbiting a planet
        const { transformedPos, transformedVel } = this.transformToParentEquatorial(
            relativePosition,
            relativeVelocity,
            parentNaif
        );

        // Convert vectors to objects for Keplerian utils
        const posObj = {
            x: transformedPos.x,
            y: transformedPos.y,
            z: transformedPos.z
        };
        const velObj = {
            x: transformedVel.x,
            y: transformedVel.y,
            z: transformedVel.z
        };

        // Calculate initial elements
        let elements = stateToKeplerian(posObj, velObj, mu, 0);

        // Apply corrections if specified in body config (data-driven)
        if (bodyConfig?.orbitVisualization?.applyCircularCorrection) {
            elements = this.applyCircularCorrection(
                elements,
                transformedPos,
                mu,
                bodyName
            );
        }

        return elements;
    }

    /**
     * Transform position and velocity to parent planet's equatorial coordinate system
     */
    transformToParentEquatorial(relativePosition, relativeVelocity, parentNaif) {
        // Get parent planet's orientation
        const parentQuaternion = this.getParentOrientation(parentNaif);

        if (!parentQuaternion) {
            // If no parent orientation available, return original vectors
            return {
                transformedPos: relativePosition.clone(),
                transformedVel: relativeVelocity.clone()
            };
        }

        // Create the inverse rotation (from ecliptic to planet equatorial)
        const inverseQuaternion = parentQuaternion.clone().invert();

        // Transform position and velocity vectors
        const transformedPos = relativePosition.clone().applyQuaternion(inverseQuaternion);
        const transformedVel = relativeVelocity.clone().applyQuaternion(inverseQuaternion);

        return { transformedPos, transformedVel };
    }

    /**
     * Helper to get parent NAIF ID from body config
     */
    _getParentNaifFromConfig(bodyConfig) {
        if (!bodyConfig || !bodyConfig.parent) return null;
        
        // Find the parent by name in the celestial bodies
        if (typeof window !== 'undefined' && window.app && window.app.celestialBodies) {
            const parent = window.app.celestialBodies.find(body => {
                const config = body.config || body;
                return config.name === bodyConfig.parent;
            });
            
            if (parent) {
                return parent.naifId || parent.naif_id || parent.config?.naif_id;
            }
        }
        
        return null;
    }

    /**
     * Get parent planet's orientation quaternion
     */
    getParentOrientation(parentNaif) {
        // Dynamically find the planet associated with this barycenter
        let planetNaif = parentNaif;

        // Look for a planet/dwarf_planet that has this barycenter as parent
        if (typeof window !== 'undefined' && window.app && window.app.celestialBodies) {
            const planet = window.app.celestialBodies.find(body => {
                // Check if this body is a planet/dwarf_planet with the parentNaif as its parent barycenter
                const bodyConfig = body.config || body;
                const bodyParentNaif = this._getParentNaifFromConfig(bodyConfig);
                return (bodyConfig.type === 'planet' || bodyConfig.type === 'dwarf_planet') &&
                    bodyParentNaif === parentNaif;
            });

            if (planet) {
                planetNaif = planet.naifId || planet.naif_id || planet.config?.naif_id;
            }
        }
        // Try to get the planet's orientation quaternion from the app context
        if (typeof window !== 'undefined' && window.app && window.app.bodiesByNaifId) {
            const planet = window.app.bodiesByNaifId[planetNaif];
            if (planet && planet.orientationGroup) {
                return planet.orientationGroup.quaternion.clone();
            }
        }
        return null;
    }

    /**
     * Generate orbit points from orbital elements
     */
    generateOrbitPoints(elements, mu, numPoints = 360) {
        const points = [];

        if (!elements || !isFinite(elements.a) || elements.a === 0) {
            console.warn('[OrbitCalculator] Invalid orbital elements provided');
            return points;
        }

        for (let i = 0; i <= numPoints; i++) {
            const trueAnomaly = (i / numPoints) * 2 * Math.PI;
            const p = getPositionAtTrueAnomaly(elements, mu, trueAnomaly);

            if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;

            points.push(new THREE.Vector3(p.x, p.y, p.z));
        }

        return points;
    }

    /**
     * Apply circular orbit correction for stability
     * Used for bodies that orbit very close to their barycenter
     */
    applyCircularCorrection(originalElements, relativePosition, mu, bodyName) {
        const orbitalRadius = relativePosition.length();
        const circularVelocity = PhysicsAPI.calculateCircularVelocity(mu, orbitalRadius);

        // Create a circular velocity vector perpendicular to position
        const posNormalized = relativePosition.clone().normalize();
        let velocityDirection = new THREE.Vector3(0, 0, 1).cross(posNormalized);

        // If cross product is too small, use different axis
        if (velocityDirection.length() < 0.1) {
            velocityDirection = new THREE.Vector3(1, 0, 0).cross(posNormalized);
        }
        velocityDirection.normalize();

        // Apply circular velocity magnitude
        const correctedVel = velocityDirection.multiplyScalar(circularVelocity);

        // Recalculate elements with corrected velocity
        const posObj = { x: relativePosition.x, y: relativePosition.y, z: relativePosition.z };
        const correctedVelObj = { x: correctedVel.x, y: correctedVel.y, z: correctedVel.z };
        const correctedElements = stateToKeplerian(posObj, correctedVelObj, mu, 0);

        if (correctedElements && correctedElements.e < originalElements.e) {
            return correctedElements;
        } else {
            return originalElements;
        }
    }

    /**
     * Validate relative motion for orbit generation
     */
    validateRelativeMotion(relativePosition, relativeVelocity, parentNaif, bodyConfig = null) {
        const relDistance = relativePosition.length();
        const relSpeed = relativeVelocity.length();

        // Use body config for thresholds if available, otherwise use defaults
        const minDistance = bodyConfig?.orbitVisualization?.minDistance || this.defaultThresholds.minDistance;
        const minSpeed = bodyConfig?.orbitVisualization?.minSpeed || this.defaultThresholds.minSpeed;

        return {
            isValid: relDistance >= minDistance && relSpeed >= minSpeed,
            distance: relDistance,
            speed: relSpeed,
            minDistance,
            minSpeed
        };
    }

    /**
     * Calculate optimal number of points for orbit resolution
     */
    calculateOptimalResolution(elements, parentNaif, bodyConfig = null, defaultPoints = 360) {
        // Use body config for resolution if available
        const configuredPoints = bodyConfig?.orbitVisualization?.orbitPoints;
        if (configuredPoints) {
            return configuredPoints;
        }
        
        // Higher resolution for small orbits
        if (elements && elements.a < 1e6) {
            return 720;
        }
        
        return defaultPoints;
    }
} 