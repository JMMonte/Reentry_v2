/**
 * CommunicationSubsystem.js
 * 
 * Physics-based communication subsystem for satellites.
 * Handles RF link calculations, power consumption, thermal effects, and communication logic.
 * Properly integrated into the physics simulation with separation of concerns.
 */

import { SatelliteSubsystem } from './SatelliteSubsystem.js';
import { PhysicsConstants } from '../core/PhysicsConstants.js';

export class CommunicationSubsystem extends SatelliteSubsystem {
    constructor(satelliteId, config = {}) {
        super(satelliteId, 'communication', config);

        // Communication-specific state
        this.activeConnections = new Map(); // targetId -> connection info
        this.transmissionQueue = [];
        this.lastLinkCalculation = 0;
        this.linkCalculationInterval = 5000; // 5 seconds between link updates
    }

    getDefaultConfig() {
        return {
            // Antenna specifications
            antennaGain: 12.0,              // dBi
            antennaBeamWidth: 60,           // degrees
            antennaType: 'omnidirectional', // omnidirectional, directional, high_gain, phased_array
            antennaEfficiency: 0.85,        // 0-1

            // RF specifications
            transmitPower: 10.0,            // watts
            transmitFrequency: 2.4,         // GHz
            receiverSensitivity: -110,      // dBm
            noiseTemperature: 500,          // Kelvin

            // Communication protocols
            dataRate: 1000,                 // kbps
            protocols: ['inter_satellite', 'ground_station'],
            minElevationAngle: 5.0,         // degrees
            maxRange: 50000,                // km

            // Power and thermal
            basePowerConsumption: 5.0,      // watts (idle)
            transmitPowerEfficiency: 0.3,   // 30% RF efficiency

            // Network configuration
            networkId: 'default',
            priority: 'normal',
            encryption: true
        };
    }

    getInitialState() {
        const baseState = super.getInitialState();
        return {
            ...baseState,
            powerConsumption: this.config.basePowerConsumption,

            // Communication state
            isTransmitting: false,
            currentDataRate: 0,
            totalDataTransmitted: 0,       // bytes
            totalDataReceived: 0,          // bytes
            connectionCount: 0,

            // Link quality metrics
            bestLinkQuality: 0,            // 0-100%
            averageLinkQuality: 0,         // 0-100%
            totalLinkTime: 0,              // seconds with any active link

            // Thermal state
            antennaTemperature: 293.15,    // K
            transmitterTemperature: 293.15, // K
        };
    }

    getInitialMetrics() {
        const baseMetrics = super.getInitialMetrics();
        return {
            ...baseMetrics,

            // Communication metrics
            successfulConnections: 0,
            failedConnections: 0,
            connectionAttempts: 0,
            averageConnectionDuration: 0,
            totalBytesTransmitted: 0,
            totalBytesReceived: 0,

            // Performance metrics
            maxDataRate: 0,
            averageDataRate: 0,
            communicationEfficiency: 0,    // successful transmissions / attempts
        };
    }

    /**
     * Physics update for communication subsystem
     */
    updateSubsystem(deltaTime, satellite, environment) {
        // Update power consumption based on current activity
        this.updatePowerConsumption();

        // Update thermal state
        this.updateThermalState(deltaTime, environment);

        // Update communication links (less frequently)
        const now = Date.now();
        if (now - this.lastLinkCalculation >= this.linkCalculationInterval) {
            this.updateCommunicationLinks(satellite, environment);
            this.lastLinkCalculation = now;
        }

        // Process transmission queue
        this.processTransmissions(deltaTime);

        // Update metrics
        this.updateMetrics(deltaTime);
    }

    /**
     * Update power consumption based on current operations
     */
    updatePowerConsumption() {
        let power = this.config.basePowerConsumption;

        if (this.state.isTransmitting) {
            // Add transmitter power (accounting for efficiency)
            power += this.config.transmitPower / this.config.transmitPowerEfficiency;
        }

        // Add power for active receivers
        power += this.activeConnections.size * 2.0; // 2W per active receiver

        this.state.powerConsumption = power;
    }

    /**
     * Update thermal state based on power dissipation and environment
     */
    updateThermalState(deltaTime, environment) {
        const heatGenerated = this.getThermalOutput(); // watts
        const ambientTemp = environment?.temperature || 2.7; // Cosmic background

        // Simple thermal model - more sophisticated in a real implementation
        const thermalCapacity = 100; // J/K (antenna + electronics)
        const thermalConductivity = 0.1; // W/K to space

        // Temperature change due to heating and radiation
        const deltaTemp = (heatGenerated - thermalConductivity * (this.state.antennaTemperature - ambientTemp))
            * deltaTime / thermalCapacity;

        this.state.antennaTemperature += deltaTemp;
        this.state.transmitterTemperature = this.state.antennaTemperature + (this.state.isTransmitting ? 10 : 0);

        // Check for thermal limits
        if (this.state.transmitterTemperature > 343.15) { // 70°C
            this.onThermalOverload();
        }
    }

