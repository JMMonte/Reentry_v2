import * as Astronomy from 'astronomy-engine';
import { OrbitPropagator, dateToJd } from './OrbitPropagator.js';
import { planetaryDataManager } from './bodies/PlanetaryDataManager.js';

// Extract the functions we need from the Astronomy module
const { Body, BaryState, MakeTime, Rotation_EQJ_ECL, RotateVector, GeoMoon } = Astronomy;

/**
 * State Vector Calculator - Simplified Version
 * 
 * Handles orbital mechanics calculations using Astronomy Engine.
 * Removed over-engineering and unused fallback methods.
 */
export class StateVectorCalculator {
    constructor(hierarchy, bodiesConfigMap = null) {
        this.hierarchy = hierarchy;
        this.bodiesConfigMap = bodiesConfigMap;
        this.AU_TO_KM = 149597870.7;
        this.DAYS_TO_SEC = 86400;

        // Constants for Earth-Moon mass calculations
        this.MOON_MASS = 7.342e22; // kg
        this.EARTH_MASS = 5.972e24; // kg

        // Initialize planetary data manager
        this._initializePlanetaryData();
    }

    /**
     * Initialize planetary data manager
     */
    async _initializePlanetaryData() {
        try {
            await planetaryDataManager.initialize();
        } catch (error) {
            console.warn('Failed to initialize planetary data manager:', error);
        }
    }

    /**
     * Get full body configuration including orbital elements
     */
    _getFullBodyConfig(naifId) {
        // First try the provided bodiesConfigMap
        if (this.bodiesConfigMap) {
            const config = this.bodiesConfigMap.get(naifId);
            if (config) return config;
        }

        // Fallback to planetaryDataManager
        return planetaryDataManager.getBodyByNaif(naifId);
    }

    /**
     * Calculate state vector for any body at a given time
     * Returns position and velocity relative to the appropriate reference frame
     */
    calculateStateVector(naifId, time) {
        const bodyInfo = this.hierarchy.getBodyInfo(naifId);
        if (!bodyInfo) {
            console.warn(`No hierarchy info found for NAIF ID ${naifId}`);
            return null;
        }

        // Handle SSB - always at origin
        if (naifId === 0) {
            return { position: [0, 0, 0], velocity: [0, 0, 0] };
        }

        // Handle Sun - always at origin in heliocentric system
        if (naifId === 10) {
            return { position: [0, 0, 0], velocity: [0, 0, 0] };
        }

        // Handle barycenters - these get SSB coordinates from Astronomy Engine
        if (bodyInfo.type === 'barycenter') {
            const astronomyName = this._getAstronomyEngineName(bodyInfo.name);
            if (astronomyName) {
                let baryState = this._getBarycentricState(astronomyName, time);
                const isZero = baryState && baryState.position.every(v => v === 0);
                if ((baryState == null || isZero) && astronomyName !== 'EMB' && naifId !== 0) {
                    // Fallback: use planet's state if barycenter state is missing
                    baryState = this._getAstronomyEngineState(astronomyName, time);
                    // Final fallback: use canonical orbital elements if available
                    const fullBodyConfig = this._getFullBodyConfig(naifId);
                    const orbitalElements = fullBodyConfig?.orbitalElements || fullBodyConfig?.canonical_orbit;
                    if ((baryState == null || (baryState.position && baryState.position.every(v => v === 0))) && orbitalElements) {
                        return this._calculateFromOrbitalElements(naifId, time, orbitalElements);
                    }
                }
                return baryState;
            }
        }

        // Special handling for Earth and Moon: always use Astronomy Engine for highest accuracy
        if (naifId === 399) return this._calculateEarthState(time);
        if (naifId === 301) return this._calculateMoonState(time);

        // Special handling for Galilean moons: always use Astronomy Engine for highest accuracy
        if ([501, 502, 503, 504].includes(naifId)) {
            return this._calculateGalileanMoonState(naifId, time);
        }

        // For all other bodies: determine their position relative to their parent
        const parentId = this.hierarchy.getParent(naifId);
        const parentInfo = this.hierarchy.getBodyInfo(parentId);

        if (!parentInfo) {
            console.warn(`No parent info found for ${bodyInfo.name} (NAIF ${naifId})`);
            return null;
        }

        // CRITICAL: Planets should NEVER get SSB coordinates!
        // They should always be positioned relative to their barycenter
        if (bodyInfo.type === 'planet' || bodyInfo.type === 'dwarf_planet') {
            if (parentInfo.type === 'barycenter') {
                // Check if this is a multi-body system (like Earth-Moon or Pluto-Charon)
                if (this._isMultiBodySystem(naifId, parentId)) {
                    // Multi-body system: planet has orbital elements relative to barycenter
                    const fullBodyConfig = this._getFullBodyConfig(naifId);
                    const orbitalElements = fullBodyConfig?.orbitalElements || fullBodyConfig?.canonical_orbit;
                    if (orbitalElements) {

                        return this._calculateFromOrbitalElements(naifId, time, orbitalElements);
                    } else {
                        console.warn(`No orbital elements for multi-body planet ${bodyInfo.name} (NAIF ${naifId})`);
                        return { position: [0, 0, 0], velocity: [0, 0, 0] };
                    }
                } else {
                    // Single-planet system: planet is at barycenter center (0,0,0 relative to barycenter)

                    return { position: [0, 0, 0], velocity: [0, 0, 0] };
                }
            } else {
                console.warn(`Planet ${bodyInfo.name} has non-barycenter parent ${parentInfo.name} - this is unusual`);
                return null;
            }
        }

        // For moons and other bodies: use orbital elements relative to their parent
        if (bodyInfo.type === 'moon' || bodyInfo.type === 'asteroid') {
            const fullBodyConfig = this._getFullBodyConfig(naifId);
            const orbitalElements = fullBodyConfig?.orbitalElements || fullBodyConfig?.canonical_orbit;
            if (orbitalElements) {

                return this._calculateFromOrbitalElements(naifId, time, orbitalElements);
            } else {
                console.warn(`No orbital elements for ${bodyInfo.type} ${bodyInfo.name} (NAIF ${naifId})`);
                return { position: [0, 0, 0], velocity: [0, 0, 0] };
            }
        }

        // Fallback for unknown body types
        console.warn(`Unknown body type for ${bodyInfo.name} (NAIF ${naifId}, type: ${bodyInfo.type})`);
        return null;
    }

