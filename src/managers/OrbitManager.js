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
        if (parentKey && this.app.celestialBodies) {
            // Find the parent planet instance by name (case-insensitive)
            const parent = this.app.celestialBodies.find(
                b => b.name && b.name.toLowerCase() === parentKey
            );
            if (parent && typeof parent.getUnrotatedGroup === 'function') {
                return parent.getUnrotatedGroup();
            }
        }
        // Default: add to scene (barycentric orbits)
        return this.scene;
    }

    /**
     * Sample orbits and build Line2 objects for each planet,
     * adding them to their respective parent objects.
     */
    build() {
        this.orbitLineMap.clear(); // Clear previous lines if rebuild
        // Only planets (skip sun)
        const planetKeys = Object.keys(celestialBodiesConfig).filter(
            key => key !== 'sun' // We now calculate period dynamically
        );
        
        for (const key of planetKeys) {
            try {
                const positions = this.physicsWorld.generateOrbitPath(
                    key,
                    this.config.steps
                );
                if (!positions || positions.length === 0) {
                    console.warn(`[OrbitManager] Not enough points to draw a line for ${key}.`);
                    continue; // Skip this planet
                }
                
                const points = [];
                positions.forEach(v => points.push(v.x, v.y, v.z));

                // Debug: log orbit point ranges for earth and moon
                if (key === 'earth' || key === 'moon') {
                    const xs = positions.map(p => p.x);
                    const ys = positions.map(p => p.y);
                    const zs = positions.map(p => p.z);
                    console.log(`[OrbitManager] ${key} orbit X range:`, Math.min(...xs), Math.max(...xs));
                    console.log(`[OrbitManager] ${key} orbit Y range:`, Math.min(...ys), Math.max(...ys));
                    console.log(`[OrbitManager] ${key} orbit Z range:`, Math.min(...zs), Math.max(...zs));
                }

                // Skip line creation if only one point (or fewer)
                if (points.length <= 3) {
                    console.warn(`[OrbitManager] Not enough points to draw a line for ${key}.`);
                    continue;
                }

                const geometry = new LineGeometry();
                geometry.setPositions(points);

                const color = (key === 'earth' || key === 'moon') ? 0xff00ff : (this.config.colors[key] || 0xffffff);
                const material = new LineMaterial({
                    color,
                    linewidth: (key === 'earth' || key === 'moon') ? 10 : this.config.lineWidth,
                    dashed: false,
                    resolution: this.resolution,
                    // sizeAttenuation: true, // Set true if linewidth is in screen pixels
                    // vertexColors: false,
                    // worldUnits: false // Set true if linewidth is in world units (requires sizeAttenuation=false)
                });

                const line = new Line2(geometry, material);
                line.computeLineDistances();
                line.name = `${key}OrbitLine`; // Add a name for debugging
                this.orbitLineMap.set(key, line); // Store in map

                // Determine and add to the correct parent
                const parentGroup = this._getParentGroup(key);
                parentGroup.add(line);

                if (key === 'earth' || key === 'moon') {
                    console.log(`[OrbitManager] Added orbit line for ${key} to`, parentGroup.name || parentGroup.constructor.name, 'with', points.length / 3, 'points');
                }
            } catch (error) {
                console.error(`[OrbitManager] Failed to build orbit for ${key}:`, error);
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
        this.orbitLineMap.forEach(line => {
            line.material.resolution.set(
                window.innerWidth,
                window.innerHeight
            );
            line.material.needsUpdate = true;
        });
    }

    // Optional: Method to toggle visibility
    setVisible(visible) {
        this.orbitLineMap.forEach(line => {
            line.visible = visible;
        });
    }
} 