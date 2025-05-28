import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { OrbitCalculator } from './orbit/OrbitCalculator.js';
import { OrbitRenderer } from './orbit/OrbitRenderer.js';
import { OrbitHierarchy } from './orbit/OrbitHierarchy.js';
import { planetaryDataManager } from '../physics/bodies/PlanetaryDataManager.js';

/**
 * OrbitManager orchestrates hierarchical planetary orbit visualization
 * Uses modular components for calculations, rendering, and hierarchy management
 */
export class OrbitManager {
    constructor({ scene, app, config = {} }) {
        this.scene = scene;
        this.app = app;
        this.config = Object.assign(
            { steps: 360, colors: {}, lineWidth: 1 },
            config
        );

        // Initialize modular components
        this.calculator = new OrbitCalculator();
        this.renderer = new OrbitRenderer();
        this.hierarchy = new OrbitHierarchy(scene, app);

        // Orbit line storage
        this.orbitLineMap = new Map();

        // Performance tracking
        this._lastOrbitUpdate = 0;
        this._lastSimTime = null;

        // Resolution tracking
        this.resolution = new THREE.Vector2(
            window.innerWidth,
            window.innerHeight
        );

        // Apply custom colors from config
        if (config.colors) {
            for (const [parentNaif, color] of Object.entries(config.colors)) {
                this.renderer.addColorScheme(parseInt(parentNaif), color);
            }
        }
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
        
        // Enhance bodyStates with absolutePosition from bodiesByNaifId
        const enhancedBodyStates = {};
        for (const [naifId, state] of Object.entries(bodyStates)) {
            enhancedBodyStates[naifId] = { ...state };
            const body = this.app.bodiesByNaifId?.[naifId];
            if (body?.absolutePosition) {
                enhancedBodyStates[naifId].absolutePosition = body.absolutePosition;
            }
            // Don't override velocity - keep the array format from physics engine
            // The calculateRelativeMotion method will handle both formats
        }
        
        const relationships = this.hierarchy.getAllRelationships();

        // Process each body in the hierarchy
        for (const [naifId, hierarchyInfo] of Object.entries(relationships)) {
            this.processOrbitForBody(
                parseInt(naifId),
                hierarchyInfo,
                enhancedBodyStates
            );
        }

        // Set visibility based on display settings
        const show = this.app.getDisplaySetting?.('showPlanetOrbits') ?? true;
        this.setVisible(show);
    }

