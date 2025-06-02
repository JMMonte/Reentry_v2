/**
 * SubsystemManager.js
 * 
 * Central manager for all satellite subsystems in the physics simulation.
 * Integrates subsystems into the main physics engine with proper separation of concerns.
 * Provides standardized interface for adding new subsystem types.
 */

import { CommunicationSubsystem } from './CommunicationSubsystem.js';
// Future subsystems can be imported here:
// import { PowerSubsystem } from './PowerSubsystem.js';
// import { ThermalSubsystem } from './ThermalSubsystem.js';
// import { PropulsionSubsystem } from './PropulsionSubsystem.js';
// import { AttitudeSubsystem } from './AttitudeSubsystem.js';

export class SubsystemManager {
    constructor(physicsEngine) {
        this.physicsEngine = physicsEngine;
        
        // Map of satelliteId -> Map of subsystemType -> subsystem instance
        this.subsystems = new Map();
        
        // Registry of available subsystem types
        this.subsystemTypes = new Map([
            ['communication', CommunicationSubsystem],
            // Future subsystems:
            // ['power', PowerSubsystem],
            // ['thermal', ThermalSubsystem],
            // ['propulsion', PropulsionSubsystem],
            // ['attitude', AttitudeSubsystem]
        ]);
        
        // Performance tracking
        this.updateStats = {
            totalUpdates: 0,
            averageUpdateTime: 0,
            lastUpdateTime: 0
        };
        
        console.log('[SubsystemManager] Initialized with', this.subsystemTypes.size, 'subsystem types');
    }
    
    /**
     * Add subsystem to a satellite
     */
    addSubsystem(satelliteId, subsystemType, config = {}) {
        const SubsystemClass = this.subsystemTypes.get(subsystemType);
        if (!SubsystemClass) {
            throw new Error(`Unknown subsystem type: ${subsystemType}`);
        }
        
        // Ensure satellite exists in our tracking
        if (!this.subsystems.has(satelliteId)) {
            this.subsystems.set(satelliteId, new Map());
        }
        
        const satelliteSubsystems = this.subsystems.get(satelliteId);
        
        // Remove existing subsystem of same type if it exists
        if (satelliteSubsystems.has(subsystemType)) {
            const existing = satelliteSubsystems.get(subsystemType);
            existing.destroy();
        }
        
        // Create new subsystem
        const subsystem = new SubsystemClass(satelliteId, config);
        
        // Set physics engine reference for subsystem
        subsystem.setPhysicsEngine(this.physicsEngine);
        
        satelliteSubsystems.set(subsystemType, subsystem);
        
        console.log(`[SubsystemManager] Added ${subsystemType} to satellite ${satelliteId}`);
        return subsystem;
    }
    
    /**
     * Remove subsystem from satellite
     */
    removeSubsystem(satelliteId, subsystemType) {
        const satelliteSubsystems = this.subsystems.get(satelliteId);
        if (!satelliteSubsystems) return false;
        
        const subsystem = satelliteSubsystems.get(subsystemType);
        if (!subsystem) return false;
        
        subsystem.destroy();
        satelliteSubsystems.delete(subsystemType);
        
        // Clean up empty satellite entries
        if (satelliteSubsystems.size === 0) {
            this.subsystems.delete(satelliteId);
        }
        
        console.log(`[SubsystemManager] Removed ${subsystemType} from satellite ${satelliteId}`);
        return true;
    }
    
    /**
     * Remove all subsystems for a satellite (when satellite is deleted)
     */
    removeSatellite(satelliteId) {
        const satelliteSubsystems = this.subsystems.get(satelliteId);
        if (!satelliteSubsystems) return;
        
        // Destroy all subsystems
        satelliteSubsystems.forEach((subsystem, type) => {
            subsystem.destroy();
        });
        
        this.subsystems.delete(satelliteId);
        console.log(`[SubsystemManager] Removed all subsystems for satellite ${satelliteId}`);
    }
    
    /**
     * Get specific subsystem
     */
    getSubsystem(satelliteId, subsystemType) {
        const satelliteSubsystems = this.subsystems.get(satelliteId);
        return satelliteSubsystems?.get(subsystemType) || null;
    }
    
    /**
     * Get all subsystems for a satellite
     */
    getSatelliteSubsystems(satelliteId) {
        return this.subsystems.get(satelliteId) || new Map();
    }
    
    /**
     * Get subsystem status for external systems (UI, etc.)
     */
    getSubsystemStatus(satelliteId, subsystemType) {
        const subsystem = this.getSubsystem(satelliteId, subsystemType);
        return subsystem ? subsystem.getStatus() : null;
    }
    
