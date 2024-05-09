import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import fragmentShader from './shaders/atmosphereFragmentShader.glsl';
import vertexShader from './shaders/atmosphereVertexShader.glsl';

export class Atmosphere {
    constructor(camera, renderer, earth, scene) {
        this.camera = camera;
        this.renderer = renderer;
        this.composer = new EffectComposer(renderer);
        this.atmosphereUniforms = {
            uCameraPosition: { value: new THREE.Vector3() },
            inverseProjection: { value: new THREE.Matrix4() },
            inverseView: { value: new THREE.Matrix4() },
            atmospheres: { value: [
                {
                    PLANET_CENTER: new THREE.Vector3(0, 0, 0),
                    lightDir: new THREE.Vector3(1, 1, 1).normalize(),
                    PLANET_RADIUS: earth.EARTH_RADIUS,
                    ATMOSPHERE_RADIUS: earth.EARTH_RADIUS + 200,
                    G: -0.98,
                    PRIMARY_STEPS: 16,
                    LIGHT_STEPS: 8,
                    ulight_intensity: new THREE.Vector3(1, 1, 1),
                    uray_light_color: new THREE.Vector3(0.3, 0.3, 0.9),
                    umie_light_color: new THREE.Vector3(0.6, 0.6, 0.6),
                    RAY_BETA: new THREE.Vector3(0.0005, 0.001, 0.0015),
                    MIE_BETA: new THREE.Vector3(0.00013, 0.00013, 0.00013),
                    AMBIENT_BETA: new THREE.Vector3(0.0001, 0.0001, 0.0001),
                    ABSORPTION_BETA: new THREE.Vector3(0.0005, 0.0005, 0.0005),
                    HEIGHT_RAY: 8.4,
                    HEIGHT_MIE: 1.25,
                    HEIGHT_ABSORPTION: 0.15,
                    ABSORPTION_FALLOFF: 6.0,
                    textureIntensity: 0.8,
                    AmbientLightIntensity: 0.5
                }
            ]}
        };

        const atmospherePass = new ShaderPass({
            uniforms: this.atmosphereUniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });

        this.composer.addPass(new RenderPass(scene, camera));
        this.composer.addPass(atmospherePass);
        this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85));
    }

    update() {
        this.atmosphereUniforms.uCameraPosition.value.copy(this.camera.position);
        this.atmosphereUniforms.inverseProjection.value.copy(this.camera.projectionMatrixInverse);
        this.atmosphereUniforms.inverseView.value.copy(this.camera.matrixWorldInverse);
        this.composer.render();
    }
}
