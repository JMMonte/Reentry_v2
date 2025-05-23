import * as THREE from 'three';
import { stateToKeplerian, getPositionAtTrueAnomaly } from '../utils/KeplerianUtils.js';
import { Constants } from '../utils/Constants.js';

/**
 * OrbitManager handles rendering hierarchical planetary orbits based on the physics engine data.
 * Creates proper nested reference orbits where bodies orbit their gravitational parents:
 * - Planets and EMB orbit the Sun (SSB)  
 * - Earth and Moon orbit the Earth-Moon Barycenter
 * - Other moons orbit their respective planet barycenters
 */
export class OrbitManager {
    constructor({ scene, app, config = {} }) {
        this.scene = scene;
        this.app = app;
        this.config = Object.assign(
            { steps: 360, colors: {}, lineWidth: 1 },
            config
        );
        this.orbitLineMap = new Map();
        this.resolution = new THREE.Vector2(
            window.innerWidth,
            window.innerHeight
        );

        // Define the hierarchical orbital relationships based on NAIF IDs
        this.orbitalHierarchy = {
            // Bodies that orbit the Sun (Solar System Barycenter)
            10: { parent: 0, name: 'Sun' }, // Sun orbits SSB (though minimal)
            199: { parent: 0, name: 'Mercury' }, // Mercury orbits SSB
            299: { parent: 0, name: 'Venus' }, // Venus orbits SSB
            3: { parent: 0, name: 'Earth-Moon Barycenter' }, // EMB orbits SSB
            499: { parent: 0, name: 'Mars' }, // Mars orbits SSB
            599: { parent: 0, name: 'Jupiter' }, // Jupiter orbits SSB
            699: { parent: 0, name: 'Saturn' }, // Saturn orbits SSB
            799: { parent: 0, name: 'Uranus' }, // Uranus orbits SSB
            899: { parent: 0, name: 'Neptune' }, // Neptune orbits SSB
            
            // Bodies that orbit the Earth-Moon Barycenter
            399: { parent: 3, name: 'Earth' }, // Earth orbits EMB
            301: { parent: 3, name: 'Moon' }, // Moon orbits EMB
        };

        // Color scheme for different orbital levels
        this.orbitColors = {
            0: 0xFFFFFF,   // Heliocentric orbits (white)
            3: 0x00FF00,   // Earth-Moon system (green)
            399: 0x0088FF, // Earth satellites (blue)
            // Add more as needed for other planetary systems
        };
    }

    /**
     * Get the root group for orbit lines
     */
    getRootGroup() {
        return this.scene;
    }

