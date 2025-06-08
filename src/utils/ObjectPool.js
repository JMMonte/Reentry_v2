import { Vector3, Quaternion, Matrix4 } from 'three';

/**
 * High-performance object pooling for Three.js objects to reduce GC pressure
 * Eliminates thousands of object allocations per second in render loops
 */
class ObjectPool {
    constructor() {
        // Initialize pools first
        this.pools = {
            vector3: [],
            quaternion: [],
            matrix4: []
        };
        
        // Initialize stats
        this.stats = {
            vector3: { borrowed: 0, returned: 0, expanded: 0 },
            quaternion: { borrowed: 0, returned: 0, expanded: 0 },
            matrix4: { borrowed: 0, returned: 0, expanded: 0 }
        };
        
        // Pre-allocate pools after initialization
        this.expandPool('vector3', 100);
        this.expandPool('quaternion', 50);
        this.expandPool('matrix4', 20);
    }
    
    /**
     * Expand a specific pool
     */
    expandPool(type, count) {
        const pool = this.pools[type];
        for (let i = 0; i < count; i++) {
            switch (type) {
                case 'vector3':
                    pool.push(new Vector3());
                    break;
                case 'quaternion':
                    pool.push(new Quaternion());
                    break;
                case 'matrix4':
                    pool.push(new Matrix4());
                    break;
            }
        }
        this.stats[type].expanded++;
    }
    
    /**
     * Get a Vector3 from the pool
     */
    getVector3() {
        if (this.pools.vector3.length === 0) {
            this.expandPool('vector3', 20);
        }
        this.stats.vector3.borrowed++;
        return this.pools.vector3.pop();
    }
    
    /**
     * Get a Quaternion from the pool
     */
    getQuaternion() {
        if (this.pools.quaternion.length === 0) {
            this.expandPool('quaternion', 10);
        }
        this.stats.quaternion.borrowed++;
        return this.pools.quaternion.pop();
    }
    
    /**
     * Get a Matrix4 from the pool
     */
    getMatrix4() {
        if (this.pools.matrix4.length === 0) {
            this.expandPool('matrix4', 5);
        }
        this.stats.matrix4.borrowed++;
        return this.pools.matrix4.pop();
    }
    
    /**
     * Return a Vector3 to the pool
     */
    releaseVector3(vec) {
        if (vec && vec.isVector3) {
            vec.set(0, 0, 0); // Reset to avoid stale data
            this.pools.vector3.push(vec);
            this.stats.vector3.returned++;
        }
    }
    
    /**
     * Return a Quaternion to the pool
     */
    releaseQuaternion(quat) {
        if (quat && quat.isQuaternion) {
            quat.identity(); // Reset to identity
            this.pools.quaternion.push(quat);
            this.stats.quaternion.returned++;
        }
    }
    
    /**
     * Return a Matrix4 to the pool
     */
    releaseMatrix4(mat) {
        if (mat && mat.isMatrix4) {
            mat.identity(); // Reset to identity
            this.pools.matrix4.push(mat);
            this.stats.matrix4.returned++;
        }
    }
    
    /**
     * Execute a function with a temporary Vector3
     * Automatically returns the vector to the pool
     */
    withVector3(fn) {
        const vec = this.getVector3();
        try {
            return fn(vec);
        } finally {
            this.releaseVector3(vec);
        }
    }
    
    /**
     * Execute a function with multiple temporary Vector3s
     * Automatically returns all vectors to the pool
     */
    withVector3s(count, fn) {
        const vecs = [];
        for (let i = 0; i < count; i++) {
            vecs.push(this.getVector3());
        }
        try {
            return fn(...vecs);
        } finally {
            vecs.forEach(vec => this.releaseVector3(vec));
        }
    }
    
    /**
     * Get pool statistics for debugging
     */
    getStats() {
        return {
            vector3: {
                ...this.stats.vector3,
                poolSize: this.pools.vector3.length
            },
            quaternion: {
                ...this.stats.quaternion,
                poolSize: this.pools.quaternion.length
            },
            matrix4: {
                ...this.stats.matrix4,
                poolSize: this.pools.matrix4.length
            }
        };
    }
    
    /**
     * Clear all pools (for cleanup)
     */
    clear() {
        this.pools.vector3 = [];
        this.pools.quaternion = [];
        this.pools.matrix4 = [];
    }
}

// Global singleton instance
export const objectPool = new ObjectPool();

// Convenience exports
export const withVector3 = objectPool.withVector3.bind(objectPool);
export const withVector3s = objectPool.withVector3s.bind(objectPool);