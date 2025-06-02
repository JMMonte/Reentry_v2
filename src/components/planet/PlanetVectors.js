import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../../assets/fonts/helvetiker_regular.typeface.json';
import { ArrowUtils } from '../../utils/ArrowUtils.js';

const ARROW_COLORS = {
    sun: 0xffff00,
    velocity: 0xff00ff, // bright magenta
};
const LABEL_FONT_SIZE = 64;
const LABEL_COLOR = 'white';

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
        this.initSunDirection();
        this.initVelocityVector(); // NEW
        // Initially, directional vectors are hidden until toggled on.
        this.setVisible(false);
    }

    initVelocityVector() {
        // Create the velocity arrow using ArrowUtils
        const velocityResult = ArrowUtils.createArrowWithLabel({
            direction: new THREE.Vector3(1, 0, 0),
            origin: new THREE.Vector3(0, 0, 0),
            length: this.arrowLength,
            color: ARROW_COLORS.velocity,
            text: `${this.options.name} Velocity`,
            labelType: 'sprite',
            headLengthRatio: this.arrowHeadLength / this.arrowLength,
            headWidthRatio: this.arrowHeadWidth / this.arrowLength,
            depthTest: true,
            depthWrite: true,
            transparent: false,
            opacity: 1,
            visible: false // Initially hidden until toggled
        });

        this.velocityArrow = velocityResult.arrow;
        this.velocityLabel = velocityResult.label;
        this.velocityDispose = velocityResult.dispose;

        // Add to appropriate parent
        const parent = this.body.orbitGroup || this.group;
        parent.add(this.velocityArrow);
        if (this.velocityLabel) {
            parent.add(this.velocityLabel);
        }

        this.directionalArrows.push(this.velocityArrow);
        this.directionalLabels.push(this.velocityLabel);
    }

    createLabel(text, position) {
        // Use ArrowUtils for consistent label creation
        const labelResult = ArrowUtils.createTextSprite({
            text,
            fontSize: LABEL_FONT_SIZE,
            fontFamily: 'Arial',
            color: LABEL_COLOR,
            position,
            pixelScale: 0.0002,
            sizeAttenuation: false,
            renderOrder: 999
        });

        this.group.add(labelResult.sprite);
        
        // Store dispose function for cleanup
        if (!this.labelDisposeFunctions) {
            this.labelDisposeFunctions = [];
        }
        this.labelDisposeFunctions.push(labelResult.dispose);

        return labelResult.sprite;
    }

    initSunDirection() {
        // Vector from planet to sun, in ecliptic/orbital frame
        const center = new THREE.Vector3(0, 0, 0);
        let sunDirection = new THREE.Vector3(1, 0, 0); // fallback
        if (this.sun && this.sun.getWorldPosition && (this.body.getMesh() || this.isBarycenter)) {
            const sunPos = new THREE.Vector3();
            const planetPos = new THREE.Vector3();
            this.sun.getWorldPosition(sunPos);
            if (this.body.getMesh()) {
            this.body.getMesh().getWorldPosition(planetPos);
            } else if (this.body.orbitGroup) {
                this.body.orbitGroup.getWorldPosition(planetPos);
            }
            sunDirection = sunPos.clone().sub(planetPos).normalize();
        }
        // Create sun direction arrow using ArrowUtils
        const sunResult = ArrowUtils.createArrowHelper({
            direction: sunDirection,
            origin: center,
            length: this.arrowLength,
            color: ARROW_COLORS.sun,
            headLength: this.arrowHeadLength,
            headWidth: this.arrowHeadWidth
        });
        this.sunDirectionArrow = sunResult.arrow;
        this.sunDirectionDispose = sunResult.dispose;
        // Parent to orbitGroup for correct ecliptic/orbital frame
        if (this.body.orbitGroup) {
            this.body.orbitGroup.add(this.sunDirectionArrow);
        } else {
            this.group.add(this.sunDirectionArrow);
        }
        this.directionalArrows.push(this.sunDirectionArrow);
        this.sunDirectionLabel = this.createLabel(
            `${this.options.name} Sun Direction`,
            center.clone().add(sunDirection.clone().multiplyScalar(this.arrowLength))
        );
        // Parent label to orbitGroup as well
        if (this.body.orbitGroup) {
            this.body.orbitGroup.add(this.sunDirectionLabel);
        } else {
            this.group.add(this.sunDirectionLabel);
        }
        this.directionalLabels.push(this.sunDirectionLabel);
    }

    updateVectors() {
        // All vectors/arrows should use (0,0,0) as their origin in local (ecliptic/orbital) space
        const center = new THREE.Vector3(0, 0, 0);
        if (this.sunDirectionArrow) {
            // Compute the real sun direction every frame
            let sunDirection = new THREE.Vector3(1, 0, 0); // fallback
            if (this.sun && this.sun.getWorldPosition && (this.body.getMesh() || this.isBarycenter)) {
                const sunPos = new THREE.Vector3();
                const planetPos = new THREE.Vector3();
                this.sun.getWorldPosition(sunPos);
                if (this.body.getMesh()) {
                this.body.getMesh().getWorldPosition(planetPos);
                } else if (this.body.orbitGroup) {
                    this.body.orbitGroup.getWorldPosition(planetPos);
                }
                sunDirection = sunPos.clone().sub(planetPos).normalize();
            }
            this.sunDirectionArrow.position.copy(center);
            ArrowUtils.updateArrowDirection(this.sunDirectionArrow, sunDirection);
            this.sunDirectionLabel.position.copy(center.clone().add(sunDirection.clone().multiplyScalar(this.arrowLength)));
        }
        // Always update the velocity arrow
        if (this.velocityArrow) {
            let velocityDir = new THREE.Vector3(1, 0, 0); // fallback
            let velocityLen = 0;
            if (this.body.velocity && this.body.velocity.length() > 0) {
                velocityDir = this.body.velocity.clone().normalize();
                velocityLen = this.body.velocity.length();
            }
            this.velocityArrow.position.copy(center);
            ArrowUtils.updateArrowDirection(this.velocityArrow, velocityDir, this.arrowLength, this.arrowHeadLength, this.arrowHeadWidth);
            this.velocityArrow.visible = velocityLen > 0;
            if (this.velocityLabel) {
                this.velocityLabel.position.copy(center.clone().add(velocityDir.clone().multiplyScalar(this.arrowLength)));
                this.velocityLabel.visible = velocityLen > 0;
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

    toggleSunDirectionArrowVisibility(visible) {
        if (this.sunDirectionArrow) this.sunDirectionArrow.visible = visible;
        if (this.sunDirectionLabel) this.sunDirectionLabel.visible = visible;
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
        const fadeStart = this.radius * 10;
        const fadeEnd = this.radius * 20;
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
        // Fade all directional arrows (velocity, sun, etc.)
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
        // Fade axes helpers and their CSS2D labels
        const fadeAxesHelper = (helper, labels) => {
            if (helper) helper.visible = opacity > 0;
            if (labels) labels.forEach(lbl => {
                if (lbl && lbl.element) {
                    lbl.element.style.opacity = opacity;
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
            
            const labelResult = ArrowUtils.createCSS2DLabel({
                text: axisLabels[context]?.[axis] || `${name} ${axis}`,
                className: 'axis-label',
                color: color[axis],
                fontSize: '14px',
                fontWeight: 'bold',
                textShadow: '0 0 2px #000, 0 0 4px #000',
                position
            });

            // Store dispose function for cleanup
            if (!this.labelDisposeFunctions) {
                this.labelDisposeFunctions = [];
            }
            this.labelDisposeFunctions.push(labelResult.dispose);

            return labelResult.label;
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
        
        // Dispose vectors using ArrowUtils dispose functions
        if (this.velocityDispose) {
            this.velocityDispose();
        }
        if (this.sunDirectionDispose) {
            this.sunDirectionDispose();
        }
        
        // Dispose any remaining directional arrows (fallback)
        this.directionalArrows.forEach(arrow => {
            if (arrow) {
                if (arrow.line) {
                    if (arrow.line.parent) arrow.line.parent.remove(arrow.line);
                    if (arrow.line.geometry) arrow.line.geometry.dispose();
                    if (arrow.line.material) arrow.line.material.dispose();
                }
                if (arrow.cone) {
                    if (arrow.cone.parent) arrow.cone.parent.remove(arrow.cone);
                    if (arrow.cone.geometry) arrow.cone.geometry.dispose();
                    if (arrow.cone.material) arrow.cone.material.dispose();
                }
            }
        });
        this.directionalArrows = [];
        
        // Dispose label functions
        if (this.labelDisposeFunctions) {
            this.labelDisposeFunctions.forEach(dispose => dispose());
            this.labelDisposeFunctions = [];
        }
        
        // Dispose any remaining directional labels (fallback)
        this.directionalLabels.forEach(label => {
            if (label) {
                if (label.parent) label.parent.remove(label);
                if (label.material) {
                    if (label.material.map) label.material.map.dispose();
                    label.material.dispose();
                }
                if (label.geometry) label.geometry.dispose();
            }
        });
        this.directionalLabels = [];
        
        // Dispose axes helpers
        const disposeAxesHelper = (helper, labels) => {
            if (helper) {
                if (helper.parent) helper.parent.remove(helper);
                if (helper.geometry) helper.geometry.dispose();
                if (helper.material) helper.material.dispose();
            }
            if (labels) {
                labels.forEach(lbl => {
                    if (lbl) {
                        if (lbl.parent) lbl.parent.remove(lbl);
                        // CSS2DObject cleanup - handled by ArrowUtils dispose functions
                        if (lbl.element && lbl.element.parentNode) {
                            lbl.element.parentNode.removeChild(lbl.element);
                        }
                    }
                });
            }
        };
        
        disposeAxesHelper(this.orbitAxesHelper, this.orbitAxesLabels);
        disposeAxesHelper(this.rotationAxesHelper, this.rotationAxesLabels);
        
        // Remove main group
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
} 