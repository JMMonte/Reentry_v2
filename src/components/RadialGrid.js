import * as THREE from 'three';
import { Constants } from '../utils/Constants';
import { OrbitalRegimes } from '../config/OrbitalRegimes.js';
import { LabelFader } from '../utils/LabelFader.js';

export class RadialGrid {
    /**
     * Create a radial grid attached to an optional parentGroup (e.g., Earth Tilt Group). 
     * @param {THREE.Scene} scene - The Three.js scene.
     * @param {THREE.Object3D} [parentGroup] - Optional parent group to attach the grid to.
     */
    constructor(scene, parentGroup) {
        this.scene = scene;
        // Attach to provided parentGroup or fall back to scene
        this.parentGroup = parentGroup || scene;
        this.group = new THREE.Group();
        this.group.name = 'radialGrid';
        this.parentGroup.add(this.group);
        this.labels = [];  // Store labels so we don't recreate them
        this.labelsSprites = []; // Store sprite labels for fading
        
        this.createGrid();
        this.createLabels();
        // Initialize label fading based on each label's distance
        const maxRadius = (Constants.earthRadius + Constants.earthHillSphere) * Constants.metersToKm * Constants.scale;
        const fadeStart = maxRadius * 0.05;
        const fadeEnd = maxRadius * 0.2;
        this.labelFader = new LabelFader(this.labelsSprites, fadeStart, fadeEnd);
    }

    createGrid() {
        // Clear existing grid and labels
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if (child.material) {
                child.material.dispose();
            }
            if (child.geometry) {
                child.geometry.dispose();
            }
        }
        this.labels.forEach(label => {
            if (label.element && label.element.parentNode) {
                label.element.parentNode.removeChild(label.element);
            }
        });
        this.labels = [];

        // Create circles for each orbital regime
        const material = new THREE.LineBasicMaterial({ 
            color: 0x888888,  // Lighter gray
            transparent: true,
            opacity: 0.6      // Increased opacity
        });

        // Add Earth radius reference circle
        this.createCircle(Constants.earthRadius, material);

        // LEO circles (add Earth radius since orbits are from surface)
        this.createCircle(Constants.earthRadius + OrbitalRegimes.LEO.min, material);
        this.createCircle(Constants.earthRadius + OrbitalRegimes.LEO.max, material);

        // MEO circles
        this.createCircle(Constants.earthRadius + OrbitalRegimes.MEO.min, material);
        this.createCircle(Constants.earthRadius + OrbitalRegimes.MEO.max, material);

        // GEO circle
        this.createCircle(Constants.earthRadius + OrbitalRegimes.GEO.altitude, material);

        // HEO indicators (we'll use dashed lines for this)
        const heoMaterial = new THREE.LineDashedMaterial({
            color: 0x888888,  // Lighter gray
            dashSize: 500 * Constants.scale,
            gapSize: 300 * Constants.scale,
            transparent: true,
            opacity: 0.6      // Increased opacity
        });

        this.createCircle(Constants.earthRadius + OrbitalRegimes.HEO.perigee, heoMaterial, true);
        this.createCircle(Constants.earthRadius + OrbitalRegimes.HEO.apogee, heoMaterial, true);

