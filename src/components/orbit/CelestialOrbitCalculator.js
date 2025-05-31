import * as THREE from 'three';
import { Orbital } from '../../physics/PhysicsAPI.js';

/**
 * CelestialOrbitCalculator - Pure physics calculations for celestial body orbits
 * Routes to appropriate calculation method based on data availability
 */
export class CelestialOrbitCalculator {
    constructor(stateCalculator, hierarchy) {
        this.stateCalculator = stateCalculator;
        this.hierarchy = hierarchy;
    }

    /**
     * Calculate orbit points for a celestial body
     * Routes to appropriate method based on data availability
     */
    calculateOrbitPoints(orbit, currentTime) {
        const { bodyId } = orbit;

        // Determine calculation method based on available data
        const dataSource = this.getDataSourceType(bodyId);


        switch (dataSource) {
            case 'astronomy_engine':
                return this.calculateAstronomyEngineOrbit(orbit, currentTime);

            case 'orbital_elements':
                return this.calculateOrbitalElementsOrbit(orbit, currentTime);

            case 'special_emb':
                return this.calculateSpecialEMBOrbit(orbit, currentTime);

            case 'physics_fallback':
                return this.calculatePhysicsFallbackOrbit(orbit, currentTime);

            case 'skip_orbit':
                // Return empty array to skip orbit rendering
                return [];

            default:
                console.warn(`[CelestialOrbitCalculator] Unknown data source for body ${bodyId}`);
                return [];
        }
    }

    /**
     * Determine data source type for a body
     */
    getDataSourceType(bodyId) {
        const bodyConfig = this.stateCalculator._getFullBodyConfig?.(bodyId);


        // Check for special handling flags in config
        if (bodyConfig?.orbitVisualization?.useSpecialEMBHandling) {
            return 'special_emb';
        }

        // Check if body has orbital elements
        const orbitalElements = bodyConfig?.orbitalElements || bodyConfig?.canonical_orbit;
        if (orbitalElements) {
            // Check if orbital elements are valid (not all zeros)
            const hasValidElements = orbitalElements.semiMajorAxis > 0 ||
                orbitalElements.a > 0;

            if (hasValidElements) {
                return 'orbital_elements';
            } else {
                // For dwarf planets with zero orbital elements, they're at barycenter center
                // and shouldn't have orbits rendered
                if (bodyConfig?.isDwarf || bodyConfig?.type === 'dwarf_planet') {
                    return 'skip_orbit';
                }
                console.warn(`[CelestialOrbitCalculator] Body ${bodyId} has orbital elements but they appear to be invalid (all zeros)`);
            }
        }

        // Check if this body should actually have an orbit rendered
        // Major planets without orbital elements shouldn't show tiny relative motions
        if (bodyConfig?.type === 'planet' && !bodyConfig?.orbitVisualization?.useSpecialEMBHandling) {
            // Planets without special handling or orbital elements shouldn't have orbits
            return 'skip_orbit';
        }

        // Check if Astronomy Engine has data for this body (from config)
        if (bodyConfig?.astronomyEngineName || this.hasAstronomyEngineData(bodyConfig)) {
            return 'astronomy_engine';
        }

        // Fallback to physics-based calculation
        return 'physics_fallback';
    }


    /**
     * Check if Astronomy Engine has data for this body (data-driven)
     */
    hasAstronomyEngineData(bodyConfig) {
        if (!bodyConfig) return false;

        // Check if config explicitly defines astronomy engine support
        return !!(bodyConfig.astronomyEngineName ||
            bodyConfig.useAstronomyEngine ||
            bodyConfig.astronomyEngineSupported);
    }

