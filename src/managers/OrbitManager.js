import * as THREE from 'three';
import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js';
import { stateToKeplerian, getPositionAtTrueAnomaly } from '../utils/KeplerianUtils.js';
import { Constants } from '../utils/Constants.js';

/**
 * OrbitManager handles rendering planetary orbits by propagating a 2-body canonical orbit
 * from the current backend state vector (position, velocity) for each planet/moon.
 *
 * For each planet/moon:
 *   - Uses the latest state vector (already fetched from backend for position update)
 *   - Converts to Keplerian elements
 *   - Samples points along the orbit (0 to 2π true anomaly)
 *   - Draws the orbit as a THREE.Line
 *   - Parents the line to the correct group
 *   - Stores the line in orbitLineMap
 *
 * No backend trajectory fetching is used. Only the current state vector is used.
 */
export class OrbitManager {
    /**
     * @param {Object} options
     * @param {THREE.Scene} options.scene
     * @param {App3D} options.app - Reference to the main App3D instance
     * @param {Object} [options.config]
     * @param {number} [options.config.steps=360]
     * @param {Object<string,number>} [options.config.colors]
     * @param {number} [options.config.lineWidth=1]
     */
    constructor({ scene, app, config = {} }) {
        this.scene = scene;
        this.app = app; // Store app reference
        this.config = Object.assign(
            { steps: 360, colors: {}, lineWidth: 1 },
            config
        );
        this.orbitLineMap = new Map(); // Use a map to store lines by key
        this.resolution = new THREE.Vector2(
            window.innerWidth,
            window.innerHeight
        );
        // Cache for parent orbit groups keyed by lowercase body name
        this._parentGroupCache = null;
    }

    getRootGroup() {
        // Prefer rebaseGroup if available, else fall back to scene
        return this.app.rebaseGroup || this.scene;
    }

    /**
     * Helper to find the appropriate parent group for an orbit line.
     * Uses the 'parent' property from celestialBodiesConfig if present.
     * @param {string} bodyKey - The lowercase name of the orbiting body (e.g., 'moon', 'mars')
     * @returns {THREE.Object3D} The parent group (Scene or Planet's orbit group)
     */
    _getParentGroup(bodyKey) {
        const config = celestialBodiesConfig[bodyKey];
        const parentKey = config && config.parent;
        if (parentKey) {
            // Build cache if needed
            if (!this._parentGroupCache) {
                this._parentGroupCache = new Map();
                this.app.celestialBodies.forEach(b => {
                    if (typeof b.getOrbitGroup === 'function') {
                        this._parentGroupCache.set(b.nameLower, b.getOrbitGroup());
                    }
                });
            }
            const parent = this._parentGroupCache.get(parentKey);
            if (parent) return parent;
        }
        // Default: add to main scene (barycentric orbits)
        return this.scene;
    }

    // Add a helper to centralize GM lookup
    _getGM(barycenterKey) {
        // Try runtime object first
        const barycenterObj = this.app.bodiesByNaifId[celestialBodiesConfig[barycenterKey]?.naif_id];
        if (barycenterObj && barycenterObj.GM) return barycenterObj.GM;
        // Try config
        if (celestialBodiesConfig[barycenterKey]?.GM) return celestialBodiesConfig[barycenterKey].GM;
        // Sum GM of all children if missing
        let sum = 0;
        for (const cfg of Object.values(celestialBodiesConfig)) {
            if (cfg.parent && cfg.parent.toLowerCase() === barycenterKey && cfg.GM) {
                sum += cfg.GM;
            }
        }
        return sum > 0 ? sum : undefined;
    }

