/**
 * SatelliteOrbitManager.js
 * 
 * Orchestrates satellite orbit visualization using specialized managers
 * Coordinates workers, caching, and Three.js rendering
 */
import { analyzeOrbit, calculatePropagationParameters } from '../physics/integrators/OrbitalIntegrators.js';
import { Constants } from '../physics/PhysicsAPI.js';
import { WorkerPoolManager } from './WorkerPoolManager.js';
import { OrbitCacheManager } from './OrbitCacheManager.js';
import { OrbitVisualizationManager } from './OrbitVisualizationManager.js';
import { GhostPlanetManager } from './GhostPlanetManager.js';
import { ApsisService } from '../services/ApsisService.js';
import { ApsisDetection } from '../services/ApsisDetection.js';

export class SatelliteOrbitManager {
    constructor(app) {
        this.app = app;
        this.physicsEngine = app.physicsIntegration;
        this.displaySettings = app.displaySettingsManager;

        // Initialize specialized managers
        this.workerPoolManager = new WorkerPoolManager();
        this.orbitCacheManager = new OrbitCacheManager();
        this.orbitVisualizationManager = new OrbitVisualizationManager(app);
        this.ghostPlanetManager = new GhostPlanetManager(app);
        this.apsisDetector = new ApsisDetection({
            minSeparation: 300, // 5 minutes minimum between apsis points
            tolerance: 0.001,   // 1 meter tolerance
            debugLogging: false
        });

        // Update throttling
        this.updateQueue = new Set();
        this.updateTimer = null;
    }


    /**
     * Initialize when physics engine is ready
     */
    initialize() {
        if (this.physicsEngine) {
            // Update workers with physics state
            this.workerPoolManager.updateWorkersPhysicsState(this.physicsEngine);
        } else {
            console.warn('[SatelliteOrbitManager] No physics engine available during initialization');
        }

        // Set up event listeners for satellite lifecycle
        this._setupEventListeners();

        // Schedule a check for existing satellites after a delay to handle scene loading
        this._scheduleInitialOrbitCheck();
    }

    /**
     * Schedule initial orbit check for existing satellites
     * This handles cases where satellites are loaded from a scene
     */
    _scheduleInitialOrbitCheck() {
        // Clear any existing timeout
        if (this._initialCheckTimeout) {
            clearTimeout(this._initialCheckTimeout);
        }

        this._initialCheckTimeout = setTimeout(() => {
            // Ensure workers have latest physics state before processing satellites
            if (this.physicsEngine) {
                this.workerPoolManager.updateWorkersPhysicsState(this.physicsEngine);
            }

            // Initialize orbits for any existing satellites (e.g., loaded from scene)
            if (this.physicsEngine?.physicsEngine?.satellites) {
                const satellites = this.physicsEngine.physicsEngine.satellites;
                if (satellites.size > 0) {
                    // Check if physics bodies are loaded
                    const bodies = this.physicsEngine.physicsEngine?.bodies;
                    if (!bodies || Object.keys(bodies).length === 0) {
                        this._scheduleInitialOrbitCheck();
                        return;
                    }
                    
                    for (const [satelliteId] of satellites) {
                        this.updateSatelliteOrbit(String(satelliteId));
                    }
                }
            }
            this._initialCheckTimeout = null;
        }, 500); // Increased delay to ensure physics is fully initialized
    }


    /**
     * Request orbit update for a satellite
     */
    updateSatelliteOrbit(satelliteId) {
        this.updateQueue.add(satelliteId);

        // Only set timer if one isn't already pending
        if (!this.updateTimer) {
            this.updateTimer = setTimeout(() => {
                this.updateTimer = null; // Clear timer reference
                this._processUpdateQueue();
            }, 100);
        }
    }

    /**
     * Request visualization for a maneuver node
     */
    requestManeuverNodeVisualization(satelliteId) {
        // Maneuver visualization now handled by UnifiedManeuverVisualizer
        // This method can be removed or simplified
        this.updateSatelliteOrbit(satelliteId);
    }