    /**
     * Calculate state vector from orbital elements (procedural approach)
     * Handles coordinate frame transformation if needed
     */
    _calculateFromOrbitalElements(naifId, time, orbitalElements) {
        try {
            const parentId = this.hierarchy.getParent(naifId);
            const parentFullConfig = this._getFullBodyConfig(parentId);

            // Calculate GM for the parent body
            let GM = parentFullConfig?.GM;
            if (!GM && parentFullConfig?.mass) {
                // Fallback: calculate GM from mass
                GM = 6.67430e-20 * parentFullConfig.mass; // Convert to km³/s²
            }

            if (!GM) {
                console.warn(`No GM found for parent ${parentId} of body ${naifId}`);
                return null;
            }

            const propagator = new OrbitPropagator();
            const jd = dateToJd(time);

            // Prepare orbital elements with proper epoch
            const elementsWithEpoch = {
                a: orbitalElements.semiMajorAxis || orbitalElements.a,
                e: orbitalElements.eccentricity || orbitalElements.e,
                i: orbitalElements.inclination || orbitalElements.i,
                Omega: orbitalElements.longitudeOfAscendingNode || orbitalElements.Omega,
                omega: orbitalElements.argumentOfPeriapsis || orbitalElements.omega,
                M0: orbitalElements.meanAnomalyAtEpoch || orbitalElements.M0,
                epoch: orbitalElements.epoch || 2451545.0 // J2000.0 as default
            };

            // Calculate state vector
            const state = propagator.orbitalElementsToStateVector(elementsWithEpoch, jd, GM);

            // Check if coordinate transformation is needed
            const bodyConfig = this._getFullBodyConfig(naifId);
            const referenceFrame = orbitalElements.referenceFrame || bodyConfig?.referenceFrame;

            // Handle coordinate frame transformations
            if (referenceFrame) {
                if (referenceFrame.toLowerCase().includes('equatorial')) {
                    // DO NOT transform! Just return the state as-is.
                    return {
                        position: [state.position.x, state.position.y, state.position.z],
                        velocity: [state.velocity.x, state.velocity.y, state.velocity.z]
                    };
                }
                // For 'equatorial_J2000' and other standard frames, no transformation needed
                // These are already in the coordinate system expected by Three.js equatorialGroup
            }

            // Default: assume elements are already in the correct coordinate system
            return {
                position: [state.position.x, state.position.y, state.position.z],
                velocity: [state.velocity.x, state.velocity.y, state.velocity.z]
            };

        } catch (error) {
            console.warn(`Failed to calculate state from orbital elements for NAIF ${naifId}:`, error);
            return null;
        }
    }

