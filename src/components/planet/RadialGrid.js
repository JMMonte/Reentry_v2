import * as THREE from 'three';
import { WebGLLabels } from '../../utils/WebGLLabels.js';
import { RENDER_ORDER } from './PlanetConstants.js';

export class RadialGrid {
    /**
     * Create a radial grid attached to a specific planet based on its configuration.
     * @param {Planet} planet - The planet instance this grid belongs to.
     * @param {object} config - The radialGridConfig object for rendering.
     * @param {LabelManager} labelManager - The unified label manager instance.
     */
    constructor(planet, config, labelManager = null) {
        this.planet = planet;
        this.config = config;
        this.labelManager = labelManager;

        this.group = new THREE.Group();
        this.group.name = `${planet.name}_radialGrid`;
        this.worldPosition = new THREE.Vector3();
        
        // Single grid mesh instead of LOD
        this.gridMesh = null;

        const planetOrbitGroup = planet.getOrbitGroup();

        if (!planetOrbitGroup) {
            // Planet should always have an orbitGroup based on Planet.js structure
            return;
        }

        this.parentRef = planetOrbitGroup; // Set parentRef to the orbitGroup
        if (planetOrbitGroup) {
            planetOrbitGroup.add(this.group); // Add to planet's orbit group
            this.group.position.set(0, 0, 0);    // Set local position to origin
            this.group.quaternion.identity();    // Set local rotation to identity
        }

        this.labelsSprites = [];
        this.labelCategory = `radial_grid_${planet.naifId || planet.name}`;
        
        // Animation state for the entire grid
        this.fadeAnimation = {
            targetOpacity: 1,
            currentOpacity: 1,
            startOpacity: 1,
            startTime: 0,
            animating: false
        };
        this.animationDuration = 300; // 300ms fade duration
        
        // Track intended visibility state (separate from distance-based fading)
        this.isManuallyVisible = true;

        if (!config) {
            console.warn(`RadialGrid: No config provided for planet ${planet.name}. Grid will not be created.`);
            return;
        }

        this.createGrid();
        // Initial position will be set by the first Planet.update() call
    }

    createGrid() {
        // Always create a basic grid, regardless of config
        const soi = (typeof this.planet.soiRadius === 'number' && isFinite(this.planet.soiRadius) && this.planet.soiRadius > 0)
            ? this.planet.soiRadius : 1000; // fallback if missing
        const scaledPlanetRadius = this.planet.radius;
        const maxRadiusScaled = scaledPlanetRadius + soi;
        const markerStep = Math.max(soi / 10, 1); // at least 1 unit step
        const markerCount = Math.floor(soi / markerStep);
        const radialLineCount = 8;

        // --- Materials with transparency for better appearance ---
        const majorOpacity = 0.25;  // Reduced from 0.35 for less shine
        
        // Colors for alternating pattern - neutral gray-blue tones
        const color1 = new THREE.Color(0x4d5d6d); // Dark gray-blue
        const color2 = new THREE.Color(0x667788); // Medium gray-blue
        const majorColor = new THREE.Color(0x7788aa); // Light gray-blue for major features
        
        // We'll use vertex colors for better visual variety
        const vertices = [];
        const colors = [];
        
        // --- Add radial lines first (alternating colors) ---
        for (let i = 0; i < radialLineCount; i++) {
            const angle = (i / radialLineCount) * Math.PI * 2;
            const color = (i & 1) ? color1 : color2;
            
            vertices.push(0, 0, 0);
            vertices.push(
                Math.cos(angle) * maxRadiusScaled,
                Math.sin(angle) * maxRadiusScaled,
                0
            );
            
            colors.push(color.r, color.g, color.b);
            colors.push(color.r, color.g, color.b);
        }

        // --- Add main SOI circle (major color) ---
        this.addCircleToBuffers(scaledPlanetRadius + soi, 128, majorColor, vertices, colors);
        this.createLabel('SOI', scaledPlanetRadius + soi);

        // --- Add config circles (if any) ---
        const circles = (this.config && Array.isArray(this.config.circles)) ? this.config.circles : [];
        circles.forEach((circleConfig, index) => {
            if (typeof circleConfig.radius !== 'number' || !isFinite(circleConfig.radius)) return;
            const r = scaledPlanetRadius + circleConfig.radius;
            if (!isFinite(r) || r > scaledPlanetRadius + soi) return;
            
            // Major circles get major color, others alternate
            const isMajor = circleConfig.style?.toLowerCase() === 'major';
            const color = isMajor ? majorColor : (index & 1) ? color2 : color1;
            this.addCircleToBuffers(r, 128, color, vertices, colors);
            if (circleConfig.label) this.createLabel(circleConfig.label, r);
        });

        // --- Add standard distance markers (alternating subtle colors) ---
        for (let i = 1; i < markerCount; i++) {
            const r = scaledPlanetRadius + i * markerStep;
            if (!isFinite(r) || r > scaledPlanetRadius + soi) continue;
            
            // Every 5th ring is brighter
            const color = (i % 5 === 0) ? color2 : color1;
            this.addCircleToBuffers(r, 64, color, vertices, colors);
            
            // Labels only at certain intervals
            if (i % 2 === 0) {
                const labelText = `${Math.round(i * markerStep)} km`;
                this.createLabel(labelText, r);
            }
        }
        
        // Create geometry with vertex colors
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        // Material that uses vertex colors
        const gridMaterial = new THREE.LineBasicMaterial({ 
            vertexColors: true, 
            transparent: true, 
            opacity: majorOpacity,
            depthWrite: false
        });
        
        this.gridMesh = new THREE.LineSegments(geometry, gridMaterial);
        this.gridMesh.userData.baseOpacity = majorOpacity;
        this.group.add(this.gridMesh);
    }

