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
        if (!app?.lineOfSightManager?.commsManager) return;

        const updateCommsStatus = () => {
            const commsSystem = app.lineOfSightManager.commsManager.getCommsSystem(satelliteId);
            if (commsSystem) {
                const status = commsSystem.getStatus();
                setCommsStatus(status);
                setConnections(commsSystem.getActiveConnections());
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
        if (app?.lineOfSightManager?.commsManager) {
            app.lineOfSightManager.commsManager.updateSatelliteComms(satelliteId, tempConfig);
            setTempConfig({});
            setEditMode(false);
        }
    };

    const resetConfig = () => {
        setTempConfig({});
        setEditMode(false);
    };

    const applyPreset = (presetName) => {
        if (app?.lineOfSightManager?.commsManager) {
            const presets = app.lineOfSightManager.commsManager.getPresets();
            const preset = presets[presetName];
            if (preset) {
                app.lineOfSightManager.commsManager.updateSatelliteComms(satelliteId, preset);
            }
        }
    };

    if (!commsStatus) {
        return (
            <Card className="w-full">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                        <Radio className="h-4 w-4" />
                        Communications
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        No communication system found
                    </div>
                </CardContent>
            </Card>
        );
    }

    const config = commsStatus.config;
    const state = commsStatus.state;
    const metrics = commsStatus.metrics;

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

    const StatusIcon = getStatusIcon(state.status);

    return (
        <Card className="w-full">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4" />
                        Communications
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 ${getStatusColor(state.status)}`}>
                            <StatusIcon className="h-3 w-3" />
                            <span className="text-xs capitalize">{state.status}</span>
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
                                <span className="capitalize">{config.antennaType}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Gain:</span>
                                <span>{config.antennaGain} dBi</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Power:</span>
                                <span>{config.transmitPower} W</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Frequency:</span>
                                <span>{config.transmitFrequency} GHz</span>
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
                                <span>{config.dataRate} kbps</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Min Elevation:</span>
                                <span>{config.minElevationAngle}°</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Network:</span>
                                <span className="capitalize">{config.networkId.replace('_', ' ')}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Priority:</span>
                                <Badge variant="outline" className="h-4 text-xs">
                                    {config.priority}
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
                            <span>{(state.totalDataTransmitted / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Data Received:</span>
                            <span>{(state.totalDataReceived / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Power Usage:</span>
                            <span>{state.batteryUsage.toFixed(1)} W</span>
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
                                        placeholder={config.transmitPower}
                                        value={tempConfig.transmitPower || ''}
                                        onChange={(e) => handleConfigChange('transmitPower', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs">Antenna Gain (dBi)</label>
                                    <Input
                                        type="number"
                                        className="h-6 text-xs"
                                        placeholder={config.antennaGain}
                                        value={tempConfig.antennaGain || ''}
                                        onChange={(e) => handleConfigChange('antennaGain', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs">Data Rate (kbps)</label>
                                    <Input
                                        type="number"
                                        className="h-6 text-xs"
                                        placeholder={config.dataRate}
                                        value={tempConfig.dataRate || ''}
                                        onChange={(e) => handleConfigChange('dataRate', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs">Min Elevation (°)</label>
                                    <Input
                                        type="number"
                                        className="h-6 text-xs"
                                        placeholder={config.minElevationAngle}
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