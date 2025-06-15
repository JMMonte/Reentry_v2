/**
 * PhysicsEuler.js
 * 
 * Pure mathematical Euler class for physics calculations.
 * Self-contained with all necessary Euler operations for physics calculations.
 */

export class PhysicsEuler {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
        this.x = x;
        this.y = y;
        this.z = z;
        this.order = order;
    }

    set(x, y, z, order = 'XYZ') {
        this.x = x;
        this.y = y;
        this.z = z;
        this.order = order;
        return this;
    }

    copy(euler) {
        this.x = euler.x;
        this.y = euler.y;
        this.z = euler.z;
        this.order = euler.order;
        return this;
    }

    clone() {
        return new PhysicsEuler(this.x, this.y, this.z, this.order);
    }

    setFromRotationMatrix(matrix) {
        this.x = Math.atan2(matrix[2][1], matrix[2][2]);
        this.y = Math.asin(-matrix[2][0]);
        this.z = Math.atan2(matrix[1][0], matrix[0][0]);
    }

    setFromQuaternion(quaternion) {
        this.x = Math.atan2(2 * (quaternion.w * quaternion.x + quaternion.y * quaternion.z), 1 - 2 * (quaternion.x * quaternion.x + quaternion.y * quaternion.y));
        this.y = Math.asin(2 * (quaternion.w * quaternion.y - quaternion.z * quaternion.x));
        this.z = Math.atan2(2 * (quaternion.w * quaternion.z + quaternion.x * quaternion.y), 1 - 2 * (quaternion.y * quaternion.y + quaternion.z * quaternion.z));
    }

    setFromAxisAngle(axis, angle) {
        this.x = axis.x * angle;
        this.y = axis.y * angle;
        this.z = axis.z * angle;
    }

    setFromEuler(euler) {
        this.x = euler.x;
        this.y = euler.y;
        this.z = euler.z;
        this.order = euler.order;
    }
}