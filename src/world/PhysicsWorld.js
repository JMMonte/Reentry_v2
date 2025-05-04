import * as THREE from 'three';
import { adaptiveIntegrate } from '../utils/OrbitIntegrator.js';
import { Constants } from '../utils/Constants.js';
import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js';
import * as AE from 'astronomy-engine';  // for planetary ephemeris

/**
 * PhysicsWorld handles all orbital dynamics, attracting bodies, and satellite integration.
 */
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
            return {
                name: inst.name,
                orbitElements: cfg.orbitElements || null,
                orbitRadius: cfg.orbitRadius || 0,
                mass: cfg.mass || 0,
                soiRadius: soi,
                position: new THREE.Vector3()
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
        // Update all attractor positions using barycentric ephemeris in kilometers
        const kmPerAU = Constants.AU * Constants.metersToKm;
        this.bodies.forEach(body => {
            const keyLower = body.name.toLowerCase();
            // keep barycenter at origin
            if (keyLower === 'barycenter') {
                body.position.set(0, 0, 0);
                return;
            }
            // special-case Moon: use geocentric ecliptic vector and offset by Earth
            if (keyLower === 'moon') {
                // find Earth's current position in km
                const earth = this.bodies.find(b => b.name.toLowerCase() === 'earth');
                if (!earth) return;
                // get Moon's geocentric equatorial vector in AU (aberration=false)
                const geo = AE.GeoVector(AE.Body.Moon, julianDate, false);
                // convert to true ecliptic coordinates of date
                const ecl = AE.Ecliptic(geo).vec;
                // convert AU to kilometers and offset by Earth's barycentric position
                body.position.set(
                    earth.position.x + ecl.x * kmPerAU,
                    earth.position.y + ecl.y * kmPerAU,
                    earth.position.z + ecl.z * kmPerAU
                );
                return;
            }
            // map to Astronomy Engine Body enum
            const key = body.name.charAt(0).toUpperCase() + body.name.slice(1);
            if (!AE.Body[key]) {
                console.warn(`Unknown astronomy-engine body: ${body.name}`);
                return;
            }
            // get barycentric equatorial state in astronomical units (AU)
            const equState = AE.BaryState(AE.Body[key], julianDate);
            // convert to true ecliptic of date coordinates (remove Earth's axial tilt)
            const eclCoords = AE.Ecliptic(equState).vec;
            // convert AU to kilometers and set position in ecliptic plane
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
} 