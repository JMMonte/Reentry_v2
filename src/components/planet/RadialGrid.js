import * as THREE from 'three';
import { LabelFader } from '../../utils/LabelFader.js';

export class RadialGrid {
    /**
     * Create a radial grid attached to a specific planet based on its configuration.
     * @param {Planet} planet - The planet instance this grid belongs to.
     * @param {object} config - The radialGridConfig object for rendering.
     */
    constructor(planet, config) {
        this.planet = planet;
        this.config = config;
        // this.scene = planet.scene; // Store scene reference // REMOVED
        // this.parentRef = this.scene; // Reference parent for removal in dispose // MODIFIED BELOW

        this.group = new THREE.Group();
        this.group.name = `${planet.name}_radialGrid`;
        this.worldPosition = new THREE.Vector3(); // Added for updateFading

        const planetOrbitGroup = planet.getOrbitGroup();

        if (!planetOrbitGroup) {
            console.error(`RadialGrid constructor: Planet ${planet.name} does not have a valid orbitGroup. Grid cannot be initialized.`);
            // In a real scenario, might set a flag this.isValid = false and return
            // For now, assume planetOrbitGroup is always valid based on Planet.js structure
            // If it could be null, this.group might not be added, and subsequent calls would fail.
        }

        this.parentRef = planetOrbitGroup; // Set parentRef to the orbitGroup
        if (planetOrbitGroup) {
            planetOrbitGroup.add(this.group); // Add to planet's orbit group
            this.group.position.set(0, 0, 0);    // Set local position to origin
            this.group.quaternion.identity();    // Set local rotation to identity
        } else {
            // Fallback or error: if orbit group isn's available, add to scene as before,
            // but this would likely not solve the user's original issue.
            // This path should ideally not be hit.
            console.warn(`RadialGrid: Planet ${planet.name}'s orbitGroup not found. Adding grid to scene as fallback.`);
            this.scene = planet.scene; // Fallback to original scene ref
            this.parentRef = this.scene;
            if (this.scene) this.scene.add(this.group);
        }

        // No counter-rotation needed when attached to scene
        // this.group.rotation.set(Math.PI / 2, 0, -Math.PI);

        // Add to the planet's parent group (should be rebaseGroup)
        // this.scene.add(this.group); // scene is rebaseGroup for planets // REMOVED (handled above)
        this.labelsSprites = [];

        if (!config) {
            console.warn(`RadialGrid: No config provided for planet ${planet.name}. Grid will not be created.`);
            return;
        }

        const scaledPlanetRadius = planet.radius;

        this.createGrid();

        // Determine fade start and end for label and grid fading
        let fadeStart, fadeEnd;
        if (config.fadeStart != null && config.fadeEnd != null) {
            fadeStart = config.fadeStart;
            fadeEnd = config.fadeEnd;
        } else if (typeof planet.soiRadius === 'number' && !isNaN(planet.soiRadius) && planet.soiRadius > 0) {
            fadeStart = planet.soiRadius;
            fadeEnd = planet.soiRadius * 3;
        } else if (config.maxDisplayRadius && config.fadeFactors) {
            const maxAltitude = config.maxDisplayRadius;
            const maxRadius = scaledPlanetRadius + maxAltitude;
            fadeStart = maxRadius * config.fadeFactors.start;
            fadeEnd = maxRadius * config.fadeFactors.end;
        }
        if (fadeStart != null && fadeEnd != null) {
            this.labelFader = new LabelFader(this.labelsSprites, fadeStart, fadeEnd);
        } else {
            this.labelFader = null;
        }
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

        // --- Materials ---
        const majorOpacity = 0.35;
        const minorOpacity = 0.20;
        const markerOpacity = 0.12;
        const radialOpacity = 0.15;
        const solidMajorMaterial = new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: majorOpacity });
        const solidMinorMaterial = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: minorOpacity });
        const markerMaterial = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: markerOpacity, depthWrite: false });
        const radialLineMaterial = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: radialOpacity, depthWrite: false });

        // --- Add main SOI circle (major) ---
        const soiCircle = this.createCircle(scaledPlanetRadius + soi, solidMajorMaterial.clone(), false);
        if (soiCircle) {
            soiCircle.userData.baseOpacity = majorOpacity;
            this.group.add(soiCircle);
            this.createLabel('SOI', scaledPlanetRadius + soi);
        }

        // --- Add config circles (if any) ---
        const circles = (this.config && Array.isArray(this.config.circles)) ? this.config.circles : [];
        circles.forEach(circleConfig => {
            if (typeof circleConfig.radius !== 'number' || !isFinite(circleConfig.radius)) return;
            const r = scaledPlanetRadius + circleConfig.radius;
            if (!isFinite(r) || r > scaledPlanetRadius + soi) return;
            let material = solidMinorMaterial.clone();
            let baseOpacityValue = minorOpacity;
            if (circleConfig.style?.toLowerCase() === 'major') {
                material = solidMajorMaterial.clone();
                baseOpacityValue = majorOpacity;
            }
            const circleLine = this.createCircle(r, material, false);
            if (circleLine) {
                circleLine.userData.baseOpacity = baseOpacityValue;
                this.group.add(circleLine);
                if (circleConfig.label) this.createLabel(circleConfig.label, r);
            }
        });

        // --- Add standard markers and labels ---
        for (let i = 1; i < markerCount; i++) {
            const r = scaledPlanetRadius + i * markerStep;
            if (!isFinite(r) || r > scaledPlanetRadius + soi) continue;
            const markerLine = this.createCircle(r, markerMaterial.clone(), false);
            if (markerLine) {
                markerLine.userData.baseOpacity = markerOpacity;
                this.group.add(markerLine);
                // Label at every marker
                const labelText = `${Math.round(i * markerStep)} km`;
                this.createLabel(labelText, r);
            }
        }

        // --- Add radial lines (fixed count) ---
        for (let i = 0; i < radialLineCount; i++) {
            const angle = (i / radialLineCount) * Math.PI * 2;
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(
                    Math.cos(angle) * maxRadiusScaled,
                    Math.sin(angle) * maxRadiusScaled,
                    0
                )
            ]);
            const radialLine = new THREE.Line(geometry, radialLineMaterial.clone());
            radialLine.userData.baseOpacity = radialOpacity;
            this.group.add(radialLine);
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
            this.group.getWorldPosition(this.worldPosition);
            this.labelFader.update(camera, this.worldPosition, this.group, this.planet);
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