    /**
     * Transform coordinates from planetary equatorial to ecliptic reference frame
     * Generic method that works for any planet
     */
    _transformPlanetaryEquatorialToEcliptic(parentNaifId, position, velocity) {
        try {
            // For barycenter parents, need to find the actual planet with orientation data
            let planetConfig = null;

            // Find the planet that shares the same parent as this barycenter
            // or find the planet that has this barycenter as parent
            const barycenterBody = planetaryDataManager.getBodyByNaif(parentNaifId);
            if (barycenterBody) {
                // Look for a planet or dwarf_planet that has this barycenter as parent
                const planets = planetaryDataManager.getBodiesByType('planet');
                const dwarfPlanets = planetaryDataManager.getBodiesByType('dwarf_planet');
                const allPlanets = [...planets, ...dwarfPlanets];
                const planet = allPlanets.find(p => p.parent === barycenterBody.name);
                if (planet) {
                    planetConfig = planet;
                }
            }

            // Fallback: try to get the planet config directly if parentNaifId is already a planet
            if (!planetConfig) {
                planetConfig = planetaryDataManager.getBodyByNaif(parentNaifId);
            }

            if (planetConfig?.poleRA !== undefined && planetConfig?.poleDec !== undefined) {


                // For Three.js equatorialGroup, we want to keep coordinates in the planet's equatorial system
                // The equatorialGroup is already rotated to align the planet's equator with the ecliptic
                // So we should NOT transform the moon coordinates - they should stay in planetary equatorial
                return { position, velocity };
            }

            console.warn(`No orientation data found for planet NAIF ${parentNaifId}, returning unchanged coordinates`);
            return { position, velocity };

        } catch (error) {
            console.warn(`Failed to transform planetary equatorial to ecliptic for parent ${parentNaifId}:`, error);
            return { position, velocity };
        }
    }

    /**
     * Calculate Earth's state in the Earth-Moon system
     * Returns position relative to EMB (not absolute)
     */
    _calculateEarthState(time) {
        try {
            const moonGeo = GeoMoon(MakeTime(time));
            if (!moonGeo) return null;

            // Transform Moon position to ECLIPJ2000
            const moonGeoEQJ = {
                x: moonGeo.x * this.AU_TO_KM,
                y: moonGeo.y * this.AU_TO_KM,
                z: moonGeo.z * this.AU_TO_KM,
                t: MakeTime(time)
            };
            const rotMatrix = Rotation_EQJ_ECL();
            const moonGeoECL = RotateVector(rotMatrix, moonGeoEQJ);

            // Calculate mass ratio
            const MOON_MASS_RATIO = this.MOON_MASS / (this.EARTH_MASS + this.MOON_MASS);

            // Calculate velocity using finite differences
            const dt = 60; // seconds
            const futureTime = new Date(time.getTime() + dt * 1000);
            const futureMoonGeo = GeoMoon(MakeTime(futureTime));

            if (futureMoonGeo) {
                const futureMoonGeoEQJ = {
                    x: futureMoonGeo.x * this.AU_TO_KM,
                    y: futureMoonGeo.y * this.AU_TO_KM,
                    z: futureMoonGeo.z * this.AU_TO_KM,
                    t: MakeTime(futureTime)
                };
                const futureMoonGeoECL = RotateVector(rotMatrix, futureMoonGeoEQJ);

                const earthVelX = -(MOON_MASS_RATIO * (futureMoonGeoECL.x - moonGeoECL.x)) / dt;
                const earthVelY = -(MOON_MASS_RATIO * (futureMoonGeoECL.y - moonGeoECL.y)) / dt;
                const earthVelZ = -(MOON_MASS_RATIO * (futureMoonGeoECL.z - moonGeoECL.z)) / dt;

                // Return RELATIVE position (no EMB offset added)
                return {
                    position: [
                        -(MOON_MASS_RATIO * moonGeoECL.x),
                        -(MOON_MASS_RATIO * moonGeoECL.y),
                        -(MOON_MASS_RATIO * moonGeoECL.z)
                    ],
                    velocity: [earthVelX, earthVelY, earthVelZ]
                };
            }
        } catch (error) {
            console.warn('Failed to calculate Earth state:', error);
        }
        return null;
    }

