import React, { useEffect } from 'react';
import { Plus } from 'lucide-react';
import { DraggableModal } from "../modal/DraggableModal";
import { Button } from "../button";
import { Focus, MonitorX, MonitorCheck, Trash2 } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { formatBodySelection } from '../../../utils/BodySelectionUtils';
import PropTypes from 'prop-types';

export function SatelliteListWindow({ satellites, isOpen, setIsOpen, onBodySelect, debugWindows, app3d, onOpenManeuver, availableBodies = [{ name: 'Earth', naifId: 399 }] }) {
    // Open automatically when first satellite is created
    useEffect(() => {
        if (satellites.length > 0 && !isOpen) {
            setIsOpen(true);
        }
    }, [satellites.length, isOpen, setIsOpen]);

    const handleFocus = (satellite) => {
        if (onBodySelect && satellite) {
            const formattedValue = formatBodySelection(satellite);
            onBodySelect(formattedValue);
        }
    };

    const handleToggleDebug = (satellite) => {
        const isOpen = debugWindows.some(w => w.id === satellite.id);
        if (isOpen) {
            if (app3d && typeof app3d.removeDebugWindow === 'function') {
                app3d.removeDebugWindow(satellite.id);
            }
        } else {
            if (app3d && typeof app3d.createDebugWindow === 'function') {
                app3d.createDebugWindow(satellite);
            }
        }
    };

    const handleDelete = (satellite) => {
        if (satellite.delete) {
            satellite.delete();
        } else if (app3d && typeof app3d.removeSatellite === 'function') {
            app3d.removeSatellite(satellite.id);
        } else if (satellite.dispose) {
            satellite.dispose();
        }
    };

    const getCentralBodyName = (sat) => {
        const naifId = sat.central_body || sat.centralBody;
        const body = availableBodies.find(b => b.naifId === naifId);
        return body ? body.name : (naifId !== undefined ? `NAIF ${naifId}` : 'Unknown');
    };

    if (!isOpen) return null;

    return (
        <>
        <DraggableModal
            title="Satellites"
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            defaultPosition={{ x: 20, y: 80 }}
            resizable={true}
            defaultWidth={300}
            defaultHeight={500}
            minWidth={200}
            minHeight={100}
        >
            <div className="space-y-1 p-1">
                {Object.values(satellites)
                    .filter(sat => sat && sat.id != null)
                    .map((satellite) => {
                        const isDebugOpen = debugWindows.some(w => w.id === satellite.id);
                        return (
                            <div
                                key={satellite.id}
                                className="flex items-center justify-between p-1.5 bg-secondary/50 rounded-md text-xs"
                            >
                                <div className="flex flex-col gap-0.5 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <ColorPicker
                                            color={satellite.color}
                                            onChange={(color) => satellite.setColor(color)}
                                        />
                                        <span>
                                            {satellite.name || `Satellite ${satellite.id}`}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground pl-6">
                                        {getCentralBodyName(satellite)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-6 h-6"
                                        onClick={() => onOpenManeuver(satellite)}
                                        title="Add Maneuver Node"
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-6 h-6"
                                        onClick={() => handleToggleDebug(satellite)}
                                        title="Toggle Debug Window"
                                    >
                                        {isDebugOpen ?
                                            <MonitorX className="h-3 w-3" /> :
                                            <MonitorCheck className="h-3 w-3" />
                                        }
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-6 h-6"
                                        onClick={() => handleFocus(satellite)}
                                        title="Focus Camera"
                                    >
                                        <Focus className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-6 h-6 text-destructive hover:text-destructive"
                                        onClick={() => handleDelete(satellite)}
                                        title="Delete Satellite"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                {Object.values(satellites).length === 0 && (
                    <div className="text-xs text-muted-foreground text-center p-2">
                        No satellites in orbit
                    </div>
                )}
            </div>
        </DraggableModal>
        </>
    );
}

SatelliteListWindow.propTypes = {
    satellites: PropTypes.oneOfType([
        PropTypes.array,
        PropTypes.object
    ]).isRequired,
    isOpen: PropTypes.bool.isRequired,
    setIsOpen: PropTypes.func.isRequired,
    onBodySelect: PropTypes.func,
    debugWindows: PropTypes.array.isRequired,
    app3d: PropTypes.shape({
        removeDebugWindow: PropTypes.func,
        createDebugWindow: PropTypes.func,
        removeSatellite: PropTypes.func
    }),
    onOpenManeuver: PropTypes.func.isRequired,
    availableBodies: PropTypes.array
};
