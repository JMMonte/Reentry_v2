import * as THREE from 'three';
import { ManeuverNodeModel } from '../../../models/ManeuverNodeModel.js';

/**
 * Encapsulates maneuver operations for a satellite (manual burns, transfers).
 */
export class ManeuverManager {
    constructor(satellite) {
        this.sat = satellite;
        this.timeUtils = satellite.app3d.timeUtils;
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
        const executeTime = timeMode === 'offset'
            ? new Date(simNow.getTime() + (parseFloat(offsetSec) || 0) * 1000)
            : (() => { const d = new Date(simNow); d.setUTCHours(hours, minutes, seconds, milliseconds); return d; })();
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
     * Generate a Hohmann transfer and return summary details.
     * TODO: migrate full hohmann logic from hook into this method.
     */
    generateHohmannTransfer() {
        // Placeholder: original logic to be moved here
        console.warn('generateHohmannTransfer not yet implemented in ManeuverManager');
        return null;
    }

    /**
     * Remove a maneuver node and keep list sorted.
     */
    deleteNode(node3D) {
        this.sat.removeManeuverNode(node3D);
        this.sat.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
    }
} 