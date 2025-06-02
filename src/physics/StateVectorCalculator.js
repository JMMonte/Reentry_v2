import * as Astronomy from 'astronomy-engine';
import { OrbitalMechanics } from './core/OrbitalMechanics.js';
import { dateToJd } from '../utils/TimeUtils.js';
import { solarSystemDataManager } from './PlanetaryDataManager.js';
import { PhysicsConstants } from './core/PhysicsConstants.js';

// Extract the functions we need from the Astronomy module
const { Body, BaryState, MakeTime, Rotation_EQJ_ECL, RotateVector, GeoMoon } = Astronomy;

// NAIF ID constants
const NAIF_EARTH = 399;
const NAIF_MOON = 301;
const NAIF_EMB = 3;
const NAIF_PLUTO_BARY = 9;
const NAIF_GALILEAN_MOONS = [501, 502, 503, 504];

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
        this.AU_TO_KM = PhysicsConstants.PHYSICS.AU; // Astronomical unit in km
        this.DAYS_TO_SEC = PhysicsConstants.TIME.SECONDS_IN_DAY; // Seconds in a day
        this._debugEarthState = false; // Flag for detailed Earth state debugging
        this._orbitCalculator = null; // Will be set by orbit manager for shared positioning

        // Initialize planetary data manager
        this._initializePlanetaryData();
    }

    /**
     * Set the orbit calculator for shared positioning algorithms
     */
    setOrbitCalculator(orbitCalculator) {
        this._orbitCalculator = orbitCalculator;
    }

    /**
     * Enable or disable detailed Earth state debugging
     */
    setEarthStateDebug(enabled) {
        this._debugEarthState = enabled;
    }

    /**
     * Initialize planetary data manager
     */
    async _initializePlanetaryData() {
        try {
            await solarSystemDataManager.initialize();
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
            if (config) {
                return config;
            }
        }

        // Fallback to solarSystemDataManager
        const pmConfig = solarSystemDataManager.getBodyByNaif(naifId);
        return pmConfig;
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
        // But check if Earth has orbital elements and we want to use procedural orbit generation
        if (naifId === NAIF_EARTH) {
            const earthConfig = this._getFullBodyConfig(NAIF_EARTH);
            if (earthConfig?.orbitVisualization?.useSpecialEMBHandling && earthConfig?.orbitalElements) {
                // For orbit visualization, use the physics-based state calculation instead of orbital elements
                // This ensures consistent EMB-relative coordinates from Astronomy Engine
                return this._calculateEarthState(time);
            }
            return this._calculateEarthState(time);
        }
        if (naifId === NAIF_MOON) return this._calculateMoonState(time);

        // Special handling for Galilean moons: always use Astronomy Engine for highest accuracy
        if (NAIF_GALILEAN_MOONS.includes(naifId)) {
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
                const fullBodyConfig = this._getFullBodyConfig(naifId);
                
                // Special handling for multi-body systems
                if (fullBodyConfig?.multiBodySystemComponent) {
                    return this._calculateMultiBodySystemPosition(naifId, time, parentId);
                }
                
                // Check for orbital elements for other multi-body systems
                const orbitalElements = fullBodyConfig?.orbitalElements ?? fullBodyConfig?.canonical_orbit;
                
                if (orbitalElements && orbitalElements.semiMajorAxis > 0) {
                    return this._calculateFromOrbitalElements(naifId, time, orbitalElements);
                }
                
                // For planets without orbital elements, stay at barycenter center
                return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
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
                return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
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
            // Special case: if semiMajorAxis is 0, body is at parent center
            if (orbitalElements.semiMajorAxis === 0.0 || orbitalElements.a === 0.0) {
                return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
            }
            
            const parentId = this.hierarchy.getParent(naifId);
            const parentFullConfig = this._getFullBodyConfig(parentId);

            // Calculate GM for the parent body
            let GM = parentFullConfig?.GM;
            if (!GM && parentFullConfig?.mass) {
                // Fallback: calculate GM from mass
                GM = PhysicsConstants.PHYSICS.G * parentFullConfig.mass; // Convert to km³/s²
            }
            
            // Special case: if parent is Solar System Barycenter (0), use Sun's GM
            if (!GM && parentId === 0) {
                const sunConfig = this._getFullBodyConfig(10); // Sun's NAIF ID is 10
                GM = sunConfig?.GM || 1.32712440018e11; // km³/s² - Sun's standard gravitational parameter
            }

            if (!GM) {
                console.warn(`No GM found for parent ${parentId} of body ${naifId}`);
                return null;
            }
            
            const jd = dateToJd(time);

            // Prepare orbital elements with proper epoch
            const elementsWithEpoch = {
                a: orbitalElements.semiMajorAxis ?? orbitalElements.a,
                e: orbitalElements.eccentricity ?? orbitalElements.e,
                i: orbitalElements.inclination ?? orbitalElements.i,
                Omega: orbitalElements.longitudeOfAscendingNode ?? orbitalElements.Omega,
                omega: orbitalElements.argumentOfPeriapsis ?? orbitalElements.omega,
                M0: orbitalElements.meanAnomalyAtEpoch ?? orbitalElements.M0,
                epoch: orbitalElements.epoch ?? 2451545.0 // J2000.0 as default
            };
            
            // Get body config for special cases and coordinate transformations
            const bodyConfig = this._getFullBodyConfig(naifId);
            
            // Special case for Pluto: Override mean motion to match Charon's period
            if (bodyConfig && bodyConfig.name === 'pluto') {
                // Pluto's period should be 6.387230 days (same as Charon)
                const plutoOrbitalPeriod = 6.387230 * 24 * 3600; // seconds
                elementsWithEpoch.customPeriod = plutoOrbitalPeriod;
            }

            // Calculate state vector using OrbitalMechanics
            const state = OrbitalMechanics.orbitalElementsToStateVector(elementsWithEpoch, jd, GM);


            // Check if we can use shared positioning algorithm
            if (this._orbitCalculator) {
                // Use shared positioning method to ensure consistency with orbit visualization
                const epochTime = new Date((elementsWithEpoch.epoch - 2440587.5) * 86400 * 1000); // Convert JD to JS Date
                const timeElapsed = (time.getTime() - epochTime.getTime()) / 1000; // seconds
                
                // Calculate mean motion (rad/s)
                const n = Math.sqrt(GM / Math.pow(elementsWithEpoch.a, 3));
                const meanAnomaly = (elementsWithEpoch.M0 * Math.PI / 180) + n * timeElapsed;
                
                // Get reference frame from orbital elements or body config
                const referenceFrame = orbitalElements.referenceFrame || bodyConfig?.referenceFrame;
                
                // Use shared positioning method with proper reference frame
                const position = this._orbitCalculator.calculatePositionFromOrbitalElements(
                    {
                        semiMajorAxis: elementsWithEpoch.a,
                        eccentricity: elementsWithEpoch.e,
                        inclination: elementsWithEpoch.i,
                        longitudeOfAscendingNode: elementsWithEpoch.Omega,
                        argumentOfPeriapsis: elementsWithEpoch.omega,
                        referenceFrame: referenceFrame // CRITICAL: Pass reference frame for proper coordinate transformation
                    },
                    meanAnomaly,
                    bodyConfig
                );
                
                if (position) {
                    // Calculate velocity using finite difference (simple approximation)
                    const dt = 10; // seconds
                    const futureAnomaly = meanAnomaly + n * dt;
                    const futurePosition = this._orbitCalculator.calculatePositionFromOrbitalElements(
                        {
                            semiMajorAxis: elementsWithEpoch.a,
                            eccentricity: elementsWithEpoch.e,
                            inclination: elementsWithEpoch.i,
                            longitudeOfAscendingNode: elementsWithEpoch.Omega,
                            argumentOfPeriapsis: elementsWithEpoch.omega,
                            referenceFrame: referenceFrame // CRITICAL: Pass reference frame for velocity calculation too
                        },
                        futureAnomaly,
                        bodyConfig
                    );
                    
                    const velocity = futurePosition ? [
                        (futurePosition.x - position.x) / dt,
                        (futurePosition.y - position.y) / dt,
                        (futurePosition.z - position.z) / dt
                    ] : [0, 0, 0];
                    
                    return {
                        position: [position.x, position.y, position.z],
                        velocity: velocity
                    };
                }
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
     * Helper: Compute rotation matrix from planet equatorial to ecliptic frame
     * @param {number} poleRA - Right ascension of planet's north pole (deg)
     * @param {number} poleDec - Declination of planet's north pole (deg)
     * Returns a 3x3 rotation matrix (array of arrays)
     */
    _planetEquatorialToEclipticMatrix(poleRA, poleDec) {
        // Convert to radians
        const ra = poleRA * Math.PI / 180;
        const dec = poleDec * Math.PI / 180;
        // Planet's north pole unit vector in ecliptic frame
        const nx = Math.cos(dec) * Math.cos(ra);
        const ny = Math.cos(dec) * Math.sin(ra);
        const nz = Math.sin(dec);
        // Z axis: planet's north pole
        const z = [nx, ny, nz];
        // X axis: intersection of planet equator and ecliptic (node)
        // For simplicity, pick a vector perpendicular to z and ecliptic north (0,0,1)
        let x = [-ny, nx, 0];
        const norm = Math.hypot(x[0], x[1], x[2]);
        if (norm > 0) x = x.map(v => v / norm); else x = [1, 0, 0];
        // Y axis: y = z cross x
        const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
        return [x, y, z];
    }

    /**
     * Helper: Apply 3x3 matrix to vector
     */
    _applyMatrix3(mat, vec) {
        return [
            mat[0][0] * vec[0] + mat[0][1] * vec[1] + mat[0][2] * vec[2],
            mat[1][0] * vec[0] + mat[1][1] * vec[1] + mat[1][2] * vec[2],
            mat[2][0] * vec[0] + mat[2][1] * vec[1] + mat[2][2] * vec[2],
        ];
    }

    /**
     * Transform orbital elements from planetary equatorial to ecliptic reference frame
     * @param {Object} elements - Orbital elements in planetary equatorial coordinates
     * @param {number} parentId - NAIF ID of parent body (barycenter)
     * @param {Date} time - Current time for orientation calculation
     * @returns {Object} Transformed orbital elements in ecliptic coordinates
     */
    _transformOrbitalElementsToEcliptic(elements, parentId) {
        try {
            // Get the planet configuration for pole orientation
            let planetConfig = null;
            
            // For barycenter parents, find the associated planet
            const barycenterBody = solarSystemDataManager.getBodyByNaif(parentId);
            if (barycenterBody) {
                const planets = solarSystemDataManager.getBodiesByType('planet');
                const dwarfPlanets = solarSystemDataManager.getBodiesByType('dwarf_planet');
                const allPlanets = [...planets, ...dwarfPlanets];
                const planet = allPlanets.find(p => p.parent === barycenterBody.name);
                if (planet) {
                    planetConfig = planet;
                }
            }
            
            // Fallback: try to get the planet config directly
            if (!planetConfig) {
                planetConfig = solarSystemDataManager.getBodyByNaif(parentId);
            }
            
            if (!planetConfig?.poleRA || !planetConfig?.poleDec) {
                return null;
            }
            
            // For now, implement a simple transformation of the key angles
            // This is a simplified approach - full transformation would require spherical trigonometry
            const poleRA = planetConfig.poleRA * Math.PI / 180; // Convert to radians
            const poleDec = planetConfig.poleDec * Math.PI / 180;
            
            // Calculate the obliquity (angle between planetary equatorial and ecliptic planes)
            const obliquity = Math.acos(Math.sin(poleDec));
            
            // Transform the orbital elements
            // The main transformation affects inclination and longitude of ascending node
            const transformedElements = { ...elements };
            
            // Apply a simplified transformation to the inclination
            // This is an approximation - proper transformation requires full spherical trigonometry
            const originalInclination = elements.i * Math.PI / 180;
            const transformedInclination = Math.acos(
                Math.cos(originalInclination) * Math.cos(obliquity) +
                Math.sin(originalInclination) * Math.sin(obliquity) * Math.cos(elements.Omega * Math.PI / 180)
            );
            
            transformedElements.i = transformedInclination * 180 / Math.PI; // Convert back to degrees
            
            // Longitude of ascending node also needs transformation
            // This is simplified - full implementation would be more complex
            const deltaOmega = poleRA * 180 / Math.PI; // Convert pole RA to degrees
            transformedElements.Omega = (elements.Omega + deltaOmega) % 360;
            
            return transformedElements;
            
        } catch (error) {
            console.warn(`Failed to transform orbital elements to ecliptic:`, error);
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
            const barycenterBody = solarSystemDataManager.getBodyByNaif(parentNaifId);
            if (barycenterBody) {
                // Look for a planet or dwarf_planet that has this barycenter as parent
                const planets = solarSystemDataManager.getBodiesByType('planet');
                const dwarfPlanets = solarSystemDataManager.getBodiesByType('dwarf_planet');
                const allPlanets = [...planets, ...dwarfPlanets];
                const planet = allPlanets.find(p => p.parent === barycenterBody.name);
                if (planet) {
                    planetConfig = planet;
                }
            }

            // Fallback: try to get the planet config directly if parentNaifId is already a planet
            if (!planetConfig) {
                planetConfig = solarSystemDataManager.getBodyByNaif(parentNaifId);
            }

            if (planetConfig?.poleRA !== undefined && planetConfig?.poleDec !== undefined) {
                // Keep coordinates in planetary equatorial system for 3D scene hierarchy
                // Orbital elements are now transformed instead of position vectors
                return { position, velocity };
            }

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
            const earthConfig = this._getFullBodyConfig(NAIF_EARTH);
            const moonConfig = this._getFullBodyConfig(NAIF_MOON);
            const EARTH_MASS = earthConfig?.mass;
            const MOON_MASS = moonConfig?.mass;
            if (!EARTH_MASS || !MOON_MASS) {
                console.warn('Earth or Moon mass not found in config');
                return null;
            }
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
            const MOON_MASS_RATIO = MOON_MASS / (EARTH_MASS + MOON_MASS);


            // Calculate velocity using higher precision finite differences with smaller timestep
            // Use smaller timestep for better precision on small EMB-relative motions
            const dt = 3600; // 1 hour instead of default (better precision for small motions)
            const futureTime = new Date(time.getTime() + dt * 1000);
            const pastTime = new Date(time.getTime() - dt * 1000);
            
            const futureMoonGeo = GeoMoon(MakeTime(futureTime));
            const pastMoonGeo = GeoMoon(MakeTime(pastTime));

            if (futureMoonGeo && pastMoonGeo) {
                // Future moon position
                const futureMoonGeoEQJ = {
                    x: futureMoonGeo.x * this.AU_TO_KM,
                    y: futureMoonGeo.y * this.AU_TO_KM,
                    z: futureMoonGeo.z * this.AU_TO_KM,
                    t: MakeTime(futureTime)
                };
                const futureMoonGeoECL = RotateVector(rotMatrix, futureMoonGeoEQJ);
                
                // Past moon position
                const pastMoonGeoEQJ = {
                    x: pastMoonGeo.x * this.AU_TO_KM,
                    y: pastMoonGeo.y * this.AU_TO_KM,
                    z: pastMoonGeo.z * this.AU_TO_KM,
                    t: MakeTime(pastTime)
                };
                const pastMoonGeoECL = RotateVector(rotMatrix, pastMoonGeoEQJ);

                // Use central differences for better precision (2*dt total interval)
                const earthVelX = -(MOON_MASS_RATIO * (futureMoonGeoECL.x - pastMoonGeoECL.x)) / (2 * dt);
                const earthVelY = -(MOON_MASS_RATIO * (futureMoonGeoECL.y - pastMoonGeoECL.y)) / (2 * dt);
                const earthVelZ = -(MOON_MASS_RATIO * (futureMoonGeoECL.z - pastMoonGeoECL.z)) / (2 * dt);


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
            const earthConfig = this._getFullBodyConfig(NAIF_EARTH);
            const moonConfig = this._getFullBodyConfig(NAIF_MOON);
            const EARTH_MASS = earthConfig?.mass;
            const MOON_MASS = moonConfig?.mass;
            if (!EARTH_MASS || !MOON_MASS) {
                console.warn('Earth or Moon mass not found in config');
                return null;
            }
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
            const EARTH_MASS_RATIO = EARTH_MASS / (EARTH_MASS + MOON_MASS);

            // Calculate velocity using finite differences
            const dt = StateVectorCalculator.FINITE_DIFF_DT; // seconds
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
        const body = solarSystemDataManager.getBodyByName(bodyName);
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
     * Find the dominant planet in a barycenter system by name (for moon positioning)
     * @param {number} barycenterNaifId - NAIF ID of the barycenter
     * @param {string} planetName - Name of the planet to find (e.g., "saturn", "pluto")
     * @returns {Object|null} - The celestial body object with targetOrientation, or null
     */
    _findDominantPlanetForMoon(barycenterNaifId, planetName) {
        // Access celestial bodies from the global app context
        const app = window.app3d || this.app;
        
        if (!app || !app.celestialBodies) {
            // Don't warn during early initialization - this is expected
            return null;
        }
        
        // Find the planet by name in the celestial bodies
        const planet = app.celestialBodies.find(body => 
            body.name && body.name.toLowerCase() === planetName.toLowerCase()
        );
        
        if (!planet) {
            // Don't warn during early initialization - this is expected
            return null;
        }
        
        return planet;
    }

    /**
     * Check if a system is a multi-body system where orbital mechanics apply
     * Returns true for systems like Earth-Moon, Pluto-Charon, etc.
     * Returns false for single-planet systems where planet = barycenter
     */
    _isMultiBodySystem(bodyId, parentId) {
        // Get the parent body (should be a barycenter)
        const parentBody = solarSystemDataManager.getBodyByNaif(parentId);
        if (!parentBody || parentBody.type !== 'barycenter') {
            return false;
        }

        // Get all children of this barycenter
        const children = solarSystemDataManager.getChildren(parentBody.name);

        // Special cases for known multi-body systems
        // These are systems where the barycenter is significantly displaced from the primary body
        const knownMultiBodySystems = [
            NAIF_EMB, // Earth-Moon Barycenter (EMB)
            NAIF_PLUTO_BARY  // Pluto System Barycenter (Pluto-Charon)
        ];

        if (knownMultiBodySystems.includes(parentId)) {
            // Check if this specific body is one of the children
            const body = solarSystemDataManager.getBodyByNaif(bodyId);
            if (body && children.includes(body.name)) {
                return true;
            }
        }

        // For all other systems (Mars, Jupiter, Saturn, etc.), the planet is at barycenter center
        // Even though they have moons, the barycenter is essentially at the planet center
        // because the planet is so much more massive than the moons
        return false;
    }

    /**
     * Calculate a planet's position based on mass displacement from its moons
     * This is physically accurate for multi-body systems like Pluto-Charon
     * 
     * Physics principle: Center of mass must remain at barycenter (0,0,0)
     * Therefore: r_planet = -∑(m_moon * r_moon) / m_planet
     */
    _calculateMassDisplacement(naifId, time) {
        try {
            // Get this planet's configuration and mass
            const planetConfig = this._getFullBodyConfig(naifId);
            if (!planetConfig || !planetConfig.mass) {
                return null;
            }
            
            const planetMass = planetConfig.mass;
            const parentId = this.hierarchy.getParent(naifId);
            const parentInfo = this.hierarchy.getBodyInfo(parentId);
            
            if (!parentInfo) {
                return null;
            }
            
            // Get all moons/companions in this barycenter system
            const companions = Array.from(this.bodiesConfigMap?.values?.() || [])
                .filter(cfg => 
                    cfg.parent === parentInfo.name && 
                    cfg.naif_id !== naifId && 
                    cfg.type === 'moon' && 
                    cfg.mass
                );
            
            if (companions.length === 0) {
                // No companions found - planet stays at barycenter center
                return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
            }
            
            // Calculate mass-weighted sum of companion positions
            let totalMassDisplacementPos = [0, 0, 0];
            let totalMassDisplacementVel = [0, 0, 0];
            
            for (const companion of companions) {
                // Calculate companion's position using its orbital elements
                if (!companion.naif_id) {
                    continue;
                }
                
                const companionState = this.calculateStateVector(companion.naif_id, time);
                if (!companionState || !Array.isArray(companionState.position) || !Array.isArray(companionState.velocity)) {
                    continue;
                }
                
                const companionMass = companion.mass;
                
                // Add mass-weighted contribution
                totalMassDisplacementPos[0] += companionMass * companionState.position[0];
                totalMassDisplacementPos[1] += companionMass * companionState.position[1];
                totalMassDisplacementPos[2] += companionMass * companionState.position[2];
                
                totalMassDisplacementVel[0] += companionMass * companionState.velocity[0];
                totalMassDisplacementVel[1] += companionMass * companionState.velocity[1];
                totalMassDisplacementVel[2] += companionMass * companionState.velocity[2];
            }
            
            // Planet's position is the negative mass-weighted displacement
            // This ensures center of mass remains at barycenter (0,0,0)
            const planetPosition = [
                -totalMassDisplacementPos[0] / planetMass,
                -totalMassDisplacementPos[1] / planetMass,
                -totalMassDisplacementPos[2] / planetMass
            ];
            
            const planetVelocity = [
                -totalMassDisplacementVel[0] / planetMass,
                -totalMassDisplacementVel[1] / planetMass,
                -totalMassDisplacementVel[2] / planetMass
            ];
            
            return {
                position: planetPosition,
                velocity: planetVelocity
            };
            
        } catch (error) {
            console.warn(`Failed to calculate mass displacement for NAIF ${naifId}:`, error);
            return null;
        }
    }

    /**
     * Compute planet's motion around barycenter from sibling masses and positions
     * Used when no ephemeris or orbital elements are available
     */
    _calculateBarycenterFromSiblings(naifId, time) {
        // Get this body's config
        const bodyConfig = this._getFullBodyConfig(naifId);
        if (!bodyConfig || !bodyConfig.mass) return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
        const parentId = this.hierarchy.getParent(naifId);
        const parentInfo = this.hierarchy.getBodyInfo(parentId);
        if (!parentInfo) return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
        // Get all siblings (moons/planets) sharing the same barycenter
        const barycenterChildren = Array.from(this.bodiesConfigMap?.values?.() || [])
            .filter(cfg => cfg.parent === parentInfo.name && cfg.naif_id !== bodyConfig.naif_id && cfg.mass && (cfg.type === 'planet' || cfg.type === 'dwarf_planet' || cfg.type === 'moon'));
        // Calculate barycenter if there are siblings with mass
        if (bodyConfig && barycenterChildren.length > 0) {
            // Log siblings for barycenter calculation if needed for debugging
            // console.log(`[BARYCENTER DEBUG] ${bodyConfig.name} barycenter siblings:`, ...);
        }
        let totalMass = 0;
        let weightedPos = [0, 0, 0];
        let weightedVel = [0, 0, 0];
        for (const sibling of barycenterChildren) {
            const state = this.calculateStateVector(sibling.naif_id, time);
            if (!state || !Array.isArray(state.position) || !Array.isArray(state.velocity)) continue;
            // Calculate sibling contribution to barycenter
            const m = sibling.mass;
            totalMass += m;
            weightedPos[0] += m * state.position[0];
            weightedPos[1] += m * state.position[1];
            weightedPos[2] += m * state.position[2];
            weightedVel[0] += m * state.velocity[0];
            weightedVel[1] += m * state.velocity[1];
            weightedVel[2] += m * state.velocity[2];
        }
        if (totalMass === 0) return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
        // The planet's position is minus the mass-weighted sum of siblings, divided by its own mass
        return {
            position: weightedPos.map(x => -x / bodyConfig.mass),
            velocity: weightedVel.map(x => -x / bodyConfig.mass)
        };
    }

    /**
     * Calculate position for multi-body system components (general method)
     * Planet is displaced from barycenter based on actual positions and mass ratios of ALL moons in the system
     */
    _calculateMultiBodySystemPosition(naifId, time, barycenterId) {
        try {
            const planetConfig = this._getFullBodyConfig(naifId);
            if (!planetConfig || !planetConfig.mass) {
                return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
            }

            // Find all moons in this barycenter system
            const systemMoons = [];
            const children = this.hierarchy.getChildren(barycenterId);
            
            for (const childId of children) {
                const childInfo = this.hierarchy.getBodyInfo(childId);
                if (childInfo && childInfo.type === 'moon') {
                    const moonConfig = this._getFullBodyConfig(childId);
                    if (moonConfig && moonConfig.mass) {
                        systemMoons.push({
                            naifId: childId,
                            config: moonConfig,
                            mass: moonConfig.mass
                        });
                    }
                }
            }

            if (systemMoons.length === 0) {
                return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
            }

            // Calculate mass-weighted position of all moons
            let totalMoonMass = 0;
            const weightedMoonPosition = [0, 0, 0];
            const weightedMoonVelocity = [0, 0, 0];

            for (const moon of systemMoons) {
                // Calculate moon's position using orbital elements
                const moonState = this._calculateFromOrbitalElements(moon.naifId, time, moon.config.orbitalElements);
                if (moonState && moonState.position) {
                    const mass = moon.mass;
                    totalMoonMass += mass;
                    
                    // Add mass-weighted contribution
                    weightedMoonPosition[0] += mass * moonState.position[0];
                    weightedMoonPosition[1] += mass * moonState.position[1];
                    weightedMoonPosition[2] += mass * moonState.position[2];
                    
                    if (moonState.velocity) {
                        weightedMoonVelocity[0] += mass * moonState.velocity[0];
                        weightedMoonVelocity[1] += mass * moonState.velocity[1];
                        weightedMoonVelocity[2] += mass * moonState.velocity[2];
                    }
                }
            }

            if (totalMoonMass === 0) {
                return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
            }

            // Calculate center of mass of moon system
            const moonCenterOfMass = [
                weightedMoonPosition[0] / totalMoonMass,
                weightedMoonPosition[1] / totalMoonMass,
                weightedMoonPosition[2] / totalMoonMass
            ];

            const moonCenterOfMassVelocity = [
                weightedMoonVelocity[0] / totalMoonMass,
                weightedMoonVelocity[1] / totalMoonMass,
                weightedMoonVelocity[2] / totalMoonMass
            ];

            // Planet is displaced opposite to moon center of mass, scaled by mass ratio
            const planetMass = planetConfig.mass;
            const massRatio = totalMoonMass / planetMass;

            const planetDisplacement = [
                -moonCenterOfMass[0] * massRatio,
                -moonCenterOfMass[1] * massRatio,
                -moonCenterOfMass[2] * massRatio
            ];

            const planetVelocity = [
                -moonCenterOfMassVelocity[0] * massRatio,
                -moonCenterOfMassVelocity[1] * massRatio,
                -moonCenterOfMassVelocity[2] * massRatio
            ];


            return {
                position: planetDisplacement,
                velocity: planetVelocity
            };

        } catch {
            return { position: StateVectorCalculator.ZERO_VECTOR, velocity: StateVectorCalculator.ZERO_VECTOR };
        }
    }
}

StateVectorCalculator.FINITE_DIFF_DT = 60; // seconds
StateVectorCalculator.ZERO_VECTOR = [0, 0, 0]; 