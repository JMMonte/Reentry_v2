import { useEffect, useRef, useCallback } from 'react';
import { ManeuverNodeRenderer } from '../components/Satellite/ManeuverNodeRenderer.js';

/**
 * useManeuverPreview - Hook for managing maneuver node previews
 * 
 * This hook connects the UI state to the ManeuverPreviewManager and handles
 * visualization updates. It maintains clean separation between UI state,
 * physics calculations, and 3D rendering.
 */
export function useManeuverPreview({
    satellite,
    previewManager,
    maneuverMode,
    executionTime,
    deltaV,
    hohmannParams,
    isActive,
    selectedNode
}) {
    const visualizationsRef = useRef(new Map());
    const currentPreviewRef = useRef(null);

    // Create or update manual preview
    const updateManualPreview = useCallback(async () => {
        if (!satellite || !previewManager || maneuverMode !== 'manual' || !isActive) {
            return;
        }

        try {
            // Create preview through manager
            const preview = await previewManager.createManualPreview({
                satellite,
                executionTime,
                deltaV,
                baseState: selectedNode ? {
                    position: selectedNode.positionAtManeuver,
                    velocity: selectedNode.velocityAfterManeuver,
                    time: selectedNode.executionTime
                } : null
            });

            // Update visualization
            updateVisualization(preview);
            currentPreviewRef.current = preview;
        } catch (error) {
            console.error('Failed to create manual preview:', error);
        }
    }, [satellite, previewManager, maneuverMode, executionTime, deltaV, isActive, selectedNode]);

    // Create or update Hohmann preview
    const updateHohmannPreview = useCallback(async () => {
        if (!satellite || !previewManager || maneuverMode !== 'hohmann' || !isActive) {
            return;
        }

        try {
            const preview = await previewManager.createHohmannPreview({
                satellite,
                ...hohmannParams
            });

            // Update visualizations for both burns
            updateVisualization(preview.burn1, 0);
            updateVisualization(preview.burn2, 1);
            currentPreviewRef.current = preview;
        } catch (error) {
            console.error('Failed to create Hohmann preview:', error);
        }
    }, [satellite, previewManager, maneuverMode, hohmannParams, isActive]);

    // Update visualization for a preview
    const updateVisualization = useCallback((previewData, index = 0) => {
        if (!satellite?.app3d?.scene) return;

        const vizKey = `${previewData.satelliteId}_${index}`;
        let viz = visualizationsRef.current.get(vizKey);

        if (!viz) {
            // Create new visualization
            viz = new ManeuverNodeRenderer({
                scene: satellite.app3d.scene,
                satellite,
                nodeData: previewData,
                color: 0xffffff,
                opacity: 0.8,
                isPreview: true,
                font: satellite.app3d.font
            });
            visualizationsRef.current.set(vizKey, viz);
        } else {
            // Update existing visualization
            viz.updateOrbitPath(previewData.orbitData);
        }

        // Update position
        viz.updatePosition(previewData.positionAtManeuver);
    }, [satellite]);

    // Clean up visualizations
    const cleanupVisualizations = useCallback(() => {
        visualizationsRef.current.forEach(viz => {
            viz.dispose();
        });
        visualizationsRef.current.clear();
        currentPreviewRef.current = null;
    }, []);

    // Main effect to manage preview updates
    useEffect(() => {
        if (!isActive) {
            cleanupVisualizations();
            if (previewManager && satellite) {
                previewManager.clearPreview(satellite.id);
            }
            return;
        }

        // Debounce preview updates
        const timeoutId = setTimeout(() => {
            if (maneuverMode === 'manual') {
                updateManualPreview();
            } else if (maneuverMode === 'hohmann') {
                updateHohmannPreview();
            }
        }, 100); // 100ms debounce

        return () => {
            clearTimeout(timeoutId);
        };
    }, [
        isActive,
        maneuverMode,
        executionTime,
        deltaV,
        hohmannParams,
        updateManualPreview,
        updateHohmannPreview,
        cleanupVisualizations,
        previewManager,
        satellite
    ]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            cleanupVisualizations();
            if (previewManager && satellite) {
                previewManager.clearPreview(satellite.id);
            }
        };
    }, [cleanupVisualizations, previewManager, satellite]);

    // Handle visibility based on display settings
    useEffect(() => {
        if (!satellite?.app3d) return;

        const showOrbits = satellite.app3d.getDisplaySetting('showOrbits');
        visualizationsRef.current.forEach(viz => {
            viz.setVisible(showOrbits);
        });
    }, [satellite]);

    return {
        currentPreview: currentPreviewRef.current,
        visualizations: visualizationsRef.current
    };
}