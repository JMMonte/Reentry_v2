import * as THREE from 'three';

/**
 * Planet Materials Manager
 * 
 * Handles material creation and management for planetary bodies.
 * Material configurations come from the physics data files via the planet config.
 */

// Helper function to create surface materials
function createSurfaceMaterial(textureManager, maxAnisotropy, config = {}) {
    const {
        materialType = 'standard', // 'standard' (PBR), 'phong', or 'lambert'
        textureKey = null,
        normalMapKey = null,
        roughnessMap = null,
        params = {}
    } = config;

    // Get the main texture
    const texture = textureKey ? textureManager.getTexture(textureKey) : null;
    if (!texture && textureKey) {
        console.warn(`[PlanetMaterials] Texture '${textureKey}' not found`);
        return null;
    }

    // Configure texture if available
    if (texture) {
        texture.anisotropy = maxAnisotropy;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
    }

    // Get normal map if specified
    const normalMap = normalMapKey ? textureManager.getTexture(normalMapKey) : null;
    if (normalMap) {
        normalMap.anisotropy = maxAnisotropy;
        normalMap.wrapS = THREE.RepeatWrapping;
        normalMap.wrapT = THREE.RepeatWrapping;
        
        // Fix vertical inversion - normal maps need to be flipped
        normalMap.flipY = true; // This fixes north/south pole inversion
        normalMap.generateMipmaps = false; // Prevent WebGL errors
        normalMap.minFilter = THREE.LinearFilter;
        normalMap.magFilter = THREE.LinearFilter;
        normalMap.needsUpdate = true;
    }

    // Get roughness map if specified
    const roughnessTexture = roughnessMap ? textureManager.getTexture(roughnessMap) : null;
    if (roughnessTexture) {
        roughnessTexture.anisotropy = maxAnisotropy;
        roughnessTexture.wrapS = THREE.RepeatWrapping;
        roughnessTexture.wrapT = THREE.RepeatWrapping;
    }

    // Create material based on type
    let material;
    switch (materialType) {
        case 'standard':
            material = new THREE.MeshStandardMaterial({
                map: texture,
                normalMap: normalMap,
                roughnessMap: roughnessTexture,
                ...params
            });
            break;
        case 'phong':
            material = new THREE.MeshPhongMaterial({
                map: texture,
                normalMap: normalMap,
                ...params
            });
            break;
        case 'lambert':
            material = new THREE.MeshLambertMaterial({
                map: texture,
                ...params
            });
            break;
        default:
            console.warn(`[PlanetMaterials] Unknown material type: ${materialType}`);
            material = new THREE.MeshStandardMaterial({
                map: texture,
                normalMap: normalMap,
                roughnessMap: roughnessTexture,
                ...params
            });
    }

    // Set standard normalScale for all planets - no more per-planet complications
    if (normalMap) {
        material.normalScale = new THREE.Vector2(1.0, 1.0); // Standard scale for all
    }

    return material;
}

/**
 * Planet Materials Manager
 */
export class PlanetMaterials {
    constructor(
        textureManager,
        rendererCapabilities,
        materialOverrides = {},
        planetName = null
    ) {
        this.textureManager = textureManager;
        this.rendererCapabilities = rendererCapabilities;
        this.materialOverrides = materialOverrides;
        this.planetName = planetName;
        
        // Get max anisotropy from renderer capabilities
        this.maxAnisotropy = rendererCapabilities?.getMaxAnisotropy?.() || 16;
        
        // Initialize materials
        this.materials = {};
        
        // Create materials based on overrides
        this._createMaterials();
        
        // Create line materials for surface features
        this._createLineMaterials();
    }
    
    _createMaterials() {
        // Get surface config from material overrides
        const surfaceConfig = this.materialOverrides.surfaceConfig || {};
        
        // Create surface material
        this.materials.surface = createSurfaceMaterial(
            this.textureManager,
            this.maxAnisotropy,
            surfaceConfig
        );
        
        // Create cloud material (if cloud config exists)
        const cloudConfig = this.materialOverrides.cloudConfig || {};
        this.materials.clouds = createSurfaceMaterial(
            this.textureManager,
            this.maxAnisotropy,
            cloudConfig
        );
        
        // Create atmosphere material (if atmosphere config exists)
        const atmosphereConfig = this.materialOverrides.atmosphereConfig || {};
        this.materials.atmosphere = createSurfaceMaterial(
            this.textureManager,
            this.maxAnisotropy,
            atmosphereConfig
        );
        
        // Create rings material (if rings config exists)
        const ringsConfig = this.materialOverrides.ringsConfig || {};
        this.materials.rings = createSurfaceMaterial(
            this.textureManager,
            this.maxAnisotropy,
            ringsConfig
        );
    }
    
