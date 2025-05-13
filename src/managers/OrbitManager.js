import * as THREE from 'three';
import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js.bak';

/**
 * OrbitManager handles sampling planetary orbits from Backend stream
 * and rendering them as fat lines using Three.js Line2,
 * attaching them to the correct parent object (scene root or parent planet).
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