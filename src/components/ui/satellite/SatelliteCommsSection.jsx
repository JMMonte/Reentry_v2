/**
 * SatelliteCommsSection.jsx
 * 
 * React component for displaying and configuring satellite communication systems.
 * Part of the satellite systems engineering UI.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { Switch } from '../switch';
import { Separator } from '../separator';
import { Badge } from '../badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { 
    Radio, 
    Antenna, 
    Signal, 
    Zap, 
    Settings, 
    Info, 
    CheckCircle, 
    XCircle,
    AlertTriangle,
    Wifi
} from 'lucide-react';

export function SatelliteCommsSection({ satelliteId, app }) {
    const [commsStatus, setCommsStatus] = useState(null);
    const [connections, setConnections] = useState([]);
    const [editMode, setEditMode] = useState(false);
    const [tempConfig, setTempConfig] = useState({});

    // Get communication system status
    useEffect(() => {
        const updateCommsStatus = () => {
            let status = null;
            let activeConnections = [];

            // Try to get data from physics engine subsystem first (most accurate)
            if (app?.physicsIntegration?.physicsEngine?.subsystemManager) {
                const subsystemManager = app.physicsIntegration.physicsEngine.subsystemManager;
                const commsSubsystem = subsystemManager.getSubsystem(satelliteId, 'communication');
                
                if (commsSubsystem) {
                    status = commsSubsystem.getStatus();
                    activeConnections = commsSubsystem.getActiveConnections() || [];
                    console.log(`[SatelliteCommsSection] Got physics subsystem data for ${satelliteId}:`, {
                        status,
                        connections: activeConnections,
                        subsystemType: commsSubsystem.constructor.name
                    });
                } else {
                    console.log(`[SatelliteCommsSection] No communication subsystem found for satellite ${satelliteId} in physics engine`);
                }
            }

            // Fallback to SatelliteCommsManager if physics subsystem not available
            if (!status && app?.satelliteCommsManager) {
                const commsSystem = app.satelliteCommsManager.getCommsSystem(satelliteId);
                if (commsSystem) {
                    status = commsSystem.getStatus();
                    activeConnections = commsSystem.getActiveConnections() || [];
                    console.log(`[SatelliteCommsSection] Got SatelliteCommsManager data for ${satelliteId}:`, status);
                }
            }

            // Final fallback to LineOfSightManager (legacy)
            if (!status && app?.lineOfSightManager?.commsManager) {
                const commsSystem = app.lineOfSightManager.commsManager.getCommsSystem(satelliteId);
                if (commsSystem) {
                    status = commsSystem.getStatus();
                    activeConnections = commsSystem.getActiveConnections() || [];
                    console.log(`[SatelliteCommsSection] Got LineOfSightManager data for ${satelliteId}:`, status);
                }
            }

            if (status) {
                setCommsStatus(status);
                setConnections(activeConnections);
            } else {
                console.log(`[SatelliteCommsSection] No communication data found for satellite ${satelliteId}`);
                setCommsStatus(null);
                setConnections([]);
            }
        };

        // Initial load
        updateCommsStatus();

        // Update every 2 seconds
        const interval = setInterval(updateCommsStatus, 2000);
        return () => clearInterval(interval);
    }, [satelliteId, app]);

    const handleConfigChange = (key, value) => {
        setTempConfig(prev => ({ ...prev, [key]: value }));
    };

    const applyConfig = () => {
        // Try to update physics subsystem first
        if (app?.physicsIntegration?.physicsEngine?.subsystemManager) {
            const subsystemManager = app.physicsIntegration.physicsEngine.subsystemManager;
            const success = subsystemManager.updateSubsystemConfig(satelliteId, 'communication', tempConfig);
            if (success) {
                setTempConfig({});
                setEditMode(false);
                console.log(`[SatelliteCommsSection] Updated physics subsystem config for ${satelliteId}:`, tempConfig);
                return;
            }
        }

        // Fallback to SatelliteCommsManager
        if (app?.satelliteCommsManager) {
            app.satelliteCommsManager.updateSatelliteComms(satelliteId, tempConfig);
            setTempConfig({});
            setEditMode(false);
            console.log(`[SatelliteCommsSection] Updated SatelliteCommsManager config for ${satelliteId}:`, tempConfig);
            return;
        }

        // Final fallback to LineOfSightManager
        if (app?.lineOfSightManager?.commsManager) {
            app.lineOfSightManager.commsManager.updateSatelliteComms(satelliteId, tempConfig);
            setTempConfig({});
            setEditMode(false);
            console.log(`[SatelliteCommsSection] Updated LineOfSightManager config for ${satelliteId}:`, tempConfig);
        }
    };

    const resetConfig = () => {
        setTempConfig({});
        setEditMode(false);
    };

    const applyPreset = (presetName) => {
        let presets = {};
        let preset = null;

        // Try to get presets from SatelliteCommsManager first (most comprehensive)
        if (app?.satelliteCommsManager) {
            presets = app.satelliteCommsManager.getPresets();
            preset = presets[presetName];
        }

        // Fallback to LineOfSightManager presets
        if (!preset && app?.lineOfSightManager?.commsManager) {
            presets = app.lineOfSightManager.commsManager.getPresets();
            preset = presets[presetName];
        }

        if (preset) {
            // Apply to physics subsystem first
            if (app?.physicsIntegration?.physicsEngine?.subsystemManager) {
                const subsystemManager = app.physicsIntegration.physicsEngine.subsystemManager;
                subsystemManager.updateSubsystemConfig(satelliteId, 'communication', preset);
            }

            // Apply to SatelliteCommsManager
            if (app?.satelliteCommsManager) {
                app.satelliteCommsManager.updateSatelliteComms(satelliteId, preset);
            }

            // Apply to LineOfSightManager
            if (app?.lineOfSightManager?.commsManager) {
                app.lineOfSightManager.commsManager.updateSatelliteComms(satelliteId, preset);
            }

            console.log(`[SatelliteCommsSection] Applied preset ${presetName} to satellite ${satelliteId}:`, preset);
        }
    };

    if (!commsStatus) {
        // Show debug info about what sources are available
        const debugInfo = [];
        
        if (app?.physicsIntegration?.physicsEngine?.subsystemManager) {
            const subsystemManager = app.physicsIntegration.physicsEngine.subsystemManager;
            const commsSubsystem = subsystemManager.getSubsystem(satelliteId, 'communication');
            debugInfo.push(`Physics Subsystem: ${commsSubsystem ? 'Found' : 'Not found'}`);
        } else {
            debugInfo.push('Physics Subsystem: Manager not available');
        }
        
        if (app?.satelliteCommsManager) {
            const commsSystem = app.satelliteCommsManager.getCommsSystem(satelliteId);
            debugInfo.push(`SatelliteCommsManager: ${commsSystem ? 'Found' : 'Not found'}`);
        } else {
            debugInfo.push('SatelliteCommsManager: Not available');
        }

        return (
            <Card className="w-full">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                        <Radio className="h-4 w-4" />
                        Communications
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertTriangle className="h-4 w-4" />
                            No communication system found for satellite {satelliteId}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                            <div className="font-medium">Debug Info:</div>
                            {debugInfo.map((info, idx) => (
                                <div key={idx} className="pl-2">{info}</div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const config = commsStatus.config || {};
    const state = commsStatus.state || {};
    const metrics = commsStatus.metrics || {};

    // Get status color and icon
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

    const StatusIcon = getStatusIcon(state.status || 'offline');

    return (
        <Card className="w-full">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4" />
                        Communications
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 ${getStatusColor(state.status || 'offline')}`}>
                            <StatusIcon className="h-3 w-3" />
                            <span className="text-xs capitalize">{state.status || 'offline'}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditMode(!editMode)}
                            className="h-6 px-2"
                        >
                            <Settings className="h-3 w-3" />
                        </Button>
                    </div>
                </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
                {/* System Overview */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Antenna className="h-3 w-3" />
                            <span className="font-medium">Hardware</span>
                        </div>
                        <div className="pl-5 space-y-1">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Antenna:</span>
                                <span className="capitalize">{config.antennaType || 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Gain:</span>
                                <span>{config.antennaGain || 0} dBi</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Power:</span>
                                <span>{config.transmitPower || 0} W</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Frequency:</span>
                                <span>{config.transmitFrequency || 0} GHz</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Signal className="h-3 w-3" />
                            <span className="font-medium">Performance</span>
                        </div>
                        <div className="pl-5 space-y-1">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Data Rate:</span>
                                <span>{config.dataRate || 0} kbps</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Min Elevation:</span>
                                <span>{config.minElevationAngle || 0}°</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Network:</span>
                                <span className="capitalize">{(config.networkId || 'unknown').replace('_', ' ')}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Priority:</span>
                                <Badge variant="outline" className="h-4 text-xs">
                                    {config.priority || 'normal'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Active Connections */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Wifi className="h-3 w-3" />
                            <span className="font-medium text-xs">Active Links</span>
                        </div>
                        <Badge variant="secondary" className="h-4 text-xs">
                            {connections.length}
                        </Badge>
                    </div>
                    
                    {connections.length > 0 ? (
                        <div className="space-y-1">
                            {connections.map((conn, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        <span>→ {conn.targetSatelliteId}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">{conn.dataRate} kbps</span>
                                        <Badge 
                                            variant={conn.quality > 70 ? "default" : conn.quality > 40 ? "secondary" : "destructive"}
                                            className="h-4 text-xs"
                                        >
                                            {Math.round(conn.quality)}%
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground text-center py-2">
                            No active connections
                        </div>
                    )}
                </div>

                <Separator />

                {/* Statistics */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Info className="h-3 w-3" />
                        <span className="font-medium text-xs">Statistics</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Success Rate:</span>
                            <span>{Math.round((metrics.successfulConnections / Math.max(1, metrics.connectionAttempts)) * 100)}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Data Sent:</span>
                            <span>{((state.totalDataTransmitted || 0) / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Data Received:</span>
                            <span>{((state.totalDataReceived || 0) / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Power Usage:</span>
                            <span>{(state.powerConsumption || state.batteryUsage || 0).toFixed(1)} W</span>
                        </div>
                    </div>
                </div>

                {/* Configuration Panel */}
                {editMode && (
                    <>
                        <Separator />
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-xs">Configuration</span>
                                <div className="flex gap-1">
                                    <Button variant="outline" size="sm" onClick={resetConfig} className="h-6 px-2 text-xs">
                                        Cancel
                                    </Button>
                                    <Button size="sm" onClick={applyConfig} className="h-6 px-2 text-xs">
                                        Apply
                                    </Button>
                                </div>
                            </div>

                            {/* Preset Selection */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium">Apply Preset:</label>
                                <Select onValueChange={applyPreset}>
                                    <SelectTrigger className="h-6 text-xs">
                                        <SelectValue placeholder="Select preset..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cubesat">CubeSat</SelectItem>
                                        <SelectItem value="communications_satellite">Communications Satellite</SelectItem>
                                        <SelectItem value="scientific_probe">Scientific Probe</SelectItem>
                                        <SelectItem value="military_satellite">Military Satellite</SelectItem>
                                        <SelectItem value="earth_observation">Earth Observation</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Key Parameters */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-xs">Transmit Power (W)</label>
                                    <Input
                                        type="number"
                                        className="h-6 text-xs"
                                        placeholder={config.transmitPower || '0'}
                                        value={tempConfig.transmitPower || ''}
                                        onChange={(e) => handleConfigChange('transmitPower', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs">Antenna Gain (dBi)</label>
                                    <Input
                                        type="number"
                                        className="h-6 text-xs"
                                        placeholder={config.antennaGain || '0'}
                                        value={tempConfig.antennaGain || ''}
                                        onChange={(e) => handleConfigChange('antennaGain', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs">Data Rate (kbps)</label>
                                    <Input
                                        type="number"
                                        className="h-6 text-xs"
                                        placeholder={config.dataRate || '0'}
                                        value={tempConfig.dataRate || ''}
                                        onChange={(e) => handleConfigChange('dataRate', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs">Min Elevation (°)</label>
                                    <Input
                                        type="number"
                                        className="h-6 text-xs"
                                        placeholder={config.minElevationAngle || '0'}
                                        value={tempConfig.minElevationAngle || ''}
                                        onChange={(e) => handleConfigChange('minElevationAngle', parseFloat(e.target.value))}
                                    />
                                </div>
                            </div>

                            {/* Enable/Disable */}
                            <div className="flex items-center justify-between">
                                <label className="text-xs">Communications Enabled</label>
                                <Switch
                                    checked={tempConfig.enabled !== undefined ? tempConfig.enabled : config.enabled}
                                    onCheckedChange={(checked) => handleConfigChange('enabled', checked)}
                                />
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}