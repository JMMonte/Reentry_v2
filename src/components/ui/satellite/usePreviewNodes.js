import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ManeuverNode } from '../../../components/Satellite/ManeuverNode.js';
import { ManeuverUtils } from '../../../utils/ManeuverUtils.js';

export function usePreviewNodes({ satellite, maneuverMode, timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, getHohmannPreviewData, timeUtils, computeNextPeriapsis, computeNextApoapsis, isAdding, selectedIndex, nodes }) {
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
                // Adding new manual node
                const node = new ManeuverNode({ satellite, time: new Date(timeUtils.getSimulatedTime()), deltaV: new THREE.Vector3() });
                manualNodeRef.current = node;
                satellite.app3d.previewNode = node;
                // Style preview node
                const white = 0xffffff;
                node.mesh.material.color.set(white);
                node.mesh.material.opacity = 0.8;
                node.mesh.material.transparent = true;
                if (node.arrow.line) node.arrow.line.material.color.set(white);
                if (node.arrow.cone) node.arrow.cone.material.color.set(white);
                if (node.predictedOrbit.orbitLine.material) node.predictedOrbit.orbitLine.material.color.set(white);
                // Make sure the preview orbit line is visible
                node.predictedOrbit.orbitLine.visible = true;
                // Immediately compute and draw the preview orbit
                node._lastPredTime = 0;
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
            const data = getHohmannPreviewData();
            // Create preview nodes
            const node1 = new ManeuverNode({ satellite, time: data.time1, deltaV: new THREE.Vector3(data.dv1, 0, data.dv_plane) });
            const node2 = new ManeuverNode({ satellite, time: data.time2, deltaV: new THREE.Vector3(data.dv2, 0, 0) });
            // Style both nodes
            [node1, node2].forEach(node => {
                const white = 0xffffff;
                node.mesh.material.color.set(white);
                node.mesh.material.opacity = 0.8;
                node.mesh.material.transparent = true;
                if (node.arrow.line) node.arrow.line.material.color.set(white);
                if (node.arrow.cone) node.arrow.cone.material.color.set(white);
                if (node.predictedOrbit.orbitLine.material) node.predictedOrbit.orbitLine.material.color.set(white);
                // Make sure the preview orbit line is visible
                node.predictedOrbit.orbitLine.visible = true;
                // Immediately compute and draw the preview orbit
                node._lastPredTime = 0;
            });
            // Do not modify satellite.maneuverNodes permanently; use previewNodes for chaining only
            // Chained update: temporarily inject node1 for node2 propagation
            const originalNodes = [...satellite.maneuverNodes];
            satellite.maneuverNodes.push(node1);
            satellite.maneuverNodes.sort((a,b) => a.time.getTime() - b.time.getTime());
            node1._lastPredTime = 0;
            node2._lastPredTime = 0;
            // Restore real nodes list
            satellite.maneuverNodes = originalNodes;
            // Store refs and previewNodes
            hohmannNodeRefs.current = [node1, node2];
            satellite.app3d.previewNodes = [node1, node2];
            satellite.app3d.previewNode = node1;
        }

        // Cleanup on unmount or before next mode change
        return () => {
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
        if (maneuverMode !== 'manual' || !manualNodeRef.current) return;
        let execTime;
        if (timeMode === 'nextPeriapsis') {
            execTime = computeNextPeriapsis();
        } else if (timeMode === 'nextApoapsis') {
            execTime = computeNextApoapsis();
        } else {
            execTime = ManeuverUtils.computeExecutionTime(
                timeUtils.getSimulatedTime(),
                { timeMode, offsetSec, hours, minutes, seconds, milliseconds }
            );
        }
        // Force update of preview node
        const node = manualNodeRef.current;
        node.time = execTime;
        node._lastPredTime = 0;
        if (node.predictedOrbit?.orbitLine) node.predictedOrbit.orbitLine.visible = true;
    }, [maneuverMode, timeMode, offsetSec, hours, minutes, seconds, milliseconds, isAdding, selectedIndex, timeUtils, computeNextPeriapsis, computeNextApoapsis]);

    // Update preview node delta-V when DV inputs change
    useEffect(() => {
        if (maneuverMode !== 'manual' || !manualNodeRef.current) return;
        // Apply new local DV and mirror to deltaV for arrow length
        const dv = new THREE.Vector3(
            parseFloat(vx) || 0,
            parseFloat(vy) || 0,
            parseFloat(vz) || 0
        );
        const node = manualNodeRef.current;
        node.localDV = dv;
        node.deltaV = dv.clone();
        node._lastPredTime = 0;
        if (node.predictedOrbit?.orbitLine) node.predictedOrbit.orbitLine.visible = true;
    }, [maneuverMode, vx, vy, vz, isAdding, selectedIndex]);

    // Update Hohmann preview when parameters change
    useEffect(() => {
        if (maneuverMode !== 'hohmann' || hohmannNodeRefs.current.length !== 2) return;
        
        const data = getHohmannPreviewData();
        const [node1, node2] = hohmannNodeRefs.current;
        
        // Reset throttle so first node honors new settings
        node1.time = data.time1;
        node1.localDV = new THREE.Vector3(data.dv1, 0, data.dv_plane);
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
            node2.localDV = new THREE.Vector3(data.dv2, 0, 0);
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