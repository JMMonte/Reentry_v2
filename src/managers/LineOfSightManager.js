/**
 * LineOfSightManager.js
 * 
 * Manages satellite-to-satellite and satellite-to-ground line of sight calculations
 * and visualization. Handles worker communication, connection rendering, and 
 * configuration updates.
 */

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

export class LineOfSightManager {
    constructor(scene, displaySettings, physicsState) {
        this.scene = scene;
        this.displaySettings = displaySettings;
        this.physicsState = physicsState;

        // Screen resolution for Line2 materials
        this._resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);

        // State management
        this._enabled = false;
        this._connections = [];
        this._lastWorkerSync = 0;
        this._workerSyncInterval = 500; // ms - sync every 500ms (2Hz) to prevent spam

        // Three.js objects
        this._satelliteLinks = new THREE.Group();
        this._satelliteLinks.name = 'SatelliteConnections';
        this._satelliteLinks.visible = false;
        this.scene.add(this._satelliteLinks);

        // Worker management
        this._lineOfSightWorker = null;
        this._workerInitialized = false;

        // Configuration
        this._config = {
            MIN_ELEVATION_ANGLE: 5.0,
            ATMOSPHERIC_REFRACTION: true,
            UPDATE_INTERVAL: 500,
            CONNECTION_PERSISTENCE_TIME: 3000, // Keep connections alive for 3 seconds after losing signal
            CONNECTION_FADE_TIME: 1000 // Fade out duration when connection is lost
        };

        // Connection persistence tracking
        this._persistentConnections = new Map(); // Track connections with timestamps
        this._fadingConnections = new Set(); // Track connections in fade-out state

