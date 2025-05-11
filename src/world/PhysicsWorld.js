import { adaptiveIntegrate } from '../utils/OrbitIntegrator.js';
import { Constants } from '../utils/Constants.js';
import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js';
import * as AE from 'astronomy-engine';  // for planetary ephemeris

/**
 * PhysicsWorld handles all orbital dynamics, attracting bodies, and satellite integration.
 */
// Helper to map config keys to Astronomy Engine body names
function getAEBodyName(key) {
    if (!key) return undefined;
    if (key === 'barycenter' || key === 'ssb') return 'Barycenter';
    if (key === 'emb') return 'EMB';
    return key.charAt(0).toUpperCase() + key.slice(1);
}

// Helper to check if a body is supported by AE
function isAEBody(key) {
    return Boolean(AE.Body[key]);
}

// Helper to create plain vector objects without three.js
function createVec(x = 0, y = 0, z = 0) { return { x, y, z }; }

// Helper to compute distance between two plain vectors
function vecDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

// Add Attractor class to encapsulate body update logic
class Attractor {
    constructor({ name, nameLower, orbitElements = null, orbitRadius = 0, mass = 0, soiRadius = 0, body = null }) {
        this.name = name;
        this.nameLower = nameLower;
        this.orbitElements = orbitElements;
        this.orbitRadius = orbitRadius;
        this.mass = mass;
        this.soiRadius = soiRadius;
        this.body = body;
        this.position = createVec();
        this._aeName = getAEBodyName(nameLower);
    }

    updatePositionAstronomy(julianDate) {
        const kmPerAU = Constants.AU * Constants.metersToKm;
        // Special-case: Galilean moons (jovicentric) using Astronomy Engine's JupiterMoons
        const galilean = ['io', 'europa', 'ganymede', 'callisto'];
        if (galilean.includes(this.nameLower)) {
            // Jupiter barycentric position in AU
            const jupAE = getAEBodyName('jupiter');
            const jupState = AE.BaryState(AE.Body[jupAE], julianDate);
            const jupEcl = AE.Ecliptic(jupState).vec;
            // Jovicentric moon position in AU
            const jm = AE.JupiterMoons(julianDate);
            const sv = jm[this.nameLower];
            const moonEcl = AE.Ecliptic(sv).vec;
            // Sum to get barycentric moon position in km
            this.position.x = (jupEcl.x + moonEcl.x) * kmPerAU;
            this.position.y = (jupEcl.y + moonEcl.y) * kmPerAU;
            this.position.z = (jupEcl.z + moonEcl.z) * kmPerAU;
        } else if (this.nameLower === 'barycenter' || this.nameLower === 'sun' || !isAEBody(this._aeName)) {
            // Static origin for barycenter, sun, or unsupported bodies
            this.position.x = 0;
            this.position.y = 0;
            this.position.z = 0;
        } else {
            // Standard barycentric ephemeris
            const equState = AE.BaryState(AE.Body[this._aeName], julianDate);
            const vec = AE.Ecliptic(equState).vec;
            this.position.x = vec.x * kmPerAU;
            this.position.y = vec.y * kmPerAU;
            this.position.z = vec.z * kmPerAU;
        }
    }
}

export class PhysicsWorld {
    /**
     * @param {Object} options
     * @param {*} options.timeUtils        - time utility for real and simulated time
     * @param {number} [options.perturbationScale=1.0] - scale factor for third-body perturbations
     */
    constructor({ timeUtils, perturbationScale = 1.0 }) {
        this.timeUtils = timeUtils;
        this.timeWarp = 1;
        this.perturbationScale = perturbationScale;
        this.useRemote = false; // toggle for remote compute (future)
        this.bodies = [];               // attractor bodies (planets, sun, moon)
        this.satellites = new Map();    // satellite state keyed by id
        this._lastRealTime = Date.now();
    }

