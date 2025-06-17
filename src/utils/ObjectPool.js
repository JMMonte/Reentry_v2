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
            matrix4: [],
            arrays: new Map(), // size -> arrays[]
            float32Arrays: new Map() // size -> Float32Array[]
        };
        
        // Initialize stats
        this.stats = {
            vector3: { borrowed: 0, returned: 0, expanded: 0 },
            quaternion: { borrowed: 0, returned: 0, expanded: 0 },
            matrix4: { borrowed: 0, returned: 0, expanded: 0 },
            arrays: { borrowed: 0, returned: 0, expanded: 0 },
            float32Arrays: { borrowed: 0, returned: 0, expanded: 0 }
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
     * Get an array from the pool
     */
    getArray(size = 0) {
        if (!this.pools.arrays.has(size)) {
            this.pools.arrays.set(size, []);
        }
        const pool = this.pools.arrays.get(size);
        if (pool.length === 0) {
            // Create new arrays when pool is empty
            for (let i = 0; i < 5; i++) {
                pool.push(new Array(size));
            }
        }
        this.stats.arrays.borrowed++;
        const arr = pool.pop();
        arr.length = 0; // Clear the array
        return arr;
    }

    /**
     * Get a Float32Array from the pool
     */
    getFloat32Array(size) {
        if (!this.pools.float32Arrays.has(size)) {
            this.pools.float32Arrays.set(size, []);
        }
        const pool = this.pools.float32Arrays.get(size);
        if (pool.length === 0) {
            // Create new typed arrays when pool is empty
            for (let i = 0; i < 3; i++) {
                pool.push(new Float32Array(size));
            }
        }
        this.stats.float32Arrays.borrowed++;
        const arr = pool.pop();
        arr.fill(0); // Clear the array
        return arr;
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
     * Return an array to the pool
     */
    releaseArray(arr) {
        if (Array.isArray(arr)) {
            const size = arr.length;
            arr.length = 0; // Clear the array
            if (!this.pools.arrays.has(size)) {
                this.pools.arrays.set(size, []);
            }
            this.pools.arrays.get(size).push(arr);
            this.stats.arrays.returned++;
        }
    }

    /**
     * Return a Float32Array to the pool
     */
    releaseFloat32Array(arr) {
        if (arr instanceof Float32Array) {
            const size = arr.length;
            arr.fill(0); // Clear the array
            if (!this.pools.float32Arrays.has(size)) {
                this.pools.float32Arrays.set(size, []);
            }
            this.pools.float32Arrays.get(size).push(arr);
            this.stats.float32Arrays.returned++;
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
     * Execute a function with a temporary array
     * Automatically returns the array to the pool
     */
    withArray(size, fn) {
        const arr = this.getArray(size);
        try {
            return fn(arr);
        } finally {
            this.releaseArray(arr);
        }
    }

    /**
     * Execute a function with a temporary Float32Array
     * Automatically returns the array to the pool
     */
    withFloat32Array(size, fn) {
        const arr = this.getFloat32Array(size);
        try {
            return fn(arr);
        } finally {
            this.releaseFloat32Array(arr);
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
            },
            arrays: {
                ...this.stats.arrays,
                poolSizes: Array.from(this.pools.arrays.entries()).map(([size, pool]) => ({size, count: pool.length}))
            },
            float32Arrays: {
                ...this.stats.float32Arrays,
                poolSizes: Array.from(this.pools.float32Arrays.entries()).map(([size, pool]) => ({size, count: pool.length}))
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
        this.pools.arrays.clear();
        this.pools.float32Arrays.clear();
    }
}

// Global singleton instance
export const objectPool = new ObjectPool();

// Convenience exports
export const withVector3 = objectPool.withVector3.bind(objectPool);
export const withVector3s = objectPool.withVector3s.bind(objectPool);
export const withArray = objectPool.withArray.bind(objectPool);
export const withFloat32Array = objectPool.withFloat32Array.bind(objectPool);