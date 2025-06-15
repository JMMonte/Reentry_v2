import { useEffect, useRef, useCallback } from 'react';
import { ManeuverUtils } from '../utils/ManeuverUtils.js';
import { UnifiedManeuverVisualizer } from '../managers/UnifiedManeuverVisualizer.js';

export function usePreviewNodes({ 
    satellite, 
    maneuverMode, 
    timeMode, 
    offsetSec, 
    hours, 
    minutes, 
    seconds, 
    milliseconds, 
    vx, 
    vy, 
    vz, 
    isAdding
}) {
    const previewSystemRef = useRef(null);
    const updateTimeoutRef = useRef(null);
    
    // Get or create unified visualizer
    useEffect(() => {
        if (satellite?.app3d && !previewSystemRef.current) {
            // Use singleton pattern - one visualizer per app3d instance
            if (!satellite.app3d.maneuverVisualizer) {
                satellite.app3d.maneuverVisualizer = new UnifiedManeuverVisualizer(satellite.app3d);
            }
            previewSystemRef.current = satellite.app3d.maneuverVisualizer;
        }
    }, [satellite]);
    

    // Debounced preview update function
    const updatePreview = useCallback(() => {
        if (!previewSystemRef.current || !satellite) return;
        
        
        // Calculate execution time using physics engine's current time
        const physicsTime = satellite.app3d.physicsIntegration.physicsEngine.getSimulatedTime();
        const execTime = ManeuverUtils.computeExecutionTime(
            physicsTime,
            { timeMode, offsetSec, hours, minutes, seconds, milliseconds }
        );
        
        // Parse delta-V values (convert m/s to km/s)
        const deltaV = {
            prograde: (parseFloat(vx) || 0) / 1000,
            normal: (parseFloat(vy) || 0) / 1000,
            radial: (parseFloat(vz) || 0) / 1000
        };

        // Always create/update preview (even with zero deltaV for positioning)
        previewSystemRef.current.createPreview(satellite, deltaV, execTime)
            .catch(error => {
                console.error('[usePreviewNodes] Error creating/updating preview:', error);
            });
    }, [satellite, timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz]);

    // Handle manual maneuver previews with debouncing
    useEffect(() => {
        // Clear any pending timeout
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            updateTimeoutRef.current = null;
        }
        
        if (!previewSystemRef.current || !satellite || maneuverMode !== 'manual' || !isAdding) {
            // Clear preview if not in adding mode
            if (previewSystemRef.current && satellite) {
                previewSystemRef.current.clearPreview(satellite.id);
            }
            return;
        }
        
        
        // Debounce the update
        updateTimeoutRef.current = setTimeout(() => {
            updatePreview();
            updateTimeoutRef.current = null;
        }, 100); // 100ms debounce for responsive editing
        
    }, [
        satellite, 
        maneuverMode, 
        isAdding,
        timeMode, 
        offsetSec, 
        hours, 
        minutes, 
        seconds, 
        milliseconds, 
        vx, 
        vy, 
        vz
    ]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Clear any pending timeout
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
                updateTimeoutRef.current = null;
            }
            
            if (previewSystemRef.current && satellite) {
                previewSystemRef.current.clearPreview(satellite.id);
            }
        };
    }, [satellite]);
}