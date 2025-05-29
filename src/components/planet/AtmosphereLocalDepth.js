import * as THREE from 'three';

/**
 * AtmosphereLocalDepth - Enhanced atmosphere component with local depth mapping
 * 
 * This component creates a local depth render target for each atmosphere to handle
 * proper occlusion in logarithmic depth buffer scenes. Each atmosphere maintains its
 * own depth map that's updated relative to the atmosphere's local space.
 */
export class AtmosphereLocalDepth {
    constructor(planet, atmosphereConfig, shaders) {
        this.planet = planet;
        this.config = atmosphereConfig;
        this.shaders = shaders;
        
        // Create render targets for local depth
        this.depthRenderTarget = null;
        this.depthCamera = null;
        this.depthMaterial = null;
        
        // Store references
        this.atmosphereMesh = null;
        this.scene = null;
        
        // Distance culling parameters
        this.maxRenderDistance = atmosphereConfig.maxRenderDistance || 1e6; // 1 million km default
        this.minPixelSize = atmosphereConfig.minPixelSize || 2; // Minimum pixels before culling
        
        this.setupDepthRendering();
    }
    
    setupDepthRendering() {
        // Create depth render target with floating point precision
        const size = 512; // Local depth map resolution
        this.depthRenderTarget = new THREE.WebGLRenderTarget(size, size, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: true,
            stencilBuffer: false
        });
        
        // Create orthographic camera for local depth rendering
        // This will be positioned and sized based on atmosphere bounds
        this.depthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        
        // Create depth material for pre-pass
        this.depthMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec4 vViewPosition;
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = mvPosition;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec4 vViewPosition;
                void main() {
                    // Encode depth in local space (0-1 range)
                    float depth = -vViewPosition.z;
                    
                    // Pack depth into RGBA for precision
                    vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * depth;
                    enc = fract(enc);
                    enc -= enc.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);
                    
                    gl_FragColor = enc;
                }
            `,
            side: THREE.DoubleSide
        });
    }
    
    createAtmosphereMesh(planetMesh) {
        const config = this.config;
        const planetRadius = this.planet.radius;
        const polarRadius = planetRadius * (1.0 - (this.planet.oblateness || 0.0));
        
        // Create atmosphere geometry
        const thickness = config.thickness || 0;
        const limbFudgeFactor = config.limbFudgeFactor !== undefined ? config.limbFudgeFactor : 0.2;
        const extra = thickness * limbFudgeFactor;
        const radius = planetRadius + thickness + extra;
        
        const geometry = new THREE.SphereGeometry(radius, 32, 24);
        
        // Enhanced uniforms including depth texture
        const uniforms = {
            // Original uniforms
            uPlanetRadius: { value: planetRadius },
            uPolarRadius: { value: polarRadius },
            uAtmosphereHeight: { value: thickness * (1.0 + limbFudgeFactor) },
            uLimbFudgeFactor: { value: limbFudgeFactor },
            uDensityScaleHeight: { value: config.densityScaleHeight || 0 },
            uRayleighScaleHeight: { value: config.rayleighScaleHeight !== undefined ? config.rayleighScaleHeight : (config.densityScaleHeight || 8.0) },
            uMieScaleHeight: { value: config.mieScaleHeight !== undefined ? config.mieScaleHeight : (config.densityScaleHeight || 1.2) },
            uRayleighScatteringCoeff: { value: new THREE.Vector3().fromArray(config.rayleighScatteringCoeff || [0, 0, 0]) },
            uMieScatteringCoeff: { value: config.mieScatteringCoeff || 0 },
            uMieAnisotropy: { value: config.mieAnisotropy || 0 },
            uNumLightSteps: { value: config.numLightSteps || 4 },
            uSunIntensity: { value: config.sunIntensity || 1.0 },
            uSampleDistributionPower: { value: config.sampleDistributionPower !== undefined ? config.sampleDistributionPower : 2.0 },
            uPlanetFrame: { value: new THREE.Matrix3() },
            uSunPosition: { value: new THREE.Vector3() },
            uCameraPosition: { value: new THREE.Vector3() },
            uPlanetPositionWorld: { value: new THREE.Vector3() },
            uHazeIntensity: { value: config.hazeIntensity !== undefined ? config.hazeIntensity : 1.0 },
            uScaleHeightMultiplier: { value: config.scaleHeightMultiplier !== undefined ? config.scaleHeightMultiplier : 1.0 },
            
            // New depth-related uniforms
            uLocalDepthTexture: { value: this.depthRenderTarget.texture },
            uDepthProjectionMatrix: { value: new THREE.Matrix4() },
            uDepthViewMatrix: { value: new THREE.Matrix4() },
            uUseLocalDepth: { value: 1.0 },
            uAtmosphereScale: { value: radius }
        };
        
        // Create enhanced fragment shader with depth testing
        const enhancedFragmentShader = this.createEnhancedFragmentShader();
        
        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: this.shaders.vertexShader,
            fragmentShader: enhancedFragmentShader,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false, // Don't write to global depth buffer
            depthTest: true,   // But do test against it
            blending: THREE.AdditiveBlending
        });
        
        this.atmosphereMesh = new THREE.Mesh(geometry, material);
        this.atmosphereMesh.name = `atmosphere_${this.planet.name}_enhanced`;
        
        // Apply oblateness
        const coreY = polarRadius / planetRadius;
        this.atmosphereMesh.scale.set(1, coreY, 1);
        
        return this.atmosphereMesh;
    }
    
    createEnhancedFragmentShader() {
        // Insert depth testing into the original fragment shader
        const originalShader = this.shaders.fragmentShader;
        
        // Add depth decoding function and uniforms
        const depthCode = `
