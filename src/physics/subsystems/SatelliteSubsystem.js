/**
 * SatelliteSubsystem.js
 * 
 * Base class for all satellite subsystems in the physics simulation.
 * Provides standardized interface for subsystem integration into the physics engine.
 */

export class SatelliteSubsystem {
    constructor(satelliteId, subsystemType, config = {}) {
        this.satelliteId = satelliteId;
        this.subsystemType = subsystemType;
        this.config = { ...this.getDefaultConfig(), ...config };
        
        // Subsystem state
        this.state = this.getInitialState();
        this.metrics = this.getInitialMetrics();
        
        // Physics integration
        this.isEnabled = config.enabled !== false;
        this.lastUpdateTime = 0;
        this.updateInterval = config.updateInterval || 1000; // milliseconds
        this.physicsEngine = null; // Will be set by SubsystemManager
    }
    
    /**
     * Override in subclasses to provide default configuration
     */
    getDefaultConfig() {
        return {};
    }
    
    /**
     * Override in subclasses to provide initial state
     */
    getInitialState() {
        return {
            status: 'operational', // operational, degraded, offline
            powerConsumption: 0,   // watts
            temperature: 293.15,   // kelvin (20°C)
            lastUpdate: Date.now()
        };
    }
    
    /**
     * Override in subclasses to provide initial metrics
     */
    getInitialMetrics() {
        return {
            totalOperationTime: 0,
            totalPowerConsumed: 0,
            operationalEvents: 0,
            faultEvents: 0
        };
    }
    
    /**
     * Main physics update - called by physics engine each step
     * @param {number} deltaTime - Time since last update (seconds)
     * @param {object} satellite - Satellite physics state
     * @param {object} environment - Environmental conditions
     */
    update(deltaTime, satellite, environment) {
        if (!this.isEnabled) return;
        
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        
        // Update metrics
        this.metrics.totalOperationTime += deltaTime;
        this.metrics.totalPowerConsumed += this.state.powerConsumption * deltaTime / 3600; // Wh
        
        // Call subsystem-specific update
        this.updateSubsystem(deltaTime, satellite, environment);
        
        this.lastUpdateTime = now;
        this.state.lastUpdate = now;
    }
    
    /**
     * Override in subclasses for subsystem-specific physics
     * @param {number} _deltaTime - Time since last update (seconds)
     * @param {object} _satellite - Satellite physics state
     * @param {object} _environment - Environmental conditions
     */
    // eslint-disable-next-line no-unused-vars
    updateSubsystem(_deltaTime, _satellite, _environment) {
        // Override in subclasses
    }
    
    /**
     * Get current subsystem status for external systems
     */
    getStatus() {
        return {
            subsystemType: this.subsystemType,
            satelliteId: this.satelliteId,
            config: { ...this.config },
            state: { ...this.state },
            metrics: { ...this.metrics },
            isEnabled: this.isEnabled
        };
    }
    
    /**
     * Update subsystem configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.onConfigUpdate(newConfig);
    }
    
    /**
     * Override in subclasses to handle configuration changes
     */
    onConfigUpdate() {
        // Override in subclasses
    }
    
    /**
     * Enable/disable subsystem
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.state.status = enabled ? 'operational' : 'offline';
    }
    
    /**
     * Get power consumption (watts)
     */
    getPowerConsumption() {
        return this.state.powerConsumption;
    }
    
    /**
     * Get thermal output (watts)
     */
    getThermalOutput() {
        return this.state.powerConsumption * 0.7; // Assume 70% becomes heat
    }
    
    /**
     * Handle subsystem failure/degradation
     */
    onFailure(reason) {
        this.state.status = 'offline';
        this.metrics.faultEvents++;
        console.warn(`[${this.subsystemType}] Failure in satellite ${this.satelliteId}: ${reason}`);
    }
    
    /**
     * Get physics engine reference
     */
    getPhysicsEngine() {
        return this.physicsEngine;
    }
    
    /**
     * Set physics engine reference (called by SubsystemManager)
     */
    setPhysicsEngine(physicsEngine) {
        this.physicsEngine = physicsEngine;
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        this.isEnabled = false;
    }
}