    /**
     * Calculate Moon's state in the Earth-Moon system
     * Returns position relative to EMB (not absolute)
     */
    _calculateMoonState(time) {
        try {
            const moonGeo = GeoMoon(MakeTime(time));
            if (!moonGeo) return null;

            // Transform Moon position to ECLIPJ2000
            const moonGeoEQJ = {
                x: moonGeo.x * this.AU_TO_KM,
                y: moonGeo.y * this.AU_TO_KM,
                z: moonGeo.z * this.AU_TO_KM,
                t: MakeTime(time)
            };
            const rotMatrix = Rotation_EQJ_ECL();
            const moonGeoECL = RotateVector(rotMatrix, moonGeoEQJ);

            // Calculate mass ratio
            const EARTH_MASS_RATIO = this.EARTH_MASS / (this.EARTH_MASS + this.MOON_MASS);

            // Calculate velocity using finite differences
            const dt = 60; // seconds
            const futureTime = new Date(time.getTime() + dt * 1000);
            const futureMoonGeo = GeoMoon(MakeTime(futureTime));

            if (futureMoonGeo) {
                const futureMoonGeoEQJ = {
                    x: futureMoonGeo.x * this.AU_TO_KM,
                    y: futureMoonGeo.y * this.AU_TO_KM,
                    z: futureMoonGeo.z * this.AU_TO_KM,
                    t: MakeTime(futureTime)
                };
                const futureMoonGeoECL = RotateVector(rotMatrix, futureMoonGeoEQJ);

                const moonVelX = (EARTH_MASS_RATIO * (futureMoonGeoECL.x - moonGeoECL.x)) / dt;
                const moonVelY = (EARTH_MASS_RATIO * (futureMoonGeoECL.y - moonGeoECL.y)) / dt;
                const moonVelZ = (EARTH_MASS_RATIO * (futureMoonGeoECL.z - moonGeoECL.z)) / dt;

                // Return RELATIVE position (no EMB offset added)
                return {
                    position: [
                        EARTH_MASS_RATIO * moonGeoECL.x,
                        EARTH_MASS_RATIO * moonGeoECL.y,
                        EARTH_MASS_RATIO * moonGeoECL.z
                    ],
                    velocity: [moonVelX, moonVelY, moonVelZ]
                };
            }
        } catch (error) {
            console.warn('Failed to calculate Moon state:', error);
        }
        return null;
    }

    /**
     * Calculate Galilean moon state using Astronomy Engine
     * Returns position relative to Jupiter's barycenter (not absolute)
     */
    _calculateGalileanMoonState(naifId, time) {
        try {
            const astroTime = MakeTime(time);
            const jupiterMoons = Astronomy.JupiterMoons(astroTime);

            // Map NAIF ID to moon
            let stateVec;
            switch (naifId) {
                case 501: stateVec = jupiterMoons.io; break;
                case 502: stateVec = jupiterMoons.europa; break;
                case 503: stateVec = jupiterMoons.ganymede; break;
                case 504: stateVec = jupiterMoons.callisto; break;
                default: return null;
            }

            if (stateVec) {
                // Transform from J2000 equatorial (EQJ) to J2000 ecliptic (ECL)
                const rotMatrix = Rotation_EQJ_ECL();

                // Position transformation
                const eqjPos = {
                    x: stateVec.x * this.AU_TO_KM,
                    y: stateVec.y * this.AU_TO_KM,
                    z: stateVec.z * this.AU_TO_KM,
                    t: astroTime
                };
                const eclPos = RotateVector(rotMatrix, eqjPos);

                // Velocity transformation
                const eqjVel = {
                    x: stateVec.vx * this.AU_TO_KM / this.DAYS_TO_SEC,
                    y: stateVec.vy * this.AU_TO_KM / this.DAYS_TO_SEC,
                    z: stateVec.vz * this.AU_TO_KM / this.DAYS_TO_SEC,
                    t: astroTime
                };
                const eclVel = RotateVector(rotMatrix, eqjVel);

                // Return RELATIVE position (relative to Jupiter's barycenter)
                return {
                    position: [eclPos.x, eclPos.y, eclPos.z],
                    velocity: [eclVel.x, eclVel.y, eclVel.z]
                };
            }
        } catch (error) {
            console.warn(`Failed to calculate Galilean moon state for NAIF ${naifId}:`, error);
        }
        return null;
    }

