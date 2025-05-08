import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../assets/fonts/helvetiker_regular.typeface.json';
import { LabelFader } from './LabelFader.js';

export class PlanetVectors {
    constructor(body, scene, timeUtils, options = {}) {
        this.body = body;
        this.scene = scene;
        this.timeUtils = timeUtils;
        this.scale = this.body.radius * 2;
        this.fontLoader = new FontLoader();
        this.font = null;

        // Setup label prefix and Greenwich toggle
        const { name = 'Planet', showGreenwich = true } = options;
        this.options = { name, showGreenwich };

        // Attempt to parse the imported font JSON
        try {
            this.font = this.fontLoader.parse(helveticaRegular);
            this.initVectors();
            // initialize label fader for vector labels
            const fadeStart = this.scale * 2;
            const fadeEnd = this.scale * 5;
            const labels = [this.northPoleLabel, this.sunDirectionLabel];
            if (this.options.showGreenwich) labels.push(this.greenwichLabel);
            this.labelFader = new LabelFader(labels, fadeStart, fadeEnd);
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
        if (this.options.showGreenwich) {
            this.initGreenwichVector();
        }
    }

    createLabel(text, position) {
        const fontSize = 64;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        context.font = `${fontSize}px Arial`;
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;

        canvas.width = textWidth;
        canvas.height = textHeight;

        context.font = `${fontSize}px Arial`;
        context.fillStyle = 'white';
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

        this.scene.add(sprite);
        return sprite;
    }

    initNorthPoleVector() {
        // compute north pole orientation from spin axis (rotationGroup Y axis)
        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        const worldQuat = new THREE.Quaternion();
        this.body.rotationGroup.getWorldQuaternion(worldQuat);
        const northPoleDirection = new THREE.Vector3(0, 1, 0)
            .applyQuaternion(worldQuat)
            .normalize();
        this.northPoleVector = new THREE.ArrowHelper(northPoleDirection, center, this.scale, 0x0000ff);
        this.northPoleVector.setLength(this.scale, this.scale * 0.1, this.scale * 0.05);
        this.scene.add(this.northPoleVector);
        this.northPoleLabel = this.createLabel(
            `${this.options.name} Rotation Axis Pole`,
            center.clone().add(northPoleDirection.clone().multiplyScalar(0.05))
        );
    }

    initSunDirection() {
        // compute sun direction via timeUtils
        const sunDirection = this.timeUtils.getSunPosition().normalize();
        // use world-space center for arrow origin
        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        this.sunDirectionArrow = new THREE.ArrowHelper(
            sunDirection,
            center,
            this.scale,
            0xffff00
        );
        this.sunDirectionArrow.setLength(
            this.scale * 1,
            this.scale * 0.02,
            this.scale * 0.005
        );
        this.scene.add(this.sunDirectionArrow);
        // label at world-space tip location
        this.sunDirectionLabel = this.createLabel(
            `${this.options.name} Sun Direction`,
            center.clone().add(sunDirection.clone().multiplyScalar(this.scale))
        );
    }

    initGreenwichVector() {
        // compute prime meridian direction in world space
        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        const worldQuat = new THREE.Quaternion();
        this.body.rotationGroup.getWorldQuaternion(worldQuat);
        const primeMeridianDirection = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(worldQuat)
            .normalize();
        this.greenwichVector = new THREE.ArrowHelper(primeMeridianDirection, center, this.scale, 0x00ff00);
        this.greenwichVector.setLength(this.scale, this.scale * 0.1, this.scale * 0.05);
        this.scene.add(this.greenwichVector);
        this.greenwichLabel = this.createLabel(
            `${this.options.name} Equator Zero Meridian`,
            center.clone().add(primeMeridianDirection.clone().multiplyScalar(this.scale))
        );
    }

    updateVectors() {
        // update axis and prime meridian based on world transforms
        const center = new THREE.Vector3();
        this.body.getMesh().getWorldPosition(center);
        if (this.northPoleVector) {
            // recalc orientation along spin axis
            const worldQuat = new THREE.Quaternion();
            this.body.rotationGroup.getWorldQuaternion(worldQuat);
            const northPoleDirection = new THREE.Vector3(0, 1, 0)
                .applyQuaternion(worldQuat)
                .normalize();
            this.northPoleVector.position.copy(center);
            this.northPoleVector.setDirection(northPoleDirection);
            this.northPoleLabel.position.copy(center.clone().add(northPoleDirection.clone().multiplyScalar(this.scale)));
        }
        if (this.sunDirectionArrow) {
            const sunDirection = this.timeUtils.getSunPosition().normalize();
            // update arrow origin and direction
            this.sunDirectionArrow.position.copy(center);
            this.sunDirectionArrow.setDirection(sunDirection);
            // update label to world-space tip location
            this.sunDirectionLabel.position.copy(
                center.clone().add(sunDirection.clone().multiplyScalar(this.scale))
            );
        }
        if (this.greenwichVector) {
            const worldQuat = new THREE.Quaternion();
            this.body.rotationGroup.getWorldQuaternion(worldQuat);
            const primeMeridianDirection = new THREE.Vector3(1, 0, 0)
                .applyQuaternion(worldQuat)
                .normalize();
            this.greenwichVector.position.copy(center);
            this.greenwichVector.setDirection(primeMeridianDirection);
            this.greenwichLabel.position.copy(center.clone().add(primeMeridianDirection.clone().multiplyScalar(this.scale)));
        }
    }

    setVisible(visible) {
        if (this.northPoleVector) this.northPoleVector.visible = visible;
        if (this.northPoleLabel) this.northPoleLabel.visible = visible;
        if (this.sunDirectionArrow) this.sunDirectionArrow.visible = visible;
        if (this.sunDirectionLabel) this.sunDirectionLabel.visible = visible;
        if (this.greenwichVector) this.greenwichVector.visible = visible;
        if (this.greenwichLabel) this.greenwichLabel.visible = visible;
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

        // Apply the calculated opacity to all labels (Sprites)
        this.labelFader.sprites.forEach(label => {
            if (label && label.material) {
                label.material.opacity = opacity;
                label.material.transparent = opacity < 1;
                label.material.needsUpdate = true;
                label.material.depthWrite = opacity === 1; // Only write depth when fully opaque
            }
        });
    }
} 