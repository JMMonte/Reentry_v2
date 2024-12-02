import * as THREE from 'three';

export function createLensflareTextures() {
    const textureSize = 64;
    const canvas = document.createElement('canvas');
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext('2d');

    // Create main flare texture (lensflare0)
    ctx.clearRect(0, 0, textureSize, textureSize);
    const gradient0 = ctx.createRadialGradient(
        textureSize/2, textureSize/2, 0,
        textureSize/2, textureSize/2, textureSize/2
    );
    gradient0.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient0.addColorStop(0.3, 'rgba(255, 255, 200, 0.7)');
    gradient0.addColorStop(1, 'rgba(255, 255, 200, 0)');
    ctx.fillStyle = gradient0;
    ctx.fillRect(0, 0, textureSize, textureSize);
    const texture0 = new THREE.CanvasTexture(canvas);

    // Create secondary flare texture (lensflare3)
    ctx.clearRect(0, 0, textureSize, textureSize);
    const gradient3 = ctx.createRadialGradient(
        textureSize/2, textureSize/2, 0,
        textureSize/2, textureSize/2, textureSize/2
    );
    gradient3.addColorStop(0, 'rgba(255, 200, 100, 1)');
    gradient3.addColorStop(0.5, 'rgba(255, 200, 100, 0.5)');
    gradient3.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = gradient3;
    ctx.fillRect(0, 0, textureSize, textureSize);
    const texture3 = new THREE.CanvasTexture(canvas);

    return {
        textureFlare0: texture0,
        textureFlare3: texture3
    };
}
