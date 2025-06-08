/**
 * OrbitVisualizationOptimizer.js
 * 
 * Performance optimizations for orbit rendering
 */
import * as THREE from 'three';

export class OrbitVisualizationOptimizer {
    constructor() {
        // Pre-allocated geometry pool for different point counts
        this.geometryPool = new Map(); // key: pointCount -> geometry
        this.maxPoolSize = 50;
        
        // LOD thresholds
        this.LOD_THRESHOLDS = {
            HIGH: 1000,    // < 1000 km: full detail
            MEDIUM: 10000, // < 10000 km: half detail
            LOW: 100000    // < 100000 km: quarter detail
        };
    }
    
    /**
     * Get or create a pooled geometry with specified capacity
     */
    getPooledGeometry(requiredPoints) {
        // Round up to nearest power of 2 for better reuse
        const capacity = Math.pow(2, Math.ceil(Math.log2(requiredPoints)));
        
        let geometry = this.geometryPool.get(capacity);
        if (!geometry) {
            // Create new geometry with extra capacity
            geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(capacity * 3);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setDrawRange(0, 0); // Start with nothing drawn
            
            // Limit pool size
            if (this.geometryPool.size >= this.maxPoolSize) {
                const firstKey = this.geometryPool.keys().next().value;
                const oldGeometry = this.geometryPool.get(firstKey);
                oldGeometry.dispose();
                this.geometryPool.delete(firstKey);
            }
            
            this.geometryPool.set(capacity, geometry);
        }
        
        return geometry;
    }
    
    /**
     * Update geometry buffer efficiently without reallocation
     */
    updateGeometryBuffer(geometry, points, lod = 1.0) {
        const positions = geometry.getAttribute('position');
        const posArray = positions.array;
        
        // Apply LOD by skipping points
        const step = Math.max(1, Math.floor(1 / lod));
        let writeIndex = 0;
        
        for (let i = 0; i < points.length; i += step) {
            const point = points[i];
            const idx = writeIndex * 3;
            posArray[idx] = point.position[0];
            posArray[idx + 1] = point.position[1];
            posArray[idx + 2] = point.position[2];
            writeIndex++;
        }
        
        // Update only the range we wrote
        positions.needsUpdate = true;
        geometry.setDrawRange(0, writeIndex);
        
        // Only recompute bounding sphere if size changed significantly
        if (Math.abs(geometry.drawRange.count - writeIndex) > 10) {
            geometry.computeBoundingSphere();
        }
        
        return writeIndex;
    }
    
    /**
     * Calculate LOD based on camera distance
     */
    calculateLOD(objectPosition, cameraPosition) {
        const distance = objectPosition.distanceTo(cameraPosition);
        
        if (distance < this.LOD_THRESHOLDS.HIGH) {
            return 1.0; // Full detail
        } else if (distance < this.LOD_THRESHOLDS.MEDIUM) {
            return 0.5; // Half detail
        } else if (distance < this.LOD_THRESHOLDS.LOW) {
            return 0.25; // Quarter detail
        } else {
            return 0.1; // Minimal detail for very distant objects
        }
    }
    
    /**
     * Check if orbit is in camera frustum
     */
    isOrbitInFrustum(line, camera, frustum) {
        if (!frustum) {
            frustum = new THREE.Frustum();
            frustum.setFromProjectionMatrix(
                new THREE.Matrix4().multiplyMatrices(
                    camera.projectionMatrix,
                    camera.matrixWorldInverse
                )
            );
        }
        
        // Use bounding sphere for fast culling
        if (line.geometry.boundingSphere) {
            return frustum.intersectsSphere(line.geometry.boundingSphere);
        }
        
        return true; // Default to visible if no bounding sphere
    }
    
    /**
     * Optimize material updates
     */
    updateMaterialIfChanged(material, newOpacity, newColor) {
        let changed = false;
        
        if (Math.abs(material.opacity - newOpacity) > 0.01) {
            material.opacity = newOpacity;
            changed = true;
        }
        
        if (material.color.getHex() !== newColor) {
            material.color.setHex(newColor);
            changed = true;
        }
        
        return changed;
    }
    
    /**
     * Batch geometry updates
     */
    batchGeometryUpdates(updates) {
        // Sort updates by geometry to minimize state changes
        updates.sort((a, b) => a.geometry.id - b.geometry.id);
        
        // Process in batches
        for (const update of updates) {
            this.updateGeometryBuffer(
                update.geometry,
                update.points,
                update.lod
            );
        }
    }
    
    /**
     * Clean up unused resources
     */
    dispose() {
        for (const geometry of this.geometryPool.values()) {
            geometry.dispose();
        }
        this.geometryPool.clear();
    }
}

// Singleton instance
export const orbitOptimizer = new OrbitVisualizationOptimizer();