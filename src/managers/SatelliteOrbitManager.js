/**
 * SatelliteOrbitManager.js
 * 
 * Manages satellite orbit visualization using the new physics engine
 * Coordinates workers, caching, and Three.js rendering
 */
import * as THREE from 'three';
import { analyzeOrbit } from '../physics/integrators/OrbitalIntegrators.js';
import { Constants } from '../utils/Constants.js';
import { PhysicsAPI } from '../physics/PhysicsAPI.js';

export class SatelliteOrbitManager {
    constructor(app) {
        this.app = app;
        this.physicsEngine = app.physicsIntegration?.physicsEngine;
        this.displaySettings = app.displaySettingsManager;
        
        // Worker management - scale based on hardware
        this.workers = [];
        this.workerPool = [];
        // Use hardware concurrency but cap at 8 to avoid overwhelming the system
        this.maxWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);
        console.log(`[SatelliteOrbitManager] Using ${this.maxWorkers} workers (hardware concurrency: ${navigator.hardwareConcurrency})`);
        this.activeJobs = new Map();
        
        // Orbit data cache
        this.orbitCache = new Map(); // satelliteId -> { points, timestamp, hash }
        this.orbitLines = new Map(); // lineKey -> THREE.Line
        this.orbitSegmentCounts = new Map(); // satelliteId -> number of segments
        
        // No longer need a separate propagator
        
        // Update throttling
        this.updateQueue = new Set();
        this.updateTimer = null;
        
        // Maneuver visualization queue
        this.maneuverQueue = new Map(); // satelliteId -> maneuverNode[]
        
