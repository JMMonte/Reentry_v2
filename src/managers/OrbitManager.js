import * as THREE from 'three';
import { LineGeometry } from 'three-stdlib';
import { LineMaterial } from 'three-stdlib';
import { Line2 } from 'three-stdlib';
import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js';

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
        this.orbitLineMap.clear();
        const planetKeys = Object.keys(celestialBodiesConfig)
            .filter(key => !['sun','barycenter'].includes(key));
        
        for (const key of planetKeys) {
            try {
                const config = celestialBodiesConfig[key];
                const parentKey = config && config.parent;
                let positions = this.physicsWorld.generateOrbitPath(
                    key, this.config.steps
                );
                // If the body has a parent, render its orbit relative to the parent's barycentric path
                if (parentKey) {
                    const parentPositions = this.physicsWorld.generateOrbitPath(parentKey, this.config.steps);
                    if (positions.length === parentPositions.length) {
                        // Compute relative positions
                        const relPositions = positions.map((pos, i) => pos.clone().sub(parentPositions[i]));
                        const bodyCurrent = this.physicsWorld.bodies.find(b => b.nameLower === key)?.position;
                        if (bodyCurrent && relPositions.length > 0) {
                            const rel0 = relPositions[0];
                            positions = relPositions.map(rel => bodyCurrent.clone().add(rel.clone().sub(rel0)));
                        } else {
                            positions = relPositions;
                        }
                    }
                }
                if (!positions?.length) continue;

                // Collect raw orbit points
                let points = [];
                positions.forEach(v => points.push(v.x, v.y, v.z));
                // No rotation or alignment needed! Use points as-is.



                // Skip line creation if only one point (or fewer)
                if (points.length <= 3) {
                    console.warn(`[OrbitManager] Not enough points to draw a line for ${key}.`);
                    continue;
                }

                const geometry = new LineGeometry();
                geometry.setPositions(points);

                const material = new LineMaterial({
                    color: this.config.colors[key] || 0xffffff,
                    linewidth: this.config.lineWidth,
                    dashed: false,
                    resolution: this.resolution
                });

                const line = new Line2(geometry, material);
                line.computeLineDistances();
                line.name = `${key}OrbitLine`;

                // Add orbit line to its parent group (main scene or planet)
                const parentGroup = this._getParentGroup(key);
                parentGroup.add(line);
                this.orbitLineMap.set(key, line);

                if (key === 'earth' || key === 'moon') {
                    console.log(`[OrbitManager] Added orbit line for ${key} to`, parentGroup.name || parentGroup.constructor.name, 'with', points.length / 3, 'points');
                }

                // Remove any rotation for relative orbits; render as-is from ephemeris data
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
} 