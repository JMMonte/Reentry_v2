/**
 * SatelliteRenderer - Pure rendering component for satellites
 * 
 * This component ONLY handles Three.js rendering.
 * It does NOT store physics state or perform calculations.
 * All data comes from PhysicsAPI via render updates.
 */

import * as THREE from 'three';
import { SatelliteVisualizer } from './SatelliteVisualizer.js';

export class SatelliteRenderer {
    /**
     * @param {string} id - Satellite ID
     * @param {THREE.Scene} scene - Three.js scene
     * @param {Object} parentGroup - Parent group for this satellite (planet's orbit group)
     */
    constructor(id, scene, parentGroup) {
        this.id = id;
        this.scene = scene;
        this.parentGroup = parentGroup;
        
        // Create visual representation
        this.visualizer = new SatelliteVisualizer();
        
        // Add to appropriate parent
        if (parentGroup) {
            parentGroup.add(this.visualizer.mesh);
        } else {
            scene.add(this.visualizer.mesh);
        }
        
        // Rendering state only
        this._lastPosition = [0, 0, 0];
        this._visible = true;
    }

    /**
     * Update visual position from render data
     * @param {SatelliteRenderData} renderData
     */
    updateFromRenderData(renderData) {
        if (!renderData || !this.visualizer.mesh) return;
        
        // Update position
        if (renderData.position && this._hasPositionChanged(renderData.position)) {
            this.visualizer.mesh.position.set(
                renderData.position[0],
                renderData.position[1],
                renderData.position[2]
            );
            this._lastPosition = [...renderData.position];
        }
        
        // Update color if changed
        if (renderData.color !== this._lastColor) {
            this.visualizer.setColor(renderData.color);
            this._lastColor = renderData.color;
        }
        
        // Update visibility
        if (renderData.visible !== this._visible) {
            this.visualizer.setVisible(renderData.visible);
            this._visible = renderData.visible;
        }
    }

    /**
     * Check if position has changed significantly
     * @private
     */
    _hasPositionChanged(newPos) {
        const threshold = 0.01; // 10 meters
        return Math.abs(newPos[0] - this._lastPosition[0]) > threshold ||
               Math.abs(newPos[1] - this._lastPosition[1]) > threshold ||
               Math.abs(newPos[2] - this._lastPosition[2]) > threshold;
    }

    /**
     * Change parent group (for central body changes)
     * @param {THREE.Group} newParentGroup
     */
    setParentGroup(newParentGroup) {
        if (this.visualizer.mesh.parent) {
            this.visualizer.mesh.parent.remove(this.visualizer.mesh);
        }
        
        if (newParentGroup) {
            newParentGroup.add(this.visualizer.mesh);
            this.parentGroup = newParentGroup;
        } else {
            this.scene.add(this.visualizer.mesh);
            this.parentGroup = null;
        }
    }

    /**
     * Set visibility
     * @param {boolean} visible
     */
    setVisible(visible) {
        this._visible = visible;
        this.visualizer.setVisible(visible);
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        if (this.visualizer.mesh.parent) {
            this.visualizer.mesh.parent.remove(this.visualizer.mesh);
        }
        this.visualizer.dispose();
        
        // Clear references
        this.scene = null;
        this.parentGroup = null;
        this.visualizer = null;
    }
}