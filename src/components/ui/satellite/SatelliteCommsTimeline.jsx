/**
 * SatelliteCommsTimeline.jsx
 * 
 * React component for visualizing satellite communication events over time.
 * Shows communication windows, data transfer events, and link quality history.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../button';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { Separator } from '../separator';
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
    WifiOff
} from 'lucide-react';

export function SatelliteCommsTimeline({ satelliteId, app }) {
    const [timelineData, setTimelineData] = useState([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [isRecording, setIsRecording] = useState(true);
    const [timeWindow, setTimeWindow] = useState(3600); // 1 hour in seconds
    const [connectionHistory, setConnectionHistory] = useState([]);
    const [dataTransferEvents, setDataTransferEvents] = useState([]);

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
            } else if (app?.physicsIntegration?.physicsEngine?.simulationTime) {
                const physicsTime = app.physicsIntegration.physicsEngine.simulationTime;
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
            if (app?.physicsIntegration?.physicsEngine?.subsystemManager) {
                const subsystemManager = app.physicsIntegration.physicsEngine.subsystemManager;
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
                console.log(`[SatelliteCommsTimeline] Got comms status for ${satelliteId}:`, {
                    status: commsStatus.state?.status,
                    connectionCount: activeConnections.length,
                    connections: activeConnections
                });
                
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

                // Check for ended connections
                setConnectionHistory(prev => 
                    prev.map(conn => {
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
                    })
                );

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

        // Update every 2 seconds
        const interval = setInterval(startTracking, 2000);
        return () => clearInterval(interval);
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

    return (
        <Card className="w-full">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Communications Timeline
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsRecording(!isRecording)}
                            className="h-6 px-2"
                        >
                            {isRecording ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearHistory}
                            className="h-6 px-2"
                        >
                            <RotateCcw className="h-3 w-3" />
                        </Button>
                    </div>
                </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
                {/* Timeline Statistics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Connections:</span>
                            <span>{stats.totalConnections}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Currently Active:</span>
                            <span>{stats.activeConnections}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Data Transferred:</span>
                            <span>{(stats.totalDataTransferred / 1024).toFixed(1)} KB</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg Duration:</span>
                            <span>{formatDuration(stats.averageConnectionDuration)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Uptime:</span>
                            <span>{stats.uptimePercentage.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Recording:</span>
                            <Badge variant={isRecording ? "default" : "secondary"} className="h-4 text-xs">
                                {isRecording ? 'ON' : 'OFF'}
                            </Badge>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Recent Connection Events */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Activity className="h-3 w-3" />
                        <span className="font-medium text-xs">Recent Events</span>
                        <Badge variant="outline" className="h-4 text-xs">
                            {connectionHistory.slice(-5).length}
                        </Badge>
                    </div>
                    
                    {connectionHistory.length > 0 ? (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {connectionHistory.slice(-5).reverse().map((event, idx) => (
                                <div key={event.id || idx} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                                    <div className="flex items-center gap-2">
                                        {event.endTime === null ? (
                                            <Wifi className="h-3 w-3 text-green-500" />
                                        ) : (
                                            <WifiOff className="h-3 w-3 text-red-500" />
                                        )}
                                        <span>→ {event.targetId}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">
                                            {event.endTime === null 
                                                ? formatDuration(currentTime - event.startTime)
                                                : formatDuration(event.endTime - event.startTime)
                                            }
                                        </span>
                                        <Badge 
                                            variant={event.quality > 70 ? "default" : event.quality > 40 ? "secondary" : "destructive"}
                                            className="h-4 text-xs"
                                        >
                                            {Math.round(event.quality)}%
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground text-center py-2">
                            No connection events recorded
                        </div>
                    )}
                </div>

                <Separator />

                {/* Data Transfer Timeline */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Signal className="h-3 w-3" />
                        <span className="font-medium text-xs">Data Transfers</span>
                        <Badge variant="outline" className="h-4 text-xs">
                            {dataTransferEvents.length}
                        </Badge>
                    </div>
                    
                    {dataTransferEvents.length > 0 ? (
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                            {dataTransferEvents.slice(-3).reverse().map((event, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs p-1 bg-muted/20 rounded">
                                    <div className="flex items-center gap-2">
                                        {event.dataAmount > 0 ? (
                                            <TrendingUp className="h-3 w-3 text-blue-500" />
                                        ) : (
                                            <TrendingDown className="h-3 w-3 text-orange-500" />
                                        )}
                                        <span>{formatTime(event.timestamp)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">
                                            {(event.dataAmount / 1024).toFixed(1)} KB
                                        </span>
                                        <span className="text-muted-foreground">
                                            ({event.connections} links)
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground text-center py-2">
                            No data transfer events recorded
                        </div>
                    )}
                </div>

                {/* Status Timeline Visualization */}
                {timelineData.length > 0 && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Activity className="h-3 w-3" />
                                <span className="font-medium text-xs">Status Timeline</span>
                                <span className="text-xs text-muted-foreground">
                                    ({formatDuration(timeWindow)} window)
                                </span>
                            </div>
                            
                            {/* Simple timeline visualization */}
                            <div className="flex h-4 bg-muted/20 rounded overflow-hidden">
                                {timelineData.slice(-20).map((data, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex-1 ${getStatusColor(data.status)}`}
                                        title={`${formatTime(data.timestamp)}: ${data.status} (${data.connectionCount} connections)`}
                                    />
                                ))}
                            </div>
                            
                            {/* Timeline legend */}
                            <div className="flex items-center gap-3 text-xs">
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded bg-green-500" />
                                    <span>Operational</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded bg-yellow-500" />
                                    <span>Degraded</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded bg-red-500" />
                                    <span>Offline</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Time Window Controls */}
                <Separator />
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-xs">Time Window</span>
                        <div className="flex gap-1">
                            {[900, 1800, 3600, 7200].map(window => (
                                <Button
                                    key={window}
                                    variant={timeWindow === window ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setTimeWindow(window)}
                                    className="h-5 px-2 text-xs"
                                >
                                    {window < 3600 ? `${window/60}m` : `${window/3600}h`}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}