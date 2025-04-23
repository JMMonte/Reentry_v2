import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ManeuverNode } from '../../../components/Satellite/ManeuverNode.js';
import { ManeuverNodeModel } from '../../../models/ManeuverNodeModel.js';

export function useManeuverWindow(satellite) {
    // Initial and current simulated time
    const simTime = satellite.app3d.timeUtils.getSimulatedTime();
    const [currentSimTime, setCurrentSimTime] = useState(simTime);

    // Execution time fields
    const [timeMode, setTimeMode] = useState('offset');
    const [offsetSec, setOffsetSec] = useState('0');
    const [hours, setHours] = useState(simTime.getUTCHours());
    const [minutes, setMinutes] = useState(simTime.getUTCMinutes());
    const [seconds, setSeconds] = useState(simTime.getUTCSeconds());
    const [milliseconds, setMilliseconds] = useState(simTime.getUTCMilliseconds());

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
    const [nodes, setNodes] = useState(() =>
        satellite.maneuverNodes
            .slice()
            .sort((a, b) => a.time.getTime() - b.time.getTime())
            .map(n => new ManeuverNodeModel(n, satellite, simTime))
    );
    const [selectedIndex, setSelectedIndex] = useState(null);
    const previewNodeRef = useRef(null);

    // Computed magnitude
    const dvMag = Math.hypot(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);

    // Helper to format time deltas
    const formatTimeDelta = (deltaMs) => {
        const sign = deltaMs < 0 ? '-' : '';
        let absMs = Math.abs(deltaMs);
        const totalSeconds = Math.floor(absMs / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Determine which orbit path to use at a node index (chained post-burn orbits)
    const getCompositePath = (idx) => {
        const sorted = satellite.maneuverNodes.slice().sort((a, b) => a.time.getTime() - b.time.getTime());
        return idx > 0 && sorted[idx - 1]?.predictedOrbit
            ? sorted[idx - 1].predictedOrbit
            : satellite.orbitPath;
    };

    // Helper to build UI models array sorted by maneuver time
    const buildNodeModels = () =>
        satellite.maneuverNodes
            .slice() // copy
            .sort((a, b) => a.time.getTime() - b.time.getTime())
            .map(n => new ManeuverNodeModel(n, satellite, currentSimTime));

    // Sync currentSimTime every second
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSimTime(satellite.app3d.timeUtils.getSimulatedTime());
        }, 1000);
        return () => clearInterval(interval);
    }, [satellite]);

    // Refresh and rebuild node models on satellite change, updating 3D nodes in time order for nested orbits
    useEffect(() => {
        // Update all real node predicted orbits sequentially
        satellite.maneuverNodes
            .slice()
            .sort((a, b) => a.time.getTime() - b.time.getTime())
            .forEach(n3d => n3d.update());
        // Rebuild UI models sorted by time
        setNodes(buildNodeModels());
        if (selectedIndex != null && selectedIndex >= satellite.maneuverNodes.length) {
            setSelectedIndex(null);
        }
    }, [satellite]);

    // NOTE: localDV for nested nodes computed per selection, so no bulk update here

    // Load execution time and local DV when selection changes
    useEffect(() => {
        if (selectedIndex != null && nodes[selectedIndex]) {
            const model = nodes[selectedIndex];
            setTimeMode('datetime');
            const t = model.time;
            setHours(t.getUTCHours()); setMinutes(t.getUTCMinutes()); setSeconds(t.getUTCSeconds()); setMilliseconds(t.getUTCMilliseconds());
            // Use stored localDV for editing
            const local = model.localDV || new THREE.Vector3();
            setVx(local.x.toFixed(2)); setVy(local.y.toFixed(2)); setVz(local.z.toFixed(2));
        } else {
            setTimeMode('offset'); setOffsetSec('0');
            setHours(simTime.getUTCHours()); setMinutes(simTime.getUTCMinutes()); setSeconds(simTime.getUTCSeconds()); setMilliseconds(simTime.getUTCMilliseconds());
            setVx('0'); setVy('0'); setVz('0');
        }
    }, [selectedIndex]);

    // Create and dispose preview ManeuverNode on satellite change
    useEffect(() => {
        const initNode = new ManeuverNode({ satellite, time: new Date(simTime), deltaV: new THREE.Vector3() });
        previewNodeRef.current = initNode;
        // Register preview node on App3D for central loop
        satellite.app3d.previewNode = initNode;
        // Style preview mesh, arrow, and orbit white
        const white = 0xffffff;
        initNode.mesh.material.color.set(white);
        initNode.mesh.material.opacity = 0.8;
        initNode.mesh.material.transparent = true;
        if (initNode.arrow.line) initNode.arrow.line.material.color.set(white);
        if (initNode.arrow.cone) initNode.arrow.cone.material.color.set(white);
        if (initNode.predictedOrbit.orbitLine.material) initNode.predictedOrbit.orbitLine.material.color.set(white);

        return () => {
            // Cleanup preview node
            initNode.dispose();
            previewNodeRef.current = null;
            delete satellite.app3d.previewNode;
        };
    }, [satellite]);

    // Sync preview node state when inputs change
    useEffect(() => {
        const node = previewNodeRef.current;
        if (!node) return;
        // Compute execution time
        const now = satellite.app3d.timeUtils.getSimulatedTime();
        let execTime;
        if (timeMode === 'offset') {
            execTime = new Date(now.getTime() + (parseFloat(offsetSec) || 0) * 1000);
        } else {
            execTime = new Date(now);
            execTime.setUTCHours(hours, minutes, seconds, milliseconds);
        }
        node.time = execTime;
        // Set local DV for preview
        node.localDV = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
    }, [timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz]);

    // Save or update a maneuver node
    const handleSave = () => {
        const simNow = satellite.app3d.timeUtils.getSimulatedTime();
        // Compute execution Date
        const executeTime = timeMode === 'offset'
            ? new Date(simNow.getTime() + (parseFloat(offsetSec) || 0) * 1000)
            : (() => { const d = new Date(simNow); d.setUTCHours(hours, minutes, seconds, milliseconds); return d; })();
        // Local DV vector from UI inputs
        const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
        // Remove old or create new
        if (selectedIndex != null) {
            const oldModel = nodes[selectedIndex];
            satellite.removeManeuverNode(oldModel.node3D);
        }
        const newNode3D = satellite.addManeuverNode(executeTime, dvLocal.clone());
        newNode3D.localDV = dvLocal.clone();
        newNode3D.update();
        // Sort and rebuild UI models
        satellite.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
        setNodes(buildNodeModels());
        setSelectedIndex(null);
    };

    const handleDelete = () => {
        if (selectedIndex != null) {
            const modelToDelete = nodes[selectedIndex];
            satellite.removeManeuverNode(modelToDelete.node3D);
            satellite.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
            setNodes(buildNodeModels());
            setSelectedIndex(null);
        }
    };

    return {
        currentSimTime,
        simTime,
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
        nodes, selectedIndex, setSelectedIndex,
        formatTimeDelta,
        handleSave, handleDelete,
        getCompositePath
    };
} 