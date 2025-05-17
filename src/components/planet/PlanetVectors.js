import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../../assets/fonts/helvetiker_regular.typeface.json';
import { celestialBodiesConfig } from '../../config/celestialBodiesConfig.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

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
        this.radius = isBarycenter ? celestialBodiesConfig.mercury.radius : body.radius || 1;
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
                const poll = setInterval(() => {
                    if (this.body.getMesh()) {
                        clearInterval(poll);
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
        // Always create the velocity arrow (initially hidden if velocity is zero)
        this.velocityArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0), // default direction
            new THREE.Vector3(0, 0, 0),
            this.arrowLength,
            ARROW_COLORS.velocity
        );
        this.velocityArrow.setLength(
            this.arrowLength,
            this.arrowHeadLength,
            this.arrowHeadWidth
        );
        this.velocityArrow.line.material.depthTest = true;
        this.velocityArrow.line.material.depthWrite = true;
        this.velocityArrow.line.material.transparent = false;
        this.velocityArrow.line.material.opacity = 1;
        this.velocityArrow.cone.material.depthTest = true;
        this.velocityArrow.cone.material.depthWrite = true;
        this.velocityArrow.cone.material.transparent = false;
        this.velocityArrow.cone.material.opacity = 1;
        if (this.body.orbitGroup) {
            this.body.orbitGroup.add(this.velocityArrow);
        } else {
            this.group.add(this.velocityArrow);
        }
        this.directionalArrows.push(this.velocityArrow);
        // Create the velocity label
        this.velocityLabel = this.createLabel(
            `${this.options.name} Velocity`,
            new THREE.Vector3(this.arrowLength, 0, 0)
        );
        if (this.body.orbitGroup) {
            this.body.orbitGroup.add(this.velocityLabel);
        } else {
            this.group.add(this.velocityLabel);
        }
        this.directionalLabels.push(this.velocityLabel);
    }

    createLabel(text, position) {
        const fontSize = LABEL_FONT_SIZE;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        context.font = `${fontSize}px Arial`;
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;

        canvas.width = textWidth;
        canvas.height = textHeight;

        context.font = `${fontSize}px Arial`;
        context.fillStyle = LABEL_COLOR;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false });
        const sprite = new THREE.Sprite(spriteMaterial);
        const pixelScale = 0.0002; // fraction of pixel dimensions for on-screen size
        sprite.scale.set(textWidth * pixelScale, textHeight * pixelScale, 1);
        sprite.position.copy(position);
        sprite.renderOrder = 999;

        this.group.add(sprite);
        return sprite;
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
        this.sunDirectionArrow = new THREE.ArrowHelper(
            sunDirection,
            center,
            this.arrowLength,
            ARROW_COLORS.sun
        );
        this.sunDirectionArrow.setLength(
            this.arrowLength,
            this.arrowHeadLength,
            this.arrowHeadWidth
        );
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
            this.sunDirectionArrow.setDirection(sunDirection);
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
            this.velocityArrow.setDirection(velocityDir);
            // Always use fixed length (2x planet radius)
            const len = this.arrowLength;
            this.velocityArrow.setLength(len, this.arrowHeadLength, this.arrowHeadWidth);
            this.velocityArrow.visible = velocityLen > 0;
            if (this.velocityLabel) {
                this.velocityLabel.position.copy(center.clone().add(velocityDir.clone().multiplyScalar(len)));
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
            const div = document.createElement('div');
            div.className = 'axis-label';
            div.textContent = axisLabels[context]?.[axis] || `${name} ${axis}`;
            div.style.color = color[axis];
            div.style.fontSize = '14px';
            div.style.fontWeight = 'bold';
            div.style.textShadow = '0 0 2px #000, 0 0 4px #000';
            const lbl = new CSS2DObject(div);
            lbl.position.set(
                axis === 'X' ? size : 0,
                axis === 'Y' ? size : 0,
                axis === 'Z' ? size : 0
            );
            return lbl;
        });
    }

    setPlanetVectorsVisible(visible) {
        this.setVisible(visible);
        this.setAxesVisible(visible);
    }
} 