/*
 * ManeuverExecutor.js
 *
 * Stateless utility that applies pending maneuver nodes to a satellite state.
 * Designed to be used from both the main-thread SatelliteEngine and the Web-Worker
 * implementation to avoid code duplication and to improve separation of
 * concerns. All heavy-lifting maths stays inside this module, while the
 * callers remain responsible for UI synchronization and node array maintenance.
 */

import { PhysicsVector3 } from '../utils/PhysicsVector3.js';

export class ManeuverExecutor {
    /**
     * Apply every maneuver node whose executionTime has passed.
     *
     * The method mutates the provided `satellite` instance (updates velocity
     * in-place) and flags each executed node with `executed=true` plus
     * `actualExecuteTime`.
     *
     * It returns an array with the nodes that were applied so that the caller
     * can perform any extra bookkeeping (e.g. UI events, removing nodes from
     * a list).
     *
     * @param {Object}   satellite              Live satellite state.
     * @param {Array}    maneuverNodes          Array of ManeuverNode DTOs.
     * @param {Date}     currentTime            Current simulation time.
     * @param {Object}   workVectors            Optional cache of PhysicsVector3
     *                                          instances to avoid garbage.
     *                                          Expected keys: localDV, velDir,
     *                                          radialDir, normalDir, worldDeltaV.
     *                                          If omitted the vectors are
     *                                          allocated on the fly.
     * @returns {Array}  executedNodes          Nodes that were applied this call.
     */
    static executePendingManeuvers(satellite, maneuverNodes, currentTime, workVectors = null) {
        if (!maneuverNodes || maneuverNodes.length === 0) return [];

        // Prepare reusable vectors (either provided or create throw-away ones)
        const vectors = workVectors || {
            localDV: new PhysicsVector3(),
            velDir: new PhysicsVector3(),
            radialDir: new PhysicsVector3(),
            normalDir: new PhysicsVector3(),
            worldDeltaV: new PhysicsVector3()
        };

        const executed = [];

        // Walk backwards so that we can splice/flag while iterating if desired
        for (let i = maneuverNodes.length - 1; i >= 0; i--) {
            const node = maneuverNodes[i];
            if (node.executed) continue;

            const executeTime = node.executionTime instanceof Date
                ? node.executionTime
                : new Date(node.executionTime);

            if (currentTime >= executeTime) {
                // -- Convert local (prograde/normal/radial) DV to world-space --
                vectors.localDV.set(
                    node.deltaV.prograde || 0,
                    node.deltaV.normal  || 0,
                    node.deltaV.radial  || 0
                );

                // Velocity direction (prograde)
                const velDir = vectors.velDir.copy(satellite.velocity).normalize();
                // Radial direction (from planet)
                const radialDir = vectors.radialDir.copy(satellite.position).normalize();
                // Normal (orbital) direction  = radial × prograde
                const normalDir = vectors.normalDir.crossVectors(radialDir, velDir).normalize();

                // Build world delta-V vector
                const worldDV = vectors.worldDeltaV.set(0, 0, 0)
                    .addScaledVector(velDir,    vectors.localDV.x)
                    .addScaledVector(normalDir, vectors.localDV.y)
                    .addScaledVector(radialDir, vectors.localDV.z);

                // Apply delta-V instantly (impulsive approximation)
                satellite.velocity.add(worldDV);

                // Keep simple velocity history for diagnostics (optional)
                if (satellite.velocityHistory) {
                    satellite.velocityHistory.push({
                        time: currentTime.toISOString(),
                        velocity: satellite.velocity.length(),
                        context: `maneuver_${node.id}`,
                        deltaV: worldDV.length()
                    });
                    if (satellite.velocityHistory.length > 10) {
                        satellite.velocityHistory.shift();
                    }
                }

                // Mark node as executed so the caller can decide what to do
                node.executed = true;
                node.actualExecuteTime = currentTime.toISOString();

                executed.push(node);
            }
        }

        return executed;
    }
} 