    /**
     * Calculate and update communication links with other satellites/ground stations
     */
    updateCommunicationLinks(satellite, environment) {
        // This would integrate with the physics engine to find other satellites
        // and calculate realistic RF link budgets

        // Validate satellite parameter
        if (!satellite) {
            console.warn(`[CommunicationSubsystem] No satellite data provided for ${this.satelliteId}, skipping communication update`);
            return;
        }

        if (!satellite.position) {
            console.warn(`[CommunicationSubsystem] Satellite ${this.satelliteId} missing position data, skipping communication update. Satellite keys:`, Object.keys(satellite));
            return;
        }

        // Validate position format
        const position = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
        if (!Array.isArray(position) || position.length < 3) {
            console.warn(`[CommunicationSubsystem] Satellite ${this.satelliteId} has invalid position format:`, position, 'Type:', typeof satellite.position);
            return;
        }

        // Get list of potential communication targets from physics engine
        const targets = this.findCommunicationTargets(satellite);

        // Clear old connections
        this.activeConnections.clear();

        targets.forEach(target => {
            const linkInfo = this.calculateLinkBudget(satellite, target, environment);

            if (linkInfo.possible) {
                this.activeConnections.set(target.id, {
                    targetId: target.id,
                    targetType: target.type, // 'satellite', 'ground_station'
                    linkQuality: linkInfo.quality,
                    dataRate: linkInfo.dataRate,
                    distance: linkInfo.distance,
                    elevationAngle: linkInfo.elevationAngle,
                    establishedTime: Date.now()
                });

                this.metrics.successfulConnections++;
            } else {
                this.metrics.failedConnections++;
            }

            this.metrics.connectionAttempts++;
        });

        this.state.connectionCount = this.activeConnections.size;
        this.updateLinkQualityMetrics();
    }

    /**
     * Find potential communication targets from physics engine
     */
    findCommunicationTargets() {
        const targets = [];

        // Get reference to physics engine from the subsystem manager
        const physicsEngine = this.getPhysicsEngine();
        if (!physicsEngine) {
            return targets;
        }

        // Find other satellites
        if (physicsEngine.satellites) {
            physicsEngine.satellites.forEach((targetSat, targetId) => {
                // Don't communicate with self
                if (targetId === this.satelliteId) return;

                // Check if target has communication capability
                const targetComms = physicsEngine.subsystemManager?.getSubsystem(targetId, 'communication');
                if (!targetComms) return;

                // Check if target has valid position data
                if (!targetSat.position) {
                    console.warn(`[CommunicationSubsystem] Target satellite ${targetId} has no position data`);
                    return;
                }

                const targetPosition = targetSat.position.toArray ? targetSat.position.toArray() : targetSat.position;
                if (!targetPosition || !Array.isArray(targetPosition) || targetPosition.length < 3) {
                    console.warn(`[CommunicationSubsystem] Target satellite ${targetId} has invalid position data:`, targetPosition);
                    return;
                }

                targets.push({
                    id: targetId,
                    type: 'satellite',
                    position: targetPosition,
                    antennaGain: targetComms.config?.antennaGain || 0,
                    centralBodyNaifId: targetSat.centralBodyNaifId
                });
            });
        }

        // TODO: Add ground stations from configuration
        // This could be integrated later with ground station data

        return targets;
    }

    /**
     * Calculate RF link budget between satellite and target
     */
    calculateLinkBudget(satellite, target) {
        // Validate satellite position
        if (!satellite.position) {
            return { possible: false, reason: 'Satellite position unavailable' };
        }

        // Validate target position
        if (!target.position) {
            return { possible: false, reason: 'Target position unavailable' };
        }

        const satPos = satellite.position.toArray ? satellite.position.toArray() : satellite.position;
        const targetPos = target.position;

        // Additional validation for position arrays
        if (!Array.isArray(satPos) || satPos.length < 3 || !Array.isArray(targetPos) || targetPos.length < 3) {
            return { possible: false, reason: 'Invalid position data format' };
        }

        const distance = this.calculateDistance(satPos, targetPos);

        // Check basic constraints
        if (distance > this.config.maxRange) {
            return { possible: false, reason: 'Out of range' };
        }

        // Calculate free space path loss (Friis equation)
        const frequency = this.config.transmitFrequency * 1e9; // Convert to Hz
        const wavelength = PhysicsConstants.PHYSICS.C / frequency; // c / f (m)
        const pathLoss = 20 * Math.log10(4 * Math.PI * distance * 1000 / wavelength); // dB

        // Link budget calculation
        const txPower = 10 * Math.log10(this.config.transmitPower * 1000); // dBm
        const txGain = this.config.antennaGain; // dBi
        const rxGain = target.antennaGain || 0; // dBi
        const systemLoss = 3; // dB (cables, pointing, etc.)

        const receivedPower = txPower + txGain + rxGain - pathLoss - systemLoss;
        const margin = receivedPower - this.config.receiverSensitivity;

        // Calculate elevation angle if target is ground station
        let elevationAngle = 90; // Default for satellites
        if (target.type === 'ground_station') {
            elevationAngle = this.calculateElevationAngle(satPos, targetPos);
            if (elevationAngle < this.config.minElevationAngle) {
                return { possible: false, reason: 'Below minimum elevation' };
            }
        }

        if (margin < 0) {
            return { possible: false, reason: 'Insufficient link margin' };
        }

        // Calculate achievable data rate based on link quality
        const linkQuality = Math.min(100, Math.max(0, margin * 10)); // 0-100%
        const dataRate = this.config.dataRate * (linkQuality / 100);

        return {
            possible: true,
            quality: linkQuality,
            dataRate: dataRate,
            distance: distance,
            elevationAngle: elevationAngle,
            margin: margin,
            receivedPower: receivedPower
        };
    }

