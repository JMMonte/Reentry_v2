import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { LabelFader } from '../utils/LabelFader.js';

export class RadialGrid {
    /**
     * Create a radial grid attached to a specific planet based on its configuration.
     * @param {Planet} planet - The planet instance this grid belongs to.
     * @param {object} config - The radialGridConfig object from planetConfigs.js.
     */
    constructor(planet, config) {
        this.planet = planet;
        this.config = config;
        // Attach to the planet's tilt group so grid orientation matches planet tilt
        this.parentGroup = planet.getTiltGroup();
        this.group = new THREE.Group();
        this.group.name = `${planet.name}_radialGrid`;
        this.parentGroup.add(this.group);
        this.labelsSprites = []; // Store sprite labels for fading

        if (!config) {
            console.warn(`RadialGrid: No config provided for planet ${planet.name}. Grid will not be created.`);
            return;
        }

        this.createGrid();

        // Initialize label fading
        if (this.labelsSprites.length > 0 && config.maxDisplayRadius && config.fadeFactors) {
            const planetRadiusMeters = this.planet.radius; // Get planet radius in meters
            const maxDisplayRadiusMeters = planetRadiusMeters + config.maxDisplayRadius;
            const maxRadiusScaled = maxDisplayRadiusMeters * Constants.metersToKm * Constants.scale;
            const fadeStart = maxRadiusScaled * config.fadeFactors.start;
            const fadeEnd = maxRadiusScaled * config.fadeFactors.end;
            this.labelFader = new LabelFader(this.labelsSprites, fadeStart, fadeEnd);
        } else {
            this.labelFader = null;
        }
    }

    createGrid() {
        const { circles = [], radialLines, markerStep, labelMarkerStep, maxDisplayRadius } = this.config;
        const planetRadiusMeters = this.planet.radius;

        // --- Materials ---
        const solidMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.6
        });

        const dashedMaterialBase = {
            color: 0x888888,
            transparent: true,
            opacity: 0.6,
            dashSize: 500 * Constants.scale, // Default dash size
            gapSize: 300 * Constants.scale // Default gap size
        };

        const markerMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.2
        });

        // --- Circles from Config ---
        circles.forEach(circleConfig => {
            const radiusFromCenterMeters = planetRadiusMeters + circleConfig.radius; // Add planet radius to altitude
            let material = solidMaterial;
            let isDashed = false;
            if (circleConfig.style === 'dashed') {
                const dashScale = circleConfig.dashScale || 1;
                material = new THREE.LineDashedMaterial({
                    ...dashedMaterialBase,
                    dashSize: dashedMaterialBase.dashSize * dashScale,
                    gapSize: dashedMaterialBase.gapSize * dashScale,
                });
                isDashed = true;
            }
            this.createCircle(radiusFromCenterMeters, material, isDashed);
            if (circleConfig.label) {
                this.createLabel(circleConfig.label, radiusFromCenterMeters);
            }
        });

        // --- Intermediate Markers & Labels ---
        const maxAltitudeMeters = maxDisplayRadius || (circles.length > 0 ? Math.max(...circles.map(c => c.radius)) : 0);
        const maxRadiusFromCenterMeters = planetRadiusMeters + maxAltitudeMeters;

        if (markerStep && markerStep > 0) {
            for (let alt = markerStep; alt <= maxAltitudeMeters; alt += markerStep) {
                const radiusMeters = planetRadiusMeters + alt;
                this.createCircle(radiusMeters, markerMaterial);

                // Add labels for specified steps
                if (labelMarkerStep && labelMarkerStep > 0 && alt % labelMarkerStep === 0) {
                    const labelText = `${(alt / Constants.kmToMeters).toFixed(0)}k km`;
                    this.createLabel(labelText, radiusMeters);
                }
            }
        }

        // --- Radial Lines ---
        if (radialLines && radialLines.count > 0) {
            const lineCount = radialLines.count;
            const maxScaledRadius = maxRadiusFromCenterMeters * Constants.metersToKm * Constants.scale;

            for (let i = 0; i < lineCount; i++) {
                const angle = (i / lineCount) * Math.PI * 2;
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0), // Start at center
                    new THREE.Vector3(
                        Math.cos(angle) * maxScaledRadius,
                        Math.sin(angle) * maxScaledRadius,
                        0
                    )
                ]);

                // Use the standard solid material for radial lines
                const line = new THREE.Line(geometry, solidMaterial);
                this.group.add(line);
            }
        }
    }

    createCircle(radiusMeters, material, isDashed = false) {
        // Convert from meters (center) to simulation units (scaled km)
        const scaledRadius = (radiusMeters * Constants.metersToKm * Constants.scale);
        const segments = 128;
        const circleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array((segments + 1) * 3);

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            positions[i * 3] = Math.cos(angle) * scaledRadius;
            positions[i * 3 + 1] = Math.sin(angle) * scaledRadius;
            positions[i * 3 + 2] = 0;
        }

        circleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const circle = new THREE.Line(circleGeometry, material);

        if (isDashed) {
            circle.computeLineDistances();
        }

        this.group.add(circle);
    }

    createTextSprite(text) {
        const fontSize = 16;
        const font = `${fontSize}px sans-serif`;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = font;
        const metrics = ctx.measureText(text);
        const textWidth = Math.ceil(metrics.width);
        const textHeight = fontSize;
        canvas.width = textWidth;
        canvas.height = textHeight;
        ctx.font = font;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.fillText(text, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, sizeAttenuation: false });
        const sprite = new THREE.Sprite(material);
        const pixelScale = 0.0005;
        sprite.scale.set(textWidth * pixelScale, textHeight * pixelScale, 1);
        return sprite;
    }

    createLabel(text, radiusMeters) {
        const sprite = this.createTextSprite(text);
        const scaledRadius = radiusMeters * Constants.metersToKm * Constants.scale;
        // Position label slightly outside the circle, at angle 0 (positive X)
        const offset = 1.02; // Place label slightly outside the radius
        sprite.position.set(scaledRadius * offset, 0, 0);
        this.group.add(sprite);
        this.labelsSprites.push(sprite);
    }

    /**
     * Update label fading based on camera distance.
     * @param {THREE.Camera} camera - The scene camera.
     */
    updateFading(camera) {
        if (this.labelFader) {
            this.labelFader.update(camera);
        }
    }

    setVisible(visible) {
        this.group.visible = visible;
    }

    dispose() {
        // Dispose geometries and materials
        this.group.traverse((object) => {
            if (object instanceof THREE.Line) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    // If material is an array, dispose each element
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            } else if (object instanceof THREE.Sprite) {
                if (object.material.map) object.material.map.dispose();
                if (object.material) object.material.dispose();
            }
        });

        // Remove labels sprites explicitly if needed (LabelFader might handle this)
        this.labelsSprites = [];

        // Remove the group from its parent (the planet's tilt group)
        if (this.parentGroup) {
            this.parentGroup.remove(this.group);
        }
        // Optional: Clean up LabelFader if it holds references
        // this.labelFader?.dispose(); // Assuming LabelFader has a dispose method
    }
}