    /**
     * Render all hierarchical planetary orbits based on physics engine data
     */
    renderPlanetaryOrbits() {
        // Clear existing orbit lines
        this.clearOrbits();

        if (!this.app?.physicsIntegration?.physicsEngine) {
            console.warn('[OrbitManager] Physics engine not available');
            return;
        }

        const physicsEngine = this.app.physicsIntegration.physicsEngine;
        const bodyStates = physicsEngine.getSimulationState().bodies;

        // Create orbits for each body based on hierarchy
        for (const [naifId, hierarchyInfo] of Object.entries(this.orbitalHierarchy)) {
            const naifNum = parseInt(naifId);
            const parentNaif = hierarchyInfo.parent;
            
            // Skip if this is the Solar System Barycenter (origin)
            if (naifNum === 0) continue;

            const body = bodyStates[naifNum];
            if (!body) {
                console.warn(`[OrbitManager] Body ${hierarchyInfo.name} (${naifNum}) not found in physics engine`);
                continue;
            }

            // Get parent body (or use origin for heliocentric orbits)
            let parentPos = new THREE.Vector3(0, 0, 0);
            let parentVel = new THREE.Vector3(0, 0, 0);
            let parentMass = 0;

            if (parentNaif !== 0) {
                const parentBody = bodyStates[parentNaif];
                if (!parentBody) {
                    console.warn(`[OrbitManager] Parent body ${parentNaif} not found for ${hierarchyInfo.name}`);
                    continue;
                }
                parentPos.fromArray(parentBody.position);
                parentVel.fromArray(parentBody.velocity);
                parentMass = parentBody.mass;
            } else {
                // For heliocentric orbits, use Sun's mass
                const sun = bodyStates[10];
                parentMass = sun ? sun.mass : 1.989e30; // Fallback to standard solar mass
            }

            // Calculate relative position and velocity
            const bodyPos = new THREE.Vector3().fromArray(body.position);
            const bodyVel = new THREE.Vector3().fromArray(body.velocity);
            
            const relPos = bodyPos.clone().sub(parentPos);
            const relVel = bodyVel.clone().sub(parentVel);

            // Special handling for very small orbits (like Earth around EMB)
            const relDistance = relPos.length();
            const relSpeed = relVel.length();
            
            // Skip if relative motion is too small (coincident bodies)
            // But use more lenient thresholds for Earth-Moon system
            let minDistance = 1e3; // 1 km default
            let minSpeed = 1e-3; // 1 mm/s default
            
            if (parentNaif === 3) { // Earth-Moon system
                minDistance = 10; // 10 m for Earth-Moon system
                minSpeed = 1e-6; // 1 µm/s for Earth-Moon system
            }
            
            if (relDistance < minDistance || relSpeed < minSpeed) {
                console.warn(`[OrbitManager] Relative motion too small for ${hierarchyInfo.name}: dist=${relDistance.toFixed(1)}m, speed=${relSpeed.toFixed(6)}m/s`);
                continue;
            }

            // Calculate gravitational parameter
            const mu = Constants.G * parentMass;

            // Convert to Keplerian elements using relative coordinates
            const posObj = { x: relPos.x, y: relPos.y, z: relPos.z };
            const velObj = { x: relVel.x, y: relVel.y, z: relVel.z };
            const elements = stateToKeplerian(posObj, velObj, mu, 0);

            if (!elements || !isFinite(elements.a) || elements.a === 0) {
                console.warn(`[OrbitManager] Invalid orbital elements for ${hierarchyInfo.name}:`, elements);
                continue;
            }

            // Increase resolution for very small orbits to make them visible
            let numPoints = 360;
            if (parentNaif === 3 || relDistance < 1e6) { // Earth-Moon system or orbits < 1000 km
                numPoints = 720; // Higher resolution for small orbits
            }

            // Generate orbit points relative to parent (centered at origin)
            const points = this.generateRelativeOrbitPoints(elements, mu, numPoints);
            if (points.length === 0) continue;

            // Create orbit line
            const orbitLine = this.createOrbitLine(points, parentNaif, hierarchyInfo.name);
            
            // Add to appropriate parent group - this is the key change!
            const parentGroup = this.getParentGroup(parentNaif);
            parentGroup.add(orbitLine);
            
            // Store in map
            this.orbitLineMap.set(`${naifNum}-${parentNaif}`, orbitLine);

            // console.log(`[OrbitManager] Created nested orbit for ${hierarchyInfo.name} in ${parentNaif === 0 ? 'SSB' : hierarchyInfo.name} group`);
        }

        console.log(`[OrbitManager] Created ${this.orbitLineMap.size} nested orbital paths`);
        
        // Set visibility based on display settings
        const show = this.app.getDisplaySetting?.('showPlanetOrbits') ?? true;
        this.setVisible(show);
    }

    /**
     * Generate orbit points relative to parent (centered at origin)
     * This is the key improvement - orbits are generated in relative coordinates
     */
    generateRelativeOrbitPoints(elements, mu, numPoints = 360) {
        const points = [];
        
        for (let i = 0; i <= numPoints; i++) {
            const trueAnomaly = (i / numPoints) * 2 * Math.PI;
            const p = getPositionAtTrueAnomaly(elements, mu, trueAnomaly);
            
            if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
            
            // Points are relative to parent center (origin) - no absolute positioning!
            points.push(new THREE.Vector3(p.x, p.y, p.z));
        }
        
        return points;
    }

    /**
     * Create orbit line with appropriate styling
     */
    createOrbitLine(points, parentNaif, bodyName) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Choose color based on orbital level
        const color = this.orbitColors[parentNaif] || 0xFFFFFF;
        
        // Different line styles for different orbital levels
        let material;
        if (parentNaif === 0) {
            // Heliocentric orbits - solid lines
            material = new THREE.LineBasicMaterial({ 
                color, 
                transparent: true, 
                opacity: 0.8,
                linewidth: 1
            });
        } else {
            // Sub-system orbits - dashed lines
            material = new THREE.LineDashedMaterial({
                color,
                transparent: true,
                opacity: 0.6,
                linewidth: 1,
                dashSize: 5,
                gapSize: 2
            });
        }
        
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.name = `orbit-${bodyName}`;
        
        // Compute line distances for dashed materials
        if (material.isDashed) {
            line.computeLineDistances();
        }
        
