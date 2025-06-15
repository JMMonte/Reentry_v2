/**
 * SatelliteWorker.js
 * 
 * Web Worker for satellite orbit propagation
 * Runs satellite physics calculations in parallel
 */

// Import physics modules for worker context
import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { PhysicsVector3 } from '../utils/PhysicsVector3.js';
import { PhysicsConstants } from '../core/PhysicsConstants.js';
import { SolarSystemHierarchy } from '../SolarSystemHierarchy.js';
import { SOITransitionManager } from '../utils/SOITransitionManager.js';
import { integrateRK4, getIntegrator } from '../integrators/OrbitalIntegrators.js';

class SatelliteWorkerEngine {
    constructor() {
        this.workerId = null;
        this.physicsData = null;
        this.integrationMethod = 'auto';
        this.sensitivityScale = 1.0;
        this.physicsTimeStep = 0.05;
        this.perturbationScale = 1.0;
        this.hierarchy = null; // Will be initialized when physics data is received
        this.soiTransitionManager = null; // Will be initialized when hierarchy is available
        
        // Working vectors to avoid GC pressure
        this._workVec1 = new PhysicsVector3();
        this._workVec2 = new PhysicsVector3();
        this._workVec3 = new PhysicsVector3();
        
        // Performance tracking
        this.taskCount = 0;
        this.totalTime = 0;
        this.lastTaskTime = 0;

        console.log('[SatelliteWorker] Worker initialized');
    }

