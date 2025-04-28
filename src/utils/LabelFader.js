export class LabelFader {
    constructor(sprites, fadeStart, fadeEnd) {
        this.sprites = sprites;
        this.fadeStart = fadeStart;
        this.fadeEnd = fadeEnd;
    }

    update(camera) {
        this.sprites.forEach(label => {
            // calculate distance from camera to label's position
            const dist = camera.position.distanceTo(label.position);
            let opacity = 1;
            if (dist > this.fadeStart) {
                opacity = dist >= this.fadeEnd
                    ? 0
                    : 1 - (dist - this.fadeStart) / (this.fadeEnd - this.fadeStart);
            }
            // fade THREE.Sprite materials
            if (label.material) {
                label.material.opacity = opacity;
                label.material.transparent = true;
                label.material.needsUpdate = true;
            }
            // fade CSS2DObject elements
            if (label.element && label.element.style) {
                label.element.style.opacity = opacity;
            }
        });
    }
} 