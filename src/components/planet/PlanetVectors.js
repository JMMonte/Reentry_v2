import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../../assets/fonts/helvetiker_regular.typeface.json';
import { LabelFader } from '../../utils/LabelFader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { celestialBodiesConfig } from '../../config/celestialBodiesConfig.js';

const ARROW_COLORS = {
    northPole: 0x00bfff,
    sun: 0xffff00,
    greenwich: 0x00ff00,
    equinox: 0xff0000,
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
                                         // Its children's visibility will be toggled.
        scene.add(this.group);
        this.isBarycenter = isBarycenter;
        const { name = 'Planet', showGreenwich = true } = options;
        this.options = { name, showGreenwich };

        this.directionalArrows = [];
        this.directionalLabels = [];
        this.axesHelper = null; // Initialize axesHelper
        this.axisLabels = []; // Initialize axisLabels

        if (isBarycenter) {
            // Only create axes helper for barycenters initially, controlled by setAxesVisible
            this.setAxesVisible(false); // Start with axes hidden for barycenters too
            return;
        }
        // Attempt to parse the imported font JSON
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
        this.initNorthPoleVector();
        this.initSunDirection();
        this.initGreenwichVector();
        this.initVernalEquinoxVector();
        
        // Consolidate all directional labels for the LabelFader
        const allLabelsForFader = [...this.directionalLabels]; 
        // Note: AxesHelper CSS2D labels are not part of this LabelFader instance.

        const fadeStart = this.radius * 5;
        const fadeEnd = this.radius * 10;
        this.labelFader = new LabelFader(allLabelsForFader, fadeStart, fadeEnd);

        // Initially, directional vectors are hidden until toggled on.
        this.setVisible(false);
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

    initNorthPoleVector() {
        // Place at planet mesh position, direction is planet's local Y axis in world space
        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        const worldQuat = new THREE.Quaternion();
        this.body.rotationGroup.getWorldQuaternion(worldQuat);
        const northPoleDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat).normalize();
        this.northPoleVector = new THREE.ArrowHelper(
            northPoleDirection,
            center,
            this.arrowLength,
            ARROW_COLORS.northPole
        );
        this.northPoleVector.setLength(
            this.arrowLength,
            this.arrowHeadLength,
            this.arrowHeadWidth
        );
        this.group.add(this.northPoleVector);
        this.directionalArrows.push(this.northPoleVector); // Add to managed array

        this.northPoleLabel = this.createLabel(
            `${this.options.name} Rotation Axis (Y)`,
            center.clone().add(northPoleDirection.clone().multiplyScalar(this.arrowLength))
        );
        this.directionalLabels.push(this.northPoleLabel); // Add to managed array
    }

    initSunDirection() {
        // compute sun direction from sun object in scene
        const sunPos = new THREE.Vector3();
        const center = new THREE.Vector3();
        if (this.sun && this.sun.getWorldPosition) {
            this.sun.getWorldPosition(sunPos);
        } else {
            sunPos.set(0, 0, 0); // fallback
        }
        this.body.getMesh().getWorldPosition(center);
        const sunDirection = sunPos.clone().sub(center).normalize();
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
        this.group.add(this.sunDirectionArrow);
        this.directionalArrows.push(this.sunDirectionArrow); // Add to managed array

        // label at world-space tip location
        this.sunDirectionLabel = this.createLabel(
            `${this.options.name} Sun Direction`,
            center.clone().add(sunDirection.clone().multiplyScalar(this.arrowLength))
        );
        this.directionalLabels.push(this.sunDirectionLabel); // Add to managed array
    }

    initGreenwichVector() {
        // Prime meridian: local X axis in world space
        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        const worldQuat = new THREE.Quaternion();
        this.body.rotationGroup.getWorldQuaternion(worldQuat);
        const primeMeridianDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat).normalize();
        this.greenwichVector = new THREE.ArrowHelper(
            primeMeridianDirection,
            center,
            this.arrowLength,
            ARROW_COLORS.greenwich
        );
        this.greenwichVector.setLength(
            this.arrowLength,
            this.arrowHeadLength,
            this.arrowHeadWidth
        );
        this.group.add(this.greenwichVector);
        this.directionalArrows.push(this.greenwichVector); // Add to managed array

        this.greenwichLabel = this.createLabel(
            `${this.options.name} Prime Meridian (X)`,
            center.clone().add(primeMeridianDirection.clone().multiplyScalar(this.arrowLength))
        );
        this.directionalLabels.push(this.greenwichLabel); // Add to managed array
    }

    initVernalEquinoxVector() {
        // The vernal equinox direction is the world +X direction (not rotated by planet)
        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        const vernalEquinoxDir = new THREE.Vector3(1, 0, 0).normalize();
        this.vernalEquinoxVector = new THREE.ArrowHelper(
            vernalEquinoxDir,
            center,
            this.arrowLength,
            ARROW_COLORS.equinox
        );
        this.vernalEquinoxVector.setLength(
            this.arrowLength,
            this.arrowHeadLength,
            this.arrowHeadWidth
        );
        this.group.add(this.vernalEquinoxVector);
        this.directionalArrows.push(this.vernalEquinoxVector); // Add to managed array

        this.vernalEquinoxLabel = this.createLabel(
            `${this.options.name} Vernal Equinox (World +X)`,
            center.clone().add(vernalEquinoxDir.clone().multiplyScalar(this.arrowLength))
        );
        this.directionalLabels.push(this.vernalEquinoxLabel); // Add to managed array
    }

    updateVectors() {
        // update axis and prime meridian based on world transforms
        const center = new THREE.Vector3();
        if (!this.body || !this.body.getMesh || !this.body.getMesh() || !this.body.getOrbitGroup) { // Added check for getOrbitGroup
            console.warn(`PlanetVectors (ID: ${this.instanceId}, Name: ${this.options.name || 'Unknown'}): body, getMesh(), or getOrbitGroup() is invalid. Skipping update.`);
            return;
        }
        this.body.getMesh().getWorldPosition(center);

        // --- BEGIN DIAGNOSTIC LOGGING ---
        // Conditional logging to avoid flooding, remove or adjust as needed
        if (this.options.name) { // Log for all bodies with names
            let parentName = 'N/A';
            const parentCenter = new THREE.Vector3();
            let parentWorldPositionStr = 'N/A';
            const planetOrbitGroup = this.body.getOrbitGroup();
            const parentObject = planetOrbitGroup ? planetOrbitGroup.parent : null;

            if (parentObject) {
                parentName = parentObject.name || 'Unnamed Parent';
                parentObject.getWorldPosition(parentCenter);
                parentWorldPositionStr = `x=${parentCenter.x.toFixed(2)}, y=${parentCenter.y.toFixed(2)}, z=${parentCenter.z.toFixed(2)}`;
            }
            
            const planetLocalPosition = planetOrbitGroup ? planetOrbitGroup.position : new THREE.Vector3();
            const planetLocalPositionStr = `x=${planetLocalPosition.x.toFixed(2)}, y=${planetLocalPosition.y.toFixed(2)}, z=${planetLocalPosition.z.toFixed(2)}`;

            console.log(
                `PV_Update - ID: ${this.instanceId}, Planet: ${this.options.name}, ` +
                `PlanetWorldCenter: [${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}], ` +
                `Parent: ${parentName}, ParentWorldCenter: [${parentWorldPositionStr}], ` +
                `PlanetLocalPos: [${planetLocalPositionStr}], ` +
                `GroupVisible: ${this.group.visible}`
            );
        }
        // --- END DIAGNOSTIC LOGGING ---

        if (this.northPoleVector) {
            // recalc orientation along spin axis (planet's local Y axis)
            const worldQuat = new THREE.Quaternion();
            this.body.rotationGroup.getWorldQuaternion(worldQuat);
            const northPoleDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat).normalize();
            this.northPoleVector.position.copy(center);
            this.northPoleVector.setDirection(northPoleDirection);
            this.northPoleLabel.position.copy(center.clone().add(northPoleDirection.clone().multiplyScalar(this.arrowLength)));
        }
        if (this.sunDirectionArrow) {
            const sunPos = new THREE.Vector3();
            if (this.sun && this.sun.getWorldPosition) {
                this.sun.getWorldPosition(sunPos);
            } else {
                sunPos.set(0, 0, 0);
            }
            const sunDirection = sunPos.clone().sub(center).normalize();
            this.sunDirectionArrow.position.copy(center);
            this.sunDirectionArrow.setDirection(sunDirection);
            this.sunDirectionLabel.position.copy(center.clone().add(sunDirection.clone().multiplyScalar(this.arrowLength)));
        }
        if (this.greenwichVector) {
            const worldQuat = new THREE.Quaternion();
            this.body.rotationGroup.getWorldQuaternion(worldQuat);
            const primeMeridianDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat).normalize();
            this.greenwichVector.position.copy(center);
            this.greenwichVector.setDirection(primeMeridianDirection);
            this.greenwichLabel.position.copy(center.clone().add(primeMeridianDirection.clone().multiplyScalar(this.arrowLength)));
        }
        if (this.vernalEquinoxVector) {
            const vernalEquinoxDir = new THREE.Vector3(1, 0, 0).normalize();
            this.vernalEquinoxVector.position.copy(center);
            this.vernalEquinoxVector.setDirection(vernalEquinoxDir);
            this.vernalEquinoxLabel.position.copy(center.clone().add(vernalEquinoxDir.clone().multiplyScalar(this.arrowLength)));
        }
        if (this.axesHelper) {
            this.axesHelper.position.copy(center);
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

    toggleNorthPoleVectorVisibility(visible) {
        if (this.northPoleVector) this.northPoleVector.visible = visible;
        if (this.northPoleLabel) this.northPoleLabel.visible = visible;
    }

    toggleSunDirectionArrowVisibility(visible) {
        if (this.sunDirectionArrow) this.sunDirectionArrow.visible = visible;
        if (this.sunDirectionLabel) this.sunDirectionLabel.visible = visible;
    }

    toggleGreenwichVectorVisibility(visible) {
        if (this.greenwichVector) this.greenwichVector.visible = visible;
        if (this.greenwichLabel) this.greenwichLabel.visible = visible;
    }

    toggleVernalEquinoxVectorVisibility(visible) {
        if (this.vernalEquinoxVector) this.vernalEquinoxVector.visible = visible;
        if (this.vernalEquinoxLabel) this.vernalEquinoxLabel.visible = visible;
    }

    // Fade labels based on camera distance: fully visible until fadeStart, then fade out to zero at fadeEnd
    updateFading(camera) {
        if (!this.labelFader || !this.labelFader.sprites?.length || !this.body?.getMesh) return;

        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        const distToCenter = camera.position.distanceTo(center);

        const { fadeStart, fadeEnd } = this.labelFader;
        let opacity = 1;

        if (distToCenter > fadeStart) {
            opacity = distToCenter >= fadeEnd
                ? 0
                : 1 - (distToCenter - fadeStart) / (fadeEnd - fadeStart);
            opacity = Math.max(0, Math.min(1, opacity));
        }

        // Apply the calculated opacity to all directional labels (Sprites)
        // Check individual label visibility before applying opacity from fader.
        this.directionalLabels.forEach(label => {
            if (label && label.material) {
                if (label.visible) { // Only apply fading if the label is supposed to be visible by its toggle
                    label.material.opacity = opacity;
                    label.material.transparent = opacity < 1;
                    label.material.needsUpdate = true;
                    label.material.depthWrite = opacity === 1; // Only write depth when fully opaque
                } else {
                    // Ensure labels explicitly hidden by setVisible(false) are fully transparent
                    label.material.opacity = 0;
                    label.material.transparent = true;
                    label.material.needsUpdate = true;
                    label.material.depthWrite = false;
                }
            }
        });
    }

    setAxesVisible(visible) {
        if (visible) {
            // Always update axis size to match current planet radius
            const size = this.radius * 2;
            if (!this.axesHelper || this.axesHelper.size !== size) {
                if (this.axesHelper && this.axesHelper.parent) {
                    this.group.remove(this.axesHelper);
                }
                this.axesHelper = new THREE.AxesHelper(size);
                this.axesHelper.size = size;
                this.axesHelper.name = `${this.options.name}_AxesHelper`;
                // Add labeled axis
                const color = { X: '#ff0000', Y: '#00ff00', Z: '#0000ff' };
                this.axisLabels = [];
                const mkLabel = axis => {
                    const div = document.createElement('div');
                    div.className = 'axis-label';
                    div.textContent = axis;
                    div.style.color = color[axis];
                    div.style.fontSize = '14px';
                    return new CSS2DObject(div);
                };
                ['X', 'Y', 'Z'].forEach(axis => {
                    const lbl = mkLabel(axis);
                    lbl.position.set(axis === 'X' ? size : 0,
                        axis === 'Y' ? size : 0,
                        axis === 'Z' ? size : 0);
                    this.axesHelper.add(lbl);
                    this.axisLabels.push(lbl);
                });
            }
            // Always update axis position to match planet center
            let center = new THREE.Vector3();
            this.body.getMesh().getWorldPosition(center);
            this.axesHelper.position.copy(center);
            if (!this.axesHelper.parent) {
                this.group.add(this.axesHelper);
            }
            this.axesHelper.visible = true;
            if (this.axisLabels) {
                this.axisLabels.forEach(lbl => lbl.visible = true);
            }
        } else {
            if (this.axesHelper) {
                 this.axesHelper.visible = false; // Ensure it's hidden
                 if (this.axisLabels) {
                    this.axisLabels.forEach(lbl => lbl.visible = false);
                }
                // Optionally remove from group if it won't be toggled frequently,
                // but keeping it and toggling visibility is generally fine.
                // if (this.axesHelper.parent) this.group.remove(this.axesHelper);
            }
        }
    }
} 