    /**
     * Get state using Astronomy Engine BaryState (for major bodies)
     */
    _getBarycentricState(bodyName, time) {
        try {
            if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
                time = new Date();
            }

            const astroTime = MakeTime(time);
            const baryState = BaryState(bodyName, astroTime);

            const eqjPosition = {
                x: baryState.x * this.AU_TO_KM,
                y: baryState.y * this.AU_TO_KM,
                z: baryState.z * this.AU_TO_KM,
                t: astroTime
            };

            const eqjVelocity = {
                x: baryState.vx * this.AU_TO_KM / this.DAYS_TO_SEC,
                y: baryState.vy * this.AU_TO_KM / this.DAYS_TO_SEC,
                z: baryState.vz * this.AU_TO_KM / this.DAYS_TO_SEC,
                t: astroTime
            };

            const rotationMatrix = Rotation_EQJ_ECL();
            const eclPosition = RotateVector(rotationMatrix, eqjPosition);
            const eclVelocity = RotateVector(rotationMatrix, eqjVelocity);

            return {
                position: [eclPosition.x, eclPosition.y, eclPosition.z],
                velocity: [eclVelocity.x, eclVelocity.y, eclVelocity.z]
            };
        } catch {
            return null;
        }
    }

    /**
     * Get state using Astronomy Engine Body function (with finite difference for velocity)
     */
    _getAstronomyEngineState(bodyName, time) {
        try {
            if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
                time = new Date();
            }

            const astroTime = MakeTime(time);
            const helioState = Body(bodyName, astroTime);

            const eqjPosition = {
                x: helioState.x * this.AU_TO_KM,
                y: helioState.y * this.AU_TO_KM,
                z: helioState.z * this.AU_TO_KM,
                t: astroTime
            };

            // Calculate velocity using finite differences
            const dt = 60; // 60 seconds
            const futureTime = new Date(time.getTime() + dt * 1000);
            const futureAstroTime = MakeTime(futureTime);
            const futureState = Body(bodyName, futureAstroTime);

            const eqjVelocity = {
                x: (futureState.x - helioState.x) * this.AU_TO_KM / dt,
                y: (futureState.y - helioState.y) * this.AU_TO_KM / dt,
                z: (futureState.z - helioState.z) * this.AU_TO_KM / dt,
                t: astroTime
            };

            const rotationMatrix = Rotation_EQJ_ECL();
            const eclPosition = RotateVector(rotationMatrix, eqjPosition);
            const eclVelocity = RotateVector(rotationMatrix, eqjVelocity);

            return {
                position: [eclPosition.x, eclPosition.y, eclPosition.z],
                velocity: [eclVelocity.x, eclVelocity.y, eclVelocity.z]
            };
        } catch {
            return null;
        }
    }

    /**
     * Get Astronomy Engine name for a body
     */
    _getAstronomyEngineName(bodyName) {
        // First try to get from body configuration
        const body = planetaryDataManager.getBodyByName(bodyName);
        if (body && body.astronomyEngineName) {
            return body.astronomyEngineName;
        }

        // Fallback to simple name mapping for common cases
        const nameMap = {
            'sun': 'Sun',
            'mercury': 'Mercury',
            'venus': 'Venus',
            'earth': 'Earth',
            'mars': 'Mars',
            'jupiter': 'Jupiter',
            'saturn': 'Saturn',
            'uranus': 'Uranus',
            'neptune': 'Neptune',
            'pluto': 'Pluto',
            'moon': 'Moon',
            'emb': 'EMB',
            'ss_barycenter': 'SSB',
            'solar_system_barycenter': 'SSB'
        };

        return nameMap[bodyName.toLowerCase()] || bodyName;
    }

    /**
     * Check if a system is a multi-body system where orbital mechanics apply
     * Returns true for systems like Earth-Moon, Pluto-Charon, etc.
     * Returns false for single-planet systems where planet = barycenter
     */
    _isMultiBodySystem(bodyId, parentId) {
        // Get the parent body (should be a barycenter)
        const parentBody = planetaryDataManager.getBodyByNaif(parentId);
        if (!parentBody || parentBody.type !== 'barycenter') {
            return false;
        }

        // Get all children of this barycenter
        const children = planetaryDataManager.getChildren(parentBody.name);

        // Special cases for known multi-body systems
        // These are systems where the barycenter is significantly displaced from the primary body
        const knownMultiBodySystems = [
            3, // Earth-Moon Barycenter (EMB)
            9  // Pluto System Barycenter (Pluto-Charon)
        ];

        if (knownMultiBodySystems.includes(parentId)) {
            // Check if this specific body is one of the children
            const body = planetaryDataManager.getBodyByNaif(bodyId);
            if (body && children.includes(body.name)) {
                return true;
            }
        }

        // For all other systems (Mars, Jupiter, Saturn, etc.), the planet is at barycenter center
        // Even though they have moons, the barycenter is essentially at the planet center
        // because the planet is so much more massive than the moons
        return false;
    }
} 