// Local depth uniforms
uniform sampler2D uLocalDepthTexture;
uniform mat4 uDepthProjectionMatrix;
uniform mat4 uDepthViewMatrix;
uniform float uUseLocalDepth;

// Decode packed depth
float decodeDepth(vec4 rgba) {
    return dot(rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
}

// Get local depth at current fragment
float getLocalDepth(vec3 worldPos) {
    vec4 depthSpacePos = uDepthProjectionMatrix * uDepthViewMatrix * vec4(worldPos, 1.0);
    vec3 depthUV = depthSpacePos.xyz / depthSpacePos.w;
    depthUV = depthUV * 0.5 + 0.5;
    
    if (depthUV.x < 0.0 || depthUV.x > 1.0 || depthUV.y < 0.0 || depthUV.y > 1.0) {
        return 1.0; // Outside depth map bounds
    }
    
    vec4 packedDepth = texture2D(uLocalDepthTexture, depthUV.xy);
    return decodeDepth(packedDepth);
}
`;
        
        // Insert depth code after uniforms
        const enhancedShader = originalShader.replace(
            'const float PI = 3.141592653589793;',
            depthCode + '\nconst float PI = 3.141592653589793;'
        );
        
        return enhancedShader;
    }
    
    updateDepthMap(renderer, scene, camera) {
        if (!this.atmosphereMesh || !this.atmosphereMesh.visible) return;
        
        // Save current render state
        const currentRenderTarget = renderer.getRenderTarget();
        const currentClearAlpha = renderer.getClearAlpha();
        
        // Calculate atmosphere bounds in world space
        const atmRadius = this.config.thickness + this.planet.radius;
        const planetWorldPos = this.atmosphereMesh.position;
        
        // Update depth camera to frame the atmosphere
        const boundingSize = atmRadius * 2.2; // Add margin
        this.depthCamera.left = -boundingSize;
        this.depthCamera.right = boundingSize;
        this.depthCamera.top = boundingSize;
        this.depthCamera.bottom = -boundingSize;
        this.depthCamera.near = 0.1;
        this.depthCamera.far = boundingSize * 2;
        
        // Position depth camera along view direction
        const viewDir = new THREE.Vector3().subVectors(camera.position, planetWorldPos).normalize();
        this.depthCamera.position.copy(planetWorldPos).add(viewDir.multiplyScalar(boundingSize));
        this.depthCamera.lookAt(planetWorldPos);
        this.depthCamera.updateProjectionMatrix();
        this.depthCamera.updateMatrixWorld();
        
        // Update depth matrices in atmosphere material
        this.atmosphereMesh.material.uniforms.uDepthProjectionMatrix.value.copy(this.depthCamera.projectionMatrix);
        this.atmosphereMesh.material.uniforms.uDepthViewMatrix.value.copy(this.depthCamera.matrixWorldInverse);
        
        // Render depth pass
        renderer.setRenderTarget(this.depthRenderTarget);
        renderer.setClearAlpha(0);
        renderer.clear();
        
        // Temporarily change material for depth pass
        const originalMaterial = this.atmosphereMesh.material;
        this.atmosphereMesh.material = this.depthMaterial;
        
        // Render only this atmosphere's depth
        renderer.render(this.atmosphereMesh, this.depthCamera);
        
        // Restore original material
        this.atmosphereMesh.material = originalMaterial;
        
        // Restore render state
        renderer.setRenderTarget(currentRenderTarget);
        renderer.setClearAlpha(currentClearAlpha);
    }
    
    updateVisibility(camera) {
        if (!this.atmosphereMesh) return;
        
        const planetPos = this.atmosphereMesh.position;
        const distance = camera.position.distanceTo(planetPos);
        
        // Check if too far
        if (distance > this.maxRenderDistance) {
            this.atmosphereMesh.visible = false;
            return;
        }
        
        // Check pixel size
        const atmRadius = this.planet.radius + this.config.thickness;
        const angularSize = 2 * Math.atan(atmRadius / distance);
        const pixelSize = angularSize * window.innerHeight / camera.fov;
        
        this.atmosphereMesh.visible = pixelSize >= this.minPixelSize;
    }
    
    update(renderer, scene, camera, sun) {
        this.updateVisibility(camera);
        
        if (this.atmosphereMesh && this.atmosphereMesh.visible) {
            // Update depth map before main render
            this.updateDepthMap(renderer, scene, camera);
            
            // Update atmosphere uniforms (sun position, camera position, etc.)
            if (this.planet.updateAtmosphereUniforms) {
                this.planet.updateAtmosphereUniforms(camera, sun);
            }
        }
    }
    
    dispose() {
        if (this.depthRenderTarget) {
            this.depthRenderTarget.dispose();
        }
        if (this.depthMaterial) {
            this.depthMaterial.dispose();
        }
        if (this.atmosphereMesh) {
            this.atmosphereMesh.geometry.dispose();
            this.atmosphereMesh.material.dispose();
        }
    }
}