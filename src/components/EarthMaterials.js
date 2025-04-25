import * as THREE from 'three';
import atmosphereFragmentShader from '../assets/shaders/atmosphereFragmentShader.glsl';
import atmosphereVertexShader from '../assets/shaders/atmosphereVertexShader.glsl';
import glowVertexShader from '../assets/shaders/glowVertexShader.glsl';
import glowFragmentShader from '../assets/shaders/glowFragmentShader.glsl';

// Surface material for the Earth
export function createEarthMaterial(textureManager, anisotropy) {
    const earthTextureMap = textureManager.getTexture('earthTexture');
    earthTextureMap.anisotropy = anisotropy;
    return new THREE.MeshPhongMaterial({
        map: earthTextureMap,
        specularMap: textureManager.getTexture('earthSpecTexture'),
        specular: 0xffffff,
        shininess: 40.0,
        normalMap: textureManager.getTexture('earthNormalTexture'),
        normalScale: new THREE.Vector2(5.0, 5.0),
        normalMapType: THREE.TangentSpaceNormalMap,
        depthWrite: true
    });
}

// Material for cloud layer
export function createCloudMaterial(textureManager, anisotropy) {
    const cloudTexture = textureManager.getTexture('cloudTexture');
    cloudTexture.anisotropy = anisotropy;
    cloudTexture.transparent = true;
    return new THREE.MeshPhongMaterial({
        alphaMap: cloudTexture,
        transparent: true,
        opacity: 1.0,
        side: THREE.FrontSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        depthWrite: false,
        depthTest: true
    });
}

// Atmospheric scattering material with configurable properties
export function createAtmosphereMaterial(earthRadius, {
    atmoHeight = 3,
    densityScale = 1.0,
    colorNear = new THREE.Color(1.0, 0.8, 0.6),
    colorFar = new THREE.Color(1.0, 1.0, 1.0)
} = {}) {
    const atmoRadius = earthRadius + atmoHeight;
    return new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        uniforms: {
            lightPosition:    { value: new THREE.Vector3(1, 0, 0) },
            lightIntensity:   { value: 4.0 },
            surfaceRadius:    { value: earthRadius },
            atmoRadius:       { value: atmoRadius },
            densityScale:     { value: densityScale },
            atmoColorNear:    { value: colorNear },
            atmoColorFar:     { value: colorFar },
            ambientIntensity: { value: 0.0 }
        }
    });
}

// Rim glow material around terminator
export function createGlowMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            innerColor: { value: new THREE.Color(0x89CFF0) },
            midColor: { value: new THREE.Color(0x4682B4) },
            sunDirection: { value: new THREE.Vector3(1, 0, 0) }
        },
        vertexShader: glowVertexShader,
        fragmentShader: glowFragmentShader,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: true,
        depthWrite: false
    });
} 