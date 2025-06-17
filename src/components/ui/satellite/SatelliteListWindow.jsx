import React, { useCallback, useMemo } from 'react';
import { Satellite as SatelliteIcon, Trash2, Route, Activity, Radio } from 'lucide-react';
import { DraggableModal } from "../modal/DraggableModal";
import { Button } from "../button";
import PropTypes from 'prop-types';
import { ColorPicker } from './ColorPicker';

// Simplified SatelliteItem component
const SatelliteItem = React.memo(function SatelliteItem({
    satellite,
    isDebugOpen,
    onColorChange,
    onDelete,
    onDebugToggle,
    onManeuverOpen,
    getCentralBodyName
}) {
    const handleColorChange = useCallback((color) => {
        onColorChange(satellite.id, color);
    }, [satellite.id, onColorChange]);

    const handleDelete = useCallback(() => {
        onDelete(satellite.id);
    }, [satellite.id, onDelete]);

    const handleDebugToggle = useCallback(() => {
        onDebugToggle(satellite);
    }, [satellite, onDebugToggle]);

    const handleManeuverOpen = useCallback(() => {
        onManeuverOpen(satellite);
    }, [satellite, onManeuverOpen]);

    // Get communications status
    const commsStatus = useMemo(() => {
        if (!window.app3d?.communicationsService) return null;

        try {
            const config = window.app3d.communicationsService.getSatelliteCommsConfig(satellite.id);
            const connections = window.app3d.communicationsService.getSatelliteConnections(satellite.id);

            if (!config) return null;

            return {
                enabled: config.enabled || false,
                connectionsCount: connections?.length || 0,
                antennaType: config.antennaType || 'unknown'
            };
        } catch {
            return null;
        }
    }, [satellite.id]);

    const centralBodyName = getCentralBodyName(satellite.centralBodyNaifId);

    return (
        <div className="px-2 py-1 border rounded bg-card hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <div onMouseDown={(e) => e.stopPropagation()}>
                        <ColorPicker
                            color={satellite.color || 0xffff00}
                            onChange={handleColorChange}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground text-xs truncate">
                                {satellite.name}
                            </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                            {satellite.orbitalElements?.altitude !== undefined && (
                                <span>Alt: {satellite.orbitalElements.altitude.toFixed(0)}km</span>
                            )}
                            {satellite.orbitalElements?.period !== undefined && (
                                <span>T: {(satellite.orbitalElements.period / 60).toFixed(1)}min</span>
                            )}
                            <span>@ {centralBodyName}</span>
                            {commsStatus && (
                                <span className="flex items-center gap-0.5">
                                    {!commsStatus.enabled ? (
                                        <>
                                            <Radio className="h-2 w-2 text-muted-foreground/50" />
                                            <span>OFF</span>
                                        </>
                                    ) : (
                                        <>
                                            <Radio className={`h-2 w-2 ${commsStatus.connectionsCount > 0 ? 'text-green-500' : 'text-yellow-500'}`} />
                                            <span>{commsStatus.connectionsCount}</span>
                                        </>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDebugToggle}
                        className={`h-5 w-5 p-0 ${isDebugOpen ? 'bg-primary text-primary-foreground' : ''}`}
                        title="Debug window"
                    >
                        <Activity className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleManeuverOpen}
                        className="h-5 w-5 p-0"
                        title="Maneuver planning"
                    >
                        <Route className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDelete}
                        className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                        title="Delete satellite"
                    >
                        <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
});

SatelliteItem.propTypes = {
    satellite: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        name: PropTypes.string,
        color: PropTypes.number,
        centralBodyNaifId: PropTypes.number,
        orbitalElements: PropTypes.shape({
            altitude: PropTypes.number,
            period: PropTypes.number
        })
    }).isRequired,
    isDebugOpen: PropTypes.bool.isRequired,
    onColorChange: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    onDebugToggle: PropTypes.func.isRequired,
    onManeuverOpen: PropTypes.func.isRequired,
    getCentralBodyName: PropTypes.func.isRequired
};

