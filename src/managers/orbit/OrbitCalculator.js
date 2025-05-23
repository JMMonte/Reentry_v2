import * as THREE from 'three';
import { stateToKeplerian, getPositionAtTrueAnomaly } from '../../utils/KeplerianUtils.js';
import { Constants } from '../../utils/Constants.js';

/**
 * OrbitCalculator handles pure orbital mechanics calculations
 * without any rendering or UI concerns
 */
export class OrbitCalculator {
    constructor() {
        // Configuration for special cases
        this.specialCases = {
            earthMoonSystem: {
                parentNaif: 3,
                minDistance: 10, // 10 m
                minSpeed: 1e-6, // 1 µm/s
                circularVelocityCorrection: true
            }
        };
    }

    /**
     * Calculate orbital elements from position and velocity
     */
    calculateOrbitalElements(relativePosition, relativeVelocity, parentMass, bodyName = '', parentNaif = 0) {
        const mu = Constants.G * parentMass;

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

        // Apply special case corrections
        if (this.needsSpecialHandling(bodyName, parentNaif)) {
            elements = this.applySpecialCorrections(
                elements,
                transformedPos,
                transformedVel,
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
     * Get parent planet's orientation quaternion
     */
    getParentOrientation(parentNaif) {
        // Map of barycenter NAIF IDs to main planet NAIF IDs
        const barycenterToPlanet = {
            4: 499,  // Mars Barycenter -> Mars
            5: 599,  // Jupiter Barycenter -> Jupiter  
            6: 699,  // Saturn Barycenter -> Saturn
            7: 799,  // Uranus Barycenter -> Uranus
            8: 899,  // Neptune Barycenter -> Neptune
            9: 999,  // Pluto System Barycenter -> Pluto
            3: 399   // Earth-Moon Barycenter -> Earth (for Moon)
        };
        const planetNaif = barycenterToPlanet[parentNaif] || parentNaif;
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
     * Check if a body needs special handling
     */
    needsSpecialHandling(bodyName, parentNaif) {
        return parentNaif === this.specialCases.earthMoonSystem.parentNaif &&
            bodyName === 'Earth';
    }

    /**
     * Apply special corrections for problematic orbits
     */
    applySpecialCorrections(originalElements, relativePosition, relativeVelocity, mu, bodyName) {
        if (bodyName === 'Earth') {
            return this.correctEarthOrbit(originalElements, relativePosition, mu);
        }
        return originalElements;
    }

    /**
     * Correct Earth's orbit around EMB using circular velocity
     */
    correctEarthOrbit(originalElements, relativePosition, mu) {
        const orbitalRadius = relativePosition.length();
        const circularVelocity = Math.sqrt(mu / orbitalRadius);

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
    validateRelativeMotion(relativePosition, relativeVelocity, parentNaif) {
        const relDistance = relativePosition.length();
        const relSpeed = relativeVelocity.length();

        let minDistance = 1e3; // 1 km default
        let minSpeed = 1e-3; // 1 mm/s default

        // Apply special thresholds for Earth-Moon system
        if (parentNaif === this.specialCases.earthMoonSystem.parentNaif) {
            minDistance = this.specialCases.earthMoonSystem.minDistance;
            minSpeed = this.specialCases.earthMoonSystem.minSpeed;
        }

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
    calculateOptimalResolution(elements, parentNaif, defaultPoints = 360) {
        // Higher resolution for small orbits or Earth-Moon system
        if (parentNaif === this.specialCases.earthMoonSystem.parentNaif ||
            (elements && elements.a < 1e6)) {
            return 720;
        }
        return defaultPoints;
    }
} 