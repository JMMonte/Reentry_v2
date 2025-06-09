/**
 * CommunicationsService.js
 * 
 * Unified facade for all satellite communications functionality.
 * This service consolidates LineOfSightManager, SatelliteCommsManager,
 * and physics subsystem communications into a single interface.
 */

// Simple EventEmitter implementation for browser compatibility
class EventEmitter {
    constructor() {
        this._events = {};
    }
    
    on(event, listener) {
        if (!this._events[event]) {
            this._events[event] = [];
        }
        this._events[event].push(listener);
        return this;
    }
    
    emit(event, ...args) {
        if (!this._events[event]) return false;
        
        for (const listener of this._events[event]) {
            listener(...args);
        }
        return true;
    }
    
    removeListener(event, listener) {
        if (!this._events[event]) return this;
        
        const index = this._events[event].indexOf(listener);
        if (index !== -1) {
            this._events[event].splice(index, 1);
        }
        return this;
    }
    
    removeAllListeners(event) {
        if (event) {
            delete this._events[event];
        } else {
            this._events = {};
        }
        return this;
    }
}

export class CommunicationsService extends EventEmitter {
    constructor() {
        super();
        
        // References to managers (will be set by App3D)
        this.lineOfSightManager = null;
        this.satelliteCommsManager = null;
        this.physicsEngine = null;
        
        // State
        this._enabled = true;
        this._connections = new Map(); // satelliteId -> connections
        this._commsConfigs = new Map(); // satelliteId -> config
        this._dataTransfers = new Map(); // satelliteId -> { transmitted: number, received: number }
        
        // Cache management
        this._configCacheTime = new Map(); // satelliteId -> timestamp
        this._cacheTimeout = 2000; // 2 second cache TTL
        
        // Event handlers
        this._boundHandlers = {
            connectionsUpdated: this._handleConnectionsUpdated.bind(this),
            satelliteAdded: this._handleSatelliteAdded.bind(this),
            satelliteRemoved: this._handleSatelliteRemoved.bind(this)
        };
        
        // Start data transfer simulation
        this._dataTransferInterval = null;
    }
    
    /**
     * Initialize the service with required managers
     */
    initialize(lineOfSightManager, satelliteCommsManager, physicsEngine) {
        this.lineOfSightManager = lineOfSightManager;
        this.satelliteCommsManager = satelliteCommsManager;
        this.physicsEngine = physicsEngine;
        
        // Set up event listeners
        window.addEventListener('satelliteAdded', this._boundHandlers.satelliteAdded);
        window.addEventListener('satelliteRemoved', this._boundHandlers.satelliteRemoved);
        
        // Listen for connection updates from LineOfSightManager
        if (this.lineOfSightManager) {
            // We'll need to modify LineOfSightManager to emit events
            // For now, we'll poll for changes
            this._setupConnectionPolling();
        }
        
        // Start simulating data transfers
        this._startDataTransferSimulation();
    }
    
    /**
     * Enable or disable all communications
     */
    setEnabled(enabled) {
        this._enabled = enabled;
        
        // Update LineOfSightManager
        if (this.lineOfSightManager) {
            this.lineOfSightManager.setEnabled(enabled);
        }
        
        // Emit event for React components
        this.emit('enabledChanged', enabled);
    }
    
    /**
     * Check if communications are enabled
     */
    isEnabled() {
        return this._enabled;
    }
    
    /**
     * Get data transfer stats for a satellite
     */
    getSatelliteDataTransfers(satelliteId) {
        return this._dataTransfers.get(satelliteId) || { transmitted: 0, received: 0 };
    }
    
    /**
     * Get communication configuration for a satellite
     */
    getSatelliteCommsConfig(satelliteId) {
        
        // Try multiple sources in order of preference
        
        // 1. Check our cache with TTL
        const cachedTime = this._configCacheTime.get(satelliteId);
        if (cachedTime && (Date.now() - cachedTime < this._cacheTimeout)) {
            const cached = this._commsConfigs.get(satelliteId);
            if (cached) {
                return cached;
            }
        }
        
        // 2. Check SatelliteCommsManager
        if (this.satelliteCommsManager) {
            const commsSystem = this.satelliteCommsManager.getCommsSystem(satelliteId);
            if (commsSystem) {
                this._commsConfigs.set(satelliteId, commsSystem.config);
                this._configCacheTime.set(satelliteId, Date.now());
                return commsSystem.config;
            }
        }
        
        // 3. Check physics subsystem manager
        if (this.physicsEngine?.subsystemManager) {
            try {
                const subsystem = this.physicsEngine.subsystemManager.getSubsystem(satelliteId, 'communication');
                
                if (subsystem) {
                    // Subsystem might have config directly or through a method
                    const config = subsystem.config || (subsystem.getConfig ? subsystem.getConfig() : null);
                    
                    if (config) {
                        this._commsConfigs.set(satelliteId, config);
                        this._configCacheTime.set(satelliteId, Date.now());
                        return config;
                    }
                }
            } catch (error) {
                console.debug('[CommunicationsService] Could not get config from physics subsystem:', error);
            }
        }
        
        return null;
    }
    
