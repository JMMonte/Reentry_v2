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
     * Calculate single orbital position from elements at given time
     * This method should be used by BOTH orbit visualization AND moon positioning
     * @param {Object} orbitalElements - Orbital element parameters
     * @param {number} meanAnomaly - Mean anomaly in radians (0 to 2π)
     * @param {Object} bodyConfig - Body configuration for reference frame
     * @returns {THREE.Vector3} - Position vector
     */
    calculatePositionFromOrbitalElements(orbitalElements, meanAnomaly, bodyConfig = null) {
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

            // Check reference frame for coordinate system
            const referenceFrame = orbitalElements.referenceFrame || bodyConfig?.referenceFrame;
            
            // Calculate position in J2000 ecliptic coordinates first (standard orbital mechanics)
            const x_ecl = (cos_omega * cos_w - sin_omega * sin_w * cos_i) * x_orb +
                         (-cos_omega * sin_w - sin_omega * cos_w * cos_i) * y_orb;

            const y_ecl = (sin_omega * cos_w + cos_omega * sin_w * cos_i) * x_orb +
                         (-sin_omega * sin_w + cos_omega * cos_w * cos_i) * y_orb;

            const z_ecl = (sin_w * sin_i) * x_orb + (cos_w * sin_i) * y_orb;

            // Check if we need to transform to planetary equatorial frame
            if (referenceFrame && referenceFrame.toLowerCase().includes('equatorial')) {
                // Extract planet name from reference frame (e.g., "saturn_equatorial" -> "saturn")
                const planetName = referenceFrame.toLowerCase().replace('_equatorial', '');
                
                // Get planet's orientation to transform from ecliptic to equatorial frame
                const planetConfig = this._getPlanetConfig(planetName);
                if (planetConfig && planetConfig.poleRA !== undefined && planetConfig.poleDec !== undefined) {
                    // Calculate transformation from ecliptic to planet's equatorial frame
                    const eclipticVector = new THREE.Vector3(x_ecl, y_ecl, z_ecl);
                    const equatorialVector = this._transformEclipticToEquatorial(eclipticVector, planetConfig);
                    return equatorialVector;
                }
                
                // Fallback: use ecliptic coordinates if planet config not found
                console.warn(`[CelestialOrbitCalculator] Could not find planet config for ${planetName}, using ecliptic coordinates`);
            }
            
            // Default: Return ecliptic coordinates
            return new THREE.Vector3(x_ecl, y_ecl, z_ecl);

        } catch (error) {
            console.warn(`[CelestialOrbitCalculator] Failed to calculate position from orbital elements:`, error);
            return new THREE.Vector3(0, 0, 0);
        }
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

        const points = [];

        // Generate orbit points using shared positioning algorithm
        for (let i = 0; i <= numPoints; i++) {
            const meanAnomaly = (2 * Math.PI * i) / numPoints; // 0 to 2π
            
            // Use shared positioning method to ensure consistency with moon positioning
            const point = this.calculatePositionFromOrbitalElements(orbitalElements, meanAnomaly, bodyConfig);
            
            if (point && !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z)) {
                points.push(point);
            } else {
                console.warn(`[CelestialOrbitCalculator] Invalid point calculated for body ${bodyId} at mean anomaly ${meanAnomaly}`);
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

    /**
     * Find the dominant planet in a barycenter system by name
     * @param {number} barycenterNaifId - NAIF ID of the barycenter
     * @param {string} planetName - Name of the planet to find (e.g., "saturn", "pluto")
     * @returns {Object|null} - The celestial body object with targetOrientation, or null
     */
    _findDominantPlanet(barycenterNaifId, planetName) {
        // Access celestial bodies from the app context through stateCalculator
        const app = this.stateCalculator.app || 
                   this.stateCalculator.hierarchy?.app || 
                   window.app3d; // Fallback to global app
        
        if (!app || !app.celestialBodies) {
            console.warn(`[CelestialOrbitCalculator] Cannot find app or celestialBodies for planet ${planetName}`);
            return null;
        }
        
        // Find the planet by name in the celestial bodies
        const planet = app.celestialBodies.find(body => 
            body.name && body.name.toLowerCase() === planetName.toLowerCase()
        );
        
        if (!planet) {
            console.warn(`[CelestialOrbitCalculator] Cannot find planet ${planetName} in celestial bodies`);
            return null;
        }
        
        return planet;
    }

    /**
     * Extract static pole orientation from planet configuration
     * Creates a time-independent quaternion based only on pole RA/Dec
     * @param {Object} planet - Planet object (unused, kept for compatibility)
     * @param {string} planetName - Name of the planet for config lookup
     * @returns {THREE.Quaternion} - Static pole orientation quaternion
     */
    _extractPoleOrientationOnly(planet, planetName) {
        // Get planet configuration for pole coordinates
        const planetConfig = this._getPlanetConfig(planetName);
        
        if (!planetConfig) {
            console.warn(`[CelestialOrbitCalculator] No configuration found for planet ${planetName}, using identity quaternion`);
            return new THREE.Quaternion(); // Identity quaternion
        }

        // Check for pole coordinates (either as numbers or as undefined)
        const poleRA = planetConfig.poleRA;
        const poleDec = planetConfig.poleDec;
        
        if (poleRA === undefined || poleDec === undefined || 
            typeof poleRA !== 'number' || typeof poleDec !== 'number') {
            console.warn(`[CelestialOrbitCalculator] No valid pole coordinates found for planet ${planetName} (poleRA: ${poleRA}, poleDec: ${poleDec}), using identity quaternion`);
            return new THREE.Quaternion(); // Identity quaternion
        }

        // CRITICAL: Use STATIC pole coordinates from config, not live planet orientation
        // This ensures moon orbits don't rotate with planet's daily spin
        
        // Calculate pole-only orientation from STATIC RA/Dec coordinates
        const poleRArad = poleRA * Math.PI / 180; // Convert to radians
        const poleDecRad = poleDec * Math.PI / 180; // Convert to radians

        // Convert pole RA/Dec to Cartesian coordinates (J2000 equatorial frame)
        const poleX = Math.cos(poleDecRad) * Math.cos(poleRArad);
        const poleY = Math.cos(poleDecRad) * Math.sin(poleRArad);
        const poleZ = Math.sin(poleDecRad);
        const poleVector = new THREE.Vector3(poleX, poleY, poleZ);

        // Apply J2000 equatorial to ecliptic transformation (23.44° rotation around X-axis)
        const obliquity = 23.43929111 * Math.PI / 180;
        const equatorialToEcliptic = new THREE.Quaternion();
        equatorialToEcliptic.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -obliquity);
        poleVector.applyQuaternion(equatorialToEcliptic);

        // Create quaternion that aligns Z-axis with the pole vector
        const zAxis = new THREE.Vector3(0, 0, 1);
        const poleOnlyQuaternion = new THREE.Quaternion();
        poleOnlyQuaternion.setFromUnitVectors(zAxis, poleVector.normalize());

        console.log(`[CelestialOrbitCalculator] Created STATIC pole orientation for ${planetName}: RA=${poleRA}°, Dec=${poleDec}°`);
        return poleOnlyQuaternion;
    }

    /**
     * Transform coordinates from J2000 ecliptic to planetary equatorial reference frame
     * This aligns moon orbits with their planet's equatorial plane
     * @param {THREE.Vector3} eclipticVector - Position in J2000 ecliptic coordinates
     * @param {Object} planetConfig - Planet configuration with pole coordinates
     * @returns {THREE.Vector3} - Position in planetary equatorial coordinates
     */
    _transformEclipticToEquatorial(eclipticVector, planetConfig) {
        // Calculate planet's pole orientation from RA/Dec
        const poleRA = planetConfig.poleRA * Math.PI / 180; // Convert to radians
        const poleDec = planetConfig.poleDec * Math.PI / 180; // Convert to radians

        // Convert pole RA/Dec to Cartesian coordinates (J2000 equatorial frame)
        const poleX = Math.cos(poleDec) * Math.cos(poleRA);
        const poleY = Math.cos(poleDec) * Math.sin(poleRA);
        const poleZ = Math.sin(poleDec);
        const poleVector = new THREE.Vector3(poleX, poleY, poleZ);

        // Apply J2000 equatorial to ecliptic transformation to get pole in ecliptic frame
        const obliquity = 23.43929111 * Math.PI / 180;
        const equatorialToEcliptic = new THREE.Quaternion();
        equatorialToEcliptic.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -obliquity);
        poleVector.applyQuaternion(equatorialToEcliptic);

        // Create transformation from ecliptic to planetary equatorial frame
        // The planet's Z-axis points along its north pole
        const planetZ = poleVector.clone().normalize();
        
        // Create an arbitrary X-axis perpendicular to the pole
        // Use ecliptic X-axis as reference, project onto plane perpendicular to pole
        const eclipticX = new THREE.Vector3(1, 0, 0);
        const planetX = eclipticX.clone().sub(planetZ.clone().multiplyScalar(eclipticX.dot(planetZ))).normalize();
        
        // Y-axis completes the right-handed system: Y = Z × X
        const planetY = new THREE.Vector3().crossVectors(planetZ, planetX);

        // Create rotation matrix from ecliptic to planetary equatorial frame
        const transformMatrix = new THREE.Matrix3();
        transformMatrix.set(
            planetX.x, planetY.x, planetZ.x,
            planetX.y, planetY.y, planetZ.y,
            planetX.z, planetY.z, planetZ.z
        );

        // Apply transformation
        const equatorialVector = eclipticVector.clone();
        equatorialVector.applyMatrix3(transformMatrix);

        return equatorialVector;
    }

    /**
     * Get planet configuration by name
     * @param {string} planetName - Name of the planet
     * @returns {Object|null} - Planet configuration or null
     */
    _getPlanetConfig(planetName) {
        // Use the StateVectorCalculator's existing bodiesConfigMap
        if (this.stateCalculator.bodiesConfigMap) {
            for (const [config] of this.stateCalculator.bodiesConfigMap) {
                if (config.name && config.name.toLowerCase() === planetName.toLowerCase()) {
                    return config;
                }
            }
        }

        // Fallback: try to get from _getFullBodyConfig by searching for the planet
        // First find the planet's NAIF ID by searching through known planet IDs
        const knownPlanetIds = [10, 199, 299, 399, 499, 599, 699, 799, 899, 999]; // Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto
        
        for (const naifId of knownPlanetIds) {
            const config = this.stateCalculator._getFullBodyConfig?.(naifId);
            if (config && config.name && config.name.toLowerCase() === planetName.toLowerCase()) {
                return config;
            }
        }

        // Final fallback: check barycenter configurations (which often have pole coordinates)
        const barycenters = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // Planet barycenter NAIF IDs
        for (const naifId of barycenters) {
            const config = this.stateCalculator._getFullBodyConfig?.(naifId);
            if (config && config.name && config.name.toLowerCase().includes(planetName.toLowerCase())) {
                return config;
            }
        }

        console.warn(`[CelestialOrbitCalculator] Could not find config for planet ${planetName}`);
        return null;
    }
}