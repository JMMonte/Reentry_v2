import { CelestialOrbit } from './CelestialOrbit.js';
import { CelestialOrbitCalculator } from './CelestialOrbitCalculator.js';
import { CelestialOrbitRenderer } from './CelestialOrbitRenderer.js';

/**
 * CelestialOrbitManager - Orchestrates celestial body orbit visualization
 * Coordinates between orbit data, calculations, and rendering
 * Uses existing app.hierarchy and app.bodiesByNaifId instead of separate OrbitHierarchy
 */
export class CelestialOrbitManager {
    constructor(scene, app) {
        this.scene = scene;
        this.app = app;
        
        // Initialize components
        this.calculator = null; // Will be set when physics engine is available
        this.renderer = new CelestialOrbitRenderer();
        
        // Orbit storage
        this.orbits = new Map(); // bodyId -> CelestialOrbit
        
        // Performance tracking
        this._lastOrbitUpdate = null;
        this._lastSimTime = null;
        
        // Debouncing for force updates during initialization
        this._forceUpdateTimeout = null;
        this._isInitializing = true;
        
        // Configuration
        this.config = {
            updateThreshold: 5000, // 5 seconds
            timeJumpThreshold: 86400000 // 24 hours
        };
        
        // Mark initialization as complete after a short delay
        setTimeout(() => {
            this._isInitializing = false;
        }, 2000); // 2 second initialization window
    }
    
    /**
     * Initialize with physics engine when available
     */
    initialize(physicsEngine) {
        const stateCalculator = physicsEngine?.stateCalculator;
        if (!stateCalculator) {
            console.warn('[CelestialOrbitManager] No state calculator available');
            return;
        }
        
        this.calculator = new CelestialOrbitCalculator(
            stateCalculator,
            this.app.hierarchy
        );
        
        // Set up shared positioning between orbit visualization and moon positioning
        stateCalculator.setOrbitCalculator(this.calculator);
        console.log('[CelestialOrbitManager] Shared positioning algorithm enabled between orbits and moon positions');
        
    }
    
    /**
     * Render all celestial body orbits
     */
    renderAllOrbits() {
        // Try to initialize calculator if not available
        if (!this.calculator && this.app.physicsIntegration?.physicsEngine) {
            this.initialize(this.app.physicsIntegration.physicsEngine);
        }
        
        if (!this.calculator) {
            console.warn('[CelestialOrbitManager] Calculator not initialized - physics engine not ready');
            return;
        }
        
        // Clear existing orbits
        this.clearOrbits();
        
        const hierarchy = this.app.hierarchy?.hierarchy;
        if (!hierarchy) {
            console.warn('[CelestialOrbitManager] No hierarchy available');
            return;
        }
        
        const currentTime = this.app.physicsIntegration?.physicsEngine?.simulationTime || new Date();
        
        // Process each body in the hierarchy
        for (const [bodyIdStr, hierarchyInfo] of Object.entries(hierarchy)) {
            const bodyId = parseInt(bodyIdStr);
            
            // Skip Solar System Barycenter
            if (bodyId === 0) continue;
            
            this.createOrbitForBody(bodyId, hierarchyInfo, currentTime);
        }
        
        // Set visibility based on display settings
        const visible = this.app.getDisplaySetting?.('showPlanetOrbits') ?? true;
        this.setAllVisible(visible);
        
        this._lastOrbitUpdate = Date.now();
        this._lastSimTime = currentTime.getTime();
    }
    
