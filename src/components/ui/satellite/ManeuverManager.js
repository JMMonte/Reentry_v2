import * as THREE from 'three';
import { ManeuverNodeModel } from '../../../models/ManeuverNodeModel.js';
import { Constants } from '../../../utils/Constants.js';
import { PhysicsUtils } from '../../../utils/PhysicsUtils.js';
import { ManeuverUtils } from '../../../utils/ManeuverUtils.js';
import { findNextApsis } from '../../../utils/ApsisFinder.js';

/**
 * Encapsulates maneuver operations for a satellite (manual burns, transfers).
 */
export class ManeuverManager {
    /**
     * @param satellite The satellite instance
     * @param timeUtils Shared TimeUtils instance
     */
    constructor(satellite, timeUtils) {
        this.sat = satellite;
        this.timeUtils = timeUtils;
    }

    /**
     * Rebuild array of UI node models sorted by execution time.
     */
    buildNodeModels(currentSimTime) {
        return this.sat.maneuverNodes
            .slice()
            .sort((a, b) => a.time.getTime() - b.time.getTime())
            .map(n => new ManeuverNodeModel(n, this.sat, currentSimTime));
    }

    /**
     * Schedule or update a manual burn based on provided timing and delta-V values.
     */
    scheduleManualBurn({ timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz }, replaceOldNode = null) {
        const simNow = this.timeUtils.getSimulatedTime();
        // Compute execution time via central utility
        const executeTime = ManeuverUtils.computeExecutionTime(simNow, { timeMode, offsetSec, hours, minutes, seconds, milliseconds });
        const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);

        // Optionally remove an existing node before scheduling a new one
        if (replaceOldNode) {
            this.sat.removeManeuverNode(replaceOldNode);
        }

        const newNode = this.sat.addManeuverNode(executeTime, dvLocal.clone());
        newNode.localDV = dvLocal.clone();
        newNode.update();

        // Keep nodes sorted
        this.sat.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
        return newNode;
    }

    /**
     * Calculate Hohmann transfer data for preview without creating actual nodes.
     * Same as generateHohmannTransfer but returns preview data without node creation (circular only).
     * @param {Object} opts
     * @param {string} opts.ellApoKm - Target circular orbit altitude (km above Earth's surface)
     * @returns {Object} Transfer details for preview
     */
    calculateHohmannPreview({ ellApoKm }) {
        const simNow = this.timeUtils.getSimulatedTime();
        const r1 = this.sat.position.length();
        const mu = Constants.earthGravitationalParameter;
        const r_target = (parseFloat(ellApoKm) || 0) + Constants.earthRadius;
        // Delta-V for Hohmann raise
        const { deltaV1, deltaV2, totalDeltaV } = PhysicsUtils.calculateHohmannOrbitRaiseDeltaV(r1, r_target, mu);
        const dv_plane = 0;
        // Compute transfer time (time between burns)
        const transferTime = Math.PI * Math.sqrt(Math.pow((r1 + r_target) / 2, 3) / mu);
        // Preview burn times: first at now, second after transfer
        const time1 = new Date(simNow);
        const time2 = new Date(simNow.getTime() + transferTime * 1000);
        // Altitudes in km
        const altitude1Km = (r1 - Constants.earthRadius);
        const altitudeTargetKm = (r_target - Constants.earthRadius);
        const dt1Sec = (time1.getTime() - simNow.getTime()) / 1000;
        const dt2Sec = (time2.getTime() - simNow.getTime()) / 1000;
        return {
            dv1: deltaV1,
            dv2: deltaV2,
            dv_plane,
            transferTime,
            time1,
            time2,
            totalDV: totalDeltaV,
            altitude1Km,
            altitudeTargetKm,
            dt1Sec,
            dt2Sec
        };
    }

    /**
     * Generate a bi-impulse Hohmann transfer to a target circular orbit altitude.
     * @param {Object} opts
     * @param {string} opts.ellApoKm - Target circular orbit altitude (km above Earth's surface)
     * @returns {Object} Summary of transfer details
     */
    generateHohmannTransfer({ ellApoKm }) {
        // Remove existing maneuver nodes
        this.sat.maneuverNodes.slice().forEach(node => this.sat.removeManeuverNode(node));

        const simNow = this.timeUtils.getSimulatedTime();
        const mu = Constants.earthGravitationalParameter;
        const r1Vec = this.sat.position.clone();
        const v1Vec = this.sat.velocity.clone();
        const r1 = r1Vec.length();
        // Target orbit radius
        const r_target = (parseFloat(ellApoKm) || 0) + Constants.earthRadius;
        // Find next periapsis for first burn
        let burnTime = simNow;
        const posArr = [r1Vec.x, r1Vec.y, r1Vec.z];
        const velArr = [v1Vec.x, v1Vec.y, v1Vec.z];
        const bodies = [{ position: { x: 0, y: 0, z: 0 }, mass: Constants.earthMass }];
        const dtToPeri = findNextApsis(posArr, velArr, bodies, 1.0, 'periapsis', 86400);
        if (dtToPeri != null) burnTime = new Date(simNow.getTime() + dtToPeri * 1000);

        // Compute transfer orbit parameters
        const aTrans = (r1 + r_target) / 2;
        // First burn: raise apoapsis
        const vPeriInit = Math.sqrt(mu * (2 / r1 - 1 / aTrans));
        const vPeriCurrent = Math.sqrt(mu / r1);
        const dv1 = vPeriInit - vPeriCurrent;
        const dv_plane = 0;
        // Second burn: circularize
        const vApoTrans = Math.sqrt(mu * (2 / r_target - 1 / aTrans));
        const vApoTarget = Math.sqrt(mu / r_target);
        const dv2 = vApoTarget - vApoTrans;
        // Schedule burns
        const transferTime = Math.PI * Math.sqrt(Math.pow(aTrans, 3) / mu);
        const burn2Time = new Date(burnTime.getTime() + transferTime * 1000);
        // Add maneuver nodes
        const node1 = this.sat.addManeuverNode(burnTime, new THREE.Vector3(dv1, 0, 0));
        node1.localDV = new THREE.Vector3(dv1, 0, 0);
        node1.update();
        const node2 = this.sat.addManeuverNode(burn2Time, new THREE.Vector3(dv2, 0, 0));
        node2.localDV = new THREE.Vector3(dv2, 0, 0);
        node2.update();
        this.sat.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
        return { node1, node2, burnTime, burn2Time, dv1, dv2, dv_plane, transferTime };
    }

    /**
     * Remove a maneuver node and keep list sorted.
     */
    deleteNode(node3D) {
        this.sat.removeManeuverNode(node3D);
        this.sat.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
    }
} 