        this._initializeWorkers();
    }

    /**
     * Initialize worker pool
     */
    _initializeWorkers() {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(
                new URL('../workers/orbitPropagationWorker.js', import.meta.url),
                { type: 'module' }
            );
            
            worker.onmessage = this._handleWorkerMessage.bind(this);
            worker.onerror = this._handleWorkerError.bind(this);
            
            this.workers.push(worker);
            this.workerPool.push(worker);
        }
    }

    /**
     * Initialize propagator when physics engine is ready
     */
    initialize() {
        
        if (this.physicsEngine) {
            // Check if physics engine has bodies loaded
            const state = this.physicsEngine.getSimulationState?.();
            this._updateWorkersPhysicsState();
        } else {
            console.warn('[SatelliteOrbitManager] No physics engine available during initialization');
        }
        
        // Set up event listeners for satellite lifecycle
        this._setupEventListeners();
        
        // Check initial orbit visibility setting
        this.displaySettings?.getSetting('showOrbits') ?? true;
    }

    /**
     * Update physics state in all workers with complete solar system data
     */
    _updateWorkersPhysicsState() {
        if (!this.physicsEngine) {
            console.warn('[SatelliteOrbitManager] Cannot update workers - no physics engine');
            return;
        }

        const state = this.physicsEngine.getSimulationState();
        if (!state || !state.bodies) {
            console.warn('[SatelliteOrbitManager] Cannot update workers - no simulation state');
            return;
        }
        
        const simplifiedBodies = {};
        
        // Extract complete body data for solar system propagation
        for (const [id, body] of Object.entries(state.bodies)) {
            // Handle atmospheric model - can't send functions to workers
            let atmosphericModel = null;
            if (body.atmosphericModel) {
                atmosphericModel = {
                    maxAltitude: body.atmosphericModel.maxAltitude,
                    minAltitude: body.atmosphericModel.minAltitude,
                    referenceAltitude: body.atmosphericModel.referenceAltitude,
                    referenceDensity: body.atmosphericModel.referenceDensity,
                    scaleHeight: body.atmosphericModel.scaleHeight
                    // Exclude getDensity function - worker will use its own implementation
                };
            }
            
            simplifiedBodies[id] = {
                naif: parseInt(id),
                position: body.position.toArray ? body.position.toArray() : body.position,
                velocity: body.velocity.toArray ? body.velocity.toArray() : body.velocity,
                mass: body.mass,
                soiRadius: body.soiRadius,
                radius: body.radius,
                type: body.type,
                // Include properties needed for perturbations
                J2: body.J2,
                atmosphericModel: atmosphericModel,
                GM: body.GM || PhysicsAPI.getGravitationalParameter(body), // Use existing GM or centralized calculation
                rotationPeriod: body.rotationPeriod
            };
        }


        // Send to all workers with current simulation time
        this.workers.forEach(worker => {
            worker.postMessage({
                type: 'updatePhysicsState',
                data: {
                    bodies: simplifiedBodies,
                    hierarchy: state.hierarchy || null,
                    currentTime: this.physicsEngine.simulationTime?.getTime() || Date.now()
                }
            });
        });
    }

    /**
     * Request orbit update for a satellite
     */
    updateSatelliteOrbit(satelliteId) {
        this.updateQueue.add(satelliteId);
        
        // Debounce updates
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        this.updateTimer = setTimeout(() => {
            this._processUpdateQueue();
        }, 100);
    }

    /**
     * Request visualization for a maneuver node
     * This will calculate the position at maneuver time and post-maneuver orbit
     */
    requestManeuverNodeVisualization(satelliteId, maneuverNode) {
        
        const satellite = this.physicsEngine?.satellites.get(satelliteId);
        if (!satellite) {
            console.error(`[SatelliteOrbitManager] Satellite ${satelliteId} not found`);
            return;
        }
        
        // Get the current orbit data
        const orbitData = this.orbitCache.get(satelliteId);
        if (!orbitData || !orbitData.points || orbitData.points.length === 0) {
            console.warn(`[SatelliteOrbitManager] No orbit data available for satellite ${satelliteId}`);
            // Queue maneuver visualization for after orbit is calculated
            if (!this.maneuverQueue.has(satelliteId)) {
                this.maneuverQueue.set(satelliteId, []);
            }
            this.maneuverQueue.get(satelliteId).push(maneuverNode);
            // Request orbit calculation first
            this.updateSatelliteOrbit(satelliteId);
            return;
        }
        
        // Find the point in the orbit closest to maneuver execution time
        const currentTime = this.physicsEngine.simulationTime || new Date();
        const maneuverTime = maneuverNode.executionTime;
        const timeDelta = (maneuverTime.getTime() - currentTime.getTime()) / 1000; // seconds
        
        // Find the orbit point at or near the maneuver time
        let nodePoint = null;
        let nodeIndex = -1;
        
        for (let i = 0; i < orbitData.points.length; i++) {
            const point = orbitData.points[i];
            if (point.time >= timeDelta) {
                nodePoint = point;
                nodeIndex = i;
                break;
            }
        }
        
        if (!nodePoint) {
            console.warn(`[SatelliteOrbitManager] Maneuver time ${timeDelta}s is beyond orbit prediction`);
            nodePoint = orbitData.points[orbitData.points.length - 1]; // Use last point
            nodeIndex = orbitData.points.length - 1;
        }
        
        
        // Calculate world delta-V at the maneuver point
        const position = new THREE.Vector3(...nodePoint.position);
        const velocity = new THREE.Vector3(...(nodePoint.velocity || satellite.velocity.toArray()));
        
        const localDeltaV = new THREE.Vector3(
            maneuverNode.deltaV.prograde,
            maneuverNode.deltaV.normal,
            maneuverNode.deltaV.radial
        );
        
        const worldDeltaV = PhysicsAPI.localToWorldDeltaV(localDeltaV, position, velocity);
        
        // Create visualization data
        const visualData = {
            nodeId: maneuverNode.id,
            position: nodePoint.position,
            deltaVDirection: worldDeltaV.clone().normalize().toArray(), // Use clone() to avoid modifying original
            deltaVMagnitude: maneuverNode.deltaMagnitude,
            color: satellite.color || 0xffffff,
            scale: 1,
            showPredictedOrbit: true,
            predictedOrbitPoints: [],
            timeIndex: nodeIndex,
            referenceFrame: {
                centralBodyId: nodePoint.centralBodyId,
                position: position.toArray(),
                velocity: velocity.toArray()
            }
        };
        
        // Update the satellite's maneuver node visualizer
        const satObj = this.app.satellites?.satellites.get(satelliteId);
        if (satObj?.maneuverNodeVisualizer) {
            satObj.maneuverNodeVisualizer.updateNodeVisualization(visualData);
        } else {
            console.warn(`[SatelliteOrbitManager] Could not find satellite visualizer for ${satelliteId}`);
        }
        
        // Request post-maneuver orbit propagation
        this._requestPostManeuverOrbit(satelliteId, nodePoint, worldDeltaV, maneuverNode);
    }
    
    /**
     * Request orbit propagation after a maneuver
     */
    _requestPostManeuverOrbit(satelliteId, maneuverPoint, worldDeltaV, maneuverNode) {
        // Apply delta-V to velocity
        const preManeuverVel = new THREE.Vector3(...maneuverPoint.velocity);
        const postManeuverVelocity = preManeuverVel.clone().add(worldDeltaV);
        
        
        // Start a new propagation job for post-maneuver orbit
        const satellite = this.physicsEngine.satellites.get(satelliteId);
        const centralBody = this.physicsEngine.bodies[maneuverPoint.centralBodyId];
        
        // Analyze the new orbit
        const tempSat = {
            position: new THREE.Vector3(...maneuverPoint.position),
            velocity: postManeuverVelocity,
            centralBodyNaifId: maneuverPoint.centralBodyId
        };
        
        const orbitParams = analyzeOrbit(tempSat, centralBody, Constants.G);
        // Use per-satellite simulation properties if available, otherwise fall back to global settings
        const satelliteProps = satellite.orbitSimProperties || {};
        const orbitPeriods = satelliteProps.periods || this.displaySettings?.getSetting('orbitPredictionInterval') || 1;
        const pointsPerPeriod = satelliteProps.pointsPerPeriod || this.displaySettings?.getSetting('orbitPointsPerPeriod') || 180;
        
        let duration, timeStep;
        if (orbitParams.type === 'elliptical') {
            duration = orbitParams.period * orbitPeriods;
            timeStep = orbitParams.period / pointsPerPeriod;
        } else {
            duration = 86400 * orbitPeriods; // days in seconds
            timeStep = duration / (pointsPerPeriod * orbitPeriods);
        }
        
        // Create a unique ID for this maneuver prediction
        const predictionId = `${satelliteId}_maneuver_${maneuverNode.id}`;
        
        
        // Start propagation for post-maneuver orbit
        this._startPropagationJob({
            satelliteId: predictionId,
            satellite: {
                position: maneuverPoint.position,
                velocity: postManeuverVelocity.toArray(),
                centralBodyNaifId: maneuverPoint.centralBodyId,
                mass: satellite.mass || 1000,
                crossSectionalArea: satellite.crossSectionalArea || 10,
                dragCoefficient: satellite.dragCoefficient || 2.2
            },
            duration,
            timeStep,
            hash: `maneuver_${maneuverNode.id}`,
            isManeuverPrediction: true,
            parentSatelliteId: satelliteId,
            maneuverNodeId: maneuverNode.id
        });
    }

    /**
     * Process queued orbit updates
     */
    _processUpdateQueue() {
        if (!this.physicsEngine) {
            console.warn('[SatelliteOrbitManager] Cannot process queue - physics not ready');
            return;
        }


        for (const satelliteId of this.updateQueue) {
            const satellite = this.physicsEngine.satellites.get(satelliteId);
            if (!satellite) {
                console.warn(`[SatelliteOrbitManager] Satellite ${satelliteId} not found in physics engine`);
                continue;
            }

            // Check if we have a valid cached orbit
            const cached = this.orbitCache.get(satelliteId);
            const stateChanged = this._hasStateChanged(satellite, cached);
            
            // Check if we need more points than currently cached
            // Use per-satellite properties if available, otherwise fall back to global settings
            const satelliteProps = satellite.orbitSimProperties || {};
            const requestedPeriods = satelliteProps.periods || this.displaySettings?.getSetting('orbitPredictionInterval') || 1;
            const cachedPeriods = cached?.maxPeriods || 0;
            const needsExtension = cached && !stateChanged && requestedPeriods > cachedPeriods;
            
            
            // Check if there's an active job in progress
            const activeJob = this.activeJobs.get(satelliteId);
            if (activeJob && activeJob.points.length > 0) {
                this._updateOrbitVisualization(satelliteId, activeJob.points, activeJob.soiTransitions);
                continue;
            }
            
            if (!stateChanged && cached && cached.points) {
                if (requestedPeriods <= cachedPeriods) {
                    // Just update the visualization with different settings
                    this._updateOrbitVisualization(satelliteId, cached.points);
                    continue;
                }
            }

            // Analyze orbit to determine propagation parameters
            const centralBody = this.physicsEngine.bodies[satellite.centralBodyNaifId];
            if (!centralBody) {
                console.error(`[SatelliteOrbitManager] Central body ${satellite.centralBodyNaifId} not found`);
                continue;
            }
            const orbitParams = analyzeOrbit(satellite, centralBody, Constants.G);
            
            // Get per-satellite simulation properties, fall back to global display settings
            const orbitPeriods = satelliteProps.periods || this.displaySettings?.getSetting('orbitPredictionInterval') || 1;
            const pointsPerPeriod = satelliteProps.pointsPerPeriod || this.displaySettings?.getSetting('orbitPointsPerPeriod') || 180;
            
            // Calculate maximum reasonable duration for propagation
            let maxDuration;
            let maxPoints;
            
            if (orbitParams.type === 'elliptical') {
                // For closed orbits, calculate enough to cover the requested periods plus some buffer
                const buffer = 1.5; // 50% buffer for future increases
                const targetPeriods = orbitPeriods * buffer;
                
                if (needsExtension && cached.points) {
                    // We're extending - only calculate the additional periods needed
                    const additionalPeriods = targetPeriods - cachedPeriods;
                    maxDuration = orbitParams.period * additionalPeriods;
                    maxPoints = pointsPerPeriod * additionalPeriods;
                } else {
                    // Fresh calculation
                    maxDuration = orbitParams.period * targetPeriods;
                    maxPoints = pointsPerPeriod * targetPeriods;
                }
            } else {
                // For escape trajectories, propagate until SOI boundary
                const soiRadius = centralBody.soiRadius || 1e9; // km
                const currentRadius = satellite.position.length();
                const radialVelocity = satellite.position.dot(satellite.velocity) / currentRadius;
                
                if (radialVelocity > 0) {
                    // Escaping - estimate time to reach SOI
                    const distanceToSOI = soiRadius - currentRadius;
                    maxDuration = Math.abs(distanceToSOI / radialVelocity) * 1.5; // 1.5x for safety margin
                    // Cap at 1 year maximum
                    maxDuration = Math.min(maxDuration, 365 * 86400);
                } else {
                    // Not escaping - use one period worth of time
                    maxDuration = 86400; // 1 day default
                }
                
                maxPoints = Math.ceil(pointsPerPeriod * (maxDuration / 86400)); // Points scaled by days
            }

            // Calculate time step based on desired resolution
            const timeStep = orbitParams.type === 'elliptical' 
                ? orbitParams.period / pointsPerPeriod  // One period worth of resolution
                : maxDuration / maxPoints;

            // Update workers with latest solar system state before propagation
            this._updateWorkersPhysicsState();
            
            // Check if we just interrupted a job and have partial results
            const interruptedCache = this.orbitCache.get(satelliteId);
            const hasPartialResults = interruptedCache?.partial && interruptedCache?.points?.length > 0;
            
            // Determine propagation starting point
            let propagationPosition, propagationVelocity;
            let startTime = 0;
            let existingPoints = [];
            
            if (hasPartialResults && !stateChanged) {
                // We have partial results from an interrupted job - continue from there
                const lastPoint = interruptedCache.points[interruptedCache.points.length - 1];
                propagationPosition = lastPoint.position;
                propagationVelocity = lastPoint.velocity || satellite.velocity.toArray();
                startTime = lastPoint.time || 0;
                existingPoints = interruptedCache.points;
            } else if (needsExtension && cached.points && cached.points.length > 0) {
                // Extension: start from the last cached point
                const lastPoint = cached.points[cached.points.length - 1];
                propagationPosition = lastPoint.position;
                propagationVelocity = lastPoint.velocity || satellite.velocity.toArray();
                startTime = lastPoint.time || (cachedPeriods * orbitParams.period);
                existingPoints = cached.points;
            } else if (cached && cached.initialPosition && !stateChanged) {
                // Recalculation but state hasn't changed - use original initial state
                propagationPosition = cached.initialPosition;
                propagationVelocity = cached.initialVelocity;
            } else {
                // Fresh calculation from current state
                propagationPosition = satellite.position.toArray();
                propagationVelocity = satellite.velocity.toArray();
            }
            
            // Start propagation job
            this._startPropagationJob({
                satelliteId,
                satellite: {
                    position: propagationPosition,
                    velocity: propagationVelocity,
                    centralBodyNaifId: satellite.centralBodyNaifId,
                    // Include satellite properties for accurate propagation
                    mass: satellite.mass || 1000,
                    crossSectionalArea: satellite.crossSectionalArea || 10,
                    dragCoefficient: satellite.dragCoefficient || 2.2
                },
                duration: maxDuration,
                timeStep,
                hash: this._computeSimpleStateHash(satellite), // Only hash position/velocity
                maxPeriods: orbitParams.type === 'elliptical' ? 
                    (needsExtension ? cachedPeriods + maxDuration / orbitParams.period : maxDuration / orbitParams.period) : null,
                startTime,
                existingPoints,
                isExtension: needsExtension,
                calculationTime: needsExtension && cached ? cached.calculationTime : (this.physicsEngine.simulationTime?.getTime() || Date.now())
            });
        }

        this.updateQueue.clear();
    }

    /**
     * Start orbit propagation job
     */
    _startPropagationJob(params) {
        // Cancel existing job but preserve any partial results
        this._cancelJob(params.satelliteId, true);

        // Get available worker
        const worker = this.workerPool.pop();
        if (!worker) {
            // Queue for later
            this.updateQueue.add(params.satelliteId);
            return;
        }

        // Track active job
        this.activeJobs.set(params.satelliteId, {
            worker,
            params,
            points: params.existingPoints || [], // Start with existing points if extending
            startTime: Date.now()
        });
        

        // Send propagation request with satellite properties for drag calculation
        worker.postMessage({
            type: 'propagate',
            data: {
                satelliteId: params.satelliteId,
                position: params.satellite.position,
                velocity: params.satellite.velocity,
                centralBodyNaifId: params.satellite.centralBodyNaifId,
                duration: params.duration,
                timeStep: params.timeStep,
                startTime: params.startTime || 0,
                // Include satellite properties for accurate drag calculation
                mass: params.satellite.mass,
                crossSectionalArea: params.satellite.crossSectionalArea,
                dragCoefficient: params.satellite.dragCoefficient,
                // Disable solar system propagation for orbit visualization
                propagateSolarSystem: false
            }
        });
    }

    /**
     * Handle worker messages
     */
    _handleWorkerMessage(event) {
        const { type, satelliteId, points, isComplete, soiTransitions } = event.data;


        const job = this.activeJobs.get(satelliteId);
        if (!job) {
            // For 'complete' messages, this is normal since the job may have been cleaned up by 'chunk' with isComplete
            if (type !== 'complete') {
                console.warn(`[SatelliteOrbitManager] No active job found for satellite ${satelliteId}`);
            }
            return;
        }

        switch (type) {
            case 'chunk':
                // Accumulate points
                job.points.push(...points);
                // Also accumulate SOI transitions
                if (!job.soiTransitions) job.soiTransitions = [];
                if (soiTransitions && soiTransitions.length > 0) {
                    job.soiTransitions.push(...soiTransitions);
                }
                
                // Update visualization progressively
                this._updateOrbitVisualization(satelliteId, job.points, job.soiTransitions);
                
                if (isComplete) {
                    
                    // Handle maneuver predictions differently
                    if (job.params.isManeuverPrediction) {
                        // Send the predicted orbit to the maneuver node visualizer
                        this._updateManeuverPredictionVisualization(
                            job.params.parentSatelliteId,
                            job.params.maneuverNodeId,
                            job.points
                        );
                    } else {
                        // Cache the complete orbit
                        const satellite = this.physicsEngine.satellites.get(satelliteId);
                        this.orbitCache.set(satelliteId, {
                            points: job.points,
                            timestamp: Date.now(),
                            hash: job.params.hash,
                            maxPeriods: job.params.maxPeriods,
                            initialPosition: job.params.existingPoints?.length > 0 && job.params.existingPoints[0].position 
                                ? job.params.existingPoints[0].position 
                                : job.params.satellite.position,
                            initialVelocity: job.params.existingPoints?.length > 0 && job.params.existingPoints[0].velocity
                                ? job.params.existingPoints[0].velocity
                                : job.params.satellite.velocity,
                            calculationTime: job.params.calculationTime || (this.physicsEngine.simulationTime?.getTime() || Date.now()),
                            centralBodyNaifId: job.params.satellite.centralBodyNaifId,
                            lastManeuverTime: satellite?.lastManeuverTime,
                            partial: false // Mark as complete
                        });
                        
                        // Final visualization update
                        this._updateOrbitVisualization(satelliteId, job.points);
                        
                        // Process any queued maneuver visualizations
                        const queuedManeuvers = this.maneuverQueue.get(satelliteId);
                        if (queuedManeuvers && queuedManeuvers.length > 0) {
                            queuedManeuvers.forEach(maneuverNode => {
                                this.requestManeuverNodeVisualization(satelliteId, maneuverNode);
                            });
                            this.maneuverQueue.delete(satelliteId);
                        }
                    }
                    
                    // Return worker to pool
                    this.workerPool.push(job.worker);
                    this.activeJobs.delete(satelliteId);
                }
                break;

            case 'complete':
                // Job completed - do nothing here since we already handled cleanup in 'chunk' with isComplete
                // The job may have already been deleted by a 'chunk' message with isComplete: true
                break;

            case 'error':
                console.error(`Orbit propagation error for satellite ${satelliteId}:`, event.data.error);
                if (job) {
                    this.workerPool.push(job.worker);
                    this.activeJobs.delete(satelliteId);
                }
                break;
        }
    }

    /**
     * Handle worker errors
     */
    _handleWorkerError(error) {
        console.error('Orbit propagation worker error:', error);
    }

    /**
     * Update Three.js visualization
     */
    _updateOrbitVisualization(satelliteId, points, workerTransitions = []) {
        if (points.length < 2) {
            return;
        }

        // Determine how many points to actually display
        const satellite = this.physicsEngine.satellites.get(satelliteId);
        if (!satellite) return;
        
        // Get per-satellite simulation properties, fall back to global display settings
        const satelliteProps = satellite.orbitSimProperties || {};
        const orbitPeriods = satelliteProps.periods || this.displaySettings?.getSetting('orbitPredictionInterval') || 1;
        const pointsPerPeriod = satelliteProps.pointsPerPeriod || this.displaySettings?.getSetting('orbitPointsPerPeriod') || 180;
        
        const centralBody = this.physicsEngine.bodies[satellite.centralBodyNaifId];
        const orbitParams = analyzeOrbit(satellite, centralBody, Constants.G);
        
        // For now, just show all points - the orbit should be continuous
        // The physics engine will handle showing the correct portion based on time
        const displayPoints = points;
        

        // Group points by central body AND SOI transitions to create discontinuous segments
        const orbitSegments = [];
        let currentSegment = null;
        let currentBodyId = null;
        
        for (let i = 0; i < displayPoints.length; i++) {
            const point = displayPoints[i];
            
            // Start a new segment if:
            // 1. This is the first point
            // 2. The central body changed
            // 3. This point is marked as SOI entry
            if (!currentSegment || currentBodyId !== point.centralBodyId || point.isSOIEntry) {
                // Save previous segment if it exists
                if (currentSegment && currentSegment.points.length > 0) {
                    orbitSegments.push(currentSegment);
                }
                
                // Start new segment
                currentSegment = {
                    centralBodyId: point.centralBodyId,
                    points: [],
                    isAfterSOITransition: point.isSOIEntry || false
                };
                currentBodyId = point.centralBodyId;
            }
            
            currentSegment.points.push(point);
        }
        
        // Don't forget the last segment
        if (currentSegment && currentSegment.points.length > 0) {
            orbitSegments.push(currentSegment);
        }
        

        // Use worker-provided transitions if available, otherwise find them in points
        let soiTransitions;
        if (workerTransitions && workerTransitions.length > 0) {
            soiTransitions = workerTransitions;
        } else {
            // Find SOI transitions to create ghost planets
            soiTransitions = this._findSOITransitions(displayPoints);
        }
        
        // Create or update ghost planets for future SOI encounters
        this._updateGhostPlanets(satelliteId, soiTransitions, displayPoints);

        // Create or update orbit segments
        let segmentIndex = 0;
        for (const segment of orbitSegments) {
            const lineKey = `${satelliteId}_${segmentIndex}`;
            let line = this.orbitLines.get(lineKey);
            
            
            // Get the planet mesh group to add orbit to
            const planet = this.app.celestialBodies?.find(b => b.naifId === parseInt(segment.centralBodyId));
            // Use orbitGroup to match where satellite mesh is added (see Satellite.js _initVisuals)
            const parentGroup = planet?.orbitGroup || this.app.sceneManager?.scene;
            
            
            if (!parentGroup) {
                console.warn(`[SatelliteOrbitManager] No parent group found for body ${segment.centralBodyId}`);
                continue;
            }
            
            
            if (!line) {
                // Create new line
                const geometry = new THREE.BufferGeometry();
                const satellite = this.physicsEngine.satellites.get(satelliteId);
                const color = satellite?.color || 0xffff00;
                
                // Use dashed line for segments after SOI transitions
                const material = segment.isAfterSOITransition ? 
                    new THREE.LineDashedMaterial({
                        color: color,
                        opacity: 0.6,
                        transparent: true,
                        dashSize: 10,
                        gapSize: 5
                    }) :
                    new THREE.LineBasicMaterial({
                        color: color,
                        opacity: 0.6,
                        transparent: true
                    });
                
                line = new THREE.Line(geometry, material);
                line.frustumCulled = false;
                line.name = `orbit_${satelliteId}_segment_${segmentIndex}`;
                
                // Add to parent body's mesh group
                parentGroup.add(line);
                this.orbitLines.set(lineKey, line);
                
            }

            // Update geometry with positions relative to parent body
            const positions = new Float32Array(segment.points.length * 3);
            
            for (let i = 0; i < segment.points.length; i++) {
                const point = segment.points[i];
                // Positions are already relative to central body
                positions[i * 3] = point.position[0];
                positions[i * 3 + 1] = point.position[1];
                positions[i * 3 + 2] = point.position[2];
            }

            line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            line.geometry.setDrawRange(0, segment.points.length);
            line.geometry.computeBoundingSphere();
            
            // Compute line distances for dashed lines
            if (segment.isAfterSOITransition) {
                line.computeLineDistances();
            }
            
            
            
            segmentIndex++;
        }

        // Store the number of segments for this satellite
        this.orbitSegmentCounts.set(satelliteId, segmentIndex);
        
        // Update visibility based on display settings
        const visible = this.displaySettings?.getSetting('showOrbits') ?? true;
        
        for (let i = 0; i < segmentIndex; i++) {
            const line = this.orbitLines.get(`${satelliteId}_${i}`);
            if (line) {
                line.visible = visible;
            }
        }
    }

    /**
     * Cancel active job
     */
    _cancelJob(satelliteId, preservePartialResults = false) {
        const job = this.activeJobs.get(satelliteId);
        if (job) {
            // If we have partial results and want to preserve them, cache them first
            if (preservePartialResults && job.points && job.points.length > 0) {
                this.orbitCache.set(satelliteId, {
                    points: job.points,
                    timestamp: Date.now(),
                    hash: job.params.hash,
                    maxPeriods: job.params.maxPeriods,
                    initialPosition: job.params.satellite.position,
                    initialVelocity: job.params.satellite.velocity,
                    calculationTime: this.physicsEngine.simulationTime?.getTime() || Date.now(),
                    partial: true
                });
            }
            
            job.worker.postMessage({ type: 'cancel' });
            this.workerPool.push(job.worker);
            this.activeJobs.delete(satelliteId);
        }
    }

    /**
     * Check if satellite state has changed significantly
     */
    _hasStateChanged(satellite, cached) {
        if (!cached || !cached.initialPosition) return true;
        
        // Don't check current position - it's always changing!
        // Instead, check if we're still on the same orbit by comparing central body
        // and checking if a maneuver has occurred
        if (satellite.centralBodyNaifId !== cached.centralBodyNaifId) {
            return true;
        }
        
        // Check if a maneuver has occurred by looking for a significant velocity change
        // This would be set by the physics engine when a maneuver executes
        if (satellite.lastManeuverTime && (!cached.lastManeuverTime || 
            satellite.lastManeuverTime > cached.lastManeuverTime)) {
            return true;
        }
        
        return false;
    }

    /**
     * Compute simple hash of satellite physical state only
     */
    _computeSimpleStateHash(satellite) {
        // Handle both Vector3 and array formats
        const pos = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
        const vel = satellite.velocity.toArray ? satellite.velocity.toArray() : satellite.velocity;
        // Only include physical state, not display settings
        return `${pos[0].toFixed(3)},${pos[1].toFixed(3)},${pos[2].toFixed(3)},${vel[0].toFixed(3)},${vel[1].toFixed(3)},${vel[2].toFixed(3)},${satellite.centralBodyNaifId}`;
    }

    /**
     * Update satellite color
     */
    updateSatelliteColor(satelliteId, color) {
        const segmentCount = this.orbitSegmentCounts.get(satelliteId) || 0;
        for (let i = 0; i < segmentCount; i++) {
            const line = this.orbitLines.get(`${satelliteId}_${i}`);
            if (line) {
                line.material.color.set(color);
            }
        }
    }

    /**
     * Set up event listeners for satellite events
     */
    _setupEventListeners() {
        // Store bound event handlers for cleanup
        this._boundSatelliteAdded = (e) => {
            const satData = e.detail;
            this.updateSatelliteOrbit(String(satData.id));
        };
        
        this._boundSatelliteRemoved = (e) => {
            const satData = e.detail;
            const satelliteId = String(satData.id);
            this.removeSatelliteOrbit(satelliteId);
        };
        
        this._boundSatellitePropertyUpdated = (e) => {
            const { id, property, value } = e.detail;
            const satelliteId = String(id);
            
            // Update orbit if position/velocity changes
            if (property === 'position' || property === 'velocity') {
                this.updateSatelliteOrbit(satelliteId);
            }
            // Update orbit color if color changes
            else if (property === 'color') {
                this.updateSatelliteColor(satelliteId, value);
            }
        };
        
        this._boundSatelliteSimPropertiesChanged = (e) => {
            const { satelliteId, property, value, allProperties } = e.detail;
            console.log(`[SatelliteOrbitManager] Received sim properties change for satellite ${satelliteId}: ${property} = ${value}`);
            
            // Get the satellite from physics engine
            const satellite = this.physicsEngine?.satellites.get(satelliteId);
            if (satellite) {
                // Update the satellite's properties
                satellite.orbitSimProperties = allProperties;
                
                // Trigger orbit recalculation
                this.updateSatelliteOrbit(satelliteId);
            }
        };
        
        // Listen for satellite lifecycle events
        window.addEventListener('satelliteAdded', this._boundSatelliteAdded);
        window.addEventListener('satelliteRemoved', this._boundSatelliteRemoved);
        window.addEventListener('satellitePropertyUpdated', this._boundSatellitePropertyUpdated);
        document.addEventListener('satelliteSimPropertiesChanged', this._boundSatelliteSimPropertiesChanged);

        // Store display setting callbacks
        this._boundShowOrbitsCallback = () => {
            this._updateOrbitVisibility();
        };
        
        this._boundOrbitPredictionCallback = () => {
            // Clear cache and update all orbits
            this.orbitCache.clear();
            if (this.physicsEngine?.satellites) {
                for (const satelliteId of this.physicsEngine.satellites.keys()) {
                    this.updateSatelliteOrbit(satelliteId);
                }
            }
        };

        // Listen for display setting changes
        if (this.displaySettings) {
            this.displaySettings.addListener('showOrbits', this._boundShowOrbitsCallback);
            this.displaySettings.addListener('orbitPredictionInterval', this._boundOrbitPredictionCallback);
            this.displaySettings.addListener('orbitPointsPerPeriod', this._boundOrbitPredictionCallback);
        }
    }

    /**
     * Update orbit visibility based on display settings
     */
    _updateOrbitVisibility() {
        const visible = this.displaySettings?.getSetting('showOrbits') ?? true;
        this.updateVisibility(visible);
    }

    /**
     * Remove satellite orbit
     */
    removeSatelliteOrbit(satelliteId) {
        // Cancel any active job
        this._cancelJob(satelliteId);
        
        // Remove from cache
        this.orbitCache.delete(satelliteId);
        this.updateQueue.delete(satelliteId);
        
        // Remove all orbit segments
        const segmentCount = this.orbitSegmentCounts.get(satelliteId) || 0;
        for (let i = 0; i < segmentCount; i++) {
            const lineKey = `${satelliteId}_${i}`;
            const line = this.orbitLines.get(lineKey);
            if (line) {
                if (line.parent) {
                    line.parent.remove(line);
                }
                line.geometry.dispose();
                line.material.dispose();
                this.orbitLines.delete(lineKey);
            }
        }
        this.orbitSegmentCounts.delete(satelliteId);
        
        // Remove ghost planets for this satellite
        if (this.ghostPlanets) {
            const ghosts = this.ghostPlanets.get(satelliteId);
            if (ghosts) {
                for (const [key, ghost] of ghosts) {
                    if (ghost.group) {
                        this.app.scene.remove(ghost.group);
                        ghost.group.traverse(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) child.material.dispose();
                        });
                    }
                }
                this.ghostPlanets.delete(satelliteId);
            }
        }
    }

    /**
     * Update visibility based on display settings
     */
    updateVisibility(visible) {
        this.orbitLines.forEach(line => {
            line.visible = visible;
        });
    }

    /**
     * Clear all orbits
     */
    clearAll() {
        // Cancel all jobs
        for (const satelliteId of this.activeJobs.keys()) {
            this._cancelJob(satelliteId);
        }

        // Clear all visualizations
        for (const satelliteId of this.orbitSegmentCounts.keys()) {
            this.removeSatelliteOrbit(satelliteId);
        }
        
        // Clear ghost planets
        if (this.ghostPlanets) {
            for (const [satelliteId, ghosts] of this.ghostPlanets) {
                for (const [key, ghost] of ghosts) {
                    if (ghost.group) {
                        this.app.scene.remove(ghost.group);
                        ghost.group.traverse(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) child.material.dispose();
                        });
                    }
                }
            }
            this.ghostPlanets.clear();
        }

        // Clear cache
        this.orbitCache.clear();
        this.updateQueue.clear();
    }

    /**
     * Dispose of resources and clean up memory
     */
    dispose() {
        // Clear update timer
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        
        // Remove event listeners
        if (this._boundSatelliteAdded) {
            window.removeEventListener('satelliteAdded', this._boundSatelliteAdded);
            window.removeEventListener('satelliteRemoved', this._boundSatelliteRemoved);
            window.removeEventListener('satellitePropertyUpdated', this._boundSatellitePropertyUpdated);
        }
        if (this._boundSatelliteSimPropertiesChanged) {
            document.removeEventListener('satelliteSimPropertiesChanged', this._boundSatelliteSimPropertiesChanged);
        }
        
        // Remove display settings listeners
        if (this.displaySettings) {
            if (this._boundShowOrbitsCallback) {
                this.displaySettings.removeListener('showOrbits', this._boundShowOrbitsCallback);
            }
            if (this._boundOrbitPredictionCallback) {
                this.displaySettings.removeListener('orbitPredictionInterval', this._boundOrbitPredictionCallback);
                this.displaySettings.removeListener('orbitPointsPerPeriod', this._boundOrbitPredictionCallback);
            }
        }
        
        // Clear all orbits and dispose Three.js objects
        this.clearAll();
        
        // Terminate workers
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.workerPool = [];
        
        // Clear all maps and references
        this.activeJobs.clear();
        this.orbitCache.clear();
        this.orbitLines.clear();
        this.orbitSegmentCounts.clear();
        this.updateQueue.clear();
        
        // Clear references
        this.app = null;
        this.physicsEngine = null;
        this.displaySettings = null;
    }
    
    /**
     * Find SOI transitions in orbit points
     */
    _findSOITransitions(points) {
        const transitions = [];
        let lastBodyId = null;
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (lastBodyId !== null && point.centralBodyId !== lastBodyId) {
                // Found a transition
                transitions.push({
                    index: i,
                    time: point.time,
                    fromBody: lastBodyId,
                    toBody: point.centralBodyId,
                    position: point.position,
                    velocity: point.velocity,
                    centralBodyPosition: point.centralBodyPosition,
                    // Target body position might be included if this came from a worker transition
                    targetBodyPosition: point.targetBodyPosition
                });
            }
            lastBodyId = point.centralBodyId;
        }
        
        return transitions;
    }
    
    /**
     * Create or update ghost planets for SOI transitions
     */
    _updateGhostPlanets(satelliteId, transitions, points) {
        // Store ghost planets for this satellite
        if (!this.ghostPlanets) {
            this.ghostPlanets = new Map();
        }
        
        let satelliteGhosts = this.ghostPlanets.get(satelliteId);
        if (!satelliteGhosts) {
            satelliteGhosts = new Map();
            this.ghostPlanets.set(satelliteId, satelliteGhosts);
        }
        
        // Remove old ghost planets not in current transitions
        const currentTransitionKeys = new Set(transitions.map(t => `${t.fromBody}_${t.toBody}_${t.time}`));
        for (const [key, ghost] of satelliteGhosts) {
            if (!currentTransitionKeys.has(key)) {
                // Remove ghost planet
                if (ghost.group) {
                    this.app.scene.remove(ghost.group);
                    ghost.group.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                }
                satelliteGhosts.delete(key);
            }
        }
        
        // Create new ghost planets for transitions
        for (const transition of transitions) {
            const key = `${transition.fromBody}_${transition.toBody}_${transition.time}`;
            
            if (!satelliteGhosts.has(key)) {
                // Create ghost planet visualization
                const targetPlanet = this.app.celestialBodies?.find(b => b.naifId === parseInt(transition.toBody));
                if (!targetPlanet) {
                    console.warn(`[SatelliteOrbitManager] Target body ${transition.toBody} not found for ghost planet`);
                    continue;
                }
                
                // Get the physics body to access orbital data
                const targetPhysicsBody = this.physicsEngine?.bodies[transition.toBody];
                if (!targetPhysicsBody) {
                    console.warn(`[SatelliteOrbitManager] Physics body ${transition.toBody} not found for ghost planet`);
                    continue;
                }
                
                // Use the target body position calculated by the worker during propagation
                // This is the exact position of the planet at the moment of SOI transition
                let futurePosition = transition.targetBodyPosition || transition.centralBodyPosition;
                
                
                // Create a semi-transparent copy of the planet at the future position
                const ghostGroup = new THREE.Group();
                ghostGroup.name = `ghost_${targetPlanet.name}_${key}`;
                
                // Create ghost sphere
                const radius = targetPlanet.radius || 1000; // km
                const geometry = new THREE.SphereGeometry(radius, 32, 16);
                const material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    opacity: 0.2,
                    transparent: true,
                    wireframe: true
                });
                
                const ghostMesh = new THREE.Mesh(geometry, material);
                ghostGroup.add(ghostMesh);
                
                // Add SOI sphere
                if (targetPlanet.soiRadius) {
                    const soiGeometry = new THREE.SphereGeometry(targetPlanet.soiRadius, 16, 8);
                    const soiMaterial = new THREE.MeshBasicMaterial({
                        color: 0x00ff00,
                        opacity: 0.1,
                        transparent: true,
                        wireframe: true
                    });
                    const soiMesh = new THREE.Mesh(soiGeometry, soiMaterial);
                    ghostGroup.add(soiMesh);
                }
                
                // Add label to show time until SOI entry
                const timeToSOI = transition.time; // seconds
                const hoursToSOI = (timeToSOI / 3600).toFixed(1);
                const labelGeometry = new THREE.PlaneGeometry(radius * 2, radius * 0.5);
                const labelCanvas = document.createElement('canvas');
                labelCanvas.width = 512;
                labelCanvas.height = 128;
                const ctx = labelCanvas.getContext('2d');
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, 0, 512, 128);
                ctx.fillStyle = 'white';
                ctx.font = '48px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${targetPlanet.name} in ${hoursToSOI}h`, 256, 64);
                const labelTexture = new THREE.CanvasTexture(labelCanvas);
                const labelMaterial = new THREE.MeshBasicMaterial({
                    map: labelTexture,
                    transparent: true,
                    opacity: 0.8,
                    side: THREE.DoubleSide
                });
                const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
                labelMesh.position.y = radius * 1.5;
                labelMesh.lookAt(this.app.camera.position);
                ghostGroup.add(labelMesh);
                
                // Position at the future position
                if (futurePosition) {
                    ghostGroup.position.set(
                        futurePosition[0],
                        futurePosition[1],
                        futurePosition[2]
                    );
                }
                
                this.app.scene.add(ghostGroup);
                
                satelliteGhosts.set(key, {
                    group: ghostGroup,
                    transition: transition,
                    planet: targetPlanet,
                    labelMesh: labelMesh
                });
            }
        }
        
        // Update label orientations to face camera
        for (const [key, ghost] of satelliteGhosts) {
            if (ghost.labelMesh && this.app.camera) {
                ghost.labelMesh.lookAt(this.app.camera.position);
            }
        }
    }

    /**
     * Update maneuver prediction visualization
     */
    _updateManeuverPredictionVisualization(satelliteId, maneuverNodeId, orbitPoints) {
        
        // Get the satellite object
        const satellite = this.app.satellites?.satellites.get(satelliteId);
        if (!satellite || !satellite.maneuverNodeVisualizer) {
            console.warn(`[SatelliteOrbitManager] Satellite or visualizer not found for ${satelliteId}`);
            return;
        }
        
        // Update the maneuver node with predicted orbit points
        const nodeVisuals = satellite.maneuverNodeVisualizer.nodeVisuals.get(maneuverNodeId);
        if (!nodeVisuals) {
            console.warn(`[SatelliteOrbitManager] Node visual not found for ${maneuverNodeId}`);
            return;
        }
        
        // Create or update the predicted orbit line
        if (nodeVisuals.orbitLine) {
            // Update existing line
            const positions = new Float32Array(orbitPoints.length * 3);
            for (let i = 0; i < orbitPoints.length; i++) {
                const point = orbitPoints[i];
                positions[i * 3] = point.position[0];
                positions[i * 3 + 1] = point.position[1];
                positions[i * 3 + 2] = point.position[2];
            }
            nodeVisuals.orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            nodeVisuals.orbitLine.geometry.attributes.position.needsUpdate = true;
            nodeVisuals.orbitLine.computeLineDistances();
        } else {
            // Create new orbit line
            const positions = orbitPoints.map(p => new THREE.Vector3(...p.position));
            const geometry = new THREE.BufferGeometry().setFromPoints(positions);
            
            // Check if this is a preview
            const isPreview = maneuverNodeId && maneuverNodeId.startsWith('preview_');
            
            const material = new THREE.LineDashedMaterial({
                color: isPreview ? 0xffffff : (satellite.color || 0xffffff),
                dashSize: isPreview ? 8 : 5,
                gapSize: isPreview ? 8 : 5,
                linewidth: 2,
                transparent: true,
                opacity: isPreview ? 0.5 : 0.7
            });
            
            const orbitLine = new THREE.Line(geometry, material);
            orbitLine.computeLineDistances();
            orbitLine.frustumCulled = false;
            
            // Add to the appropriate parent group (same as regular orbits)
            const planet = this.app.celestialBodies?.find(b => b.naifId === parseInt(satellite.centralBodyNaifId));
            const parentGroup = planet?.orbitGroup || this.app.sceneManager?.scene;
            if (parentGroup) {
                parentGroup.add(orbitLine);
            } else {
                console.warn(`[SatelliteOrbitManager] No parent group found for predicted orbit`);
            }
            
            nodeVisuals.orbitLine = orbitLine;
        }
    }
}