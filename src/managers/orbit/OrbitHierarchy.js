/**
 * OrbitHierarchy manages parent-child orbital relationships
 * and group assignments for nested orbit structures
 */
export class OrbitHierarchy {
    constructor(scene, app) {
        this.scene = scene;
        this.app = app;

        // Define the hierarchical orbital relationships based on NAIF IDs
        this.relationships = {
            // Bodies that orbit the Sun (Solar System Barycenter)
            10: { parent: 0, name: 'Sun' },
            1: { parent: 0, name: 'Mercury Barycenter' },
            199: { parent: 1, name: 'Mercury' },
            2: { parent: 0, name: 'Venus Barycenter' },
            299: { parent: 2, name: 'Venus' },
            3: { parent: 0, name: 'Earth-Moon Barycenter' },
            4: { parent: 0, name: 'Mars Barycenter' },
            5: { parent: 0, name: 'Jupiter Barycenter' },
            6: { parent: 0, name: 'Saturn Barycenter' },
            7: { parent: 0, name: 'Uranus Barycenter' },
            8: { parent: 0, name: 'Neptune Barycenter' },
            9: { parent: 0, name: 'Pluto System Barycenter' },
            499: { parent: 4, name: 'Mars' },
            599: { parent: 5, name: 'Jupiter' },
            699: { parent: 6, name: 'Saturn' },
            799: { parent: 7, name: 'Uranus' },
            899: { parent: 8, name: 'Neptune' },
            999: { parent: 9, name: 'Pluto' },

            // Bodies that orbit the Earth-Moon Barycenter
            399: { parent: 3, name: 'Earth' },
            301: { parent: 3, name: 'Moon' },

            // Bodies that orbit the Mars Barycenter
            401: { parent: 4, name: 'Phobos' },
            402: { parent: 4, name: 'Deimos' },

            // Bodies that orbit the Jupiter Barycenter
            501: { parent: 5, name: 'Io' },
            502: { parent: 5, name: 'Europa' },
            503: { parent: 5, name: 'Ganymede' },
            504: { parent: 5, name: 'Callisto' },

            // Bodies that orbit the Saturn Barycenter
            601: { parent: 6, name: 'Mimas' },
            602: { parent: 6, name: 'Enceladus' },
            603: { parent: 6, name: 'Tethys' },
            604: { parent: 6, name: 'Dione' },
            605: { parent: 6, name: 'Rhea' },
            606: { parent: 6, name: 'Titan' },
            608: { parent: 6, name: 'Iapetus' },

            // Bodies that orbit the Uranus Barycenter
            701: { parent: 7, name: 'Ariel' },
            702: { parent: 7, name: 'Umbriel' },
            703: { parent: 7, name: 'Titania' },
            704: { parent: 7, name: 'Oberon' },
            705: { parent: 7, name: 'Miranda' },

            // Bodies that orbit the Neptune Barycenter
            801: { parent: 8, name: 'Triton' },
            802: { parent: 8, name: 'Proteus' },
            803: { parent: 8, name: 'Nereid' },

            // Bodies that orbit the Pluto System Barycenter
            901: { parent: 9, name: 'Charon' },
            902: { parent: 9, name: 'Nix' },
            903: { parent: 9, name: 'Hydra' },
            904: { parent: 9, name: 'Kerberos' },
            905: { parent: 9, name: 'Styx' }
        };
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