    /**
     * Update satellite communications configuration
     */
    updateSatelliteCommsConfig(satelliteId, config) {
        // Update all systems
        const promises = []; // eslint-disable-line no-unused-vars
        
        // Get existing config and merge with new config
        const existingConfig = this.getSatelliteCommsConfig(satelliteId) || {};
        const mergedConfig = { ...existingConfig, ...config };
        
        // 1. Update cache
        this._commsConfigs.set(satelliteId, mergedConfig);
        
        // 2. Update SatelliteCommsManager
        if (this.satelliteCommsManager) {
            this.satelliteCommsManager.updateSatelliteComms(satelliteId, mergedConfig);
        }
        
        // 3. Update physics subsystem
        if (this.physicsEngine?.subsystemManager) {
            try {
                this.physicsEngine.subsystemManager.updateSubsystemConfig(
                    satelliteId, 
                    'communication', 
                    mergedConfig
                );
            } catch (error) {
                console.warn('[CommunicationsService] Failed to update physics subsystem:', error);
            }
        }
        
        // Emit event for React components
        this.emit('configUpdated', { satelliteId, config: mergedConfig });
        
        // Force connection recalculation
        if (this.lineOfSightManager) {
            this.lineOfSightManager.forceUpdate();
        }
        
        return mergedConfig;
    }
    
    /**
     * Get all active connections
     */
    getConnections() {
        if (this.lineOfSightManager) {
            return this.lineOfSightManager.getConnections();
        }
        return [];
    }
    
    /**
     * Get connections for a specific satellite
     */
    getSatelliteConnections(satelliteId) {
        const allConnections = this.getConnections();
        return allConnections.filter(conn => 
            conn.from === satelliteId || conn.to === satelliteId
        );
    }
    
    /**
     * Get communication statistics
     */
    getStats() {
        const stats = {
            enabled: this._enabled,
            totalSatellites: this._commsConfigs.size,
            enabledSatellites: 0,
            connections: 0,
            satelliteToSatellite: 0,
            satelliteToGround: 0
        };
        
        // Count enabled satellites
        for (const config of this._commsConfigs.values()) {
            if (config.enabled) stats.enabledSatellites++;
        }
        
        // Get connection stats from LineOfSightManager
        if (this.lineOfSightManager) {
            const losStats = this.lineOfSightManager.getStats();
            stats.connections = losStats.total;
            stats.satelliteToSatellite = losStats.types['satellite-satellite'] || 0;
            stats.satelliteToGround = losStats.types['satellite-ground'] || 0;
        }
        
        return stats;
    }
    
    /**
     * Get available communication presets
     */
    getPresets() {
        if (this.satelliteCommsManager) {
            return this.satelliteCommsManager.getPresets();
        }
        
        // Fallback presets
        return {
            cubesat: { name: 'CubeSat', transmitPower: 5.0, antennaGain: 8.0 },
            smallsat: { name: 'Small Satellite', transmitPower: 20.0, antennaGain: 12.0 },
            comsat: { name: 'Communications Satellite', transmitPower: 100.0, antennaGain: 30.0 },
            ground_station: { name: 'Ground Station', transmitPower: 1000.0, antennaGain: 45.0 }
        };
    }
    
    /**
     * Calculate link budget between two objects
     */
    calculateLinkBudget(fromId, toId, frequency = 2.4) {
        const fromConfig = this.getSatelliteCommsConfig(fromId);
        const toConfig = this.getSatelliteCommsConfig(toId);
        
        if (!fromConfig || !toConfig) {
            return null;
        }
        
        // Get the connection if it exists
        const connections = this.getConnections();
        const connection = connections.find(conn => 
            (conn.from === fromId && conn.to === toId) ||
            (conn.from === toId && conn.to === fromId)
        );
        
        if (!connection) {
            return { linkMargin: -Infinity, reason: 'No line of sight' };
        }
        
        // Get comms system for calculation
        const fromComms = this.satelliteCommsManager?.getCommsSystem(fromId);
        if (fromComms) {
            return fromComms.calculateLinkBudget(toConfig, connection.metadata.distance, frequency);
        }
        
        // Fallback calculation
        const distance = connection.metadata.distance;
        const pathLoss = 20 * Math.log10(distance) + 20 * Math.log10(frequency) + 92.45;
        const totalGain = fromConfig.antennaGain + toConfig.antennaGain;
        const eirp = fromConfig.transmitPower + fromConfig.antennaGain;
        const linkMargin = eirp + toConfig.antennaGain - pathLoss - 3; // 3dB margin
        
        return {
            eirp,
            pathLoss,
            totalGain,
            linkMargin,
            distance
        };
    }
    