// Main component with simplified memoization
export const SatelliteListWindow = React.memo(function SatelliteListWindow({
    satellites,
    isOpen,
    setIsOpen,
    debugWindows,
    onOpenManeuver,
    onCreateSatellite,
    availableBodies = [{ name: 'Earth', naifId: 399 }]
}) {
    // Convert satellites to array - simplified
    const satelliteArray = useMemo(() => {
        if (!satellites) return [];

        let satArray = [];
        if (Array.isArray(satellites)) {
            satArray = satellites;
        } else if (typeof satellites === 'object') {
            satArray = Object.values(satellites);
        }

        return satArray.filter(sat => sat && sat.id != null);
    }, [satellites]);

    // Central body name lookup
    const getCentralBodyName = useCallback((naifId) => {
        const body = availableBodies.find(b => b.naifId === naifId);
        return body?.name || `Body ${naifId}`;
    }, [availableBodies]);

    // Event handlers
    const handleColorChange = useCallback(async (satelliteId, color) => {
        try {
            if (window.app3d?.physicsIntegration?.physicsEngine) {
                window.app3d.physicsIntegration.physicsEngine.updateSatelliteProperty(satelliteId, 'color', color);
            } else {
                console.warn('No physics engine available for color change');
            }
        } catch (error) {
            console.error('Failed to change satellite color:', error);
        }
    }, []);

    const handleDelete = useCallback(async (satelliteId) => {
        try {
            if (window.app3d?.physicsIntegration?.physicsEngine) {
                window.app3d.physicsIntegration.physicsEngine.removeSatellite(satelliteId);
            } else {
                console.warn('No physics engine available for satellite deletion');
            }
        } catch (error) {
            console.error('Failed to delete satellite:', error);
        }
    }, []);

    const handleDebugToggle = useCallback((satellite) => {
        if (window.app3d?.createDebugWindow) {
            window.app3d.createDebugWindow(satellite);
        } else {
            console.warn('Debug window creation not available');
        }
    }, []);

    const handleManeuverOpen = useCallback((satellite) => {
        if (onOpenManeuver) {
            onOpenManeuver(satellite);
        }
    }, [onOpenManeuver]);

    const handleCreateSatellite = useCallback(() => {
        if (onCreateSatellite) {
            onCreateSatellite();
        }
    }, [onCreateSatellite]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, [setIsOpen]);

    // Check if debug window is open
    const isDebugWindowOpen = useCallback((satelliteId) => {
        return debugWindows?.some(w => w.id === satelliteId) || false;
    }, [debugWindows]);

    return (
        <DraggableModal
            title={`Satellites (${satelliteArray.length})`}
            isOpen={isOpen}
            onClose={handleClose}
            defaultPosition={{ x: 20, y: 80 }}
            resizable={true}
            defaultWidth={300}
            defaultHeight={500}
            minWidth={200}
            minHeight={100}
            rightElement={
                <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    onClick={handleCreateSatellite}
                    title="Create New Satellite"
                >
                    <SatelliteIcon className="h-4 w-4" />
                </Button>
            }
        >
            <div className="flex flex-col gap-1 p-1 max-h-full overflow-y-auto">
                {satelliteArray.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <SatelliteIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No satellites in physics world</p>
                        <p className="text-xs mt-1">Create one to get started</p>
                    </div>
                ) : (
                    satelliteArray.map((satellite) => (
                        <SatelliteItem
                            key={satellite.id}
                            satellite={satellite}
                            isDebugOpen={isDebugWindowOpen(satellite.id)}
                            onColorChange={handleColorChange}
                            onDelete={handleDelete}
                            onDebugToggle={handleDebugToggle}
                            onManeuverOpen={handleManeuverOpen}
                            getCentralBodyName={getCentralBodyName}
                        />
                    ))
                )}
            </div>
        </DraggableModal>
    );
});

SatelliteListWindow.propTypes = {
    satellites: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    isOpen: PropTypes.bool.isRequired,
    setIsOpen: PropTypes.func.isRequired,
    debugWindows: PropTypes.array,
    onOpenManeuver: PropTypes.func,
    onCreateSatellite: PropTypes.func,
    availableBodies: PropTypes.array
};