    /**
     * Load planetary bodies and sun into the physics world from live instances
     * @param {Array<{name:string}>} instances - array of Planet/Sun instances from App3D
     */
    loadFromPlanets(instances) {
        // Create Attractor instances for each provided planet/sun
        this.bodies = instances.map(inst => {
            const keyLower = inst.nameLower;
            const cfg = celestialBodiesConfig[keyLower];
            if (!cfg) throw new Error(`No config found for body '${keyLower}'`);
            const soi = (cfg.soiRadius || 0) * (cfg.radius || 1);
            return new Attractor({
                name: inst.name,
                nameLower: keyLower,
                orbitElements: cfg.orbitElements || null,
                orbitRadius: cfg.orbitRadius || 0,
                mass: cfg.mass || 0,
                soiRadius: soi,
                body: inst
            });
        });
        // Ensure barycenter exists at start
        if (!this.bodies.find(b => b.nameLower === 'barycenter')) {
            const cfg = celestialBodiesConfig['barycenter'] || {};
            const soi = (cfg.soiRadius || 0) * (cfg.radius || 1);
            this.bodies.unshift(new Attractor({
                name: cfg.name || 'barycenter',
                nameLower: 'barycenter',
                orbitElements: cfg.orbitElements || null,
                orbitRadius: cfg.orbitRadius || 0,
                mass: cfg.mass || 0,
                soiRadius: soi,
                body: null
            }));
        }
        // Ensure EMB exists at end
        if (!this.bodies.find(b => b.nameLower === 'emb')) {
            const cfg = celestialBodiesConfig['emb'] || {};
            const soi = (cfg.soiRadius || 0) * (cfg.radius || 1);
            this.bodies.push(new Attractor({
                name: cfg.name || 'emb',
                nameLower: 'emb',
                orbitElements: cfg.orbitElements || null,
                orbitRadius: cfg.orbitRadius || 0,
                mass: cfg.mass || 0,
                soiRadius: soi,
                body: null
            }));
        }
    }

    /**
     * Original config-based load (retained for fallback)
     */
    init() {
        this._loadAttractors();
    }

    /** Add a satellite with initial state */
    addSatellite({ id, position, velocity, mass = 100, size = 1 }) {
        const sat = {
            id,
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            mass,
            size,
            ballisticCoefficient: mass / (2.2 * Math.PI * size * size),
            primaryBody: null
        };
        sat.primaryBody = this._determinePrimaryBody(sat.position);
        this.satellites.set(id, sat);
    }

    /** Remove a satellite by id */
    removeSatellite(id) {
        this.satellites.delete(id);
    }

    /** Set simulation speed multiplier */
    setTimeWarp(warp) {
        this.timeWarp = warp;
    }

    /** Perform one physics update step */
    update() {
        const julian = this.timeUtils.getJulianDate();
        const now = Date.now();
        const realDelta = (now - this._lastRealTime) / 1000;
        this._lastRealTime = now;
        const simDelta = realDelta * this.timeWarp;

        // update attractors using astronomy-engine ephemeris
        this._updateAttractorsAstronomy(julian);
        // always integrate satellites
        this._updateSatellites(simDelta);
    }

    /** Internal: load attractor bodies from config */
    _loadAttractors() {
        this.bodies = Object.entries(celestialBodiesConfig).map(([key, cfg]) => {
            const mass = cfg.mass || 0;
            const soi = (cfg.soiRadius || 0) * (cfg.radius || 1);
            return {
                name: key,
                orbitElements: cfg.orbitElements || null,
                orbitRadius: cfg.orbitRadius || 0,
                mass,
                soiRadius: soi,
                position: createVec(),
                config: cfg
            };
        });
    }

    /**
     * Internal: update all attractor positions using barycentric ephemeris in kilometers
     */
    _updateAttractorsAstronomy(julianDate) {
        this.bodies.forEach(body => {
            body.updatePositionAstronomy(julianDate);
        });
    }

    /** Internal: integrate all satellites and handle SOI transitions */
    _updateSatellites(dt) {
        // Prepare dynamic bodies in meters for integration
        const dynamic = this.bodies.map(b => ({
            name: b.name,
            mass: b.mass,
            position: {
                x: b.position.x * Constants.kmToMeters,
                y: b.position.y * Constants.kmToMeters,
                z: b.position.z * Constants.kmToMeters
            }
        }));
        this.satellites.forEach(sat => {
            // Integrate one step: convert km->m for position and velocity
            const posM = [sat.position.x * Constants.kmToMeters,
            sat.position.y * Constants.kmToMeters,
            sat.position.z * Constants.kmToMeters];
            const velM = [sat.velocity.x * Constants.kmToMeters,
            sat.velocity.y * Constants.kmToMeters,
            sat.velocity.z * Constants.kmToMeters];
            const result = adaptiveIntegrate(
                posM,
                velM,
                dt,
                dynamic,
                this.perturbationScale
            );
            // Convert results back from meters to kilometers
            sat.position.x = result.pos[0] * Constants.metersToKm;
            sat.position.y = result.pos[1] * Constants.metersToKm;
            sat.position.z = result.pos[2] * Constants.metersToKm;
            sat.velocity.x = result.vel[0] * Constants.metersToKm;
            sat.velocity.y = result.vel[1] * Constants.metersToKm;
            sat.velocity.z = result.vel[2] * Constants.metersToKm;

            // detect SOI boundary crossing
            const newPrimary = this._determinePrimaryBody(sat.position);
            if (newPrimary !== sat.primaryBody) {
                sat.primaryBody = newPrimary;
            }
        });
    }

