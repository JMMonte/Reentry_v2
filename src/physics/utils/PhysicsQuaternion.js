import { MathUtils } from './MathUtils.js';

/**
 * PhysicsQuaternion - Pure mathematical quaternion implementation
 * 
 * This class provides all necessary quaternion operations for physics calculations
 * without any dependency on Three.js or other rendering libraries.
 * 
 * Use this instead of THREE.Quaternion in all physics-related code.
 */
export class PhysicsQuaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }

    /**
     * Create from array [x, y, z, w]
     */
    static fromArray(array) {
        return new PhysicsQuaternion(
            array[0] || 0,
            array[1] || 0,
            array[2] || 0,
            array[3] !== undefined ? array[3] : 1
        );
    }

    /**
     * Create from object {x, y, z, w}
     */
    static fromObject(obj) {
        return new PhysicsQuaternion(
            obj.x || 0,
            obj.y || 0,
            obj.z || 0,
            obj.w !== undefined ? obj.w : 1
        );
    }

    /**
     * Create identity quaternion
     */
    static identity() {
        return new PhysicsQuaternion(0, 0, 0, 1);
    }

    /**
     * Create from axis-angle rotation
     * @param {Object} axis - Rotation axis (should be normalized) {x, y, z}
     * @param {number} angle - Rotation angle in radians
     */
    static fromAxisAngle(axis, angle) {
        const halfAngle = angle * 0.5;
        const s = Math.sin(halfAngle);
        return new PhysicsQuaternion(
            axis.x * s,
            axis.y * s,
            axis.z * s,
            Math.cos(halfAngle)
        );
    }

    /**
     * Create from Euler angles (in radians)
     * Order: XYZ
     */
    static fromEuler(x, y, z) {
        const c1 = Math.cos(x / 2);
        const c2 = Math.cos(y / 2);
        const c3 = Math.cos(z / 2);
        const s1 = Math.sin(x / 2);
        const s2 = Math.sin(y / 2);
        const s3 = Math.sin(z / 2);

        return new PhysicsQuaternion(
            s1 * c2 * c3 + c1 * s2 * s3,
            c1 * s2 * c3 - s1 * c2 * s3,
            c1 * c2 * s3 + s1 * s2 * c3,
            c1 * c2 * c3 - s1 * s2 * s3
        );
    }

    /**
     * Create from rotation matrix (3x3)
     */
    static fromRotationMatrix(matrix) {
        // matrix is array of 9 elements [m00, m01, m02, m10, m11, m12, m20, m21, m22]
        const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = matrix;
        
        const trace = m00 + m11 + m22;
        let x, y, z, w;

        if (trace > 0) {
            const s = Math.sqrt(trace + 1.0) * 2;
            w = 0.25 * s;
            x = (m21 - m12) / s;
            y = (m02 - m20) / s;
            z = (m10 - m01) / s;
        } else if (m00 > m11 && m00 > m22) {
            const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
            w = (m21 - m12) / s;
            x = 0.25 * s;
            y = (m01 + m10) / s;
            z = (m02 + m20) / s;
        } else if (m11 > m22) {
            const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
            w = (m02 - m20) / s;
            x = (m01 + m10) / s;
            y = 0.25 * s;
            z = (m12 + m21) / s;
        } else {
            const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
            w = (m10 - m01) / s;
            x = (m02 + m20) / s;
            y = (m12 + m21) / s;
            z = 0.25 * s;
        }

        return new PhysicsQuaternion(x, y, z, w);
    }

    /**
     * Set quaternion components
     */
    set(x, y, z, w) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        return this;
    }

    /**
     * Copy from another quaternion
     */
    copy(quaternion) {
        this.x = quaternion.x;
        this.y = quaternion.y;
        this.z = quaternion.z;
        this.w = quaternion.w;
        return this;
    }

    /**
     * Clone this quaternion
     */
    clone() {
        return new PhysicsQuaternion(this.x, this.y, this.z, this.w);
    }

    /**
     * Set to identity
     */
    identity() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.w = 1;
        return this;
    }

    /**
     * Calculate length/magnitude
     */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    }

    /**
     * Calculate squared length
     */
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    }

    /**
     * Normalize quaternion
     */
    normalize() {
        const length = this.length();
        if (length === 0) {
            this.x = 0;
            this.y = 0;
            this.z = 0;
            this.w = 1;
        } else {
            this.x /= length;
            this.y /= length;
            this.z /= length;
            this.w /= length;
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
     * Calculate conjugate
     */
    conjugate() {
        this.x *= -1;
        this.y *= -1;
        this.z *= -1;
        return this;
    }

    /**
     * Get conjugate copy
     */
    getConjugate() {
        return new PhysicsQuaternion(-this.x, -this.y, -this.z, this.w);
    }

    /**
     * Invert quaternion
     */
    invert() {
        const lengthSq = this.lengthSq();
        if (lengthSq === 0) {
            this.set(0, 0, 0, 1);
        } else {
            this.conjugate();
            this.x /= lengthSq;
            this.y /= lengthSq;
            this.z /= lengthSq;
            this.w /= lengthSq;
        }
        return this;
    }

    /**
     * Get inverse
     */
    getInverse() {
        return this.clone().invert();
    }

    /**
     * Multiply by another quaternion
     */
    multiply(quaternion) {
        const ax = this.x;
        const ay = this.y;
        const az = this.z;
        const aw = this.w;
        
        const bx = quaternion.x;
        const by = quaternion.y;
        const bz = quaternion.z;
        const bw = quaternion.w;

        this.x = ax * bw + aw * bx + ay * bz - az * by;
        this.y = ay * bw + aw * by + az * bx - ax * bz;
        this.z = az * bw + aw * bz + ax * by - ay * bx;
        this.w = aw * bw - ax * bx - ay * by - az * bz;

        return this;
    }

    /**
     * Multiply quaternions (static)
     */
    static multiply(a, b) {
        return a.clone().multiply(b);
    }

    /**
     * Pre-multiply by another quaternion
     */
    premultiply(quaternion) {
        const ax = quaternion.x;
        const ay = quaternion.y;
        const az = quaternion.z;
        const aw = quaternion.w;
        
        const bx = this.x;
        const by = this.y;
        const bz = this.z;
        const bw = this.w;

        this.x = ax * bw + aw * bx + ay * bz - az * by;
        this.y = ay * bw + aw * by + az * bx - ax * bz;
        this.z = az * bw + aw * bz + ax * by - ay * bx;
        this.w = aw * bw - ax * bx - ay * by - az * bz;

        return this;
    }

    /**
     * Calculate dot product
     */
    dot(quaternion) {
        return this.x * quaternion.x + this.y * quaternion.y + this.z * quaternion.z + this.w * quaternion.w;
    }

    /**
     * Spherical linear interpolation
     */
    slerp(quaternion, t) {
        let dot = this.dot(quaternion);

        // If the dot product is negative, slerp won't take the shorter path.
        // Note that q and -q are equivalent when representing a rotation.
        if (dot < 0) {
            dot = -dot;
            quaternion = quaternion.clone().negate();
        }

        if (dot > 0.9995) {
            // Linear interpolation for very close quaternions
            this.x += t * (quaternion.x - this.x);
            this.y += t * (quaternion.y - this.y);
            this.z += t * (quaternion.z - this.z);
            this.w += t * (quaternion.w - this.w);
            this.normalize();
        } else {
            const theta0 = Math.acos(Math.abs(dot));
            const theta = theta0 * t;
            const sinTheta = Math.sin(theta);
            const sinTheta0 = Math.sin(theta0);

            const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
            const s1 = sinTheta / sinTheta0;

            this.x = s0 * this.x + s1 * quaternion.x;
            this.y = s0 * this.y + s1 * quaternion.y;
            this.z = s0 * this.z + s1 * quaternion.z;
            this.w = s0 * this.w + s1 * quaternion.w;
        }

        return this;
    }

    /**
     * Negate quaternion
     */
    negate() {
        this.x *= -1;
        this.y *= -1;
        this.z *= -1;
        this.w *= -1;
        return this;
    }

    /**
     * Check equality with tolerance
     */
    equals(quaternion, tolerance = 1e-10) {
        return (
            Math.abs(this.x - quaternion.x) < tolerance &&
            Math.abs(this.y - quaternion.y) < tolerance &&
            Math.abs(this.z - quaternion.z) < tolerance &&
            Math.abs(this.w - quaternion.w) < tolerance
        );
    }

    /**
     * Convert to Euler angles (in radians)
     * Order: XYZ
     */
    toEuler() {
        const x = Math.atan2(2 * (this.w * this.x + this.y * this.z), 1 - 2 * (this.x * this.x + this.y * this.y));
        const y = MathUtils.safeAsin(2 * (this.w * this.y - this.z * this.x));
        const z = Math.atan2(2 * (this.w * this.z + this.x * this.y), 1 - 2 * (this.y * this.y + this.z * this.z));
        return { x, y, z };
    }

    /**
     * Convert to rotation matrix (3x3 as array)
     */
    toRotationMatrix() {
        const x = this.x;
        const y = this.y;
        const z = this.z;
        const w = this.w;

        const x2 = x + x;
        const y2 = y + y;
        const z2 = z + z;
        const xx = x * x2;
        const xy = x * y2;
        const xz = x * z2;
        const yy = y * y2;
        const yz = y * z2;
        const zz = z * z2;
        const wx = w * x2;
        const wy = w * y2;
        const wz = w * z2;

        return [
            1 - (yy + zz), xy - wz, xz + wy,
            xy + wz, 1 - (xx + zz), yz - wx,
            xz - wy, yz + wx, 1 - (xx + yy)
        ];
    }

    /**
     * Convert to axis-angle representation
     */
    toAxisAngle() {
        const length = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        
        if (length === 0) {
            return {
                axis: { x: 1, y: 0, z: 0 },
                angle: 0
            };
        }

        const angle = 2 * Math.acos(Math.abs(this.w));
        const axis = {
            x: this.x / length,
            y: this.y / length,
            z: this.z / length
        };

        return { axis, angle };
    }

    /**
     * Convert to array [x, y, z, w]
     */
    toArray() {
        return [this.x, this.y, this.z, this.w];
    }

    /**
     * Convert to object {x, y, z, w}
     */
    toObject() {
        return { x: this.x, y: this.y, z: this.z, w: this.w };
    }

    /**
     * String representation
     */
    toString() {
        return `PhysicsQuaternion(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
    }

    /**
     * Check if quaternion is finite
     */
    isFinite() {
        return Number.isFinite(this.x) && Number.isFinite(this.y) && 
               Number.isFinite(this.z) && Number.isFinite(this.w);
    }
}

// Common quaternion constants
PhysicsQuaternion.IDENTITY = new PhysicsQuaternion(0, 0, 0, 1); 