    /**
     * Handle incoming messages from main thread
     */
    handleMessage(event) {
        const { type, taskId, data } = event.data;

        try {
            switch (type) {
                case 'ping':
                    this._handlePing(taskId);
                    break;

                case 'updatePhysics':
                    this._handleUpdatePhysics(taskId, data);
                    break;

                case 'propagate':
                    this._handlePropagate(taskId, data);
                    break;

                case 'configure':
                case 'updateConfig':
                    this._handleConfigure(taskId, data);
                    break;

                default:
                    this._sendError(taskId, `Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error('[SatelliteWorker] Error handling message:', error);
            this._sendError(taskId, error.message);
        }
    }

    /**
     * Handle ping request
     * @private
     */
    _handlePing(taskId) {
        this._sendResult(taskId, 'ping', {
            status: 'ready',
            workerId: this.workerId,
            timestamp: Date.now()
        });
    }

    /**
     * Handle physics data update
     * @private
     */
    _handleUpdatePhysics(taskId, physicsData) {
        try {
            // Initialize hierarchy if we have bodies data
            if (physicsData.bodies && !this.hierarchy) {
                // Convert bodies object to Map for SolarSystemHierarchy
                const bodiesMap = new Map();
                for (const [naifId, body] of Object.entries(physicsData.bodies)) {
                    bodiesMap.set(parseInt(naifId), body);
                }
                this.hierarchy = new SolarSystemHierarchy(bodiesMap);
                
                // Initialize SOI transition manager
                this.soiTransitionManager = new SOITransitionManager(this.hierarchy);
            }
            
            // Store physics data for propagation
            this.physicsData = physicsData;
            
            this._sendResult(taskId, 'updatePhysics', { success: true });
        } catch (error) {
            console.error('[SatelliteWorker] Error updating physics:', error);
            this._sendError(taskId, error.message);
        }
    }

    /**
     * Handle satellite propagation
     * @private
     */
    _handlePropagate(taskId, data) {
        const startTime = performance.now();

        try {
            const { satellite, physics } = data;

            if (!satellite || !physics) {
                throw new Error('Missing satellite or physics data');
            }

            // Use provided physics data or fallback to stored data
            const currentPhysics = physics || this.physicsData;
            if (!currentPhysics || !currentPhysics.bodies) {
                throw new Error('No physics data available for propagation');
            }

            // Propagate satellite
            const result = this._propagateSatellite(satellite, currentPhysics);

            const taskTime = performance.now() - startTime;
            this.taskCount++;
            this.totalTime += taskTime;
            this.lastTaskTime = taskTime;

            this._sendResult(taskId, 'propagate', {
                ...result,
                satelliteId: satellite.id,
                taskTime,
                workerId: this.workerId
            });

        } catch (error) {
            const taskTime = performance.now() - startTime;
            console.error('[SatelliteWorker] Propagation error:', error);
            this._sendError(taskId, `Propagation failed: ${error.message}`, { taskTime });
        }
    }

    /**
     * Handle worker configuration
     * @private
     */
    _handleConfigure(taskId, config) {
        try {
            if (config.workerId !== undefined) {
                this.workerId = config.workerId;
            }
            if (config.integrationMethod) {
                this.integrationMethod = config.integrationMethod;
            }
            if (config.sensitivityScale !== undefined) {
                this.sensitivityScale = config.sensitivityScale;
            }
            if (config.physicsTimeStep !== undefined) {
                this.physicsTimeStep = config.physicsTimeStep;
            }
            if (config.perturbationScale !== undefined) {
                this.perturbationScale = config.perturbationScale;
            }

            this._sendResult(taskId, 'configure', {
                status: 'configured',
                workerId: this.workerId,
                integrationMethod: this.integrationMethod,
                sensitivityScale: this.sensitivityScale,
                physicsTimeStep: this.physicsTimeStep,
                perturbationScale: this.perturbationScale
            });
        } catch (error) {
            this._sendError(taskId, `Configuration failed: ${error.message}`);
        }
    }

    /**
     * Propagate a single satellite
     * @private
     */
    _propagateSatellite(satelliteData, physicsData) {
        const { deltaTime, timeWarp = 1, simulationTime } = physicsData;

        if (!deltaTime || deltaTime <= 0) {
            throw new Error('Invalid deltaTime for propagation');
        }

        // Create satellite state
        const satellite = {
            id: satelliteData.id,
            position: new PhysicsVector3(...satelliteData.position),
            velocity: new PhysicsVector3(...satelliteData.velocity),
            acceleration: new PhysicsVector3(...(satelliteData.acceleration || [0, 0, 0])),
            mass: satelliteData.mass || PhysicsConstants.SATELLITE_DEFAULTS.MASS,
            crossSectionalArea: satelliteData.crossSectionalArea || PhysicsConstants.SATELLITE_DEFAULTS.CROSS_SECTIONAL_AREA,
            dragCoefficient: satelliteData.dragCoefficient || PhysicsConstants.SATELLITE_DEFAULTS.DRAG_COEFFICIENT,
            ballisticCoefficient: satelliteData.ballisticCoefficient,
            centralBodyNaifId: satelliteData.centralBodyNaifId,
            lastUpdate: new Date(simulationTime)
        };

        // Check for maneuvers (simplified - no maneuver execution in worker for now)
        // Maneuvers will be handled in main thread before sending to worker

        // Compute acceleration using UnifiedSatellitePropagator
        const accelResult = this._computeAcceleration(satellite, physicsData.bodies);

        // Integrate using UnifiedSatellitePropagator
        const position = satellite.position.toArray();
        const velocity = satellite.velocity.toArray();

        const accelerationFunc = (pos, vel) => {
            const satState = {
                position: pos,
                velocity: vel,
                centralBodyNaifId: satellite.centralBodyNaifId,
                mass: satellite.mass,
                crossSectionalArea: satellite.crossSectionalArea,
                dragCoefficient: satellite.dragCoefficient,
                ballisticCoefficient: satellite.ballisticCoefficient
            };
            return UnifiedSatellitePropagator.computeAcceleration(satState, physicsData.bodies, {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                perturbationScale: this.perturbationScale
            });
        };

        // Determine integration method
        let method = this.integrationMethod;
        if (method === 'auto') {
            // Conservative selection for worker: prefer RK4 for stability
            method = (timeWarp >= 100 && deltaTime > 60) ? 'rk45' : 'rk4';
        }

        // Use optimized integrators from OrbitalIntegrators.js
        const integrator = getIntegrator(method);
        const posVec = new PhysicsVector3(...position);
        const velVec = new PhysicsVector3(...velocity);

        let integrationResult;
        let recovered = false;
        let recoveryMethod = null;

        try {
            // Primary integration attempt using optimized integrators
            if (method === 'rk45' || method === 'adaptive') {
                integrationResult = integrator(
                    posVec,
                    velVec,
                    (p, v) => {
                        const accel = accelerationFunc(p.toArray(), v.toArray());
                        return new PhysicsVector3(...accel);
                    },
                    deltaTime * timeWarp,
                    {
                        absTol: 1e-6 / this.sensitivityScale,
                        relTol: 1e-6 / this.sensitivityScale,
                        sensitivityScale: this.sensitivityScale || 1.0
                    }
                );
            } else {
                integrationResult = integrator(
                    posVec,
                    velVec,
                    (p, v) => {
                        const accel = accelerationFunc(p.toArray(), v.toArray());
                        return new PhysicsVector3(...accel);
                    },
                    deltaTime * timeWarp
                );
            }

            // Validate integration result
            if (!integrationResult.position.toArray().every(v => isFinite(v)) ||
                !integrationResult.velocity.toArray().every(v => isFinite(v))) {
                throw new Error('Integration produced non-finite values');
            }

        } catch (error) {
            // Attempt recovery with smaller timestep and stable RK4
            console.warn(`[SatelliteWorker] Integration failed, attempting recovery:`, error.message);

            try {
                const recoveryResult = integrateRK4(
                    posVec,
                    velVec,
                    (p, v) => {
                        const accel = accelerationFunc(p.toArray(), v.toArray());
                        return new PhysicsVector3(...accel);
                    },
                    deltaTime * 0.1 // 10x smaller timestep, no time warp
                );

                if (recoveryResult.position.toArray().every(v => isFinite(v)) &&
                    recoveryResult.velocity.toArray().every(v => isFinite(v))) {
                    integrationResult = recoveryResult;
                    recovered = true;
                    recoveryMethod = 'smallerTimestep';
                } else {
                    throw new Error('Recovery integration also failed');
                }
            } catch (recoveryError) {
                throw new Error(`Integration failed and recovery unsuccessful: ${recoveryError.message}`);
            }
        }

        // Convert result back to arrays for consistency with existing code
        integrationResult = {
            position: integrationResult.position.toArray(),
            velocity: integrationResult.velocity.toArray(),
            recovered,
            recoveryMethod
        };

        // Handle SOI transitions using the manager
        let finalPosition = integrationResult.position;
        let finalVelocity = integrationResult.velocity;
        let newCentralBodyNaifId = satellite.centralBodyNaifId;

        if (this.soiTransitionManager) {
            const satelliteState = {
                position: integrationResult.position,
                velocity: integrationResult.velocity,
                centralBodyNaifId: satellite.centralBodyNaifId
            };
            
            const transitionOccurred = this.soiTransitionManager.performTransition(
                satelliteState,
                physicsData.bodies
            );
            
            if (transitionOccurred) {
                finalPosition = satelliteState.position;
                finalVelocity = satelliteState.velocity;
                newCentralBodyNaifId = satelliteState.centralBodyNaifId;
            }
        }

        return {
            position: finalPosition,
            velocity: finalVelocity,
            acceleration: accelResult.total,
            centralBodyNaifId: newCentralBodyNaifId,
            lastUpdate: new Date(simulationTime).toISOString(),
            method: method,
            recovered: integrationResult.recovered || false,
            soiTransition: newCentralBodyNaifId !== satellite.centralBodyNaifId,
            // Force components for visualization
            a_total: accelResult.total,
            a_gravity_total: accelResult.components?.primary || [0, 0, 0],
            a_j2: accelResult.components?.j2 || [0, 0, 0],
            a_drag: accelResult.components?.drag || [0, 0, 0],
            a_bodies: accelResult.components?.thirdBodies || [0, 0, 0],
            a_bodies_direct: accelResult.components?.thirdBodiesDirect || [0, 0, 0]
        };
    }

    /**
     * Compute satellite acceleration
     * @private
     */
    _computeAcceleration(satellite, bodies) {
        const satState = {
            position: satellite.position.toArray(),
            velocity: satellite.velocity.toArray(),
            centralBodyNaifId: satellite.centralBodyNaifId,
            mass: satellite.mass,
            crossSectionalArea: satellite.crossSectionalArea,
            dragCoefficient: satellite.dragCoefficient,
            ballisticCoefficient: satellite.ballisticCoefficient
        };

        // Convert bodies to array format for UnifiedSatellitePropagator
        const bodiesArray = {};
        for (const [naifId, body] of Object.entries(bodies)) {
            bodiesArray[naifId] = {
                ...body,
                position: Array.isArray(body.position) ? body.position : body.position.toArray(),
                velocity: Array.isArray(body.velocity) ? body.velocity : body.velocity.toArray()
            };
        }

        return UnifiedSatellitePropagator.computeAcceleration(
            satState,
            bodiesArray,
            {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                detailed: true,
                debugLogging: false,
                perturbationScale: this.perturbationScale
            }
        );
    }



    /**
     * Send successful result back to main thread
     * @private
     */
    _sendResult(taskId, type, result) {
        self.postMessage({
            taskId,
            type,
            result
        });
    }

    /**
     * Send error back to main thread
     * @private
     */
    _sendError(taskId, error, additionalData = {}) {
        self.postMessage({
            taskId,
            error: error,
            ...additionalData
        });
    }
}

// Initialize worker engine
const workerEngine = new SatelliteWorkerEngine();

// Set up message listener
self.onmessage = (event) => {
    workerEngine.handleMessage(event);
};

// Handle worker errors
self.onerror = (error) => {
    console.error('[SatelliteWorker] Worker error:', error);
};

// Export for testing (won't be used in worker context)
export { SatelliteWorkerEngine }; 