import * as THREE from 'three'; // Re-added import

export class LabelFader {
    constructor(sprites, fadeStart, fadeEnd) {
        this.sprites = sprites;
        this.fadeStart = fadeStart;
        this.fadeEnd = fadeEnd;
        // No need for _labelWorldPos if we use center distance
    }

    update(camera, centerPosition, gridGroup, planet) { // Added planet parameter
        if (!centerPosition || !gridGroup || !planet) return; // Add planet check

        const distToCenter = camera.position.distanceTo(centerPosition);
        let opacity = 1;

        if (distToCenter > this.fadeStart) {
            opacity = distToCenter >= this.fadeEnd
                ? 0
                : 1 - (distToCenter - this.fadeStart) / (this.fadeEnd - this.fadeStart);
            opacity = Math.max(0, Math.min(1, opacity));
        }
        this._opacityLogCounter = (this._opacityLogCounter || 0) + 1;

        // Apply the calculated opacity to all labels (Sprites)
        this.sprites.forEach(label => {
            if (label.material) { // Handle THREE.Sprite
                label.material.opacity = opacity;
                label.material.transparent = opacity < 1;
                label.material.needsUpdate = true;
                label.material.depthWrite = opacity === 1; // Only write depth when fully opaque
            }
            if (label.element && label.element.style) { // Handle CSS2DObject
                // CSS doesn't directly interact with depth buffer in the same way
                label.element.style.transition = 'opacity 0.1s ease-out';
                label.element.style.opacity = opacity;
                label.element.style.display = opacity === 0 ? 'none' : '';
            }
        });

        // Apply the calculated opacity to all grid lines (THREE.Line)
        gridGroup.traverse((object) => {
            if (object instanceof THREE.Line) {
                const baseOpacity = object.userData.baseOpacity ?? 1;
                if (object.material) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach(material => {
                        if (material.isLineBasicMaterial || material.isLineDashedMaterial) {
                            const finalOpacity = baseOpacity * opacity;
                            material.opacity = finalOpacity;
                            material.transparent = finalOpacity < 1;
                            material.depthWrite = finalOpacity === baseOpacity && opacity === 1; // Write depth only if fully opaque
                            material.needsUpdate = true;
                        }
                    });
                }
            }
        });

        // Apply the calculated opacity to the planet's SOI mesh (if it exists)
        if (planet.soiMesh && planet.soiMesh.material) {
            const soiMaterial = planet.soiMesh.material;
            soiMaterial.opacity = opacity;
            soiMaterial.transparent = opacity < 1;
            soiMaterial.depthWrite = opacity === 1; // Only write depth when fully opaque
            soiMaterial.needsUpdate = true;
        }
    }
} 