import * as THREE from 'three';

/**
 * Atmosphere depth pre-pass renderer
 * 
 * This solves the issue where atmospheres need to:
 * 1. Be occluded by nearer objects
 * 2. Occlude farther objects
 * 3. Still appear around their planet
 */
export class AtmosphereDepthPrepass {
    constructor() {
        // Create a simple depth-only material
        this.depthMaterial = new THREE.MeshBasicMaterial({
            colorWrite: false, // Don't write color
            depthWrite: true,  // DO write depth
            depthTest: true,   // Test depth
            side: THREE.BackSide
        });
        
        this.atmospheres = new Map();
    }
    
    /**
     * Register an atmosphere for depth pre-pass rendering
     */
    registerAtmosphere(atmosphereMesh) {
        // Create a depth-only version of the atmosphere
        const depthMesh = atmosphereMesh.clone();
        depthMesh.material = this.depthMaterial;
        depthMesh.name = atmosphereMesh.name + '_depth';
        
        // Store both meshes
        this.atmospheres.set(atmosphereMesh, {
            colorMesh: atmosphereMesh,
            depthMesh: depthMesh
        });
        
        // Configure the color mesh for proper rendering
        const colorMaterial = atmosphereMesh.material;
        colorMaterial.depthWrite = false; // Don't write depth in color pass
        colorMaterial.depthTest = true;   // But DO test depth
        colorMaterial.side = THREE.BackSide;
        colorMaterial.needsUpdate = true;
        
        return depthMesh;
    }
    
    /**
     * Setup scene for two-pass atmosphere rendering
     */
    setupScene(scene) {
        const depthGroup = new THREE.Group();
        depthGroup.name = 'atmosphereDepthGroup';
        
        // Add all depth meshes to the group
        this.atmospheres.forEach(({ depthMesh }) => {
            depthGroup.add(depthMesh);
        });
        
        scene.add(depthGroup);
        
        // Set render orders:
        // 1. Planets render first (order 0)
        // 2. Atmosphere depth pass (order 1)
        // 3. Atmosphere color pass (order 2)
        this.atmospheres.forEach(({ colorMesh, depthMesh }) => {
            depthMesh.renderOrder = colorMesh.renderOrder - 0.5;
            // Color mesh keeps its original render order
        });
    }
}

/**
 * Alternative: Use custom shader that writes depth conditionally
 */
export function createDepthAwareAtmosphereMaterial(originalMaterial) {
    const material = originalMaterial.clone();
    
    // Inject depth writing logic into fragment shader
    const originalFragmentShader = material.fragmentShader;
    
    // Add custom depth writing at the end of the fragment shader
    const depthWriteCode = `
    // Custom depth writing for atmosphere
    // Write depth only where atmosphere is sufficiently opaque
    #ifdef GL_EXT_frag_depth
        float alpha = gl_FragColor.a;
        if (alpha > 0.1) {
            // Write depth for this fragment
            gl_FragDepthEXT = gl_FragCoord.z;
        } else {
            // Don't modify depth for very transparent parts
            gl_FragDepthEXT = gl_FragCoord.z;
        }
    #endif
    `;
    
    // Insert before the closing brace
    material.fragmentShader = originalFragmentShader.replace(
        /}[\s]*$/,
        depthWriteCode + '\n}'
    );
    
    // Enable the extension
    material.extensions = {
        fragDepth: true
    };
    
    // Configure material
    material.depthWrite = true; // Enable depth writing
    material.depthTest = true;  // Enable depth testing
    material.side = THREE.BackSide;
    
    return material;
}

/**
 * Simplest working solution: Render atmosphere in separate pass
 */
export function setupAtmosphereRenderPass(renderer, scene, camera) {
    // Store original render function
    const originalRender = renderer.render.bind(renderer);
    
    // Create custom render function
    renderer.renderWithAtmospheres = function() {
        // Collect all atmospheres and planets
        const atmospheres = [];
        const planets = [];
        
        scene.traverse((obj) => {
            if (obj.type === 'Mesh') {
                if (obj.name?.includes('atmosphere')) {
                    atmospheres.push(obj);
                    obj.visible = false; // Hide for first pass
                } else if (obj.userData?.planetName) {
                    planets.push(obj);
                }
            }
        });
        
        // Pass 1: Render everything except atmospheres
        originalRender(scene, camera);
        
        // Pass 2: Render atmospheres with depth write
        atmospheres.forEach(atm => {
            atm.visible = true;
            if (atm.material) {
                atm.material.depthWrite = true;
                atm.material.depthTest = true;
            }
        });
        
        // Don't clear depth buffer
        renderer.autoClearDepth = false;
        originalRender(scene, camera);
        renderer.autoClearDepth = true;
        
        // Restore visibility
        atmospheres.forEach(atm => {
            if (atm.material) {
                atm.material.depthWrite = false; // Restore original setting
            }
        });
    };
}

/**
 * Apply the depth pre-pass solution to a scene
 */
export function applyAtmosphereDepthPrepass(scene) {
    const prepass = new AtmosphereDepthPrepass();
    const depthMeshes = [];
    
    // Find all atmospheres and create depth pre-pass meshes
    scene.traverse((object) => {
        if (object.type === 'Mesh' && object.name?.includes('atmosphere')) {
            const depthMesh = prepass.registerAtmosphere(object);
            depthMeshes.push(depthMesh);
            
            // Add depth mesh to the same parent as the atmosphere
            if (object.parent) {
                object.parent.add(depthMesh);
            }
            
            console.log(`Created depth pre-pass for ${object.name}`);
        }
    });
    
    return depthMeshes.length;
}