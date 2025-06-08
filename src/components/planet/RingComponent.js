import * as THREE from 'three';
import { RENDER_ORDER } from './PlanetConstants.js';
// import { Constants } from '../../utils/Constants.js'; // No longer needed

export class RingComponent {
    constructor(planet, ringConfig) {
        this.planet = planet;
        const {
            innerRadius,
            outerRadius,
            textureKey,
            alphaTextureKey, // Optional: if rings need separate alpha texture
            resolution = 128
        } = ringConfig;

        const ringPattern = planet.textureManager.getTexture(textureKey);
        if (!ringPattern) {
            console.warn(`Ring pattern texture '${textureKey}' not found for planet ${planet.name}.`);
        }

        // Determine alpha map:
        let alphaMapTexture = null; // Default to null (original behavior for alphaMap)
        if (alphaTextureKey) {
            const specificAlphaTexture = planet.textureManager.getTexture(alphaTextureKey);
            if (specificAlphaTexture) {
                alphaMapTexture = specificAlphaTexture;
            } else {
                // If key provided but texture not found, still use null and warn.
                console.warn(`Ring alpha texture '${alphaTextureKey}' not found for planet ${planet.name}. No alpha map will be used.`);
            }
        }

        // Build geometry
        const geometry = new THREE.RingGeometry(
            innerRadius,
            outerRadius,
            resolution,
            1,
            0,
            Math.PI * 2
        );
        // Update UVs
        const pos = geometry.attributes.position;
        const uvs = geometry.attributes.uv;
        const ringSpan = outerRadius - innerRadius;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const radius = Math.sqrt(x * x + y * y);
            const angle = Math.atan2(y, x);
            uvs.setX(i, (radius - innerRadius) / ringSpan);
            uvs.setY(i, (angle / (Math.PI * 2)) + 0.5);
        }
        // Material - MeshStandardMaterial with constant emissive
        const material = new THREE.MeshStandardMaterial({
            map: ringPattern || null,
            alphaMap: alphaMapTexture || null,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            roughness: 1.0,
            metalness: 0.0,
            emissive: new THREE.Color(0xffffff), // subtle white glow
            emissiveIntensity: 0.03 // tweak as needed
        });

        // Mesh
        this.mesh = new THREE.Mesh(geometry, material);
        // Align the ring with the planet's equator (spin axis)
        // Get the planet's rotationGroup world quaternion
        const planetQuat = new THREE.Quaternion();
        planet.rotationGroup.getWorldQuaternion(planetQuat);
        this.mesh.quaternion.copy(planetQuat);
        this.mesh.renderOrder = planet.renderOrderOverrides.RINGS ?? RENDER_ORDER.RINGS;
        planet.rotationGroup.add(this.mesh);
        // Store base emissive intensity for correct modulation
        // getRingMaterial ensures emissiveIntensity is set, so no ?? fallback needed.
        this.baseEmissiveIntensity = this.mesh.material.emissiveIntensity;
    }

    update() {
        // No custom lighting or emissive logic needed; Three.js handles shading and emissive
    }

    dispose() {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.planet.orbitGroup.remove(this.mesh);
    }
} 