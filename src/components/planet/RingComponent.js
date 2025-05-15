import * as THREE from 'three';
import { RENDER_ORDER } from './Planet.js';
import { Constants } from '../../utils/Constants.js';

export class RingComponent {
    constructor(planet, ringConfig) {
        this.planet = planet;
        const { innerRadius, outerRadius, textureKey, resolution = 128, materialOptions, ...materialProps } = ringConfig;
        const ringPattern = planet.textureManager.getTexture(textureKey);
        if (!ringPattern) {
            console.warn(`Ring pattern texture '${textureKey}' not found for planet ${planet.name}.`);
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
        // Material
        const material = new THREE.MeshPhongMaterial({
            map: ringPattern || null,
            alphaMap: null,
            alphaTest: 0.01,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: true,
            ...materialProps,
            ...(materialOptions || {})
        });
        // Mesh
        this.mesh = new THREE.Mesh(geometry, material);
        // Align the ring with the planet's equator (spin axis)
        // Get the planet's rotationGroup world quaternion
        const planetQuat = new THREE.Quaternion();
        planet.rotationGroup.getWorldQuaternion(planetQuat);
        this.mesh.quaternion.copy(planetQuat);
        // Rotate the ring so its normal matches the planet's Y axis
        this.mesh.rotateX(Math.PI / 2);
        this.mesh.renderOrder = planet.renderOrderOverrides.RINGS ?? RENDER_ORDER.RINGS;
        planet.rotationGroup.add(this.mesh);
        // Store base emissive intensity for correct modulation
        this.baseEmissiveIntensity = this.mesh.material.emissiveIntensity ?? 5.0;
    }

    update() {
        if (!this.mesh) return;
        // Emissive update: modulate emissiveIntensity by sun angle
        const planetPos = new THREE.Vector3();
        this.planet.getMesh().getWorldPosition(planetPos);
        let sunPos = new THREE.Vector3();
        if (window.app3d?.sun?.sun?.getWorldPosition) {
            window.app3d.sun.sun.getWorldPosition(sunPos);
        }
        const sunDir = sunPos.clone().sub(planetPos).normalize();
        // Ring normal in world
        const ringNormal = new THREE.Vector3(0, 1, 0);
        this.planet.orbitGroup.updateMatrixWorld();
        ringNormal.applyMatrix4(this.planet.orbitGroup.matrixWorld).sub(planetPos).normalize();
        const cosAngle = Math.abs(ringNormal.dot(sunDir));
        // Sun intensity at planet
        const dist = planetPos.distanceTo(sunPos);
        const AU_KM = (typeof Constants.AU === 'number') ? Constants.AU * Constants.metersToKm : 149597870.7;
        const BASE = 10.6;
        const EPS = 1e-6;
        const sunIntensity = BASE * (AU_KM * AU_KM) / Math.max(dist * dist, EPS);
        // Always modulate from the original base value
        this.mesh.material.emissiveIntensity = 2.5 * this.baseEmissiveIntensity * cosAngle * sunIntensity / BASE;
    }

    dispose() {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.planet.orbitGroup.remove(this.mesh);
    }
} 