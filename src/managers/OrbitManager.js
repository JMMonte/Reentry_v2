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
                let mu = null;
                if (parentObj && parentObj.GM) {
                    mu = parentObj.GM;
                } else if (parentCfg && parentCfg.type === 'barycenter') {
                    // Sum GM of all children of this barycenter (planets/moons with this parent)
                    mu = Object.values(this.app.bodiesByNaifId)
                        .filter(child => child.parent && child.parent.toLowerCase() === parentKey && child.GM)
                        .reduce((sum, child) => sum + child.GM, 0);
                }
                // Throttle warning to once per body/parent pair
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
            // Only draw orbits for valid elements
            if (!elements || !isFinite(elements.a) || elements.a === 0) continue;
            // Sample points along the orbit
            const points = [];
            for (let i = 0; i <= numPoints; ++i) {
                const f = (i / numPoints) * 2 * Math.PI;
                const p = getPositionAtTrueAnomaly(elements, mu, f);
                // Use km directly for scene units (no conversion)
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
        if (shouldLog && debugOrbits.length) {
            // console.log('[OrbitManager] Planets & barycenters debug sample:', debugOrbits);
        }

        // --- Summary logging ---

        // Also render orbits for barycenters (THREE.Group with type === 'barycenter')
        for (const group of Object.values(this.app.bodiesByNaifId)) {
            if (group instanceof THREE.Group && group.type === 'barycenter' && group.position && group.velocity) {
                const cfg = celestialBodiesConfig[group.name];
                if (!cfg) continue;
                // Use parent for mu if available
                let mu = Constants.sunGravitationalParameter;
                if (cfg.parent && celestialBodiesConfig[cfg.parent] && celestialBodiesConfig[cfg.parent].mass) {
                    mu = Constants.G * celestialBodiesConfig[cfg.parent].mass;
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
} 