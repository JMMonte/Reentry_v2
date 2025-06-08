import { useEffect, useRef } from 'react';
import { ManeuverUtils } from '../utils/ManeuverUtils.js';

export function usePreviewNodes({ satellite, maneuverMode, timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, getHohmannPreviewData, currentTime, computeNextPeriapsis, computeNextApoapsis, isAdding, selectedIndex, nodes }) {
    const manualNodeRef = useRef(null);
    const hohmannNodeRefs = useRef([]);

    // Retrieve display settings for orbit prediction
    const predPeriods = satellite.app3d.getDisplaySetting('orbitPredictionInterval');
    const ptsPerPeriod = satellite.app3d.getDisplaySetting('orbitPointsPerPeriod');
    // Create or dispose preview nodes on mode or display-setting changes
    useEffect(() => {
        // Clean up any existing previews
        if (manualNodeRef.current) {
            manualNodeRef.current.dispose();
            delete satellite.app3d.previewNode;
            manualNodeRef.current = null;
        }
        if (hohmannNodeRefs.current.length) {
            hohmannNodeRefs.current.forEach(n => n.dispose());
            delete satellite.app3d.previewNodes;
            hohmannNodeRefs.current = [];
        }

        if (maneuverMode === 'manual' && (isAdding || selectedIndex != null)) {
            if (isAdding) {
                // Create a simple preview visualization
                // We'll use the satellite's maneuverNodeVisualizer to show a preview
                
                // Store a flag that we're in preview mode
                satellite._isPreviewingManeuver = true;
            } else {
                // Edit existing node: preview the selected node and its followers
                const model = nodes[selectedIndex];
                const node3D = model.node3D;
                // Hide mesh+arrow and orbit for all following nodes
                nodes.forEach((m, idx) => {
                    if (idx > selectedIndex) {
                        if (m.node3D.group) m.node3D.group.visible = false;
                        m.node3D.predictedOrbit.orbitLine.visible = false;
                    }
                });
                // Use the selected node itself as the preview node
                manualNodeRef.current = node3D;
                satellite.app3d.previewNode = node3D;
                // Style and draw the preview node
                const white = 0xffffff;
                node3D.mesh.material.color.set(white);
                node3D.mesh.material.opacity = 0.8;
                node3D.mesh.material.transparent = true;
                if (node3D.arrow.line) node3D.arrow.line.material.color.set(white);
                if (node3D.arrow.cone) node3D.arrow.cone.material.color.set(white);
                if (node3D.predictedOrbit.orbitLine.material) node3D.predictedOrbit.orbitLine.material.color.set(white);
                node3D.predictedOrbit.orbitLine.visible = true;
                node3D._lastPredTime = 0;
                // Chain preview for remaining nodes
                const following = nodes.slice(selectedIndex + 1).map(m => m.node3D);
                following.forEach(n3d => { n3d._lastPredTime = 0; });
            }
        } else if (maneuverMode === 'hohmann') {
            // TODO: Create Hohmann preview using new architecture
        }

        // Cleanup on unmount or before next mode change
        return () => {
            // Clear preview visualization
            if (satellite._isPreviewingManeuver && satellite._currentPreviewNode) {
                // Remove the preview visualization
                if (satellite.maneuverNodeVisualizer) {
                    satellite.maneuverNodeVisualizer.removeNodeVisualization(satellite._currentPreviewNode.id);
                }
                delete satellite._currentPreviewNode;
                delete satellite._isPreviewingManeuver;
            }
            
            // Remove manual preview
            if (manualNodeRef.current) {
                manualNodeRef.current.dispose();
                delete satellite.app3d.previewNode;
                manualNodeRef.current = null;
                // Restore visibility of all real nodes (mesh, arrow, orbits)
                const show = satellite.app3d.getDisplaySetting('showOrbits');
                nodes.forEach(m => {
                    if (m.node3D.group) m.node3D.group.visible = true;
                    m.node3D.predictedOrbit.orbitLine.visible = show;
                });
            }
            // Remove Hohmann preview nodes
            if (hohmannNodeRefs.current.length) {
                // Restore visibility of all real nodes after Hohmann preview
                const show = satellite.app3d.getDisplaySetting('showOrbits');
                nodes.forEach(m => {
                    if (m.node3D.group) m.node3D.group.visible = true;
                    m.node3D.predictedOrbit.orbitLine.visible = show;
                });
                hohmannNodeRefs.current.forEach(node => node.dispose());
                delete satellite.app3d.previewNodes;
                hohmannNodeRefs.current = [];
            }
        };
    }, [maneuverMode, isAdding, selectedIndex, predPeriods, ptsPerPeriod]);

    // Update preview node execution time when time inputs or mode change (including apsis modes)
    useEffect(() => {
        if (maneuverMode !== 'manual') return;
        
        // Calculate execution time
        let execTime;
        if (timeMode === 'nextPeriapsis') {
            execTime = computeNextPeriapsis();
        } else if (timeMode === 'nextApoapsis') {
            execTime = computeNextApoapsis();
        } else {
            execTime = ManeuverUtils.computeExecutionTime(
                currentTime,
                { timeMode, offsetSec, hours, minutes, seconds, milliseconds }
            );
        }
        
        if (isAdding && satellite._isPreviewingManeuver) {
            // Create/update preview visualization
            // Convert from m/s (UI) to km/s (backend)
            const deltaV = {
                x: (parseFloat(vx) || 0) / 1000,
                y: (parseFloat(vy) || 0) / 1000,
                z: (parseFloat(vz) || 0) / 1000
            };
            
            
            // Create a preview DTO with a stable ID
            const previewNode = {
                id: 'preview_manual_' + satellite.id,
                executionTime: execTime,
                deltaV: {
                    prograde: deltaV.x,
                    normal: deltaV.y,
                    radial: deltaV.z
                },
                deltaMagnitude: Math.sqrt(deltaV.x * deltaV.x + deltaV.y * deltaV.y + deltaV.z * deltaV.z)
            };
            
            // Request visualization through the orbit manager
            if (satellite.app3d?.satelliteOrbitManager) {
                satellite.app3d.satelliteOrbitManager.requestManeuverNodeVisualization(
                    satellite.id,
                    previewNode
                );
                
                // Store preview reference
                satellite._currentPreviewNode = previewNode;
            }
        } else if (manualNodeRef.current) {
            // Update existing node preview
            const node = manualNodeRef.current;
            node.time = execTime;
            node._lastPredTime = 0;
            if (node.predictedOrbit?.orbitLine) node.predictedOrbit.orbitLine.visible = true;
        }
    }, [maneuverMode, timeMode, offsetSec, hours, minutes, seconds, milliseconds, isAdding, selectedIndex, currentTime, computeNextPeriapsis, computeNextApoapsis, vx, vy, vz, satellite]);

    // Update preview node delta-V when DV inputs change
    // This is now handled in the time effect hook for isAdding case

    // Update Hohmann preview when parameters change
    useEffect(() => {
        if (maneuverMode !== 'hohmann' || hohmannNodeRefs.current.length !== 2) return;

        const data = getHohmannPreviewData();
        const [node1, node2] = hohmannNodeRefs.current;

        // Reset throttle so first node honors new settings
        node1.time = data.time1;
        node1.localDV = { x: data.dv1, y: 0, z: data.dv_plane };
        node1._lastPredTime = 0;

        // Save original maneuver nodes array
        const originalNodes = [...satellite.maneuverNodes];

        try {
            // Temporarily add node1 to the satellite's maneuver nodes
            satellite.maneuverNodes.push(node1);

            // Sort them by time
            satellite.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());

            // Now update node2 (it will see node1 in the satellite's maneuverNodes)
            node2.time = data.time2;
            node2.localDV = { x: data.dv2, y: 0, z: 0 };
            // Reset throttle so second node honors new settings
            node2._lastPredTime = 0;

            // Make orbit lines more visible with distinctive colors
            if (node1.predictedOrbit?.orbitLine) {
                node1.predictedOrbit.orbitLine.visible = true;
                node1.predictedOrbit.orbitLine.material.opacity = 0.8;
                // Transfer orbit - use a more distinguishable color
                node1.predictedOrbit.orbitLine.material.color.set(0xFFEEDD);
            }

            if (node2.predictedOrbit?.orbitLine) {
                node2.predictedOrbit.orbitLine.visible = true;
                node2.predictedOrbit.orbitLine.material.opacity = 0.9;
                // Final orbit - bright white
                node2.predictedOrbit.orbitLine.material.color.set(0xFFFFFF);

                // Ensure the line is properly dashed for visibility
                if (node2.predictedOrbit.orbitLine.material.dashSize) {
                    node2.predictedOrbit.orbitLine.material.dashSize = 8;
                    node2.predictedOrbit.orbitLine.material.gapSize = 4;
                    node2.predictedOrbit.orbitLine.material.needsUpdate = true;
                }
            }

            // Trigger a manual orbit data update event for both nodes
            setTimeout(() => {
                // Force visibility of orbit lines
                [node1, node2].forEach(node => {
                    if (node.predictedOrbit?.orbitLine) {
                        node.predictedOrbit.orbitLine.visible = true;
                        // Trigger the internal update
                        document.dispatchEvent(new CustomEvent('orbitDataUpdate', {
                            detail: { id: node.predictionId, orbitPoints: node.predictedOrbit.points }
                        }));
                    }
                });
            }, 100);
        } finally {
            // Restore original maneuver nodes
            satellite.maneuverNodes = originalNodes;
        }

    }, [maneuverMode, getHohmannPreviewData, satellite, predPeriods, ptsPerPeriod]);

    return null;
}