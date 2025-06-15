/**
 * Solar System Data Manager
 * 
 * Centralized system for managing all solar system body data including:
 * - Physical properties (mass, radius, etc.)
 * - Orbital mechanics data
 * - Rendering configurations
 * - Hierarchical relationships
 * - Astronomy Engine integration
 */

import { CelestialBody } from './core/CelestialBody.js';

export class SolarSystemDataManager {
    constructor() {
        this.bodies = new Map(); // Raw configuration data
        this.celestialBodies = new Map(); // CelestialBody instances for physics
        this.naifToBody = new Map();
        this.naifToCelestialBody = new Map();
        this.hierarchyTree = new Map(); // Name-based hierarchy
        this.naifHierarchy = {}; // NAIF ID-based hierarchy (from old SolarSystemHierarchy)
        this.bodyTypes = { // Body type categories (from old SolarSystemHierarchy)
            astronomyEngineSupported: [],
            barycenters: [],
            planets: [],
            moons: []
        };
        this.initialized = false;
    }

    /**
     * Initialize the solar system data manager
     */
    async initialize() {
        if (this.initialized) return;

        // Load all solar system body configurations
        await this._loadSolarSystemConfigurations();

        // Build hierarchy relationships
        this._buildHierarchyTree();

        // Build NAIF-based hierarchy (merged from SolarSystemHierarchy)
        this._buildNaifHierarchy();

        // Define body types (merged from SolarSystemHierarchy)
        this._defineBodyTypes();

        // Create CelestialBody instances for physics
        this._createCelestialBodies();

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
     * Get CelestialBody instance by name (for physics calculations)
     */
    getCelestialBodyByName(name) {
        return this.celestialBodies.get(name);
    }

    /**
     * Get CelestialBody instance by NAIF ID (for physics calculations)
     */
    getCelestialBodyByNaif(naifId) {
        return this.naifToCelestialBody.get(naifId);
    }

    /**
     * Get all bodies of a specific type
     */
    getBodiesByType(type) {
        return Array.from(this.bodies.values()).filter(body => body.type === type);
    }

    /**
     * Get children of a body in the hierarchy (by name)
     */
    getChildren(bodyName) {
        return this.hierarchyTree.get(bodyName) || [];
    }

    /**
     * Get parent of a body in the hierarchy (by name)
     */
    getParent(bodyName) {
        const body = this.bodies.get(bodyName);
        return body ? body.parent : null;
    }

    // ===========================================
    // NAIF ID-based hierarchy methods (merged from SolarSystemHierarchy)
    // ===========================================

    /**
     * Get the relationship info for a body by NAIF ID
     */
    getBodyInfoByNaif(naifId) {
        return this.naifHierarchy[naifId] || null;
    }

    /**
     * Get the parent of a body by NAIF ID
     */
    getParentByNaif(naifId) {
        const info = this.getBodyInfoByNaif(naifId);
        return info ? info.parent : null;
    }

    /**
     * Get the children of a body by NAIF ID
     */
    getChildrenByNaif(naifId) {
        const info = this.getBodyInfoByNaif(naifId);
        return info ? info.children : [];
    }

    /**
     * Check if a body is supported by Astronomy Engine
     */
    isAstronomyEngineSupported(naifId) {
        return this.bodyTypes.astronomyEngineSupported.includes(Number(naifId));
    }

    /**
     * Check if a body is a moon
     */
    isMoon(naifId) {
        return this.bodyTypes.moons.includes(Number(naifId));
    }

    /**
     * Check if a body is a planet
     */
    isPlanet(naifId) {
        return this.bodyTypes.planets.includes(Number(naifId));
    }

    /**
     * Check if a body is a barycenter
     */
    isBarycenter(naifId) {
        return this.bodyTypes.barycenters.includes(Number(naifId));
    }

    /**
     * Get the barycenter that contains a given planet
     */
    getBarycenterForPlanet(planetNaifId) {
        const parentId = this.getParentByNaif(planetNaifId);
        return this.isBarycenter(parentId) ? parentId : null;
    }

    /**
     * Get all moons for a given planet
     */
    getMoonsForPlanet(planetNaifId) {
        return this.getChildrenByNaif(planetNaifId).filter(childId => this.isMoon(childId));
    }

    /**
     * Build a path from root to a given body (useful for transforms)
     */
    getPathToRoot(naifId) {
        const path = [];
        let currentId = naifId;
        
        while (currentId !== null) {
            path.unshift(currentId);
            currentId = this.getParentByNaif(currentId);
        }
        
        return path;
    }

    /**
     * Find the lowest common ancestor of two bodies
     */
    findCommonAncestor(naifId1, naifId2) {
        const path1 = this.getPathToRoot(naifId1);
        const path2 = this.getPathToRoot(naifId2);
        
        let commonAncestor = null;
        const minLength = Math.min(path1.length, path2.length);
        
        for (let i = 0; i < minLength; i++) {
            if (path1[i] === path2[i]) {
                commonAncestor = path1[i];
            } else {
                break;
            }
        }
        
        return commonAncestor;
    }

    /**
     * Get the complete NAIF-based hierarchy (compatibility with old SolarSystemHierarchy)
     */
    getHierarchy() {
        return this.naifHierarchy;
    }

    // ===========================================
    // End of merged hierarchy methods
    // ===========================================

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
     * Private: Load all solar system body configurations
     */
    async _loadSolarSystemConfigurations() {
        // Import all individual planet configurations
        const configs = await Promise.all([
            import('./data/planets/Sun.js'),
            import('./data/planets/Mercury.js'),
            import('./data/planets/Venus.js'),
            import('./data/planets/Earth.js'),
            import('./data/planets/Mars.js'),
            import('./data/planets/Jupiter.js'),
            import('./data/planets/Saturn.js'),
            import('./data/planets/Uranus.js'),
            import('./data/planets/Neptune.js'),
            import('./data/planets/Pluto.js'),
            import('./data/planets/Ceres.js'),
            import('./data/planets/Eris.js'),
            import('./data/planets/Makemake.js'),
            import('./data/planets/Haumea.js'),
            import('./data/barycenters/Barycenters.js'),
            import('./data/moons/EarthMoons.js'),
            import('./data/moons/MarsMoons.js'),
            import('./data/moons/JupiterMoons.js'),
            import('./data/moons/SaturnMoons.js'),
            import('./data/moons/UranusMoons.js'),
            import('./data/moons/NeptuneMoons.js'),
            import('./data/moons/PlutoMoons.js')
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

        // Normalize NAIF ID: always use naifId (camelCase)
        if (config.naif_id !== undefined) {
            config.naifId = config.naif_id;
            delete config.naif_id;
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
        if (config.naifId !== undefined) {
            this.naifToBody.set(config.naifId, config);
        }
    }

    /**
     * Private: Build hierarchy tree (name-based)
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
     * Private: Build NAIF-based hierarchy (merged from SolarSystemHierarchy)
     */
    _buildNaifHierarchy() {
        const hierarchy = {};
        
        // First, create empty entries for all bodies
        for (const [naifId, config] of this.naifToBody.entries()) {
            hierarchy[naifId] = {
                name: config.name,
                type: config.type,
                parent: config.parent ? this._findNaifIdByName(config.parent) : null,
                children: []
            };
        }
        
        // Then, fill in children arrays
        for (const [naifId, node] of Object.entries(hierarchy)) {
            if (node.parent !== null && hierarchy[node.parent]) {
                hierarchy[node.parent].children.push(Number(naifId));
            }
        }
        
        this.naifHierarchy = hierarchy;
    }

    /**
     * Private: Find NAIF ID by body name
     */
    _findNaifIdByName(name) {
        for (const [naifId, config] of this.naifToBody.entries()) {
            if (config.name === name) return Number(naifId);
        }
        return null;
    }

    /**
     * Private: Define body type categories (merged from SolarSystemHierarchy)
     */
    _defineBodyTypes() {
        const astronomyEngineSupported = [];
        const barycenters = [];
        const planets = [];
        const moons = [];
        
        for (const [naifId, config] of this.naifToBody.entries()) {
            if (config.type === 'barycenter') barycenters.push(Number(naifId));
            if (config.type === 'planet' || config.type === 'dwarf_planet') planets.push(Number(naifId));
            if (config.type === 'moon') moons.push(Number(naifId));
            if (config.astronomyEngineName) astronomyEngineSupported.push(Number(naifId));
        }
        
        this.bodyTypes = {
            astronomyEngineSupported,
            barycenters,
            planets,
            moons
        };
    }

    /**
     * Validate all configurations
     */
    validateConfigurations() {
        const errors = [];

        this.bodies.forEach((body, name) => {
            // Check required fields
            if (!body.naifId && body.naifId !== 0) {
                errors.push(`${name}: Missing naifId`);
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
            console.warn('Solar system configuration validation errors:', errors);
        }

        return errors.length === 0;
    }

    /**
     * Private: Create CelestialBody instances from configurations
     */
    _createCelestialBodies() {
        this.bodies.forEach((config, name) => {
            try {
                // Validate configuration
                const validation = CelestialBody.validateConfig(config);
                if (!validation.isValid) {
                    console.warn(`[SolarSystemDataManager] Invalid config for ${name}:`, validation.errors);
                    return;
                }

                // Create CelestialBody instance
                const celestialBody = CelestialBody.fromConfig(config);

                // Store in maps
                this.celestialBodies.set(name, celestialBody);
                if (celestialBody.naifId !== undefined) {
                    this.naifToCelestialBody.set(celestialBody.naifId, celestialBody);
                }

            } catch (error) {
                console.error(`[SolarSystemDataManager] Failed to create CelestialBody for ${name}:`, error);
            }
        });

        // Build hierarchy relationships for CelestialBodies
        this.celestialBodies.forEach(celestialBody => {
            if (celestialBody.parent) {
                const parentBody = this.celestialBodies.get(celestialBody.parent);
                if (parentBody) {
                    parentBody.addChild(celestialBody);
                }
            }
        });
    }

    /**
     * Get all CelestialBody instances
     */
    getAllCelestialBodies() {
        return Array.from(this.celestialBodies.values());
    }

    /**
     * Get CelestialBodies by type
     */
    getCelestialBodiesByType(type) {
        return Array.from(this.celestialBodies.values()).filter(body => body.type === type);
    }
}

// Singleton instance
export const solarSystemDataManager = new SolarSystemDataManager(); 