import { Utils } from '../physics/PhysicsAPI.js';

/**
 * Utility class for maneuver node operations: orbit path selection and execution time calculations.
 * 
 * For delta-v transformations between local (pro/normal/radial) and world coordinates,
 * use PhysicsAPI.Utils.vector.localToWorldDeltaV() and worldToLocalDeltaV() instead.
 */
export class ManeuverUtils {
    /**
     * Returns the orbit path used for the given node index: for idx>0 returns the previous
     * node's predictedOrbit; for idx===0 returns null.
     * @param {Array} nodes Array of ManeuverNode instances
     * @param {number} idx Index of the node being edited or applied
     * @param {Object} satellite Satellite instance (for fallback path)
     * @returns {Object|null} Orbit data or null
     */
    static getCompositePath(nodes, idx, satellite) { // eslint-disable-line no-unused-vars
        if (idx > 0 && nodes[idx - 1]?.predictedOrbit) {
            return nodes[idx - 1].predictedOrbit;
        }
        return null; // Orbit paths now handled by SatelliteOrbitManager
    }

    // REMOVED: worldToLocal and localToWorld methods
    // Use PhysicsAPI.Utils.vector.worldToLocalDeltaV() and localToWorldDeltaV() instead
    // These provide more accurate transformations using direct position/velocity vectors

    /**
     * Compute execution time based on mode and inputs.
     * Delegates to PhysicsAPI for consistency.
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
        return Utils.time.computeExecutionTime(simNow, timeMode, {
            offsetSec,
            hours,
            minutes,
            seconds,
            milliseconds
        });
    }

    // REMOVED: computeDeltaVMagnitude - use PhysicsAPI.calculateDeltaVMagnitude instead
} 