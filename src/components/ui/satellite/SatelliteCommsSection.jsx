/**
 * SatelliteCommsSection.jsx
 * 
 * React component for displaying and configuring satellite communication systems.
 * Part of the satellite systems engineering UI.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Input } from '../input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { Switch } from '../switch';
import { 
    Radio, 
    Antenna, 
    Signal, 
    Settings, 
    CheckCircle, 
    XCircle,
    AlertTriangle,
    Wifi,
    Power,
    Zap,
    Activity,
    ArrowUpDown,
    Target
} from 'lucide-react';

export function SatelliteCommsSection({ satelliteId, app }) {
    const [commsStatus, setCommsStatus] = useState(null);
    const [connections, setConnections] = useState([]);
    const [editMode, setEditMode] = useState(false);
    const [tempConfig, setTempConfig] = useState({});

    // Get communication system status
    useEffect(() => {
        if (!satelliteId || !app) return;

        const updateCommsStatus = () => {
            // Use unified communications service
            const commsService = app.communicationsService;
            if (!commsService) {
                setCommsStatus(null);
                setConnections([]);
                return;
            }

            // Get configuration
            const config = commsService.getSatelliteCommsConfig(satelliteId);
            
            // Get connections for this satellite
            const activeConnections = commsService.getSatelliteConnections(satelliteId);
            
            // Build status from config and connections
            if (config) {
                const status = {
                    enabled: config.enabled || false,
                    transmitPower: config.transmitPower,
                    antennaGain: config.antennaGain,
                    activeConnectionsCount: activeConnections.length,
                    signalQuality: activeConnections.length > 0 ? 
                        activeConnections.reduce((sum, conn) => sum + (conn.metadata?.linkQuality || 0), 0) / activeConnections.length : 0,
                    config: config, // Include the full config object
                    state: { status: config.enabled ? 'operational' : 'offline' },
                    metrics: { successfulConnections: 0, connectionAttempts: 1 }
                };
                
                setCommsStatus(status);
                setConnections(activeConnections);
            } else {
                setCommsStatus(null);
                setConnections([]);
            }
        };

        // Initial load
        updateCommsStatus();

        // Subscribe to communications updates
        const handleUpdate = (event) => {
            if (event.detail?.satelliteId === satelliteId || !event.detail?.satelliteId) {
                updateCommsStatus();
            }
        };
        
        // Listen for communications events
        if (app.communicationsService) {
            app.communicationsService.on('configUpdated', handleUpdate);
            app.communicationsService.on('connectionsUpdated', updateCommsStatus);
        }
        
        // Also update periodically as fallback
        const interval = setInterval(updateCommsStatus, 2000);
        
        return () => {
            clearInterval(interval);
            if (app.communicationsService) {
                app.communicationsService.removeListener('configUpdated', handleUpdate);
                app.communicationsService.removeListener('connectionsUpdated', updateCommsStatus);
            }
        };
    }, [satelliteId, app]);

    const handleConfigChange = (key, value) => {
        setTempConfig(prev => ({ ...prev, [key]: value }));
    };

    const applyConfig = () => {
        // Use unified communications service
        if (app?.communicationsService) {
            app.communicationsService.updateSatelliteCommsConfig(satelliteId, tempConfig);
            setTempConfig({});
            setEditMode(false);
        }
    };

    const resetConfig = () => {
        setTempConfig({});
        setEditMode(false);
    };

    const applyPreset = (presetName) => {
        // Use unified communications service
        if (!app?.communicationsService) return;
        
        const presets = app.communicationsService.getPresets();
        const preset = presets[presetName];
        
        if (preset) {
            // Apply preset through unified service
            app.communicationsService.updateSatelliteCommsConfig(satelliteId, preset);
        }
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

    if (!commsStatus) {
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
        <div className="space-y-2">
            {/* Status Header */}
            <div className="flex items-center justify-between">
                <div className={`flex items-center gap-1 ${getStatusColor(state.status || 'offline')}`}>
                    <StatusIcon className="h-3 w-3" />
                    <span className="text-xs capitalize font-mono">{state.status || 'offline'}</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditMode(!editMode)}
                    className="h-5 w-5 p-0"
                >
                    <Settings className="h-3 w-3" />
                </Button>
            </div>

            {/* Communications Enable/Disable Toggle */}
            <div className="flex items-center justify-between py-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Radio className="h-3 w-3" />
                    Communications:
                </span>
                <Switch
                    checked={config.enabled || false}
                    onCheckedChange={(checked) => {
                        // Apply the change immediately using the unified communications service
                        const newConfig = { enabled: checked };
                        
                        // Use the unified communications service first
                        if (app?.communicationsService) {
                            app.communicationsService.updateSatelliteCommsConfig(satelliteId, newConfig);
                            return;
                        }
                        
                        // Try to update via PhysicsAPI second
                        if (app?.physicsAPI?.isReady()) {
                            const success = app.physicsAPI.updateSatelliteCommsConfig(satelliteId, newConfig);
                            if (success) return;
                        }
                        
                        // Fallback: Try to update physics subsystem directly
                        let physicsEngine = app?.physicsIntegration?.physicsEngine || app?.physicsEngine;
                        if (physicsEngine?.subsystemManager) {
                            const subsystemManager = physicsEngine.subsystemManager;
                            const success = subsystemManager.updateSubsystemConfig(satelliteId, 'communication', newConfig);
                            if (success) return;
                        }

                        // Fallback to SatelliteCommsManager
                        if (app?.satelliteCommsManager) {
                            app.satelliteCommsManager.updateSatelliteComms(satelliteId, newConfig);
                            
                            // Force update line-of-sight calculations when communications are toggled
                            if (app?.lineOfSightManager?.isEnabled()) {
                                app._syncConnectionsWorker();
                            }
                            return;
                        }
                    }}
                />
            </div>

            {/* Hardware Configuration */}
            <DataRow label="Antenna" value={config.antennaType || 'Unknown'} icon={Antenna} />
            <DataRow label="Gain" value={config.antennaGain || 0} unit="dBi" icon={Signal} />
            <DataRow label="Power" value={config.transmitPower || 0} unit="W" icon={Power} />
            <DataRow label="Frequency" value={config.transmitFrequency || 0} unit="GHz" icon={Zap} />
            <DataRow label="Data Rate" value={config.dataRate || 0} unit="kbps" icon={ArrowUpDown} />
            <DataRow label="Min Elevation" value={config.minElevationAngle || 0} unit="°" icon={Target} />

            {/* Active Connections */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        Active Links:
                    </span>
                    <span className="text-xs font-mono bg-muted px-1 rounded">{connections.length}</span>
                </div>
                
                {connections.length > 0 && (
                    <div className="space-y-1 pl-4">
                        {connections.map((conn, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1">
                                    <div className={`w-2 h-2 rounded-full ${conn.quality > 70 ? 'bg-green-500' : conn.quality > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                                    <span className="font-mono">→ {conn.targetSatelliteId}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">{conn.dataRate}k</span>
                                    <span className="font-mono">{Math.round(conn.quality)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Statistics */}
            <DataRow 
                label="Success Rate" 
                value={`${Math.round((metrics.successfulConnections / Math.max(1, metrics.connectionAttempts)) * 100)}%`} 
                icon={Activity} 
            />
            <DataRow 
                label="Data Sent" 
                value={((state.totalDataTransmitted || 0) / 1024).toFixed(1)} 
                unit="KB" 
                icon={ArrowUpDown} 
            />
            <DataRow 
                label="Data Received" 
                value={((state.totalDataReceived || 0) / 1024).toFixed(1)} 
                unit="KB" 
                icon={ArrowUpDown} 
            />
            <DataRow 
                label="Power Usage" 
                value={(state.powerConsumption || state.batteryUsage || 0).toFixed(1)} 
                unit="W" 
                icon={Power} 
            />

            {/* Configuration Panel */}
            {editMode && (
                <div className="space-y-2 mt-3 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Configuration</span>
                        <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={resetConfig} className="h-5 px-2 text-xs">
                                Cancel
                            </Button>
                            <Button size="sm" onClick={applyConfig} className="h-5 px-2 text-xs">
                                Apply
                            </Button>
                        </div>
                    </div>

                    {/* Preset Selection */}
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Preset:</label>
                        <Select onValueChange={applyPreset}>
                            <SelectTrigger className="h-5 text-xs">
                                <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cubesat">CubeSat</SelectItem>
                                <SelectItem value="communications_satellite">Comms Sat</SelectItem>
                                <SelectItem value="scientific_probe">Science</SelectItem>
                                <SelectItem value="military_satellite">Military</SelectItem>
                                <SelectItem value="earth_observation">Earth Obs</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Key Parameters in Compact Grid */}
                    <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className="space-y-1">
                            <label className="text-muted-foreground">Power (W)</label>
                            <Input
                                type="number"
                                className="h-5 text-xs font-mono"
                                placeholder={config.transmitPower || '0'}
                                value={tempConfig.transmitPower || ''}
                                onChange={(e) => handleConfigChange('transmitPower', parseFloat(e.target.value))}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-muted-foreground">Gain (dBi)</label>
                            <Input
                                type="number"
                                className="h-5 text-xs font-mono"
                                placeholder={config.antennaGain || '0'}
                                value={tempConfig.antennaGain || ''}
                                onChange={(e) => handleConfigChange('antennaGain', parseFloat(e.target.value))}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-muted-foreground">Rate (kbps)</label>
                            <Input
                                type="number"
                                className="h-5 text-xs font-mono"
                                placeholder={config.dataRate || '0'}
                                value={tempConfig.dataRate || ''}
                                onChange={(e) => handleConfigChange('dataRate', parseFloat(e.target.value))}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-muted-foreground">Elevation (°)</label>
                            <Input
                                type="number"
                                className="h-5 text-xs font-mono"
                                placeholder={config.minElevationAngle || '0'}
                                value={tempConfig.minElevationAngle || ''}
                                onChange={(e) => handleConfigChange('minElevationAngle', parseFloat(e.target.value))}
                            />
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}

SatelliteCommsSection.propTypes = {
    satelliteId: PropTypes.string.isRequired,
    app: PropTypes.object.isRequired
};