    _createLineMaterials() {
        // Create line materials for surface features
        this.materials.latitudeMajor = new THREE.LineBasicMaterial({
            color: 0x444444,
            transparent: true,
            opacity: 0.3
        });
        
        this.materials.countryLine = new THREE.LineBasicMaterial({
            color: 0x666666,
            transparent: true,
            opacity: 0.5
        });
        
        this.materials.stateLine = new THREE.LineBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.3
        });
    }
    
    // Getter methods for backward compatibility
    getSurfaceMaterial() {
        return this.materials.surface;
    }
    
    getCloudMaterial() {
        return this.materials.clouds;
    }
    
    getAtmosphereMaterial() {
        return this.materials.atmosphere;
    }
    
    getRingsMaterial() {
        return this.materials.rings;
    }
    
    /**
     * Create atmosphere mesh for AtmosphereComponent
     */
    createAtmosphereMesh(config, options = {}) {
        const {
            vertexShader,
            fragmentShader,
            defaultResolution = 64,
            renderOrder = 1000
        } = options;
        
        // Create atmosphere geometry
        const geometry = new THREE.SphereGeometry(1, defaultResolution, defaultResolution / 2);
        
        // Get atmosphere config
        const atm = config.atmosphere || {};
        
        // Create atmosphere material with all required uniforms
        const material = new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            uniforms: {
                // Scaling uniforms
                uEquatorialAtmRadiusForScaling: { value: 1 },
                uPolarAtmRadiusForScaling: { value: 1 },
                
                // Planet properties
                uPlanetRadius: { value: atm.equatorialRadius || 6371 },
                uPolarRadius: { value: atm.polarRadius || 6371 },
                uAtmosphereHeight: { value: atm.thickness || 70 },
                
                // Camera and sun
                uCameraPosition: { value: new THREE.Vector3() },
                uSunPosition: { value: new THREE.Vector3() },
                uSunIntensity: { value: atm.sunIntensity || 1 },
                uPlanetPositionWorld: { value: new THREE.Vector3() },
                
                // Atmosphere properties
                uDensityScaleHeight: { value: atm.densityScaleHeight || 10 },
                uRayleighScaleHeight: { value: atm.rayleighScaleHeight || 10 },
                uMieScaleHeight: { value: atm.mieScaleHeight || 1.2 },
                uRayleighScatteringCoeff: { value: new THREE.Vector3().fromArray(atm.rayleighScatteringCoeff || [0.015, 0.04, 0.12]) },
                uMieScatteringCoeff: { value: atm.mieScatteringCoeff || 0.0015 },
                uMieAnisotropy: { value: atm.mieAnisotropy || 7.75 },
                uHazeIntensity: { value: atm.hazeIntensity || 0.7 },
                
                // Raymarching parameters
                uNumLightSteps: { value: atm.numLightSteps || 1 },
                uSampleDistributionPower: { value: 2.0 },
                
                // LOD control
                uLODFactor: { value: 1.0 },
                
                // Transformation
                uPlanetFrame: { value: new THREE.Matrix3() },
                
                // Additional uniforms
                uOpticalDepthLUT: { value: null },
                uScaleHeightMultiplier: { value: atm.scaleHeightMultiplier || 5.0 },
                uLimbFudgeFactor: { value: 0.0 },
                
                // Time for animations
                uTime: { value: 0 }
            },
            vertexShader: vertexShader || `
                uniform float uEquatorialAtmRadiusForScaling;
                uniform float uPolarAtmRadiusForScaling;
                
                varying vec3 vFragPositionPlanetLocal;
                varying vec3 vWorldPosition;
                
                void main() {
                    vFragPositionPlanetLocal = vec3(
                        position.x * uEquatorialAtmRadiusForScaling,
                        position.y * uPolarAtmRadiusForScaling,
                        position.z * uEquatorialAtmRadiusForScaling
                    );
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: fragmentShader || `
                uniform float uTime;
                uniform sampler2D uOpticalDepthLUT;
                uniform float uScaleHeightMultiplier;
                uniform float uLODFactor;
                uniform vec3 uRayleighScatteringCoeff;
                uniform float uHazeIntensity;
                
                varying vec3 vFragPositionPlanetLocal;
                varying vec3 vWorldPosition;
                
                void main() {
                    vec3 color = uRayleighScatteringCoeff * uHazeIntensity;
                    float alpha = 0.1 * uLODFactor;
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = renderOrder;
        
        return mesh;
    }
    
    /**
     * Dispose of all materials
     */
    dispose() {
        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
    }
} 