    /**
     * Create orbit for a single celestial body
     */
    createOrbitForBody(bodyId, hierarchyInfo, currentTime) {
        // Use visual parent ONLY for moons (planet instead of barycenter)
        // Barycenters should always use their actual hierarchical parent
        let parentId = hierarchyInfo.parent;
        
        // Only apply visual parent mapping for non-barycenter bodies (moons -> planets)
        if (hierarchyInfo.type !== 'barycenter') {
            const visualParentNaif = this.getVisualParent(bodyId, hierarchyInfo);
            if (visualParentNaif !== undefined) {
                parentId = visualParentNaif;
            }
        }
        
        
        // Create orbit data object
        const orbit = new CelestialOrbit(bodyId, parentId, {
            name: hierarchyInfo.name,
            type: hierarchyInfo.type
        });
        
        // Calculate orbit points
        const points = this.calculator.calculateOrbitPoints(orbit, currentTime);
        
        if (points.length === 0) {
            // Skip orbit rendering (e.g., for dwarf planets at barycenter center)
            return true;
        }
        
        if (points.length < 2) {
            console.warn(`[CelestialOrbitManager] Not enough orbit points for ${hierarchyInfo.name}: ${points.length}`);
            return false;
        }
        
        // Update orbit with calculated points
        orbit.updatePoints(points, currentTime);
        
        // Get body configuration for rendering
        const bodyConfig = this.calculator.stateCalculator._getFullBodyConfig?.(bodyId) || {};
        
        // Get parent group for this orbit
        const parentGroup = this.getParentGroup(parentId);
        if (!parentGroup) {
            console.warn(`[CelestialOrbitManager] No parent group found for ${hierarchyInfo.name} (parent: ${parentId})`);
            return false;
        }
        
        
        // Create rendering
        const mesh = this.renderer.createOrbitMesh(orbit, parentGroup, hierarchyInfo.name, bodyConfig);
        if (!mesh) {
            console.warn(`[CelestialOrbitManager] Failed to create orbit mesh for ${hierarchyInfo.name}`);
            return false;
        }
        
        // Store orbit
        this.orbits.set(bodyId, orbit);
        
        return true;
    }
    
    /**
     * Update orbits if needed
     */
    update() {
        // Try to initialize calculator if not available
        if (!this.calculator && this.app.physicsIntegration?.physicsEngine) {
            this.initialize(this.app.physicsIntegration.physicsEngine);
        }
        
        if (!this.calculator) return;
        
        if (this.shouldUpdateOrbits()) {
            this.renderAllOrbits();
        }
    }
    
    
    /**
     * Set visibility of all orbits
     */
    setAllVisible(visible) {
        this.renderer.setAllVisible(visible);
    }
    
    /**
     * Set visibility of specific orbit
     */
    setOrbitVisible(bodyId, visible) {
        const orbit = this.orbits.get(bodyId);
        if (orbit) {
            this.renderer.setOrbitVisibility(orbit, visible);
        }
    }
    
    /**
     * Force update of specific orbit
     */
    updateOrbit(bodyId) {
        const orbit = this.orbits.get(bodyId);
        if (!orbit) return false;
        
        orbit.invalidate();
        
        const currentTime = this.app.physicsIntegration?.physicsEngine?.simulationTime || new Date();
        const points = this.calculator.calculateOrbitPoints(orbit, currentTime);
        
        if (points.length < 2) {
            console.warn(`[CelestialOrbitManager] Not enough points to update orbit for body ${bodyId}`);
            return false;
        }
        
        orbit.updatePoints(points, currentTime);
        return this.renderer.updateOrbitMesh(orbit);
    }
    
    /**
     * Get orbit information for debugging
     */
    getOrbitInfo() {
        const info = [];
        const hierarchy = this.app.hierarchy?.hierarchy;
        if (!hierarchy) return info;
        
        for (const [bodyId, orbit] of this.orbits) {
            const hierarchyInfo = hierarchy[bodyId];
            const debugInfo = this.renderer.getDebugInfo(orbit);
            
            info.push({
                bodyId,
                name: hierarchyInfo?.name || `Body ${bodyId}`,
                parentId: orbit.parentId,
                parentName: orbit.parentId === 0 ? 'SSB' : hierarchy[orbit.parentId]?.name || `Body ${orbit.parentId}`,
                points: orbit.points.length,
                period: orbit.period ? `${(orbit.period/86400).toFixed(2)} days` : 'unknown',
                dataSource: this.calculator.getDataSourceType(bodyId),
                ...debugInfo
            });
        }
        
        return info;
    }
    
    /**
     * Alias for getOrbitInfo() - for compatibility with OrbitManager API
     */
    getOrbitalInfo() {
        return this.getOrbitInfo();
    }
    
    /**
     * Render all solar system orbits - main entry point
     */
    renderSolarSystemOrbits() {
        this.renderAllOrbits();
    }
    
    /**
     * Add a custom orbital relationship (deprecated - use app.hierarchy directly)
     */
    addOrbitalRelationship() {
        console.warn('[CelestialOrbitManager] addOrbitalRelationship is deprecated - modify app.hierarchy directly');
    }
    
