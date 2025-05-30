/**
 * SimulationController.js
 * 
 * Central controller for all simulation state and commands.
 * Implements proper separation of concerns by acting as the single
 * source of truth and coordinator for all simulation operations.
 * 
 * Benefits:
 * - Single responsibility: manages simulation state
 * - Encapsulation: UI doesn't know about internal systems
 * - Consistency: all changes go through one place
 * - Testability: easy to mock and test
 */

export class SimulationController {
    constructor(app3d) {
        this.app3d = app3d;
        
        // Simulation state - single source of truth
        this.state = {
            timeWarp: 1,
            simulationTime: new Date(),
            isPaused: false,
            isInitialized: false
        };
        
        // Registered systems that need updates
        this.systems = new Set();
        
        // Event listeners for state changes
        this.listeners = new Map(); // eventType -> Set<callback>
        
        // Bind methods
        this.handlePhysicsTimeUpdate = this.handlePhysicsTimeUpdate.bind(this);
    }
    
    /**
     * Initialize the simulation controller
     */
    async initialize() {
        if (this.state.isInitialized) return;
        
        // Register core systems
        if (this.app3d.timeUtils) {
            this.registerSystem('timeUtils', this.app3d.timeUtils);
        }
        
        if (this.app3d.physicsManager) {
            this.registerSystem('physicsManager', this.app3d.physicsManager);
        }
        
        if (this.app3d.satellites?.physicsProvider) {
            this.registerSystem('physicsProvider', this.app3d.satellites.physicsProvider);
        }
        
        // Listen for physics-driven time updates
        document.addEventListener('physicsTimeUpdate', this.handlePhysicsTimeUpdate);
        
        this.state.isInitialized = true;
    }
    
    /**
     * Register a system that needs simulation updates
     * @param {string} name - System name
     * @param {Object} system - System object with update methods
     */
    registerSystem(name, system) {
        this.systems.add({ name, system });
    }
    
