import { createEarthMaterial, createCloudMaterial, createAtmosphereMaterial, createGlowMaterial } from './EarthMaterials.js';

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
        // Options for atmosphere and glow
        this.atmosphereOptions = materialsConfig.atmosphereOptions || {};
        this.glowScale = materialsConfig.glowScale || 0.01;
        this.glowRenderOrder = materialsConfig.glowRenderOrder || 2;
    }

    getSurfaceMaterial() {
        const mat = this.surfaceCreator(this.textureManager, this.maxAnisotropy);
        if (mat.map) mat.map.anisotropy = this.maxAnisotropy;
        if (mat.normalMap) mat.normalMap.anisotropy = this.maxAnisotropy;
        return mat;
    }

    getCloudMaterial() {
        const mat = this.cloudCreator(this.textureManager, this.maxAnisotropy);
        if (mat.map) mat.map.anisotropy = this.maxAnisotropy;
        return mat;
    }

    getAtmosphereMaterial(surfaceRadius) {
        return this.atmosphereCreator(surfaceRadius, this.atmosphereOptions);
    }

    getGlowMaterial() {
        return this.glowCreator();
    }

    getGlowParameters() {
        return { scale: this.glowScale, renderOrder: this.glowRenderOrder };
    }
} 