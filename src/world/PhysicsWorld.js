import { adaptiveIntegrate } from '../utils/OrbitIntegrator.js';
import { Constants } from '../utils/Constants.js';
import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js.bak';

/**
 * PhysicsWorld handles all orbital dynamics, attracting bodies, and satellite integration.
 */
// Helper to create plain vector objects without three.js
function createVec(x = 0, y = 0, z = 0) { return { x, y, z }; }

// Helper to compute distance between two plain vectors
function vecDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

// Attractor class is now a simple data holder for backend-driven state
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
        const now = Date.now();
        const realDelta = (now - this._lastRealTime) / 1000;
        this._lastRealTime = now;
        const simDelta = realDelta * this.timeWarp;

        this.physicsWorker.postMessage({ type: 'SET_TIME_STEP', payload: simDelta });

        // always integrate satellites
        this._integrateSatellites(simDelta);
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
     * Internal: integrate all satellites and handle SOI transitions
     */
    _integrateSatellites(dt) {
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
} 