    /** Internal: pick the primary attractor by SOI containment */
    _determinePrimaryBody(pos) {
        let primary = null;
        this.bodies.forEach(body => {
            const d = vecDistance(pos, body.position);
            if (d <= body.soiRadius) {
                primary = body.name;
            }
        });
        return primary;
    }

    /** Set compute mode to remote (future) */
    setUseRemote(flag) {
        this.useRemote = Boolean(flag);
    }

    /**
     * Generate propagated orbit positions around a moving parent based on config.
     */
    generateOrbitPath(bodyName, numSteps = 360, parentName) {
        const key = bodyName.toLowerCase();
        const config = celestialBodiesConfig[key];
        if (!config || key === 'barycenter') return [];
        // Determine if we should compute positions relative to a parent
        const parentKeyLower = parentName ? parentName.toLowerCase() : null;
        let useRelative = parentKeyLower && parentKeyLower !== key && parentKeyLower !== 'barycenter';
        let parentAEName;
        if (useRelative) {
            parentAEName = getAEBodyName(parentKeyLower);
            if (!isAEBody(parentAEName)) {
                console.warn(`[PhysicsWorld] Skipping parent-relative orbit for unsupported parent: ${parentName}`);
                useRelative = false;
            }
        }
        // Prepare body name for Astronomy Engine calls
        const childAE = getAEBodyName(key);
        // Detect Galilean moons and compute via JupiterMoons
        const isJupiterMoon = ['io', 'europa', 'ganymede', 'callisto'].includes(key);
        if (!isJupiterMoon && !isAEBody(childAE)) {
            console.warn(`[PhysicsWorld] Skipping orbit for unsupported body: ${bodyName}`);
            return [];
        }
        const startJD = this.timeUtils.getJulianDate();
        const kmPerAU = Constants.AU * Constants.metersToKm;
        // Determine orbital period in days
        let periodDays;
        if (useRelative) {
            // Try to use two-body elements: child or its sibling under same parent (e.g., moon's lunar month)
            let elem = config.orbitElements;
            if (!elem) {
                for (const [, sibCfg] of Object.entries(celestialBodiesConfig)) {
                    if (sibCfg.parent && sibCfg.parent.toLowerCase() === parentKeyLower && sibCfg.orbitElements) {
                        elem = sibCfg.orbitElements;
                        break;
                    }
                }
            }
            if (elem && typeof elem.semiMajorAxis === 'number' && typeof elem.mu === 'number') {
                // Use Kepler's third law for parent-relative two-body orbit
                const a = elem.semiMajorAxis;
                const mu = elem.mu;
                const periodSec = 2 * Math.PI * Math.sqrt(a * a * a / mu);
                periodDays = periodSec / Constants.secondsInDay;
            } else {
                // Fallback to barycentric period if no two-body elements
                periodDays = 30;
                const cs0 = AE.BaryState(AE.Body[childAE], startJD);
                const v_m_s = Math.hypot(cs0.vx, cs0.vy, cs0.vz) * Constants.AU / Constants.secondsInDay;
                const r_m = Math.hypot(cs0.x, cs0.y, cs0.z) * Constants.AU;
                const muSun = Constants.sunGravitationalParameter;
                const epsilon = (v_m_s * v_m_s) / 2 - muSun / r_m;
                if (epsilon < 0) {
                    const aB = -muSun / (2 * epsilon);
                    periodDays = 2 * Math.PI * Math.sqrt(aB * aB * aB / muSun) / Constants.secondsInDay;
                }
            }
        } else {
            // Barycentric case: approximate orbital period via energy
            periodDays = 30;
            const cs0 = AE.BaryState(AE.Body[childAE], startJD);
            const v_m_s = Math.hypot(cs0.vx, cs0.vy, cs0.vz) * Constants.AU / Constants.secondsInDay;
            const r_m = Math.hypot(cs0.x, cs0.y, cs0.z) * Constants.AU;
            const muSun = Constants.sunGravitationalParameter;
            const epsilon = (v_m_s * v_m_s) / 2 - muSun / r_m;
            if (epsilon < 0) {
                const aB = -muSun / (2 * epsilon);
                periodDays = 2 * Math.PI * Math.sqrt(aB * aB * aB / muSun) / Constants.secondsInDay;
            }
        }
        const positions = [];
        for (let i = 0; i <= numSteps; i++) {
            const jd = startJD + (i * (periodDays / numSteps));
            if (isJupiterMoon) {
                // Jovicentric state vectors for Galilean moons
                const jmInfo = AE.JupiterMoons(jd);
                const sv = jmInfo[key];
                const ecl = AE.Ecliptic(sv).vec;
                positions.push({ x: ecl.x * kmPerAU, y: ecl.y * kmPerAU, z: ecl.z * kmPerAU });
                continue;
            }
            // Child barycentric position for planets
            const cstate = AE.BaryState(AE.Body[childAE], jd);
            const cecl = AE.Ecliptic(cstate);
            const childPos = { x: cecl.vec.x * kmPerAU, y: cecl.vec.y * kmPerAU, z: cecl.vec.z * kmPerAU };
            // Subtract parent if requested
            if (useRelative) {
                const pstate = AE.BaryState(AE.Body[parentAEName], jd);
                const pecl = AE.Ecliptic(pstate);
                childPos.x -= pecl.vec.x * kmPerAU;
                childPos.y -= pecl.vec.y * kmPerAU;
                childPos.z -= pecl.vec.z * kmPerAU;
            }
            positions.push(childPos);
        }
        return positions;
    }

