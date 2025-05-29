import * as THREE from 'three';

/**
 * Two-pass atmosphere rendering to handle depth correctly
 * 
 * Pass 1: Render atmosphere without depth test (so it appears around planet)
 * Pass 2: Render atmosphere with depth test (so objects in front occlude it)
 */
export class AtmosphereTwoPass {
    constructor(atmosphereMesh, planetMesh) {
        this.atmosphereMesh = atmosphereMesh;
        this.planetMesh = planetMesh;
        
        // Store original material
        this.originalMaterial = atmosphereMesh.material;
        
        // Create two materials for two-pass rendering
        this.createTwoPassMaterials();
    }
    
    createTwoPassMaterials() {
        // Pass 1: No depth test - renders around planet
        this.pass1Material = this.originalMaterial.clone();
        this.pass1Material.depthTest = false;
        this.pass1Material.depthWrite = false;
        this.pass1Material.side = THREE.BackSide;
        
        // Pass 2: With depth test - respects objects in front
        this.pass2Material = this.originalMaterial.clone();
        this.pass2Material.depthTest = true;
        this.pass2Material.depthWrite = false;
        this.pass2Material.side = THREE.BackSide;
        
        // Make pass 2 slightly dimmer to avoid double brightness
        if (this.pass2Material.uniforms.uHazeIntensity) {
            this.pass2Material.uniforms.uHazeIntensity.value *= 0.5;
        }
        if (this.pass1Material.uniforms.uHazeIntensity) {
            this.pass1Material.uniforms.uHazeIntensity.value *= 0.5;
        }
    }
    
    render(renderer, scene, camera) {
        // Pass 1: Render without depth test
        this.atmosphereMesh.material = this.pass1Material;
        this.atmosphereMesh.renderOrder = 0;
        
        // Pass 2: Create second mesh for depth-tested pass
        const pass2Mesh = this.atmosphereMesh.clone();
        pass2Mesh.material = this.pass2Material;
        pass2Mesh.renderOrder = 1000; // Render after most objects
        
        // Add to scene temporarily
        scene.add(pass2Mesh);
        
        // Clean up after frame
        setTimeout(() => {
            scene.remove(pass2Mesh);
            pass2Mesh.geometry.dispose();
        }, 0);
    }
}

/**
 * Simpler solution: Use stencil buffer to mask planet area
 */
export function setupAtmosphereStencil(renderer) {
    const gl = renderer.getContext();
    
    // Enable stencil test
    renderer.state.setStencilTest(true);
    
    return {
        beginPlanetRender: () => {
            // Clear stencil buffer
            gl.clearStencil(0);
            gl.clear(gl.STENCIL_BUFFER_BIT);
            
            // Write 1s where planet renders
            renderer.state.setStencilFunc(gl.ALWAYS, 1, 0xff);
            renderer.state.setStencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        },
        
        beginAtmosphereRender: () => {
            // Only render where stencil is 0 (not planet)
            renderer.state.setStencilFunc(gl.EQUAL, 0, 0xff);
            renderer.state.setStencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        },
        
        endRender: () => {
            // Disable stencil test
            renderer.state.setStencilTest(false);
        }
    };
}

/**
 * Simplest solution: Just ensure atmosphere renders with proper settings
 */
export function fixAtmosphereAroundPlanet(atmosphereMesh) {
    if (!atmosphereMesh || !atmosphereMesh.material) return;
    
    const material = atmosphereMesh.material;
    
    // Key insight: For atmosphere to appear around planet:
    // 1. Must use BackSide (we see inside of sphere)
    // 2. Must have depthWrite: false (transparent object)
    // 3. Should have depthTest: true BUT...
    // 4. Render order must be higher than planet
    
    material.side = THREE.BackSide;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    
    // Ensure atmosphere renders after its planet
    atmosphereMesh.renderOrder = 100;
    
    material.needsUpdate = true;
}