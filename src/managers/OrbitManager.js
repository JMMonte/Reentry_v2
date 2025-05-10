import * as THREE from 'three';
import { LineGeometry } from 'three-stdlib';
import { LineMaterial } from 'three-stdlib';
import { Line2 } from 'three-stdlib';
import { celestialBodiesConfig, orbitColors } from '../config/celestialBodiesConfig.js';

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
                // Generate orbit path (relative to parent if provided)
                const positions = this.physicsWorld.generateOrbitPath(
                    key,
                    this.config.steps,
                    parentKey
                );
                if (!positions.length) continue;

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

                // Compute per-vertex colors to fade further-away-in-time segments
                const colors = [];
                const pointCount = positions.length;
                // Base color from config override or orbitColors
                const baseColorInt = this.config.colors[key] ?? orbitColors[key] ?? 0xffffff;
                const tmpColor = new THREE.Color(baseColorInt);
                for (let i = 0; i < pointCount; i++) {
                    const t = i / (pointCount - 1);
                    // Fade: alpha from 1 (now) to 0 (furthest)
                    colors.push(tmpColor.r, tmpColor.g, tmpColor.b, 1 - t);
                }
                // Assign per-vertex colors (with alpha) for fading effect
                geometry.setColors(colors, 4);

                const material = new LineMaterial({
                    // Use per-vertex colors (RGBA) for fade
                    vertexColors: true,
                    transparent: true,
                    color: 0xffffff,
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