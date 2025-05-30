import * as THREE from 'three';
import { ManeuverNodeModel } from '../../../models/ManeuverNodeModel.js';
import { Constants } from '../../../utils/Constants.js';
import { PhysicsAPI } from '../../../physics/PhysicsAPI.js';

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
        // Use PhysicsAPI for execution time calculation
        const executeTime = PhysicsAPI.computeExecutionTime(simNow, timeMode, { 
            offsetSec, hours, minutes, seconds, milliseconds 
        });
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
        // Get current orbital elements to maintain inclination and LAN
        const currentElements = PhysicsAPI.calculateOrbitalElements(
            this.sat.position,
            this.sat.velocity,
            mu
        );
        
        // Use PhysicsAPI for Hohmann transfer calculations
        const transfer = PhysicsAPI.calculateHohmannTransfer({
            currentPosition: this.sat.position,
            currentVelocity: this.sat.velocity,
            targetPeriapsis: parseFloat(ellApoKm) || 0, // For circular orbit, periapsis = apoapsis
            targetApoapsis: parseFloat(ellApoKm) || 0,
            targetInclination: currentElements.inclination, // Maintain current inclination
            targetLAN: currentElements.longitudeOfAscendingNode, // Maintain current LAN
            bodyRadius: Constants.earthRadius,
            mu: mu
        });
        
        const deltaV1 = transfer.deltaV1;
        const deltaV2 = transfer.deltaV2;
        const totalDeltaV = transfer.totalDeltaV;
        const dv_plane = transfer.burn2.planeChangeComponent || 0;
        const transferTime = transfer.transferTime;
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
        // Find next periapsis for first burn using PhysicsAPI
        let burnTime = PhysicsAPI.calculateNextPeriapsis(
            r1Vec,
            v1Vec,
            mu,
            simNow
        );

        // Get current orbital elements to maintain inclination and LAN
        const currentElements = PhysicsAPI.calculateOrbitalElements(r1Vec, v1Vec, mu);
        
        // Use PhysicsAPI for Hohmann transfer calculations
        const transfer = PhysicsAPI.calculateHohmannTransfer({
            currentPosition: r1Vec,
            currentVelocity: v1Vec,
            targetPeriapsis: parseFloat(ellApoKm) || 0, // For circular orbit
            targetApoapsis: parseFloat(ellApoKm) || 0,
            targetInclination: currentElements.inclination, // Maintain current inclination
            targetLAN: currentElements.longitudeOfAscendingNode, // Maintain current LAN
            bodyRadius: Constants.earthRadius,
            mu: mu
        });
        
        const dv1 = transfer.deltaV1;
        const dv2 = transfer.deltaV2;
        const dv_plane = transfer.burn2.planeChangeComponent || 0;
        const transferTime = transfer.transferTime;
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