    /**
     * Render planetary orbits by propagating a 2-body canonical orbit from the current state vector.
     * Call this after planet positions are updated from the backend.
     */
    renderPlanetaryOrbits() {
        // Remove old lines
        this.orbitLineMap.forEach(line => {
            if (line.parent) line.parent.remove(line);
            line.geometry?.dispose();
            line.material?.dispose();
        });
        this.orbitLineMap.clear();

        const numPoints = 360; // Number of points to sample along the orbit
        // const sceneUnit = 1000; // Convert km to meters for scene units if needed (no longer used)

        // --- Smart debug logging every 5 seconds ---
        if (!this._lastOrbitDebugLog) this._lastOrbitDebugLog = 0;
        const now = Date.now();
        const shouldLog = now - this._lastOrbitDebugLog > 5000;
        if (shouldLog) this._lastOrbitDebugLog = now;
        let debugOrbits = [];
        // Log all celestial bodies (planets, barycenters, moons, etc.)
        const logBodies = this.app.celestialBodies;
        for (const body of logBodies) {
            if (!body.getOrbitGroup || !body.position || !body.velocity) continue;
            const cfg = celestialBodiesConfig[body.nameLower];
            if (!cfg || !cfg.parent) continue; // Must have a parent defined in config
            // --- Robust parent lookup: always use config.parent (barycenter for planets/moons) ---
            const parentKey = cfg.parent.toLowerCase();
            let relPos, relVel, mu;
            let parentObj = null;
            if (parentKey === 'ss_barycenter') {
                // SSB is the inertial origin: position and velocity are (0,0,0)
                relPos = body.position.clone();
                relVel = body.velocity.clone();
                // Use sun's mass for mu if no mass on SSB
                if (celestialBodiesConfig[body.nameLower] && celestialBodiesConfig[body.nameLower].mass) {
                    mu = Constants.G * celestialBodiesConfig[body.nameLower].mass;
                } else if (celestialBodiesConfig.sun && celestialBodiesConfig.sun.mass) {
                    mu = Constants.G * celestialBodiesConfig.sun.mass;
                } else {
                    console.warn(`[OrbitManager] Skipping orbit for ${body.name}: cannot determine mu for SSB parent.`);
                    continue;
                }
            } else {
                const parentCfg = celestialBodiesConfig[parentKey];
                parentObj = parentCfg && typeof parentCfg.naif_id === 'number' ? this.app.bodiesByNaifId[parentCfg.naif_id] : undefined;
                if (!parentObj || !parentObj.position || !parentObj.velocity) {
                    console.warn(`[OrbitManager] Skipping orbit for ${body.name}: missing or invalid parent '${cfg.parent}'.`);
                    continue; // Skip this orbit if parent is missing or invalid
                }
                relPos = body.position.clone().sub(parentObj.position);
                relVel = body.velocity.clone().sub(parentObj.velocity);
                // Compute mu (GM) from parent or barycenter children
                mu = this._getGM(parentKey);
                if (!mu) {
                    if (!window._orbitManagerWarned) window._orbitManagerWarned = new Set();
                    const warnKey = `${body.name}|${cfg.parent}`;
                    if (!window._orbitManagerWarned.has(warnKey)) {
                        window._orbitManagerWarned.add(warnKey);
                        console.warn(`[OrbitManager] Skipping orbit for ${body.name}: parent '${cfg.parent}' has no GM defined or computable.`);
                    }
                    continue;
                }
            }
            const posObj = { x: relPos.x, y: relPos.y, z: relPos.z };
            const velObj = { x: relVel.x, y: relVel.y, z: relVel.z };
            const elements = stateToKeplerian(posObj, velObj, mu, 0);
            // Debug: log Keplerian elements
            // console.log('[LocalOrbit][Elements] Body:', body.name, 'elements:', elements);
            // Only draw orbits for valid elements
            if (!elements || !isFinite(elements.a) || elements.a === 0) continue;
            // Sample points along the orbit
            const points = [];
            for (let i = 0; i <= numPoints; ++i) {
                const f = (i / numPoints) * 2 * Math.PI;
                const p = getPositionAtTrueAnomaly(elements, mu, f);
                if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
                points.push(new THREE.Vector3(p.x, p.y, p.z));
            }
            // Create geometry and line
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: false, opacity: 1, linewidth: 10 });
            const line = new THREE.Line(geometry, material);
            line.frustumCulled = false;
            // Parent to correct group
            this._getParentGroup(body.nameLower).add(line);
            this.orbitLineMap.set(body.nameLower, line);
            debugOrbits.push({
                name: body.name,
                parent: parentObj ? parentObj.name || cfg.parent : cfg.parent,
                relPos: relPos.toArray().map(x => +x.toFixed(2)),
                relVel: relVel.toArray().map(x => +x.toFixed(5)),
                elements: {
                    a: +((elements?.a ?? NaN).toFixed(2)),
                    e: +((elements?.e ?? NaN).toFixed(5)),
                    i: +((elements?.i ?? NaN).toFixed(5)),
                    lan: +((elements?.lan ?? NaN).toFixed(5)),
                    arg_p: +((elements?.arg_p ?? NaN).toFixed(5)),
                    f: +((elements?.f ?? NaN).toFixed(5))
                }
            });
            if (debugOrbits.length >= 20) break;
        }


        // --- Summary logging ---

        // Also render orbits for barycenters (THREE.Group with type === 'barycenter')
        for (const group of Object.values(this.app.bodiesByNaifId)) {
            if (group instanceof THREE.Group && group.type === 'barycenter' && group.position && group.velocity) {
                const cfg = celestialBodiesConfig[group.name];
                if (!cfg) continue;
                // Use parent for mu if available
                let mu = this._getGM(group.name);
                if (!mu) {
                    console.warn(`[OrbitManager] Skipping orbit for ${group.name}: no GM defined or computable.`);
                    continue;
                }
                // Convert to plain objects for KeplerianUtils
                const posObj = { x: group.position.x, y: group.position.y, z: group.position.z };
                const velObj = { x: group.velocity.x, y: group.velocity.y, z: group.velocity.z };
                const elements = stateToKeplerian(posObj, velObj, mu, 0);
                if (!elements || !isFinite(elements.a) || elements.a === 0) continue;
                const points = [];
                for (let i = 0; i <= numPoints; ++i) {
                    const f = (i / numPoints) * 2 * Math.PI;
                    const p = getPositionAtTrueAnomaly(elements, mu, f);
                    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
                    points.push(new THREE.Vector3(p.x, p.y, p.z));
                }
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: false, opacity: 1 });
                const line = new THREE.Line(geometry, material);
                line.frustumCulled = false;
                this.getRootGroup().add(line);
                this.orbitLineMap.set(group.name, line);
            }
        }
        // Ensure orbit line visibility matches display setting
        const show = this.app.getDisplaySetting?.('showPlanetOrbits') ?? true;
        this.setVisible(show);
        // Render local system orbits
        this.renderLocalSystemOrbits();
    }

    /**
     * Update resolution uniform on window resize.
     */
    onResize() {
        this.resolution.set(
            window.innerWidth,
            window.innerHeight
        );
        this.orbitLineMap.forEach(lineOrGroup => {
            // If this is a container group (for relative orbits), update its child Line2
            if (lineOrGroup.type === 'Group') {
                const line = lineOrGroup.children.find(child => child.isLine2);
                if (line && line.material && line.material.resolution) {
                    line.material.resolution.set(
                        window.innerWidth,
                        window.innerHeight
                    );
                    line.material.needsUpdate = true;
                }
            } else if (lineOrGroup.material && lineOrGroup.material.resolution) {
                // Otherwise, update the Line2 directly
                lineOrGroup.material.resolution.set(
                    window.innerWidth,
                    window.innerHeight
                );
                lineOrGroup.material.needsUpdate = true;
            }
        });
    }

    // Optional: Method to toggle visibility
    setVisible(visible) {
        this.orbitLineMap.forEach(line => {
            line.visible = visible;
        });
    }

    /**
     * Render local system orbits: planets around barycenters, moons around system barycenters.
     */
    renderLocalSystemOrbits() {
        const numPoints = 360;
        // Remove old local system lines if any
        if (!this.localOrbitLineMap) this.localOrbitLineMap = new Map();
        this.localOrbitLineMap.forEach(line => {
            if (line.parent) line.parent.remove(line);
            line.geometry?.dispose();
            line.material?.dispose();
        });
        this.localOrbitLineMap.clear();

        const logBodies = this.app.celestialBodies;
        for (const body of logBodies) {
            const cfg = celestialBodiesConfig[body.nameLower];
            if (!cfg || !cfg.parent) continue; // Skip bodies without a parent
            // Remove noisy logs, keep only warnings for near-zero relPos/relVel
            let parentKey = cfg.parent.toLowerCase();
            let barycenterKey = null;
            if (cfg.type === 'planet' && celestialBodiesConfig[parentKey]?.type === 'barycenter') {
                barycenterKey = parentKey;
            } else if (cfg.type === 'moon') {
                barycenterKey = parentKey; // Use the moon's parent directly (planet's barycenter)
            }

            const barycenterObj = this.app.bodiesByNaifId[celestialBodiesConfig[barycenterKey]?.naif_id];
            // Defensive: ensure barycenterObj and its position/velocity are defined
            if (!barycenterKey || !barycenterObj || !barycenterObj.position || !barycenterObj.velocity) continue;

            let referenceObj = barycenterObj;
            let mu = this._getGM(barycenterKey);
            // For moons, use the planet's SSB state vector as the reference
            if (cfg.type === 'moon') {
                const planetKey = Object.keys(celestialBodiesConfig).find(
                    k => celestialBodiesConfig[k].naif_id && celestialBodiesConfig[k].naif_id !== undefined &&
                        celestialBodiesConfig[k].parent && celestialBodiesConfig[k].parent.toLowerCase() === barycenterKey &&
                        celestialBodiesConfig[k].type === 'planet' &&
                        body.parent && body.parent.toLowerCase() === barycenterKey &&
                        body.nameLower !== barycenterKey
                );
                if (planetKey && this.app.bodiesByNaifId[celestialBodiesConfig[planetKey].naif_id]) {
                    referenceObj = this.app.bodiesByNaifId[celestialBodiesConfig[planetKey].naif_id];
                    mu = this._getGM(planetKey);
                }
            }
            // Defensive: ensure referenceObj and its position/velocity are defined
            if (!barycenterKey || !referenceObj || !referenceObj.position || !referenceObj.velocity) continue;
            // Debug: log velocities before computing relVel
            // if (body && referenceObj) {
            //     console.log('[LocalOrbit][Debug] Body:', body.name, 'velocity:', body.velocity?.toArray?.(), 'Reference:', referenceObj.name || barycenterKey, 'velocity:', referenceObj.velocity?.toArray?.());
            // }
            const relPos = body.position.clone().sub(referenceObj.position);
            const relVel = body.velocity.clone().sub(referenceObj.velocity);
            // Strict guard: skip if relPos or relVel are exactly zero (degenerate)
            if (relPos.length() === 0 || relVel.length() === 0) continue;
            // Check if barycenter has only one child (the current body)
            const barycenterChildren = Object.values(celestialBodiesConfig).filter(cfg => cfg.parent && cfg.parent.toLowerCase() === barycenterKey);
            const isSingleBodyBarycenter = barycenterChildren.length === 1;
            // Silently skip if planet and barycenter are physically coincident
            if ((relPos.length() < 1e-3 || relVel.length() < 1e-6) && cfg.type === 'planet' && referenceObj.type === 'barycenter') {
                continue;
            }
            if ((relPos.length() < 1e-3 || relVel.length() < 1e-6) && isSingleBodyBarycenter) {
                // Skip degenerate local orbit for single-body barycenter (e.g., Mercury)
                continue;
            }
            if (!mu) continue;
            const posObj = { x: relPos.x, y: relPos.y, z: relPos.z };
            const velObj = { x: relVel.x, y: relVel.y, z: relVel.z };
            const elements = stateToKeplerian(posObj, velObj, mu, 0);
            // Strict guard: skip if elements is null or any element is not finite
            if (!elements || !isFinite(elements.a) || !isFinite(elements.e) || !isFinite(elements.i) || !isFinite(elements.lan) || !isFinite(elements.arg_p) || !isFinite(elements.f) || elements.a === 0) continue;
            const points = [];
            for (let i = 0; i <= numPoints; ++i) {
                const f = (i / numPoints) * 2 * Math.PI;
                const p = getPositionAtTrueAnomaly(elements, mu, f);
                if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
                points.push(new THREE.Vector3(p.x, p.y, p.z).add(referenceObj.position));
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const color = cfg.type === 'planet' ? 0x00ff00 : 0x3399ff;
            const material = new THREE.LineBasicMaterial({ color, transparent: false, opacity: 1, linewidth: 2 });
            const line = new THREE.Line(geometry, material);
            line.frustumCulled = false;
            // Add to barycenter's orbit group if available, else to scene
            const parentGroup = barycenterObj.getOrbitGroup ? barycenterObj.getOrbitGroup() : this.scene;
            parentGroup.add(line);
            this.localOrbitLineMap.set(body.nameLower, line);
            
        }
    }
} 