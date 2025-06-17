/*
 * SatelliteIntegrator.js
 * -------------------------------------------------------------
 * Lightweight helper that performs one physics-time-step integration
 * for a single Satellite *on the main thread*.  It contains ZERO
 * references to browser / UI code and can therefore be reused from
 * workers or unit tests.  The algorithm is extracted from
 * SatelliteEngine._integrateSingleSatelliteMainThread so that the
 * heavy numerical code lives in one place instead of being duplicated
 * throughout the engine.
 *
 * Public API (single static method):
 *     SatelliteIntegrator.integrateSingleSatellite(satellite, opts)
 *
 * The caller must supply:
 *     satellite           – the mutable satellite object (with position &
 *                           velocity as PhysicsVector3 instances)
 *     opts = {
 *       deltaTime,        – physics step (s)
 *       bodies,           – map of NAIF-ID → body data
 *       simulationTime,   – Date instance for bookkeeping
 *       timeWarp   = 1,   – time-warp factor
 *       integrationMethod – 'auto' | 'rk4' | 'rk45'
 *       sensitivityScale  – integrator error scaling (number)
 *       perturbationScale – scale third-body perturbations (0-1)
 *     }
 *
 * The function mutates `satellite` in-place (position/velocity/lastUpdate)
 * and returns a boolean success flag plus the integration run-time in ms.
 */

import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { getIntegrator } from '../integrators/OrbitalIntegrators.js';
import { PhysicsVector3 } from '../utils/PhysicsVector3.js';

/**
 * @class SatelliteIntegrator
 * @description Lightweight helper that performs one physics-time-step integration
 * for a single Satellite *on the main thread*.  It contains ZERO references to
 * browser / UI code and can therefore be reused from workers or unit tests.
 * The algorithm is extracted from SatelliteEngine._integrateSingleSatelliteMainThread
 * so that the heavy numerical code lives in one place instead of being duplicated
 * throughout the engine.
 *
 * Public API (single static method):
 *     SatelliteIntegrator.integrateSingleSatellite(satellite, opts)
 *
 * The caller must supply:
 *     satellite           – the mutable satellite object (with position &
 *                           velocity as PhysicsVector3 instances)
 *     opts = {
 *       deltaTime,        – physics step (s)
 */
export class SatelliteIntegrator {
    /**
     * Integrate a single satellite in place - REVERTED TO ORIGINAL WORKING VERSION
     * @returns {boolean} success
     */
    static integrateSingleSatellite(
        satellite,
        {
            deltaTime,
            bodies,
            simulationTime,
            integrationMethod = 'auto',
            sensitivityScale = 1,
            perturbationScale = 1
        }
    ) {
        if (!satellite || !bodies) return false;

        // Build acceleration function (pure arrays for speed)
        const accelerationFunc = (posArr, velArr) => {
            const satState = {
                ...satellite,
                position: posArr,
                velocity: velArr,
                centralBodyNaifId: satellite.centralBodyNaifId
            };
            return UnifiedSatellitePropagator.computeAcceleration(satState, bodies, {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                perturbationScale
            });
        };

        // Prepare state vectors
        const position = satellite.position.toArray();
        const velocity = satellite.velocity.toArray();
        const posVec = new PhysicsVector3(...position);
        const velVec = new PhysicsVector3(...velocity);

        const integrator = getIntegrator(integrationMethod);
        // Don't apply timeWarp here - it should be handled by the caller (SimulationLoop)
        // This prevents double-application of timeWarp
        const effectiveTimeStep = deltaTime;

        // **CRITICAL FIX**: Subdivide large time steps for numerical stability
        // Orbital mechanics requires small time steps (typically < 10 seconds)
        const maxSubStep = 10.0; // Maximum 10 seconds per integration step
        const numSubSteps = Math.ceil(effectiveTimeStep / maxSubStep);
        const subStepSize = effectiveTimeStep / numSubSteps;

        let currentPos = posVec.clone();
        let currentVel = velVec.clone();

        // Integrate using multiple sub-steps
        for (let i = 0; i < numSubSteps; i++) {
        let resultVecs;
        try {
            if (integrationMethod === 'rk45' || integrationMethod === 'adaptive') {
                resultVecs = integrator(
                        currentPos,
                        currentVel,
                    (p, v) => new PhysicsVector3(...accelerationFunc(p.toArray(), v.toArray())),
                        subStepSize,
                    {
                        absTol: 1e-6 / sensitivityScale,
                        relTol: 1e-6 / sensitivityScale,
                        sensitivityScale
                    }
                );
            } else {
                resultVecs = integrator(
                        currentPos,
                        currentVel,
                    (p, v) => new PhysicsVector3(...accelerationFunc(p.toArray(), v.toArray())),
                        subStepSize
                );
            }
                
                currentPos = resultVecs.position;
                currentVel = resultVecs.velocity;
        } catch (err) {
                console.error(`[SatelliteIntegrator] Sub-step ${i+1}/${numSubSteps} failed for satellite ${satellite.id}:`, err);
            return false;
            }
        }

        // Use the final result
        const resultVecs = { position: currentPos, velocity: currentVel };

        // Convert to raw arrays & sanity-check
        const newPos = resultVecs.position.toArray();
        const newVel = resultVecs.velocity.toArray();
        if (!newPos.every(Number.isFinite) || !newVel.every(Number.isFinite)) {
            console.error(`[SatelliteIntegrator] Non-finite result for satellite ${satellite.id}`);
            return false;
        }

        // Mutate satellite in-place
        satellite.position.set(newPos[0], newPos[1], newPos[2]);
        satellite.velocity.set(newVel[0], newVel[1], newVel[2]);
        satellite.lastUpdate = new Date(simulationTime.getTime());

        return true;
    }
} 