        // Intermediate radial markers
        const markerMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.2  // More transparent
        });

        // Create markers every 50,000 km up to lunar orbit
        const markerStep = 50000 * Constants.kmToMeters;  // 50,000 km in meters
        for (let r = Constants.earthRadius + markerStep; r <= Constants.earthRadius + Constants.moonOrbitRadius; r += markerStep) {
            this.createCircle(r, markerMaterial);
            // Add label for round numbers
            if (((r - Constants.earthRadius) / Constants.kmToMeters) % 100000 === 0) {
                this.createLabel(`${((r - Constants.earthRadius) / Constants.kmToMeters).toFixed(0)}k km`, r);
            }
        }

        // Lunar orbit (average distance)
        const lunarMaterial = new THREE.LineDashedMaterial({
            color: 0x888888,
            dashSize: 1000 * Constants.scale,
            gapSize: 500 * Constants.scale,
            transparent: true,
            opacity: 0.4
        });
        this.createCircle(Constants.earthRadius + Constants.moonOrbitRadius, lunarMaterial, true);

        // SOI and Hill sphere
        const sphereMaterial = new THREE.LineDashedMaterial({
            color: 0x888888,
            dashSize: 2000 * Constants.scale,
            gapSize: 1000 * Constants.scale,
            transparent: true,
            opacity: 0.3
        });
        this.createCircle(Constants.earthRadius + Constants.earthSOI, sphereMaterial, true);
        this.createCircle(Constants.earthRadius + Constants.earthHillSphere, sphereMaterial, true);

        // Create radial lines with increased opacity
        const radialCount = 12; // One line every 30 degrees
        for (let i = 0; i < radialCount; i++) {
            const angle = (i / radialCount) * Math.PI * 2;
            const maxRadius = (Constants.earthRadius + Constants.earthHillSphere) * Constants.metersToKm * Constants.scale;
            
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(
                    Math.cos(angle) * maxRadius,
                    Math.sin(angle) * maxRadius,
                    0
                )
            ]);
            
            const line = new THREE.Line(geometry, material);
            this.group.add(line);
        }
    }

    createCircle(radius, material, isDashed = false) {
        // Convert from meters to simulation units (scaled km)
        const scaledRadius = (radius * Constants.metersToKm * Constants.scale);
        const segments = 128; // Increased segment count for smoother circles
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

    createLabels() {
        // Create labels for each orbital regime
        this.createLabel('LEO', Constants.earthRadius + OrbitalRegimes.LEO.min);
        this.createLabel('MEO', Constants.earthRadius + OrbitalRegimes.MEO.min);
        this.createLabel('GEO', Constants.earthRadius + OrbitalRegimes.GEO.altitude);
        this.createLabel('HEO', Constants.earthRadius + OrbitalRegimes.HEO.perigee);
        this.createLabel('Lunar Orbit', Constants.earthRadius + Constants.moonOrbitRadius);
        this.createLabel('SOI', Constants.earthRadius + Constants.earthSOI);
        this.createLabel('Hill Sphere', Constants.earthRadius + Constants.earthHillSphere);
    }

    // Create a simple text sprite with white text
    createTextSprite(text) {
        // Set up canvas for text
        const fontSize = 16; // use smaller font for simpler rendering
        const font = `${fontSize}px sans-serif`;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = font;
        // Measure and size canvas
        const metrics = ctx.measureText(text);
        const textWidth = Math.ceil(metrics.width);
        const textHeight = fontSize;
        canvas.width = textWidth;
        canvas.height = textHeight;
        // Render text
        ctx.font = font;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.fillText(text, 0, 0);
        // Create texture and sprite
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, sizeAttenuation: false });
        const sprite = new THREE.Sprite(material);
        // Keep sprite at constant screen size, using pixelScale to reduce size
        const pixelScale = 0.0005; // fraction of pixel dimensions for on-screen size
        sprite.scale.set(textWidth * pixelScale, textHeight * pixelScale, 1);
        return sprite;
    }

    // Replace createLabel to use sprite-based text
    createLabel(text, radius) {
        const sprite = this.createTextSprite(text);
        const scaledRadius = radius * Constants.metersToKm * Constants.scale;
        sprite.position.set(scaledRadius, 0, 0); // X, Y, Z
        sprite.position.set(Math.cos(0) * scaledRadius, Math.sin(0) * scaledRadius, 0); // Place on XY plane at angle 0
        this.group.add(sprite);
        this.labelsSprites.push(sprite);
    }

    /**
     * Fade labels based on camera distance: fully visible until fadeStart,
     * then fade out to zero at fadeEnd.
     */
    updateFading(camera) {
        // delegate to centralized LabelFader
        this.labelFader.update(camera);
    }

    setVisible(visible) {
        this.group.visible = visible;
    }

    dispose() {
        this.group.traverse((object) => {
            if (object instanceof THREE.Line) {
                object.geometry.dispose();
                object.material.dispose();
            }
        });
        // Remove group from its parent
        this.parentGroup.remove(this.group);
    }
}
