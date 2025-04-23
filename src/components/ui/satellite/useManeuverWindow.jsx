import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ManeuverNode } from '../../../components/Satellite/ManeuverNode.js';
import { BasisCalculator } from '../../../utils/BasisCalculator.js';

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

    // Maneuver nodes and selection
    const [nodes, setNodes] = useState([...satellite.maneuverNodes]);
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

    // Determine which orbit path to use for a given node index
    const getCompositePath = (idx) => {
        if (idx > 0 && nodes[idx - 1]?.predictedOrbit) {
            return nodes[idx - 1].predictedOrbit;
        }
        return satellite.orbitPath;
    };

    // Sync currentSimTime every second
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSimTime(satellite.app3d.timeUtils.getSimulatedTime());
        }, 1000);
        return () => clearInterval(interval);
    }, [satellite]);

    // Refresh nodes list when satellite changes
    useEffect(() => {
        setNodes([...satellite.maneuverNodes]);
        if (selectedIndex != null && selectedIndex >= satellite.maneuverNodes.length) {
            setSelectedIndex(null);
        }
    }, [satellite]);

    // Load execution time and local DV when selection changes
    useEffect(() => {
        if (selectedIndex != null && nodes[selectedIndex]) {
            const node = nodes[selectedIndex];
            setTimeMode('datetime');
            const t = node.time;
            setHours(t.getUTCHours()); setMinutes(t.getUTCMinutes()); setSeconds(t.getUTCSeconds()); setMilliseconds(t.getUTCMilliseconds());
            if (node.localDV) {
                setVx(node.localDV.x.toFixed(2));
                setVy(node.localDV.y.toFixed(2));
                setVz(node.localDV.z.toFixed(2));
            } else {
                const path = getCompositePath(selectedIndex);
                const per = path._period || 0;
                const dvWorld = node.deltaV.clone();
                const dvLocal = BasisCalculator.computeLocal(
                    dvWorld,
                    path.orbitPoints,
                    per,
                    t,
                    satellite.app3d.timeUtils.getSimulatedTime()
                );
                setVx(dvLocal.x.toFixed(2));
                setVy(dvLocal.y.toFixed(2));
                setVz(dvLocal.z.toFixed(2));
            }
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
        // style preview white
        if (initNode.mesh && initNode.mesh.material) {
            initNode.mesh.material.color.set(0xffffff);
            initNode.mesh.material.opacity = 0.8;
            initNode.mesh.material.transparent = true;
        }
        if (initNode.arrow) {
            if (initNode.arrow.line) initNode.arrow.line.material.color.set(0xffffff);
            if (initNode.arrow.cone) initNode.arrow.cone.material.color.set(0xffffff);
        }
        return () => { initNode.dispose(); previewNodeRef.current = null; };
    }, [satellite]);

    // Live-update world DV for selected node when inputs change
    useEffect(() => {
        if (selectedIndex == null) return;
        const node = nodes[selectedIndex];
        if (!node) return;
        let execTime;
        if (timeMode === 'offset') {
            execTime = new Date(satellite.app3d.timeUtils.getSimulatedTime().getTime() + (parseFloat(offsetSec) || 0) * 1000);
        } else {
            execTime = new Date(satellite.app3d.timeUtils.getSimulatedTime());
            execTime.setUTCHours(hours, minutes, seconds, milliseconds);
        }
        const path = getCompositePath(selectedIndex);
        const pts = path.orbitPoints || [];
        let predInt2 = satellite.app3d.getDisplaySetting('orbitPredictionInterval');
        if (!predInt2 || predInt2 <= 0) predInt2 = 1;
        const per = (path._period || 0) / predInt2;
        const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
        let dvWorld = new THREE.Vector3();
        if (pts.length > 1 && per > 0) {
            const dt = (execTime.getTime() - simTime.getTime()) / 1000;
            const frac = ((dt / per) % 1 + 1) % 1;
            const idx = Math.floor(frac * pts.length);
            const pt = new THREE.Vector3(pts[idx].x, pts[idx].y, pts[idx].z);
            const nxt = new THREE.Vector3(pts[(idx + 1) % pts.length].x, pts[(idx + 1) % pts.length].y, pts[(idx + 1) % pts.length].z);
            const vHat = nxt.clone().sub(pt).normalize();
            const rHat = pt.clone().normalize();
            const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
            dvWorld.addScaledVector(vHat, dvLocal.x).addScaledVector(rHat, dvLocal.y).addScaledVector(hHat, dvLocal.z);
        } else {
            dvWorld.copy(dvLocal);
        }
        node.deltaV.copy(dvWorld);
        node.update();
    }, [timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, selectedIndex, nodes]);

    // Continuously update preview ManeuverNode
    useEffect(() => {
        let frameId;
        const loop = () => {
            const node = previewNodeRef.current;
            if (node) {
                const currentSim = satellite.app3d.timeUtils.getSimulatedTime();
                node.time = timeMode === 'offset'
                    ? new Date(currentSim.getTime() + (parseFloat(offsetSec) || 0) * 1000)
                    : (() => { const d = new Date(currentSim); d.setUTCHours(hours, minutes, seconds, milliseconds); return d; })();
                const previewIdx = selectedIndex != null ? selectedIndex : nodes.length;
                const path = getCompositePath(previewIdx);
                const per = path._period || 0;
                const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
                const dvWorld = BasisCalculator.computeWorld(dvLocal, path.orbitPoints, per, node.time, currentSim);
                node.deltaV.copy(dvWorld);
                node.update();
            }
            frameId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(frameId);
    }, [timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, satellite, nodes, selectedIndex]);

    // Hide all real nodes' predicted orbits while window open
    useEffect(() => {
        const show = satellite.app3d.getDisplaySetting('showOrbits');
        satellite.maneuverNodes.forEach(n => n.predictedOrbit.setVisible(false));
        return () => satellite.maneuverNodes.forEach(n => n.predictedOrbit.setVisible(show));
    }, [satellite]);

    // Show only selected node's predicted orbit
    useEffect(() => {
        satellite.maneuverNodes.forEach((n, i) => n.predictedOrbit.setVisible(i === selectedIndex));
    }, [selectedIndex, satellite]);

    // Hide preview path when editing real node
    useEffect(() => {
        const prev = previewNodeRef.current;
        if (prev && prev.predictedOrbit) prev.predictedOrbit.setVisible(selectedIndex == null);
    }, [selectedIndex]);

    // Save and Delete handlers
    const handleSave = () => {
        const simNow = satellite.app3d.timeUtils.getSimulatedTime();
        let executeTime;
        if (timeMode === 'offset') {
            executeTime = new Date(simNow.getTime() + (parseFloat(offsetSec) || 0) * 1000);
        } else {
            executeTime = new Date(simNow);
            executeTime.setUTCHours(hours, minutes, seconds, milliseconds);
        }
        const path = getCompositePath(selectedIndex != null ? selectedIndex : nodes.length);
        const per = path._period || 0;
        const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
        const finalDV = previewNodeRef.current ? previewNodeRef.current.deltaV.clone() : BasisCalculator.computeWorld(dvLocal, path.orbitPoints, per, executeTime, simNow);
        if (selectedIndex != null) {
            const old = nodes[selectedIndex];
            satellite.removeManeuverNode(old);
            const created = satellite.addManeuverNode(executeTime, finalDV);
            created.localDV = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
            created.update();
            setNodes(prev => { const arr = [...prev]; arr[selectedIndex] = created; return arr; });
        } else {
            const created = satellite.addManeuverNode(executeTime, finalDV);
            created.localDV = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
            created.update();
            setNodes(prev => [...prev, created]);
            setSelectedIndex(null);
        }
    };

    const handleDelete = () => {
        if (selectedIndex != null) {
            const node = nodes[selectedIndex];
            satellite.removeManeuverNode(node);
            setNodes(prev => prev.filter(n => n !== node));
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