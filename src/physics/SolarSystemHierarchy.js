/**
 * Solar System Hierarchy Manager
 * 
 * Dynamically builds parent-child relationships and relative positioning logic
 * for all solar system bodies (planets, moons, barycenters) from config data.
 * 
 * This eliminates hardcoded mappings and special cases throughout the codebase.
 */
export class SolarSystemHierarchy {
    constructor(bodiesConfigMap) {
        this.hierarchy = this._buildHierarchy(bodiesConfigMap);
        this.bodyTypes = this._defineBodyTypes(bodiesConfigMap);
    }

    /**
     * Build the complete solar system hierarchy from config data
     */
    _buildHierarchy(bodiesConfigMap) {
        const hierarchy = {};
        // First, create empty entries for all bodies
        for (const [naifId, config] of bodiesConfigMap.entries()) {
            hierarchy[naifId] = {
                name: config.name,
                type: config.type,
                parent: config.parent ? this._findNaifIdByName(bodiesConfigMap, config.parent) : null,
                children: []
            };
        }
        // Then, fill in children arrays
        for (const [naifId, node] of Object.entries(hierarchy)) {
            if (node.parent !== null && hierarchy[node.parent]) {
                hierarchy[node.parent].children.push(Number(naifId));
            }
        }
        return hierarchy;
    }

    _findNaifIdByName(bodiesConfigMap, name) {
        for (const [naifId, config] of bodiesConfigMap.entries()) {
            if (config.name === name) return Number(naifId);
        }
        return null;
    }

    /**
     * Define body type categories for different processing logic
     */
    _defineBodyTypes(bodiesConfigMap) {
        const astronomyEngineSupported = [];
        const barycenters = [];
        const planets = [];
        const moons = [];
        for (const [naifId, config] of bodiesConfigMap.entries()) {
            if (config.type === 'barycenter') barycenters.push(Number(naifId));
            if (config.type === 'planet' || config.type === 'dwarf_planet') planets.push(Number(naifId));
            if (config.type === 'moon') moons.push(Number(naifId));
            if (config.astronomyEngineName) astronomyEngineSupported.push(Number(naifId));
        }
        return {
            astronomyEngineSupported,
            barycenters,
            planets,
            moons
        };
    }

    /**
     * Get the relationship info for a body
     */
    getBodyInfo(naifId) {
        return this.hierarchy[naifId] || null;
    }

    /**
     * Get the parent of a body
     */
    getParent(naifId) {
        const info = this.getBodyInfo(naifId);
        return info ? info.parent : null;
    }

    /**
     * Get the children of a body
     */
    getChildren(naifId) {
        const info = this.getBodyInfo(naifId);
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
        const parentId = this.getParent(planetNaifId);
        return this.isBarycenter(parentId) ? parentId : null;
    }

    /**
     * Get all moons for a given planet
     */
    getMoonsForPlanet(planetNaifId) {
        return this.getChildren(planetNaifId).filter(childId => this.isMoon(childId));
    }

    /**
     * Build a path from root to a given body (useful for transforms)
     */
    getPathToRoot(naifId) {
        const path = [];
        let currentId = naifId;
        
        while (currentId !== null) {
            path.unshift(currentId);
            currentId = this.getParent(currentId);
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
} 