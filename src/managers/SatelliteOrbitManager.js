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
import { ManeuverOrbitHandler } from './ManeuverOrbitHandler.js';
import { GhostPlanetManager } from './GhostPlanetManager.js';
import { ApsisService } from '../services/ApsisService.js';

export class SatelliteOrbitManager {
    constructor(app) {
        this.app = app;
        this.physicsEngine = app.physicsIntegration?.physicsEngine;
        this.displaySettings = app.displaySettingsManager;
        
        // Initialize specialized managers
        this.workerPoolManager = new WorkerPoolManager();
        this.orbitCacheManager = new OrbitCacheManager();
        this.orbitVisualizationManager = new OrbitVisualizationManager(app);
        this.maneuverOrbitHandler = new ManeuverOrbitHandler(app, this.workerPoolManager, this.orbitCacheManager);
        this.ghostPlanetManager = new GhostPlanetManager(app);
        
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
        
        // Check initial orbit visibility setting
        this.displaySettings?.getSetting('showOrbits') ?? true;
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
     */
    requestManeuverNodeVisualization(satelliteId, maneuverNode) {
        const needsOrbitCalculation = !this.maneuverOrbitHandler.requestManeuverNodeVisualization(
            satelliteId, 
            maneuverNode, 
            this.physicsEngine
        );
        
        if (needsOrbitCalculation) {
            // Request orbit calculation first
            this.updateSatelliteOrbit(satelliteId);
        }
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
            const cached = this.orbitCacheManager.getCachedOrbit(satelliteId);
            const stateChanged = this.orbitCacheManager.hasStateChanged(satellite, cached);
            
            // Check if we need more points than currently cached
            const satelliteProps = satellite.orbitSimProperties || {};
            const requestedPeriods = satelliteProps.periods || this.displaySettings?.getSetting('orbitPredictionInterval') || 1;
            const cachedPeriods = cached?.maxPeriods || 0;
            const needsExtension = this.orbitCacheManager.needsExtension(cached, requestedPeriods) && !stateChanged;
            
            // Check if there's an active job in progress
            const activeJob = this.workerPoolManager.getActiveJob(satelliteId);
            if (activeJob && activeJob.points.length > 0) {
                this._updateVisualization(satelliteId, activeJob.points, activeJob.soiTransitions);
                continue;
            }
            
            if (!stateChanged && cached && cached.points) {
                if (requestedPeriods <= cachedPeriods) {
                    // Just update the visualization with different settings
                    this._updateVisualization(satelliteId, cached.points);
                    continue;
                }
            }

            // Calculate orbit parameters and start propagation
            this._calculateAndStartPropagation(satellite, satelliteId, cached, needsExtension, stateChanged);
        }

        this.updateQueue.clear();
    }

    /**
     * Calculate orbit parameters and start propagation
     */
    _calculateAndStartPropagation(satellite, satelliteId, cached, needsExtension, stateChanged) {
        // Analyze orbit to determine propagation parameters
        const centralBody = this.physicsEngine.bodies[satellite.centralBodyNaifId];
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
            hash: this.orbitCacheManager.computeStateHash(satellite),
            maxPeriods: orbitParams.type === 'elliptical' ? 
                (needsExtension ? (cached?.maxPeriods || 0) + maxDuration / orbitParams.period : maxDuration / orbitParams.period) : null,
            startTime,
            existingPoints,
            isExtension: needsExtension,
            calculationTime: needsExtension && cached ? cached.calculationTime : (this.physicsEngine.simulationTime?.getTime() || Date.now())
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
                this.orbitCacheManager.createPartialCacheEntry(points, params, this.physicsEngine)
            );
            return;
        }
        
        // Update visualization progressively
        this._updateVisualization(satelliteId, points, soiTransitions);
        
        if (isComplete) {
            if (params.isManeuverPrediction) {
                // Handle maneuver predictions
                this.maneuverOrbitHandler.updateManeuverPredictionVisualization(
                    params.parentSatelliteId,
                    params.maneuverNodeId,
                    points
                );
            } else {
                // Cache the complete orbit
                const satellite = this.physicsEngine.satellites.get(satelliteId);
                this.orbitCacheManager.setCachedOrbit(
                    satelliteId,
                    this.orbitCacheManager.createCacheEntry(points, params, satellite, this.physicsEngine)
                );
                
                // Final visualization update
                this._updateVisualization(satelliteId, points);
                
                // Process any queued maneuver visualizations
                this.maneuverOrbitHandler.processQueuedManeuvers(satelliteId, this.physicsEngine);
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
            satelliteId, points, workerTransitions, this.physicsEngine, this.displaySettings
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

            // Get physics satellite data
            const physicsState = this.physicsEngine?.getSimulationState?.();
            const physicsSatellite = physicsState?.satellites?.get?.(satelliteId);
            if (!physicsSatellite) {
                return; // No physics data available
            }

            // Get central body data
            const centralBodyId = physicsSatellite.centralBodyNaifId;
            const centralBody = this.physicsEngine?.bodies?.[centralBodyId];
            if (!centralBody) {
                console.warn(`[SatelliteOrbitManager] No central body data for NAIF ID ${centralBodyId}`);
                return;
            }

            // Check if we should show apsis markers
            const showOrbits = this.displaySettings?.getSetting('showOrbits');
            const showApsis = this.displaySettings?.getSetting('showApsis');
            if (!showOrbits || !showApsis) {
                satelliteUI.apsisVisualizer.setVisible(false);
                return;
            }

            // Try to use precise apsis calculation first
            if (physicsSatellite.position && physicsSatellite.velocity) {
                try {
                    const apsisData = ApsisService.getApsisData(
                        physicsSatellite, 
                        centralBody, 
                        new Date(), // Current time
                        { includeVisualization: true }
                    );
                    
                    if (apsisData && apsisData.visualization) {
                        satelliteUI.apsisVisualizer.update(apsisData);
                        satelliteUI.apsisVisualizer.setVisible(true);
                        return;
                    }
                } catch (error) {
                    console.warn('[SatelliteOrbitManager] Error calculating precise apsis data:', error);
                }
            }

            // Fallback to orbit points analysis
            if (points.length > 2) {
                const apsisPoints = ApsisService.getOrbitApsisPoints(points, centralBody);
                if (apsisPoints.periapsis || apsisPoints.apoapsis) {
                    satelliteUI.apsisVisualizer.updateFromOrbitPoints(points, centralBody);
                    satelliteUI.apsisVisualizer.setVisible(true);
                } else {
                    satelliteUI.apsisVisualizer.setVisible(false);
                }
            }
        } catch (error) {
            console.error('[SatelliteOrbitManager] Error updating apsis visualization:', error);
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
            this.orbitCacheManager.clearAll();
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
        
        // Dispose specialized managers
        this.workerPoolManager?.dispose();
        this.orbitCacheManager?.dispose();
        this.orbitVisualizationManager?.dispose();
        this.maneuverOrbitHandler?.dispose();
        this.ghostPlanetManager?.dispose();
        
        // Clear update queue
        this.updateQueue.clear();
        
        // Clear references
        this.app = null;
        this.physicsEngine = null;
        this.displaySettings = null;
    }
}