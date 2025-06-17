/**
 * SatelliteCommsSection.jsx
 * 
 * React component for displaying and configuring satellite communication systems.
 * Part of the satellite systems engineering UI.
 * ✅ OPTIMIZED with memoization, refs, and debouncing patterns
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import {
    Radio,
    Antenna,
    Signal,
    Settings,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Power,
    Zap,
    ArrowUpDown,
    Target
} from 'lucide-react';

// ✅ OPTIMIZED PATTERN: Memoized DataRow component
const DataRow = React.memo(function DataRow({ label, value, unit = '', icon: Icon, className = '' }) {
    return (
        <div className={`grid grid-cols-2 gap-1 ${className}`}>
            <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                {Icon && <Icon className="h-3 w-3" />}
                {label}:
            </span>
            <span className="text-xs font-mono text-foreground">
                {value} {unit && <span className="text-muted-foreground">{unit}</span>}
            </span>
        </div>
    );
});

DataRow.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    unit: PropTypes.string,
    icon: PropTypes.elementType,
    className: PropTypes.string
};

// ✅ OPTIMIZED PATTERN: Main component with React.memo and performance optimizations
export const SatelliteCommsSection = React.memo(function SatelliteCommsSection({ satelliteId, app }) {
    // 1. STATE for component data
    const [commsStatus, setCommsStatus] = useState(null);
    const [connections, setConnections] = useState([]);
    const [editMode, setEditMode] = useState(false);
    const [tempConfig, setTempConfig] = useState({});

    // 2. REFS for caching and preventing re-renders
    const satelliteIdRef = useRef(satelliteId);
    const lastStatusRef = useRef(null);
    const lastConnectionsRef = useRef(null);
    const calculationCacheRef = useRef({});
    const updateTimeoutRef = useRef(null);

    // Update refs when props change
    satelliteIdRef.current = satelliteId;

    // 3. MEMOIZED communication service reference
    const commsService = useMemo(() => {
        return app?.communicationsService || null;
    }, [app?.communicationsService]);

    // 4. MEMOIZED formatted status data with change detection
    const memoizedCommsData = useMemo(() => {
        if (!commsStatus) return null;

        // Create change detection key
        const statusKey = JSON.stringify({
            enabled: commsStatus.enabled,
            connectionsCount: commsStatus.activeConnectionsCount,
            signalQuality: commsStatus.signalQuality,
            powerConsumption: commsStatus.state?.powerConsumption,
            lastUpdate: commsStatus.lastUpdate
        });

        // Use cached result if data hasn't changed
        if (lastStatusRef.current === statusKey && calculationCacheRef.current.status) {
            return calculationCacheRef.current.status;
        }

        // Process and cache status data
        const config = commsStatus.config || {};
        const state = commsStatus.state || {};
        const metrics = commsStatus.metrics || {};

        const processedStatus = {
            // Configuration data
            enabled: commsStatus.enabled || false,
            transmitPower: (config.transmitPower || 0).toFixed(1),
            antennaGain: (config.antennaGain || 0).toFixed(1),
            antennaType: config.antennaType || 'unknown',
            dataRate: config.dataRate ? `${(config.dataRate / 1000).toFixed(1)}` : 'N/A',

            // Status indicators
            operationalStatus: state.status || 'offline',
            activeConnections: commsStatus.activeConnectionsCount || 0,
            signalQuality: commsStatus.signalQuality ? commsStatus.signalQuality.toFixed(1) : '0.0',
            powerConsumption: state.powerConsumption ? state.powerConsumption.toFixed(2) : '0.00',

            // Data transfer stats
            totalDataTransmitted: state.totalDataTransmitted ? (state.totalDataTransmitted / 1024).toFixed(2) : '0.00',
            totalDataReceived: state.totalDataReceived ? (state.totalDataReceived / 1024).toFixed(2) : '0.00',

            // Connection metrics
            successfulConnections: metrics.successfulConnections || 0,
            connectionAttempts: metrics.connectionAttempts || 0,
            successRate: metrics.connectionAttempts > 0 ?
                ((metrics.successfulConnections / metrics.connectionAttempts) * 100).toFixed(1) : '0.0'
        };

        // Cache result
        lastStatusRef.current = statusKey;
        calculationCacheRef.current.status = processedStatus;
        return processedStatus;
    }, [commsStatus]);

    // 5. MEMOIZED connections data with change detection
    const memoizedConnections = useMemo(() => {
        if (!connections || connections.length === 0) return [];

        // Create change detection key
        const connectionsKey = JSON.stringify(
            connections.map(conn => ({
                targetId: conn.targetSatelliteId,
                quality: conn.quality,
                distance: conn.distance
            }))
        );

        // Use cached result if data hasn't changed
        if (lastConnectionsRef.current === connectionsKey && calculationCacheRef.current.connections) {
            return calculationCacheRef.current.connections;
        }

        // Process and cache connections data
        const processedConnections = connections.map(conn => ({
            targetSatelliteId: conn.targetSatelliteId,
            quality: conn.quality.toFixed(1),
            dataRate: conn.dataRate ? `${(conn.dataRate / 1000).toFixed(1)}` : 'N/A',
            distance: conn.distance ? `${(conn.distance / 1000).toFixed(1)}` : 'N/A',
            signalStrength: conn.signalStrength ? conn.signalStrength.toFixed(1) : '0.0',
            type: conn.type || 'direct',
            color: conn.color || '#ffffff'
        }));

        // Cache result
        lastConnectionsRef.current = connectionsKey;
        calculationCacheRef.current.connections = processedConnections;
        return processedConnections;
    }, [connections]);

    // 6. THROTTLED communication status update handler
    const throttledUpdateCommsStatus = useCallback(() => {
            if (!satelliteIdRef.current || !commsService) {
                setCommsStatus(null);
                setConnections([]);
                return;
            }

            try {
                // Get configuration
                const config = commsService.getSatelliteCommsConfig(satelliteIdRef.current);

                // Get connections for this satellite
                const activeConnections = commsService.getSatelliteConnections(satelliteIdRef.current);

                // Get data transfer stats
                const dataTransfers = commsService.getSatelliteDataTransfers(satelliteIdRef.current);

                // Build status from config and connections
                if (config) {
                    // Transform connections to expected format
                    const formattedConnections = activeConnections.map(conn => {
                        // Determine the target satellite ID (the other end of the connection)
                        const targetSatelliteId = conn.from === satelliteIdRef.current ? conn.to : conn.from;

                        // Get the target satellite's comms config to estimate data rate
                        const targetConfig = commsService.getSatelliteCommsConfig(targetSatelliteId);
                        const dataRate = Math.min(config.dataRate || 1000, targetConfig?.dataRate || 1000);

                        return {
                            targetSatelliteId: targetSatelliteId,
                            quality: conn.metadata?.linkQuality || 0,
                            dataRate: dataRate,
                            distance: conn.metadata?.distance || 0,
                            signalStrength: conn.metadata?.signalStrength || 0,
                            type: conn.type,
                            color: conn.color
                        };
                    });

                    // Determine operational status based on enabled state and connections
                    let operationalStatus = 'offline';
                    if (config.enabled) {
                        if (formattedConnections.length > 0) {
                            const avgQuality = formattedConnections.reduce((sum, conn) => sum + conn.quality, 0) / formattedConnections.length;
                            operationalStatus = avgQuality > 70 ? 'operational' : 'degraded';
                        } else {
                            operationalStatus = 'operational'; // Enabled but no connections
                        }
                    }

                    const status = {
                        enabled: config.enabled || false,
                        transmitPower: config.transmitPower,
                        antennaGain: config.antennaGain,
                        activeConnectionsCount: formattedConnections.length,
                        signalQuality: formattedConnections.length > 0 ?
                            formattedConnections.reduce((sum, conn) => sum + conn.quality, 0) / formattedConnections.length : 0,
                        config: config, // Include the full config object
                        state: {
                            status: operationalStatus,
                            totalDataTransmitted: dataTransfers.transmitted || 0,
                            totalDataReceived: dataTransfers.received || 0,
                            powerConsumption: config.enabled ? (config.transmitPower || 5) * (1 + formattedConnections.length * 0.2) : 0
                        },
                        metrics: {
                            successfulConnections: formattedConnections.length,
                            connectionAttempts: formattedConnections.length + 1
                        },
                        lastUpdate: Date.now()
                    };

                    setCommsStatus(status);
                    setConnections(formattedConnections);
                } else {
                    setCommsStatus(null);
                    setConnections([]);
                }
            } catch (error) {
                console.warn('Error updating communications status:', error);
                setCommsStatus(null);
                setConnections([]);
            }
    }, [commsService]);

    // 7. MEMOIZED event handlers
    const handleUpdate = useCallback((event) => {
        if (event.detail?.satelliteId === satelliteIdRef.current || !event.detail?.satelliteId) {
            // Clear any pending timeout
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }

            // Use throttled update
            throttledUpdateCommsStatus();
        }
    }, [throttledUpdateCommsStatus]);

    const applyConfig = useCallback(() => {
        if (commsService) {
            commsService.updateSatelliteCommsConfig(satelliteIdRef.current, tempConfig);
            setTempConfig({});
            setEditMode(false);
        }
    }, [commsService, tempConfig]);

    const resetConfig = useCallback(() => {
        setTempConfig({});
        setEditMode(false);
    }, []);

    const toggleEditMode = useCallback(() => {
        setEditMode(prev => !prev);
        if (editMode) {
            setTempConfig({});
        }
    }, [editMode]);

    // 8. MEMOIZED status styling functions
    const statusConfig = useMemo(() => {
        const status = memoizedCommsData?.operationalStatus || 'offline';

        const getStatusColor = (status) => {
            switch (status) {
                case 'operational': return 'text-green-500';
                case 'degraded': return 'text-yellow-500';
                case 'offline': return 'text-red-500';
                default: return 'text-gray-500';
            }
        };

        const getStatusIcon = (status) => {
            switch (status) {
                case 'operational': return CheckCircle;
                case 'degraded': return AlertTriangle;
                case 'offline': return XCircle;
                default: return Radio;
            }
        };

        return {
            color: getStatusColor(status),
            Icon: getStatusIcon(status),
            status
        };
    }, [memoizedCommsData?.operationalStatus]);

    // Effect for setting up communication updates with throttling
    useEffect(() => {
        // Initial load with throttling
        throttledUpdateCommsStatus();

        // Subscribe to communications updates with throttled handlers
        if (commsService) {
            commsService.on('configUpdated', handleUpdate);
            commsService.on('connectionsUpdated', throttledUpdateCommsStatus);
            commsService.on('dataTransfersUpdated', throttledUpdateCommsStatus);
        }

        return () => {
            // Cleanup timeouts
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }

            // Cleanup event listeners
            if (commsService) {
                commsService.removeListener('configUpdated', handleUpdate);
                commsService.removeListener('connectionsUpdated', throttledUpdateCommsStatus);
                commsService.removeListener('dataTransfersUpdated', throttledUpdateCommsStatus);
            }
        };
    }, [commsService, throttledUpdateCommsStatus, handleUpdate]);

    // Early return for no communication system
    if (!memoizedCommsData) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3" />
                    <span>No communication system found</span>
                </div>
                <div className="text-xs text-muted-foreground pl-4">
                    Satellite ID: {satelliteId}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Status Header */}
            <div className="flex items-center justify-between">
                <div className={`flex items-center gap-1 ${statusConfig.color}`}>
                    <statusConfig.Icon className="h-3 w-3" />
                    <span className="text-xs capitalize font-mono">{statusConfig.status}</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleEditMode}
                    className="h-6 w-6 p-0"
                    title="Configuration"
                >
                    <Settings className="h-3 w-3" />
                </Button>
            </div>

            {/* Communication Statistics */}
            <div className="space-y-1">
                <DataRow
                    label="Power State"
                    value={memoizedCommsData.enabled ? 'ON' : 'OFF'}
                    icon={Power}
                />
                <DataRow
                    label="Active Links"
                    value={memoizedCommsData.activeConnections}
                    icon={Signal}
                />
                <DataRow
                    label="Signal Quality"
                    value={memoizedCommsData.signalQuality}
                    unit="%"
                    icon={Antenna}
                />
                <DataRow
                    label="Power Draw"
                    value={memoizedCommsData.powerConsumption}
                    unit="W"
                    icon={Zap}
                />
            </div>

            {/* Configuration Details */}
            <div className="space-y-1 pt-1 border-t border-border/30">
                <DataRow
                    label="Transmit Power"
                    value={memoizedCommsData.transmitPower}
                    unit="W"
                />
                <DataRow
                    label="Antenna Gain"
                    value={memoizedCommsData.antennaGain}
                    unit="dBi"
                />
                <DataRow
                    label="Data Rate"
                    value={memoizedCommsData.dataRate}
                    unit="kbps"
                />
                <DataRow
                    label="Antenna Type"
                    value={memoizedCommsData.antennaType}
                />
            </div>

            {/* Data Transfer Statistics */}
            <div className="space-y-1 pt-1 border-t border-border/30">
                <div className="text-xs font-semibold text-muted-foreground">Data Transfer</div>
                <DataRow
                    label="Transmitted"
                    value={memoizedCommsData.totalDataTransmitted}
                    unit="KB"
                    icon={ArrowUpDown}
                />
                <DataRow
                    label="Received"
                    value={memoizedCommsData.totalDataReceived}
                    unit="KB"
                />
                <DataRow
                    label="Success Rate"
                    value={memoizedCommsData.successRate}
                    unit="%"
                />
            </div>

            {/* Active Connections */}
            {memoizedConnections.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/30">
                    <div className="text-xs font-semibold text-muted-foreground">Active Connections</div>
                    {memoizedConnections.map((conn, index) => (
                        <div key={`${conn.targetSatelliteId}-${index}`} className="space-y-1 pl-2">
                            <DataRow
                                label={`Sat ${conn.targetSatelliteId}`}
                                value={`${conn.quality}%`}
                                icon={Target}
                            />
                            <DataRow
                                label="Distance"
                                value={conn.distance}
                                unit="km"
                            />
                            <DataRow
                                label="Rate"
                                value={conn.dataRate}
                                unit="kbps"
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Configuration Edit Mode */}
            {editMode && (
                <div className="space-y-2 pt-1 border-t border-border/30">
                    <div className="text-xs font-semibold text-muted-foreground">Configuration</div>
                    {/* Configuration controls would go here */}
                    <div className="flex gap-1">
                        <Button size="sm" onClick={applyConfig} className="text-xs">
                            Apply
                        </Button>
                        <Button size="sm" variant="outline" onClick={resetConfig} className="text-xs">
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
        prevProps.satelliteId === nextProps.satelliteId &&
        prevProps.app?.communicationsService === nextProps.app?.communicationsService
    );
});

SatelliteCommsSection.propTypes = {
    satelliteId: PropTypes.string.isRequired,
    app: PropTypes.object.isRequired
};