import * as THREE from 'three';
import { RENDER_ORDER } from './Planet.js';
import { Constants } from '../../utils/Constants.js';

export class RingComponent {
    constructor(planet, ringConfig) {
        this.planet = planet;
        const {
            innerRadius,
            outerRadius,
            textureKey,
            alphaTextureKey, // Optional: if rings need separate alpha texture
            resolution = 128,
            materialOptions, // This is an object from ringConfig.materialOptions
            ...materialProps // Captures other top-level keys from ringConfig (like emissivity, shininess)
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
        // Combine material properties from top-level (materialProps) and from materialOptions object
        // Properties in materialOptions will override those in materialProps if names clash.
        const combinedMaterialConfig = { ...materialProps, ...(materialOptions || {}) };

        // Material - NOW USING getRingMaterial
        const material = this.planet.materials.getRingMaterial(
            ringPattern,       // colorTexture
            alphaMapTexture,   // alphaTexture
            combinedMaterialConfig // options (which can include emissivity, emissiveIntensity, etc.)
        );

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
        if (!this.mesh || !this.mesh.material || !this.planet || !this.planet.getMesh()) return;

        const planetMesh = this.planet.getMesh();
        const planetPos = new THREE.Vector3();
        planetMesh.getWorldPosition(planetPos);

        let sunPos = new THREE.Vector3(); // Default to origin if sun not found
        if (window.app3d?.sun?.sun?.getWorldPosition) {
            window.app3d.sun.sun.getWorldPosition(sunPos);
        }

        const dist = planetPos.distanceTo(sunPos);
        const EPS = 1e-6; // Epsilon for float comparisons
        let calculatedIntensity;

        if (dist < EPS) {
            // Planet is at the Sun's location, or sun is not defined and planet is at origin.
            // Sun direction is ill-defined, so set a default brightness.
            calculatedIntensity = 2.5 * this.baseEmissiveIntensity; // Max brightness scenario
        } else {
            const sunDir = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();

            const ringNormal = new THREE.Vector3(0, 1, 0); // Local normal (assuming Y is up for ring face post-rotation)
            this.mesh.updateWorldMatrix(true, false); // Ensure mesh's world matrix is current
            const ringWorldQuaternion = this.mesh.getWorldQuaternion(new THREE.Quaternion());
            ringNormal.applyQuaternion(ringWorldQuaternion).normalize(); // Transform normal to world space

            const cosAngle = Math.abs(ringNormal.dot(sunDir));

            const AU_KM = (typeof Constants.AU === 'number') ? Constants.AU * Constants.metersToKm : 149597870.7;
            // Inverse square law factor for sun intensity based on distance.
            // dist*dist will not be zero here due to the (dist < EPS) check.
            const sunDistanceFactor = (AU_KM * AU_KM) / (dist * dist);

            calculatedIntensity = 2.5 * this.baseEmissiveIntensity * cosAngle * sunDistanceFactor;
        }

        // Ensure the final intensity is a valid number and clamp it.
        if (isNaN(calculatedIntensity)) {
            this.mesh.material.emissiveIntensity = 0;
        } else {
            // Clamp intensity: min 0, max 100 (arbitrary reasonable upper bound)
            this.mesh.material.emissiveIntensity = THREE.MathUtils.clamp(calculatedIntensity, 0, 100);
        }
    }

    dispose() {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.planet.orbitGroup.remove(this.mesh);
    }
} 