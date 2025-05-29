import * as THREE from 'three';
import { RENDER_ORDER } from './Planet.js';
import { AtmosphereComponent } from './AtmosphereComponent.js';
import { AtmosphereLocalDepth } from './AtmosphereLocalDepth.js';

/**
 * AtmosphereEnhanced - Wrapper that decides between standard and local-depth atmospheres
 * 
 * This component creates either a standard atmosphere or an enhanced one with local
 * depth mapping based on configuration and scene requirements.
 */
export class AtmosphereEnhanced {
    constructor(planet, config, shaders, options = {}) {
        this.planet = planet;
        this.config = config;
        this.shaders = shaders;
        this.options = options;
        
        // Determine if we should use local depth mapping
        this.useLocalDepth = this.shouldUseLocalDepth();
        
        // Create appropriate atmosphere component
        if (this.useLocalDepth) {
            this.component = new AtmosphereLocalDepth(planet, config.atmosphere, {
                vertexShader: shaders.vertexShader || this.loadShader('atmosphereLocalDepth.vert'),
                fragmentShader: shaders.fragmentShader || this.loadShader('atmosphereLocalDepth.frag')
            });
            this.mesh = this.component.createAtmosphereMesh(planet.mesh);
            
            // Add to planet's rotation group
            if (this.mesh) {
                planet.rotationGroup.add(this.mesh);
            }
        } else {
            // Use standard atmosphere component
            this.component = new AtmosphereComponent(planet, config, shaders);
            this.mesh = this.component.mesh;
        }
    }
    
    shouldUseLocalDepth() {
        // Decision logic for when to use local depth mapping
        const atmosphere = this.config.atmosphere;
        if (!atmosphere) return false;
        
        // Use local depth if:
        // 1. Explicitly enabled in config
        if (atmosphere.useLocalDepth === true) return true;
        
        // 2. Multiple planets visible (handled by scene manager)
        if (this.options.multiplePlanetsVisible) return true;
        
        // 3. Large atmosphere thickness that might overlap
        const thickness = atmosphere.thickness || 0;
        const radius = this.planet.radius || 1;
        if (thickness / radius > 0.1) return true; // More than 10% of radius
        
        // 4. Special cases (e.g., Titan with thick atmosphere)
        const specialBodies = ['Titan', 'Venus', 'Earth'];
        if (specialBodies.includes(this.config.name)) return true;
        
        return false;
    }
    
    loadShader(filename) {
        // In a real implementation, this would load from the shaders directory
        // For now, return the path that the shader loader can use
        return `/src/shaders/${filename}`;
    }
    
    update() {
        if (this.component && this.component.update) {
            this.component.update();
        }
    }
    
    updateUniforms(camera, sun) {
        if (this.component && this.component.updateUniforms) {
            this.component.updateUniforms(camera, sun);
        }
    }
    
    // Enhanced update for local depth rendering
    updateWithDepth(renderer, scene, camera, sun) {
        if (this.useLocalDepth && this.component.update) {
            this.component.update(renderer, scene, camera, sun);
        } else {
            this.updateUniforms(camera, sun);
        }
    }
    
    setMultiplePlanetsVisible(visible) {
        // Dynamic switching between standard and local depth
        if (visible !== this.options.multiplePlanetsVisible) {
            this.options.multiplePlanetsVisible = visible;
            
            // Only recreate if state actually changes
            const shouldUseLocalDepth = this.shouldUseLocalDepth();
            if (shouldUseLocalDepth !== this.useLocalDepth) {
                this.recreate();
            }
        }
    }
    
    recreate() {
        // Dispose current component
        this.dispose();
        
        // Recreate with new settings
        this.useLocalDepth = this.shouldUseLocalDepth();
        
        if (this.useLocalDepth) {
            this.component = new AtmosphereLocalDepth(this.planet, this.config.atmosphere, {
                vertexShader: this.shaders.vertexShader || this.loadShader('atmosphereLocalDepth.vert'),
                fragmentShader: this.shaders.fragmentShader || this.loadShader('atmosphereLocalDepth.frag')
            });
            this.mesh = this.component.createAtmosphereMesh(this.planet.mesh);
            
            if (this.mesh) {
                this.planet.rotationGroup.add(this.mesh);
            }
        } else {
            this.component = new AtmosphereComponent(this.planet, this.config, this.shaders);
            this.mesh = this.component.mesh;
        }
    }
    
    dispose() {
        if (this.component && this.component.dispose) {
            this.component.dispose();
        }
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        this.mesh = null;
        this.component = null;
    }
    
    // Getters for compatibility
    get visible() {
        return this.mesh ? this.mesh.visible : false;
    }
    
    set visible(value) {
        if (this.mesh) {
            this.mesh.visible = value;
        }
    }
}