    /**
     * Process queued orbit updates
     */
    _processUpdateQueue() {
        if (!this.physicsEngine) {
            return;
        }
        
        for (const satelliteId of this.updateQueue) {
            // Ensure we're using string IDs consistently
            const strId = String(satelliteId);
            
            const satellite = this.physicsEngine.physicsEngine?.satellites?.get(strId);
            if (!satellite) {
                continue;
            }

            // Check if we have a valid cached orbit
            const cached = this.orbitCacheManager.getCachedOrbit(satelliteId);
            const stateChanged = this.orbitCacheManager.hasStateChanged(satellite, cached);

            // Check if we need more points than currently cached
            const satelliteProps = satellite.orbitSimProperties || {};
            const requestedPeriods = satelliteProps.periods || this.displaySettings?.getSetting('orbitPredictionInterval') || 1;
            const requestedPointsPerPeriod = satelliteProps.pointsPerPeriod || this.displaySettings?.getSetting('orbitPointsPerPeriod') || 180;
            const cachedPeriods = cached?.maxPeriods || 0;
            const cachedPointsPerPeriod = cached?.pointsPerPeriod || 180;
            const needsExtension = this.orbitCacheManager.needsExtension(cached, requestedPeriods) && !stateChanged;

            // Check if resolution changed significantly
            const resolutionChanged = Math.abs(requestedPointsPerPeriod - cachedPointsPerPeriod) > 30;

            // Check if there's an active job in progress
            const activeJob = this.workerPoolManager.getActiveJob(satelliteId);
            if (activeJob && activeJob.points.length > 0) {
                this._updateVisualization(satelliteId, activeJob.points, activeJob.soiTransitions);
                continue;
            }

            if (!stateChanged && cached && cached.points && !resolutionChanged) {
                if (requestedPeriods <= cachedPeriods) {
                    // Truncate cached points to requested periods if we have more than needed
                    const pointsToShow = this._truncateOrbitToRequestedPeriods(
                        cached.points,
                        requestedPeriods,
                        cachedPeriods
                    );
                    this._updateVisualization(satelliteId, pointsToShow);

                    // Update the cached orbit with truncated data for consistency
                    if (pointsToShow.length < cached.points.length) {
                        const truncatedCache = {
                            ...cached,
                            points: pointsToShow,
                            maxPeriods: requestedPeriods,
                            pointCount: pointsToShow.length
                        };
                        this.orbitCacheManager.setCachedOrbit(satelliteId, truncatedCache);
                    }
                    continue;
                }
            }

            // Calculate orbit parameters and start propagation
            this._calculateAndStartPropagation(satellite, strId, cached, needsExtension, stateChanged);
        }

        this.updateQueue.clear();
    }

    /**
     * Truncate orbit points to requested number of periods
     * @private
     */
    _truncateOrbitToRequestedPeriods(points, requestedPeriods, cachedPeriods) {
        if (requestedPeriods >= cachedPeriods || !points || points.length === 0) {
            return points;
        }

        // Calculate the ratio of points to keep
        const ratio = requestedPeriods / cachedPeriods;
        const targetPointCount = Math.floor(points.length * ratio);

        // Ensure we keep at least 2 points for a valid orbit
        const pointsToKeep = Math.max(2, targetPointCount);

        return points.slice(0, pointsToKeep);
    }

    /**
     * Calculate orbit parameters and start propagation
     */
    _calculateAndStartPropagation(satellite, satelliteId, cached, needsExtension, stateChanged) {
        // Analyze orbit to determine propagation parameters
        const centralBody = this.physicsEngine.physicsEngine?.bodies?.[satellite.centralBodyNaifId];
        if (!centralBody) {
            console.error(`[SatelliteOrbitManager] Central body ${satellite.centralBodyNaifId} not found`);
            return;
        }

        const orbitParams = analyzeOrbit(satellite, centralBody, Constants.PHYSICS.G);
        const satelliteProps = satellite.orbitSimProperties || {};
        const orbitPeriods = satelliteProps.periods || this.displaySettings?.getSetting('orbitPredictionInterval') || 1;
        const pointsPerPeriod = satelliteProps.pointsPerPeriod || this.displaySettings?.getSetting('orbitPointsPerPeriod') || 180;


        // Calculate propagation parameters using physics engine
        const { maxDuration, timeStep } = calculatePropagationParameters(
            orbitParams, orbitPeriods, pointsPerPeriod, needsExtension, cached
        );

        // Update workers with latest physics state
        this.workerPoolManager.updateWorkersPhysicsState(this.physicsEngine);

        // Determine starting conditions
        const { position, velocity, startTime, existingPoints } = this._determineStartingConditions(
            satellite, cached, needsExtension, stateChanged, orbitParams
        );

        // Dispatch calculation started event
        document.dispatchEvent(new CustomEvent('orbitCalculationStarted', {
            detail: { satelliteId }
        }));

        // Get maneuver nodes for this satellite from physics engine
        const maneuverNodes = this.physicsEngine?.physicsEngine?.satelliteEngine?.getManeuverNodes?.(satelliteId) || [];

        // Start propagation job
        const success = this.workerPoolManager.startPropagationJob({
            satelliteId,
            satellite: {
                position,
                velocity,
                centralBodyNaifId: satellite.centralBodyNaifId,
                mass: satellite.mass || 1000,
                crossSectionalArea: satellite.crossSectionalArea || 10,
                dragCoefficient: satellite.dragCoefficient || 2.2
            },
            duration: maxDuration,
            timeStep,
            orbitType: orbitParams.type, // Pass orbit type for hyperbolic trajectory handling
            hash: this.orbitCacheManager.computeStateHash(satellite),
            maxPeriods: orbitParams.type === 'elliptical' ?
                (needsExtension ? (cached?.maxPeriods || 0) + maxDuration / orbitParams.period : orbitPeriods) : null,
            pointsPerPeriod: pointsPerPeriod,
            startTime,
            existingPoints,
            isExtension: needsExtension,
            calculationTime: needsExtension && cached ? cached.calculationTime : (this.physicsEngine.physicsEngine?.simulationTime?.getTime() || Date.now()),
            requestedPeriods: orbitPeriods,
            requestedPointsPerPeriod: pointsPerPeriod,
            timeWarp: this.app.timeWarp || 1,
            integrationMethod: this.physicsEngine.physicsEngine?.satelliteEngine?.getIntegrationMethod() || 'auto',
            maneuverNodes: maneuverNodes
        }, this._handleWorkerMessage.bind(this));

        if (!success) {
            // No worker available - queue for later
            this.updateQueue.add(satelliteId);
        }
    }

