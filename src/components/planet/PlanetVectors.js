import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../../assets/fonts/helvetiker_regular.typeface.json';
import { ArrowUtils } from '../../utils/ArrowUtils.js';
import { WebGLLabels } from '../../utils/WebGLLabels.js';

const ARROW_COLORS = {
    velocity: 0xff00ff, // bright magenta
};

// Add a simple unique ID generator for debugging
let planetVectorsInstanceCounter = 0;

export class PlanetVectors {
    constructor(body, scene, sun, options = {}) {
        this.instanceId = planetVectorsInstanceCounter++; // Assign unique ID
        this.body = body;
        this.scene = scene; // should be rebaseGroup
        this.sun = sun; // Sun mesh or object with getWorldPosition
        this.options = options;
        // Detect barycenter: use type property if available, else fallback to old logic
        const isBarycenter = body.type === 'barycenter' || !body.radius || !body.rotationGroup;
        // Use Mercury's radius for barycenter axes
        this.radius = isBarycenter ? 2439.7 : body.radius || 1; // Mercury mean radius in km
        this.arrowLength = this.radius * 2;
        this.arrowHeadLength = this.radius * 0.15;
        this.arrowHeadWidth = this.radius * 0.07;
        this.fontLoader = new FontLoader();
        this.font = null;
        this.group = new THREE.Group(); // This group is always added to the scene and remains visible.
        // Parent to orientationGroup (ecliptic/orbital frame), not rotationGroup
        (body.orientationGroup || body.orbitGroup || scene).add(this.group);
        this.group.position.set(0, 0, 0); // Always at local origin of parent
        this.isBarycenter = isBarycenter;
        const { name = 'Planet' } = options;
        this.options = { name };
        this.directionalArrows = [];
        this.directionalLabels = [];
        if (isBarycenter) {
            // Only create axes helper for barycenters initially, controlled by setAxesVisible
            this.setAxesVisible(false); // Start with axes hidden for barycenters too
            // Do NOT return; allow vectors to be created for barycenters
        }
        // If mesh is not ready, listen for mesh loaded event
        if (!this.body.getMesh() && !isBarycenter) {
            if (typeof this.body.addEventListener === 'function') {
                this.body.addEventListener('planetMeshLoaded', () => {
                    this.#initVectorsAsync();
                });
            } else {
                // fallback: poll every 100ms (should not be needed)
                this._pollInterval = setInterval(() => {
                    if (this.body.getMesh()) {
                        clearInterval(this._pollInterval);
                        this._pollInterval = null;
                        this.#initVectorsAsync();
                    }
                }, 100);
            }
        } else {
            this.#initVectorsAsync();
        }
        // Add axes helpers to both orbitGroup and rotationGroup
        this.orbitAxesHelper = new THREE.AxesHelper(this.radius * 2);
        if (body.orbitGroup) {
            body.orbitGroup.add(this.orbitAxesHelper);
            this.orbitAxesHelper.position.set(0, 0, 0);
            this.orbitAxesHelper.visible = false;
            this.orbitAxesLabels = this.#createAxesLabels(this.radius * 2, ['X', 'Y', 'Z'], 'ecliptic', body.name);
            this.orbitAxesLabels.forEach(lbl => this.orbitAxesHelper.add(lbl));
        }
        // Only X and Y axes for the body (rotation) axes helper
        this.rotationAxesHelper = new THREE.AxesHelper(this.radius * 2);
        if (body.rotationGroup) {
            // Remove the Z axis from the geometry
            const positions = this.rotationAxesHelper.geometry.attributes.position;
            // AxesHelper geometry: 6 lines (X+,X-,Y+,Y-,Z+,Z-), each line = 2 points
            // Remove Z+ and Z- (last 4 points)
            const newPositions = new Float32Array(4 * 3); // 4 points (X+,X-,Y+,Y-)
            newPositions.set(positions.array.slice(0, 12));
            this.rotationAxesHelper.geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
            body.rotationGroup.add(this.rotationAxesHelper);
            this.rotationAxesHelper.position.set(0, 0, 0);
            this.rotationAxesHelper.visible = false;
            this.rotationAxesLabels = this.#createAxesLabels(this.radius * 2, ['X', 'Y'], 'body', body.name);
            this.rotationAxesLabels.forEach(lbl => this.rotationAxesHelper.add(lbl));
        }
    }

