import * as THREE from 'three';
import atmosphereFragmentShader from '../assets/shaders/atmosphereFragmentShader.glsl';
import atmosphereVertexShader from '../assets/shaders/atmosphereVertexShader.glsl';
import soiVertexShader from '../assets/shaders/soiVertexShader.glsl';
import soiFragmentShader from '../assets/shaders/soiFragmentShader.glsl';
import { Constants } from '../utils/Constants.js';

// Inlined from EarthMaterials.js
function createEarthMaterial(textureManager, anisotropy) {
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
function createCloudMaterial(textureManager, anisotropy) {
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
        blendDst: THREE.OneMinusSrcAlphaFactor,
        depthWrite: false,
        depthTest: true
    });
}
function createAtmosphereMaterial(earthRadius, {
    atmoHeight = 5,
    densityScale = 0.05,
    colorNear = new THREE.Color(1.0, 0.8, 1.0),
    colorFar = new THREE.Color(0.2, 0.5, 1.0)
} = {}) {
    const atmoRadius = earthRadius + atmoHeight;
    // Scale light intensity with world scale
    const baseLightIntensity = 4.0;
    return new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        uniforms: {
            lightPosition: { value: new THREE.Vector3(1, 0, 0) },
            lightIntensity: { value: baseLightIntensity },
            ambientIntensity: { value: 0.0 },
            surfaceRadius: { value: earthRadius },
            atmoRadius: { value: atmoRadius },
            densityScale: { value: densityScale },
            atmoColorNear: { value: colorNear },
            atmoColorFar: { value: colorFar },
            worldScale: { value: Constants.scale },
            // Ellipsoid scaling uniforms (overridden per-mesh)
            polarScale:   { value: 1.0 },
            atmoYScale:   { value: 1.0 },
        }
    });
}
function createGlowMaterial(planetRadius, options = {}) {
    // reuse volumetric atmosphere shader for realistic glow halo
    const mat = createAtmosphereMaterial(planetRadius, options);
    mat.side = THREE.BackSide;
    mat.blending = THREE.AdditiveBlending;
    mat.transparent = true;
    mat.depthTest = true;
    mat.depthWrite = false;
    // optional intensity tweaks
    if (mat.uniforms.lightIntensity) mat.uniforms.lightIntensity.value *= 0.7;
    if (mat.uniforms.ambientIntensity) mat.uniforms.ambientIntensity.value = 0.0;
    return mat;
}
// Create a shader material for Sphere of Influence rim glow using fresnel effect
function createSoiMaterial(options = {}) {
    const { color = new THREE.Color(0x8888ff), power = 2.0 } = options;
    return new THREE.ShaderMaterial({
        vertexShader: soiVertexShader,
        fragmentShader: soiFragmentShader,
        side: THREE.FrontSide,     // draw only the outer faces so the rim glows as an edge
        transparent: true,
        depthTest: true,          // <-- Enable depth testing
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            color: { value: color },
            power: { value: power }
        }
    });
}

export class PlanetMaterials {
    constructor(textureManager, rendererCapabilities, materialsConfig = {}) {
        this.textureManager = textureManager;
        this.maxAnisotropy = rendererCapabilities.getMaxAnisotropy();
        this.config = materialsConfig;
        // Default material creator functions
        this.surfaceCreator = materialsConfig.createSurfaceMaterial || createEarthMaterial;
        this.cloudCreator = materialsConfig.createCloudMaterial || createCloudMaterial;
        this.atmosphereCreator = createAtmosphereMaterial;
        this.glowCreator = materialsConfig.createGlowMaterial || createGlowMaterial;
        this.soiCreator = materialsConfig.createSOIMaterial || createSoiMaterial;
        // Options for atmosphere and glow
        this.atmosphereOptions = materialsConfig.atmosphereOptions || {};
        this.glowScale = materialsConfig.glowScale || 0.01;
        this.glowRenderOrder = materialsConfig.glowRenderOrder || 2;
        this.soiOptions = materialsConfig.soiOptions || {};
    }

    getSurfaceMaterial() {
        const mat = this.surfaceCreator(this.textureManager, this.maxAnisotropy);
        if (mat.map) mat.map.anisotropy = this.maxAnisotropy;
        if (mat.normalMap) mat.normalMap.anisotropy = this.maxAnisotropy;
        return mat;
    }

    getCloudMaterial() {
        const mat = this.cloudCreator(this.textureManager, this.maxAnisotropy);
        if (!mat) return null;
        if (mat.map) mat.map.anisotropy = this.maxAnisotropy;
        return mat;
    }

    getAtmosphereMaterial(surfaceRadius) {
        return this.atmosphereCreator(surfaceRadius, this.atmosphereOptions);
    }

    // build a realistic glow using volumetric atmosphere with custom glow options
    getGlowMaterial(surfaceRadius, glowOptions = {}) {
        // merge global atmosphere options with glow-specific overrides (e.g. actual atmosphere thickness)
        const options = { ...this.atmosphereOptions, ...glowOptions };
        return this.glowCreator(surfaceRadius, options);
    }

    getGlowParameters() {
        return { scale: this.glowScale, renderOrder: this.glowRenderOrder };
    }

    /** Get the Sphere of Influence rim glow material */
    getSOIMaterial(options = {}) {
        const opts = { ...this.soiOptions, ...options };
        return this.soiCreator(opts);
    }
} 