    /**
     * Calculate orbit using Astronomy Engine data
     */
    calculateAstronomyEngineOrbit(orbit, currentTime) {
        const { bodyId, parentId } = orbit;
        const timeRange = orbit.getTimeRange(currentTime);
        const numPoints = orbit.getNumPoints();
        const dt = timeRange.duration / numPoints;

        const points = [];

        for (let i = 0; i <= numPoints; i++) {
            const t = new Date(timeRange.start.getTime() + i * dt * 1000);

            try {
                const bodyState = this.stateCalculator.calculateStateVector(bodyId, t);
                const parentState = parentId !== 0 ?
                    this.stateCalculator.calculateStateVector(parentId, t) : null;

                if (bodyState && bodyState.position) {
                    const point = new THREE.Vector3(...bodyState.position);

                    // Subtract parent position for relative coordinates
                    if (parentState && parentState.position) {
                        point.sub(new THREE.Vector3(...parentState.position));
                    }

                    points.push(point);
                }
            } catch (error) {
                console.warn(`[CelestialOrbitCalculator] Failed to calculate Astronomy Engine point for body ${bodyId}:`, error);
                continue;
            }
        }

        // Filter out any NaN points before returning
        const validPoints = points.filter(point => {
            const isValid = !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z);
            if (!isValid) {
                console.error(`[CelestialOrbitCalculator] Filtered out NaN point in astronomy engine orbit for body ${bodyId}:`, point);
            }
            return isValid;
        });

