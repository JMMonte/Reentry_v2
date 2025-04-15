import React, { useEffect } from 'react';
import { DraggableModal } from "../modal/DraggableModal";
import { Button } from "../button";
import { Focus, MonitorX, MonitorCheck, Trash2 } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { formatBodySelection } from '../../../utils/BodySelectionUtils';

export function SatelliteListWindow({ satellites, isOpen, setIsOpen, onBodySelect }) {
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
            // Do NOT dispatch the event or call updateCameraTarget here.
            // Let the React state and App.jsx handle it.
        }
    };

    const handleToggleDebug = (satellite) => {
        if (satellite.debugWindow?.setIsOpen) {
            satellite.debugWindow.setIsOpen(isOpen => !isOpen);
        }
    };

    const handleDelete = (satellite) => {
        if (satellite.delete) {
            satellite.delete();
        } else if (window.app3d && typeof window.app3d.removeSatellite === 'function') {
            window.app3d.removeSatellite(satellite.id);
        } else if (satellite.dispose) {
            satellite.dispose();
        }
        // No need to dispatch satelliteDeleted here; it is handled in Satellite.dispose().
    };

    if (!isOpen) return null;

    return (
        <DraggableModal
            title="Satellites"
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            className="w-[250px]"
            key={isOpen ? 'sat-list-open' : 'sat-list-closed'}
            defaultPosition={{ x: 20, y: 80 }}
            resizable={true}
            defaultWidth={300}
            defaultHeight={500}
            minHeight={100}
        >
            <div className="space-y-1 p-1">
                {Object.values(satellites)
                    .filter(sat => sat && sat.id != null)
                    .map((satellite) => (
                        <div
                            key={satellite.id}
                            className="flex items-center justify-between p-1.5 bg-secondary/50 rounded-md text-xs"
                        >
                            <div className="flex items-center gap-1.5">
                                <ColorPicker
                                    color={satellite.color}
                                    onChange={(color) => satellite.setColor(color)}
                                />
                                <span>
                                    {satellite.name || `Satellite ${satellite.id}`}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-6 h-6"
                                    onClick={() => handleToggleDebug(satellite)}
                                    title="Toggle Debug Window"
                                >
                                    {satellite.debugWindow?.isOpen ?
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
                    ))}
                {Object.values(satellites).length === 0 && (
                    <div className="text-xs text-muted-foreground text-center p-2">
                        No satellites in orbit
                    </div>
                )}
            </div>
        </DraggableModal>
    );
}
