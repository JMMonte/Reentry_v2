import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { LabelFader } from '../utils/LabelFader.js'; // Corrected path

export class RadialGrid {
    /**
     * Create a radial grid attached to a specific planet based on its configuration.
     * @param {Planet} planet - The planet instance this grid belongs to.
     * @param {object} config - The radialGridConfig object from celestialBodiesConfig.js.
     */
    constructor(planet, config) {
        this.planet = planet;
        this.config = config;
        this.scene = planet.scene; // Store scene reference
        this.parentRef = this.scene; // Reference parent for removal in dispose

        this.group = new THREE.Group();
        this.group.name = `${planet.name}_radialGrid`;
        // No counter-rotation needed when attached to scene
        // this.group.rotation.set(Math.PI / 2, 0, -Math.PI);

        this.scene.add(this.group); // Add directly to the main scene
        this.labelsSprites = [];

        if (!config) {
            console.warn(`RadialGrid: No config provided for planet ${planet.name}. Grid will not be created.`);
            return;
        }

        const soiRadiusMultiplier = planet.config?.soiRadius;
        const scaledPlanetRadius = planet.radius;

        this.createGrid();

        // Use the SOI Radius MULTIPLIER from the planet's main config for fading
        if (this.labelsSprites.length > 0 && soiRadiusMultiplier) {
            const soiBoundaryScaled = scaledPlanetRadius * soiRadiusMultiplier; // Multiplier * Scaled Radius
            // Start fading slightly inside calculated SOI boundary
            const fadeStart = soiBoundaryScaled * 0.9;
            // End fading further out for a more gradual effect
            const fadeEnd = soiBoundaryScaled * 1.5; // Changed from 1.1 to 1.5
            this.labelFader = new LabelFader(this.labelsSprites, fadeStart, fadeEnd);

        } else if (this.labelsSprites.length > 0 && config.maxDisplayRadius && config.fadeFactors) {
            // Fallback if no soiRadius multiplier is defined in planet config
            console.warn(`RadialGrid [${planet.name}]: Planet config soiRadius multiplier not found, using radialGridConfig.maxDisplayRadius for fading.`);
            const scaledMaxAltitude = config.maxDisplayRadius * Constants.metersToKm;
            const maxRadiusScaled = scaledPlanetRadius + scaledMaxAltitude;
            const fadeStart = maxRadiusScaled * config.fadeFactors.start;
            const fadeEnd = maxRadiusScaled * config.fadeFactors.end;
            this.labelFader = new LabelFader(this.labelsSprites, fadeStart, fadeEnd);
        } else {
            this.labelFader = null;
        }
        // Initial position will be set by the first Planet.update() call
    }