    /**
     * Calculate distance between two positions
     */
    calculateDistance(pos1, pos2) {
        const dx = pos1[0] - pos2[0];
        const dy = pos1[1] - pos2[1];
        const dz = pos1[2] - pos2[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate elevation angle from ground station to satellite
     */
    calculateElevationAngle(satellitePos, groundPos) {
        const dx = satellitePos[0] - groundPos[0];
        const dy = satellitePos[1] - groundPos[1];
        const dz = satellitePos[2] - groundPos[2];

        const groundDistance = Math.sqrt(dx * dx + dy * dy);

        return Math.atan2(dz, groundDistance) * 180 / Math.PI;
    }

    /**
     * Process queued transmissions
     */
    processTransmissions(deltaTime) {
        if (this.transmissionQueue.length === 0) {
            this.state.isTransmitting = false;
            this.state.currentDataRate = 0;
            return;
        }

        if (this.activeConnections.size === 0) {
            // No active links, can't transmit
            this.state.isTransmitting = false;
            return;
        }

        // Calculate total available data rate
        let totalDataRate = 0;
        this.activeConnections.forEach(conn => {
            totalDataRate += conn.dataRate;
        });

        this.state.isTransmitting = true;
        this.state.currentDataRate = totalDataRate;

        // Process transmissions based on available data rate
        const bytesPerSecond = totalDataRate * 1000 / 8; // Convert kbps to bytes/s
        const bytesToTransmit = bytesPerSecond * deltaTime;

        // Simple transmission processing
        while (this.transmissionQueue.length > 0 && bytesToTransmit > 0) {
            const transmission = this.transmissionQueue[0];
            const transmitted = Math.min(transmission.remaining, bytesToTransmit);

            transmission.remaining -= transmitted;
            this.state.totalDataTransmitted += transmitted;

            if (transmission.remaining <= 0) {
                this.transmissionQueue.shift();
                this.metrics.totalBytesTransmitted += transmission.totalSize;
            }
        }
    }

    /**
     * Update link quality metrics
     */
    updateLinkQualityMetrics() {
        if (this.activeConnections.size === 0) {
            this.state.bestLinkQuality = 0;
            this.state.averageLinkQuality = 0;
            return;
        }

        let totalQuality = 0;
        let bestQuality = 0;

        this.activeConnections.forEach(conn => {
            totalQuality += conn.linkQuality;
            bestQuality = Math.max(bestQuality, conn.linkQuality);
        });

        this.state.bestLinkQuality = bestQuality;
        this.state.averageLinkQuality = totalQuality / this.activeConnections.size;
    }

    /**
     * Update subsystem metrics
     */
    updateMetrics(deltaTime) {
        if (this.activeConnections.size > 0) {
            this.state.totalLinkTime += deltaTime;
        }

        // Calculate communication efficiency
        if (this.metrics.connectionAttempts > 0) {
            this.metrics.communicationEfficiency =
                this.metrics.successfulConnections / this.metrics.connectionAttempts;
        }
    }

    /**
     * Queue data for transmission
     */
    queueTransmission(data, priority = 'normal') {
        this.transmissionQueue.push({
            data: data,
            totalSize: data.length,
            remaining: data.length,
            priority: priority,
            queuedTime: Date.now()
        });

        // Sort by priority
        this.transmissionQueue.sort((a, b) => {
            const priorityOrder = { 'emergency': 0, 'high': 1, 'normal': 2, 'low': 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    /**
     * Handle thermal overload
     */
    onThermalOverload() {
        this.state.status = 'degraded';
        this.state.powerConsumption *= 0.5; // Reduce power to cool down
        console.warn(`[CommunicationSubsystem] Thermal overload in satellite ${this.satelliteId}`);
    }

    /**
     * Get active connections for external systems
     */
    getActiveConnections() {
        return Array.from(this.activeConnections.values());
    }

    /**
     * Check if can communicate with specific target
     */
    canCommunicateWith(targetId) {
        return this.activeConnections.has(targetId);
    }
}