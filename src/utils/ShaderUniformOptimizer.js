/**
 * ShaderUniformOptimizer.js
 * 
 * Optimizes shader uniform updates to reduce redundant GPU state changes
 */
import * as THREE from 'three';

export class ShaderUniformOptimizer {
    constructor() {
        // Cache for tracking uniform values
        this.uniformCache = new WeakMap(); // material -> { uniformName -> lastValue }
        
        // Tolerance for floating point comparisons
        this.FLOAT_TOLERANCE = 0.0001;
        this.POSITION_TOLERANCE = 0.1; // 0.1 km tolerance for positions
    }
    
    /**
     * Update a uniform only if its value has changed
     * Returns true if updated, false if skipped
     */
    updateUniform(material, uniformName, newValue) {
        if (!material?.uniforms?.[uniformName]) return false;
        
        // Get or create cache for this material
        let cache = this.uniformCache.get(material);
        if (!cache) {
            cache = {};
            this.uniformCache.set(material, cache);
        }
        
        const uniform = material.uniforms[uniformName];
        const lastValue = cache[uniformName];
        
        // Check if value changed based on type
        let hasChanged = false;
        
        if (newValue === null || newValue === undefined) {
            hasChanged = lastValue !== newValue;
        } else if (typeof newValue === 'number') {
            hasChanged = Math.abs(newValue - (lastValue || 0)) > this.FLOAT_TOLERANCE;
        } else if (newValue.isVector3) {
            hasChanged = !lastValue || 
                         lastValue.distanceToSquared(newValue) > this.POSITION_TOLERANCE * this.POSITION_TOLERANCE;
        } else if (newValue.isVector2 || newValue.isVector4) {
            hasChanged = !lastValue || !lastValue.equals(newValue);
        } else if (newValue.isMatrix3 || newValue.isMatrix4) {
            hasChanged = !lastValue || !lastValue.equals(newValue);
        } else if (newValue.isColor) {
            hasChanged = !lastValue || lastValue.getHex() !== newValue.getHex();
        } else {
            // For other types, always update
            hasChanged = true;
        }
        
        // Update if changed
        if (hasChanged) {
            uniform.value = newValue;
            
            // Cache the new value (clone if it's an object)
            if (newValue && typeof newValue.clone === 'function') {
                cache[uniformName] = newValue.clone();
            } else {
                cache[uniformName] = newValue;
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Batch update multiple uniforms
     * Returns number of uniforms actually updated
     */
    updateUniforms(material, updates) {
        let updatedCount = 0;
        
        for (const [uniformName, value] of Object.entries(updates)) {
            if (this.updateUniform(material, uniformName, value)) {
                updatedCount++;
            }
        }
        
        return updatedCount;
    }
    
    /**
     * Update atmosphere uniforms with optimization
     */
    updateAtmosphereUniforms(atmosphereMesh, camera, sun, planet) {
        if (!atmosphereMesh?.material?.uniforms) return 0;
        
        const material = atmosphereMesh.material;
        let updatedCount = 0;
        
        // Calculate values
        const viewPos = camera.position;
        const sunPos = sun ? sun.position : new THREE.Vector3(1, 0, 0).normalize().multiplyScalar(1e8);
        const planetPos = planet ? planet.position : atmosphereMesh.position;
        
        // Batch update uniforms
        const updates = {
            uViewPos: viewPos,
            uSunPos: sunPos,
            uPlanetPos: planetPos
        };
        
        updatedCount = this.updateUniforms(material, updates);
        
        return updatedCount;
    }
    
    /**
     * Clear cache for a material (useful when material is disposed)
     */
    clearCache(material) {
        this.uniformCache.delete(material);
    }
    
    /**
     * Get cache statistics for debugging
     */
    getCacheStats() {
        let materialCount = 0;
        let uniformCount = 0;
        
        // WeakMap doesn't have size property, so we can't get exact stats
        // This is just for debugging purposes
        return {
            message: 'ShaderUniformOptimizer cache active',
            hint: 'Cache uses WeakMap for automatic memory management'
        };
    }
}

// Singleton instance
export const shaderOptimizer = new ShaderUniformOptimizer();