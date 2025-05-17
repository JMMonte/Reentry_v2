import * as THREE from 'three';
import soiVertexShader from '../../shaders/soiVertexShader.glsl';
import soiFragmentShader from '../../shaders/soiFragmentShader.glsl';
import { Constants } from '../../utils/Constants.js';

// Inlined from EarthMaterials.js
function createEarthMaterial(textureManager, anisotropy) {
    const matParams = {
        specular: 0xffffff,
        shininess: 40.0,
        normalScale: new THREE.Vector2(5.0, 5.0),
        normalMapType: THREE.TangentSpaceNormalMap,
        depthWrite: true
    };
    const earthTextureMap = textureManager.getTexture('earthTexture');
    if (earthTextureMap) {
        earthTextureMap.anisotropy = anisotropy;
        matParams.map = earthTextureMap;
    }
    const specularMap = textureManager.getTexture('earthSpecTexture');
    if (specularMap) {
        matParams.specularMap = specularMap;
    }
    const normalMap = textureManager.getTexture('earthNormalTexture');
    if (normalMap) {
        matParams.normalMap = normalMap;
    }
    const bump = textureManager.getTexture('earthBumpMap');
    if (bump) {
        matParams.bumpMap = bump;
        matParams.bumpScale = 0.1;
    }
    return new THREE.MeshPhongMaterial(matParams);
}

// Modify this internal default cloud material function
function createCloudMaterial(textureManager, anisotropy) {
    const cloudTexture = textureManager.getTexture('cloudTexture');
    if (!cloudTexture) return null;

    cloudTexture.anisotropy = anisotropy;

    return new THREE.MeshLambertMaterial({ // Keep Lambert
        // map: cloudTexture, // REMOVED from map
        side: THREE.DoubleSide,
        alphaMap: cloudTexture, // USE texture as alphaMap
        color: 0xffffff, // Base color for clouds (white)
        transparent: true,
        renderOrder: 0,
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
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
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
        // if (mat.bumpMap) mat.bumpMap.anisotropy = this.maxAnisotropy;
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

    /**
     * Create a THREE.Mesh for the planet's atmosphere, with correct oblateness and shader material.
     * @param {object} config - The planet config (must include .radius, .oblateness, .atmosphere)
     * @param {object} options - Extra options (e.g. shaders, sun ref, app ref)
     * @returns {THREE.Mesh|null}
     */
    createAtmosphereMesh(config, options = {}) {
        if (!config.atmosphere || !config.radius) return null;
        const atm = config.atmosphere;
        const equR = config.radius;
        const polR = equR * (1.0 - (config.oblateness || 0.0));
        const coreY = polR / equR;
        // Create geometry at outer atmosphere boundary for proper backface halo
        const thickness = atm.thickness || 0;
        // Add a slight fudge to the limb to avoid black gaps
        const fudgeFactor = atm.limbFudgeFactor !== undefined ? atm.limbFudgeFactor : 0.2;
        const extra = thickness * fudgeFactor;
        // Geometry radius includes fudge
        const radius = equR + thickness + extra;
        const geometry = new THREE.SphereGeometry(radius, 16, 8);
        // Use provided shaders if present, else fallback to default
        const vertexShader = options.vertexShader;
        const fragmentShader = options.fragmentShader;
        const uniforms = {
            uPlanetRadius: { value: equR },
            uPolarRadius: { value: polR },
            // Uniform atmosphere height includes same fudge
            uAtmosphereHeight:     { value: thickness * (1.0 + fudgeFactor) },
            // Expose fudgeFactor for dynamic updates
            uLimbFudgeFactor:      { value: fudgeFactor },
            uDensityScaleHeight:   { value: atm.densityScaleHeight || 0 },
            // Separate scale heights for Rayleigh and Mie scattering
            uRayleighScaleHeight:  { value: atm.rayleighScaleHeight !== undefined ? atm.rayleighScaleHeight : (atm.densityScaleHeight || 8.0) },
            uMieScaleHeight:       { value: atm.mieScaleHeight !== undefined      ? atm.mieScaleHeight      : (atm.densityScaleHeight || 1.2) },
            uRayleighScatteringCoeff: { value: new THREE.Vector3().fromArray(atm.rayleighScatteringCoeff || [0, 0, 0]) },
            uMieScatteringCoeff:   { value: atm.mieScatteringCoeff || 0 },
            uMieAnisotropy:        { value: atm.mieAnisotropy || 0 },
            uNumLightSteps:        { value: atm.numLightSteps || 4 },
            uSunIntensity:         { value: atm.sunIntensity || 1.0 },
            // power exponent for non-linear sample distribution (pow(fi, power))
            uSampleDistributionPower: { value: atm.sampleDistributionPower !== undefined ? atm.sampleDistributionPower : 2.0 },
            uPlanetFrame:          { value: new THREE.Matrix3() },
            uSunPosition:          { value: new THREE.Vector3() },
            uCameraPosition:       { value: new THREE.Vector3() },
            uPlanetPositionWorld:  { value: new THREE.Vector3() },
            uHazeIntensity:        { value: atm.hazeIntensity !== undefined ? atm.hazeIntensity : 1.0 },
        };
        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: true,
            depthTest: false,
            blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `atmosphere_${config.name}`;
        mesh.scale.set(1, coreY, 1);
        // mesh.renderOrder = PlanetMaterials.SURFACE_RENDER_ORDER - 1;
        mesh.frustumCulled = true;
        return mesh;
    }

    /**
     * Returns a MeshPhongMaterial for planetary rings.
     * @param {THREE.Texture} colorTexture - The color texture for the ring.
     * @param {THREE.Texture} alphaTexture - The alpha texture for the ring (can be same as colorTexture).
     * @param {object} options - Additional material options (shininess, specular, emissive, emissiveIntensity, emissivity, etc.).
     *   - emissivity: number (default 0.2) - controls the ring's diffusion-like glow
     */
    getRingMaterial(colorTexture, alphaTexture, options = {}) {
        const emissivity = options.emissivity ?? 1.0;
        return new THREE.MeshPhongMaterial({
            map: colorTexture || null,
            alphaMap: alphaTexture || null,
            alphaTest: 0.01,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            shininess: options.shininess ?? 15,
            specular: options.specular ?? 0x333333,
            emissive: options.emissive ?? 0xffffff,
            emissiveIntensity: options.emissiveIntensity ?? emissivity
        });
    }
} 