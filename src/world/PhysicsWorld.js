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
        if (this.nameLower === 'barycenter' || this.nameLower === 'sun' || !isAEBody(this._aeName)) {
            // Static origin for barycenter and sun, or unsupported bodies
            this.position.x = 0;
            this.position.y = 0;
            this.position.z = 0;
        } else {
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
        const childAE = getAEBodyName(key);
        if (!isAEBody(childAE)) {
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
            // Child barycentric position
            const cstate = AE.BaryState(AE.Body[childAE], jd);
            const cecl = AE.Ecliptic(cstate).vec;
            const childPos = { x: cecl.x * kmPerAU, y: cecl.y * kmPerAU, z: cecl.z * kmPerAU };
            // Subtract parent if requested
            if (useRelative) {
                const pstate = AE.BaryState(AE.Body[parentAEName], jd);
                const pecl = AE.Ecliptic(pstate).vec;
                const parentPos = { x: pecl.x * kmPerAU, y: pecl.y * kmPerAU, z: pecl.z * kmPerAU };
                childPos.x -= parentPos.x;
                childPos.y -= parentPos.y;
                childPos.z -= parentPos.z;
            }
            positions.push(childPos);
        }
        return positions;
    }
} 