    // Add circle vertices and colors to buffers
    addCircleToBuffers(scaledRadius, segments, color, vertices, colors) {
        if (isNaN(scaledRadius)) {
            console.error(`RadialGrid [${this.planet.name}] addCircleToBuffers: Attempted to create circle with NaN radius! Skipping.`);
            return;
        }

        for (let i = 0; i < segments; i++) {
            // First vertex
            let angle = (i / segments) * Math.PI * 2;
            vertices.push(
                Math.cos(angle) * scaledRadius,
                Math.sin(angle) * scaledRadius,
                0
            );
            colors.push(color.r, color.g, color.b);
            
            // Second vertex
            angle = ((i + 1) / segments) * Math.PI * 2;
            vertices.push(
                Math.cos(angle) * scaledRadius,
                Math.sin(angle) * scaledRadius,
                0
            );
            colors.push(color.r, color.g, color.b);
        }
    }

    // This function now expects an already scaled radius
    createLabel(text, scaledRadius) {
        if (this.labelManager) {
            // Use LabelManager for consistent styling and management with planet-specific render orders
            const label = this.labelManager.createLabel(text, 'DISTANCE_MARKER', {
                position: new THREE.Vector3(scaledRadius * 1.02, 0, 0),
                category: this.labelCategory,
                userData: { radius: scaledRadius, planet: this.planet.name },
                renderOrderOverrides: this.planet.renderOrderOverrides // Pass planet-specific render orders!
            });
            
            this.group.add(label.sprite);
            
            // FORCE high render order to ensure labels render above ALL atmospheres
            label.sprite.renderOrder = 1000;
            label.sprite.material.depthWrite = false;
            label.sprite.material.depthTest = true;
            
            this.labelsSprites.push(label);
        } else {
            // Fallback to direct WebGLLabels usage for backward compatibility
            const labelConfig = {
                fontSize: 42,
                fontFamily: 'sans-serif',
                color: '#ffffff',
                pixelScale: 0.0002,
                sizeAttenuation: false,
                transparent: true,
                renderOrder: RENDER_ORDER.DISTANCE_MARKERS
            };
            
            const sprite = WebGLLabels.createLabel(text, labelConfig);
            const offset = 1.02;
            sprite.position.set(scaledRadius * offset, 0, 0);
            this.group.add(sprite);
            this.labelsSprites.push(sprite);
        }
    }