    #initVectorsAsync() {
        try {
            this.font = this.fontLoader.parse(helveticaRegular);
            this.initVectors(); // This will populate directionalArrows and directionalLabels
        } catch (error) {
            console.error('Failed to parse font:', error);
        }
    }

    initVectors() {
        if (!this.font) {
            console.warn('Font not loaded yet, skipping vector initialization');
            return;
        }
        this.initVelocityVector();
        // Initially, directional vectors are hidden until toggled on.
        this.setVisible(false);
    }

    initVelocityVector() {
        // Create the velocity arrow using ArrowUtils
        const velocityResult = ArrowUtils.createArrowHelper({
            direction: new THREE.Vector3(1, 0, 0),
            origin: new THREE.Vector3(0, 0, 0),
            length: this.arrowLength,
            color: ARROW_COLORS.velocity,
            headLengthRatio: this.arrowHeadLength / this.arrowLength,
            headWidthRatio: this.arrowHeadWidth / this.arrowLength,
            depthTest: true,
            depthWrite: true,
            transparent: false,
            opacity: 1,
            visible: false // Initially hidden until toggled
        });

        this.velocityArrow = velocityResult.arrow;
        this.velocityDispose = velocityResult.dispose;

        // Create velocity label directly with WebGLLabels for proper styling
        const velocityLabelConfig = {
            fontSize: 42,
            fontFamily: 'sans-serif',
            color: '#ff00ff', // Match velocity arrow color (bright magenta)
            backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent background for readability
            padding: 4,
            pixelScale: 0.0002,
            sizeAttenuation: false,
            renderOrder: 999,
            transparent: true
        };
        
        this.velocityLabel = WebGLLabels.createLabel(
            `${this.options.name} Velocity`,
            velocityLabelConfig
        );
        this.velocityLabel.visible = false; // Initially hidden

        // Add to appropriate parent
        const parent = this.body.orbitGroup || this.group;
        parent.add(this.velocityArrow);
        parent.add(this.velocityLabel);

        // Store for cleanup
        if (!this.labelSprites) {
            this.labelSprites = [];
        }
        this.labelSprites.push(this.velocityLabel);

        this.directionalArrows.push(this.velocityArrow);
        this.directionalLabels.push(this.velocityLabel);
    }

    createLabel(text, position) {
        // Use WebGLLabels with same configuration as RadialGrid
        const labelConfig = {
            fontSize: 42,
            fontFamily: 'sans-serif',
            color: '#ffffff',
            pixelScale: 0.0002,
            sizeAttenuation: false,
            renderOrder: 999,
            transparent: true
        };
        
        const sprite = WebGLLabels.createLabel(text, labelConfig);
        sprite.position.copy(position);
        this.group.add(sprite);
        
        // Store for cleanup
        if (!this.labelSprites) {
            this.labelSprites = [];
        }
        this.labelSprites.push(sprite);

        return sprite;
    }

    updateVectors() {
        // All vectors/arrows should use (0,0,0) as their origin in local (ecliptic/orbital) space
        const center = new THREE.Vector3(0, 0, 0);
        
        // Always update the velocity arrow
        if (this.velocityArrow) {
            const relativeVelocity = this.getPhysicsVelocity(); // This now returns relative velocity or null
            
            if (relativeVelocity && relativeVelocity.length() > 0) {
                // Body has relative motion - show velocity vector
                const velocityLen = relativeVelocity.length(); // Get magnitude from relative velocity
                const velocityDir = relativeVelocity.clone().normalize(); // Get direction from relative velocity
                
                // Update label with local velocity magnitude
                if (this.velocityLabel) {
                    const velocityText = `${this.options.name} Local Velocity\n${velocityLen.toFixed(3)} km/s`;
                    WebGLLabels.updateLabel(this.velocityLabel, velocityText);
                    this.velocityLabel.visible = true;
                    // Position label at arrow tip
                    const labelPos = velocityDir.clone().multiplyScalar(this.arrowLength * 1.1);
                    this.velocityLabel.position.copy(labelPos);
                }
                
                // Update arrow direction and position
                this.velocityArrow.setDirection(velocityDir);
                this.velocityArrow.position.copy(center);
                this.velocityArrow.setLength(this.arrowLength, this.arrowHeadLength, this.arrowHeadWidth);
                
                // Make arrow visible
                this.velocityArrow.visible = true;
                // Also ensure all arrow components are visible
                if (this.velocityArrow.line) this.velocityArrow.line.visible = true;
                if (this.velocityArrow.cone) this.velocityArrow.cone.visible = true;
            } else {
                // Body is stationary relative to parent - hide velocity vector completely
                this.velocityArrow.visible = false;
                // Also hide all arrow components explicitly
                if (this.velocityArrow.line) this.velocityArrow.line.visible = false;
                if (this.velocityArrow.cone) this.velocityArrow.cone.visible = false;
                
                if (this.velocityLabel) {
                    this.velocityLabel.visible = false;
                }
            }
        }
    }

    setVisible(visible) {
        // This method now controls only the directional vectors and their labels.
        this.directionalArrows.forEach(arrow => {
            if (arrow) arrow.visible = visible;
        });
        this.directionalLabels.forEach(label => {
            if (label) label.visible = visible;
        });
    }

    // Fade labels based on camera distance: fully visible until fadeStart, then fade out to zero at fadeEnd
    updateFading(camera) {
        // For barycenters, use orbitGroup position if mesh is missing
        let center = new THREE.Vector3();
        if (this.body?.getMesh && this.body.getMesh()) {
        this.body.getMesh().getWorldPosition(center);
        } else if (this.isBarycenter && this.body.orbitGroup) {
            this.body.orbitGroup.getWorldPosition(center);
        } else {
            return;
        }
        const distToCenter = camera.position.distanceTo(center);
        const fadeStart = this.radius * 25;  // Match grid systems
        const fadeEnd = this.radius * 100;   // Match grid systems
        let opacity = 1;
        if (distToCenter > fadeStart) {
            opacity = distToCenter >= fadeEnd
                ? 0
                : 1 - (distToCenter - fadeStart) / (fadeEnd - fadeStart);
            opacity = Math.max(0, Math.min(1, opacity));
        }
        // Fade all directional labels (Sprites)
        this.directionalLabels.forEach(label => {
            if (label && label.material) {
                label.material.opacity = opacity;
                label.material.transparent = opacity < 1;
                label.material.needsUpdate = true;
                label.material.depthWrite = opacity === 1;
                label.visible = opacity > 0;
            }
        });
        // Fade all directional arrows (velocity, etc.)
        this.directionalArrows.forEach(arrow => {
            if (arrow && arrow.line && arrow.cone) {
                arrow.line.material.opacity = opacity;
                arrow.line.material.transparent = opacity < 1;
                arrow.line.material.needsUpdate = true;
                arrow.cone.material.opacity = opacity;
                arrow.cone.material.transparent = opacity < 1;
                arrow.cone.material.needsUpdate = true;
                arrow.visible = opacity > 0;
            }
        });
        // Fade axes helpers and their WebGL sprite labels
        const fadeAxesHelper = (helper, labels) => {
            if (helper) helper.visible = opacity > 0;
            if (labels) labels.forEach(lbl => {
                if (lbl && lbl.material) {
                    lbl.material.opacity = opacity;
                    lbl.material.transparent = opacity < 1;
                    lbl.material.needsUpdate = true;
                    lbl.visible = opacity > 0;
                }
            });
        };
        fadeAxesHelper(this.orbitAxesHelper, this.orbitAxesLabels);
        fadeAxesHelper(this.rotationAxesHelper, this.rotationAxesLabels);
    }

    setAxesVisible(visible) {
        if (this.orbitAxesHelper) this.orbitAxesHelper.visible = visible;
        if (this.rotationAxesHelper) this.rotationAxesHelper.visible = visible;
        if (this.orbitAxesLabels) this.orbitAxesLabels.forEach(lbl => lbl.visible = visible);
        if (this.rotationAxesLabels) this.rotationAxesLabels.forEach(lbl => lbl.visible = visible);
    }

    #createAxesLabels(size, axes = ['X', 'Y', 'Z'], context = '', name = '') {
        // context: 'ecliptic' or 'body'
        // name: planet's name
        const color = { X: '#ff0000', Y: '#00ff00', Z: '#0000ff' };
        const axisLabels = {
            ecliptic: {
                X: `${name} Ecliptic X (Vernal Equinox)`,
                Y: `${name} Ecliptic Y`,
                Z: `${name} Ecliptic Z`
            },
            body: {
                X: `${name} Prime Meridian`,
                Y: `${name} Rotation Axis`
            }
        };
        return axes.map(axis => {
            const position = new THREE.Vector3(
                axis === 'X' ? size : 0,
                axis === 'Y' ? size : 0,
                axis === 'Z' ? size : 0
            );
            
            // Use WebGLLabels with same configuration as RadialGrid
            const labelConfig = {
                fontSize: 42,
                fontFamily: 'sans-serif',
                color: color[axis],
                backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent background for readability
                padding: 4,
                pixelScale: 0.0002,
                sizeAttenuation: false,
                renderOrder: 998,
                transparent: true
            };
            
            const sprite = WebGLLabels.createLabel(
                axisLabels[context]?.[axis] || `${name} ${axis}`,
                labelConfig
            );
            sprite.position.copy(position);

            // Store for cleanup
            if (!this.labelSprites) {
                this.labelSprites = [];
            }
            this.labelSprites.push(sprite);

            return sprite;
        });
    }

    setPlanetVectorsVisible(visible) {
        this.setVisible(visible);
        this.setAxesVisible(visible);
    }
    
    /**
     * Dispose of all resources and clean up memory
     */
    dispose() {
        // Clear polling interval if it exists
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
        
        // Remove event listener if added
        if (this.body && typeof this.body.removeEventListener === 'function') {
            this.body.removeEventListener('planetMeshLoaded', this.#initVectorsAsync);
        }
        
        // Dispose velocity arrow
        if (this.velocityDispose) {
            this.velocityDispose();
            this.velocityDispose = null;
        }
        
        // Dispose label sprites using WebGLLabels utility
        if (this.labelSprites) {
            WebGLLabels.disposeLabels(this.labelSprites);
            this.labelSprites = [];
        }

        // Dispose individual dispose functions if they exist
        if (this.labelDisposeFunctions) {
            this.labelDisposeFunctions.forEach(dispose => dispose());
            this.labelDisposeFunctions = [];
        }

        // Clean up axes helpers and their labels
        const disposeAxesHelper = (helper) => {
            if (helper && helper.parent) {
                helper.parent.remove(helper);
                // AxesHelper is disposable
                if (helper.dispose) helper.dispose();
            }
            // Axes labels are now included in labelSprites and disposed via WebGLLabels
        };

        disposeAxesHelper(this.orbitAxesHelper);
        disposeAxesHelper(this.rotationAxesHelper);

        // Clear references
        this.directionalArrows = [];
        this.directionalLabels = [];
        this.orbitAxesHelper = null;
        this.rotationAxesHelper = null;
        this.orbitAxesLabels = [];
        this.rotationAxesLabels = [];
        this.velocityArrow = null;
        this.velocityLabel = null;

        // Remove main group from scene
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        
        // Clear references
        this.body = null;
        this.scene = null;
        this.sun = null;
        this.font = null;
        this.group = null;
    }

    /**
     * Get local velocity (velocity in local reference frame) from physics engine data
     * @returns {THREE.Vector3|null} Local velocity vector in km/s or null if not available
     */
    getPhysicsVelocity() {
        // ALWAYS show LOCAL velocity (relative to immediate parent)
        if (window.app3d?.physicsIntegration && this.body.naifId) {
            try {
                // Use LOCAL velocity (this is what we always want to show)
                if (this.body.localVelocity && Array.isArray(this.body.localVelocity)) {
                    const localVel = new THREE.Vector3(
                        this.body.localVelocity[0],
                        this.body.localVelocity[1],
                        this.body.localVelocity[2]
                    );
                    
                    const magnitude = localVel.length();
                    
                    // Show velocity vector if it's significant
                    if (magnitude > 0.001) {
                        return localVel;
                    } else {
                        return null;
                    }
                }
                
            } catch (error) {
                console.warn(`[PlanetVectors] Failed to get local velocity for ${this.body.name}:`, error);
            }
        }
        
        return null;
    }
} 