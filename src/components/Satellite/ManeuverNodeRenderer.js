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
        console.log('[ManeuverNodeRenderer] Constructor called with params:', params);
        
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
        this.arrowDispose = null;
        this.orbitLine = null;
        this.label = null;

        console.log('[ManeuverNodeRenderer] About to initialize with nodeData:', nodeData);
        this.initialize();
    }

    initialize() {
        console.log('[ManeuverNodeRenderer] Initializing...');
        
        // Create node sphere
        this.createNodeMesh();
        console.log('[ManeuverNodeRenderer] Node mesh created:', this.nodeMesh);
        
        // Create delta-V arrow
        this.createDeltaVArrow();
        console.log('[ManeuverNodeRenderer] Delta-V arrow created:', this.arrow);
        
        // Create orbit path if available
        if (this.nodeData.orbitData) {
            this.createOrbitPath();
            console.log('[ManeuverNodeRenderer] Orbit path created:', this.orbitLine);
        }
        
        // Add label if font is available
        if (this.font) {
            this.createLabel();
        }

        // Add to scene
        console.log('[ManeuverNodeRenderer] Adding group to scene. Scene:', this.scene);
        this.scene.add(this.group);
        console.log('[ManeuverNodeRenderer] Group added to scene. Group children:', this.group.children.length);
        
        // Update position
        if (this.nodeData.positionAtManeuver) {
            console.log('[ManeuverNodeRenderer] Setting position:', this.nodeData.positionAtManeuver);
            this.updatePosition(this.nodeData.positionAtManeuver);
        }
        
        console.log('[ManeuverNodeRenderer] Initialization complete. Group position:', this.group.position);
    }

    createNodeMesh() {
        // Make the sphere much larger and more visible for testing
        const geometry = new THREE.SphereGeometry(50, 16, 16); // Increased from 5 to 50
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
        console.log('[ManeuverNodeRenderer] Created node mesh with radius 50km, color:', this.color.toString(16));
    }

    createDeltaVArrow() {
        const dvMagnitude = this.nodeData.deltaMagnitude || 0;
        if (dvMagnitude < 0.001) return; // Skip tiny delta-Vs

        // Calculate delta-V direction from local coordinates
        const deltaV = this.nodeData.deltaV;
        if (!deltaV) return;

        // For visualization, use the local delta-V vector normalized
        const dvVector = new THREE.Vector3(
            deltaV.radial || 0,
            deltaV.normal || 0,
            deltaV.prograde || 0
        );
        
        if (dvVector.length() < 0.001) return;
        
        const dvDirection = dvVector.normalize();

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

    createOrbitPath() {
        const orbitData = this.nodeData.orbitData;
        if (!orbitData || !orbitData.points || orbitData.points.length < 2) return;

        // Convert points to Vector3 array
        const points = orbitData.points.map(point => {
            if (point.position) {
                return new THREE.Vector3(
                    point.position[0],
                    point.position[1],
                    point.position[2]
                );
            }
            return new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);
        });

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
        const dvMag = this.nodeData.deltaMagnitude || 0;
        const labelText = `ΔV: ${(dvMag * 1000).toFixed(1)} m/s`; // Convert to m/s for display
        
        if (this.font) {
            // Use 3D text if font is available
            const labelResult = ArrowUtils.create3DTextLabel({
                text: labelText,
                font: this.font,
                size: 10,
                color: this.color,
                opacity: this.opacity
            });
            
            if (labelResult.label) {
                this.label = labelResult.label;
                this.label.position.set(10, 10, 0); // Offset from node
                this.group.add(this.label);
            }
        } else {
            // Fallback to sprite label
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 64;
            
            context.font = '48px Arial';
            context.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
            context.textAlign = 'center';
            context.fillText(labelText, 128, 48);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: this.opacity
            });
            
            this.label = new THREE.Sprite(spriteMaterial);
            this.label.scale.set(40, 10, 1);
            this.label.position.set(0, 20, 0);
            this.group.add(this.label);
        }
    }

    /**
     * Update node position
     */
    updatePosition(position) {
        if (!position) return;
        
        // Convert position array to Vector3 if needed
        if (Array.isArray(position)) {
            this.group.position.set(position[0], position[1], position[2]);
        } else if (position.x !== undefined) {
            this.group.position.copy(position);
        }
    }

    /**
     * Update from new data
     */
    updateFromData(nodeData) {
        this.nodeData = nodeData;
        
        // Update position
        if (nodeData.positionAtManeuver) {
            this.updatePosition(nodeData.positionAtManeuver);
        }
        
        // Update orbit path if changed
        if (nodeData.orbitData && this.orbitLine) {
            this.orbitLine.parent.remove(this.orbitLine);
            this.orbitLine.geometry.dispose();
            this.orbitLine.material.dispose();
            this.orbitLine = null;
            this.createOrbitPath();
        }
        
        // Update delta-V arrow if changed
        if (this.arrow && nodeData.deltaMagnitude !== this.nodeData.deltaMagnitude) {
            this.group.remove(this.arrow);
            if (this.arrowDispose) this.arrowDispose();
            this.arrow = null;
            this.createDeltaVArrow();
        }
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
     * Update visual scale based on camera distance
     */
    updateScale(camera) {
        if (!camera || !this.group.visible) return;
        
        const distance = camera.position.distanceTo(this.group.position);
        const scale = Math.min(Math.max(distance * 0.0001, 0.5), 5);
        this.nodeMesh.scale.setScalar(scale);
        
        if (this.label) {
            this.label.scale.setScalar(scale * 10);
        }
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Remove from scene
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
        if (this.orbitLine && this.orbitLine.parent) {
            this.orbitLine.parent.remove(this.orbitLine);
        }

        // Dispose geometries and materials
        if (this.nodeMesh) {
            this.nodeMesh.geometry.dispose();
            this.nodeMesh.material.dispose();
        }

        if (this.arrow && this.arrowDispose) {
            this.arrowDispose();
        }

        if (this.orbitLine) {
            this.orbitLine.geometry.dispose();
            this.orbitLine.material.dispose();
        }

        if (this.label) {
            if (this.label.material.map) {
                this.label.material.map.dispose();
            }
            this.label.material.dispose();
        }

        // Clear references
        this.group = null;
        this.nodeMesh = null;
        this.arrow = null;
        this.orbitLine = null;
        this.label = null;
    }
}