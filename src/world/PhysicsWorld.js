import * as THREE from 'three';
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
        this.bodies = instances.map(inst => {
            const key = inst.name.toLowerCase();
            const cfg = celestialBodiesConfig[key];
            if (!cfg) throw new Error(`No config found for body '${key}'`);
            // compute sphere-of-influence radius in scene units
            const soi = (cfg.soiRadius || 0) * (cfg.radius || 1);
            // Attach the Planet instance for later use in AtmosphereManager
            return {
                name: inst.name,
                orbitElements: cfg.orbitElements || null,
                orbitRadius: cfg.orbitRadius || 0,
                mass: cfg.mass || 0,
                soiRadius: soi,
                position: new THREE.Vector3(),
                body: inst   // Planet instance for transforms
            };
        });
        // add solar system barycenter as a reference attractor
        this.bodies.unshift({ name: 'barycenter', position: new THREE.Vector3(), mass: 0, soiRadius: 0 });
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
            position: position.clone(),
            velocity: velocity.clone(),
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
                position: new THREE.Vector3(),
                config: cfg
            };
        });
    }

    /**
     * Internal: update all attractor positions using barycentric ephemeris in kilometers
     */
    _updateAttractorsAstronomy(julianDate) {
        const kmPerAU = Constants.AU * Constants.metersToKm;
        // Precompute Earth and Moon positions for EMB
        let earthPos = null, moonPos = null;
        let earthMass = 0, moonMass = 0;
        this.bodies.forEach(body => {
            if (body.name.toLowerCase() === 'earth') {
                const key = 'Earth';
                const equState = AE.BaryState(AE.Body[key], julianDate);
                const eclCoords = AE.Ecliptic(equState).vec;
                earthPos = new THREE.Vector3(eclCoords.x * kmPerAU, eclCoords.y * kmPerAU, eclCoords.z * kmPerAU);
                earthMass = body.mass;
            }
            if (body.name.toLowerCase() === 'moon') {
                const key = 'Moon';
                const equState = AE.BaryState(AE.Body[key], julianDate);
                const eclCoords = AE.Ecliptic(equState).vec;
                moonPos = new THREE.Vector3(eclCoords.x * kmPerAU, eclCoords.y * kmPerAU, eclCoords.z * kmPerAU);
                moonMass = body.mass;
            }
        });
        this.bodies.forEach(body => {
            const keyLower = body.name.toLowerCase();
            if (keyLower === 'barycenter') {
                body.position.set(0, 0, 0);
                return;
            }
            if (keyLower === 'emb') {
                // Compute EMB as mass-weighted average
                if (earthPos && moonPos && earthMass && moonMass) {
                    const totalMass = earthMass + moonMass;
                    body.position.copy(earthPos.clone().multiplyScalar(earthMass / totalMass).add(moonPos.clone().multiplyScalar(moonMass / totalMass)));
                } else {
                    body.position.set(0, 0, 0);
                }
                return;
            }
            if (!isAEBody(getAEBodyName(keyLower))) {
                // Skip unsupported bodies
                return;
            }
            // ... existing code for other bodies ...
            const key = getAEBodyName(keyLower);
            const equState = AE.BaryState(AE.Body[key], julianDate);
            const eclCoords = AE.Ecliptic(equState).vec;
            const x = eclCoords.x * kmPerAU;
            const y = eclCoords.y * kmPerAU;
            const z = eclCoords.z * kmPerAU;
            body.position.set(x, y, z);
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
            sat.position.set(
                result.pos[0] * Constants.metersToKm,
                result.pos[1] * Constants.metersToKm,
                result.pos[2] * Constants.metersToKm
            );
            sat.velocity.set(
                result.vel[0] * Constants.metersToKm,
                result.vel[1] * Constants.metersToKm,
                result.vel[2] * Constants.metersToKm
            );

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
            const d = pos.distanceTo(body.position);
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

    // Helper: recursively get absolute barycentric ecliptic position for a body at a given JD
    _getAbsoluteBaryEclPos(key, jd) {
        const kmPerAU = Constants.AU * Constants.metersToKm;
        const config = celestialBodiesConfig[key];
        if (!config) return new THREE.Vector3(0, 0, 0);
        const parentKey = config.parent;
        if (!parentKey || parentKey === 'barycenter') {
            // Absolute barycentric position
            if (key === 'barycenter') return new THREE.Vector3(0, 0, 0);
            if (!isAEBody(getAEBodyName(key)) && key !== 'emb') return new THREE.Vector3(0, 0, 0);
            if (key === 'emb') {
                const embBary = AE.BaryState(AE.Body.EMB, jd);
                const embBaryEcl = AE.Ecliptic(embBary).vec;
                return new THREE.Vector3(
                    embBaryEcl.x * kmPerAU,
                    embBaryEcl.y * kmPerAU,
                    embBaryEcl.z * kmPerAU
                );
            }
            const state = AE.BaryState(AE.Body[getAEBodyName(key)], jd);
            const ecl = AE.Ecliptic(state).vec;
            return new THREE.Vector3(
                ecl.x * kmPerAU,
                ecl.y * kmPerAU,
                ecl.z * kmPerAU
            );
        } else {
            // Relative to parent
            if (!isAEBody(getAEBodyName(key))) return new THREE.Vector3(0, 0, 0);
            const state = AE.BaryState(AE.Body[getAEBodyName(key)], jd);
            const ecl = AE.Ecliptic(state).vec;
            const parentAbs = this._getAbsoluteBaryEclPos(parentKey, jd);
            const parentState = AE.BaryState(AE.Body[getAEBodyName(parentKey)], jd);
            const parentEcl = AE.Ecliptic(parentState).vec;
            const rel = new THREE.Vector3(
                (ecl.x - parentEcl.x) * kmPerAU,
                (ecl.y - parentEcl.y) * kmPerAU,
                (ecl.z - parentEcl.z) * kmPerAU
            );
            return rel.add(parentAbs);
        }
    }

    generateOrbitPath(bodyName, numSteps = 600) {
        const key = bodyName.toLowerCase();
        if (!celestialBodiesConfig[key]) return [];
        if (key === 'barycenter' || key === 'punk') return [];
        const config = celestialBodiesConfig[key];
        const parentKey = config.parent;
        const startJD = this.timeUtils.getJulianDate();
        let semiMajorAxisMeters, mu, positions = [];
        const metersPerAU = Constants.AU;
        const bodyAEName = getAEBodyName(key);
        // Skip unsupported AE bodies except for EMB
        if (!isAEBody(bodyAEName) && key !== 'emb') {
            console.warn(`[PhysicsWorld] Skipping orbit for unsupported body: ${bodyName}`);
            return [];
        }
        // Calculate period using orbital mechanics if possible
        let period = 30; // fallback
        if (!parentKey || parentKey === 'barycenter') {
            // Absolute barycentric orbit
            if (key === 'emb') {
                period = 365.25;
            } else {
                const planetState = AE.BaryState(AE.Body[bodyAEName], startJD);
                const r_mag_au = Math.sqrt(planetState.x**2 + planetState.y**2 + planetState.z**2);
                const v_mag_au_per_day = Math.sqrt(planetState.vx**2 + planetState.vy**2 + planetState.vz**2);
                const r_mag_m = r_mag_au * metersPerAU;
                const v_mag_m_per_s = v_mag_au_per_day * metersPerAU / Constants.secondsInDay;
                mu = Constants.sunGravitationalParameter;
                const epsilon = (v_mag_m_per_s**2 / 2) - (mu / r_mag_m);
                semiMajorAxisMeters = -mu / (2 * epsilon);
                if (epsilon >= 0 || semiMajorAxisMeters <= 0) {
                    console.error(`[PhysicsWorld] ${bodyName} orbit is hyperbolic or invalid (epsilon=${epsilon.toExponential(3)}, a=${semiMajorAxisMeters.toExponential(3)}). Cannot calculate period.`);
                    return [];
                }
                const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxisMeters, 3) / mu);
                period = periodSeconds / Constants.secondsInDay;
            }
        } else {
            // Relative orbit: estimate period using current state
            const parentState = AE.BaryState(AE.Body[getAEBodyName(parentKey)], startJD);
            const bodyState = AE.BaryState(AE.Body[bodyAEName], startJD);
            const r_rel = {
                x: bodyState.x - parentState.x,
                y: bodyState.y - parentState.y,
                z: bodyState.z - parentState.z
            };
            const v_rel = {
                x: (bodyState.vx ?? 0) - (parentState.vx ?? 0),
                y: (bodyState.vy ?? 0) - (parentState.vy ?? 0),
                z: (bodyState.vz ?? 0) - (parentState.vz ?? 0)
            };
            const r_mag_au = Math.sqrt(r_rel.x**2 + r_rel.y**2 + r_rel.z**2);
            const v_mag_au_per_day = Math.sqrt(v_rel.x**2 + v_rel.y**2 + v_rel.z**2);
            const r_mag_m = r_mag_au * metersPerAU;
            const v_mag_m_per_s = v_mag_au_per_day * metersPerAU / Constants.secondsInDay;
            mu = (parentKey === 'earth') ? Constants.earthGravitationalParameter : Constants.sunGravitationalParameter;
            const epsilon = (v_mag_m_per_s**2 / 2) - (mu / r_mag_m);
            semiMajorAxisMeters = -mu / (2 * epsilon);
            if (epsilon >= 0 || semiMajorAxisMeters <= 0) {
                period = 30; // fallback
            } else {
                const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxisMeters, 3) / mu);
                period = periodSeconds / Constants.secondsInDay;
            }
        }
        for (let i = 0; i <= numSteps; i++) {
            const jd = startJD + (i * (period / numSteps));
            const absPos = this._getAbsoluteBaryEclPos(key, jd);
            positions.push(absPos);
        }
        return positions;
    }
} 