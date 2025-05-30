/**
 * SatelliteRenderManager - Manages satellite rendering based on physics data
 * 
 * This manager subscribes to physics updates and updates satellite renderers.
 * It does NOT store physics state, only rendering objects.
 */

import { SatelliteRenderer } from '../components/Satellite/SatelliteRenderer.js';

export class SatelliteRenderManager {
    constructor(app) {
        this.app = app;
        this.scene = app.scene;
        
        // Map of satellite ID to renderer
        this.renderers = new Map();
        
        // Subscribe to physics updates
        this._unsubscribe = null;
        this._lastUpdateTime = 0;
        this._updateThrottle = 16; // ~60 FPS
    }

    /**
     * Initialize and subscribe to physics updates
     */
    initialize() {
        if (this.app.physicsAPI) {
            this._unsubscribe = this.app.physicsAPI.subscribe(
                this._handlePhysicsUpdate.bind(this)
            );
        }
        
        // Listen for satellite lifecycle events
        this._setupEventListeners();
    }

    /**
     * Handle physics update
     * @private
     */
    _handlePhysicsUpdate(renderData) {
        // Throttle updates
        const now = performance.now();
        if (now - this._lastUpdateTime < this._updateThrottle) {
            return;
        }
        this._lastUpdateTime = now;
        
        // Update existing satellites
        for (const [id, satelliteData] of renderData.satellites) {
            let renderer = this.renderers.get(id);
            
            if (!renderer) {
                // Create new renderer for new satellite
                renderer = this._createRenderer(id, satelliteData);
                if (renderer) {
                    this.renderers.set(id, renderer);
                }
            }
            
            // Update renderer with latest data
            if (renderer) {
                renderer.updateFromRenderData(satelliteData);
            }
        }
        
        // Remove renderers for deleted satellites
        for (const [id, renderer] of this.renderers) {
            if (!renderData.satellites.has(id)) {
                this._removeRenderer(id);
            }
        }
    }

    /**
     * Create a new satellite renderer
     * @private
     */
    _createRenderer(satelliteId, satelliteData) {
        // Get parent group from central body
        const centralBodyId = satelliteData.centralBodyId;
        let parentGroup = null;
        
        if (centralBodyId && this.app.bodiesByNaifId) {
            const body = this.app.bodiesByNaifId[centralBodyId];
            if (body && body.orbitGroup) {
                parentGroup = body.orbitGroup;
            }
        }
        
        const renderer = new SatelliteRenderer(satelliteId, this.scene, parentGroup);
        
        // Initial update
        renderer.updateFromRenderData(satelliteData);
        
        return renderer;
    }

    /**
     * Remove a satellite renderer
     * @private
     */
    _removeRenderer(satelliteId) {
        const renderer = this.renderers.get(satelliteId);
        if (renderer) {
            renderer.dispose();
            this.renderers.delete(satelliteId);
        }
    }

    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        // Listen for satellite color changes
        this._boundColorChange = (e) => {
            const { id, value } = e.detail;
            const renderer = this.renderers.get(String(id));
            if (renderer) {
                renderer.visualizer.setColor(value);
            }
        };
        
        window.addEventListener('satelliteColorChanged', this._boundColorChange);
    }

    /**
     * Update visibility for all satellites
     * @param {boolean} visible
     */
    setAllVisible(visible) {
        for (const renderer of this.renderers.values()) {
            renderer.setVisible(visible);
        }
    }

    /**
     * Get renderer for a specific satellite
     * @param {string} satelliteId
     * @returns {SatelliteRenderer|null}
     */
    getRenderer(satelliteId) {
        return this.renderers.get(satelliteId) || null;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Unsubscribe from physics
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        
        // Remove event listeners
        if (this._boundColorChange) {
            window.removeEventListener('satelliteColorChanged', this._boundColorChange);
        }
        
        // Dispose all renderers
        for (const renderer of this.renderers.values()) {
            renderer.dispose();
        }
        this.renderers.clear();
        
        // Clear references
        this.app = null;
        this.scene = null;
    }
}