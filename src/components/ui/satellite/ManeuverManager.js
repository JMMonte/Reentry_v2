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
     * Same calculation logic as generateHohmannTransfer but returns data without modifying satellite.
     * @param {Object} opts - Same options as generateHohmannTransfer
     * @returns {Object} Transfer details for preview
     */
    calculateHohmannPreview(opts) {
        const { shapeType, selectedPreset, customRadiusKm, ellPeriKm, ellApoKm, planeChangeDeg } = opts;
        
        const simNow = this.timeUtils.getSimulatedTime();
        const r1 = this.sat.position.length();
        let r_target_pe, r_target_ap;
        
        // Determine target radii - same logic as generateHohmannTransfer
        const customAlt = parseFloat(customRadiusKm);
        if (shapeType === 'moon') {
            const jd = this.sat.app3d.timeUtils.getJulianDate();
            const moonPos = this.sat.app3d.moon.getMoonPosition(jd);
            const moonVec = new THREE.Vector3(moonPos.x, moonPos.y, moonPos.z);
            r_target_ap = moonVec.length();
            r_target_pe = r_target_ap;
        } else if (shapeType === 'circular') {
            const rBase = (!isNaN(customAlt) && customAlt > 0)
                ? customAlt * Constants.kmToMeters + Constants.earthRadius
                : selectedPreset * Constants.kmToMeters + Constants.earthRadius;
            r_target_pe = rBase;
            r_target_ap = rBase;
        } else {
            r_target_pe = (parseFloat(ellPeriKm) || 0) * Constants.kmToMeters + Constants.earthRadius;
            r_target_ap = (parseFloat(ellApoKm) || 0) * Constants.kmToMeters + Constants.earthRadius;
        }
        
        // Basic parameters - same as in generateHohmannTransfer
        const mu = Constants.earthGravitationalParameter;
        const planeRad = (parseFloat(planeChangeDeg) || 0) * (Math.PI / 180);
        const dv_plane = 2 * Math.sqrt(mu / r1) * Math.sin(planeRad / 2);
        
        // Calculate delta-V values
        let dv1 = 0, dv2 = 0, totalDV = 0;
        if (shapeType === 'circular') {
            const { deltaV1, deltaV2, totalDeltaV } = PhysicsUtils.calculateHohmannOrbitRaiseDeltaV(r1, r_target_ap, mu);
            dv1 = deltaV1;
            dv2 = deltaV2;
            totalDV = totalDeltaV + Math.abs(dv_plane);
        } else {
            // manual Hohmann math for elliptical or moon
            const aTrans = (r1 + r_target_ap) / 2;
            const dvTrans1 = Math.sqrt(mu * (2 / r1 - 1 / aTrans));
            dv1 = dvTrans1 - Math.sqrt(mu / r1);
            if (shapeType !== 'moon') {
                const aTarget = (r_target_pe + r_target_ap) / 2;
                const dvTrans2 = Math.sqrt(mu * (2 / r_target_ap - 1 / aTrans));
                dv2 = Math.sqrt(mu * (2 / r_target_ap - 1 / aTarget)) - dvTrans2;
            }
            totalDV = Math.abs(dv1) + Math.abs(dv_plane) + (Math.abs(dv2) || 0);
        }
        
        // Calculate timing and orbit metrics - same as in generateHohmannTransfer
        const transferTime = Math.PI * Math.sqrt(Math.pow((r1 + r_target_ap) / 2, 3) / mu);
        const time1 = new Date(simNow);
        const time2 = new Date(simNow.getTime() + transferTime * 1000);
        const altitude1Km = (r1 - Constants.earthRadius) * Constants.metersToKm;
        const altitudeTargetKm = (r_target_ap - Constants.earthRadius) * Constants.metersToKm;
        const eTrans = (r_target_ap - r1) / (r_target_ap + r1);
        const finalPeriod = 2 * Math.PI * Math.sqrt(Math.pow((r_target_pe + r_target_ap) / 2, 3) / mu);
        const dt1Sec = (time1.getTime() - simNow.getTime()) / 1000;
        const dt2Sec = (time2.getTime() - simNow.getTime()) / 1000;
        
        // Return all the calculated values but don't create any nodes
        return { 
            dv1, dv2, dv_plane, transferTime, time1, time2, totalDV,
            altitude1Km, altitudeTargetKm, eTrans, dt1Sec, dt2Sec, finalPeriod
        };
    }

    /**
     * Generate a bi-impulse transfer to a target orbit, scheduling the first burn at the next periapsis (or user-specified time).
     * @param {Object} opts
     * @param {string} opts.ellPeriKm - Periapsis of target orbit (km)
     * @param {string} opts.ellApoKm - Apoapsis of target orbit (km)
     * @param {string} opts.planeChangeDeg
     * @param {Date} [opts.manualBurnTime] - Optional manual burn time
     * @returns {Object} summary of transfer details
     */
    generateHohmannTransfer(opts) {
        const { ellPeriKm, ellApoKm, planeChangeDeg, manualBurnTime } = opts;
        // Remove existing maneuver nodes
        this.sat.maneuverNodes.slice().forEach(node => this.sat.removeManeuverNode(node));

        const simNow = this.timeUtils.getSimulatedTime();
        const mu = Constants.earthGravitationalParameter;
        const r1Vec = this.sat.position.clone();
        const v1Vec = this.sat.velocity.clone();
        const r1 = r1Vec.length();
        // Target orbit
        const r_target_pe = (parseFloat(ellPeriKm) || 0) * Constants.kmToMeters + Constants.earthRadius;
        const r_target_ap = (parseFloat(ellApoKm) || 0) * Constants.kmToMeters + Constants.earthRadius;
        const a_target = (r_target_pe + r_target_ap) / 2;
        const e_target = (r_target_ap - r_target_pe) / (r_target_ap + r_target_pe);
        // Plane change
        const planeRad = (parseFloat(planeChangeDeg) || 0) * (Math.PI / 180);

        // Find best time for first burn: next periapsis
        let burnTime = simNow;
        if (!manualBurnTime) {
            // Use ApsisFinder to get next periapsis
            const posArr = [r1Vec.x, r1Vec.y, r1Vec.z];
            const velArr = [v1Vec.x, v1Vec.y, v1Vec.z];
            const bodies = [
                { position: { x: 0, y: 0, z: 0 }, mass: Constants.earthMass }
            ];
            const dtToPeri = findNextApsis(posArr, velArr, bodies, 1.0, 'periapsis', 86400);
            if (dtToPeri != null) {
                burnTime = new Date(simNow.getTime() + dtToPeri * 1000);
            }
        } else {
            burnTime = manualBurnTime;
        }

        // Compute state at burn time
        // (for now, assume Keplerian propagation; for high accuracy, use OrbitIntegrator)
        // For simplicity, use current position/velocity (improve with propagation if needed)
        // Compute transfer orbit parameters
        // Initial orbit elements
        const r0 = r1;
        // Target peri/apo
        const aTrans = (r0 + r_target_ap) / 2;
        // First burn: at periapsis, raise apoapsis
        const vPeriInit = Math.sqrt(mu * (2 / r0 - 1 / aTrans));
        const vPeriCurrent = Math.sqrt(mu / r0);
        let dv1 = vPeriInit - vPeriCurrent;
        // Plane change at periapsis
        const dv_plane = 2 * Math.sqrt(mu / r0) * Math.sin(planeRad / 2);
        // Second burn: at apoapsis, circularize (or set target)
        const vApoTrans = Math.sqrt(mu * (2 / r_target_ap - 1 / aTrans));
        const vApoTarget = Math.sqrt(mu * (2 / r_target_ap - 1 / a_target));
        let dv2 = vApoTarget - vApoTrans;
        // Schedule burns
        const transferTime = Math.PI * Math.sqrt(Math.pow(aTrans, 3) / mu);
        const burn2Time = new Date(burnTime.getTime() + transferTime * 1000);
        // Add maneuver nodes
        const node1 = this.sat.addManeuverNode(burnTime, new THREE.Vector3(dv1, 0, dv_plane));
        node1.localDV = new THREE.Vector3(dv1, 0, dv_plane);
        node1.update();
        const node2 = this.sat.addManeuverNode(burn2Time, new THREE.Vector3(dv2, 0, 0));
        node2.localDV = new THREE.Vector3(dv2, 0, 0);
        node2.update();
        this.sat.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
        return {
            dv1, dv2, dv_plane, transferTime, burnTime, burn2Time,
            r0, r_target_pe, r_target_ap, aTrans, a_target, e_target
        };
    }

    /**
     * Remove a maneuver node and keep list sorted.
     */
    deleteNode(node3D) {
        this.sat.removeManeuverNode(node3D);
        this.sat.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
    }
} 