/**
 * OrbitHierarchy manages parent-child orbital relationships
 * and group assignments for nested orbit structures
 * 
 * Now dynamically pulls data from physics engine instead of hardcoding
 */
export class OrbitHierarchy {
    constructor(scene, app) {
        this.scene = scene;
        this.app = app;

        // Build relationships from physics engine's existing hierarchy
        this._buildFromPhysicsEngine();
    }

    /**
     * Build relationships from physics engine's hierarchy
     */
    _buildFromPhysicsEngine() {
        const hierarchy = this.app?.physicsIntegration?.physicsEngine?.hierarchy;
        if (!hierarchy) {
            console.warn('[OrbitHierarchy] Physics hierarchy not available, using empty relationships');
            this.relationships = {};
            this.visualParentMap = {};
            return;
        }

        // Build relationships from physics hierarchy
        this.relationships = {};
        this.visualParentMap = {};
        
        if (hierarchy.hierarchy) {
            for (const [naifId, info] of Object.entries(hierarchy.hierarchy)) {
                this.relationships[naifId] = {
                    parent: info.parent,
                    name: info.name
                };
                
                // Build visual parent map for moons
                // Most moons should orbit their planet visually, not the barycenter
                if (hierarchy.isMoon(Number(naifId)) && hierarchy.isBarycenter(info.parent)) {
                    // Find the primary planet in this system
                    const planetId = hierarchy.getChildren(info.parent).find(id => hierarchy.isPlanet(id));
                    if (planetId) {
                        // Special case: Pluto-Charon is a true binary system
                        if (info.parent !== 9) { // Not Pluto System Barycenter
                            this.visualParentMap[naifId] = planetId;
                        }
                    }
                }
            }
        }
    }

    /**
     * Get all orbital relationships
     */
    getAllRelationships() {
        return this.relationships;
    }

    /**
     * Get relationship info for a specific body
     */
    getRelationship(naifId) {
        return this.relationships[naifId];
    }

    /**
     * Get visual parent for orbit rendering
     * For moons, returns the planet instead of barycenter
     */
    getVisualParent(naifId) {
        return this.visualParentMap[naifId] || this.relationships[naifId]?.parent;
    }

    /**
     * Add a new orbital relationship
     */
    addRelationship(childNaif, parentNaif, name) {
        this.relationships[childNaif] = { parent: parentNaif, name };
    }

    /**
     * Remove an orbital relationship
     */
    removeRelationship(childNaif) {
        delete this.relationships[childNaif];
    }

    /**
     * Get the parent group for orbit line placement
     */
    getParentGroup(parentNaif) {
        if (parentNaif === 0) {
            // Root orbits go in main scene
            return this.scene;
        }
        
        // For sub-system orbits, try to find the parent body's group
        const parentBody = this.findParentBody(parentNaif);
        
        if (parentBody && parentBody.getOrbitGroup) {
            const group = parentBody.getOrbitGroup();
            return group;
        }
        
        // Fallback to scene if parent not found
        return this.scene;
    }

    /**
     * Find parent body by NAIF ID
     */
    findParentBody(parentNaif) {
        if (!this.app?.celestialBodies) return null;

        return this.app.celestialBodies.find(body =>
            body.naifId === parentNaif ||
            body.naif === parentNaif ||
            body.naif_id === parentNaif
        );
    }

    /**
     * Get hierarchical structure info for debugging
     */
    getHierarchyInfo() {
        const info = {};

        for (const [childNaif, relationship] of Object.entries(this.relationships)) {
            const parentNaif = relationship.parent;

            if (!info[parentNaif]) {
                info[parentNaif] = {
                    name: parentNaif === 0 ? 'Solar System Barycenter' : this.relationships[parentNaif]?.name || `Body ${parentNaif}`,
                    children: []
                };
            }

            info[parentNaif].children.push({
                naif: parseInt(childNaif),
                name: relationship.name
            });
        }

        return info;
    }

    /**
     * Get all children of a parent body
     */
    getChildren(parentNaif) {
        return Object.entries(this.relationships)
            .filter(([, relationship]) => relationship.parent === parentNaif)
            .map(([childNaif, relationship]) => ({
                naif: parseInt(childNaif),
                name: relationship.name
            }));
    }

    /**
     * Get all parents in the hierarchy
     */
    getParents() {
        const parents = new Set();
        for (const relationship of Object.values(this.relationships)) {
            parents.add(relationship.parent);
        }
        return Array.from(parents);
    }

    /**
     * Check if a body has children
     */
    hasChildren(naifId) {
        return Object.values(this.relationships).some(rel => rel.parent === naifId);
    }

    /**
     * Get the root parent of a body (traverse up the hierarchy)
     */
    getRootParent(naifId) {
        let current = naifId;
        let relationship = this.relationships[current];

        while (relationship && relationship.parent !== 0) {
            current = relationship.parent;
            relationship = this.relationships[current];
        }

        return current;
    }

    /**
     * Validate hierarchy consistency
     */
    validateHierarchy() {
        const issues = [];

        for (const [childNaif, relationship] of Object.entries(this.relationships)) {
            const parentNaif = relationship.parent;

            // Check for circular references
            if (this.hasCircularReference(parseInt(childNaif))) {
                issues.push(`Circular reference detected for ${relationship.name} (${childNaif})`);
            }

            // Check for missing parent bodies (except SSB)
            if (parentNaif !== 0 && !this.findParentBody(parentNaif)) {
                issues.push(`Parent body ${parentNaif} not found for ${relationship.name} (${childNaif})`);
            }
        }

        return issues;
    }

    /**
     * Check for circular references in hierarchy
     */
    hasCircularReference(naifId, visited = new Set()) {
        if (visited.has(naifId)) {
            return true;
        }

        visited.add(naifId);

        const relationship = this.relationships[naifId];
        if (relationship && relationship.parent !== 0) {
            return this.hasCircularReference(relationship.parent, visited);
        }

        return false;
    }
} 