    /**
     * Get the current state vector (position, velocity) for a body in the ecliptic frame, km/km/s, relative to parent if given.
     * Both position and velocity are derived from AE.Ecliptic (position directly, velocity by finite differencing AE.Ecliptic positions).
     * For relative orbits, subtract parent AE.Ecliptic position/velocity from child, both in AU and AU/day, then convert to km/km/s.
     * @param {string} bodyName - Name of the body (e.g. 'earth')
     * @param {string} [parentName] - Name of the parent body (e.g. 'sun')
     * @returns {{ position: {x, y, z}, velocity: {x, y, z} }}
     */
    getBodyStateVectorEcliptic(bodyName, parentName) {
        const key = bodyName.toLowerCase();
        const parentKey = parentName ? parentName.toLowerCase() : null;
        const childAE = getAEBodyName(key);
        const parentAE = parentKey ? getAEBodyName(parentKey) : null;
        if (!isAEBody(childAE)) return null;
        const jd = this.timeUtils.getJulianDate();
        const dt = 1e-4; // days (~8.6 seconds)
        // --- Get child AE.Ecliptic positions at jd and jd+dt ---
        const cecl1 = AE.Ecliptic(AE.BaryState(AE.Body[childAE], jd));
        const cecl2 = AE.Ecliptic(AE.BaryState(AE.Body[childAE], jd + dt));
        // Position in AU
        const posEcl1 = { x: cecl1.vec.x, y: cecl1.vec.y, z: cecl1.vec.z };
        const posEcl2 = { x: cecl2.vec.x, y: cecl2.vec.y, z: cecl2.vec.z };
        // Velocity in AU/day (finite difference)
        const velEclAU = {
            x: (posEcl2.x - posEcl1.x) / dt,
            y: (posEcl2.y - posEcl1.y) / dt,
            z: (posEcl2.z - posEcl1.z) / dt
        };
        let posAU = { ...posEcl1 };
        let velAU = { ...velEclAU };
        // --- If parent, subtract parent AE.Ecliptic state (in AU/AU/day) ---
        if (parentAE && isAEBody(parentAE)) {
            const pecl1 = AE.Ecliptic(AE.BaryState(AE.Body[parentAE], jd));
            const pecl2 = AE.Ecliptic(AE.BaryState(AE.Body[parentAE], jd + dt));
            const pposEcl1 = { x: pecl1.vec.x, y: pecl1.vec.y, z: pecl1.vec.z };
            const pposEcl2 = { x: pecl2.vec.x, y: pecl2.vec.y, z: pecl2.vec.z };
            const pvelEclAU = {
                x: (pposEcl2.x - pposEcl1.x) / dt,
                y: (pposEcl2.y - pposEcl1.y) / dt,
                z: (pposEcl2.z - pposEcl1.z) / dt
            };
            // Subtract parent from child (in AU/AU/day)
            posAU = {
                x: posEcl1.x - pposEcl1.x,
                y: posEcl1.y - pposEcl1.y,
                z: posEcl1.z - pposEcl1.z
            };
            velAU = {
                x: velEclAU.x - pvelEclAU.x,
                y: velEclAU.y - pvelEclAU.y,
                z: velEclAU.z - pvelEclAU.z
            };
        }
        // --- Convert to km and km/s ---
        const kmPerAU = Constants.AU * Constants.metersToKm;
        const secPerDay = Constants.secondsInDay;
        const pos = {
            x: posAU.x * kmPerAU,
            y: posAU.y * kmPerAU,
            z: posAU.z * kmPerAU
        };
        const vel = {
            x: velAU.x * kmPerAU / secPerDay,
            y: velAU.y * kmPerAU / secPerDay,
            z: velAU.z * kmPerAU / secPerDay
        };
        return { position: pos, velocity: vel };
    }
} 