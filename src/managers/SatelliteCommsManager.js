/**
 * SatelliteCommsManager.js
 * 
 * Manager that provides communication presets and helper functions.
 * Works with physics subsystem instead of maintaining duplicate state.
 */

export class SatelliteCommsManager {
    constructor(physicsEngine = null) {
        this.physicsEngine = physicsEngine;

        // Communication presets for different satellite types
        this.presets = {
            cubesat: {
                antennaGain: 8.0,  // More realistic directional antenna
                transmitPower: 5.0, // Higher power for space simulation
                antennaType: 'omnidirectional',
                protocols: ['inter_satellite', 'ground_station'],
                dataRate: 100,
                minElevationAngle: 5.0, // Lower elevation requirement
                networkId: 'cubesat_network',
                enabled: true // Enable communications by default
            },

            communications_satellite: {
                antennaGain: 25.0,
                transmitPower: 50.0,
                antennaType: 'directional',
                beamSteering: true,
                protocols: ['inter_satellite', 'ground_station', 'relay'],
                dataRate: 10000,
                minElevationAngle: 5.0,
                relayCapable: true,
                networkId: 'commercial_network',
                enabled: true
            },

            scientific_probe: {
                antennaGain: 35.0,
                transmitPower: 20.0,
                antennaType: 'high_gain',
                protocols: ['deep_space', 'ground_station'],
                dataRate: 500,
                minElevationAngle: 0.0,
                networkId: 'deep_space_network',
                enabled: true
            },

            military_satellite: {
                antennaGain: 20.0,
                transmitPower: 100.0,
                antennaType: 'phased_array',
                beamSteering: true,
                protocols: ['inter_satellite', 'ground_station'],
                dataRate: 5000,
                minElevationAngle: 3.0,
                encryption: true,
                priority: 'high',
                networkId: 'military_network',
                enabled: true
            },

            earth_observation: {
                antennaGain: 15.0,
                transmitPower: 25.0,
                antennaType: 'directional',
                protocols: ['ground_station', 'relay'],
                dataRate: 2000,
                minElevationAngle: 5.0,
                networkId: 'earth_observation_network',
                enabled: true
            }
        };

        // Global communication settings
        this.globalSettings = {
            updateInterval: 1000,  // Global update rate for all satellites
            enableDeepSpaceComms: true,
            enableInterSatelliteLinks: true,
            atmosphericModel: 'standard',
            noiseLevel: 'low'
        };
    }

    /**
     * Set physics engine reference
     */
    setPhysicsEngine(physicsEngine) {
        this.physicsEngine = physicsEngine;
    }

    /**
     * Create communication system for a satellite
     * Now delegates to physics subsystem instead of creating duplicate objects
     */
    createCommsSystem(satelliteId, config = {}) {
        if (!this.physicsEngine?.subsystemManager) {
            console.warn('No physics engine available for communications');
            return null;
        }

        // Apply preset if specified
        let finalConfig = { ...config };
        if (config.preset && this.presets[config.preset]) {
            finalConfig = { ...this.presets[config.preset], ...config };
            delete finalConfig.preset;
        }

        // Apply global settings
        finalConfig.updateInterval = finalConfig.updateInterval || this.globalSettings.updateInterval;

        // Update the physics subsystem
        this.physicsEngine.subsystemManager.updateSubsystemConfig(satelliteId, 'communication', finalConfig);

        return this.getCommsSystem(satelliteId);
    }

    /**
     * Remove communication system for a satellite
     */
    removeCommsSystem(satelliteId) {
        // Communications are managed by physics subsystem
        // This method now just clears any local cache if needed
    }

