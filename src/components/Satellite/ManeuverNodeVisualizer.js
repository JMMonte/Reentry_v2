import * as THREE from 'three';

/**
 * ManeuverVisualizationManager - Manages 3D visualization of maneuver nodes
 * 
 * This class coordinates the creation and updating of visual representations
 * of maneuver nodes in the 3D scene. It manages multiple node visualizations
 * and handles their lifecycle. It does not handle any physics calculations.
 */
export class ManeuverVisualizationManager {
    constructor(parent, satellite) {
        this.parent = parent; // Can be orbit group or scene
        this.satellite = satellite;
        this.nodeVisuals = new Map(); // Map<nodeId, visualElements>
        this._cameraRef = null;
    }

    /**
     * Set camera reference for scale calculations
     */
    setCamera(camera) {
        this._cameraRef = camera;
    }

    /**
     * Create or update visualization for a maneuver node
     * @param {ManeuverVisualizationDTO} visualData - Visualization data
     */
    updateNodeVisualization(visualData) {
        let visual = this.nodeVisuals.get(visualData.nodeId);
        
        if (!visual) {
            // Create new visualization
            visual = this._createNodeVisual(visualData);
            this.nodeVisuals.set(visualData.nodeId, visual);
        }
        
        // Update position and properties
        this._updateNodeVisual(visual, visualData);
    }

    /**
     * Remove visualization for a maneuver node
     * @param {string} nodeId - Node ID to remove
     */
    removeNodeVisualization(nodeId) {
        const visual = this.nodeVisuals.get(nodeId);
        if (!visual) return;

        // Remove from parent
        if (visual.group) {
            this.parent.remove(visual.group);
            visual.group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }

        if (visual.orbitLine) {
            this.parent.remove(visual.orbitLine);
            visual.orbitLine.geometry.dispose();
            visual.orbitLine.material.dispose();
        }

        this.nodeVisuals.delete(nodeId);
    }

    /**
     * Create visual elements for a maneuver node
     */
    _createNodeVisual(visualData) {
        const group = new THREE.Group();
        
        // Check if this is a preview node
        const isPreview = visualData.nodeId && visualData.nodeId.startsWith('preview_');
        
        // Create node sphere
        const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: isPreview ? 0xffffff : (visualData.color || 0xffffff),
            transparent: true,
            opacity: isPreview ? 0.5 : 0.8,
            wireframe: isPreview
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        group.add(sphere);

        // Create delta-V arrow
        const arrowLength = Math.min(visualData.deltaVMagnitude * 50, 100);
        const arrowHelper = new THREE.ArrowHelper(
            new THREE.Vector3(...visualData.deltaVDirection),
            new THREE.Vector3(0, 0, 0),
            arrowLength,
            visualData.color || 0xffffff,
            arrowLength * 0.3,
            arrowLength * 0.2
        );
        group.add(arrowHelper);

        // Create time label sprite
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.fillText('Maneuver', 128, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            opacity: 0.9
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(20, 5, 1);
        sprite.position.y = 5;
        group.add(sprite);

        // Create predicted orbit line if provided
        let orbitLine = null;
        if (visualData.showPredictedOrbit && visualData.predictedOrbitPoints.length > 0) {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(visualData.predictedOrbitPoints.flat());
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const material = new THREE.LineDashedMaterial({
                color: visualData.color || 0xffffff,
                dashSize: 5,
                gapSize: 5,
                linewidth: 2,
                transparent: true,
                opacity: 0.7
            });
            
            orbitLine = new THREE.Line(geometry, material);
            orbitLine.computeLineDistances();
            orbitLine.frustumCulled = false;
            this.parent.add(orbitLine);
        }

        this.parent.add(group);

        // Ensure maneuver nodes are visible by default
        group.visible = true;
        if (orbitLine) {
            orbitLine.visible = true;
        }

        return {
            group,
            sphere,
            arrow: arrowHelper,
            label: sprite,
            orbitLine,
            canvas,
            context
        };
    }

    /**
     * Update visual elements for a maneuver node
     */
    _updateNodeVisual(visual, visualData) {
        // Update position
        visual.group.position.set(...visualData.position);

        // Update arrow direction and length
        const arrowLength = Math.min(visualData.deltaVMagnitude * 50, 100);
        visual.arrow.setDirection(new THREE.Vector3(...visualData.deltaVDirection));
        visual.arrow.setLength(arrowLength, arrowLength * 0.3, arrowLength * 0.2);

        // Update color (handle both hex string and number formats)
        const color = typeof visualData.color === 'string' 
            ? parseInt(visualData.color.replace('#', '0x'))
            : visualData.color;
        visual.sphere.material.color.setHex(color);
        visual.arrow.setColor(new THREE.Color(color));

        // Update scale based on camera distance
        if (this._cameraRef) {
            const distance = visual.group.position.distanceTo(this._cameraRef.position);
            const scale = Math.max(0.5, Math.min(5, distance * 0.001));
            visual.group.scale.setScalar(scale);
        }

        // Update predicted orbit if needed
        if (visual.orbitLine && visualData.predictedOrbitPoints.length > 0) {
            const positions = new Float32Array(visualData.predictedOrbitPoints.flat());
            visual.orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            visual.orbitLine.geometry.attributes.position.needsUpdate = true;
            visual.orbitLine.computeLineDistances();
        }
    }

    /**
     * Update all node scales based on camera distance
     */
    updateScales() {
        if (!this._cameraRef) return;

        for (const [, visual] of this.nodeVisuals) {
            const distance = visual.group.position.distanceTo(this._cameraRef.position);
            const scale = Math.max(0.5, Math.min(5, distance * 0.001));
            visual.group.scale.setScalar(scale);
        }
    }

    /**
     * Set visibility for all maneuver nodes
     */
    setVisibility(visible) {
        for (const [, visual] of this.nodeVisuals) {
            visual.group.visible = visible;
            if (visual.orbitLine) {
                visual.orbitLine.visible = visible;
            }
        }
    }

    /**
     * Clear all visualizations
     */
    dispose() {
        for (const [nodeId] of this.nodeVisuals) {
            this.removeNodeVisualization(nodeId);
        }
        this.nodeVisuals.clear();
    }
}

export default ManeuverVisualizationManager;