        return validPoints;
    }

    /**
     * Calculate orbit using orbital elements
     */
    calculateOrbitalElementsOrbit(orbit) {
        const { bodyId, parentId } = orbit;
        const bodyConfig = this.stateCalculator._getFullBodyConfig?.(bodyId);
        const orbitalElements = bodyConfig?.orbitalElements || bodyConfig?.canonical_orbit;

        if (!orbitalElements) {
            console.warn(`[CelestialOrbitCalculator] No orbital elements found for body ${bodyId}`);
            return [];
        }

        // Determine orbital period
        let periodSeconds;
        if (bodyConfig.orbitalPeriod) {
            periodSeconds = bodyConfig.orbitalPeriod;
        } else if (orbitalElements.a || orbitalElements.semiMajorAxis) {
            const a = orbitalElements.a || orbitalElements.semiMajorAxis;
            const parentConfig = this.stateCalculator._getFullBodyConfig?.(parentId);

            if (parentConfig) {
                try {
                    periodSeconds = Orbital.calculatePeriodFromSMA(a, parentConfig);
                } catch (error) {
                    console.warn(`[CelestialOrbitCalculator] Could not calculate period for ${bodyId}:`, error);
                    periodSeconds = 24 * 3600; // Default to 1 day
                }
            } else {
                periodSeconds = 24 * 3600;
            }
        } else {
            periodSeconds = 24 * 3600;
        }

        // Update orbit period
        orbit.period = periodSeconds;
        orbit.semiMajorAxis = orbitalElements.a || orbitalElements.semiMajorAxis;
        orbit.eccentricity = orbitalElements.e || orbitalElements.eccentricity;
        orbit.inclination = orbitalElements.i || orbitalElements.inclination;

        const numPoints = orbit.getNumPoints();
        const dt = periodSeconds / numPoints;

        const points = [];

        // Generate orbit points directly from orbital elements using Kepler's laws
        for (let i = 0; i <= numPoints; i++) {
            const meanAnomaly = (2 * Math.PI * i) / numPoints; // 0 to 2π

            try {
                // Calculate eccentric anomaly from mean anomaly (Newton-Raphson method)
                let E = meanAnomaly; // Initial guess
                for (let iter = 0; iter < 10; iter++) {
                    const dE = (E - orbitalElements.eccentricity * Math.sin(E) - meanAnomaly) / 
                              (1 - orbitalElements.eccentricity * Math.cos(E));
                    E -= dE;
                    if (Math.abs(dE) < 1e-8) break;
                }

                // Calculate true anomaly
                const trueAnomaly = 2 * Math.atan2(
                    Math.sqrt(1 + orbitalElements.eccentricity) * Math.sin(E / 2),
                    Math.sqrt(1 - orbitalElements.eccentricity) * Math.cos(E / 2)
                );

                // Calculate distance from focus
                const r = orbitalElements.semiMajorAxis * (1 - orbitalElements.eccentricity * Math.cos(E));

                // Position in orbital plane
                const x_orb = r * Math.cos(trueAnomaly);
                const y_orb = r * Math.sin(trueAnomaly);
                const z_orb = 0;

                // Convert angles to radians
                const i = (orbitalElements.inclination || 0) * Math.PI / 180;
                const omega = (orbitalElements.longitudeOfAscendingNode || 0) * Math.PI / 180;
                const w = (orbitalElements.argumentOfPeriapsis || 0) * Math.PI / 180;

                // Rotation matrices for orbital elements
                const cos_omega = Math.cos(omega);
                const sin_omega = Math.sin(omega);
                const cos_i = Math.cos(i);
                const sin_i = Math.sin(i);
                const cos_w = Math.cos(w);
                const sin_w = Math.sin(w);

                // Transform to 3D space (J2000 ecliptic coordinates)
                const x = (cos_omega * cos_w - sin_omega * sin_w * cos_i) * x_orb +
                         (-cos_omega * sin_w - sin_omega * cos_w * cos_i) * y_orb;

                const y = (sin_omega * cos_w + cos_omega * sin_w * cos_i) * x_orb +
                         (-sin_omega * sin_w + cos_omega * cos_w * cos_i) * y_orb;

                const z = (sin_w * sin_i) * x_orb + (cos_w * sin_i) * y_orb;

                const point = new THREE.Vector3(x, y, z);
                points.push(point);

            } catch (error) {
                console.warn(`[CelestialOrbitCalculator] Failed to calculate orbital elements point for body ${bodyId}:`, error);
                continue;
            }
        }

        // Filter out any NaN points before returning
        const validPoints = points.filter(point => {
            const isValid = !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z);
            if (!isValid) {
                console.error(`[CelestialOrbitCalculator] Filtered out NaN point in orbital elements orbit for body ${bodyId}:`, point);
            }
            return isValid;
        });


        return validPoints;
    }

    /**
     * Calculate orbit using special EMB handling
     */
    calculateSpecialEMBOrbit(orbit, currentTime) {
        const { bodyId } = orbit;
        const bodyConfig = this.stateCalculator._getFullBodyConfig?.(bodyId);
        const orbitalElements = bodyConfig?.orbitalElements || bodyConfig?.canonical_orbit;

        if (!orbitalElements) {
            console.warn(`[CelestialOrbitCalculator] No orbital elements found for special handling body ${bodyId}`);
            return [];
        }

        // Use the orbital elements period from config
        const periodSeconds = orbitalElements.period || bodyConfig.orbitalPeriod || (24 * 3600);
        orbit.period = periodSeconds;

        const numPoints = orbit.getNumPoints();
        const dt = periodSeconds / numPoints;

        const points = [];

        for (let i = 0; i <= numPoints; i++) {
            const t = new Date(currentTime.getTime() + (i - numPoints / 2) * dt * 1000);

            try {
                const state = this.stateCalculator.calculateStateVector(bodyId, t);

                if (state && state.position) {
                    // For special handling, state vector is already in relative coordinates
                    // No need to subtract parent position
                    const point = new THREE.Vector3(...state.position);
                    points.push(point);
                }
            } catch (error) {
                console.warn(`[CelestialOrbitCalculator] Failed to calculate special handling point for body ${bodyId}:`, error);
                continue;
            }
        }

        // Filter out any NaN points before returning
        const validPoints = points.filter(point => {
            const isValid = !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z);
            if (!isValid) {
                console.error(`[CelestialOrbitCalculator] Filtered out NaN point in special EMB orbit for body ${bodyId}:`, point);
            }
            return isValid;
        });

        return validPoints;
    }

    /**
     * Calculate orbit using physics fallback method
     */
    calculatePhysicsFallbackOrbit() {
        // This would use the existing physics-based calculation from OrbitCalculator
        // For now, return empty array
        // console.warn(`[CelestialOrbitCalculator] Physics fallback not yet implemented for body ${orbit.bodyId}`);
        return [];
    }
}