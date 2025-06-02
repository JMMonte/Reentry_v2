import * as THREE from 'three';
import { ArrowUtils } from '../../utils/ArrowUtils.js';

/**
 * ManeuverNodeRenderer - Pure visualization component for maneuver nodes
 * 
 * This class handles only the 3D rendering of maneuver nodes, with no physics
 * calculations or state management. It creates and manages the visual elements:
 * - Node sphere mesh
 * - Delta-V arrow
 * - Orbit path line
 * - Optional labels
 */
export class ManeuverNodeRenderer {
    constructor(params) {
        const {
            scene,
            satellite,
            nodeData,
            color = 0xffffff,
            opacity = 1.0,
            isPreview = false,
            font = null
        } = params;

        this.scene = scene;
        this.satellite = satellite;
        this.nodeData = nodeData;
        this.color = color;
        this.opacity = opacity;
        this.isPreview = isPreview;
        this.font = font;

        // Visual elements
        this.group = new THREE.Group();
        this.nodeMesh = null;
        this.arrow = null;
        this.orbitLine = null;
        this.label = null;

        this.initialize();
    }

    initialize() {
        // Create node sphere
        this.createNodeMesh();
        
        // Create delta-V arrow
        this.createDeltaVArrow();
        
        // Create orbit line
        this.createOrbitLine();
        
        // Add label if font is available
        if (this.font) {
            this.createLabel();
        }

        // Add to scene
        this.scene.add(this.group);
    }

    createNodeMesh() {
        const geometry = new THREE.SphereGeometry(5, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: this.opacity * (this.isPreview ? 0.8 : 1.0),
            depthTest: true,
            depthWrite: !this.isPreview
        });

