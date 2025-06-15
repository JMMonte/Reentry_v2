import { useState, useEffect, useMemo, useCallback } from 'react';
import { ManeuverManager } from '../managers/ManeuverManager.js';
import { ManeuverUtils } from '../utils/ManeuverUtils.js';
import formatTimeDelta from '../utils/FormatUtils.js';
import { usePreviewNodes } from './usePreviewNodes.js';
import { useManeuverApsisData } from './useApsisData.js';
import { Orbital, Bodies, Utils } from '../physics/PhysicsAPI.js';

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

    // Force refresh trigger for maneuver nodes
    const [maneuverRefreshTrigger, setManeuverRefreshTrigger] = useState(0);
    
    // Listen for maneuver events to refresh the node list
    useEffect(() => {
        const handleManeuverAdded = (event) => {
            if (event.detail.satelliteId === satellite.id) {
                setManeuverRefreshTrigger(prev => prev + 1);
            }
        };
        
        const handleManeuverRemoved = (event) => {
            if (event.detail.satelliteId === satellite.id) {
                setManeuverRefreshTrigger(prev => prev + 1);
            }
        };
        
        window.addEventListener('maneuverNodeAdded', handleManeuverAdded);
        window.addEventListener('maneuverNodeRemoved', handleManeuverRemoved);
        
        return () => {
            window.removeEventListener('maneuverNodeAdded', handleManeuverAdded);
            window.removeEventListener('maneuverNodeRemoved', handleManeuverRemoved);
        };
    }, [satellite.id]);

    // Build nodes from physics engine instead of satellite's local array
    const nodes = useMemo(() => {
        // Trigger dependency on refresh
        maneuverRefreshTrigger;  
        
        // Get nodes directly from physics engine
        const physicsEngine = satellite.app3d?.physicsIntegration?.physicsEngine;
        const physicsNodes = physicsEngine?.satelliteEngine?.getManeuverNodes?.(satellite.id) || [];
        
        // Convert physics nodes to UI node models
        return physicsNodes
            .slice()
            .sort((a, b) => a.executionTime.getTime() - b.executionTime.getTime())
            .map(n => {
                const localDV = { x: n.deltaV.prograde, y: n.deltaV.normal, z: n.deltaV.radial };
                const worldDV = { x: n.deltaV.prograde, y: n.deltaV.normal, z: n.deltaV.radial }; // Simplified
                
                // Get orbit data from physics engine if available
                let orbitData = {
                    _orbitPeriod: 0,
                    _currentVelocity: { length: () => 0 },
                    elements: null
                };
                
                // Check if the physics node already has computed orbital data
                if (n.orbitData) {
                    orbitData = n.orbitData;
                } else {
                    // For now, use placeholder data - physics engine should compute this
                    // TODO: Add orbital data computation to physics engine maneuver node creation
                    orbitData = {
                        _orbitPeriod: 0,
                        _currentVelocity: { length: () => 0 },
                        elements: null
                    };
                }
                
                return {
                    node3D: {
                        ...n,
                        predictedOrbit: orbitData
                    },
                    time: n.executionTime,
                    localDV,
                    worldDV,
                    id: n.id,
                    // Add orbital elements for display
                    orbitalElements: orbitData.elements
                };
            });
    }, [satellite, currentSimTime, maneuverRefreshTrigger]);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [isAdding, setIsAdding] = useState(false);

    // Apsis data and calculations
    const apsisData = useManeuverApsisData(satellite, simulationTime, nodes, selectedIndex, isAdding);

    // Computed magnitude of delta-V using PhysicsAPI
    // Convert from m/s (UI) to km/s (backend) for calculation, then back to m/s for display
    const dvMag = useMemo(
        () => Utils.vector.magnitude(
            (parseFloat(vx) || 0) / 1000, // Convert m/s to km/s
            (parseFloat(vy) || 0) / 1000, // Convert m/s to km/s
            (parseFloat(vz) || 0) / 1000  // Convert m/s to km/s
        ) * 1000, // Convert result back to m/s for display
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
        // Get central body data from physics API (body-agnostic)
        const centralBodyData = Bodies.getByNaif(satellite.centralBodyNaifId);
        
        // Convert classical elements to periapsis/apoapsis altitudes using PhysicsAPI
        const sma = parseFloat(targetSmaKm) || 0;
        const ecc = parseFloat(targetEcc) || 0;
        const { periapsis: targetPeriapsis, apoapsis: targetApoapsis } = 
            Orbital.elementsToAltitudes(sma, ecc, centralBodyData?.radius);
        
        // Get Hohmann transfer parameters from PhysicsAPI
        const transferParams = Orbital.calculateHohmannTransfer({
            currentPosition: satellite.position,
            currentVelocity: satellite.velocity,
            targetPeriapsis,
            targetApoapsis,
            targetInclination: parseFloat(targetIncDeg) || 0,
            targetLAN: parseFloat(targetLANDeg) || 0,
            targetArgP: parseFloat(targetArgPDeg) || 0,
            bodyRadius: centralBodyData?.radius,
            mu: centralBodyData?.GM || Bodies.getGM(satellite.centralBodyNaifId)
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

    // Next periapsis calculation - now handled by ApsisService
    const computeNextPeriapsis = apsisData.computeNextPeriapsis;

    // Next apoapsis calculation - now handled by ApsisService
    const computeNextApoapsis = apsisData.computeNextApoapsis;

    // --- Hohmann manual burn time state and helpers ---
    const [manualBurnTime, setManualBurnTime] = useState(null);
    const findBestBurnTime = useCallback(() => {
        // Get central body data from physics API (body-agnostic)
        const centralBodyData = Bodies.getByNaif(satellite.centralBodyNaifId);
        
        // Use PhysicsAPI for optimal burn time calculation
        return Utils.time.findOptimalBurnTime({
            currentPosition: satellite.position,
            currentVelocity: satellite.velocity,
            targetArgP: parseFloat(targetArgPDeg) || 0,
            mu: centralBodyData?.GM || Bodies.getGM(satellite.centralBodyNaifId),
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
        currentTime: simulationTime,
        isAdding
    });

    // Now manualDetails should reference first preview node
    const manualDetails = useMemo(() => {
        const execTime = ManeuverUtils.computeExecutionTime(
            simulationTime,
            { timeMode, offsetSec, hours, minutes, seconds, milliseconds }
        );
        const dtSec = (execTime.getTime() - timeUtils.getSimulatedTime().getTime()) / 1000;
        const dv = Utils.vector.magnitude(
            (parseFloat(vx) || 0) / 1000, // Convert m/s to km/s
            (parseFloat(vy) || 0) / 1000, // Convert m/s to km/s
            (parseFloat(vz) || 0) / 1000  // Convert m/s to km/s
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
        // Get central body data from physics API (body-agnostic)
        const centralBodyData = Bodies.getByNaif(satellite.centralBodyNaifId);
        
        // Convert classical elements to periapsis/apoapsis altitudes using PhysicsAPI
        const sma = parseFloat(targetSmaKm) || 0;
        const ecc = parseFloat(targetEcc) || 0;
        const { periapsis: targetPeriapsis, apoapsis: targetApoapsis } = 
            Orbital.elementsToAltitudes(sma, ecc, centralBodyData?.radius);
        
        // Get transfer parameters from PhysicsAPI
        const transferParams = Orbital.calculateHohmannTransfer({
            currentPosition: satellite.position,
            currentVelocity: satellite.velocity,
            targetPeriapsis,
            targetApoapsis,
            targetInclination: parseFloat(targetIncDeg) || 0,
            targetLAN: parseFloat(targetLANDeg) || 0,
            targetArgP: parseFloat(targetArgPDeg) || 0,
            bodyRadius: centralBodyData?.radius,
            mu: centralBodyData?.GM || Bodies.getGM(satellite.centralBodyNaifId)
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
            // Use stored localDV for editing - convert from km/s (backend) to m/s (UI)
            const local = nodes[selectedIndex].localDV || { x: 0, y: 0, z: 0 };
            setVx((local.x * 1000).toFixed(0)); setVy((local.y * 1000).toFixed(0)); setVz((local.z * 1000).toFixed(0));
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
        // Delta-V vector - convert from m/s (UI) to km/s (backend)
        const dvLocal = {
            x: (parseFloat(vx) || 0) / 1000, // Convert m/s to km/s
            y: (parseFloat(vy) || 0) / 1000, // Convert m/s to km/s
            z: (parseFloat(vz) || 0) / 1000  // Convert m/s to km/s
        };
        
        // Check if deltaV is zero (don't allow adding maneuvers with zero deltaV)
        const dvMagnitude = Math.sqrt(dvLocal.x * dvLocal.x + dvLocal.y * dvLocal.y + dvLocal.z * dvLocal.z);
        if (dvMagnitude < 0.001) { // Less than 1 m/s
            console.warn('[useManeuverWindow] Cannot add maneuver with zero delta-V');
            return; // Don't add the maneuver
        }
        
        // Reset add-mode and selection IMMEDIATELY to stop preview system
        setIsAdding(false);
        setSelectedIndex(null);
        
        // Clear the preview IMMEDIATELY before adding permanent node
        const visualizer = satellite?.app3d?.maneuverVisualizer;
        if (visualizer) {
            visualizer.clearPreview(satellite.id);
        }
        
        // Replace existing node if editing
        if (selectedIndex != null) {
            const existing = nodes[selectedIndex];
            // Remove via physics engine directly
            const physicsEngine = satellite.app3d?.physicsIntegration?.physicsEngine;
            physicsEngine?.satelliteEngine?.removeManeuverNode(satellite.id, existing.id);
        }
        
        // Add new maneuver node via physics engine directly
        const physicsEngine = satellite.app3d?.physicsIntegration?.physicsEngine;
        if (physicsEngine?.satelliteEngine) {
            const maneuverNode = {
                executionTime: execTime,
                deltaV: {
                    prograde: dvLocal.x,
                    normal: dvLocal.y,
                    radial: dvLocal.z
                }
            };
            physicsEngine.satelliteEngine.addManeuverNode(satellite.id, maneuverNode);
        }
    }, [satellite.id, satellite.app3d, timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, selectedIndex, nodes, computeNextPeriapsis, computeNextApoapsis, simulationTime]);

    // Delete a maneuver node (by index or selectedIndex)
    const handleDelete = useCallback((idx) => {
        let indexToDelete = idx;
        if (typeof idx !== 'number') {
            indexToDelete = selectedIndex;
        }
        if (indexToDelete != null && nodes[indexToDelete]) {
            const modelToDelete = nodes[indexToDelete];
            // Remove via physics engine directly
            const physicsEngine = satellite.app3d?.physicsIntegration?.physicsEngine;
            physicsEngine?.satelliteEngine?.removeManeuverNode(satellite.id, modelToDelete.id);
            setSelectedIndex(null);
            setIsAdding(false);
        }
    }, [satellite.id, selectedIndex, nodes, satellite.app3d]);

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