/**
 * SatelliteCommsTimeline.jsx
 * 
 * React component for visualizing satellite communication events over time.
 * Shows communication windows, data transfer events, and link quality history.
 * ✅ OPTIMIZED with memoization, refs, and debouncing patterns
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import {
    Clock,
    Activity,
    Play,
    Pause,
    RotateCcw,
    Wifi,
    Timer,
    BarChart3
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

// ✅ OPTIMIZED PATTERN: Memoized TimelineEntry component
const TimelineEntry = React.memo(function TimelineEntry({ entry, formatTime, getStatusColor }) {
    // Memoized status color calculation
    const statusColor = useMemo(() => getStatusColor(entry.status), [entry.status, getStatusColor]);

    return (
        <div className="flex items-center justify-between py-1 px-2 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                <span className="text-xs text-muted-foreground">{formatTime(entry.timestamp)}</span>
                <span className="text-xs capitalize">{entry.status}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{entry.connectionCount} links</span>
                <span>{entry.dataRate.toFixed(0)} kbps</span>
            </div>
        </div>
    );
});

TimelineEntry.propTypes = {
    entry: PropTypes.object.isRequired,
    formatTime: PropTypes.func.isRequired,
    getStatusColor: PropTypes.func.isRequired
};

// ✅ OPTIMIZED PATTERN: Main component with React.memo and performance optimizations
export const SatelliteCommsTimeline = React.memo(function SatelliteCommsTimeline({ satelliteId, app }) {
    // 1. STATE for component data
    const [timelineData, setTimelineData] = useState([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [isRecording, setIsRecording] = useState(true);
    const [timeWindow, setTimeWindow] = useState(3600); // 1 hour in seconds
    const [connectionHistory, setConnectionHistory] = useState([]);
    const [dataTransferEvents, setDataTransferEvents] = useState([]);

    // 2. REFS for caching and preventing re-renders
    const satelliteIdRef = useRef(satelliteId);
    const lastUpdateTimeRef = useRef(0);
    const lastDataTotalRef = useRef(0);
    const calculationCacheRef = useRef({});
    const trackingIntervalRef = useRef(null);

    // Update refs when props change
    satelliteIdRef.current = satelliteId;

    // 3. MEMOIZED utility functions
    const formatTime = useCallback((timestamp) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString();
    }, []);

    const getStatusColor = useCallback((status) => {
        switch (status) {
            case 'operational': return 'bg-green-500';
            case 'degraded': return 'bg-yellow-500';
            case 'offline': return 'bg-red-500';
            case 'connecting': return 'bg-blue-500';
            default: return 'bg-gray-500';
        }
    }, []);

    // 4. MEMOIZED data processing with change detection
    const processedTimelineData = useMemo(() => {
        if (timelineData.length === 0) return [];

        // Create change detection key
        const dataKey = JSON.stringify({
            length: timelineData.length,
            lastTimestamp: timelineData[timelineData.length - 1]?.timestamp,
            timeWindow
        });

        // Use cached result if data hasn't changed
        if (calculationCacheRef.current.timelineKey === dataKey && calculationCacheRef.current.processedTimeline) {
            return calculationCacheRef.current.processedTimeline;
        }

        // Process and cache timeline data
        const processed = timelineData
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50); // Limit to last 50 entries for performance

        // Cache result
        calculationCacheRef.current.timelineKey = dataKey;
        calculationCacheRef.current.processedTimeline = processed;

        return processed;
    }, [timelineData, timeWindow]);

    // 5. OPTIMIZED statistics with better change detection and caching
    const timelineStatistics = useMemo(() => {
        if (timelineData.length === 0) {
            return {
                totalConnections: 0,
                averageDataRate: 0,
                totalDataTransferred: 0,
                uptimePercentage: 0,
                peakDataRate: 0
            };
        }

        // Create change detection key for expensive calculations
        const statsKey = `${timelineData.length}-${connectionHistory.length}-${dataTransferEvents.length}`;

        // Use cached result if data hasn't significantly changed
        if (calculationCacheRef.current.statsKey === statsKey && calculationCacheRef.current.stats) {
            return calculationCacheRef.current.stats;
        }

        // Only calculate if we have reasonable amount of data to avoid expensive operations
        const stats = {
            totalConnections: connectionHistory.length,
            averageDataRate: timelineData.length > 0 ?
                timelineData.reduce((sum, entry) => sum + (entry.dataRate || 0), 0) / timelineData.length : 0,
            totalDataTransferred: dataTransferEvents.length > 0 ?
                dataTransferEvents.reduce((sum, event) => sum + (event.dataAmount || 0), 0) : 0,
            uptimePercentage: timelineData.length > 0 ?
                (timelineData.filter(entry => entry.status === 'operational').length / timelineData.length) * 100 : 0,
            peakDataRate: timelineData.length > 0 ?
                Math.max(...timelineData.map(entry => entry.dataRate || 0), 0) : 0
        };

        // Cache the result
        calculationCacheRef.current.statsKey = statsKey;
        calculationCacheRef.current.stats = stats;

        return stats;
    }, [timelineData, connectionHistory, dataTransferEvents]);

    // 6. OPTIMIZED tracking function with batched state updates
    const throttledTracking = useCallback(() => {
        const now = performance.now();

        // More aggressive throttling for timeline updates (max 1 update per 10 seconds)
        if (now - lastUpdateTimeRef.current < 10000) {
            return;
        }

        lastUpdateTimeRef.current = now;

        // Get current simulation time from various sources
        let simTime = Date.now() / 1000; // fallback to real time

        if (app?.timeUtils?.getSimulatedTime) {
            const simDateTime = app.timeUtils.getSimulatedTime();
            if (simDateTime && simDateTime instanceof Date) {
                simTime = simDateTime.getTime() / 1000;
            }
        } else if (app?.physicsIntegration?.simulationTime) {
            const physicsTime = app.physicsIntegration.simulationTime;
            if (physicsTime && physicsTime instanceof Date) {
                simTime = physicsTime.getTime() / 1000;
            }
        } else if (app?.simulationTime) {
            if (app.simulationTime instanceof Date) {
                simTime = app.simulationTime.getTime() / 1000;
            } else {
                simTime = app.simulationTime;
            }
        }

        // Batch all state updates together to avoid multiple re-renders
        const batchedUpdates = {
            currentTime: simTime,
            timelineData: null,
            connectionHistory: null,
            dataTransferEvents: null
        };

        if (!isRecording) {
            // Only update time when not recording
            if (Math.abs(simTime - currentTime) > 1) { // Only update if time changed by more than 1 second
                setCurrentTime(simTime);
            }
            return;
        }

        let commsStatus = null;
        let activeConnections = [];

        try {
            // Get communication data from various sources
            let physicsEngine = app?.physicsIntegration?.physicsEngine || app?.physicsEngine;
            if (physicsEngine?.subsystemManager) {
                const subsystemManager = physicsEngine.subsystemManager;
                const commsSubsystem = subsystemManager.getSubsystem(satelliteIdRef.current, 'communication');

                if (commsSubsystem) {
                    commsStatus = commsSubsystem.getStatus();
                    activeConnections = commsSubsystem.getActiveConnections() || [];
                }
            }

            // Fallback to SatelliteCommsManager
            if (!commsStatus && app?.satelliteCommsManager) {
                const commsSystem = app.satelliteCommsManager.getCommsSystem(satelliteIdRef.current);
                if (commsSystem) {
                    commsStatus = commsSystem.getStatus();
                    activeConnections = commsSystem.getActiveConnections() || [];
                }
            }

            if (commsStatus) {
                // Create timeline entry
                const timelineEntry = {
                    timestamp: simTime,
                    status: commsStatus.state?.status || 'offline',
                    connectionCount: activeConnections.length,
                    dataRate: commsStatus.state?.currentDataRate || 0,
                    powerConsumption: commsStatus.state?.powerConsumption || 0,
                    signalStrength: commsStatus.state?.signalStrength || 0
                };

                // Prepare timeline data update
                batchedUpdates.timelineData = (prev) => {
                    const cutoffTime = simTime - timeWindow;
                    // Only add if data actually changed significantly
                    const lastEntry = prev[prev.length - 1];
                    const hasSignificantChange = !lastEntry ||
                        lastEntry.status !== timelineEntry.status ||
                        Math.abs(lastEntry.connectionCount - timelineEntry.connectionCount) > 0 ||
                        Math.abs(lastEntry.dataRate - timelineEntry.dataRate) > 1; // 1 kbps threshold

                    if (hasSignificantChange) {
                        const newData = [...prev, timelineEntry];
                        return newData.filter(entry => entry.timestamp >= cutoffTime);
                    }

                    // Just filter old data without adding new entry
                    return prev.filter(entry => entry.timestamp >= cutoffTime);
                };

                // Prepare connection history updates
                batchedUpdates.connectionHistory = (prev) => {
                    let updated = [...prev];
                    let hasChanges = false;

                    // Track new connections
                    activeConnections.forEach(conn => {
                        const targetId = conn.targetSatelliteId || conn.targetId || conn.id;
                        if (!targetId) return;

                        const existingConnection = updated.find(
                            h => h.targetId === targetId && h.endTime === null
                        );

                        if (!existingConnection) {
                            const connectionEvent = {
                                id: `${satelliteIdRef.current}-${targetId}-${simTime}`,
                                targetId: targetId,
                                startTime: simTime,
                                endTime: null,
                                quality: conn.quality || conn.linkQuality || 50,
                                dataRate: conn.dataRate || 0,
                                type: conn.type || conn.targetType || 'satellite'
                            };
                            updated.push(connectionEvent);
                            hasChanges = true;
                        }
                    });

                    // Mark ended connections
                    updated = updated.map(conn => {
                        if (conn.endTime === null) {
                            const stillActive = activeConnections.find(
                                ac => {
                                    const targetId = ac.targetSatelliteId || ac.targetId || ac.id;
                                    return targetId === conn.targetId;
                                }
                            );
                            if (!stillActive) {
                                hasChanges = true;
                                return { ...conn, endTime: simTime };
                            }
                        }
                        return conn;
                    });

                    // Filter old connections
                    const cutoffTime = simTime - timeWindow;
                    const filtered = updated.filter(conn =>
                        (conn.endTime === null && conn.startTime >= cutoffTime) ||
                        (conn.endTime !== null && conn.endTime >= cutoffTime)
                    );

                    return hasChanges || filtered.length !== prev.length ? filtered : prev;
                };

                // Handle data transfer events with better change detection
                if (commsStatus.state?.totalDataTransmitted > 0) {
                    const currentDataTotal = commsStatus.state.totalDataTransmitted;

                    if (currentDataTotal > lastDataTotalRef.current) {
                        const transferEvent = {
                            timestamp: simTime,
                            dataAmount: currentDataTotal - lastDataTotalRef.current,
                            cumulativeData: currentDataTotal,
                            connections: activeConnections.length,
                            type: 'transmission'
                        };

                        batchedUpdates.dataTransferEvents = (prev) => {
                            const newEvents = [...prev, transferEvent];
                            const cutoffTime = simTime - timeWindow;
                            return newEvents.filter(event => event.timestamp >= cutoffTime);
                        };

                        lastDataTotalRef.current = currentDataTotal;
                    }
                }
            }
        } catch (error) {
            console.warn('Error tracking communication timeline:', error);
        }

        // Apply all batched updates at once using React's automatic batching
        setCurrentTime(batchedUpdates.currentTime);

        if (batchedUpdates.timelineData) {
            setTimelineData(batchedUpdates.timelineData);
        }

        if (batchedUpdates.connectionHistory) {
            setConnectionHistory(batchedUpdates.connectionHistory);
        }

        if (batchedUpdates.dataTransferEvents) {
            setDataTransferEvents(batchedUpdates.dataTransferEvents);
        }
    }, [app, isRecording, timeWindow, currentTime]);

    // 7. MEMOIZED event handlers
    const handleRecordingToggle = useCallback(() => {
        setIsRecording(prev => !prev);
    }, []);

    const handleClearHistory = useCallback(() => {
        setTimelineData([]);
        setConnectionHistory([]);
        setDataTransferEvents([]);
        lastDataTotalRef.current = 0;
    }, []);

    const handleTimeWindowChange = useCallback((newWindow) => {
        setTimeWindow(newWindow);
    }, []);

    // 8. MEMOIZED time window options
    const timeWindowOptions = useMemo(() => [
        { value: 900, label: '15min' },
        { value: 1800, label: '30min' },
        { value: 3600, label: '1hr' },
        { value: 7200, label: '2hr' },
        { value: 14400, label: '4hr' }
    ], []);

    // OPTIMIZED effect with longer intervals and better cleanup
    useEffect(() => {
        // Initial load with throttling
        throttledTracking();

        // Set up interval for tracking updates (every 10 seconds when recording - less aggressive)
        if (isRecording) {
            trackingIntervalRef.current = setInterval(throttledTracking, 10000);
        } else {
            if (trackingIntervalRef.current) {
                clearInterval(trackingIntervalRef.current);
                trackingIntervalRef.current = null;
            }
        }

        return () => {
            if (trackingIntervalRef.current) {
                clearInterval(trackingIntervalRef.current);
                trackingIntervalRef.current = null;
            }
        };
    }, [isRecording, throttledTracking]);

    return (
        <div className="space-y-2">
            {/* Header with controls - remove title, make more compact */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRecordingToggle}
                        className="h-6 w-6 p-0"
                        title={isRecording ? 'Pause recording' : 'Resume recording'}
                    >
                        {isRecording ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearHistory}
                        className="h-6 w-6 p-0"
                        title="Clear history"
                    >
                        <RotateCcw className="h-3 w-3" />
                    </Button>
                </div>

                {/* Current status indicator */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {isRecording ? (
                        <>
                            <Activity className="h-3 w-3 text-green-500" />
                            <span>Recording</span>
                        </>
                    ) : (
                        <>
                            <Pause className="h-3 w-3 text-yellow-500" />
                            <span>Paused</span>
                        </>
                    )}
                </div>
            </div>

            {/* Statistics Summary */}
            <div className="space-y-1 p-2 bg-muted/20 rounded">
                <div className="text-xs font-semibold text-muted-foreground mb-1">Session Statistics</div>
                <div className="grid grid-cols-2 gap-1">
                    <DataRow
                        label="Connections"
                        value={timelineStatistics.totalConnections}
                        icon={Wifi}
                    />
                    <DataRow
                        label="Avg Rate"
                        value={timelineStatistics.averageDataRate.toFixed(1)}
                        unit="kbps"
                        icon={Activity}
                    />
                    <DataRow
                        label="Total Data"
                        value={(timelineStatistics.totalDataTransferred / 1024).toFixed(2)}
                        unit="KB"
                        icon={BarChart3}
                    />
                    <DataRow
                        label="Uptime"
                        value={timelineStatistics.uptimePercentage.toFixed(1)}
                        unit="%"
                        icon={Timer}
                    />
                </div>
            </div>

            {/* Time window selector - compact version */}
            <div className="flex items-center justify-between text-xs border-b border-border/30 pb-1">
                <span className="text-muted-foreground">Time Window:</span>
                <div className="flex gap-1">
                    {timeWindowOptions.map(option => (
                        <Button
                            key={option.value}
                            variant={timeWindow === option.value ? "default" : "ghost"}
                            size="sm"
                            onClick={() => handleTimeWindowChange(option.value)}
                            className="h-5 px-2 text-xs"
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Timeline entries */}
            <div className="space-y-0 max-h-48 overflow-y-auto border rounded">
                {processedTimelineData.length > 0 ? (
                    processedTimelineData.map((entry, index) => (
                        <TimelineEntry
                            key={`${entry.timestamp}-${index}`}
                            entry={entry}
                            formatTime={formatTime}
                            getStatusColor={getStatusColor}
                        />
                    ))
                ) : (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                        {isRecording ? 'Waiting for communication data...' : 'Recording paused'}
                    </div>
                )}
            </div>

            {/* Current time display */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatTime(currentTime)}</span>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
        prevProps.satelliteId === nextProps.satelliteId &&
        prevProps.app === nextProps.app
    );
});

SatelliteCommsTimeline.propTypes = {
    satelliteId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    app: PropTypes.object.isRequired
};