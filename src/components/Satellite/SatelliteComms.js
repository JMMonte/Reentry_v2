/**
 * SatelliteComms.js
 * 
 * Object-oriented communication system for individual satellites.
 * Each satellite has its own communication configuration and capabilities.
 */

export class SatelliteComms {
    constructor(satelliteId, config = {}) {
        this.satelliteId = satelliteId;
        
        // Communication hardware configuration
        this.config = {
            // Antenna specifications
            antennaGain: config.antennaGain || 12.0,          // dBi - antenna gain
            antennaBeamWidth: config.antennaBeamWidth || 60,   // degrees - antenna beam width
            antennaType: config.antennaType || 'omnidirectional', // omnidirectional, directional, phased_array
            
            // Transmitter specifications  
            transmitPower: config.transmitPower || 10.0,       // watts
            transmitFrequency: config.transmitFrequency || 2.4, // GHz
            
            // Receiver specifications
            receiverSensitivity: config.receiverSensitivity || -110, // dBm
            noiseTemperature: config.noiseTemperature || 500,   // Kelvin
            
            // Communication protocols
            protocols: config.protocols || ['inter_satellite', 'ground_station', 'deep_space'],
            dataRate: config.dataRate || 1000,                 // kbps
            
            // Link quality requirements
            minElevationAngle: config.minElevationAngle || 5.0, // degrees
            minLinkMargin: config.minLinkMargin || 1.5,         // dB - relaxed for space simulation
            maxDopplerShift: config.maxDopplerShift || 50,      // kHz
            
            // Network configuration
            networkId: config.networkId || 'default',
            priority: config.priority || 'normal',             // low, normal, high, critical
            encryption: config.encryption || true,
            
            // Operational parameters
            enabled: config.enabled !== false,
            powerMode: config.powerMode || 'normal',           // low, normal, high
            updateInterval: config.updateInterval || 1000,     // ms
            
            // Advanced features
            beamSteering: config.beamSteering || false,        // can steer antenna beam
            diversityAntennas: config.diversityAntennas || 1,  // number of diversity antennas
            adaptivePower: config.adaptivePower || false,      // can adapt transmit power
            relayCapable: config.relayCapable || false         // can relay communications
        };
        
        // Communication state
        this.state = {
            activeConnections: new Map(),    // satelliteId -> connection info
            linkQuality: new Map(),          // satelliteId -> quality metrics
            lastUpdate: 0,
            totalDataTransmitted: 0,         // bytes
            totalDataReceived: 0,            // bytes
            batteryUsage: 0,                 // power consumption in watts
            temperature: 20,                 // operating temperature
            status: 'operational'            // operational, degraded, offline
        };
        
        // Performance metrics
        this.metrics = {
            connectionAttempts: 0,
            successfulConnections: 0,
            droppedConnections: 0,
            averageLinkQuality: 0,
            dataTransferEfficiency: 100,
            lastMaintenanceCheck: Date.now()
        };
    }
    
    /**
     * Calculate link budget between this satellite and another object
     */
    calculateLinkBudget(targetComms, distance, elevation = null) {
        // Transmitter power in dBm
        const txPowerDbm = 10 * Math.log10(this.config.transmitPower * 1000);
        
        // Free space path loss
        const frequency = this.config.transmitFrequency;
        const pathLoss = 20 * Math.log10(distance) + 20 * Math.log10(frequency) + 92.45;
        
        // Antenna gains
        const txGain = this.config.antennaGain;
        const rxGain = targetComms?.config?.antennaGain || 0;
        
        // System losses (cables, atmospheric, etc.)
        let systemLosses = 2.0; // dB
        
        // Atmospheric losses (frequency dependent)
        if (elevation !== null) {
            const atmosphericLoss = this._calculateAtmosphericLoss(frequency, elevation);
            systemLosses += atmosphericLoss;
        }
        
        // Received signal strength
        const receivedPower = txPowerDbm + txGain + rxGain - pathLoss - systemLosses;
        
        // Link margin
        const rxSensitivity = targetComms?.config?.receiverSensitivity || -110;
        const linkMargin = receivedPower - rxSensitivity;
        
        return {
            transmitPower: txPowerDbm,
            pathLoss,
            antennaGains: txGain + rxGain,
            systemLosses,
            receivedPower,
            linkMargin,
            viable: linkMargin >= this.config.minLinkMargin
        };
    }
    
    /**
     * Check if communication is possible with another satellite
     */
    canCommunicateWith(targetSatellite, distance, elevation = null, relativeVelocity = null) {
        if (!this.config.enabled || !targetSatellite.comms?.config?.enabled) {
            return { possible: false, reason: 'communications_disabled' };
        }
        
        // Check protocols compatibility
        const commonProtocols = this.config.protocols.filter(p => 
            targetSatellite.comms.config.protocols.includes(p)
        );
        if (commonProtocols.length === 0) {
            return { possible: false, reason: 'incompatible_protocols' };
        }
        
        // Check elevation angle for ground stations
        if (elevation !== null && elevation < this.config.minElevationAngle) {
            return { possible: false, reason: 'low_elevation', elevation, required: this.config.minElevationAngle };
        }
        
        // Check Doppler shift if relative velocity is known
        if (relativeVelocity !== null) {
            const dopplerShift = this._calculateDopplerShift(relativeVelocity);
            if (Math.abs(dopplerShift) > this.config.maxDopplerShift) {
                return { possible: false, reason: 'excessive_doppler', doppler: dopplerShift };
            }
        }
        
        // Calculate link budget
        const linkBudget = this.calculateLinkBudget(targetSatellite.comms, distance, elevation);
        if (!linkBudget.viable) {
            return { possible: false, reason: 'insufficient_link_margin', linkBudget };
        }
        
        return { 
            possible: true, 
            linkBudget, 
            protocols: commonProtocols,
            quality: this._calculateLinkQuality(linkBudget, elevation, relativeVelocity)
        };
    }
    
