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
        const sceneUnit = 1000; // Convert km to meters for scene units if needed

        console.log('[OrbitManager] renderPlanetaryOrbits: processing', this.app.celestialBodies.length, 'bodies');

        for (const body of this.app.celestialBodies) {
            // Only process planets/moons with position and velocity
            if (!body.getOrbitGroup || !body.position || !body.velocity) {
                console.log(`[OrbitManager] Skipping ${body.name} (missing getOrbitGroup/position/velocity)`);
                continue;
            }
            const group = this._getParentGroup(body.nameLower);
            // Get state vector in km, km/s
            const pos = body.position; // THREE.Vector3, km
            const vel = body.velocity; // THREE.Vector3, km/s
            if (!pos || !vel) {
                console.log(`[OrbitManager] Skipping ${body.name} (no pos/vel)`);
                continue;
            }
            console.log(`[OrbitManager] ${body.name}: pos=`, pos, 'vel=', vel);

            // Convert to plain objects for KeplerianUtils
            const posObj = { x: pos.x, y: pos.y, z: pos.z };
            const velObj = { x: vel.x, y: vel.y, z: vel.z };
            // Use GM of parent body if available, else fallback to sun
            const cfg = celestialBodiesConfig[body.nameLower];
            let mu = Constants.sunGravitationalParameter;
            if (cfg && cfg.parent && celestialBodiesConfig[cfg.parent] && celestialBodiesConfig[cfg.parent].mass) {
                mu = Constants.G * celestialBodiesConfig[cfg.parent].mass;
            } else if (cfg && cfg.mass) {
                mu = Constants.G * cfg.mass;
            }
            // Get orbital elements
            const elements = stateToKeplerian(posObj, velObj, mu, 0);
            if (!elements || !isFinite(elements.a) || elements.a === 0) {
                console.log(`[OrbitManager] Skipping ${body.name} (invalid elements)`, elements);
                continue;
            }
            // Sample points along the orbit
            const points = [];
            for (let i = 0; i <= numPoints; ++i) {
                const f = (i / numPoints) * 2 * Math.PI;
                const p = getPositionAtTrueAnomaly(elements, mu, f);
                // Convert km to meters for scene units
                points.push(new THREE.Vector3(p.x * sceneUnit, p.y * sceneUnit, p.z * sceneUnit));
            }
            // Create geometry and line
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: false, opacity: 1 });
            const line = new THREE.Line(geometry, material);
            line.frustumCulled = false;
            // Parent to correct group
            group.add(line);
            this.orbitLineMap.set(body.nameLower, line);
            console.log(`[OrbitManager] Orbit line created for ${body.name}`);
        }
    }

    /**
     * Sample orbits and build Line2 objects for each planet,
     * adding them to their respective parent objects.
     */
    build() {
        console.warn('[OrbitManager] build disabled; using sim stream for planet positions');
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
     * Update all orbits (rebuilds all orbit lines). Call this once per simulation timestep.
     */
    update() {
        console.warn('[OrbitManager] update disabled; using sim stream for planet positions');
    }
} 