    /**
     * Determine starting conditions for orbit propagation
     */
    _determineStartingConditions(satellite, cached, needsExtension, stateChanged) {
        let position, velocity, startTime, existingPoints;

        if (needsExtension && cached && !stateChanged) {
            // Extend existing orbit from last point
            const lastPoint = cached.points[cached.points.length - 1];
            position = lastPoint.position;
            velocity = lastPoint.velocity;
            startTime = lastPoint.time || 0;
            existingPoints = cached.points;
        } else {
            // Start fresh from current satellite state
            position = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
            velocity = satellite.velocity.toArray ? satellite.velocity.toArray() : satellite.velocity;
            startTime = 0; // Start from current time
            existingPoints = [];
        }

        return { position, velocity, startTime, existingPoints };
    }

    /**
     * Handle worker messages (delegated from WorkerPoolManager)
     */
    _handleWorkerMessage(type, satelliteId, points, params, isComplete, soiTransitions, error) {
        if (type === 'error') {
            console.error(`Orbit propagation error for satellite ${satelliteId}:`, error);
            return;
        }

        if (type === 'partial') {
            // Handle partial results preservation
            this.orbitCacheManager.setCachedOrbit(
                satelliteId,
                this.orbitCacheManager.createPartialCacheEntry(points, params, this.physicsEngine.physicsEngine)
            );
            return;
        }

        // Update visualization progressively
        this._updateVisualization(satelliteId, points, soiTransitions);

        if (isComplete) {
            if (params.isManeuverPrediction) {
                // Maneuver predictions now handled by UnifiedManeuverVisualizer
                // This branch can be simplified or removed
            } else {
                // Cache the complete orbit
                const satellite = this.physicsEngine.physicsEngine?.satellites?.get(satelliteId);
                this.orbitCacheManager.setCachedOrbit(
                    satelliteId,
                    this.orbitCacheManager.createCacheEntry(points, params, satellite, this.physicsEngine.physicsEngine)
                );

                // Final visualization update
                this._updateVisualization(satelliteId, points);

                // Dispatch completion event
                document.dispatchEvent(new CustomEvent('orbitUpdated', {
                    detail: {
                        satelliteId,
                        pointCount: points.length,
                        duration: params.duration,
                        maxPeriods: params.maxPeriods
                    }
                }));

                // Maneuver visualizations now handled by UnifiedManeuverVisualizer
            }
        }
    }


    /**
     * Update visualization (delegated to specialized managers)
     */
    _updateVisualization(satelliteId, points, workerTransitions = []) {
        if (points.length < 2) {
            return;
        }

        // Update orbit visualization
        this.orbitVisualizationManager.updateOrbitVisualization(
            satelliteId, points, this.physicsEngine?.physicsEngine, this.displaySettings
        );

        // Update apsis visualization for the satellite
        this._updateApsisVisualization(satelliteId, points);

        // Update ghost planets for SOI transitions
        let soiTransitions;
        if (workerTransitions && workerTransitions.length > 0) {
            soiTransitions = workerTransitions;
        } else {
            soiTransitions = this.ghostPlanetManager.findSOITransitions(points);
        }

        this.ghostPlanetManager.updateGhostPlanets(satelliteId, soiTransitions, points);
    }

