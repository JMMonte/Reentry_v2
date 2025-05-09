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
            // Use precomputed lowercase name
            const keyLower = inst.nameLower;
            const cfg = celestialBodiesConfig[keyLower];
            if (!cfg) throw new Error(`No config found for body '${keyLower}'`);
            // compute sphere-of-influence radius in scene units
            const soi = (cfg.soiRadius || 0) * (cfg.radius || 1);

            return {
                name: inst.name,
                // Cache lowercase name for string lookups
                nameLower: keyLower,
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
            if (body.nameLower === 'earth') {
                const key = 'Earth';
                const equState = AE.BaryState(AE.Body[key], julianDate);
                const eclCoords = AE.Ecliptic(equState).vec;
                earthPos = new THREE.Vector3(eclCoords.x * kmPerAU, eclCoords.y * kmPerAU, eclCoords.z * kmPerAU);
                earthMass = body.mass;
            }
            if (body.nameLower === 'moon') {
                const key = 'Moon';
                const equState = AE.BaryState(AE.Body[key], julianDate);
                const eclCoords = AE.Ecliptic(equState).vec;
                moonPos = new THREE.Vector3(eclCoords.x * kmPerAU, eclCoords.y * kmPerAU, eclCoords.z * kmPerAU);
                moonMass = body.mass;
            }
        });
        this.bodies.forEach(body => {
            const keyLower = body.nameLower;
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

    /**
     * Generate propagated orbit positions around a moving parent based on config.
     */
    generateOrbitPath(bodyName, numSteps = 360) {
        const key = bodyName.toLowerCase();
        const config = celestialBodiesConfig[key];
        if (!config || key === 'barycenter') return [];
        const parentKey = config.parent;
        const childAE = getAEBodyName(key);
        if (!isAEBody(childAE)) {
            console.warn(`[PhysicsWorld] Skipping orbit for unsupported body: ${bodyName}`);
            return [];
        }
        const parentAE = parentKey && parentKey !== 'barycenter' ? getAEBodyName(parentKey) : null;
        const startJD = this.timeUtils.getJulianDate();
        const kmPerAU = Constants.AU * Constants.metersToKm;

        const orbitType = config.orbitType || 'absolute';
        // If relative orbit, compute child - parent for each time step
        if (orbitType === 'relative' && parentKey) {
            // Always compute periodDays generically for all bodies
            let periodDays = 30;
            const cs0 = AE.BaryState(AE.Body[childAE], startJD);
            const ps0 = AE.BaryState(AE.Body[getAEBodyName(parentKey)], startJD);
            const r0 = { x: cs0.x - ps0.x, y: cs0.y - ps0.y, z: cs0.z - ps0.z };
            const v0 = { x: (cs0.vx||0) - (ps0.vx||0), y: (cs0.vy||0) - (ps0.vy||0), z: (cs0.vz||0) - (ps0.vz||0) };
            const r_m = Math.hypot(r0.x, r0.y, r0.z) * Constants.AU;
            const v_m_s = Math.hypot(v0.x, v0.y, v0.z) * Constants.AU / Constants.secondsInDay;
            const mu = parentKey === 'earth' ? Constants.earthGravitationalParameter : Constants.sunGravitationalParameter;
            const epsilon = (v_m_s**2) / 2 - mu / r_m;
            if (epsilon < 0) {
                const a = -mu / (2 * epsilon);
                periodDays = 2 * Math.PI * Math.sqrt(a**3 / mu) / Constants.secondsInDay;
            }
            const positions = [];
            for (let i = 0; i <= numSteps; i++) {
                const jd = startJD + (i * (periodDays / numSteps));
                const cstate = AE.BaryState(AE.Body[childAE], jd);
                const cecl = AE.Ecliptic(cstate).vec;
                const pstate = AE.BaryState(AE.Body[getAEBodyName(parentKey)], jd);
                const pecl = AE.Ecliptic(pstate).vec;
                positions.push(new THREE.Vector3(
                    (cecl.x - pecl.x) * kmPerAU,
                    (cecl.y - pecl.y) * kmPerAU,
                    (cecl.z - pecl.z) * kmPerAU
                ));
            }
            return positions;
        }
        // Otherwise, use absolute barycentric path
        let periodDays = 30;
        {
            const cs0 = AE.BaryState(AE.Body[childAE], startJD);
            const ps0 = parentAE ? AE.BaryState(AE.Body[parentAE], startJD) : { x:0, y:0, z:0, vx:0, vy:0, vz:0 };
            const r0 = { x: cs0.x - ps0.x, y: cs0.y - ps0.y, z: cs0.z - ps0.z };
            const v0 = { x: (cs0.vx||0) - (ps0.vx||0), y: (cs0.vy||0) - (ps0.vy||0), z: (cs0.vz||0) - (ps0.vz||0) };
            const r_m = Math.hypot(r0.x, r0.y, r0.z) * Constants.AU;
            const v_m_s = Math.hypot(v0.x, v0.y, v0.z) * Constants.AU / Constants.secondsInDay;
            const mu = parentKey === 'earth' ? Constants.earthGravitationalParameter : Constants.sunGravitationalParameter;
            const epsilon = (v_m_s**2) / 2 - mu / r_m;
            if (epsilon < 0) {
                const a = -mu / (2 * epsilon);
                periodDays = 2 * Math.PI * Math.sqrt(a**3 / mu) / Constants.secondsInDay;
            }
        }
        const positions = [];
        for (let i = 0; i <= numSteps; i++) {
            const jd = startJD + (i * (periodDays / numSteps));
            const cstate = AE.BaryState(AE.Body[childAE], jd);
            const cecl = AE.Ecliptic(cstate).vec;
            positions.push(new THREE.Vector3(
                cecl.x * kmPerAU,
                cecl.y * kmPerAU,
                cecl.z * kmPerAU
            ));
        }
        return positions;
    }
} 