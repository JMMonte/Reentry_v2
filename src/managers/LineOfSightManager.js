/**
 * LineOfSightManager.js
 * 
 * Manages satellite-to-satellite and satellite-to-ground line of sight calculations
 * and visualization. Handles worker communication, connection rendering, and 
 * configuration updates.
 */

import * as THREE from 'three';

export class LineOfSightManager {
    constructor(scene, displaySettings, physicsState) {
        this.scene = scene;
        this.displaySettings = displaySettings;
        this.physicsState = physicsState;
        
        // State management
        this._enabled = false;
        this._connections = [];
        this._lastWorkerSync = 0;
        this._workerSyncInterval = 500; // ms
        
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
            UPDATE_INTERVAL: 500
        };
        
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
            console.log('[LineOfSightManager] Line of sight enabled - worker initialized:', this._workerInitialized);
            this._requestWorkerUpdate();
        } else {
            console.log('[LineOfSightManager] Line of sight disabled');
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
        console.log('[LineOfSightManager] updateConnections called - enabled:', this._enabled, 'worker:', this._workerInitialized, 'satellites:', satellites?.length);
        
        if (!this._enabled || !this._workerInitialized) {
            console.log('[LineOfSightManager] Skipping update - not enabled or worker not ready');
            return;
        }
        
        const now = Date.now();
        if (now - this._lastWorkerSync < this._workerSyncInterval) {
            console.log('[LineOfSightManager] Skipping update - too soon since last sync');
            return;
        }
        
        // Prepare data for worker
        const satelliteData = satellites.map(sat => ({
            id: sat.id,
            position: sat.getPosition ? sat.getPosition() : sat.position,
            velocity: sat.getVelocity ? sat.getVelocity() : sat.velocity
        }));
        
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
        
        console.log('[LineOfSightManager] Sending to worker:', satelliteData.length, 'satellites,', bodyData.length, 'bodies');
        
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
        console.log('[LineOfSightManager] Updating settings:', newConfig);
        Object.assign(this._config, newConfig);
        console.log('[LineOfSightManager] New config:', this._config);
        
        if (this._workerInitialized) {
            this._lineOfSightWorker.postMessage({
                type: 'UPDATE_CONFIG',
                config: this._config
            });
            console.log('[LineOfSightManager] Sent config update to worker');
        }
        
        // Update sync interval if specified
        if (newConfig.UPDATE_INTERVAL !== undefined) {
            this._workerSyncInterval = newConfig.UPDATE_INTERVAL;
            console.log('[LineOfSightManager] Updated sync interval to:', this._workerSyncInterval);
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
            console.log('[LineOfSightManager] Worker initialized successfully');
            
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
            case 'CONNECTIONS_UPDATED':
                this._connections = data.connections || [];
                this._renderConnections(this._connections);
                break;
                
            case 'SPECIFIC_LOS_RESULT':
                // Handle specific line of sight query results
                console.log('[LineOfSightManager] Specific LOS result:', data);
                break;
                
            default:
                console.warn('[LineOfSightManager] Unknown worker message:', data);
        }
    }
    
    /**
     * Render connection lines in the 3D scene
     */
    _renderConnections(connections) {
        // Clear existing connections
        this._clearConnections();
        
        console.log(`[LineOfSightManager] _renderConnections called with ${connections?.length || 0} connections`);
        
        if (!connections || connections.length === 0) {
            console.log('[LineOfSightManager] No connections to render');
            return;
        }
        
        console.log(`[LineOfSightManager] Rendering ${connections.length} connections`);
        console.log('[LineOfSightManager] Scene children before:', this.scene.children.map(c => c.name).filter(n => n));
        console.log('[LineOfSightManager] SatelliteLinks in scene:', this.scene.children.includes(this._satelliteLinks));
        console.log('[LineOfSightManager] SatelliteLinks visible:', this._satelliteLinks.visible);
        
        // Ensure the group is added to the scene
        if (!this.scene.children.includes(this._satelliteLinks)) {
            this.scene.add(this._satelliteLinks);
            console.log('[LineOfSightManager] Added SatelliteLinks group to scene');
        }
        
        // Add a test line at the origin for debugging
        const testGeometry = new THREE.BufferGeometry();
        const testPositions = new Float32Array([
            0, 0, 0,
            1000, 1000, 1000  // 1000 km line
        ]);
        testGeometry.setAttribute('position', new THREE.BufferAttribute(testPositions, 3));
        const testMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 10 });
        const testLine = new THREE.Line(testGeometry, testMaterial);
        testLine.name = 'TEST_LINE';
        testLine.renderOrder = 9999;
        testLine.frustumCulled = false;
        this._satelliteLinks.add(testLine);
        console.log('[LineOfSightManager] Added test line at origin');
        
        connections.forEach((connection) => {
            console.log('[LineOfSightManager] Processing connection:', connection);
            
            if (!connection.points || connection.points.length !== 2) {
                console.warn('[LineOfSightManager] Invalid connection points:', connection);
                return;
            }
            
            console.log('[LineOfSightManager] Connection points:', connection.points);
            console.log('[LineOfSightManager] Connection metadata:', connection.metadata);
            
            // Calculate distance for debugging
            const dx = connection.points[1][0] - connection.points[0][0];
            const dy = connection.points[1][1] - connection.points[0][1];
            const dz = connection.points[1][2] - connection.points[0][2];
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            console.log('[LineOfSightManager] Line distance:', distance, 'km');
            
            // Create line geometry
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                connection.points[0][0], connection.points[0][1], connection.points[0][2],
                connection.points[1][0], connection.points[1][1], connection.points[1][2]
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            // Compute bounding sphere for debugging
            geometry.computeBoundingSphere();
            console.log('[LineOfSightManager] Line bounding sphere:', geometry.boundingSphere);
            
            // Create material with appropriate color
            const color = this._getConnectionColor(connection);
            console.log('[LineOfSightManager] Using color:', color.toString(16));
            
            const material = new THREE.LineBasicMaterial({
                color: color,
                transparent: false,
                opacity: 1.0,
                depthTest: false,
                depthWrite: false,
                linewidth: 5 // This may not work in WebGL but try anyway
            });
            
            // Create line mesh
            const line = new THREE.Line(geometry, material);
            line.name = `Connection_${connection.from}_${connection.to}`;
            line.renderOrder = 9999;
            line.frustumCulled = false;
            
            console.log('[LineOfSightManager] Created line:', line.name, 'geometry points:', geometry.attributes.position.count);
            
            // Store connection metadata
            line.userData = {
                connectionData: connection,
                type: connection.type,
                from: connection.from,
                to: connection.to
            };
            
            this._satelliteLinks.add(line);
            console.log('[LineOfSightManager] Added line to group. Group now has', this._satelliteLinks.children.length, 'children');
        });
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
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
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
     * Dispose of resources and cleanup
     */
    dispose() {
        console.log('[LineOfSightManager] Disposing...');
        
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
        
        // Reset state
        this._enabled = false;
        this._connections = [];
    }
}