    /**
     * Remove orbital relationship (deprecated - use app.hierarchy directly)
     */
    removeOrbitalRelationship(childNaif) {
        console.warn('[CelestialOrbitManager] removeOrbitalRelationship is deprecated - modify app.hierarchy directly');
        
        // Remove corresponding orbit
        const orbit = this.orbits.get(childNaif);
        if (orbit) {
            this.renderer.disposeOrbit(orbit);
            this.orbits.delete(childNaif);
        }
    }
    
    /**
     * Get visual parent for orbit rendering (replaces OrbitHierarchy.getVisualParent)
     * Moons should always use their actual barycenter parent, not the planet
     */
    getVisualParent(bodyId, hierarchyInfo) {
        // Always use actual hierarchical parent - moons orbit barycenters, not planets
        // This ensures moons don't rotate with their planet's daily spin
        return undefined; // Use actual parent (barycenter)
    }
    
    /**
     * Get parent group for orbit line placement (replaces OrbitHierarchy.getParentGroup)
     * Uses existing Three.js hierarchy from setupScene.js
     */
    getParentGroup(parentId) {
        if (parentId === 0) {
            // Root orbits go in main scene
            return this.scene;
        }
        
        // Find parent body using app.bodiesByNaifId
        const parentBody = this.app.bodiesByNaifId?.[parentId];
        
        if (parentBody && parentBody.getOrbitGroup) {
            // All orbits use their parent's orbit group (position only, no rotation)
            // This ensures proper hierarchy: moons orbit barycenters, not planets
            return parentBody.getOrbitGroup();
        }
        
        // Fallback to scene if parent not found
        return this.scene;
    }
    
    /**
     * Add custom color scheme
     */
    addColorScheme(parentId, color) {
        this.renderer.addColorScheme(parentId, color);
    }
    
    /**
     * Clear all orbits
     */
    clearOrbits() {
        // Dispose all rendering
        this.renderer.disposeAll();
        
        // Clear orbit data
        this.orbits.clear();
    }
    
    /**
     * Force orbit regeneration (for display settings changes, etc.)
     */
    forceUpdate() {
        // During initialization, debounce multiple force updates
        if (this._isInitializing) {
            if (this._forceUpdateTimeout) {
                clearTimeout(this._forceUpdateTimeout);
            }
            
            // Debounce to only update once after all initialization settings are applied
            this._forceUpdateTimeout = setTimeout(() => {
                this._performForceUpdate();
                this._forceUpdateTimeout = null;
            }, 100); // 100ms debounce
            return;
        }
        
        // Normal operation - immediate update
        this._performForceUpdate();
    }
    
    /**
     * Internal method to perform the actual force update
     */
    _performForceUpdate() {
        this._lastOrbitUpdate = null; // Reset to trigger update
        this._lastSimTime = null; // Reset sim time tracking
        this.renderAllOrbits();
    }
    
    /**
     * Set visibility of all orbits
     */
    setVisible(visible) {
        this.setAllVisible(visible);
    }
    
    /**
     * Update resolution for responsive materials (compatibility method)
     */
    onResize() {
        // For future resolution-dependent orbit features
    }
    
    /**
     * Check if orbits need updating (enhanced version from OrbitManager)
     */
    shouldUpdateOrbits() {
        const now = Date.now();
        
        // Always update on first call
        if (!this._lastOrbitUpdate) {
            return true;
        }
        
        // Check for significant time jumps
        if (this.app?.physicsIntegration?.physicsEngine?.simulationTime) {
            const currentSimTime = this.app.physicsIntegration.physicsEngine.simulationTime.getTime();
            if (this._lastSimTime) {
                const timeDiff = Math.abs(currentSimTime - this._lastSimTime);
                if (timeDiff > this.config.timeJumpThreshold) {
                    return true;
                }
            }
        }
        
        // Check if real-time orbit updates are enabled
        const enableRealTimeOrbits = this.app.getDisplaySetting?.('realTimePlanetOrbits') ?? true;
        
        if (enableRealTimeOrbits) {
            // Update every 5 seconds for orbital element changes
            return (now - this._lastOrbitUpdate) > this.config.updateThreshold;
        }
        
        // Performance mode: update every 30 seconds
        return (now - this._lastOrbitUpdate) > 30000;
    }
    
    /**
     * Dispose of all resources
     */
    dispose() {
        // Clear any pending force update
        if (this._forceUpdateTimeout) {
            clearTimeout(this._forceUpdateTimeout);
            this._forceUpdateTimeout = null;
        }
        
        this.clearOrbits();
        this.calculator = null;
    }
}