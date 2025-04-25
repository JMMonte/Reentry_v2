import { useState, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { ManeuverManager } from './ManeuverManager.js';
import { useSimulation } from '../../../context/SimulationContext';
import { ManeuverUtils } from '../../../utils/ManeuverUtils.js';
import formatTimeDelta from '../../../utils/FormatUtils.js';
import { usePreviewNodes } from './usePreviewNodes.js';
import { PhysicsUtils } from '../../../utils/PhysicsUtils.js';
import { Constants } from '../../../utils/Constants.js';

export function useManeuverWindow(satellite) {
    // Pull shared timeUtils from SimulationContext
    const { timeUtils } = useSimulation();
    const manager = useMemo(() => new ManeuverManager(satellite, timeUtils), [satellite, timeUtils]);
    const [currentSimTime, setCurrentSimTime] = useState(timeUtils.getSimulatedTime());

    // Execution time fields
    const [timeMode, setTimeMode] = useState('offset');
    const [offsetSec, setOffsetSec] = useState('0');
    const [hours, setHours] = useState(timeUtils.getSimulatedTime().getUTCHours());
    const [minutes, setMinutes] = useState(timeUtils.getSimulatedTime().getUTCMinutes());
    const [seconds, setSeconds] = useState(timeUtils.getSimulatedTime().getUTCSeconds());
    const [milliseconds, setMilliseconds] = useState(timeUtils.getSimulatedTime().getUTCMilliseconds());

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

    // Computed magnitude of delta-V
    const dvMag = useMemo(
        () => ManeuverUtils.computeDeltaVMagnitude(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0),
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

    // Generate Hohmann preview data helper (no node creation)
    const getHohmannPreviewData = useCallback(() => {
        // Convert classical elements to periapsis/apoapsis altitudes (km above surface)
        const a_m = (parseFloat(targetSmaKm) || 0) * Constants.kmToMeters;
        const e_val = parseFloat(targetEcc) || 0;
        const r_pe = a_m * (1 - e_val);
        const r_ap = a_m * (1 + e_val);
        const ellPeriKm = ((r_pe - Constants.earthRadius) * Constants.metersToKm).toString();
        const ellApoKm = ((r_ap - Constants.earthRadius) * Constants.metersToKm).toString();
        // Compute full plane-change angle from current to target orbit (inclination + RAAN)
        const details = PhysicsUtils.calculateDetailedOrbitalElements(
            satellite.position,
            satellite.velocity,
            Constants.earthGravitationalParameter
        );
        const currentInc = details.inclination;
        const currentLAN = details.longitudeOfAscendingNode;
        const i1 = THREE.MathUtils.degToRad(currentInc);
        const lan1 = THREE.MathUtils.degToRad(currentLAN);
        const i2 = THREE.MathUtils.degToRad(parseFloat(targetIncDeg));
        const lan2 = THREE.MathUtils.degToRad(parseFloat(targetLANDeg));
        const h1 = new THREE.Vector3(
            Math.sin(lan1) * Math.sin(i1),
            -Math.cos(lan1) * Math.sin(i1),
            Math.cos(i1)
        );
        const h2 = new THREE.Vector3(
            Math.sin(lan2) * Math.sin(i2),
            -Math.cos(lan2) * Math.sin(i2),
            Math.cos(i2)
        );
        const dotH = THREE.MathUtils.clamp(h1.dot(h2), -1, 1);
        const planeChangeDeg = THREE.MathUtils.radToDeg(Math.acos(dotH));
        return manager.calculateHohmannPreview({
            shapeType: 'elliptical',
            ellPeriKm,
            ellApoKm,
            targetIncDeg,
            targetLANDeg,
            targetArgPDeg,
            planeChangeDeg
        });
    }, [manager, targetSmaKm, targetEcc, targetIncDeg, targetLANDeg, targetArgPDeg, satellite.position, satellite.velocity]);

    // Next periapsis calculation: solve Kepler's equation for current orbit (fallback to chain-based node period)
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
        // Compute using current orbital elements
        const simNow = timeUtils.getSimulatedTime();
        const details = PhysicsUtils.calculateDetailedOrbitalElements(
            satellite.position,
            satellite.velocity,
            Constants.earthGravitationalParameter
        );
        const f0 = THREE.MathUtils.degToRad(details.trueAnomaly);
        const e = details.eccentricity;
        // Compute mean anomaly at current position
        const M0 = PhysicsUtils.meanAnomalyFromTrueAnomaly(f0, e);
        const T = details.period;
        const n = 2 * Math.PI / T;
        // Time until mean anomaly wraps to 2π (periapsis)
        const dM = ((2 * Math.PI - M0) + 2 * Math.PI) % (2 * Math.PI);
        const dtSec = dM / n;
        return new Date(simNow.getTime() + dtSec * 1000);
    }, [satellite, timeUtils, nodes, selectedIndex, isAdding]);

    // Next apoapsis calculation: solve Kepler's equation for current orbit (fallback to half-period chain)
    const computeNextApoapsis = useCallback(() => {
        if ((selectedIndex != null || isAdding) && nodes.length > 0) {
            const baseNode = selectedIndex != null
                ? nodes[selectedIndex].node3D
                : nodes[nodes.length - 1].node3D;
            const baselineTime = baseNode.time;
            const halfPeriod = (baseNode.predictedOrbit?._orbitPeriod || 0) * 1000 / 2;
            return new Date(baselineTime.getTime() + halfPeriod);
        }
        const simNow = timeUtils.getSimulatedTime();
        const details = PhysicsUtils.calculateDetailedOrbitalElements(
            satellite.position,
            satellite.velocity,
            Constants.earthGravitationalParameter
        );
        const f0 = THREE.MathUtils.degToRad(details.trueAnomaly);
        const e = details.eccentricity;
        const M0 = PhysicsUtils.meanAnomalyFromTrueAnomaly(f0, e);
        const T = details.period;
        const n = 2 * Math.PI / T;
        const M_target = Math.PI;
        const dM = ((M_target - M0) + 2 * Math.PI) % (2 * Math.PI);
        const dtSec = dM / n;
        return new Date(simNow.getTime() + dtSec * 1000);
    }, [satellite, timeUtils, nodes, selectedIndex, isAdding]);

    // --- Hohmann manual burn time state and helpers ---
    const [manualBurnTime, setManualBurnTime] = useState(null);
    const findBestBurnTime = useCallback(() => {
        const simNow = timeUtils.getSimulatedTime();
        // Compute current orbital elements and anomalies
        const details = PhysicsUtils.calculateDetailedOrbitalElements(
            satellite.position,
            satellite.velocity,
            Constants.earthGravitationalParameter
        );
        const e = details.eccentricity;
        const f0 = THREE.MathUtils.degToRad(details.trueAnomaly);
        const M0 = PhysicsUtils.meanAnomalyFromTrueAnomaly(f0, e);
        // Use all classical elements for the target
        // Target true anomaly: periapsis (0) or user-specified ArgP
        let fTarget = 0; // default periapsis
        if (parseFloat(targetArgPDeg) !== 0) {
            fTarget = THREE.MathUtils.degToRad(targetArgPDeg);
        }
        // Solve for corresponding eccentric anomaly
        const sqrtTerm = Math.sqrt((1 - e) / (1 + e));
        const Et = 2 * Math.atan(sqrtTerm * Math.tan(fTarget / 2));
        const Mt = Et - e * Math.sin(Et);
        // Compute time until next Mt
        const T = details.period;
        const n = 2 * Math.PI / T;
        const dM = ((Mt - M0) + 2 * Math.PI) % (2 * Math.PI);
        const dt = dM / n;
        return new Date(simNow.getTime() + dt * 1000);
    }, [timeUtils, satellite, targetArgPDeg]);
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
        timeUtils,
        computeNextPeriapsis,
        computeNextApoapsis,
        isAdding,
        selectedIndex,
        nodes
    });

    // Now manualDetails should reference first preview node
    const manualDetails = useMemo(() => {
        const execTime = ManeuverUtils.computeExecutionTime(
            timeUtils.getSimulatedTime(),
            { timeMode, offsetSec, hours, minutes, seconds, milliseconds }
        );
        const dtSec = (execTime.getTime() - timeUtils.getSimulatedTime().getTime()) / 1000;
        const dv = ManeuverUtils.computeDeltaVMagnitude(
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

    // Generate Hohmann transfer nodes via ManeuverManager
    const generateHohmann = useCallback(() => {
        // Convert classical elements to periapsis/apoapsis altitudes
        const a_m = (parseFloat(targetSmaKm) || 0) * Constants.kmToMeters;
        const e_val = parseFloat(targetEcc) || 0;
        const r_pe = a_m * (1 - e_val);
        const r_ap = a_m * (1 + e_val);
        const ellPeriKm = ((r_pe - Constants.earthRadius) * Constants.metersToKm).toString();
        const ellApoKm = ((r_ap - Constants.earthRadius) * Constants.metersToKm).toString();
        // Compute full plane-change angle from current to target orbit (inclination + RAAN)
        const details = PhysicsUtils.calculateDetailedOrbitalElements(
            satellite.position,
            satellite.velocity,
            Constants.earthGravitationalParameter
        );
        const currentInc = details.inclination;
        const currentLAN = details.longitudeOfAscendingNode;
        const i1 = THREE.MathUtils.degToRad(currentInc);
        const lan1 = THREE.MathUtils.degToRad(currentLAN);
        const i2 = THREE.MathUtils.degToRad(parseFloat(targetIncDeg));
        const lan2 = THREE.MathUtils.degToRad(parseFloat(targetLANDeg));
        const h1 = new THREE.Vector3(
            Math.sin(lan1) * Math.sin(i1),
            -Math.cos(lan1) * Math.sin(i1),
            Math.cos(i1)
        );
        const h2 = new THREE.Vector3(
            Math.sin(lan2) * Math.sin(i2),
            -Math.cos(lan2) * Math.sin(i2),
            Math.cos(i2)
        );
        const dotH = THREE.MathUtils.clamp(h1.dot(h2), -1, 1);
        const planeChangeDeg = THREE.MathUtils.radToDeg(Math.acos(dotH));
        const summary = manager.generateHohmannTransfer({
            ellPeriKm,
            ellApoKm,
            targetIncDeg,
            targetLANDeg,
            targetArgPDeg,
            planeChangeDeg,
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

    // Sync currentSimTime via TimeUtils "timeUpdate" events
    useEffect(() => {
        const handler = e => setCurrentSimTime(new Date(e.detail.simulatedTime));
        document.addEventListener('timeUpdate', handler);
        return () => document.removeEventListener('timeUpdate', handler);
    }, [timeUtils]);

    // Refresh and rebuild node models on satellite change, updating 3D nodes in time order for nested orbits
    useEffect(() => {
        // Update all real node predicted orbits sequentially
        satellite.maneuverNodes
            .slice()
            .sort((a, b) => a.time.getTime() - b.time.getTime())
            .forEach(n3d => n3d.update());
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
            setHours(timeUtils.getSimulatedTime().getUTCHours()); setMinutes(timeUtils.getSimulatedTime().getUTCMinutes()); setSeconds(timeUtils.getSimulatedTime().getUTCSeconds()); setMilliseconds(timeUtils.getSimulatedTime().getUTCMilliseconds());
            setVx('0'); setVy('0'); setVz('0');
        }

        // Style predictedOrbit of selected node as preview (white), revert others to default style
        nodes.forEach((nodeModel, idx) => {
            const orbitLine = nodeModel.node3D.predictedOrbit.orbitLine;
            if (selectedIndex === idx) {
                orbitLine.material.color.set(0xffffff);
                orbitLine.material.opacity = 0.8;
                orbitLine.material.transparent = true;
            } else {
                orbitLine.material.color.set(nodeModel.node3D.satellite.color);
                orbitLine.material.opacity = 0.7;
                orbitLine.material.transparent = true;
            }
            if (orbitLine.material.needsUpdate !== undefined) {
                orbitLine.material.needsUpdate = true;
            }
        });
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
            const simNow = timeUtils.getSimulatedTime();
            execTime = ManeuverUtils.computeExecutionTime(simNow, { timeMode, offsetSec, hours, minutes, seconds, milliseconds });
        }
        // Delta-V vector
        const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
        // Replace existing node if editing
        if (selectedIndex != null) {
            const existing = nodes[selectedIndex].node3D;
            manager.deleteNode(existing);
        }
        // Add new maneuver node
        const newNode = manager.sat.addManeuverNode(execTime, dvLocal.clone());
        newNode.localDV = dvLocal.clone();
        newNode.update();
        // Keep nodes sorted
        manager.sat.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
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
        timeUtils,
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