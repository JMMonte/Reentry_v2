/**
 * SatelliteCommsTimeline.jsx
 * 
 * React component for visualizing satellite communication events over time.
 * Shows communication windows, data transfer events, and link quality history.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { 
    Clock, 
    Signal, 
    Activity, 
    Play, 
    Pause, 
    RotateCcw,
    TrendingUp,
    TrendingDown,
    Wifi,
    WifiOff,
    Timer,
    BarChart3
} from 'lucide-react';

export function SatelliteCommsTimeline({ satelliteId, app }) {
    const [timelineData, setTimelineData] = useState([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [isRecording, setIsRecording] = useState(true);
    const [timeWindow, setTimeWindow] = useState(3600); // 1 hour in seconds
    const [connectionHistory, setConnectionHistory] = useState([]);
    const [dataTransferEvents, setDataTransferEvents] = useState([]);
    const [, setLastWindowChange] = useState(null);

    // Initialize timeline tracking
    useEffect(() => {
        const startTracking = () => {
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
            
            setCurrentTime(simTime);

            if (!isRecording) return;

            let commsStatus = null;
            let activeConnections = [];

            // Get communication data from various sources
            // Try accessing the physics engine directly or through physicsIntegration
            let physicsEngine = app?.physicsIntegration?.physicsEngine || app?.physicsEngine;
            if (physicsEngine?.subsystemManager) {
                const subsystemManager = physicsEngine.subsystemManager;
                const commsSubsystem = subsystemManager.getSubsystem(satelliteId, 'communication');
                
                if (commsSubsystem) {
                    commsStatus = commsSubsystem.getStatus();
                    activeConnections = commsSubsystem.getActiveConnections() || [];
                }
            }

            // Fallback to SatelliteCommsManager
            if (!commsStatus && app?.satelliteCommsManager) {
                const commsSystem = app.satelliteCommsManager.getCommsSystem(satelliteId);
                if (commsSystem) {
                    commsStatus = commsSystem.getStatus();
                    activeConnections = commsSystem.getActiveConnections() || [];
                }
            }

            if (commsStatus) {
                
                // Record current status in timeline
                const timelineEntry = {
                    timestamp: simTime,
                    status: commsStatus.state?.status || 'offline',
                    connectionCount: activeConnections.length,
                    dataRate: commsStatus.state?.currentDataRate || 0,
                    powerConsumption: commsStatus.state?.powerConsumption || 0,
                    signalStrength: commsStatus.state?.signalStrength || 0
                };

                setTimelineData(prev => {
                    const newData = [...prev, timelineEntry];
                    // Keep only data within time window
                    const cutoffTime = simTime - timeWindow;
                    return newData.filter(entry => entry.timestamp >= cutoffTime);
                });

                // Track connection events - handle different connection object formats
                activeConnections.forEach(conn => {
                    const targetId = conn.targetSatelliteId || conn.targetId || conn.id;
                    if (!targetId) return;
                    
                    const existingConnection = connectionHistory.find(
                        h => h.targetId === targetId && h.endTime === null
                    );

                    if (!existingConnection) {
                        // New connection started
                        const connectionEvent = {
                            id: `${satelliteId}-${targetId}-${simTime}`,
                            targetId: targetId,
                            startTime: simTime,
                            endTime: null,
                            quality: conn.quality || conn.linkQuality || 50,
                            dataRate: conn.dataRate || 0,
                            type: conn.type || conn.targetType || 'satellite'
                        };

                        setConnectionHistory(prev => [...prev, connectionEvent]);
                    }
                });

                // Check for ended connections and cleanup old ones
                setConnectionHistory(prev => {
                    const updated = prev.map(conn => {
                        if (conn.endTime === null) {
                            const stillActive = activeConnections.find(
                                ac => {
                                    const targetId = ac.targetSatelliteId || ac.targetId || ac.id;
                                    return targetId === conn.targetId;
                                }
                            );
                            if (!stillActive) {
                                return { ...conn, endTime: simTime };
                            }
                        }
                        return conn;
                    });
                    
                    // Keep only connections within time window (based on endTime or startTime for active ones)
                    const cutoffTime = simTime - timeWindow;
                    return updated.filter(conn => 
                        (conn.endTime === null && conn.startTime >= cutoffTime) ||
                        (conn.endTime !== null && conn.endTime >= cutoffTime)
                    );
                });

                // Record data transfer events
                if (commsStatus.state?.totalDataTransmitted > 0) {
                    const lastDataEvent = dataTransferEvents[dataTransferEvents.length - 1];
                    const currentDataTotal = commsStatus.state.totalDataTransmitted;
                    
                    if (!lastDataEvent || currentDataTotal > lastDataEvent.cumulativeData) {
                        const transferEvent = {
                            timestamp: simTime,
                            dataAmount: currentDataTotal - (lastDataEvent?.cumulativeData || 0),
                            cumulativeData: currentDataTotal,
                            connections: activeConnections.length,
                            type: 'transmission'
                        };

                        setDataTransferEvents(prev => {
                            const newEvents = [...prev, transferEvent];
                            const cutoffTime = simTime - timeWindow;
                            return newEvents.filter(event => event.timestamp >= cutoffTime);
                        });
                    }
                }
            }
        };

        // Initial load
        startTracking();

        // Update less frequently - every 5 seconds when recording
        const interval = isRecording ? setInterval(startTracking, 5000) : null;
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [satelliteId, app, isRecording, timeWindow]);

    const clearHistory = () => {
        setTimelineData([]);
        setConnectionHistory([]);
        setDataTransferEvents([]);
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString();
    };

    const formatDuration = (seconds) => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${Math.round(seconds / 3600)}h`;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'operational': return 'bg-green-500';
            case 'degraded': return 'bg-yellow-500';
            case 'offline': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    // Calculate timeline statistics
    const stats = {
        totalConnections: connectionHistory.length,
        activeConnections: connectionHistory.filter(c => c.endTime === null).length,
        totalDataTransferred: dataTransferEvents.reduce((sum, event) => sum + event.dataAmount, 0),
        averageConnectionDuration: connectionHistory.filter(c => c.endTime !== null).length > 0 
            ? connectionHistory
                .filter(c => c.endTime !== null)
                .reduce((sum, c) => sum + (c.endTime - c.startTime), 0) / 
              connectionHistory.filter(c => c.endTime !== null).length
            : 0,
        uptimePercentage: timelineData.length > 0 
            ? (timelineData.filter(d => d.status === 'operational').length / timelineData.length) * 100
            : 0
    };

    // Data row component matching debug window style
    const DataRow = ({ label, value, unit = '', icon: Icon, className = '' }) => (
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

    DataRow.propTypes = {
        label: PropTypes.string.isRequired,
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        unit: PropTypes.string,
        icon: PropTypes.elementType,
        className: PropTypes.string
    };

    return (
        <div className="space-y-2">
            {/* Control Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-green-500' : 'bg-gray-500'}`} />
                    <span className="text-xs font-mono">{isRecording ? 'Recording' : 'Paused'}</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsRecording(!isRecording)}
                        className="h-5 w-5 p-0"
                    >
                        {isRecording ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearHistory}
                        className="h-5 w-5 p-0"
                    >
                        <RotateCcw className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Timeline Statistics */}
            <DataRow label="Total Connections" value={stats.totalConnections} icon={Wifi} />
            <DataRow label="Currently Active" value={stats.activeConnections} icon={Activity} />
            <DataRow label="Data Transferred" value={(stats.totalDataTransferred / 1024).toFixed(1)} unit="KB" icon={BarChart3} />
            <DataRow label="Avg Duration" value={formatDuration(stats.averageConnectionDuration)} icon={Timer} />
            <DataRow label="Uptime" value={`${stats.uptimePercentage.toFixed(1)}%`} icon={TrendingUp} />
            <DataRow label="Window" value={`${formatDuration(timeWindow)} (${timelineData.length} pts)`} icon={Clock} />

            {/* Recent Connection Events */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Recent Events:
                    </span>
                    <span className="text-xs font-mono bg-muted px-1 rounded">{connectionHistory.slice(-5).length}</span>
                </div>
                
                {connectionHistory.length > 0 && (
                    <div className="space-y-1 pl-4 max-h-32 overflow-y-auto">
                        {connectionHistory.slice(-3).reverse().map((event, idx) => (
                            <div key={event.id || idx} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1">
                                    {event.endTime === null ? (
                                        <Wifi className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <WifiOff className="h-3 w-3 text-red-500" />
                                    )}
                                    <span className="font-mono">→ {event.targetId}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">
                                        {event.endTime === null 
                                            ? formatDuration(currentTime - event.startTime)
                                            : formatDuration(event.endTime - event.startTime)
                                        }
                                    </span>
                                    <span className="font-mono">{Math.round(event.quality)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Data Transfer Events */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Signal className="h-3 w-3" />
                        Data Transfers:
                    </span>
                    <span className="text-xs font-mono bg-muted px-1 rounded">{dataTransferEvents.length}</span>
                </div>
                
                {dataTransferEvents.length > 0 && (
                    <div className="space-y-1 pl-4 max-h-24 overflow-y-auto">
                        {dataTransferEvents.slice(-3).reverse().map((event, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1">
                                    {event.dataAmount > 0 ? (
                                        <TrendingUp className="h-3 w-3 text-blue-500" />
                                    ) : (
                                        <TrendingDown className="h-3 w-3 text-orange-500" />
                                    )}
                                    <span className="font-mono">{formatTime(event.timestamp)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">
                                        {(event.dataAmount / 1024).toFixed(1)}KB
                                    </span>
                                    <span className="font-mono">({event.connections})</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Status Timeline Visualization */}
            {timelineData.length > 0 && (
                <div className="space-y-2 mt-3 pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Communication Timeline:
                    </span>
                    
                    {/* Timeline container */}
                    <div className="relative bg-muted/10 rounded p-2">
                        {/* Time axis labels */}
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-12" /> {/* Spacer to align with track labels */}
                            <div className="flex-1 flex justify-between text-xs text-muted-foreground">
                                <span>{formatDuration(timeWindow)} ago</span>
                                <span>{formatDuration(timeWindow/2)} ago</span>
                                <span>Now</span>
                            </div>
                        </div>
                        
                        {/* Connection timeline tracks */}
                        <div className="space-y-2">
                            {/* Status track */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground w-12">Status</span>
                                <div className="relative h-4 flex-1">
                                    <div className="absolute inset-0 bg-muted/20 rounded" />
                                    {timelineData.map((data, idx) => {
                                    // Use the actual time window for calculations
                                    const windowStart = currentTime - timeWindow;
                                    const windowDuration = timeWindow;
                                    const position = ((data.timestamp - windowStart) / windowDuration) * 100;
                                    const width = Math.max(1, (1 / timelineData.length) * 100);
                                    
                                    // Only render if within the visible window
                                    if (position < 0 || position > 100) return null;
                                    
                                    return (
                                        <div
                                            key={idx}
                                            className={`absolute h-full ${getStatusColor(data.status)} opacity-80`}
                                            style={{
                                                left: `${Math.max(0, position)}%`,
                                                width: `${width}%`
                                            }}
                                            title={`${formatTime(data.timestamp)}: ${data.status}`}
                                        />
                                    );
                                })}
                                </div>
                            </div>
                            
                            {/* Connection events track */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground w-12">Links</span>
                                <div className="relative h-6 flex-1">
                                    <div className="absolute inset-0 bg-muted/20 rounded" />
                                    {connectionHistory.map((conn, idx) => {
                                    // Use the actual time window for consistent calculations
                                    const windowStart = currentTime - timeWindow;
                                    const windowDuration = timeWindow;
                                    const connStart = ((conn.startTime - windowStart) / windowDuration) * 100;
                                    const connEnd = conn.endTime 
                                        ? ((conn.endTime - windowStart) / windowDuration) * 100
                                        : 100;
                                    const connWidth = connEnd - connStart;
                                    
                                    // Skip connections entirely outside the window
                                    if (connEnd < 0 || connStart > 100) return null;
                                    
                                    return (
                                        <div
                                            key={conn.id || idx}
                                            className={`absolute h-3 top-1.5 rounded ${
                                                conn.quality > 70 ? 'bg-green-500' : 
                                                conn.quality > 40 ? 'bg-yellow-500' : 
                                                'bg-red-500'
                                            } opacity-70`}
                                            style={{
                                                left: `${Math.max(0, connStart)}%`,
                                                width: `${Math.min(connWidth, 100 - Math.max(0, connStart))}%`
                                            }}
                                            title={`${conn.targetId}: ${formatTime(conn.startTime)} - ${
                                                conn.endTime ? formatTime(conn.endTime) : 'Active'
                                            } (${Math.round(conn.quality)}%)`}
                                        />
                                    );
                                })}
                                </div>
                            </div>
                            
                            {/* Data transfer events */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground w-12">Data</span>
                                <div className="relative h-4 flex-1">
                                    <div className="absolute inset-0 bg-muted/20 rounded" />
                                    {dataTransferEvents.map((event, idx) => {
                                    // Use the actual time window for consistent calculations
                                    const windowStart = currentTime - timeWindow;
                                    const windowDuration = timeWindow;
                                    const position = ((event.timestamp - windowStart) / windowDuration) * 100;
                                    
                                    if (position < 0 || position > 100) return null;
                                    
                                    return (
                                        <div
                                            key={idx}
                                            className="absolute w-1 h-full bg-blue-500 opacity-80"
                                            style={{ left: `${position}%` }}
                                            title={`${formatTime(event.timestamp)}: ${(event.dataAmount / 1024).toFixed(1)}KB transferred`}
                                        />
                                    );
                                })}
                                </div>
                            </div>
                        </div>
                        
                        {/* Legend */}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-green-500 opacity-80" />
                                <span>Good Link</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-yellow-500 opacity-80" />
                                <span>Degraded</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-red-500 opacity-80" />
                                <span>Poor/Offline</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-1 h-3 bg-blue-500 opacity-80" />
                                <span>Data TX</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Time Window Controls */}
            <div className="space-y-1 mt-3 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Time Window:</span>
                    <div className="flex gap-1">
                        {[900, 1800, 3600, 7200].map(window => (
                            <Button
                                key={window}
                                variant={timeWindow === window ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    setTimeWindow(window);
                                    setLastWindowChange(Date.now());
                                }}
                                className="h-5 px-1 text-xs"
                            >
                                {window < 3600 ? `${window/60}m` : `${window/3600}h`}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

SatelliteCommsTimeline.propTypes = {
    satelliteId: PropTypes.string.isRequired,
    app: PropTypes.object.isRequired
};