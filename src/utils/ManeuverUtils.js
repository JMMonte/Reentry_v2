import * as THREE from 'three';

/**
 * Utility class for maneuver node operations: selecting the correct orbit path and
 * projecting delta-v vectors between local (pro/normal/radial) and world spaces.
 */
export class ManeuverUtils {
    /**
     * Returns the orbit path used for the given node index: for idx>0 returns the previous
     * node's predictedOrbit; for idx===0 returns the main satellite orbitPath.
     * @param {Array} nodes Array of ManeuverNode instances
     * @param {number} idx Index of the node being edited or applied
     * @param {Object} satellite Satellite instance (for fallback path)
     * @returns {Object} OrbitPath instance
     */
    static getCompositePath(nodes, idx, satellite) {
        if (idx > 0 && nodes[idx - 1]?.predictedOrbit) {
            return nodes[idx - 1].predictedOrbit;
        }
        return satellite.orbitPath;
    }

    /**
     * Projects a world-space delta-v vector into the local spacecraft frame at a given time.
     * @param {Object} path OrbitPath with orbitPoints (Vector3[]) and _period (seconds)
     * @param {THREE.Vector3} dvWorld World-space delta-v
     * @param {Date} nodeTime Execution time of the burn
     * @param {Date} simTime Current simulation time
     * @returns {THREE.Vector3} Local delta-v components [prograde, radial, normal]
     */
    static worldToLocal(path, dvWorld, nodeTime, simTime) {
        const pts = path.orbitPoints || [];
        const T = path._period || 0;
        if (pts.length > 1 && T > 0) {
            const dt = (nodeTime.getTime() - simTime.getTime()) / 1000;
            const frac = ((dt / T) % 1 + 1) % 1;
            const idx = Math.floor(frac * pts.length);
            const p0 = pts[idx];
            const p1 = pts[(idx + 1) % pts.length];
            const vHat = new THREE.Vector3(p1.x, p1.y, p1.z)
                .sub(new THREE.Vector3(p0.x, p0.y, p0.z)).normalize();
            const rHat = new THREE.Vector3(p0.x, p0.y, p0.z).normalize();
            const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
            return new THREE.Vector3(
                dvWorld.dot(vHat),
                dvWorld.dot(rHat),
                dvWorld.dot(hHat)
            );
        }
        return dvWorld.clone();
    }

    /**
     * Projects a local delta-v vector (pro/ral/normal) into world-space at a given time.
     * @param {Object} path OrbitPath with orbitPoints (Vector3[]) and _period (seconds)
     * @param {THREE.Vector3} dvLocal Local delta-v [prograde, radial, normal]
     * @param {Date} execTime Execution time of the burn
     * @param {Date} simTime Current simulation time
     * @returns {THREE.Vector3} World-space delta-v vector
     */
    static localToWorld(path, dvLocal, execTime, simTime) {
        const pts = path.orbitPoints || [];
        const T = path._period || 0;
        const dvWorld = new THREE.Vector3();
        if (pts.length > 1 && T > 0) {
            const dt = (execTime.getTime() - simTime.getTime()) / 1000;
            const frac = ((dt / T) % 1 + 1) % 1;
            const idx = Math.floor(frac * pts.length);
            const p0 = pts[idx];
            const p1 = pts[(idx + 1) % pts.length];
            const vHat = new THREE.Vector3(p1.x, p1.y, p1.z)
                .sub(new THREE.Vector3(p0.x, p0.y, p0.z)).normalize();
            const rHat = new THREE.Vector3(p0.x, p0.y, p0.z).normalize();
            const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
            dvWorld.addScaledVector(vHat, dvLocal.x)
                .addScaledVector(rHat, dvLocal.y)
                .addScaledVector(hHat, dvLocal.z);
        } else {
            dvWorld.copy(dvLocal);
        }
        return dvWorld;
    }

    /**
     * Compute execution time based on mode and inputs.
     * @param {Date} simNow Current simulated time
     * @param {Object} opts
     * @param {'offset'|'datetime'} opts.timeMode
     * @param {string} opts.offsetSec
     * @param {number} opts.hours
     * @param {number} opts.minutes
     * @param {number} opts.seconds
     * @param {number} opts.milliseconds
     * @returns {Date}
     */
    static computeExecutionTime(simNow, { timeMode, offsetSec, hours, minutes, seconds, milliseconds }) {
        if (timeMode === 'offset') {
            const secs = parseFloat(offsetSec) || 0;
            return new Date(simNow.getTime() + secs * 1000);
        } else {
            const d = new Date(simNow);
            d.setUTCHours(hours, minutes, seconds, milliseconds);
            return d;
        }
    }

    /**
     * Compute magnitude of delta-V vector components.
     * @param {number} vx
     * @param {number} vy
     * @param {number} vz
     * @returns {number}
     */
    static computeDeltaVMagnitude(vx, vy, vz) {
        return Math.hypot(vx, vy, vz);
    }
} 