        this._initializeWorker();
    }

    /**
     * Enable or disable line of sight calculations and visualization
     */
    setEnabled(enabled) {
        if (this._enabled === enabled) return;
        this._enabled = enabled;
        this._satelliteLinks.visible = enabled;
        if (enabled) {
            this._requestWorkerUpdate();
        } else {
            this._clearConnections();
        }
    }

    /**
     * Check if line of sight is currently enabled
     */
    isEnabled() {
        return this._enabled;
    }

    /**
     * Update line of sight calculations with current satellite data
     */
    updateConnections(satellites, bodies, groundStations = []) {
        if (!this._enabled || !this._workerInitialized) {
            return;
        }
        const now = Date.now();
        if (now - this._lastWorkerSync < this._workerSyncInterval) {
            return;
        }
        // Prepare data for worker
        const satelliteData = satellites.map(sat => {
            const position = sat.getPosition ? sat.getPosition() : sat.position;
            const velocity = sat.getVelocity ? sat.getVelocity() : sat.velocity;
            
            return {
                id: sat.id,
                position,
                velocity
            };
        });
        const bodyData = bodies.map(body => ({
            naifId: body.naifId,
            position: body.getPosition ? body.getPosition() : body.position,
            radius: body.radius
        }));
        const groundData = groundStations.map(station => ({
            id: station.id,
            position: station.position,
            elevation: station.elevation || 0
        }));
        // Update configuration from display settings
        this._updateConfigFromSettings();
        // Send data to worker
        this._lineOfSightWorker.postMessage({
            type: 'UPDATE_SCENE',
            satellites: satelliteData,
            bodies: bodyData,
            groundStations: groundData,
            config: this._config
        });
        // Update physics state
        if (this.physicsState) {
            this._lineOfSightWorker.postMessage({
                type: 'UPDATE_PHYSICS_STATE',
                physicsState: {
                    currentTime: this.physicsState.currentTime || Date.now()
                }
            });
        }
        this._lastWorkerSync = now;
    }

    /**
     * Update configuration settings
     */
    updateSettings(newConfig) {
        Object.assign(this._config, newConfig);
        if (this._workerInitialized) {
            this._lineOfSightWorker.postMessage({
                type: 'UPDATE_CONFIG',
                config: this._config
            });
        }
        // Update sync interval if specified
        if (newConfig.UPDATE_INTERVAL !== undefined) {
            this._workerSyncInterval = newConfig.UPDATE_INTERVAL;
        }
    }

    /**
     * Force an immediate update (useful for testing)
     */
    forceUpdate() {
        this._lastWorkerSync = 0;
    }

    /**
     * Get current connections
     */
    getConnections() {
        return [...this._connections];
    }

    /**
     * Get connection statistics
     */
    getStats() {
        const total = this._connections.length;
        const types = this._connections.reduce((acc, conn) => {
            acc[conn.type] = (acc[conn.type] || 0) + 1;
            return acc;
        }, {});

        return { total, types };
    }

    /**
     * Initialize the line of sight worker
     */
    _initializeWorker() {
        try {
            this._lineOfSightWorker = new Worker(
                new URL('../physics/workers/lineOfSightWorker.js', import.meta.url),
                { type: 'module' }
            );
            this._lineOfSightWorker.onmessage = (e) => {
                this._handleWorkerMessage(e.data);
            };
            this._lineOfSightWorker.onerror = (error) => {
                console.error('[LineOfSightManager] Worker error:', error);
                this._workerInitialized = false;
            };
            this._workerInitialized = true;
        } catch (error) {
            console.error('[LineOfSightManager] Failed to initialize worker:', error);
            this._workerInitialized = false;
        }
    }

    /**
     * Handle messages from the line of sight worker
     */
    _handleWorkerMessage(data) {
        switch (data.type) {
            case 'CONNECTIONS_UPDATED': {
                const previousCount = this._connections.length;
                this._connections = data.connections || [];
                this._renderConnections(this._connections);
                
                // Emit event for other systems to listen to
                window.dispatchEvent(new CustomEvent('lineOfSightConnectionsUpdated', {
                    detail: {
                        connections: this._connections,
                        previousCount,
                        newCount: this._connections.length,
                        timestamp: data.timestamp || Date.now()
                    }
                }));
                break;
            }
            case 'SPECIFIC_LOS_RESULT':
                // Optionally handle specific line of sight query results
                break;
            default:
                break;
        }
    }

    /**
     * Render connection lines in the 3D scene
     */
    _renderConnections(connections) {
        // Don't clear all connections - instead reuse existing lines when possible
        // this._clearConnections(); // Commented out to prevent memory leak
        if (!connections || connections.length === 0) {
            // Hide existing connections instead of deleting them
            this._satelliteLinks.visible = false;
            return;
        }
        
        // Make sure the connections group is visible
        this._satelliteLinks.visible = true;
        // Ensure the group is added to the scene
        if (!this.scene.children.includes(this._satelliteLinks)) {
            this.scene.add(this._satelliteLinks);
        }
        // Test line removed to prevent memory leak
        // Debug test lines should only be created once, not every frame
        
        // Initialize line pool if needed
        if (!this._linePool) {
            this._linePool = [];
            this._activeLines = new Map();
        }
        
        // Track current active connections and update persistent tracking
        const currentTime = Date.now();
        const activeConnectionKeys = new Set();
        
        connections.forEach((connection) => {
            if (!connection.points || connection.points.length !== 2) {
                return;
            }
            
            const lineKey = `${connection.from}_${connection.to}`;
            activeConnectionKeys.add(lineKey);
            
            // Update persistent connection timestamp
            this._persistentConnections.set(lineKey, {
                connection,
                lastSeenTime: currentTime,
                isActive: true
            });
            
            // Remove from fading set if it was fading
            this._fadingConnections.delete(lineKey);
            
            let line = this._activeLines.get(lineKey);
            
            if (!line) {
                // Try to get from pool first
                line = this._linePool.pop();
                
                if (!line) {
                    // Create new line only if pool is empty
                    const geometry = new LineGeometry();
                    const material = new LineMaterial({
                        transparent: true,
                        opacity: 1.0,
                        depthTest: true,
                        depthWrite: false,
                        linewidth: 5,
                        resolution: this._resolution
                    });
                    line = new Line2(geometry, material);
                    line.renderOrder = 9999;
                    line.frustumCulled = false;
                }
                
                this._activeLines.set(lineKey, line);
                this._satelliteLinks.add(line);
            }
            
            // Update line position and color
            const positions = [
                connection.points[0][0], connection.points[0][1], connection.points[0][2],
                connection.points[1][0], connection.points[1][1], connection.points[1][2]
            ];
            line.geometry.setPositions(positions);
            
            // Update color and opacity
            const color = this._getConnectionColor(connection);
            if (line.material.color.getHex() !== color) {
                line.material.color.setHex(color);
            }
            line.material.opacity = 1.0; // Full opacity for active connections
            
            // Update metadata
            line.name = `Connection_${connection.from}_${connection.to}`;
            line.userData = {
                connectionData: connection,
                type: connection.type,
                from: connection.from,
                to: connection.to
            };
        });
        
        // Handle persistent connections that are no longer active
        for (const [lineKey, persistentData] of this._persistentConnections) {
            if (!activeConnectionKeys.has(lineKey)) {
                const timeSinceLastSeen = currentTime - persistentData.lastSeenTime;
                
                if (timeSinceLastSeen > this._config.CONNECTION_PERSISTENCE_TIME) {
                    // Connection has been gone too long, return it to pool
                    const line = this._activeLines.get(lineKey);
                    if (line) {
                        this._satelliteLinks.remove(line);
                        this._activeLines.delete(lineKey);
                        // Reset line properties before returning to pool
                        line.material.opacity = 1.0;
                        line.material.color.setHex(0xffffff);
                        line.visible = true;
                        this._linePool.push(line);
                    }
                    this._persistentConnections.delete(lineKey);
                    this._fadingConnections.delete(lineKey);
                } else {
                    // Keep connection but mark as inactive and potentially fading
                    persistentData.isActive = false;
                    
                    const line = this._activeLines.get(lineKey);
                    if (line) {
                        // Start fading after a short delay
                        const fadeStartTime = this._config.CONNECTION_PERSISTENCE_TIME - this._config.CONNECTION_FADE_TIME;
                        if (timeSinceLastSeen > fadeStartTime) {
                            this._fadingConnections.add(lineKey);
                            
                            // Calculate fade opacity
                            const fadeProgress = (timeSinceLastSeen - fadeStartTime) / this._config.CONNECTION_FADE_TIME;
                            const opacity = Math.max(0.1, 1.0 - fadeProgress);
                            line.material.opacity = opacity;
                            
                            // Change color to indicate lost connection
                            line.material.color.setHex(0x888888); // Gray for lost connections
                        }
                    }
                }
            }
        }
    }

    /**
     * Get appropriate color for connection based on quality
     */
    _getConnectionColor(connection) {
        if (!connection.metadata || !connection.metadata.visible) {
            return 0xff0000; // Red for invalid connections
        }

        const quality = connection.metadata.linkQuality || 50;

        if (quality > 80) return 0x00ff00; // Green
        if (quality > 60) return 0xffff00; // Yellow  
        if (quality > 40) return 0xff8000; // Orange
        return 0xff0000; // Red
    }

    /**
     * Clear all connection lines from the scene
     */
    _clearConnections() {
        while (this._satelliteLinks.children.length > 0) {
            const child = this._satelliteLinks.children[0];
            this._satelliteLinks.remove(child);

            // Dispose of geometry and material
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }
        
        // Clear the active lines map and line pool
        if (this._activeLines) {
            this._activeLines.clear();
        }
        if (this._linePool) {
            // Dispose of pooled line objects
            this._linePool.forEach(line => {
                if (line.geometry) line.geometry.dispose();
                if (line.material) line.material.dispose();
            });
            this._linePool.length = 0;
        }
    }

    /**
     * Update configuration from display settings
     */
    _updateConfigFromSettings() {
        if (!this.displaySettings) return;

        const minElevation = this.displaySettings.getSetting('losMinElevation');
        const updateInterval = this.displaySettings.getSetting('losUpdateInterval');
        const atmosphericRefraction = this.displaySettings.getSetting('losAtmosphericRefraction');

        if (minElevation !== undefined) {
            this._config.MIN_ELEVATION_ANGLE = minElevation;
        }

        if (updateInterval !== undefined) {
            this._config.UPDATE_INTERVAL = updateInterval;
            this._workerSyncInterval = updateInterval;
        }

        if (atmosphericRefraction !== undefined) {
            this._config.ATMOSPHERIC_REFRACTION = atmosphericRefraction;
        }
    }

    /**
     * Request an immediate worker update
     */
    _requestWorkerUpdate() {
        this._lastWorkerSync = 0;
    }

    /**
     * Update screen resolution for Line2 materials (call on window resize)
     */
    updateResolution(width, height) {
        this._resolution.set(width, height);
        // Update all existing Line2 materials
        this._satelliteLinks.traverse((child) => {
            if (child.material && child.material.isLineMaterial) {
                child.material.resolution.copy(this._resolution);
            }
        });
    }

    /**
     * Dispose of resources and cleanup
     */
    dispose() {
        // Clear connections
        this._clearConnections();
        // Remove from scene
        if (this.scene && this._satelliteLinks) {
            this.scene.remove(this._satelliteLinks);
        }
        // Dispose communication manager
        if (this.commsManager) {
            this.commsManager.dispose();
        }
        // Terminate worker to prevent memory leak
        if (this._lineOfSightWorker) {
            this._lineOfSightWorker.terminate();
            this._lineOfSightWorker = null;
        }
        // Clear persistent connection tracking
        if (this._persistentConnections) {
            this._persistentConnections.clear();
        }
        if (this._fadingConnections) {
            this._fadingConnections.clear();
        }
        if (this._activeLines) {
            this._activeLines.clear();
        }
        if (this._linePool) {
            this._linePool.length = 0;
        }
        // Reset state
        this._enabled = false;
        this._connections = [];
    }
}