    /**
     * Establish a communication link
     */
    establishLink(targetSatelliteId, linkInfo) {
        this.metrics.connectionAttempts++;
        
        if (linkInfo.possible) {
            this.state.activeConnections.set(targetSatelliteId, {
                established: Date.now(),
                quality: linkInfo.quality,
                linkBudget: linkInfo.linkBudget,
                protocols: linkInfo.protocols,
                dataRate: this._calculateDataRate(linkInfo.quality),
                lastUpdate: Date.now()
            });
            
            this.metrics.successfulConnections++;
            return true;
        } else {
            return false;
        }
    }
    
    /**
     * Update existing communication link
     */
    updateLink(targetSatelliteId, newLinkInfo) {
        const connection = this.state.activeConnections.get(targetSatelliteId);
        if (!connection) return false;
        
        if (newLinkInfo.possible) {
            connection.quality = newLinkInfo.quality;
            connection.linkBudget = newLinkInfo.linkBudget;
            connection.dataRate = this._calculateDataRate(newLinkInfo.quality);
            connection.lastUpdate = Date.now();
            return true;
        } else {
            // Link lost
            this.state.activeConnections.delete(targetSatelliteId);
            this.metrics.droppedConnections++;
            return false;
        }
    }
    
    /**
     * Get all active connections
     */
    getActiveConnections() {
        return Array.from(this.state.activeConnections.entries()).map(([satelliteId, connection]) => ({
            targetSatelliteId: satelliteId,
            ...connection
        }));
    }
    
    /**
     * Update communication system configuration
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        
        // Recalculate active connections if configuration changed significantly
        if (newConfig.minElevationAngle !== undefined || 
            newConfig.transmitPower !== undefined ||
            newConfig.antennaGain !== undefined) {
            // Mark for recalculation on next update
            this.state.lastUpdate = 0;
        }
    }
    
    /**
     * Get communication system status
     */
    getStatus() {
        return {
            config: { ...this.config },
            state: { ...this.state },
            metrics: { ...this.metrics },
            activeConnectionCount: this.state.activeConnections.size
        };
    }
    
    /**
     * Get link quality color for visualization
     */
    getLinkColor(quality) {
        if (quality > 80) return 0x00ff00; // Green - excellent
        if (quality > 60) return 0xffff00; // Yellow - good
        if (quality > 40) return 0xff8000; // Orange - fair
        if (quality > 20) return 0xff4000; // Red-orange - poor
        return 0xff0000; // Red - very poor
    }
    
    // Private helper methods
    
    _calculateAtmosphericLoss(frequency, elevation) {
        // Simplified atmospheric loss model
        const elevationRad = elevation * Math.PI / 180;
        const zenithAngle = Math.PI / 2 - elevationRad;
        const atmosphericPath = 1 / Math.cos(zenithAngle);
        
        // Frequency-dependent atmospheric absorption
        let absorptionCoeff = 0;
        if (frequency < 1) {
            absorptionCoeff = 0.001;
        } else if (frequency < 10) {
            absorptionCoeff = 0.01 * frequency;
        } else {
            absorptionCoeff = 0.1 + 0.05 * (frequency - 10);
        }
        
        return absorptionCoeff * atmosphericPath;
    }
    
    _calculateDopplerShift(relativeVelocity) {
        // Doppler shift in kHz
        const speedOfLight = 299792458; // m/s
        const frequency = this.config.transmitFrequency * 1e9; // Convert to Hz
        return (relativeVelocity * frequency) / (speedOfLight * 1000); // Convert to kHz
    }
    
    _calculateLinkQuality(linkBudget, elevation, relativeVelocity) {
        let quality = 50; // Base quality
        
        // Link margin contribution (0-40 points)
        const marginScore = Math.min(40, Math.max(0, linkBudget.linkMargin * 2));
        quality += marginScore;
        
        // Elevation angle contribution (0-20 points)
        if (elevation !== null) {
            const elevationScore = Math.min(20, Math.max(0, (elevation - this.config.minElevationAngle) * 2));
            quality += elevationScore;
        }
        
        // Doppler penalty (-10 to 0 points)
        if (relativeVelocity !== null) {
            const dopplerShift = Math.abs(this._calculateDopplerShift(relativeVelocity));
            const dopplerPenalty = Math.min(0, -dopplerShift / 5);
            quality += dopplerPenalty;
        }
        
        return Math.max(0, Math.min(100, quality));
    }
    
    _calculateDataRate(quality) {
        // Data rate based on link quality
        const baseRate = this.config.dataRate;
        const qualityFactor = quality / 100;
        return Math.floor(baseRate * qualityFactor);
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        this.state.activeConnections.clear();
        this.state.linkQuality.clear();
    }
}