    /**
     * Update apsis visualization for a satellite
     * @private
     */
    _updateApsisVisualization(satelliteId, points) {
        try {
            // Get satellite UI object
            const satelliteUI = this.app.satellites.satellites.get(satelliteId);
            if (!satelliteUI?.apsisVisualizer) {
                return; // No apsis visualizer for this satellite
            }

            // Check if we should show apsis markers
            const showOrbits = this.displaySettings?.getSetting('showOrbits');
            const showApsis = this.displaySettings?.getSetting('showApsis');
            if (!showOrbits || !showApsis) {
                satelliteUI.apsisVisualizer.setVisible(false);
                return;
            }

            // Get physics satellite data
            const physicsState = this.physicsEngine?.getSimulationState?.();
            const physicsSatellite = physicsState?.satellites?.[satelliteId];
            if (!physicsSatellite) {
                return; // No physics data available
            }

            // Get central body data
            const centralBodyId = physicsSatellite.centralBodyNaifId;
            const centralBody = this.physicsEngine?.physicsEngine?.bodies?.[centralBodyId];
            if (!centralBody) {
                console.warn(`[SatelliteOrbitManager] No central body data for NAIF ID ${centralBodyId}`);
                return;
            }

            // Use the new ApsisDetection service on orbit points
            if (points && points.length > 3) {
                try {
                    // Convert orbit points to format expected by ApsisDetection
                    const orbitData = points.map(point => ({
                        position: point.position,
                        time: point.time || 0,
                        centralBodyId: point.centralBodyId || centralBodyId
                    }));

                    // Detect apsis points using the new system
                    const apsisPoints = ApsisDetection.detectApsisPoints(orbitData);

                    if (apsisPoints.length > 0) {
                        // Find the next periapsis and apoapsis
                        const periapsisPoints = apsisPoints.filter(p => p.type === 'periapsis');
                        const apoapsisPoints = apsisPoints.filter(p => p.type === 'apoapsis');

                        const nextPeriapsis = periapsisPoints[0]; // First one is the next
                        const nextApoapsis = apoapsisPoints[0];   // First one is the next

                        // Get central body position for coordinate transformation
                        const centralBodyObj = this.physicsEngine?.bodies?.[centralBodyId];
                        const centralBodyPosition = centralBodyObj?.position?.toArray?.() || [0, 0, 0];

                        // Create apsis data for visualization (convert from absolute to planet-relative coordinates)
                        const apsisData = {
                            periapsis: nextPeriapsis ? {
                                position: [
                                    nextPeriapsis.position[0] - centralBodyPosition[0],
                                    nextPeriapsis.position[1] - centralBodyPosition[1],
                                    nextPeriapsis.position[2] - centralBodyPosition[2]
                                ],
                                altitude: nextPeriapsis.distance - centralBody.radius,
                                radius: nextPeriapsis.distance,
                                time: nextPeriapsis.time
                            } : null,
                            apoapsis: nextApoapsis ? {
                                position: [
                                    nextApoapsis.position[0] - centralBodyPosition[0],
                                    nextApoapsis.position[1] - centralBodyPosition[1],
                                    nextApoapsis.position[2] - centralBodyPosition[2]
                                ],
                                altitude: nextApoapsis.distance - centralBody.radius,
                                radius: nextApoapsis.distance,
                                time: nextApoapsis.time
                            } : null
                        };

                        // Update visualizer with detected apsis points
                        if (apsisData.periapsis || apsisData.apoapsis) {
                            satelliteUI.apsisVisualizer.update(apsisData);
                            satelliteUI.apsisVisualizer.setVisible(true);
                        } else {
                            satelliteUI.apsisVisualizer.setVisible(false);
                        }
                    } else {
                        satelliteUI.apsisVisualizer.setVisible(false);
                    }

                } catch (error) {
                    console.warn('[SatelliteOrbitManager] Error with new apsis detection, falling back to old method:', error);
                    // Fallback to simple orbit points analysis
                    this._fallbackApsisVisualization(satelliteUI, points, centralBody);
                }
            } else {
                satelliteUI.apsisVisualizer.setVisible(false);
            }
        } catch (error) {
            console.error('[SatelliteOrbitManager] Error updating apsis visualization:', error);
        }
    }