    /**
     * Unregister a system
     * @param {string} name - System name
     */
    unregisterSystem(name) {
        for (const sys of this.systems) {
            if (sys.name === name) {
                this.systems.delete(sys);
                break;
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // COMMAND INTERFACE - UI calls these methods
    // ─────────────────────────────────────────────────────────────────────
    
    /**
     * Set time warp (command pattern)
     * @param {number} timeWarp - New time warp value
     * @returns {boolean} Success status
     */
    setTimeWarp(timeWarp) {
        try {
            // Validate input
            if (typeof timeWarp !== 'number' || timeWarp < 0) {
                console.warn('[SimulationController] Invalid time warp:', timeWarp);
                return false;
            }
            
            const oldWarp = this.state.timeWarp;
            this.state.timeWarp = timeWarp;
            this.state.isPaused = timeWarp === 0;
            
            // Update all registered systems
            this._updateSystems('timeWarp', timeWarp);
            
            // Emit state change event
            this._emitStateChange('timeWarpChanged', {
                oldValue: oldWarp,
                newValue: timeWarp,
                isPaused: this.state.isPaused
            });
            
            return true;
        } catch (error) {
            console.error('[SimulationController] Error setting time warp:', error);
            return false;
        }
    }
    
    /**
     * Set simulation time (command pattern)
     * @param {Date|string|number} newTime - New simulation time
     * @returns {boolean} Success status
     */
    setSimulationTime(newTime) {
        try {
            let time;
            if (newTime instanceof Date) {
                time = newTime;
            } else {
                time = new Date(newTime);
            }
            
            if (isNaN(time.getTime())) {
                console.warn('[SimulationController] Invalid time:', newTime);
                return false;
            }
            
            const oldTime = this.state.simulationTime;
            this.state.simulationTime = time;
            
            // Update all registered systems
            this._updateSystems('simulationTime', time);
            
            // Emit state change event
            this._emitStateChange('simulationTimeChanged', {
                oldValue: oldTime,
                newValue: time
            });
            
            return true;
        } catch (error) {
            console.error('[SimulationController] Error setting simulation time:', error);
            return false;
        }
    }
    
    /**
     * Pause simulation
     * @returns {boolean} Success status
     */
    pause() {
        return this.setTimeWarp(0);
    }
    
    /**
     * Resume simulation
     * @returns {boolean} Success status
     */
    resume() {
        // Resume at 1x if currently paused
        if (this.state.isPaused) {
            return this.setTimeWarp(1);
        }
        return true;
    }
    
    /**
     * Toggle pause/resume
     * @returns {boolean} Success status
     */
    togglePause() {
        return this.state.isPaused ? this.resume() : this.pause();
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // QUERY INTERFACE - UI queries these for state
    // ─────────────────────────────────────────────────────────────────────
    
    /**
     * Get current time warp
     * @returns {number} Current time warp value
     */
    getTimeWarp() {
        return this.state.timeWarp;
    }
    
    /**
     * Get current simulation time
     * @returns {Date} Current simulation time
     */
    getSimulationTime() {
        return new Date(this.state.simulationTime.getTime());
    }
    
    /**
     * Check if simulation is paused
     * @returns {boolean} True if paused
     */
    isPaused() {
        return this.state.isPaused;
    }
    
    /**
     * Get full simulation state
     * @returns {Object} Complete state object
     */
    getState() {
        return {
            timeWarp: this.state.timeWarp,
            simulationTime: new Date(this.state.simulationTime.getTime()),
            isPaused: this.state.isPaused,
            isInitialized: this.state.isInitialized
        };
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // EVENT INTERFACE - UI subscribes to these for reactive updates
    // ─────────────────────────────────────────────────────────────────────
    
    /**
     * Subscribe to state changes
     * @param {string} eventType - Event type to listen for
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribe(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        
        this.listeners.get(eventType).add(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(eventType);
            if (callbacks) {
                callbacks.delete(callback);
            }
        };
    }
    
    /**
     * Subscribe to all state changes
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribeToAll(callback) {
        const unsubscribers = [
            this.subscribe('timeWarpChanged', callback),
            this.subscribe('simulationTimeChanged', callback),
        ];
        
        // Return combined unsubscribe function
        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // INTERNAL METHODS
    // ─────────────────────────────────────────────────────────────────────
    
    /**
     * Update all registered systems
     * @param {string} property - Property that changed
     * @param {*} value - New value
     */
    _updateSystems(property, value) {
        for (const { name, system } of this.systems) {
            try {
                if (property === 'timeWarp') {
                    if (system.setTimeWarp) {
                        system.setTimeWarp(value);
                    } else if (system.setLocalTimeWarp) {
                        system.setLocalTimeWarp(value);
                    }
                } else if (property === 'simulationTime') {
                    if (system.setSimulatedTime) {
                        system.setSimulatedTime(value);
                    } else if (system.setTime) {
                        system.setTime(value);
                    }
                }
            } catch (error) {
                console.error(`[SimulationController] Error updating system ${name}:`, error);
            }
        }
    }
    
    /**
     * Emit state change event
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    _emitStateChange(eventType, data) {
        // Notify subscribers
        const callbacks = this.listeners.get(eventType);
        if (callbacks) {
            for (const callback of callbacks) {
                try {
                    callback({ type: eventType, ...data, state: this.getState() });
                } catch (error) {
                    console.error(`[SimulationController] Error in ${eventType} callback:`, error);
                }
            }
        }
        
        // Also emit DOM event for backwards compatibility
        document.dispatchEvent(new CustomEvent(eventType, {
            detail: { ...data, state: this.getState() }
        }));
    }
    
    /**
     * Handle physics-driven time updates
     * @param {CustomEvent} event - Physics time update event
     */
    handlePhysicsTimeUpdate(event) {
        if (event.detail?.simulationTime) {
            // Update our internal state without triggering system updates
            // (since this came from physics system)
            this.state.simulationTime = new Date(event.detail.simulationTime);
            
            // Only emit UI update events
            this._emitStateChange('simulationTimeChanged', {
                newValue: this.state.simulationTime,
                source: 'physics'
            });
        }
    }
    
    /**
     * Dispose of the controller
     */
    dispose() {
        // Remove event listeners
        document.removeEventListener('physicsTimeUpdate', this.handlePhysicsTimeUpdate);
        
        // Clear all subscribers
        this.listeners.clear();
        
        // Clear systems
        this.systems.clear();
        
        // Clear state
        this.state.isInitialized = false;
    }
}