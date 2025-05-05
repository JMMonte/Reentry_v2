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
        bumpMap: textureManager.getTexture('earthBumpMap'),
        bumpScale: 0.1,
        depthWrite: true
    });
}

// Modify this internal default cloud material function
function createCloudMaterial(textureManager, anisotropy) {
    const cloudTexture = textureManager.getTexture('cloudTexture');
    if (!cloudTexture) return null;

    cloudTexture.anisotropy = anisotropy;

    return new THREE.MeshLambertMaterial({ // Keep Lambert
        // map: cloudTexture, // REMOVED from map
        alphaMap: cloudTexture, // USE texture as alphaMap
        color: 0xffffff, // Base color for clouds (white)
        transparent: true,
        blending: THREE.NormalBlending,
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
            // New: world position of the planet
            planetPosition: { value: new THREE.Vector3() },
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

// Reusable planet day/night blending shader
function createDayNightMaterial({
    dayMap,
    nightMap = null,
    sunDirection = new THREE.Vector3(1, 0, 0),
    planetCenter = new THREE.Vector3(0, 0, 0),
    uCameraPosition = new THREE.Vector3(0, 0, 10),
    specularMap = null,
    normalMap = null,
    shininess = 40.0,
    specular = 0xffffff,
    normalScale = new THREE.Vector2(1, 1),
} = {}) {
    // If nightMap is not provided, use a 1x1 black texture
    if (!nightMap) {
        const black = new Uint8Array([0, 0, 0, 255]);
        nightMap = new THREE.DataTexture(black, 1, 1, THREE.RGBAFormat);
        nightMap.needsUpdate = true;
    }
    return new THREE.ShaderMaterial({
        uniforms: {
            dayMap: { value: dayMap },
            nightMap: { value: nightMap },
            sunDirection: { value: sunDirection.clone().normalize() },
            planetCenter: { value: planetCenter },
            uCameraPosition: { value: uCameraPosition.clone() },
            specularMap: { value: specularMap },
            normalMap: { value: normalMap },
            shininess: { value: shininess },
            specular: { value: new THREE.Color(specular) },
            normalScale: { value: normalScale },
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormalW;
            varying vec3 vWorldPos;
            void main() {
                vUv = uv;
                vNormalW = normalize(mat3(modelMatrix) * normal);
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D dayMap;
            uniform sampler2D nightMap;
            uniform vec3 sunDirection;
            uniform vec3 planetCenter;
            uniform vec3 uCameraPosition;
            uniform float shininess;
            uniform vec3 specular;
            varying vec2 vUv;
            varying vec3 vNormalW;
            varying vec3 vWorldPos;
            void main() {
                vec3 normal = normalize(vNormalW);
                vec3 toSun = normalize(sunDirection);
                vec3 toCamera = normalize(uCameraPosition - vWorldPos);
                float ndotl = max(dot(normal, toSun), 0.0);
                // Diffuse day color
                vec3 dayColor = texture2D(dayMap, vUv).rgb * ndotl;
                // Specular (Blinn-Phong)
                vec3 halfDir = normalize(toSun + toCamera);
                float spec = pow(max(dot(normal, halfDir), 0.0), shininess);
                vec3 specularColor = specular * spec * ndotl;
                // Night color (no sun)
                vec4 nightTex = texture2D(nightMap, vUv);
                vec3 nightColor = nightTex.rgb;
                float blend = clamp(0.5 + 0.5 * dot(normal, toSun), 0.0, 1.0);
                vec3 color = mix(nightColor, dayColor + specularColor, blend);
                if (blend < 0.01) {
                    gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); // night side: green
                    return;
                } else if (blend > 0.99) {
                    gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); // day side: blue
                    return;
                }
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        lights: false,
        transparent: false,
    });
}

// Helper to update camera position uniform each frame
function updateDayNightMaterialCamera(mat, camera) {
    if (mat && mat.uniforms && mat.uniforms.uCameraPosition) {
        mat.uniforms.uCameraPosition.value.copy(camera.position);
    }
}

export { createDayNightMaterial, updateDayNightMaterialCamera };

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
        if (mat.bumpMap) mat.bumpMap.anisotropy = this.maxAnisotropy;
        return mat;
    }

    getCloudMaterial() {
        const mat = this.cloudCreator(this.textureManager, this.maxAnisotropy);
        if (!mat) return null;
        if (mat.map) mat.map.anisotropy = this.maxAnisotropy;
        // prevent clouds from occluding the planet surface
        mat.depthWrite = false;
        mat.depthTest = true;
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