    /**
     * Update opacity based on camera distance.
     * @param {THREE.Camera} camera - The scene camera.
     */
    updateFading(camera) {
        if (!this.gridMesh || !camera) return;
        
        // Early exit if grid is manually disabled
        if (!this.isManuallyVisible) return;
        
        this.group.getWorldPosition(this.worldPosition);
        
        // Use centralized distance cache for better performance
        const planetId = this.planet.name || 'unknown';
        let distance = window.app3d?.distanceCache?.getDistance?.(planetId);
        
        // Fallback to direct calculation if cache not available
        if (!distance || distance === 0) {
            distance = camera.position.distanceTo(this.worldPosition);
        }
        
        // Determine target opacity based on distance thresholds
        const soi = this.planet.soiRadius || 1000;
        const gridRadius = this.planet.radius + soi;  // Total grid size
        const fadeThreshold = gridRadius * 3;   // Fade when grid would be small on screen
        let targetOpacity = distance < fadeThreshold ? 1 : 0;
        
        // Check if we need to start a new animation
        const currentTime = Date.now();
        if (targetOpacity !== this.fadeAnimation.targetOpacity) {
            this.fadeAnimation.targetOpacity = targetOpacity;
            this.fadeAnimation.startOpacity = this.fadeAnimation.currentOpacity;
            this.fadeAnimation.startTime = currentTime;
            this.fadeAnimation.animating = true;
        }
        
        // Update animation if active
        if (this.fadeAnimation.animating) {
            const elapsed = currentTime - this.fadeAnimation.startTime;
            const progress = Math.min(elapsed / this.animationDuration, 1);
            
            // Use easing function for smooth animation
            const eased = this.easeInOutCubic(progress);
            this.fadeAnimation.currentOpacity = this.fadeAnimation.startOpacity + 
                (this.fadeAnimation.targetOpacity - this.fadeAnimation.startOpacity) * eased;
            
            if (progress >= 1) {
                this.fadeAnimation.animating = false;
                this.fadeAnimation.currentOpacity = this.fadeAnimation.targetOpacity;
            }
        }
        
        // Apply opacity to entire group
        const opacity = this.fadeAnimation.currentOpacity;
        
        // Only make group visible if manually enabled and has opacity
        this.group.visible = this.isManuallyVisible && opacity > 0.01;
        
        // Update grid mesh opacity and visibility
        if (this.gridMesh) {
            if (this.gridMesh.material) {
                this.gridMesh.material.opacity = this.gridMesh.userData.baseOpacity * opacity;
            }
            this.gridMesh.visible = opacity > 0.01;
        }
        
        // Update all label sprites opacity and visibility
        this.labelsSprites.forEach(sprite => {
            if (sprite.material) {
                sprite.material.opacity = opacity;
            }
            sprite.visible = opacity > 0.01;
        });
    }
    
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    setVisible(visible) {
        this.isManuallyVisible = visible;
        
        if (!visible) {
            // When manually disabled, hide everything immediately
            this.group.visible = false;
            if (this.gridMesh) {
                this.gridMesh.visible = false;
            }
            this.labelsSprites.forEach(sprite => {
                sprite.visible = false;
            });
        }
        // When enabled, let updateFading() handle the visibility based on distance
    }

    dispose() {
        if (this.labelManager) {
            // Use LabelManager to dispose all labels in this category
            this.labelManager.clearCategory(this.labelCategory);
        } else {
            // Fallback to direct disposal for backward compatibility
            WebGLLabels.disposeLabels(this.labelsSprites);
        }

        // Dispose geometries and materials for grid mesh
        this.group.traverse((object) => {
            if (object instanceof THREE.Line || object instanceof THREE.LineSegments) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) object.material.dispose();
            }
        });

        this.labelsSprites = [];
        this.fadeAnimation = null;

        // Remove the group from its parent (the planet's orbit group)
        if (this.parentRef) {
            this.parentRef.remove(this.group);
        }
        
        // Clear references
        this.labelManager = null;
    }

    /** Update the grid's world position to match the planet's orbital position */
    updatePosition() {
        // This method is no longer needed as the grid is a child of the planet's orbitGroup
        // and its local position is set to (0,0,0).
        // Its world position will automatically update when the parent orbitGroup's position updates.

        // Original content:
        // if (this.planet && this.group && this.planet.getOrbitGroup()) { // Check orbit group exists
        //     // Use camera-relative position (already rebased)
        //     this.group.position.copy(this.planet.getOrbitGroup().position);
        // }
    }
}