    /**
     * Fallback apsis visualization using simple min/max distance
     * @private
     */
    _fallbackApsisVisualization(satelliteUI, points, centralBody) {
        if (points.length > 2) {
            const apsisPoints = ApsisService.getOrbitApsisPoints(points.map(p => p.position), centralBody);
            if (apsisPoints.periapsis || apsisPoints.apoapsis) {
                satelliteUI.apsisVisualizer.updateFromOrbitPoints(points.map(p => p.position), centralBody);
                satelliteUI.apsisVisualizer.setVisible(true);
            } else {
                satelliteUI.apsisVisualizer.setVisible(false);
            }
        }
    }

    /**
     * Update satellite color
     */
    updateSatelliteColor(satelliteId, color) {
        this.orbitVisualizationManager.updateSatelliteColor(satelliteId, color);
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
            const {
                satelliteId,
                allProperties,
                needsRecalculation,
                forceRecalculation
            } = e.detail;

            // Get the satellite from physics engine
            const satellite = this.physicsEngine?.physicsEngine?.satellites?.get(satelliteId);
            if (satellite) {
                // Update the satellite's properties
                satellite.orbitSimProperties = allProperties;

                // Handle cache invalidation for forced recalculation
                if (forceRecalculation) {
                    // Clear the cached orbit to force full recalculation
                    this.orbitCacheManager.removeCachedOrbit(satelliteId);
                    // Cancel any active job for this satellite
                    this.workerPoolManager.cancelJob(satelliteId);
                }

                // Trigger orbit recalculation if needed
                if (needsRecalculation || forceRecalculation) {
                    this.updateSatelliteOrbit(satelliteId);
                }
            }
        };

        // Listen for satellite lifecycle events
        window.addEventListener('satelliteAdded', this._boundSatelliteAdded);
        window.addEventListener('satelliteRemoved', this._boundSatelliteRemoved);
        window.addEventListener('satellitePropertyUpdated', this._boundSatellitePropertyUpdated);
        document.addEventListener('satelliteSimPropertiesChanged', this._boundSatelliteSimPropertiesChanged);

        // Listen for scene state restoration (loading saved scenes)
        this._boundSceneStateRestored = () => {
            this._scheduleInitialOrbitCheck();
        };
        window.addEventListener('sceneStateRestored', this._boundSceneStateRestored);

        // Store display setting callbacks
        this._boundShowOrbitsCallback = () => {
            this._updateOrbitVisibility();
        };

        this._boundOrbitPredictionCallback = () => {
            // Clear cache and update all orbits
            this.orbitCacheManager.clearAll();
            if (this.physicsEngine?.physicsEngine?.satellites) {
                for (const satelliteId of this.physicsEngine.physicsEngine.satellites.keys()) {
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
        this.workerPoolManager.cancelJob(satelliteId);

        // Remove from cache
        this.orbitCacheManager.removeCachedOrbit(satelliteId);
        this.updateQueue.delete(satelliteId);

        // Remove visualization
        this.orbitVisualizationManager.removeSatelliteOrbit(satelliteId);

        // Remove ghost planets for this satellite
        this.ghostPlanetManager.removeGhostPlanets(satelliteId);
    }

    /**
     * Update visibility based on display settings
     */
    updateVisibility(visible) {
        this.orbitVisualizationManager.updateVisibility(visible);
    }

    /**
     * Clear all orbits
     */
    clearAll() {
        // Cancel all jobs
        for (const satelliteId of this.updateQueue) {
            this.workerPoolManager.cancelJob(satelliteId);
        }

        // Clear all visualizations
        this.orbitVisualizationManager.clearAll();

        // Clear ghost planets
        this.ghostPlanetManager.clearAll();

        // Clear cache
        this.orbitCacheManager.clearAll();
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

        // Clear initial check timeout
        if (this._initialCheckTimeout) {
            clearTimeout(this._initialCheckTimeout);
            this._initialCheckTimeout = null;
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
        if (this._boundSceneStateRestored) {
            window.removeEventListener('sceneStateRestored', this._boundSceneStateRestored);
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

        // Dispose specialized managers
        this.workerPoolManager?.dispose();
        this.orbitCacheManager?.dispose();
        this.orbitVisualizationManager?.dispose();
        this.ghostPlanetManager?.dispose();

        // Clear update queue
        this.updateQueue.clear();

        // Clear references
        this.app = null;
        this.physicsEngine = null;
        this.displaySettings = null;
    }
}