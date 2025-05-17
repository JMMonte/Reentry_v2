import * as THREE from 'three';
import { RENDER_ORDER } from './Planet.js';

export class SoiComponent {
    constructor(planet) {
        this.planet = planet;
        this.mesh = null;
        const radius = planet.soiRadius;
        if (!radius) return;
        const geo = new THREE.SphereGeometry(radius, 64, 32);
        const mat = SoiComponent.createSOIMaterial(
            planet.config?.materials?.soiOptions || {}
        );
        if (!mat) return;
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.renderOrder = planet.renderOrderOverrides?.SOI ?? RENDER_ORDER.SOI;
        planet.orbitGroup.add(this.mesh);
    }

    static createSOIMaterial(options = {}) {
        const color = options.color || new THREE.Color(0x8888ff);
        const power = options.power || 2.0;
        return new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewDir;
                void main() {
                    vNormal = normalize(mat3(modelMatrix) * normal);
                    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    vViewDir = normalize(cameraPosition - worldPos);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float power;
                varying vec3 vNormal;
                varying vec3 vViewDir;
                void main() {
                    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), power);
                    gl_FragColor = vec4(color * fresnel, fresnel);
                }
            `,
            side: THREE.FrontSide,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                color: { value: color },
                power: { value: power }
            }
        });
    }

    update() {
        // SOI mesh is static each frame
    }

    setVisible(v) {
        if (this.mesh) this.mesh.visible = v;
    }

    dispose() {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.planet.orbitGroup.remove(this.mesh);
    }
} 