        return line;
    }

    /**
     * Get the parent group for a given parent NAIF ID
     */
    getParentGroup(parentNaif) {
        if (parentNaif === 0) {
            // Root orbits go in main scene
            return this.scene;
        }
        
        // For sub-system orbits, try to find the parent body's group
        const parentBody = this.app?.celestialBodies?.find(body => 
            body.naifId === parentNaif || body.naif === parentNaif || body.naif_id === parentNaif
        );
        
        if (parentBody && parentBody.getOrbitGroup) {
            const group = parentBody.getOrbitGroup();
            console.log(`[OrbitManager] Found parent group for NAIF ${parentNaif} (${parentBody.name}): ${group.constructor.name}`);
            return group;
        }
        
        console.warn(`[OrbitManager] Parent body not found for NAIF ${parentNaif}, using scene as fallback`);
        // Fallback to scene
        return this.scene;
    }

    /**
     * Force orbit regeneration (for display settings changes, etc.)
     */
    forceUpdate() {
        this._lastOrbitUpdate = 0; // Reset timer
        this._lastSimTime = null; // Reset sim time tracking
        this.renderPlanetaryOrbits();
    }

    /**
     * Clear all existing orbit lines
     */
    clearOrbits() {
        this.orbitLineMap.forEach(line => {
            if (line.parent) {
                line.parent.remove(line);
            }
            
            // Proper disposal of Three.js resources
            if (line.geometry) {
                line.geometry.dispose();
            }
            if (line.material) {
                // Handle both single materials and material arrays
                if (Array.isArray(line.material)) {
                    line.material.forEach(mat => mat.dispose());
                } else {
                    line.material.dispose();
                }
            }
        });
        this.orbitLineMap.clear();
        
        // Clear any cached references
        this.bodyStatesCache?.clear?.();
    }

    /**
     * Update orbits (called each frame)
     */
    update() {
        // Check if we need to regenerate orbits (e.g., significant time change)
        if (this.shouldUpdateOrbits()) {
            this.renderPlanetaryOrbits();
        }
    }

    /**
     * Check if orbits need updating
     * With nested orbits, we only need to regenerate when orbital mechanics change,
     * not when parent bodies move (since orbits move automatically with parents)
     */
    shouldUpdateOrbits() {
        const now = Date.now();
        
        // Always update on first call
        if (!this._lastOrbitUpdate) {
            this._lastOrbitUpdate = now;
            return true;
        }
        
        // Check for significant time jumps (more than 1 day simulated time change)
        // This might change the orbital elements enough to warrant regeneration
        if (this.app?.physicsIntegration?.physicsEngine?.simulationTime) {
            const currentSimTime = this.app.physicsIntegration.physicsEngine.simulationTime.getTime();
            if (!this._lastSimTime) {
                this._lastSimTime = currentSimTime;
                return false; // Don't update immediately after storing time
            }
            
            const timeDiffHours = Math.abs(currentSimTime - this._lastSimTime) / (1000 * 60 * 60);
            if (timeDiffHours > 24) { // More than 24 hours jumped
                this._lastSimTime = currentSimTime;
                this._lastOrbitUpdate = now;
                console.log(`[OrbitManager] Time jump detected (${timeDiffHours.toFixed(1)}h), regenerating nested orbits`);
                return true;
            }
            this._lastSimTime = currentSimTime;
        }
        
        // Check if real-time orbit updates are enabled
        const enableRealTimeOrbits = this.app.getDisplaySetting?.('realTimePlanetOrbits') ?? true;
        
        if (enableRealTimeOrbits) {
            // For nested orbits, we can update less frequently since position changes
            // are handled automatically by the parent-child hierarchy
            // Update every 5 seconds for orbital element changes
            const shouldUpdate = (now - this._lastOrbitUpdate) > 5000;
            if (shouldUpdate) {
                this._lastOrbitUpdate = now;
            }
            return shouldUpdate;
        }
        
        // Performance mode: update every 30 seconds for orbital element changes
        const shouldUpdate = (now - this._lastOrbitUpdate) > 30000;
        if (shouldUpdate) {
            this._lastOrbitUpdate = now;
        }
        
        return shouldUpdate;
    }

    /**
     * Set visibility of all orbit lines
     */
    setVisible(visible) {
        this.orbitLineMap.forEach(line => {
            line.visible = visible;
        });
    }

    /**
     * Update resolution for responsive materials
     */
    onResize() {
        this.resolution.set(window.innerWidth, window.innerHeight);
        // Update any materials that need resolution data
    }

    /**
     * Add a custom orbital relationship
     */
    addOrbitalRelationship(childNaif, parentNaif, name) {
        this.orbitalHierarchy[childNaif] = { parent: parentNaif, name };
    }

    /**
     * Remove orbital relationship
     */
    removeOrbitalRelationship(childNaif) {
        delete this.orbitalHierarchy[childNaif];
        
        // Remove corresponding orbit line
        const key = `${childNaif}-${this.orbitalHierarchy[childNaif]?.parent || 0}`;
        const line = this.orbitLineMap.get(key);
        if (line) {
            if (line.parent) line.parent.remove(line);
            line.geometry?.dispose();
            line.material?.dispose();
            this.orbitLineMap.delete(key);
        }
    }

    /**
     * Get orbital information for debugging
     */
    getOrbitalInfo() {
        const info = [];
        for (const [key, line] of this.orbitLineMap) {
            const [childNaif, parentNaif] = key.split('-').map(Number);
            const hierarchyInfo = this.orbitalHierarchy[childNaif];
            info.push({
                child: hierarchyInfo?.name || `Body ${childNaif}`,
                parent: parentNaif === 0 ? 'SSB' : this.orbitalHierarchy[parentNaif]?.name || `Body ${parentNaif}`,
                visible: line.visible,
                points: line.geometry.attributes.position.count
            });
        }
        return info;
    }
} 