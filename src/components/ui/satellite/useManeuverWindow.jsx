import { useState, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { ManeuverManager } from './ManeuverManager.js';
import { ManeuverUtils } from '../../../utils/ManeuverUtils.js';
import formatTimeDelta from '../../../utils/FormatUtils.js';
import { usePreviewNodes } from './usePreviewNodes.js';
import { PhysicsAPI } from '../../../physics/PhysicsAPI.js';
import { Constants } from '../../../utils/Constants.js';

export function useManeuverWindow(satellite, currentTime = new Date()) {
    // Remove dependency on SimulationContext - currentTime is now a prop
    const [simulationTime, setSimulationTime] = useState(currentTime);
    
    // Update simulation time when prop changes
    useEffect(() => {
        setSimulationTime(currentTime);
    }, [currentTime]);
    
    // Create a minimal timeUtils interface for compatibility
    const timeUtils = useMemo(() => ({
        getSimulatedTime: () => simulationTime
    }), [simulationTime]);
    
    // Early return handled by parent component
    if (!satellite) {
        return {
            isAdding: false,
            setIsAdding: () => {},
            currentSimTime: new Date(),
            simTime: new Date(),
            nodes: [],
            selectedIndex: null,
            setSelectedIndex: () => {},
            // Return empty handlers
            handleSave: () => {},
            handleDelete: () => {},
            // Return default values for all other properties
            timeMode: 'offset',
            setTimeMode: () => {},
            offsetSec: '0',
            setOffsetSec: () => {},
            hours: 0,
            setHours: () => {},
            minutes: 0,
            setMinutes: () => {},
            seconds: 0,
            setSeconds: () => {},
            milliseconds: 0,
            setMilliseconds: () => {},
            vx: '0',
            setVx: () => {},
            vy: '0',
            setVy: () => {},
            vz: '0',
            setVz: () => {},
            dvMag: 0,
            manualDetails: { execTime: new Date(), dtSec: 0, dv: 0, predictedPeriod: 0, predictedVelocity: 0 },
            formatTimeDelta: () => '',
            computeMoonTransferDetails: () => {},
            getCompositePath: () => null,
            maneuverMode: 'manual',
            setManeuverMode: () => {},
            shapeType: 'circular',
            setShapeType: () => {},
            targetSmaKm: '6578',
            setTargetSmaKm: () => {},
            targetEcc: '0',
            setTargetEcc: () => {},
            targetIncDeg: '28.5',
            setTargetIncDeg: () => {},
            targetLANDeg: '0',
            setTargetLANDeg: () => {},
            targetArgPDeg: '0',
            setTargetArgPDeg: () => {},
            generateHohmann: () => {},
            hohmannDetails: null,
            hohmannPreviewDetails: null,
            computeNextPeriapsis: () => new Date(),
            computeNextApoapsis: () => new Date(),
            manualBurnTime: null,
            setManualBurnTime: () => {},
            findBestBurnTime: () => new Date(),
            findNextPeriapsis: () => new Date(),
            findNextApoapsis: () => new Date(),
            multOffset: '1',
            setMultOffset: () => {},
            multH: '1',
            setMultH: () => {},
            multMin: '1',
            setMultMin: () => {},
            multSVal: '1',
            setMultSVal: () => {},
            multMsVal: '1',
            setMultMsVal: () => {},
            multP: '1',
            setMultP: () => {},
            multA: '1',
            setMultA: () => {},
            multN: '1',
            setMultN: () => {}
        };
    }
    
    const manager = useMemo(() => new ManeuverManager(satellite, timeUtils), [satellite, timeUtils]);
    const [currentSimTime, setCurrentSimTime] = useState(simulationTime);

    // Execution time fields
    const [timeMode, setTimeMode] = useState('offset');
    const [offsetSec, setOffsetSec] = useState('0');
    const [hours, setHours] = useState(simulationTime.getUTCHours());
    const [minutes, setMinutes] = useState(simulationTime.getUTCMinutes());
    const [seconds, setSeconds] = useState(simulationTime.getUTCSeconds());
    const [milliseconds, setMilliseconds] = useState(simulationTime.getUTCMilliseconds());

    // Local delta-V fields
    const [vx, setVx] = useState('0');
    const [vy, setVy] = useState('0');
    const [vz, setVz] = useState('0');

    // Multipliers
    const [multOffset, setMultOffset] = useState('1');
    const [multH, setMultH] = useState('1');
    const [multMin, setMultMin] = useState('1');
    const [multSVal, setMultSVal] = useState('1');
    const [multMsVal, setMultMsVal] = useState('1');
    const [multP, setMultP] = useState('1');
    const [multA, setMultA] = useState('1');
    const [multN, setMultN] = useState('1');

    // Maneuver nodes (sorted by time) and selection
    const nodes = useMemo(() => manager.buildNodeModels(currentSimTime), [manager, currentSimTime]);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [isAdding, setIsAdding] = useState(false);

    // Computed magnitude of delta-V using PhysicsAPI
    const dvMag = useMemo(
        () => PhysicsAPI.calculateDeltaVMagnitude(
            parseFloat(vx) || 0,
            parseFloat(vy) || 0,
            parseFloat(vz) || 0
        ),
        [vx, vy, vz]
    );

    // Hohmann transfer mode state
    const [maneuverMode, setManeuverMode] = useState('manual');
    // Target orbit shape: circular | elliptical | moon
    const [shapeType, setShapeType] = useState('circular');
    // Classical orbital elements (always prefilled with a default circular LEO orbit)
    const [targetSmaKm, setTargetSmaKm] = useState('6578'); // 200 km altitude (Earth radius 6378 km + 200)
    const [targetEcc, setTargetEcc] = useState('0');
    const [targetIncDeg, setTargetIncDeg] = useState('28.5');
    const [targetLANDeg, setTargetLANDeg] = useState('0');
    const [targetArgPDeg, setTargetArgPDeg] = useState('0');
    // State to hold Hohmann transfer summary details
    const [hohmannDetails, setHohmannDetails] = useState(null);

    // Generate Hohmann preview data using PhysicsAPI
    const getHohmannPreviewData = useCallback(() => {
        // Convert classical elements to periapsis/apoapsis altitudes using PhysicsAPI
        const sma = parseFloat(targetSmaKm) || 0;
        const ecc = parseFloat(targetEcc) || 0;
        const { periapsis: targetPeriapsis, apoapsis: targetApoapsis } = 
            PhysicsAPI.orbitalElementsToAltitudes(sma, ecc, Constants.earthRadius);
        
        // Get Hohmann transfer parameters from PhysicsAPI
        const transferParams = PhysicsAPI.calculateHohmannTransfer({
            currentPosition: satellite.position,
            currentVelocity: satellite.velocity,
            targetPeriapsis,
            targetApoapsis,
            targetInclination: parseFloat(targetIncDeg) || 0,
            targetLAN: parseFloat(targetLANDeg) || 0,
            targetArgP: parseFloat(targetArgPDeg) || 0,
            bodyRadius: Constants.earthRadius,
            mu: Constants.earthGravitationalParameter
        });
        
        // Still need to call manager for now to maintain compatibility
        return manager.calculateHohmannPreview({
            shapeType: 'elliptical',
            ellPeriKm: targetPeriapsis.toString(),
            ellApoKm: targetApoapsis.toString(),
            targetIncDeg,
            targetLANDeg,
            targetArgPDeg,
            planeChangeDeg: transferParams.planeChangeAngle
        });
    }, [manager, targetSmaKm, targetEcc, targetIncDeg, targetLANDeg, targetArgPDeg, satellite.position, satellite.velocity]);

    // Next periapsis calculation using PhysicsAPI
    const computeNextPeriapsis = useCallback(() => {
        // Chain off existing node if in editing/adding mode
        if ((selectedIndex != null || isAdding) && nodes.length > 0) {
            const baseNode = selectedIndex != null
                ? nodes[selectedIndex].node3D
                : nodes[nodes.length - 1].node3D;
            const baselineTime = baseNode.time;
            const periodSec = baseNode.predictedOrbit?._orbitPeriod || 0;
            return new Date(baselineTime.getTime() + periodSec * 1000);
        }
        // Use PhysicsAPI for calculation
        return PhysicsAPI.calculateNextPeriapsis(
            satellite.position,
            satellite.velocity,
            Constants.earthGravitationalParameter,
            simulationTime
        );
    }, [satellite, simulationTime, nodes, selectedIndex, isAdding]);

    // Next apoapsis calculation using PhysicsAPI
    const computeNextApoapsis = useCallback(() => {
        if ((selectedIndex != null || isAdding) && nodes.length > 0) {
            const baseNode = selectedIndex != null
                ? nodes[selectedIndex].node3D
                : nodes[nodes.length - 1].node3D;
            const baselineTime = baseNode.time;
            const halfPeriod = (baseNode.predictedOrbit?._orbitPeriod || 0) * 1000 / 2;
            return new Date(baselineTime.getTime() + halfPeriod);
        }
        // Use PhysicsAPI for calculation
        return PhysicsAPI.calculateNextApoapsis(
            satellite.position,
            satellite.velocity,
            Constants.earthGravitationalParameter,
            simulationTime
        );
    }, [satellite, simulationTime, nodes, selectedIndex, isAdding]);

    // --- Hohmann manual burn time state and helpers ---
    const [manualBurnTime, setManualBurnTime] = useState(null);
    const findBestBurnTime = useCallback(() => {
        // Use PhysicsAPI for optimal burn time calculation
        return PhysicsAPI.findOptimalBurnTime({
            currentPosition: satellite.position,
            currentVelocity: satellite.velocity,
            targetArgP: parseFloat(targetArgPDeg) || 0,
            mu: Constants.earthGravitationalParameter,
            currentTime: simulationTime
        });
    }, [simulationTime, satellite, targetArgPDeg]);
    const findNextPeriapsis = useCallback(() => computeNextPeriapsis(), [computeNextPeriapsis]);
    const findNextApoapsis = useCallback(() => computeNextApoapsis(), [computeNextApoapsis]);

    // Kick off 3D preview creation/update via custom hook
    usePreviewNodes({
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
        currentTime: simulationTime,
        computeNextPeriapsis,
        computeNextApoapsis,
        isAdding,
        selectedIndex,
        nodes
    });

    // Now manualDetails should reference first preview node
    const manualDetails = useMemo(() => {
        const execTime = ManeuverUtils.computeExecutionTime(
            simulationTime,
            { timeMode, offsetSec, hours, minutes, seconds, milliseconds }
        );
        const dtSec = (execTime.getTime() - timeUtils.getSimulatedTime().getTime()) / 1000;
        const dv = PhysicsAPI.calculateDeltaVMagnitude(
            parseFloat(vx) || 0,
            parseFloat(vy) || 0,
            parseFloat(vz) || 0
        );

        // Get predicted orbit details from the preview node in app3d
        const previewOrbit = satellite.app3d.previewNode?.predictedOrbit;
        const predictedPeriod = previewOrbit?._orbitPeriod || 0;
        const predictedVelocity = previewOrbit?._currentVelocity?.length() || 0;

        return { execTime, dtSec, dv, predictedPeriod, predictedVelocity };
    }, [
        timeMode, offsetSec, hours, minutes, seconds, milliseconds,
        vx, vy, vz, timeUtils // Dependencies trigger recompute when inputs change
    ]);

    // Compute preview details for Hohmann transfer
    const hohmannPreviewDetails = useMemo(() => {
        if (maneuverMode !== 'hohmann') return null;
        
        // Get the basic data first
        const data = getHohmannPreviewData();
        
        // Enhance with additional details from preview nodes if available
        if (satellite.app3d.previewNodes?.length === 2) {
            const [node1, node2] = satellite.app3d.previewNodes;
            
            // Get predicted orbit details
            const orbit1 = node1.predictedOrbit;
            const orbit2 = node2.predictedOrbit;
            
            // Add predicted orbit properties to the data
            return {
                ...data,
                node1Period: orbit1?._orbitPeriod || 0,
                node1Velocity: orbit1?._currentVelocity?.length() || 0,
                node2Period: orbit2?._orbitPeriod || 0,
                node2Velocity: orbit2?._currentVelocity?.length() || 0,
                // Include references to the orbit objects for visualization
                orbit1,
                orbit2
            };
        }
        
        return data;
    }, [
        maneuverMode,
        shapeType,
        targetSmaKm,
        targetEcc,
        targetIncDeg,
        targetLANDeg,
        targetArgPDeg,
        getHohmannPreviewData,
        satellite.app3d.previewNodes
    ]);

    // Generate Hohmann transfer nodes using PhysicsAPI
    const generateHohmann = useCallback(() => {
        // Convert classical elements to periapsis/apoapsis altitudes using PhysicsAPI
        const sma = parseFloat(targetSmaKm) || 0;
        const ecc = parseFloat(targetEcc) || 0;
        const { periapsis: targetPeriapsis, apoapsis: targetApoapsis } = 
            PhysicsAPI.orbitalElementsToAltitudes(sma, ecc, Constants.earthRadius);
        
        // Get transfer parameters from PhysicsAPI
        const transferParams = PhysicsAPI.calculateHohmannTransfer({
            currentPosition: satellite.position,
            currentVelocity: satellite.velocity,
            targetPeriapsis,
            targetApoapsis,
            targetInclination: parseFloat(targetIncDeg) || 0,
            targetLAN: parseFloat(targetLANDeg) || 0,
            targetArgP: parseFloat(targetArgPDeg) || 0,
            bodyRadius: Constants.earthRadius,
            mu: Constants.earthGravitationalParameter
        });
        
        // Use manager to create the actual nodes (will be refactored later)
        const summary = manager.generateHohmannTransfer({
            ellPeriKm: targetPeriapsis.toString(),
            ellApoKm: targetApoapsis.toString(),
            targetIncDeg,
            targetLANDeg,
            targetArgPDeg,
            planeChangeDeg: transferParams.planeChangeAngle,
            manualBurnTime
        });
        setHohmannDetails(summary);
        // Clear selection, adding mode, and refresh node list
        setSelectedIndex(null);
        setIsAdding(false);
        setCurrentSimTime(prev => new Date(prev.getTime()));
    }, [manager, targetSmaKm, targetEcc, targetIncDeg, targetLANDeg, targetArgPDeg, manualBurnTime, setSelectedIndex, setIsAdding, setCurrentSimTime, satellite.position, satellite.velocity]);

    // Determine which orbit path to use at a node index (chained post-burn orbits)
    const getCompositePath = (idx) => {
        const sorted = satellite.maneuverNodes.slice().sort((a, b) => a.time.getTime() - b.time.getTime());
        return idx > 0 && sorted[idx - 1]?.predictedOrbit
            ? sorted[idx - 1].predictedOrbit
            : satellite.orbitPath;
    };

    // Sync currentSimTime when simulationTime prop changes
    useEffect(() => {
        setCurrentSimTime(simulationTime);
    }, [simulationTime]);

    // Refresh and rebuild node models on satellite change, updating 3D nodes in time order for nested orbits
    useEffect(() => {
        // Update all real node predicted orbits sequentially
        // DTOs don't have update() - visualization updates happen through events
        // satellite.maneuverNodes are already sorted by the physics engine
        // Ensure selection remains valid
        if (selectedIndex != null && selectedIndex >= nodes.length) {
            setSelectedIndex(null);
        }
    }, [satellite, nodes, selectedIndex]);

    // Load execution time and local DV when selection changes
    useEffect(() => {
        if (selectedIndex != null && nodes[selectedIndex]) {
            setTimeMode('datetime');
            const t = nodes[selectedIndex].time;
            setHours(t.getUTCHours()); setMinutes(t.getUTCMinutes()); setSeconds(t.getUTCSeconds()); setMilliseconds(t.getUTCMilliseconds());
            // Use stored localDV for editing
            const local = nodes[selectedIndex].localDV || new THREE.Vector3();
            setVx(local.x.toFixed(2)); setVy(local.y.toFixed(2)); setVz(local.z.toFixed(2));
        } else {
            setTimeMode('offset'); setOffsetSec('0');
            setHours(simulationTime.getUTCHours()); setMinutes(simulationTime.getUTCMinutes()); setSeconds(simulationTime.getUTCSeconds()); setMilliseconds(simulationTime.getUTCMilliseconds());
            setVx('0'); setVy('0'); setVz('0');
        }

        // Style visualization of selected node as preview (white), revert others to default style
        // This should be handled through events or visualization manager, not direct access
        // TODO: Implement proper visualization update through ManeuverNodeVisualizer
    }, [selectedIndex]);

    // Compute additional details for Moon TLI
    const computeMoonTransferDetails = useCallback(() => {
        // placeholder for optimal plane change/time adjustment calculations
        console.log('Computing Moon TLI details...');
    }, []);

    // Save or update a maneuver node
    const handleSave = useCallback(() => {
        // Determine execution time based on mode
        let execTime;
        if (timeMode === 'nextPeriapsis') {
            execTime = computeNextPeriapsis();
        } else if (timeMode === 'nextApoapsis') {
            execTime = computeNextApoapsis();
        } else {
            execTime = ManeuverUtils.computeExecutionTime(simulationTime, { timeMode, offsetSec, hours, minutes, seconds, milliseconds });
        }
        // Delta-V vector
        const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
        // Replace existing node if editing
        if (selectedIndex != null) {
            const existing = nodes[selectedIndex].node3D;
            manager.deleteNode(existing);
        }
        // Clear any preview before adding the actual node
        if (manager.sat._isPreviewingManeuver && manager.sat._currentPreviewNode) {
            if (manager.sat.maneuverNodeVisualizer) {
                manager.sat.maneuverNodeVisualizer.removeNodeVisualization(manager.sat._currentPreviewNode.id);
            }
            delete manager.sat._currentPreviewNode;
            delete manager.sat._isPreviewingManeuver;
        }
        
        // Add new maneuver node
        const newNode = manager.sat.addManeuverNode(execTime, dvLocal.clone());
        // newNode is now a DTO, no need to set localDV or call update()
        // The physics engine and visualization will handle updates through events
        // Reset selection and add-mode
        setSelectedIndex(null);
        setIsAdding(false);
    }, [manager, timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, selectedIndex, nodes, computeNextPeriapsis, computeNextApoapsis, timeUtils]);

    // Delete a maneuver node (by index or selectedIndex)
    const handleDelete = useCallback((idx) => {
        let indexToDelete = idx;
        if (typeof idx !== 'number') {
            indexToDelete = selectedIndex;
        }
        if (indexToDelete != null && nodes[indexToDelete]) {
            const modelToDelete = nodes[indexToDelete];
            manager.deleteNode(modelToDelete.node3D);
            setSelectedIndex(null);
            setIsAdding(false);
            // Trigger nodes rebuild by updating simulation time
            setCurrentSimTime(prev => new Date(prev.getTime()));
        }
    }, [manager, selectedIndex, nodes, setSelectedIndex, setIsAdding, setCurrentSimTime]);

    return {
        isAdding, setIsAdding,
        currentSimTime,
        simTime: currentSimTime,
        timeMode, setTimeMode,
        offsetSec, setOffsetSec,
        hours, setHours,
        minutes, setMinutes,
        seconds, setSeconds,
        milliseconds, setMilliseconds,
        multOffset, setMultOffset,
        multH, setMultH,
        multMin, setMultMin,
        multSVal, setMultSVal,
        multMsVal, setMultMsVal,
        vx, setVx,
        vy, setVy,
        vz, setVz,
        multP, setMultP,
        multA, setMultA,
        multN, setMultN,
        dvMag,
        manualDetails,
        nodes, selectedIndex, setSelectedIndex,
        formatTimeDelta,
        handleSave, handleDelete,
        computeMoonTransferDetails,
        getCompositePath,
        // Hohmann transfer exports
        maneuverMode, setManeuverMode,
        shapeType, setShapeType,
        targetSmaKm, setTargetSmaKm,
        targetEcc, setTargetEcc,
        targetIncDeg, setTargetIncDeg,
        targetLANDeg, setTargetLANDeg,
        targetArgPDeg, setTargetArgPDeg,
        generateHohmann,
        hohmannDetails,
        hohmannPreviewDetails,
        // Next apsis calculations for execution time presets
        computeNextPeriapsis,
        computeNextApoapsis,
        // Hohmann manual burn time helpers
        manualBurnTime,
        setManualBurnTime,
        findBestBurnTime,
        findNextPeriapsis,
        findNextApoapsis
    };
} 