        this.nodeMesh = new THREE.Mesh(geometry, material);
        this.nodeMesh.renderOrder = this.isPreview ? 1 : 0;
        this.group.add(this.nodeMesh);
    }

    createDeltaVArrow() {
        // Use pre-calculated values from nodeData
        const dvMagnitude = this.nodeData.deltaVMagnitude || (this.nodeData.worldDeltaV ? this.nodeData.worldDeltaV.length() : 0);
        if (dvMagnitude < 0.001) return; // Skip tiny delta-Vs

        // Get delta-V direction
        const dvDirection = this.nodeData.deltaVDirection 
            ? new THREE.Vector3(...this.nodeData.deltaVDirection)
            : (this.nodeData.worldDeltaV ? this.nodeData.worldDeltaV.clone().normalize() : new THREE.Vector3(0, 1, 0));

        // Create arrow using ArrowUtils - visual scaling only
        const shaftLength = Math.min(dvMagnitude * 50, 200); // Scale with dV magnitude
        const arrowResult = ArrowUtils.createCustomArrow({
            direction: dvDirection,
            origin: new THREE.Vector3(0, 0, 0),
            length: shaftLength,
            shaftRadius: 1,
            coneRadius: 4,
            coneHeight: 10,
            color: this.color,
            opacity: this.opacity,
            transparent: true,
            segments: 8
        });
        
        this.arrow = arrowResult.arrow;
        this.arrowDispose = arrowResult.dispose;
        this.group.add(this.arrow);
    }

    createOrbitLine() {
        if (!this.nodeData.orbitData || !this.nodeData.orbitData.states) return;

        const points = this.nodeData.orbitData.states.map(state => 
            new THREE.Vector3(state.position[0], state.position[1], state.position[2])
        );

        if (points.length < 2) return;

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: this.opacity * 0.7,
            linewidth: this.isPreview ? 2 : 1
        });

        // Use dashed line for preview
        if (this.isPreview) {
            material.dashed = true;
            material.dashSize = 8;
            material.gapSize = 4;
        }

        this.orbitLine = new THREE.Line(geometry, material);
        this.orbitLine.computeLineDistances(); // Needed for dashed lines
        this.orbitLine.renderOrder = this.isPreview ? -1 : -2;
        this.scene.add(this.orbitLine); // Add directly to scene for proper rendering
    }

    createLabel() {
        // Use pre-calculated magnitude
        const dvMag = this.nodeData.deltaVMagnitude || (this.nodeData.worldDeltaV ? this.nodeData.worldDeltaV.length() : 0);
        const labelText = `ΔV: ${dvMag.toFixed(1)} km/s`;
        
        if (this.font) {
            // Use 3D text if font is available
            const labelResult = ArrowUtils.create3DTextLabel({
                text: labelText,
                font: this.font,
                size: 10,
                height: 0.1,
                curveSegments: 4,
                color: this.color,
                opacity: this.opacity * 0.9,
                transparent: true,
                position: new THREE.Vector3(10, 10, 0)
            });
            
            this.label = labelResult.label;
            this.labelDispose = labelResult.dispose;
            if (this.label) {
                this.group.add(this.label);
            }
        } else {
            // Fallback to sprite label
            const labelResult = ArrowUtils.createTextSprite({
                text: labelText,
                color: `#${this.color.toString(16).padStart(6, '0')}`,
                position: new THREE.Vector3(10, 10, 0),
                fontSize: 32,
                pixelScale: 0.0002
            });
            
            this.label = labelResult.sprite;
            this.labelDispose = labelResult.dispose;
            this.group.add(this.label);
        }
    }

    /**
     * Update visualization position
     */
    updatePosition(position) {
        this.group.position.copy(position);
        
        // Update label to face camera if exists
        if (this.label && this.scene.camera) {
            this.label.lookAt(this.scene.camera.position);
        }
    }

    /**
     * Update orbit path
     */
    updateOrbitPath(orbitData) {
        if (!orbitData || !orbitData.states) return;
        
        // Remove old orbit line
        if (this.orbitLine) {
            this.scene.remove(this.orbitLine);
            this.orbitLine.geometry?.dispose();
            this.orbitLine.material?.dispose();
        }
        
        // Create new orbit line
        this.nodeData.orbitData = orbitData;
        this.createOrbitLine();
    }

    /**
     * Set visibility
     */
    setVisible(visible) {
        this.group.visible = visible;
        if (this.orbitLine) {
            this.orbitLine.visible = visible;
        }
    }

    /**
     * Update visual style
     */
    updateStyle(params) {
        const { color, opacity } = params;
        
        if (color !== undefined) {
            this.color = color;
            if (this.nodeMesh) this.nodeMesh.material.color.set(color);
            if (this.arrow) {
                this.arrow.children.forEach(child => {
                    if (child.material) child.material.color.set(color);
                });
            }
            if (this.orbitLine) this.orbitLine.material.color.set(color);
            if (this.label) this.label.material.color.set(color);
        }
        
        if (opacity !== undefined) {
            this.opacity = opacity;
            if (this.nodeMesh) this.nodeMesh.material.opacity = opacity;
            if (this.arrow) {
                this.arrow.children.forEach(child => {
                    if (child.material) child.material.opacity = opacity * 0.9;
                });
            }
            if (this.orbitLine) this.orbitLine.material.opacity = opacity * 0.7;
            if (this.label) this.label.material.opacity = opacity * 0.9;
        }
    }

    /**
     * Highlight for selection
     */
    setHighlighted(highlighted) {
        const scale = highlighted ? 1.5 : 1.0;
        this.nodeMesh?.scale.setScalar(scale);
        
        if (highlighted) {
            this.updateStyle({ opacity: 1.0 });
        } else {
            this.updateStyle({ opacity: this.isPreview ? 0.8 : 0.9 });
        }
    }

    /**
     * Clean up and dispose
     */
    dispose() {
        // Remove from scene
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
        if (this.orbitLine && this.orbitLine.parent) {
            this.orbitLine.parent.remove(this.orbitLine);
        }
        
        // Use ArrowUtils dispose functions where available
        if (this.arrowDispose) {
            this.arrowDispose();
        }
        if (this.labelDispose) {
            this.labelDispose();
        }

        // Dispose geometries and materials for remaining objects
        const disposeObject = (obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        };
        
        if (this.nodeMesh) disposeObject(this.nodeMesh);
        if (this.orbitLine) disposeObject(this.orbitLine);
        
        // Fallback disposal for arrow and label if ArrowUtils dispose wasn't available
        if (this.arrow && !this.arrowDispose) {
            this.arrow.children.forEach(child => disposeObject(child));
        }
        if (this.label && !this.labelDispose) {
            disposeObject(this.label);
        }
    }
}