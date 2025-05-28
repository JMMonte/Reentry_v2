/**
 * SatelliteOrbitManager.js
 * 
 * Manages satellite orbit visualization using the new physics engine
 * Coordinates workers, caching, and Three.js rendering
 */
import * as THREE from 'three';
import { NumericalPropagator } from '../physics/NumericalPropagator.js';

export class SatelliteOrbitManager {
    constructor(app) {
        this.app = app;
        this.physicsEngine = app.physicsIntegration?.physicsEngine;
        this.displaySettings = app.displaySettings;
        
        // Worker management
        this.workers = [];
        this.workerPool = [];
        this.maxWorkers = 4;
        this.activeJobs = new Map();
        
        // Orbit data cache
        this.orbitCache = new Map(); // satelliteId -> { points, timestamp, hash }
        this.orbitLines = new Map(); // lineKey -> THREE.Line
        this.orbitSegmentCounts = new Map(); // satelliteId -> number of segments
        
        // Propagator for orbit analysis
        this.propagator = null;
        
        // Update throttling
        this.updateQueue = new Set();
        this.updateTimer = null;
        
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
        console.log('[SatelliteOrbitManager] Initializing...');
        console.log('[SatelliteOrbitManager] Physics engine available:', !!this.physicsEngine);
        console.log('[SatelliteOrbitManager] Display settings available:', !!this.displaySettings);
        
        if (this.physicsEngine) {
            this.propagator = new NumericalPropagator(this.physicsEngine);
            this._updateWorkersPhysicsState();
            console.log('[SatelliteOrbitManager] Propagator initialized');
        }
        
        // Set up event listeners for satellite lifecycle
        this._setupEventListeners();
        
        // Check initial orbit visibility setting
        const initialVisibility = this.displaySettings?.getSetting('showOrbits') ?? true;
        console.log('[SatelliteOrbitManager] Initial orbit visibility:', initialVisibility);
    }

    /**
     * Update physics state in all workers
     */
    _updateWorkersPhysicsState() {
        if (!this.physicsEngine) return;

        const state = this.physicsEngine.getSimulationState();
        const simplifiedBodies = {};
        
        // Extract essential body data for workers
        for (const [id, body] of Object.entries(state.bodies)) {
            simplifiedBodies[id] = {
                position: body.position,
                velocity: body.velocity,
                mass: body.mass,
                soiRadius: body.soiRadius
            };
        }

        // Send to all workers
        this.workers.forEach(worker => {
            worker.postMessage({
                type: 'updatePhysicsState',
                data: {
                    bodies: simplifiedBodies
                }
            });
        });
    }

    /**
     * Request orbit update for a satellite
     */
    updateSatelliteOrbit(satelliteId) {
        console.log(`[SatelliteOrbitManager] Orbit update requested for satellite ${satelliteId}`);
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
     * Process queued orbit updates
     */
    _processUpdateQueue() {
        if (!this.propagator || !this.physicsEngine) {
            console.warn('[SatelliteOrbitManager] Cannot process queue - propagator or physics not ready');
            return;
        }

        console.log(`[SatelliteOrbitManager] Processing update queue with ${this.updateQueue.size} satellites`);

        for (const satelliteId of this.updateQueue) {
            const satellite = this.physicsEngine.satellites.get(satelliteId);
            if (!satellite) {
                console.warn(`[SatelliteOrbitManager] Satellite ${satelliteId} not found in physics engine`);
                continue;
            }

            // Check cache validity
            const cached = this.orbitCache.get(satelliteId);
            const currentHash = this._computeStateHash(satellite);
            
            if (cached && cached.hash === currentHash) {
                console.log(`[SatelliteOrbitManager] Using cached orbit for satellite ${satelliteId}`);
                continue; // Cache is still valid
            }

            console.log(`[SatelliteOrbitManager] Analyzing orbit for satellite ${satelliteId}`);
            // Analyze orbit to determine propagation parameters
            const orbitParams = this.propagator.analyzeOrbit(satellite);
            
            // Get display settings
            const orbitPeriods = this.displaySettings?.getSetting('orbitPredictionInterval') || 2;
            const pointsPerPeriod = this.displaySettings?.getSetting('orbitPointsPerPeriod') || 180;
            
            // Calculate propagation duration
            let duration;
            if (orbitParams.type === 'elliptical') {
                duration = orbitParams.period * orbitPeriods;
            } else {
                duration = orbitParams.duration;
            }

            // Calculate time step for desired point density
            const totalPoints = orbitParams.type === 'elliptical' 
                ? pointsPerPeriod * orbitPeriods 
                : orbitParams.points;
            const timeStep = duration / totalPoints;

            // Start propagation job
            this._startPropagationJob({
                satelliteId,
                satellite: {
                    position: satellite.position.toArray(),
                    velocity: satellite.velocity.toArray(),
                    centralBodyNaifId: satellite.centralBodyNaifId
                },
                duration,
                timeStep,
                hash: currentHash
            });
        }

        this.updateQueue.clear();
    }

    /**
     * Start orbit propagation job
     */
    _startPropagationJob(params) {
        // Cancel existing job if any
        this._cancelJob(params.satelliteId);

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
            points: [],
            startTime: Date.now()
        });