    createGrid() {
        const { circles = [], radialLines, markerStep, labelMarkerStep, maxDisplayRadius } = this.config;
        const scaledPlanetRadius = this.planet.radius;
        const scaleFactor = Constants.metersToKm;

        // --- Materials (Define base opacities - Adjusted) ---
        const majorOpacity = 0.35;  // Keep major lines as they are
        const minorOpacity = 0.20;  // Was 0.15
        const markerOpacity = 0.12; // Was 0.08
        const radialOpacity = 0.15; // Was 0.1

        const solidMajorMaterial = new THREE.LineBasicMaterial({
            color: 0xaaaaaa, // Slightly brighter color for major lines
            transparent: true,
            opacity: majorOpacity
        });
        const solidMinorMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: minorOpacity
        });

        // Base for dashed lines - opacity will be set per-instance
        const dashedMaterialBase = {
            color: 0xaaaaaa,
            transparent: true,
            // opacity: TBD,
            dashSize: 500,
            gapSize: 300
        };

        const markerMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: markerOpacity
        });

        const radialLineMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: radialOpacity
        });

        // --- Scale config values ---
        const scaledCircles = circles.map(c => ({
            ...c,
            scaledRadius: scaledPlanetRadius + (c.radius * scaleFactor)
        }));
        const scaledMarkerStep = markerStep * scaleFactor;
        const scaledLabelMarkerStep = labelMarkerStep * scaleFactor;
        const scaledMaxAltitude = maxDisplayRadius * scaleFactor;
        const maxRadiusScaled = scaledPlanetRadius + scaledMaxAltitude;

        // --- Circles from Config ---
        scaledCircles.forEach(circleConfig => {
            let material;
            let isDashed = false;
            const style = circleConfig.style?.toLowerCase() || 'minor';
            let baseOpacityValue;

            if (style === 'dashed' || style === 'dashed-major') {
                const dashScale = circleConfig.dashScale || 1;
                baseOpacityValue = style === 'dashed-major' ? majorOpacity : minorOpacity;
                material = new THREE.LineDashedMaterial({
                    ...dashedMaterialBase,
                    opacity: baseOpacityValue,
                    dashSize: dashedMaterialBase.dashSize * dashScale,
                    gapSize: dashedMaterialBase.gapSize * dashScale,
                });
                isDashed = true;
            } else if (style === 'major') {
                material = solidMajorMaterial.clone();
                baseOpacityValue = majorOpacity;
            } else { // Default to solid minor
                material = solidMinorMaterial.clone();
                baseOpacityValue = minorOpacity;
            }

            const circleLine = this.createCircle(circleConfig.scaledRadius, material, isDashed);
            if (circleLine) {
                circleLine.userData.baseOpacity = baseOpacityValue; // Set explicitly here
                this.group.add(circleLine); // Add to group here
                if (circleConfig.label) {
                    this.createLabel(circleConfig.label, circleConfig.scaledRadius);
                }
            }
        });

        // --- Intermediate Markers & Labels ---
        if (scaledMarkerStep > 0) {
            for (let scaledAlt = scaledMarkerStep; scaledAlt <= scaledMaxAltitude; scaledAlt += scaledMarkerStep) {
                const scaledRadiusFromCenter = scaledPlanetRadius + scaledAlt;
                const markerLine = this.createCircle(scaledRadiusFromCenter, markerMaterial.clone(), false);
                if (markerLine) {
                    markerLine.userData.baseOpacity = markerOpacity; // Set explicitly here
                    this.group.add(markerLine); // Add to group here
                    if (scaledLabelMarkerStep > 0 && (scaledAlt % scaledLabelMarkerStep < scaledMarkerStep * 0.1)) {
                        const originalAltitudeMeters = scaledAlt / scaleFactor;
                        const labelText = `${(originalAltitudeMeters / Constants.kmToMeters).toFixed(0)}k km`;
                        this.createLabel(labelText, scaledRadiusFromCenter);
                    }
                }
            }
        }

        // --- Radial Lines ---
        if (radialLines && radialLines.count > 0) {
            const lineCount = radialLines.count;
            for (let i = 0; i < lineCount; i++) {
                const angle = (i / lineCount) * Math.PI * 2;
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(
                        Math.cos(angle) * maxRadiusScaled,
                        Math.sin(angle) * maxRadiusScaled,
                        0
                    )
                ]);
                const radialLine = new THREE.Line(geometry, radialLineMaterial.clone());
                radialLine.userData.baseOpacity = radialOpacity; // Set explicitly here
                this.group.add(radialLine); // Add to group here
            }
        }
    }

    // createCircle returns the line object, doesn't add to group or set userData
    createCircle(scaledRadius, material, isDashed = false) {
        if (isNaN(scaledRadius)) {
            console.error(`RadialGrid [${this.planet.name}] createCircle: Attempted to create circle with NaN radius! Skipping.`);
            return null; // Return null if invalid
        }

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

        // Create the line using the provided (already cloned) material
        const circle = new THREE.Line(circleGeometry, material);

        if (isDashed) {
            circle.computeLineDistances();
        }
        // DO NOT add to group here - let createGrid handle it
        return circle; // Return the created line object
    }

    createTextSprite(text) {
        const fontSize = 42;
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
        const material = new THREE.SpriteMaterial({
             map: texture,
             transparent: true,
             sizeAttenuation: false,
             // depthTest: false // Optionally try disabling depth test here too
         });
        const sprite = new THREE.Sprite(material);
        const pixelScale = 0.0002;
        sprite.scale.set(textWidth * pixelScale, textHeight * pixelScale, 1);
        return sprite;
    }

    // This function now expects an already scaled radius
    createLabel(text, scaledRadius) {
        const sprite = this.createTextSprite(text);
        const offset = 1.02;
        sprite.position.set(scaledRadius * offset, 0, 0); // Use directly
        this.group.add(sprite);
        this.labelsSprites.push(sprite);
    }

    /**
     * Update label fading based on camera distance.
     * @param {THREE.Camera} camera - The scene camera.
     */
    updateFading(camera) {
        if (this.labelFader && this.group && this.planet) {
            // Pass the grid's world position, the grid group, and the planet itself
            this.labelFader.update(camera, this.group.position, this.group, this.planet);
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

        this.labelsSprites = [];

        // Remove the group from its parent (the planet's orbit group)
        if (this.parentRef) {
            this.parentRef.remove(this.group);
        }
        // Optional: Clean up LabelFader if it holds references
        // this.labelFader?.dispose();
    }

    /** Update the grid's world position to match the planet's orbital position */
    updatePosition() {
        if (this.planet && this.group && this.planet.getOrbitGroup()) { // Check orbit group exists
            const planetWorldPosition = new THREE.Vector3();
            // Get the world position of the orbit group (center of planet in orbit)
            this.planet.getOrbitGroup().getWorldPosition(planetWorldPosition);

            // Check for NaN values BEFORE applying
            if (!isNaN(planetWorldPosition.x) && !isNaN(planetWorldPosition.y) && !isNaN(planetWorldPosition.z)) {
                this.group.position.copy(planetWorldPosition);

            } else {
                // Log an error if NaN is detected from getWorldPosition
                // Avoid flooding: log only once per grid instance
                if (!this._nanLogged) {
                    this._nanLogged = true; // Prevent further logging for this grid
                }
                // Do NOT copy the NaN position to the grid
            }
        }
    }
}

