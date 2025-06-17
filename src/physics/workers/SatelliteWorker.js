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
import { GroundTrackService } from '../../services/GroundTrackService.js';
import { ManeuverExecutor } from '../core/ManeuverExecutor.js';

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

        // Ground track service for coordinate transformations
        this.groundTrackService = new GroundTrackService();

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

                case 'propagateOrbit':
                    this._handlePropagateOrbit(taskId, data);
                    break;

                case 'generateGroundTrack':
                    this._handleGenerateGroundTrack(taskId, data);
                    break;

                case 'previewManeuver':
                    this._handlePreviewManeuver(taskId, data);
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
            console.log(`[SatelliteWorker] Received physics data update:`, {
                taskId,
                hasBodies: !!physicsData?.bodies,
                bodiesCount: physicsData?.bodies ? Object.keys(physicsData.bodies).length : 0,
                simulationTime: physicsData?.simulationTime
            });

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
                console.log(`[SatelliteWorker] Initialized hierarchy with ${bodiesMap.size} bodies`);
            }

            // Store physics data for propagation
            this.physicsData = physicsData;
            console.log(`[SatelliteWorker] Physics data stored successfully`);

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

        // Execute any pending maneuvers inside the worker (better separation of concerns)
        if (Array.isArray(satelliteData.maneuverNodes) && satelliteData.maneuverNodes.length > 0) {
            const currentSimTime = new Date(simulationTime);
            ManeuverExecutor.executePendingManeuvers(
                satellite,
                satelliteData.maneuverNodes,
                currentSimTime
            );
        }

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
            a_bodies: accelResult.components?.thirdBody || [0, 0, 0],
            a_bodies_direct: accelResult.components?.thirdBodyIndividual || {},
            // Add local frame components for proper vector visualization
            a_total_local: accelResult.components?.totalLocal || [0, 0, 0],
            a_gravity_total_local: accelResult.components?.primaryLocal || [0, 0, 0],
            a_j2_local: accelResult.components?.j2Local || [0, 0, 0],
            a_drag_local: accelResult.components?.dragLocal || [0, 0, 0],
            a_bodies_local: accelResult.components?.thirdBodyLocal || [0, 0, 0],
            a_bodies_direct_local: accelResult.components?.thirdBodyIndividualLocal || {}
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
            data: result  // Changed from 'result' to 'data' to match worker pool expectations
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

    /**
     * Handle orbit propagation request
     * @private
     */
    _handlePropagateOrbit(taskId, data) {
        const startTime = performance.now();

        try {
            const { satellite, duration, timeStep, maxPoints, includeJ2, includeDrag, includeThirdBody, maneuverNodes } = data;

            if (!satellite) {
                throw new Error('Missing satellite data for orbit propagation');
            }

            // Use current physics data or provided data
            const currentPhysics = this.physicsData;
            console.log(`[SatelliteWorker] Checking physics data for orbit propagation:`, {
                hasPhysicsData: !!this.physicsData,
                hasBodies: !!currentPhysics?.bodies,
                bodiesCount: currentPhysics?.bodies ? Object.keys(currentPhysics.bodies).length : 0
            });
            
            if (!currentPhysics || !currentPhysics.bodies) {
                throw new Error('No physics data available for orbit propagation');
            }

            // Debug: Log the satellite data received
            console.log(`[SatelliteWorker] Satellite data for orbit propagation:`, {
                satelliteId: satellite.id,
                hasPosition: !!satellite.position,
                hasVelocity: !!satellite.velocity,
                position: satellite.position,
                velocity: satellite.velocity,
                positionType: typeof satellite.position,
                velocityType: typeof satellite.velocity
            });

            // Get current simulation time from physics data
            const simulationTimeString = currentPhysics.simulationTime;
            const currentSimTime = simulationTimeString ? new Date(simulationTimeString) : new Date();
            const startTimeSeconds = currentSimTime.getTime() / 1000; // Convert to seconds since epoch

            const propagationParams = {
                satellite: {
                    position: satellite.position || [7000, 0, 0],
                    velocity: satellite.velocity || [0, 7.546, 0],
                    centralBodyNaifId: satellite.centralBodyNaifId || 399,
                    mass: satellite.mass || 1000,
                    crossSectionalArea: satellite.crossSectionalArea || 2.0, // Realistic satellite cross-section
                    dragCoefficient: satellite.dragCoefficient || 2.2
                },
                bodies: currentPhysics.bodies,
                duration: duration || 5400, // 90 minutes default
                timeStep: timeStep || 60,    // 1 minute default
                startTime: startTimeSeconds, // Use current simulation time
                maxPoints: maxPoints,
                includeJ2: includeJ2 !== false,
                includeDrag: includeDrag !== false,
                includeThirdBody: includeThirdBody !== false,
                timeWarp: 1,
                method: this.integrationMethod,
                maneuverNodes: maneuverNodes || [],
                perturbationScale: this.perturbationScale
            };

            console.log(`[SatelliteWorker] Calling UnifiedSatellitePropagator.propagateOrbit with params:`, {
                satelliteId: satellite.id,
                duration: propagationParams.duration,
                timeStep: propagationParams.timeStep,
                startTime: propagationParams.startTime,
                expectedPoints: Math.floor(propagationParams.duration / propagationParams.timeStep),
                includeJ2: propagationParams.includeJ2,
                includeDrag: propagationParams.includeDrag,
                includeThirdBody: propagationParams.includeThirdBody
            });

            // Use UnifiedSatellitePropagator for consistent physics
            const orbitPoints = UnifiedSatellitePropagator.propagateOrbit(propagationParams);

            console.log(`[SatelliteWorker] UnifiedSatellitePropagator returned:`, {
                pointsCount: orbitPoints ? orbitPoints.length : 0,
                firstPoint: orbitPoints && orbitPoints.length > 0 ? orbitPoints[0] : null,
                lastPoint: orbitPoints && orbitPoints.length > 0 ? orbitPoints[orbitPoints.length - 1] : null
            });

            const taskTime = performance.now() - startTime;
            this.taskCount++;
            this.totalTime += taskTime;
            this.lastTaskTime = taskTime;

            this._sendResult(taskId, 'propagateOrbit', {
                points: orbitPoints,
                satelliteId: satellite.id,
                taskTime,
                workerId: this.workerId
            });

        } catch (error) {
            const taskTime = performance.now() - startTime;
            console.error('[SatelliteWorker] Orbit propagation error:', error);
            this._sendError(taskId, `Orbit propagation failed: ${error.message}`, { taskTime });
        }
    }

    /**
     * Handle ground track generation request
     * @private
     */
    async _handleGenerateGroundTrack(taskId, data) {
        const startTime = performance.now();

        try {
            const {
                satellite,
                duration,
                timeStep,
                centralBodyNaifId,
                canvasWidth,
                canvasHeight,
                chunkSize = 50
            } = data;

            if (!satellite) {
                throw new Error('Missing satellite data for ground track generation');
            }

            // Use current physics data
            const currentPhysics = this.physicsData;
            if (!currentPhysics || !currentPhysics.bodies) {
                throw new Error('No physics data available for ground track generation');
            }

            // Get current simulation time from physics data
            const simulationTimeString = currentPhysics.simulationTime;
            const currentSimTime = simulationTimeString ? new Date(simulationTimeString) : new Date();
            const startTimeSeconds = currentSimTime.getTime() / 1000; // Convert to seconds since epoch

            // First propagate the orbit
            const propagationParams = {
                satellite: {
                    position: satellite.position,
                    velocity: satellite.velocity,
                    centralBodyNaifId: centralBodyNaifId || 399,
                    mass: satellite.mass || 1000,
                    crossSectionalArea: satellite.crossSectionalArea || 2.0, // Realistic satellite cross-section
                    dragCoefficient: satellite.dragCoefficient || 2.2
                },
                bodies: currentPhysics.bodies,
                duration: duration || 5400,
                timeStep: timeStep || 60,
                startTime: startTimeSeconds, // Use current simulation time
                includeJ2: true,
                includeDrag: false, // Usually disabled for ground track
                includeThirdBody: false,
                timeWarp: 1,
                method: this.integrationMethod,
                perturbationScale: this.perturbationScale
            };

            const orbitPoints = await UnifiedSatellitePropagator.propagateOrbit(propagationParams);

            // Get planet data for coordinate transformations
            const planetData = Object.values(currentPhysics.bodies).find(b => b.naifId === centralBodyNaifId);
            if (!planetData) {
                throw new Error(`Planet data not found for NAIF ID: ${centralBodyNaifId}`);
            }

            // Convert orbit points to ground track points
            const groundTrackPoints = [];
            let prevLon = undefined;

            for (let i = 0; i < orbitPoints.length; i++) {
                const point = orbitPoints[i];
                const pointTime = Date.now() + point.time * 1000; // Convert to absolute time

                try {
                    // Transform ECI to surface coordinates
                    const surface = await this.groundTrackService.transformECIToSurface(
                        point.position,
                        centralBodyNaifId || 399,
                        pointTime,
                        planetData
                    );

                    // Check for dateline crossing
                    const isDatelineCrossing = this.groundTrackService.isDatelineCrossing(prevLon, surface.lon);
                    prevLon = surface.lon;

                    // Calculate canvas coordinates if dimensions provided
                    let canvasX = 0, canvasY = 0;
                    if (canvasWidth && canvasHeight) {
                        const canvas = this.groundTrackService.projectToCanvas(surface.lat, surface.lon, canvasWidth, canvasHeight);
                        canvasX = canvas.x;
                        canvasY = canvas.y;
                    }

                    groundTrackPoints.push({
                        time: pointTime,
                        lat: surface.lat,
                        lon: surface.lon,
                        alt: surface.alt,
                        canvasX,
                        canvasY,
                        isDatelineCrossing,
                        eciPosition: point.position
                    });

                } catch (error) {
                    console.warn('[SatelliteWorker] Coordinate transformation failed:', error);
                    // Add point with zero coordinates as fallback
                    groundTrackPoints.push({
                        time: pointTime,
                        lat: 0,
                        lon: 0,
                        alt: 0,
                        canvasX: 0,
                        canvasY: 0,
                        isDatelineCrossing: false,
                        eciPosition: point.position
                    });
                }
            }

            // Send results in chunks
            for (let i = 0; i < groundTrackPoints.length; i += chunkSize) {
                const chunk = groundTrackPoints.slice(i, i + chunkSize);
                const progress = (i + chunk.length) / groundTrackPoints.length;
                const isComplete = i + chunk.length >= groundTrackPoints.length;

                this._sendResult(taskId, 'groundTrackChunk', {
                    satelliteId: satellite.id,
                    points: chunk,
                    progress,
                    isComplete,
                    workerId: this.workerId
                });

                // Yield control for large datasets
                if (!isComplete && groundTrackPoints.length > 1000 && i % 500 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            const taskTime = performance.now() - startTime;
            this.taskCount++;
            this.totalTime += taskTime;
            this.lastTaskTime = taskTime;

        } catch (error) {
            const taskTime = performance.now() - startTime;
            console.error('[SatelliteWorker] Ground track generation error:', error);
            this._sendError(taskId, `Ground track generation failed: ${error.message}`, { taskTime });
        }
    }

    /**
     * Handle maneuver preview request
     * @private
     */
    _handlePreviewManeuver(taskId, data) {
        const startTime = performance.now();

        try {
            const { satellite, maneuver, duration, timeStep } = data;

            if (!satellite || !maneuver) {
                throw new Error('Missing satellite or maneuver data for preview');
            }

            // Use current physics data
            const currentPhysics = this.physicsData;
            if (!currentPhysics || !currentPhysics.bodies) {
                throw new Error('No physics data available for maneuver preview');
            }

            // Get current simulation time from physics data
            const simulationTimeString = currentPhysics.simulationTime;
            const currentSimTime = simulationTimeString ? new Date(simulationTimeString) : new Date();
            const startTimeSeconds = currentSimTime.getTime() / 1000; // Convert to seconds since epoch

            // Create maneuver nodes array
            const maneuverNodes = [{
                executionTime: maneuver.executionTime,
                deltaV: maneuver.deltaV
            }];

            const propagationParams = {
                satellite: {
                    position: satellite.position,
                    velocity: satellite.velocity,
                    centralBodyNaifId: satellite.centralBodyNaifId || 399,
                    mass: satellite.mass || 1000,
                    crossSectionalArea: satellite.crossSectionalArea || 2.0, // Realistic satellite cross-section
                    dragCoefficient: satellite.dragCoefficient || 2.2
                },
                bodies: currentPhysics.bodies,
                duration: duration || 5400,
                timeStep: timeStep || 60,
                startTime: startTimeSeconds, // Use current simulation time
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: true,
                timeWarp: 1,
                method: this.integrationMethod,
                maneuverNodes: maneuverNodes,
                perturbationScale: this.perturbationScale
            };

            // Propagate with maneuver
            const orbitWithManeuver = UnifiedSatellitePropagator.propagateOrbit(propagationParams);

            // Also propagate without maneuver for comparison
            const baselineParams = { ...propagationParams, maneuverNodes: [] };
            const baselineOrbit = UnifiedSatellitePropagator.propagateOrbit(baselineParams);

            const taskTime = performance.now() - startTime;
            this.taskCount++;
            this.totalTime += taskTime;
            this.lastTaskTime = taskTime;

            this._sendResult(taskId, 'previewManeuver', {
                satelliteId: satellite.id,
                orbitWithManeuver,
                baselineOrbit,
                maneuver,
                taskTime,
                workerId: this.workerId
            });

        } catch (error) {
            const taskTime = performance.now() - startTime;
            console.error('[SatelliteWorker] Maneuver preview error:', error);
            this._sendError(taskId, `Maneuver preview failed: ${error.message}`, { taskTime });
        }
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