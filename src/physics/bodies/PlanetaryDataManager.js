/**
 * Planetary Data Manager
 * 
 * Centralized system for managing all planetary data including:
 * - Physical properties (mass, radius, etc.)
 * - Orbital mechanics data
 * - Rendering configurations
 * - Hierarchical relationships
 * - Astronomy Engine integration
 */

import { Planet } from '../../components/planet/Planet.js';

export class PlanetaryDataManager {
    constructor() {
        this.bodies = new Map();
        this.naifToBody = new Map();
        this.hierarchyTree = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the planetary data manager
     */
    async initialize() {
        if (this.initialized) return;

        // Load all planetary configurations
        await this._loadPlanetaryConfigurations();

        // Build hierarchy relationships
        this._buildHierarchyTree();

        this.initialized = true;
    }

    /**
     * Get body configuration by name
     */
    getBodyByName(name) {
        return this.bodies.get(name);
    }

    /**
     * Get body configuration by NAIF ID
     */
    getBodyByNaif(naifId) {
        return this.naifToBody.get(naifId);
    }

    /**
     * Get all bodies of a specific type
     */
    getBodiesByType(type) {
        return Array.from(this.bodies.values()).filter(body => body.type === type);
    }

    /**
     * Get children of a body in the hierarchy
     */
    getChildren(bodyName) {
        return this.hierarchyTree.get(bodyName) || [];
    }

    /**
     * Get parent of a body in the hierarchy
     */
    getParent(bodyName) {
        const body = this.bodies.get(bodyName);
        return body ? body.parent : null;
    }

    /**
     * Get all bodies in hierarchical order
     */
    getHierarchicalOrder() {
        const ordered = [];
        const visited = new Set();

        const traverse = (bodyName) => {
            if (visited.has(bodyName)) return;
            visited.add(bodyName);

            const body = this.bodies.get(bodyName);
            if (body) {
                ordered.push(body);
                const children = this.getChildren(bodyName);
                children.forEach(child => traverse(child));
            }
        };

        // Start with root bodies (no parent)
        Array.from(this.bodies.values())
            .filter(body => !body.parent)
            .forEach(body => traverse(body.name));

        return ordered;
    }

    /**
     * Get physics properties for a body
     */
    getPhysicsProperties(bodyName) {
        const body = this.bodies.get(bodyName);
        if (!body) return null;

        return {
            naif_id: body.naif_id,
            mass: body.mass,
            radius: body.radius,
            GM: body.GM,
            oblateness: body.oblateness || 0,
            rotationPeriod: body.rotationPeriod,
            soiRadius: body.soiRadius
        };
    }

    /**
     * Get rendering properties for a body
     */
    getRenderingProperties(bodyName) {
        const body = this.bodies.get(bodyName);
        if (!body) return null;

        return {
            materials: body.materials,
            lodLevels: body.lodLevels,
            atmosphere: body.atmosphere,
            rings: body.rings,
            addRings: body.addRings,
            cloudThickness: body.cloudThickness,
            addLight: body.addLight,
            lightOptions: body.lightOptions,
            radialGridConfig: body.radialGridConfig
        };
    }

    /**
     * Get orbital properties for a body
     */
    getOrbitalProperties(bodyName) {
        const body = this.bodies.get(bodyName);
        if (!body) return null;

        return {
            parent: body.parent,
            naif_id: body.naif_id,
            type: body.type,
            GM: body.GM,
            soiRadius: body.soiRadius
        };
    }

    /**
     * Private: Load all planetary configurations
     */
    async _loadPlanetaryConfigurations() {
        // Import all individual planet configurations
        const configs = await Promise.all([
            import('./planets/Sun.js'),
            import('./planets/Mercury.js'),
            import('./planets/Venus.js'),
            import('./planets/Earth.js'),
            import('./planets/Mars.js'),
            import('./planets/Jupiter.js'),
            import('./planets/Saturn.js'),
            import('./planets/Uranus.js'),
            import('./planets/Neptune.js'),
            import('./planets/Pluto.js'),
            import('./barycenters/Barycenters.js'),
            import('./moons/EarthMoons.js'),
            import('./moons/MarsMoons.js'),
            import('./moons/JupiterMoons.js'),
            import('./moons/SaturnMoons.js'),
            import('./moons/UranusMoons.js'),
            import('./moons/NeptuneMoons.js'),
            import('./moons/PlutoMoons.js')
        ]);

        // Register all configurations
        configs.forEach(module => {
            const config = module.default || module;
            if (Array.isArray(config)) {
                config.forEach(body => this._registerBody(body));
            } else {
                this._registerBody(config);
            }
        });
    }

    /**
     * Private: Register a body configuration
     */
    _registerBody(bodyConfig) {
        // Clone the configuration to avoid modifying the original
        const config = { ...bodyConfig };
        
        // Resolve LOD levels if lodLevelsKey is present but lodLevels is not
        if (config.lodLevelsKey && !config.lodLevels && config.radius) {
            config.lodLevels = Planet.generateLodLevelsForRadius(config.radius, config.lodLevelsKey);
        }
        
        // Map orbitalElements to canonicalOrbit if needed
        if (!config.canonicalOrbit && config.orbitalElements) {
            config.canonicalOrbit = {
                a: config.orbitalElements.semiMajorAxis,
                e: config.orbitalElements.eccentricity,
                i: config.orbitalElements.inclination,
                Omega: config.orbitalElements.longitudeOfAscendingNode,
                omega: config.orbitalElements.argumentOfPeriapsis,
                M0: config.orbitalElements.meanAnomalyAtEpoch,
                epoch: config.orbitalElements.epoch
            };
        }
        
        this.bodies.set(config.name, config);
        if (config.naif_id !== undefined) {
            this.naifToBody.set(config.naif_id, config);
        }
    }

    /**
     * Private: Build hierarchy tree
     */
    _buildHierarchyTree() {
        // Initialize hierarchy map
        this.bodies.forEach(body => {
            this.hierarchyTree.set(body.name, []);
        });

        // Build parent-child relationships
        this.bodies.forEach(body => {
            if (body.parent) {
                const parentChildren = this.hierarchyTree.get(body.parent) || [];
                parentChildren.push(body.name);
                this.hierarchyTree.set(body.parent, parentChildren);
            }
        });
    }

    /**
     * Validate all configurations
     */
    validateConfigurations() {
        const errors = [];

        this.bodies.forEach((body, name) => {
            // Check required fields
            if (!body.naif_id && body.naif_id !== 0) {
                errors.push(`${name}: Missing naif_id`);
            }
            if (!body.type) {
                errors.push(`${name}: Missing type`);
            }

            // Check parent relationships
            if (body.parent && !this.bodies.has(body.parent)) {
                errors.push(`${name}: Parent '${body.parent}' not found`);
            }

            // Check physics properties for non-barycenters
            if (body.type !== 'barycenter') {
                if (!body.radius) {
                    errors.push(`${name}: Missing radius`);
                }
                if (!body.mass && !body.GM) {
                    errors.push(`${name}: Missing mass or GM`);
                }
            }
        });

        if (errors.length > 0) {
            console.warn('Planetary configuration validation errors:', errors);
        }

        return errors.length === 0;
    }
}

// Singleton instance
export const planetaryDataManager = new PlanetaryDataManager(); 