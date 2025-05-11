import * as THREE from 'three';
import { LineGeometry } from 'three-stdlib';
import { LineMaterial } from 'three-stdlib';
import { Line2 } from 'three-stdlib';
import { celestialBodiesConfig, orbitColors } from '../config/celestialBodiesConfig.js';
import { stateToKeplerian, getPositionAtTrueAnomaly } from '../utils/KeplerianUtils.js';

/**
 * OrbitManager handles sampling planetary orbits from PhysicsWorld
 * and rendering them as fat lines using Three.js Line2,
 * attaching them to the correct parent object (scene root or parent planet).
 */
export class OrbitManager {
    /**
     * @param {Object} options
     * @param {PhysicsWorld} options.physicsWorld
     * @param {THREE.Scene} options.scene
     * @param {App3D} options.app - Reference to the main App3D instance
     * @param {Object} [options.config]
     * @param {number} [options.config.steps=360]
     * @param {Object<string,number>} [options.config.colors]
     * @param {number} [options.config.lineWidth=1]
     */
    constructor({ physicsWorld, scene, app, config = {} }) {
        this.physicsWorld = physicsWorld;
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
     * Sample orbits and build Line2 objects for each planet,
     * adding them to their respective parent objects.
     */
    build() {
        // Dispose of existing orbit lines before rebuilding
        this.orbitLineMap.forEach(lineOrGroup => {
            if (lineOrGroup.type === 'Group') {
                // If this is a container group (for relative orbits), dispose its child Line2
                const line = lineOrGroup.children.find(child => child.isLine2);
                if (line) {
                    line.geometry?.dispose?.();
                    line.material?.dispose?.();
                    lineOrGroup.remove(line);
                }
                // Remove the group from its parent
                if (lineOrGroup.parent) {
                    lineOrGroup.parent.remove(lineOrGroup);
                }
            } else {
                // Otherwise, dispose the Line2 directly
                lineOrGroup.geometry?.dispose?.();
                lineOrGroup.material?.dispose?.();
                if (lineOrGroup.parent) {
                    lineOrGroup.parent.remove(lineOrGroup);
                }
            }
        });
        this.orbitLineMap.clear();
        const planetKeys = Object.keys(celestialBodiesConfig)
            .filter(key => !['sun','barycenter'].includes(key));
        
        for (const key of planetKeys) {
            try {
                const config = celestialBodiesConfig[key];
                const parentKey = config && config.parent;
                // --- NEW: Get state vector in ecliptic frame, relative to parent ---
                const state = this.physicsWorld.getBodyStateVectorEcliptic(key, parentKey);
                if (!state) continue;
                // Get parent mu (gravitational parameter) in km^3/s^2
                const G = this.app.Constants.G;
                let mass = null;
                if (parentKey && celestialBodiesConfig[parentKey] && celestialBodiesConfig[parentKey].mass) {
                    mass = celestialBodiesConfig[parentKey].mass;
                } else if (key === 'earth') {
                    mass = this.app.Constants.earthMass;
                } else if (key === 'moon') {
                    mass = this.app.Constants.moonMass;
                } else {
                    mass = this.app.Constants.sunMass;
                }
                const mu = G * mass / 1e9; // convert from m^3/s^2 to km^3/s^2
                // Defensive: log state and mu before computing Keplerian elements
                console.log(`[OrbitManager] State for ${key}:`, state, 'mu:', mu);
                // Log relative position and velocity
                console.log(`[OrbitManager] Relative position for ${key}:`, state.position);
                console.log(`[OrbitManager] Relative velocity for ${key}:`, state.velocity);
                // Log magnitudes and dot product
                const posMag = Math.sqrt(state.position.x**2 + state.position.y**2 + state.position.z**2);
                const velMag = Math.sqrt(state.velocity.x**2 + state.velocity.y**2 + state.velocity.z**2);
                const dot = state.position.x * state.velocity.x + state.position.y * state.velocity.y + state.position.z * state.velocity.z;
                console.log(`[OrbitManager] |position| for ${key}:`, posMag);
                console.log(`[OrbitManager] |velocity| for ${key}:`, velMag);
                console.log(`[OrbitManager] dot(position, velocity) for ${key}:`, dot);
                // Compute Keplerian elements
                const epochJD = this.physicsWorld.timeUtils.getJulianDate();
                const elements = stateToKeplerian(state.position, state.velocity, mu, epochJD);
                // Log computed Keplerian elements
                console.log(`[OrbitManager] Keplerian elements for ${key}:`, elements);
                // Defensive: check for NaN/Infinity in elements
                if (!isFinite(elements.a) || isNaN(elements.a) ||
                    !isFinite(elements.e) || isNaN(elements.e) ||
                    !isFinite(elements.i) || isNaN(elements.i) ||
                    !isFinite(elements.lan) || isNaN(elements.lan) ||
                    !isFinite(elements.arg_p) || isNaN(elements.arg_p)) {
                    console.warn(`[OrbitManager] Invalid Keplerian elements for ${key}:`, elements, state, mu);
                    continue;
                }
                // Sample points along the conic
                const steps = this.config.steps;
                let points = [];
                for (let i = 0; i <= steps; i++) {
                    const nu = 2 * Math.PI * (i / steps);
                    const pos = getPositionAtTrueAnomaly(elements, mu, nu);
                    if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
                        // Skip NaN/Infinity points
                        continue;
                    }
                    points.push(pos.x, pos.y, pos.z);
                }
                // Skip line creation if only one point (or fewer)
                if (points.length <= 3) {
                    console.warn(`[OrbitManager] Not enough valid points to draw a line for ${key}.`);
                    continue;
                }
                const geometry = new LineGeometry();
                geometry.setPositions(points);
                const material = new LineMaterial({
                    color: this.config.colors[key] ?? orbitColors[key] ?? 0xffffff,
                    linewidth: this.config.lineWidth,
                    dashed: false,
                    resolution: this.resolution
                });
                const line = new Line2(geometry, material);
                line.computeLineDistances();
                line.name = `${key}OrbitLine`;
                // Add orbit line to its parent group (main scene or planet)
                const parentGroup = this._getParentGroup(key);
                if (parentKey) {
                    // Wrap in a group to cancel the parent's rotation
                    const compGroup = new THREE.Group();
                    compGroup.quaternion.copy(parentGroup.quaternion).invert();
                    compGroup.add(line);
                    parentGroup.add(compGroup);
                    this.orbitLineMap.set(key, compGroup);
                } else {
                    parentGroup.add(line);
                    this.orbitLineMap.set(key, line);
                }
            } catch (e) {
                console.error(`OrbitManager build failed for ${key}:`, e);
            }
        }
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
        this.build();
    }
} 