/**
 * SatelliteCommsManager.js
 * 
 * Physics-layer manager for satellite communications.
 * Handles communication logic separately from visualization.
 * Maintains separation of concerns: this is pure logic, no Three.js or React.
 */

import { SatelliteComms } from '../components/Satellite/SatelliteComms.js';

export class SatelliteCommsManager {
    constructor() {
        // Map of satelliteId -> SatelliteComms instance
        this.commsystems = new Map();
        
        // Communication presets for different satellite types
        this.presets = {
            cubesat: {
                antennaGain: 2.0,
                transmitPower: 1.0,
                antennaType: 'omnidirectional',
                protocols: ['inter_satellite', 'ground_station'],
                dataRate: 100,
                minElevationAngle: 10.0,
                networkId: 'cubesat_network'
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
                networkId: 'commercial_network'
            },
            
            scientific_probe: {
                antennaGain: 35.0,
                transmitPower: 20.0,
                antennaType: 'high_gain',
                protocols: ['deep_space', 'ground_station'],
                dataRate: 500,
                minElevationAngle: 0.0,
                networkId: 'deep_space_network'
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
                networkId: 'military_network'
            },
            
            earth_observation: {
                antennaGain: 15.0,
                transmitPower: 25.0,
                antennaType: 'directional',
                protocols: ['ground_station', 'relay'],
                dataRate: 2000,
                minElevationAngle: 5.0,
                networkId: 'earth_observation_network'
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
     * Create communication system for a satellite
     */
    createCommsSystem(satelliteId, config = {}) {
        // Apply preset if specified
        let finalConfig = { ...config };
        if (config.preset && this.presets[config.preset]) {
            finalConfig = { ...this.presets[config.preset], ...config };
            delete finalConfig.preset;
        }
        
        // Apply global settings
        finalConfig.updateInterval = finalConfig.updateInterval || this.globalSettings.updateInterval;
        
        const comms = new SatelliteComms(satelliteId, finalConfig);
        this.commsystems.set(satelliteId, comms);
        
        console.log(`[SatelliteCommsManager] Created comms for satellite ${satelliteId}:`, finalConfig);
        return comms;
    }
    
    /**
     * Remove communication system for a satellite
     */
    removeCommsSystem(satelliteId) {
        const comms = this.commsystems.get(satelliteId);
        if (comms) {
            comms.dispose();
            this.commsystems.delete(satelliteId);
            console.log(`[SatelliteCommsManager] Removed comms for satellite ${satelliteId}`);
        }
    }
    
    /**
     * Get communication system for a satellite
     */
    getCommsSystem(satelliteId) {
        return this.commsystems.get(satelliteId);
    }
    
    /**
     * Calculate all possible communication links
     */
    calculateCommunicationLinks(satellites, bodies, groundStations = []) {
        const links = [];
        const satelliteIds = Array.from(this.commsystems.keys());
        
        // Satellite-to-satellite links
        for (let i = 0; i < satelliteIds.length; i++) {
            for (let j = i + 1; j < satelliteIds.length; j++) {
                const satId1 = satelliteIds[i];
                const satId2 = satelliteIds[j];
                
                const sat1 = satellites.find(s => s.id === satId1);
                const sat2 = satellites.find(s => s.id === satId2);
                
                if (!sat1 || !sat2) continue;
                
                const comms1 = this.commsystems.get(satId1);
                const comms2 = this.commsystems.get(satId2);
                
                if (!comms1 || !comms2) continue;
                
                const distance = this._calculateDistance(sat1.position, sat2.position);
                const relativeVelocity = this._calculateRelativeVelocity(sat1.velocity, sat2.velocity);
                
                // Create a mock satellite object with comms for the calculation
                const mockSat2 = { comms: comms2 };
                const linkInfo = comms1.canCommunicateWith(mockSat2, distance, null, relativeVelocity);
                
                if (linkInfo.possible) {
                    links.push({
                        type: 'satellite-satellite',
                        from: satId1,
                        to: satId2,
                        fromPosition: sat1.position,
                        toPosition: sat2.position,
                        distance,
                        linkInfo,
                        color: comms1.getLinkColor(linkInfo.quality)
                    });
                    
                    // Update both satellites' connection states
                    comms1.establishLink(satId2, linkInfo);
                    comms2.establishLink(satId1, linkInfo);
                }
            }
        }
        
        // Satellite-to-ground links
        for (const satelliteId of satelliteIds) {
            const satellite = satellites.find(s => s.id === satelliteId);
            const comms = this.commsystems.get(satelliteId);
            
            if (!satellite || !comms) continue;
            
            for (const groundStation of groundStations) {
                const distance = this._calculateDistance(satellite.position, groundStation.position);
                const elevation = this._calculateElevationAngle(groundStation.position, satellite.position);
                
                // Create a mock ground station with basic comms
                const mockGroundStation = {
                    comms: new SatelliteComms(`ground_${groundStation.id}`, {
                        antennaGain: groundStation.antennaGain || 25.0,
                        protocols: ['ground_station'],
                        enabled: true
                    })
                };
                
                const linkInfo = comms.canCommunicateWith(mockGroundStation, distance, elevation);
                
                if (linkInfo.possible) {
                    links.push({
                        type: 'satellite-ground',
                        from: satelliteId,
                        to: groundStation.id,
                        fromPosition: satellite.position,
                        toPosition: groundStation.position,
                        distance,
                        elevation,
                        linkInfo,
                        color: comms.getLinkColor(linkInfo.quality)
                    });
                    
                    comms.establishLink(`ground_${groundStation.id}`, linkInfo);
                }
            }
        }
        
        return links;
    }
    
    /**
     * Update global communication settings
     */
    updateGlobalSettings(newSettings) {
        Object.assign(this.globalSettings, newSettings);
        
        // Update all existing comm systems if needed
        if (newSettings.updateInterval !== undefined) {
            for (const comms of this.commsystems.values()) {
                comms.updateConfig({ updateInterval: newSettings.updateInterval });
            }
        }
        
        console.log('[SatelliteCommsManager] Updated global settings:', this.globalSettings);
    }
    
    /**
     * Update communication configuration for a specific satellite
     */
    updateSatelliteComms(satelliteId, newConfig) {
        const comms = this.commsystems.get(satelliteId);
        if (comms) {
            comms.updateConfig(newConfig);
            console.log(`[SatelliteCommsManager] Updated comms for satellite ${satelliteId}:`, newConfig);
        }
    }
    
    /**
     * Get all satellites with communication systems
     */
    getAllCommsSystems() {
        const systems = [];
        for (const [satelliteId, comms] of this.commsystems.entries()) {
            systems.push({
                satelliteId,
                status: comms.getStatus(),
                activeConnections: comms.getActiveConnections()
            });
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
     * Dispose of all communication systems
     */
    dispose() {
        for (const comms of this.commsystems.values()) {
            comms.dispose();
        }
        this.commsystems.clear();
        console.log('[SatelliteCommsManager] Disposed all communication systems');
    }
}