        // Send propagation request
        worker.postMessage({
            type: 'propagate',
            data: {
                satelliteId: params.satelliteId,
                position: params.satellite.position,
                velocity: params.satellite.velocity,
                centralBodyNaifId: params.satellite.centralBodyNaifId,
                duration: params.duration,
                timeStep: params.timeStep
            }
        });
    }

    /**
     * Handle worker messages
     */
    _handleWorkerMessage(event) {
        const { type, satelliteId, points, progress, isComplete } = event.data;

        console.log(`[SatelliteOrbitManager] Worker message received: type=${type}, satelliteId=${satelliteId}, points=${points?.length || 0}, isComplete=${isComplete}`);

        const job = this.activeJobs.get(satelliteId);
        if (!job) {
            console.warn(`[SatelliteOrbitManager] No active job found for satellite ${satelliteId}`);
            return;
        }

        switch (type) {
            case 'chunk':
                // Accumulate points
                job.points.push(...points);
                console.log(`[SatelliteOrbitManager] Accumulated ${job.points.length} points for satellite ${satelliteId}`);
                
                // Update visualization progressively
                this._updateOrbitVisualization(satelliteId, job.points, false);
                
                if (isComplete) {
                    console.log(`[SatelliteOrbitManager] Orbit calculation complete for satellite ${satelliteId} with ${job.points.length} total points`);
                    // Cache the complete orbit
                    this.orbitCache.set(satelliteId, {
                        points: job.points,
                        timestamp: Date.now(),
                        hash: job.params.hash
                    });
                    
                    // Final visualization update
                    this._updateOrbitVisualization(satelliteId, job.points, true);
                    
                    // Return worker to pool
                    this.workerPool.push(job.worker);
                    this.activeJobs.delete(satelliteId);
                }
                break;

            case 'complete':
                // Job completed - do nothing here since we already handled cleanup in 'chunk' with isComplete
                console.log(`[SatelliteOrbitManager] Received complete message for satellite ${satelliteId}`);
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
    _updateOrbitVisualization(satelliteId, points, isComplete) {
        if (points.length < 2) {
            console.warn(`[SatelliteOrbitManager] Not enough points (${points.length}) to visualize orbit for satellite ${satelliteId}`);
            return;
        }

        console.log(`[SatelliteOrbitManager] Updating orbit visualization for satellite ${satelliteId} with ${points.length} points`);

        // Group points by central body
        const pointsByBody = new Map();
        for (const point of points) {
            if (!pointsByBody.has(point.centralBodyId)) {
                pointsByBody.set(point.centralBodyId, []);
            }
            pointsByBody.get(point.centralBodyId).push(point);
        }

        console.log(`[SatelliteOrbitManager] Points grouped by ${pointsByBody.size} bodies`);

        // Create or update orbit segments for each body
        let segmentIndex = 0;
        for (const [bodyId, bodyPoints] of pointsByBody) {
            const lineKey = `${satelliteId}_${segmentIndex}`;
            let line = this.orbitLines.get(lineKey);
            
            console.log(`[SatelliteOrbitManager] Processing segment ${segmentIndex} for body ${bodyId} with ${bodyPoints.length} points`);
            
            // Get the planet mesh group to add orbit to
            const planet = this.app.celestialBodies?.find(b => b.naifId === parseInt(bodyId));
            // Use rotationGroup instead of orbitGroup for orbits around the planet
            const parentGroup = planet?.rotationGroup || planet?.orbitGroup || this.app.sceneManager?.scene;
            
            console.log(`[SatelliteOrbitManager] Looking for body ${bodyId}, found: ${planet?.name || 'none'}`);
            console.log(`[SatelliteOrbitManager] Planet has rotationGroup:`, !!planet?.rotationGroup);
            console.log(`[SatelliteOrbitManager] Planet has orbitGroup:`, !!planet?.orbitGroup);
            console.log(`[SatelliteOrbitManager] Available celestial bodies:`, this.app.celestialBodies?.map(b => ({ name: b.name, naifId: b.naifId })));
            
            if (!parentGroup) {
                console.warn(`[SatelliteOrbitManager] No parent group found for body ${bodyId}`);
                continue;
            }
            
            console.log(`[SatelliteOrbitManager] Using parent group: ${parentGroup.name || parentGroup.type} (from ${planet ? planet.name : 'scene'})`);
            
            if (!line) {
                // Create new line
                const geometry = new THREE.BufferGeometry();
                const satellite = this.physicsEngine.satellites.get(satelliteId);
                const color = satellite?.color || 0xffff00;
                
                const material = new THREE.LineBasicMaterial({
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
                
                console.log(`[SatelliteOrbitManager] Created new orbit line and added to parent group`);
                console.log(`[SatelliteOrbitManager] Line parent after add:`, line.parent?.name || line.parent);
            }

            // Update geometry with positions relative to parent body
            const positions = new Float32Array(bodyPoints.length * 3);
            
            for (let i = 0; i < bodyPoints.length; i++) {
                const point = bodyPoints[i];
                // Positions are already relative to central body
                positions[i * 3] = point.position[0];
                positions[i * 3 + 1] = point.position[1];
                positions[i * 3 + 2] = point.position[2];
            }

            line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            line.geometry.setDrawRange(0, bodyPoints.length);
            line.geometry.computeBoundingSphere();
            
            console.log(`[SatelliteOrbitManager] Updated orbit segment ${segmentIndex} with ${bodyPoints.length} points`);
            console.log(`[SatelliteOrbitManager] First point: [${positions[0]}, ${positions[1]}, ${positions[2]}]`);
            console.log(`[SatelliteOrbitManager] Line parent: ${line.parent?.name || line.parent || 'none'}`);
            console.log(`[SatelliteOrbitManager] Line parent is Group:`, line.parent instanceof THREE.Group);
            console.log(`[SatelliteOrbitManager] Parent group children count:`, parentGroup.children.length);
            
            // Log orbit bounds for debugging
            if (line.geometry.boundingSphere) {
                console.log(`[SatelliteOrbitManager] Orbit bounds - center:`, line.geometry.boundingSphere.center.toArray(), 'radius:', line.geometry.boundingSphere.radius);
            }
            
            segmentIndex++;
        }

        // Store the number of segments for this satellite
        this.orbitSegmentCounts.set(satelliteId, segmentIndex);
        
        // Update visibility based on display settings
        const visible = this.displaySettings?.getSetting('showOrbits') ?? true;
        console.log(`[SatelliteOrbitManager] Setting orbit visibility to ${visible} for ${segmentIndex} segments`);
        
        for (let i = 0; i < segmentIndex; i++) {
            const line = this.orbitLines.get(`${satelliteId}_${i}`);
            if (line) {
                line.visible = visible;
                console.log(`[SatelliteOrbitManager] Segment ${i} visible: ${line.visible}, parent: ${line.parent?.name || 'none'}, in scene: ${line.parent !== null}`);
                
                // Check if line is properly in the scene graph
                let parent = line.parent;
                let depth = 0;
                while (parent && depth < 10) {
                    console.log(`[SatelliteOrbitManager]   Parent at depth ${depth}: ${parent.name || parent.type}`);
                    parent = parent.parent;
                    depth++;
                }
            }
        }
    }

    /**
     * Cancel active job
     */
    _cancelJob(satelliteId) {
        const job = this.activeJobs.get(satelliteId);
        if (job) {
            job.worker.postMessage({ type: 'cancel' });
            this.workerPool.push(job.worker);
            this.activeJobs.delete(satelliteId);
        }
    }

    /**
     * Compute hash of satellite state for cache validation
     */
    _computeStateHash(satellite) {
        // Handle both Vector3 and array formats
        const pos = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
        const vel = satellite.velocity.toArray ? satellite.velocity.toArray() : satellite.velocity;
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
        // Listen for satellite lifecycle events
        window.addEventListener('satelliteAdded', (e) => {
            const satData = e.detail;
            // Queue orbit update for new satellite
            this.updateSatelliteOrbit(String(satData.id));
        });

        window.addEventListener('satelliteRemoved', (e) => {
            const satData = e.detail;
            const satelliteId = String(satData.id);
            // Clean up orbit visualization
            this.removeSatelliteOrbit(satelliteId);
        });

        window.addEventListener('satellitePropertyUpdated', (e) => {
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
        });

        // Listen for display setting changes
        if (this.displaySettings) {
            this.displaySettings.addListener('showOrbits', () => {
                this._updateOrbitVisibility();
            });
            this.displaySettings.addListener('orbitPredictionInterval', () => {
                // Clear cache and update all orbits
                this.orbitCache.clear();
                for (const satelliteId of this.physicsEngine.satellites.keys()) {
                    this.updateSatelliteOrbit(satelliteId);
                }
            });
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

        // Clear cache
        this.orbitCache.clear();
        this.updateQueue.clear();
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.clearAll();
        
        // Terminate workers
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.workerPool = [];
    }
}