    /**
     * Process orbit generation for a single body
     */
    processOrbitForBody(naifNum, hierarchyInfo, bodyStates) {
        // Use visual parent for moons (planet instead of barycenter)
        const visualParentNaif = this.hierarchy.getVisualParent(naifNum);
        const parentNaif = visualParentNaif !== undefined ? visualParentNaif : hierarchyInfo.parent;

        // Skip Solar System Barycenter
        if (naifNum === 0) return true;

        const body = bodyStates[naifNum];
        if (!body) {
            return false;
        }

        // Check if this body has orbital elements in config for direct orbit calculation
        const physicsEngine = this.app.physicsIntegration?.physicsEngine;
        const calculator = physicsEngine?.stateVectorCalculator;
        const bodyConfig = calculator?._getFullBodyConfig?.(naifNum);
        const orbitalElements = bodyConfig?.orbitalElements || bodyConfig?.canonical_orbit;

        if (orbitalElements && calculator) {
            // console.log(`[OrbitManager] Generating procedural orbit for ${hierarchyInfo.name} (NAIF ${naifNum})`);
            
            // Determine orbital period for sampling
            let periodSeconds;
            if (bodyConfig.orbitalPeriod) {
                periodSeconds = bodyConfig.orbitalPeriod;
            } else if (orbitalElements.a || orbitalElements.semiMajorAxis) {
                // Estimate period using Kepler's third law: T = 2π√(a³/GM)
                const a = orbitalElements.a || orbitalElements.semiMajorAxis; // km
                const parentConfig = calculator._getFullBodyConfig(parentNaif);
                let GM = parentConfig?.GM;
                if (!GM && parentConfig?.mass) {
                    GM = Constants.G * parentConfig.mass; // Convert to km³/s²
                }
                if (GM) {
                    periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / GM);
                } else {
                    periodSeconds = 24 * 3600; // Default to 1 day
                }
            } else {
                periodSeconds = 24 * 3600; // Default fallback
            }
            
            const numPoints = Math.min(200, Math.max(60, Math.floor(periodSeconds / 3600))); // 60-200 points based on period
            const dt = periodSeconds / numPoints; // seconds per step
            const centerTime = physicsEngine.simulationTime;
            
            // Get parent position for relative calculations
            const parentState = bodyStates[parentNaif];
            const parentPos = parentState ? new THREE.Vector3().fromArray(parentState.position) : new THREE.Vector3(0, 0, 0);
            
            const points = [];
            for (let i = 0; i <= numPoints; i++) {
                const t = new Date(centerTime.getTime() + (i - numPoints / 2) * dt * 1000);
                
                try {
                    const state = calculator.calculateStateVector(naifNum, t);
                    const parentStateAtTime = parentNaif !== 0 ? calculator.calculateStateVector(parentNaif, t) : null;
                    
                    if (state && state.position) {
                        const point = new THREE.Vector3(state.position[0], state.position[1], state.position[2]);
                        
                        // Subtract parent position to get relative orbit
                        if (parentStateAtTime && parentStateAtTime.position) {
                            point.sub(new THREE.Vector3(
                                parentStateAtTime.position[0],
                                parentStateAtTime.position[1],
                                parentStateAtTime.position[2]
                            ));
                        }
                        
                        points.push(point);
                    }
                } catch (error) {
                    console.warn(`Failed to calculate orbit point for ${hierarchyInfo.name}:`, error);
                    continue;
                }
            }
            
            console.log(`[OrbitManager] Generated ${points.length} orbit points for ${hierarchyInfo.name}`);
            
            if (points.length > 1) {
                // Get full body config for dwarf determination
                let fullBodyConfig = bodyConfig;
                if ((!fullBodyConfig || !fullBodyConfig.isDwarf) && planetaryDataManager) {
                    const pmConfig = planetaryDataManager.getBodyByNaif(naifNum);
                    if (pmConfig) {
                        fullBodyConfig = { ...bodyConfig, ...pmConfig };
                    }
                }
                
                
                const orbitLine = this.renderer.createOrbitLine(points, parentNaif, hierarchyInfo.name, fullBodyConfig);
                if (!orbitLine) {
                    console.warn(`[OrbitManager] Failed to create orbit line for ${hierarchyInfo.name}`);
                    return false;
                }
                const parentGroup = this.hierarchy.getParentGroup(parentNaif);
                parentGroup.add(orbitLine);
                this.orbitLineMap.set(`${naifNum}-${parentNaif}`, orbitLine);
                // console.log(`[OrbitManager] Successfully created procedural orbit for ${hierarchyInfo.name}`);
                return true;
            }
            console.warn(`[OrbitManager] Not enough orbit points (${points.length}) for ${hierarchyInfo.name}`);
            return false;
        }

        // Fallback: existing physics-based orbit calculation for bodies without orbital elements
        // console.log(`[OrbitManager] Using physics-based orbit calculation for ${hierarchyInfo.name} (NAIF ${naifNum})`);
        
        // Calculate relative motion
        const relativeMotion = this.calculateRelativeMotion(body, parentNaif, bodyStates);
        if (!relativeMotion.isValid) {
            return false;
        }

        // Calculate orbital elements
        const elements = this.calculator.calculateOrbitalElements(
            relativeMotion.position,
            relativeMotion.velocity,
            relativeMotion.parentMass,
            hierarchyInfo.name,
            parentNaif
        );

        if (!elements || !isFinite(elements.a) || elements.a === 0) {
            return false;
        }

        // Generate orbit points
        const numPoints = this.calculator.calculateOptimalResolution(elements, parentNaif);
        const points = this.calculator.generateOrbitPoints(elements, Constants.G * relativeMotion.parentMass, numPoints);

        if (points.length === 0) {
            return false;
        }

        // Get body config for dwarf determination
        // Try multiple sources to get the body config
        let bodyConfigForDwarf = {};
        
        // Try from calculator first
        if (calculator && calculator._getFullBodyConfig) {
            bodyConfigForDwarf = calculator._getFullBodyConfig(naifNum) || {};
        }
        
