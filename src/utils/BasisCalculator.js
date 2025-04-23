import * as THREE from 'three';

export class BasisCalculator {
    /**
     * Compute local delta-V (prograde, radial, normal) from world delta-V using orbit points and period.
     * @param {THREE.Vector3} dvWorld - world delta-V vector
     * @param {Array<{x:number,y:number,z:number}>} pts - orbit points
     * @param {number} periodSec - orbital period in seconds
     * @param {Date} targetTime - maneuver execution time
     * @param {Date} simTime - current simulation time
     * @returns {THREE.Vector3} local delta-V components [vHat, rHat, hHat]
     */
    static computeLocal(dvWorld, pts, periodSec, targetTime, simTime) {
        if (!pts || pts.length < 2 || periodSec <= 0) return dvWorld.clone();
        const dt = (targetTime.getTime() - simTime.getTime()) / 1000;
        const frac = ((dt / periodSec) % 1 + 1) % 1;
        const idx = Math.floor(frac * pts.length);
        const pt = new THREE.Vector3(pts[idx].x, pts[idx].y, pts[idx].z);
        const next = pts[(idx + 1) % pts.length];
        if (!next) return dvWorld.clone();
        const nxt = new THREE.Vector3(next.x, next.y, next.z);
        const vHat = nxt.clone().sub(pt).normalize();
        const rHat = pt.clone().normalize();
        const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
        return new THREE.Vector3(
            dvWorld.dot(vHat),
            dvWorld.dot(rHat),
            dvWorld.dot(hHat)
        );
    }

    /**
     * Compute world delta-V vector from local components using orbit points and period.
     * @param {THREE.Vector3} dvLocal - local delta-V [prograde, radial, normal]
     * @param {Array<{x:number,y:number,z:number}>} pts - orbit points
     * @param {number} periodSec - orbital period in seconds
     * @param {Date} targetTime - maneuver execution time
     * @param {Date} simTime - current simulation time
     * @returns {THREE.Vector3} world delta-V
     */
    static computeWorld(dvLocal, pts, periodSec, targetTime, simTime) {
        if (!pts || pts.length < 2 || periodSec <= 0) return dvLocal.clone();
        const dt = (targetTime.getTime() - simTime.getTime()) / 1000;
        const frac = ((dt / periodSec) % 1 + 1) % 1;
        const idx = Math.floor(frac * pts.length);
        const pt = new THREE.Vector3(pts[idx].x, pts[idx].y, pts[idx].z);
        const next = pts[(idx + 1) % pts.length];
        if (!next) return dvLocal.clone();
        const nxt = new THREE.Vector3(next.x, next.y, next.z);
        const vHat = nxt.clone().sub(pt).normalize();
        const rHat = pt.clone().normalize();
        const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
        const dvWorld = new THREE.Vector3();
        dvWorld.addScaledVector(vHat, dvLocal.x)
            .addScaledVector(rHat, dvLocal.y)
            .addScaledVector(hHat, dvLocal.z);
        return dvWorld;
    }

    /**
     * Compute local delta-V using exact instantaneous basis (prograde, radial, normal).
     * @param {THREE.Vector3} dvWorld - world delta-V vector
     * @param {THREE.Vector3} pos - instantaneous position vector
     * @param {THREE.Vector3} vel - instantaneous velocity vector
     * @returns {THREE.Vector3} local delta-V components
     */
    static computeLocalExact(dvWorld, pos, vel) {
        const vHat = vel.clone().normalize();
        const rHat = pos.clone().normalize();
        const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
        return new THREE.Vector3(
            dvWorld.dot(vHat),
            dvWorld.dot(rHat),
            dvWorld.dot(hHat)
        );
    }

    /**
     * Compute world delta-V vector from local exact components using instantaneous basis.
     * @param {THREE.Vector3} dvLocal - local delta-V components
     * @param {THREE.Vector3} pos - instantaneous position vector
     * @param {THREE.Vector3} vel - instantaneous velocity vector
     * @returns {THREE.Vector3} world delta-V vector
     */
    static computeWorldExact(dvLocal, pos, vel) {
        const vHat = vel.clone().normalize();
        const rHat = pos.clone().normalize();
        const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
        const dvWorld = new THREE.Vector3();
        dvWorld.addScaledVector(vHat, dvLocal.x)
            .addScaledVector(rHat, dvLocal.y)
            .addScaledVector(hHat, dvLocal.z);
        return dvWorld;
    }
} 