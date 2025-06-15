import { MathUtils } from './MathUtils.js';

/**
 * PhysicsVector3 - Pure mathematical 3D vector implementation
 * 
 * This class provides all necessary vector operations for physics calculations
 * without any dependency on Three.js or other rendering libraries.
 * 
 * Use this instead of THREE.Vector3 in all physics-related code.
 */
export class PhysicsVector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Create from array [x, y, z]
     */
    static fromArray(array) {
        return new PhysicsVector3(array[0] || 0, array[1] || 0, array[2] || 0);
    }

    /**
     * Create from object {x, y, z}
     */
    static fromObject(obj) {
        return new PhysicsVector3(obj.x || 0, obj.y || 0, obj.z || 0);
    }

    /**
     * Create zero vector
     */
    static zero() {
        return new PhysicsVector3(0, 0, 0);
    }

    /**
     * Create unit vectors
     */
    static unitX() { return new PhysicsVector3(1, 0, 0); }
    static unitY() { return new PhysicsVector3(0, 1, 0); }
    static unitZ() { return new PhysicsVector3(0, 0, 1); }

    /**
     * Set vector components
     */
    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    /**
     * Copy from another vector
     */
    copy(vector) {
        this.x = vector.x;
        this.y = vector.y;
        this.z = vector.z;
        return this;
    }

    /**
     * Clone this vector
     */
    clone() {
        return new PhysicsVector3(this.x, this.y, this.z);
    }

    /**
     * Add another vector
     */
    add(vector) {
        this.x += vector.x;
        this.y += vector.y;
        this.z += vector.z;
        return this;
    }

    /**
     * Add vectors and return new vector
     */
    static add(a, b) {
        return new PhysicsVector3(a.x + b.x, a.y + b.y, a.z + b.z);
    }

    /**
     * Subtract another vector
     */
    sub(vector) {
        this.x -= vector.x;
        this.y -= vector.y;
        this.z -= vector.z;
        return this;
    }

    /**
     * Subtract vectors and return new vector
     */
    static sub(a, b) {
        return new PhysicsVector3(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    /**
     * Multiply by scalar
     */
    multiplyScalar(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        return this;
    }

    /**
     * Divide by scalar
     */
    divideScalar(scalar) {
        if (scalar === 0) {
            this.x = 0;
            this.y = 0;
            this.z = 0;
        } else {
            this.x /= scalar;
            this.y /= scalar;
            this.z /= scalar;
        }
        return this;
    }

    /**
     * Calculate dot product
     */
    dot(vector) {
        return this.x * vector.x + this.y * vector.y + this.z * vector.z;
    }

    /**
     * Calculate cross product
     */
    cross(vector) {
        const x = this.y * vector.z - this.z * vector.y;
        const y = this.z * vector.x - this.x * vector.z;
        const z = this.x * vector.y - this.y * vector.x;
        
        this.x = x;
        this.y = y;
        this.z = z;
        
        return this;
    }

    /**
     * Set this vector to the cross product of two vectors
     */
    crossVectors(a, b) {
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;

        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;

        return this;
    }

    /**
     * Static cross product
     */
    static cross(a, b) {
        return new PhysicsVector3().crossVectors(a, b);
    }

    /**
     * Calculate length/magnitude
     */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    /**
     * Calculate squared length (faster than length())
     */
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /**
     * Normalize vector (make unit length)
     */
    normalize() {
        const length = this.length();
        if (length === 0) {
            this.x = 0;
            this.y = 0;
            this.z = 0;
        } else {
            this.divideScalar(length);
        }
        return this;
    }

    /**
     * Get normalized copy
     */
    normalized() {
        return this.clone().normalize();
    }

    /**
     * Set length
     */
    setLength(length) {
        return this.normalize().multiplyScalar(length);
    }

    /**
     * Calculate distance to another vector
     */
    distanceTo(vector) {
        const dx = this.x - vector.x;
        const dy = this.y - vector.y;
        const dz = this.z - vector.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate squared distance to another vector
     */
    distanceToSquared(vector) {
        const dx = this.x - vector.x;
        const dy = this.y - vector.y;
        const dz = this.z - vector.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Negate vector
     */
    negate() {
        this.x = -this.x;
        this.y = -this.y;
        this.z = -this.z;
        return this;
    }

    /**
     * Apply quaternion rotation
     */
    applyQuaternion(quaternion) {
        // q * v * q_conjugate
        const qx = quaternion.x;
        const qy = quaternion.y;
        const qz = quaternion.z;
        const qw = quaternion.w;

        const vx = this.x;
        const vy = this.y;
        const vz = this.z;

        // Calculate q * v
        const wx = qw * vx + qy * vz - qz * vy;
        const wy = qw * vy + qz * vx - qx * vz;
        const wz = qw * vz + qx * vy - qy * vx;
        const ww = -qx * vx - qy * vy - qz * vz;

        // Calculate (q * v) * q_conjugate
        this.x = wx * qw + ww * -qx + wy * -qz - wz * -qy;
        this.y = wy * qw + ww * -qy + wz * -qx - wx * -qz;
        this.z = wz * qw + ww * -qz + wx * -qy - wy * -qx;

        return this;
    }

    /**
     * Apply axis-angle rotation
     */
    applyAxisAngle(axis, angle) {
        // Convert to quaternion and apply
        const halfAngle = angle * 0.5;
        const s = Math.sin(halfAngle);
        const quaternion = {
            x: axis.x * s,
            y: axis.y * s,
            z: axis.z * s,
            w: Math.cos(halfAngle)
        };
        return this.applyQuaternion(quaternion);
    }

    /**
     * Linear interpolation
     */
    lerp(vector, alpha) {
        this.x += (vector.x - this.x) * alpha;
        this.y += (vector.y - this.y) * alpha;
        this.z += (vector.z - this.z) * alpha;
        return this;
    }

    /**
     * Check equality with tolerance
     */
    equals(vector, tolerance = 1e-10) {
        return (
            Math.abs(this.x - vector.x) < tolerance &&
            Math.abs(this.y - vector.y) < tolerance &&
            Math.abs(this.z - vector.z) < tolerance
        );
    }

    /**
     * Convert to array [x, y, z]
     */
    toArray() {
        return [this.x, this.y, this.z];
    }

    /**
     * Convert to object {x, y, z}
     */
    toObject() {
        return { x: this.x, y: this.y, z: this.z };
    }

    /**
     * String representation
     */
    toString() {
        return `PhysicsVector3(${this.x}, ${this.y}, ${this.z})`;
    }

    /**
     * Check if vector is finite
     */
    isFinite() {
        return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
    }

    /**
     * Clamp vector components to range
     */
    clamp(min, max) {
        this.x = MathUtils.clamp(this.x, min.x, max.x);
        this.y = MathUtils.clamp(this.y, min.y, max.y);
        this.z = MathUtils.clamp(this.z, min.z, max.z);
        return this;
    }

    /**
     * Floor vector components
     */
    floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        this.z = Math.floor(this.z);
        return this;
    }

    /**
     * Ceil vector components
     */
    ceil() {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        this.z = Math.ceil(this.z);
        return this;
    }

    /**
     * Round vector components
     */
    round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        this.z = Math.round(this.z);
        return this;
    }

    /**
     * Get min component
     */
    getMinComponent() {
        return Math.min(this.x, this.y, this.z);
    }

    /**
     * Get max component
     */
    getMaxComponent() {
        return Math.max(this.x, this.y, this.z);
    }

    /**
     * Add a scaled vector to this vector
     * @param {PhysicsVector3} vector - Vector to scale and add
     * @param {number} scalar - Scale factor
     * @returns {PhysicsVector3} This vector for chaining
     */
    addScaledVector(vector, scalar) {
        this.x += vector.x * scalar;
        this.y += vector.y * scalar;
        this.z += vector.z * scalar;
        return this;
    }

    /**
     * Project this vector onto another vector
     * @param {PhysicsVector3} vector - Vector to project onto
     * @returns {PhysicsVector3} This vector for chaining
     */
    projectOnVector(vector) {
        const denominator = vector.lengthSq();
        if (denominator === 0) {
            return this.set(0, 0, 0);
        }
        const scalar = vector.dot(this) / denominator;
        return this.copy(vector).multiplyScalar(scalar);
    }

    /**
     * Subtract a vector from this vector
     * @param {PhysicsVector3} vector - Vector to subtract
     * @returns {PhysicsVector3} This vector for chaining
     */
    subScaledVector(vector) {
        this.x -= vector.x;
        this.y -= vector.y;
        this.z -= vector.z;
        return this;
    }
}

// Common vector constants
PhysicsVector3.ZERO = new PhysicsVector3(0, 0, 0);
PhysicsVector3.ONE = new PhysicsVector3(1, 1, 1);
PhysicsVector3.UNIT_X = new PhysicsVector3(1, 0, 0);
PhysicsVector3.UNIT_Y = new PhysicsVector3(0, 1, 0);
PhysicsVector3.UNIT_Z = new PhysicsVector3(0, 0, 1); 