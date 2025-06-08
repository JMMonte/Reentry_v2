import * as THREE from 'three';
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
            timeJumpThreshold: 86400000, // 24 hours
            culling: {
                enabled: true,
                minPixelSize: 3.0,      // Minimum apparent size in pixels (aggressive culling for tiny moon orbits)
                maxRenderDistance: 9.461e12  // Maximum distance in km (1 light year)
            }
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

    }

    /**
     * Render all celestial body orbits
     */
    renderAllOrbits() {
        // Try to initialize calculator if not available
        if (!this.calculator && this.app.physicsIntegration) {
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
        // Check if orbit should be culled
        if (this.config.culling.enabled && this.shouldCullOrbit(bodyId)) {
            // Remove existing orbit if it exists
            const existingOrbit = this.orbits.get(bodyId);
            if (existingOrbit) {
                this.renderer.disposeOrbit(existingOrbit);
                this.orbits.delete(bodyId);
            }
            return false;
        }
        
        // Always use actual hierarchical parent
        // Moons orbit barycenters, not planets - this ensures proper orbital mechanics
        const parentId = hierarchyInfo.parent;


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
        if (!this.calculator && this.app.physicsIntegration) {
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
     * Set visibility of all orbits (alias for compatibility)
     */
    setVisible(visible) {
        this.setAllVisible(visible);
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
                period: orbit.period ? `${(orbit.period / 86400).toFixed(2)} days` : 'unknown',
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
     * Check if orbit should be culled based on apparent size
     */
    shouldCullOrbit(bodyId) {
        if (!this.app.camera) return false;
        
        // During initialization, don't cull anything
        if (this._isInitializing) return false;
        
        // Don't cull major planets
        const majorBodies = [10, 199, 299, 399, 499, 599, 699, 799, 899]; // Sun + planets
        if (majorBodies.includes(bodyId)) return false;
        
        const hierarchyInfo = this.app.hierarchy?.hierarchy?.[bodyId];
        if (!hierarchyInfo) return false; // Don't cull if we don't have info
        
        // Try to get position from physics first (most reliable)
        const physicsEngine = this.app.physicsIntegration?.physicsEngine;
        if (!physicsEngine) return false; // Don't cull if physics not ready
        
        // Get body position from physics
        let bodyPos;
        try {
            const stateVector = physicsEngine.stateCalculator?.calculateStateVector(bodyId, physicsEngine.simulationTime);
            if (!stateVector || !stateVector.position) return false;
            bodyPos = new THREE.Vector3(...stateVector.position);
        } catch {
            // If we can't calculate position, don't cull
            return false;
        }
        
        // Get camera position
        const cameraPos = this.app.camera.position;
        
        // Calculate distance from camera to body's orbit center (parent)
        const parentId = hierarchyInfo.parent;
        let orbitCenterPos = new THREE.Vector3(0, 0, 0); // Default to SSB
        
        if (parentId && parentId !== 0) {
            try {
                const parentState = physicsEngine.stateCalculator?.calculateStateVector(parentId, physicsEngine.simulationTime);
                if (parentState && parentState.position) {
                    orbitCenterPos = new THREE.Vector3(...parentState.position);
                }
            } catch {
                // Use body position as fallback
            }
        }
        
        // Distance from camera to orbit center
        const distanceToOrbitCenter = cameraPos.distanceTo(orbitCenterPos);
        
        // Get orbit radius
        const orbitRadius = bodyPos.distanceTo(orbitCenterPos);
        
        // Don't cull if orbit radius is 0 (body at parent position)
        if (orbitRadius < 1) return false;
        
        // Calculate apparent size in pixels
        const fov = this.app.camera.fov * Math.PI / 180;
        const screenHeight = window.innerHeight;
        const apparentSize = (orbitRadius * 2 / distanceToOrbitCenter) * (screenHeight / (2 * Math.tan(fov / 2)));
        
        // Special handling for moons - use more aggressive culling
        const isMoon = hierarchyInfo.type === 'moon';
        const minPixelSize = isMoon ? this.config.culling.minPixelSize * 2 : this.config.culling.minPixelSize;
        
        // Cull if apparent size is less than minimum pixel size
        return apparentSize < minPixelSize;
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