        // If empty, try from planetaryDataManager directly
        if ((!bodyConfigForDwarf || Object.keys(bodyConfigForDwarf).length === 0) && planetaryDataManager) {
            bodyConfigForDwarf = planetaryDataManager.getBodyByNaif(naifNum) || {};
        }
        
        
        // Create and place orbit line
        const orbitLine = this.renderer.createOrbitLine(points, parentNaif, hierarchyInfo.name, bodyConfigForDwarf);
        if (!orbitLine) return false;

        // Add to appropriate parent group
        const parentGroup = this.hierarchy.getParentGroup(parentNaif);
        parentGroup.add(orbitLine);

        // Store in map
        this.orbitLineMap.set(`${naifNum}-${parentNaif}`, orbitLine);

        return true;
    }

    /**
     * Calculate relative motion between body and parent
     */
    calculateRelativeMotion(body, parentNaif, bodyStates) {
        // Get parent state
        let parentPos = new THREE.Vector3(0, 0, 0);
        let parentVel = new THREE.Vector3(0, 0, 0);
        let parentMass = 0;

        if (parentNaif !== 0) {
            const parentBody = bodyStates[parentNaif];
            if (!parentBody) {
                return { isValid: false };
            }
            parentPos.fromArray(parentBody.position);
            parentVel.fromArray(parentBody.velocity);
            parentMass = parentBody.mass;
        } else {
            // For heliocentric orbits, use Sun's mass
            const sun = bodyStates[10];
            parentMass = sun ? sun.mass : 1.989e30; // Fallback to standard solar mass
        }

        // Get body position and velocity - use absolute position if available
        const bodyPos = body.absolutePosition ? 
            body.absolutePosition.clone() : 
            new THREE.Vector3().fromArray(body.position);
        
        // Handle velocity - it might be a Vector3 or an array
        let bodyVel;
        if (body.velocity instanceof THREE.Vector3) {
            bodyVel = body.velocity.clone();
        } else if (Array.isArray(body.velocity)) {
            bodyVel = new THREE.Vector3().fromArray(body.velocity);
        } else {
            // Fallback to zeros if no velocity
            bodyVel = new THREE.Vector3(0, 0, 0);
        }

        // Always calculate relative position by subtracting parent
        // The physics engine provides absolute positions, so we need to
        // subtract the parent position to get the relative orbit
        const relPos = bodyPos.clone().sub(parentPos);
        const relVel = bodyVel.clone().sub(parentVel);

        // Validate relative motion
        const validation = this.calculator.validateRelativeMotion(relPos, relVel, parentNaif);

        if (!validation.isValid) {
            return { isValid: false };
        }

        return {
            isValid: true,
            position: relPos,
            velocity: relVel,
            parentMass: parentMass
        };
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
            this.renderer.disposeOrbitLine(line);
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
                // console.log(`[OrbitManager] Time jump detected (${timeDiffHours.toFixed(1)}h), regenerating nested orbits`);
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
            this.renderer.setOrbitVisibility(line, visible);
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
        this.hierarchy.addRelationship(childNaif, parentNaif, name);
    }

    /**
     * Remove orbital relationship
     */
    removeOrbitalRelationship(childNaif) {
        this.hierarchy.removeRelationship(childNaif);

        // Remove corresponding orbit line
        const relationship = this.hierarchy.getRelationship(childNaif);
        const key = `${childNaif}-${relationship?.parent || 0}`;
        const line = this.orbitLineMap.get(key);
        if (line) {
            this.renderer.disposeOrbitLine(line);
            this.orbitLineMap.delete(key);
        }
    }

    /**
     * Get orbital information for debugging
     */
    getOrbitalInfo() {
        const info = [];
        const relationships = this.hierarchy.getAllRelationships();

        for (const [key, line] of this.orbitLineMap) {
            const [childNaif, parentNaif] = key.split('-').map(Number);
            const hierarchyInfo = relationships[childNaif];
            const renderInfo = this.renderer.getDebugInfo(line);

            info.push({
                child: hierarchyInfo?.name || `Body ${childNaif}`,
                parent: parentNaif === 0 ? 'SSB' : relationships[parentNaif]?.name || `Body ${parentNaif}`,
                ...renderInfo
            });
        }
        return info;
    }
} 