    /**
     * Get communication system for a satellite
     * Returns a proxy object that wraps the physics subsystem
     */
    getCommsSystem(satelliteId) {
        if (!this.physicsEngine?.subsystemManager) {
            return null;
        }

        const subsystem = this.physicsEngine.subsystemManager.getSubsystem(satelliteId, 'communication');
        if (!subsystem) {
            return null;
        }

        // Return a proxy object with the expected interface
        return {
            id: satelliteId,
            config: subsystem.config,
            getStatus: () => subsystem.getStatus(),
            getActiveConnections: () => subsystem.activeConnections,
            calculateLinkBudget: (targetConfig, distance, frequency) => 
                subsystem.calculateLinkBudget(targetConfig, distance, frequency)
        };
    }

    /**
     * Calculate all possible communication links
     * NOTE: This is now handled by LineOfSightManager and physics subsystems
     * This method is kept for backward compatibility but should be deprecated
     */
    calculateCommunicationLinks(satellites, bodies, groundStations = []) {
        console.warn('SatelliteCommsManager.calculateCommunicationLinks is deprecated. Use LineOfSightManager instead.');
        return [];
    }

    /**
     * Update global communication settings
     */
    updateGlobalSettings(newSettings) {
        Object.assign(this.globalSettings, newSettings);
        // Global settings now managed at physics engine level
    }

    /**
     * Update communication configuration for a specific satellite
     */
    updateSatelliteComms(satelliteId, newConfig) {
        if (!this.physicsEngine?.subsystemManager) {
            console.warn('No physics engine available for communications');
            return;
        }
        
        // Apply preset if specified
        let finalConfig = { ...newConfig };
        if (newConfig.preset && this.presets[newConfig.preset]) {
            finalConfig = { ...this.presets[newConfig.preset], ...newConfig };
            delete finalConfig.preset;
        }
        
        this.physicsEngine.subsystemManager.updateSubsystemConfig(satelliteId, 'communication', finalConfig);
    }

    /**
     * Get all satellites with communication systems
     */
    getAllCommsSystems() {
        if (!this.physicsEngine?.subsystemManager) {
            return [];
        }
        
        // Get all satellites from physics engine
        const satellites = this.physicsEngine.satellites;
        const systems = [];
        
        for (const [satelliteId, satellite] of satellites) {
            const subsystem = this.physicsEngine.subsystemManager.getSubsystem(satelliteId, 'communication');
            if (subsystem) {
                systems.push({
                    satelliteId,
                    status: subsystem.getStatus(),
                    activeConnections: Array.from(subsystem.activeConnections)
                });
            }
        }
        return systems;
    }

    /**
     * Get available presets
     */
    getPresets() {
        return { ...this.presets };
    }

    // Private helper methods

    _calculateDistance(pos1, pos2) {
        const dx = pos2[0] - pos1[0];
        const dy = pos2[1] - pos1[1];
        const dz = pos2[2] - pos1[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    _calculateRelativeVelocity(vel1, vel2) {
        const dvx = vel2[0] - vel1[0];
        const dvy = vel2[1] - vel1[1];
        const dvz = vel2[2] - vel1[2];
        return Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
    }

    _calculateElevationAngle(groundPos, satPos) {
        // Vector from ground to satellite
        const dx = satPos[0] - groundPos[0];
        const dy = satPos[1] - groundPos[1];
        const dz = satPos[2] - groundPos[2];

        // Ground station local "up" vector
        const groundRadius = Math.sqrt(groundPos[0] * groundPos[0] + groundPos[1] * groundPos[1] + groundPos[2] * groundPos[2]);
        const upX = groundPos[0] / groundRadius;
        const upY = groundPos[1] / groundRadius;
        const upZ = groundPos[2] / groundRadius;

        // Satellite range vector
        const rangeLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const rangeX = dx / rangeLength;
        const rangeY = dy / rangeLength;
        const rangeZ = dz / rangeLength;

        // Elevation angle
        const dotProduct = upX * rangeX + upY * rangeY + upZ * rangeZ;
        const elevationRad = Math.asin(Math.max(-1, Math.min(1, dotProduct)));

        return elevationRad * 180 / Math.PI;
    }

    /**
     * Dispose of the manager
     */
    dispose() {
        // Communications are now managed by physics subsystem
        // Nothing to dispose here
    }
}