import * as THREE from 'three';

/**
 * AtmosphereDepthFix - Fixes atmosphere rendering over all 3D objects
 * 
 * The core issue is that atmospheres use depthTest: false and additive blending,
 * which causes them to render over everything. This fix implements proper depth
 * testing while maintaining visual quality.
 */

export class AtmosphereDepthFix {
    /**
     * Fix the atmosphere material to properly respect depth buffer
     * @param {THREE.ShaderMaterial} material - The atmosphere material to fix
     * @param {Object} options - Configuration options
     */
    static fixAtmosphereMaterial(material, options = {}) {
        // Enable depth testing so atmosphere respects other objects
        material.depthTest = true;
        
        // Keep depth write true so atmosphere writes to depth buffer
        material.depthWrite = true;
        
        // Change from BackSide to FrontSide for proper depth sorting
        // BackSide causes issues with depth testing in some cases
        material.side = THREE.FrontSide;
        
        // Use custom blending instead of pure additive to respect depth better
        if (options.useCustomBlending) {
            material.blending = THREE.CustomBlending;
            material.blendEquation = THREE.AddEquation;
            material.blendSrc = THREE.OneFactor;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
        }
        
        // Add depth bias to prevent z-fighting with planet surface
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;
        
        return material;
    }
    
    /**
     * Create a two-pass atmosphere rendering approach
     * This renders atmosphere in two passes for better depth handling
     */
    static createTwoPassAtmosphere(planet, atmosphereConfig, shaders) {
        const meshes = [];
        
        // Pass 1: Depth-only pass (invisible but writes to depth)
        const depthOnlyGeometry = new THREE.SphereGeometry(
            planet.radius + atmosphereConfig.thickness,
            32, 24
        );
        
        const depthOnlyMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                void main() {
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                void main() {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                }
            `,
            colorWrite: false, // Don't write color
            depthWrite: true,  // Write depth
            depthTest: true,   // Test depth
            side: THREE.FrontSide
        });
        
        const depthOnlyMesh = new THREE.Mesh(depthOnlyGeometry, depthOnlyMaterial);
        depthOnlyMesh.renderOrder = -1; // Render before atmosphere
        meshes.push(depthOnlyMesh);
        
        // Pass 2: Actual atmosphere with proper depth testing
        const atmosphereMaterial = new THREE.ShaderMaterial({
            uniforms: shaders.uniforms || {},
            vertexShader: shaders.vertexShader,
            fragmentShader: shaders.fragmentShader,
            side: THREE.FrontSide,
            transparent: true,
            depthWrite: false, // Don't write depth in color pass
            depthTest: true,   // But do test depth
            blending: THREE.AdditiveBlending
        });
        
        const atmosphereGeometry = new THREE.SphereGeometry(
            planet.radius + atmosphereConfig.thickness * 1.01, // Slightly larger to avoid z-fighting
            32, 24
        );
        
        const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        meshes.push(atmosphereMesh);
        
        return meshes;
    }
    
    /**
     * Enhanced fragment shader that properly handles depth
     */
    static createDepthAwareFragmentShader(originalShader) {
        // Add depth-aware alpha modulation
        const depthAwareCode = `
// Depth-aware alpha modulation
float depthFade = 1.0;
#ifdef USE_LOGDEPTHBUF
    // Handle logarithmic depth buffer
    float fragDepth = gl_FragCoord.z;
#else
    float fragDepth = gl_FragCoord.z / gl_FragCoord.w;
#endif

// Fade out atmosphere when it would render over closer objects
// This is a safeguard in case depth testing isn't sufficient
if (fragDepth > 0.9999) {
    depthFade = 0.0;
}
`;
        
        // Insert before final color output
        const modifiedShader = originalShader.replace(
            'gl_FragColor = vec4(accumulatedColor, 1.0 - meanTrans);',
            `${depthAwareCode}
    float finalAlpha = (1.0 - meanTrans) * depthFade;
    gl_FragColor = vec4(accumulatedColor, finalAlpha);`
        );
        
        return modifiedShader;
    }
    
    /**
     * Apply immediate fix to existing atmosphere mesh
     */
    static applyQuickFix(atmosphereMesh) {
        if (!atmosphereMesh || !atmosphereMesh.material) return;
        
        const material = atmosphereMesh.material;
        
        // Enable depth testing
        material.depthTest = true;
        
        // Switch to front side rendering
        material.side = THREE.FrontSide;
        
        // Add polygon offset to prevent z-fighting
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;
        
        // Ensure proper render order
        atmosphereMesh.renderOrder = 1;
        
        // Update material
        material.needsUpdate = true;
    }
}

// Export a simple fix function that can be called immediately
export function fixAtmosphereDepth(planet) {
    if (planet.atmosphereComponent && planet.atmosphereComponent.mesh) {
        AtmosphereDepthFix.applyQuickFix(planet.atmosphereComponent.mesh);
    }
    if (planet.atmosphereMesh) {
        AtmosphereDepthFix.applyQuickFix(planet.atmosphereMesh);
    }
}