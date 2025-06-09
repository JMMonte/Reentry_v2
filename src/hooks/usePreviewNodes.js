import { useEffect, useRef } from 'react';
import { ManeuverUtils } from '../utils/ManeuverUtils.js';
import { SimpleManeuverPreview } from '../managers/SimpleManeuverPreview.js';

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
    getHohmannPreviewData, 
    currentTime, 
 
    isAdding, 
    selectedIndex, 
    nodes 
}) {
    const previewSystemRef = useRef(null);
    const lastUpdateTimeRef = useRef(0);
    
    // Get or create preview system
    useEffect(() => {
        if (satellite?.app3d && !previewSystemRef.current) {
            previewSystemRef.current = new SimpleManeuverPreview(satellite.app3d);
            // Store reference on app3d for access from other components
            if (!satellite.app3d.previewSystem) {
                satellite.app3d.previewSystem = { current: previewSystemRef.current };
            }
        }
    }, [satellite]);
    

    // Handle manual maneuver previews
    useEffect(() => {
        // Initialize preview system if needed
        if (satellite?.app3d && !previewSystemRef.current) {
            previewSystemRef.current = new SimpleManeuverPreview(satellite.app3d);
            // Store reference on app3d for access from other components
            if (!satellite.app3d.previewSystem) {
                satellite.app3d.previewSystem = { current: previewSystemRef.current };
            }
        }
        
        if (!previewSystemRef.current || !satellite || maneuverMode !== 'manual' || !isAdding) {
            // Only clear active preview if not in manual mode or not adding
            if (previewSystemRef.current && (maneuverMode !== 'manual' || !isAdding)) {
                previewSystemRef.current.clearActivePreview();
            }
            return;
        }
        
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
        
        // Skip if no delta-V
        const deltaVMagnitude = Math.sqrt(deltaV.prograde**2 + deltaV.normal**2 + deltaV.radial**2);
        if (deltaVMagnitude < 0.001) {
            // Still create preview to show the maneuver node, just without orbit
            // The preview system will handle showing only the node
        }
        

        // Throttle updates to prevent excessive re-renders
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
        
        if (timeSinceLastUpdate < 100) { // 100ms throttle
            return;
        }
        
        lastUpdateTimeRef.current = now;

        // Always create/update preview synchronously
        if (previewSystemRef.current) {
            // Use Promise to handle async but don't block
            Promise.resolve(previewSystemRef.current.createPreview(satellite, deltaV, execTime))
                .catch(error => {
                    console.error('[usePreviewNodes] Error creating/updating preview:', error);
                });
        }
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
        vz, 
        currentTime
    ]);

    // Handle Hohmann transfer previews
    useEffect(() => {
        if (!previewSystemRef.current || !satellite || !isAdding || maneuverMode !== 'hohmann') {
            return;
        }

        const hohmannData = getHohmannPreviewData?.();
        if (!hohmannData) return;

        // Debounce Hohmann preview updates
        const timeoutId = setTimeout(async () => {
            try {
                await previewSystemRef.current.createHohmannPreview({
                    satellite,
                    targetSma: hohmannData.targetSma,
                    targetEcc: hohmannData.targetEcc || 0,
                    burnTimeMode: hohmannData.burnTimeMode || 'optimal'
                });
            } catch (error) {
                console.error('[usePreviewNodes] Error creating Hohmann preview:', error);
            }
        }, 100);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [satellite, maneuverMode, isAdding, getHohmannPreviewData]);

    // Handle editing existing nodes
    useEffect(() => {
        if (!satellite || selectedIndex == null || isAdding) return;

        // When editing an existing node, hide future nodes
        nodes.forEach((model, idx) => {
            if (idx > selectedIndex && model.node3D) {
                if (model.node3D.group) model.node3D.group.visible = false;
                if (model.node3D.predictedOrbit?.orbitLine) {
                    model.node3D.predictedOrbit.orbitLine.visible = false;
                }
            }
        });

        // Highlight the selected node
        const selectedModel = nodes[selectedIndex];
        if (selectedModel?.node3D) {
            const node3D = selectedModel.node3D;
            const white = 0xffffff;
            
            // Update colors to indicate editing
            if (node3D.mesh?.material) {
                node3D.mesh.material.color.set(white);
                node3D.mesh.material.opacity = 0.8;
                node3D.mesh.material.transparent = true;
            }
            if (node3D.arrow?.line?.material) {
                node3D.arrow.line.material.color.set(white);
            }
            if (node3D.arrow?.cone?.material) {
                node3D.arrow.cone.material.color.set(white);
            }
            if (node3D.predictedOrbit?.orbitLine?.material) {
                node3D.predictedOrbit.orbitLine.material.color.set(white);
                node3D.predictedOrbit.orbitLine.visible = true;
            }
        }
    }, [selectedIndex, nodes, isAdding, satellite]);

    // Cleanup on unmount (when window closes)
    useEffect(() => {
        return () => {
            // Clear uncommitted preview if still in adding mode
            if (previewSystemRef.current && isAdding) {
                previewSystemRef.current.clearActivePreview();
            }
            // Committed previews remain visible
        };
    }, [isAdding]);

    // Update visibility based on display settings
    useEffect(() => {
        if (!previewSystemRef.current || !satellite?.app3d) return;

        const showOrbits = satellite.app3d.getDisplaySetting('showOrbits');
        // Simple preview system doesn't have setVisible yet - could add if needed
    }, [satellite]);
}