    /**
     * Force update of all connections
     */
    forceUpdate() {
        if (this.lineOfSightManager) {
            this.lineOfSightManager.forceUpdate();
        }
    }
    
    // Private methods
    
    _handleSatelliteAdded(event) {
        const satellite = event.detail;
        
        // Get or create comms config
        const commsConfig = satellite.commsConfig || { preset: 'cubesat', enabled: true };
        
        // Store config
        this._commsConfigs.set(satellite.id, commsConfig);
        
        // Create comms system in manager
        if (this.satelliteCommsManager) {
            this.satelliteCommsManager.createCommsSystem(satellite.id, commsConfig);
        }
        
        // Emit event
        this.emit('satelliteAdded', { satelliteId: satellite.id, config: commsConfig });
    }
    
    _handleSatelliteRemoved(event) {
        const satelliteId = event.detail.id;
        
        // Remove from cache
        this._commsConfigs.delete(satelliteId);
        this._connections.delete(satelliteId);
        
        // Remove from manager
        if (this.satelliteCommsManager) {
            this.satelliteCommsManager.removeCommsSystem(satelliteId);
        }
        
        // Emit event
        this.emit('satelliteRemoved', { satelliteId });
    }
    
    _handleConnectionsUpdated(connections) {
        // Update connection cache
        this._connections.clear();
        
        for (const conn of connections) {
            // Add to 'from' satellite's connections
            if (!this._connections.has(conn.from)) {
                this._connections.set(conn.from, []);
            }
            this._connections.get(conn.from).push(conn);
            
            // Add to 'to' satellite's connections
            if (!this._connections.has(conn.to)) {
                this._connections.set(conn.to, []);
            }
            this._connections.get(conn.to).push(conn);
        }
        
        // Emit event
        this.emit('connectionsUpdated', connections);
    }
    
    _setupConnectionPolling() {
        // Listen for connection update events from LineOfSightManager
        this._handleLineOfSightUpdate = (event) => {
            if (this._enabled) {
                this._handleConnectionsUpdated(event.detail.connections);
            }
        };
        
        window.addEventListener('lineOfSightConnectionsUpdated', this._handleLineOfSightUpdate);
        
        // Also get initial connections
        if (this.lineOfSightManager && this._enabled) {
            const connections = this.lineOfSightManager.getConnections();
            this._handleConnectionsUpdated(connections);
        }
    }
    
    _startDataTransferSimulation() {
        // Simulate data transfers every second
        this._dataTransferInterval = setInterval(() => {
            if (!this._enabled) return;
            
            const connections = this.getConnections();
            
            // Process each active connection
            connections.forEach(conn => {
                const fromConfig = this.getSatelliteCommsConfig(conn.from);
                const toConfig = this.getSatelliteCommsConfig(conn.to);
                
                if (fromConfig?.enabled && toConfig?.enabled && conn.metadata?.linkQuality > 0) {
                    // Calculate data transfer rate based on link quality and configured data rate
                    const effectiveDataRate = Math.min(
                        fromConfig.dataRate || 1000,
                        toConfig.dataRate || 1000
                    ) * (conn.metadata.linkQuality / 100);
                    
                    // Transfer data (bytes per second)
                    const dataTransferred = effectiveDataRate * 125; // Convert kbps to bytes/s
                    
                    // Update transmitted data for sender
                    if (!this._dataTransfers.has(conn.from)) {
                        this._dataTransfers.set(conn.from, { transmitted: 0, received: 0 });
                    }
                    const fromStats = this._dataTransfers.get(conn.from);
                    fromStats.transmitted += dataTransferred;
                    
                    // Update received data for receiver
                    if (!this._dataTransfers.has(conn.to)) {
                        this._dataTransfers.set(conn.to, { transmitted: 0, received: 0 });
                    }
                    const toStats = this._dataTransfers.get(conn.to);
                    toStats.received += dataTransferred;
                }
            });
            
            // Emit update event
            this.emit('dataTransfersUpdated');
        }, 1000);
    }
    
    /**
     * Dispose of the service
     */
    dispose() {
        // Stop data transfer simulation
        if (this._dataTransferInterval) {
            clearInterval(this._dataTransferInterval);
            this._dataTransferInterval = null;
        }
        
        // Remove event listeners
        window.removeEventListener('satelliteAdded', this._boundHandlers.satelliteAdded);
        window.removeEventListener('satelliteRemoved', this._boundHandlers.satelliteRemoved);
        
        if (this._handleLineOfSightUpdate) {
            window.removeEventListener('lineOfSightConnectionsUpdated', this._handleLineOfSightUpdate);
        }
        
        // Clear state
        this._connections.clear();
        this._commsConfigs.clear();
        this._dataTransfers.clear();
        
        // Remove all event listeners
        this.removeAllListeners();
    }
}

// Singleton instance
export const communicationsService = new CommunicationsService();