    /**
     * Get all subsystem statuses for a satellite
     */
    getAllSubsystemStatuses(satelliteId) {
        const satelliteSubsystems = this.getSatelliteSubsystems(satelliteId);
        const statuses = {};
        
        satelliteSubsystems.forEach((subsystem, type) => {
            statuses[type] = subsystem.getStatus();
        });
        
        return statuses;
    }
    
    /**
     * Main physics update - called by physics engine each step
     */
    update(deltaTime) {
        const updateStart = performance.now();
        
        // Get environmental conditions from physics engine
        const environment = this.getEnvironmentalConditions();
        
        // Update all subsystems
        this.subsystems.forEach((satelliteSubsystems, satelliteId) => {
            // Get satellite physics state
            const satellite = this.physicsEngine.satellites?.get(satelliteId);
            if (!satellite) {
                console.warn(`[SubsystemManager] Satellite ${satelliteId} not found in physics engine`);
                return;
            }
            
            // Update each subsystem
            satelliteSubsystems.forEach((subsystem, type) => {
                try {
                    subsystem.update(deltaTime, satellite, environment);
                } catch (error) {
                    console.error(`[SubsystemManager] Error updating ${type} for satellite ${satelliteId}:`, error);
                    subsystem.onFailure(`Update error: ${error.message}`);
                }
            });
        });
        
        // Update performance stats
        const updateTime = performance.now() - updateStart;
        this.updateStats.totalUpdates++;
        this.updateStats.averageUpdateTime = 
            (this.updateStats.averageUpdateTime * (this.updateStats.totalUpdates - 1) + updateTime) 
            / this.updateStats.totalUpdates;
        this.updateStats.lastUpdateTime = updateTime;
    }
    
    /**
     * Get environmental conditions from physics engine
     */
    getEnvironmentalConditions() {
        // This would integrate with the main physics engine to get:
        // - Solar radiation levels
        // - Atmospheric density
        // - Temperature
        // - Magnetic field strength
        // - Plasma environment
        
        return {
            solarRadiation: 1361, // W/m² (solar constant)
            temperature: 2.7,     // K (cosmic background)
            magneticField: 0,     // Tesla
            plasmaDensity: 0,     // particles/m³
            timestamp: Date.now()
        };
    }
    
    /**
     * Update subsystem configuration
     */
    updateSubsystemConfig(satelliteId, subsystemType, newConfig) {
        const subsystem = this.getSubsystem(satelliteId, subsystemType);
        if (subsystem) {
            subsystem.updateConfig(newConfig);
            return true;
        }
        return false;
    }
    
    /**
     * Enable/disable subsystem
     */
    setSubsystemEnabled(satelliteId, subsystemType, enabled) {
        const subsystem = this.getSubsystem(satelliteId, subsystemType);
        if (subsystem) {
            subsystem.setEnabled(enabled);
            return true;
        }
        return false;
    }
    
    /**
     * Get total power consumption for a satellite
     */
    getTotalPowerConsumption(satelliteId) {
        const satelliteSubsystems = this.getSatelliteSubsystems(satelliteId);
        let totalPower = 0;
        
        satelliteSubsystems.forEach(subsystem => {
            totalPower += subsystem.getPowerConsumption();
        });
        
        return totalPower;
    }
    
    /**
     * Get total thermal output for a satellite
     */
    getTotalThermalOutput(satelliteId) {
        const satelliteSubsystems = this.getSatelliteSubsystems(satelliteId);
        let totalThermal = 0;
        
        satelliteSubsystems.forEach(subsystem => {
            totalThermal += subsystem.getThermalOutput();
        });
        
        return totalThermal;
    }
    
    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        return {
            ...this.updateStats,
            activeSatellites: this.subsystems.size,
            totalSubsystems: Array.from(this.subsystems.values())
                .reduce((total, satelliteSubsystems) => total + satelliteSubsystems.size, 0)
        };
    }
    
    /**
     * Register new subsystem type
     */
    registerSubsystemType(typeName, SubsystemClass) {
        this.subsystemTypes.set(typeName, SubsystemClass);
        console.log(`[SubsystemManager] Registered subsystem type: ${typeName}`);
    }
    
    /**
     * Get available subsystem types
     */
    getAvailableSubsystemTypes() {
        return Array.from(this.subsystemTypes.keys());
    }
    
    /**
     * Cleanup when manager is destroyed
     */
    destroy() {
        // Destroy all subsystems
        this.subsystems.forEach((satelliteSubsystems, satelliteId) => {
            satelliteSubsystems.forEach(subsystem => {
                subsystem.destroy();
            });
        });
        
        this.subsystems.clear();
        console.log('[SubsystemManager] Destroyed');
    }
}