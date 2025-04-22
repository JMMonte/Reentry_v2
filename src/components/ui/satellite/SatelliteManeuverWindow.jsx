import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import PropTypes from 'prop-types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';
import { Input } from '../input';
import { Slider } from '../slider';
import { Plus } from 'lucide-react';
import { ManeuverNode } from '../../Satellite/ManeuverNode.js';

export function SatelliteManeuverWindow({ satellite, onClose }) {
    const simTime = satellite.app3d.timeUtils.getSimulatedTime();
    const [timeMode, setTimeMode] = useState('offset');
    const [offsetSec, setOffsetSec] = useState('0');
    const [hours, setHours] = useState(simTime.getUTCHours());
    const [minutes, setMinutes] = useState(simTime.getUTCMinutes());
    const [seconds, setSeconds] = useState(simTime.getUTCSeconds());
    const [milliseconds, setMilliseconds] = useState(simTime.getUTCMilliseconds());
    const [vx, setVx] = useState('0');
    const [vy, setVy] = useState('0');
    const [vz, setVz] = useState('0');
    // compute total delta-v magnitude
    const dvMag = Math.hypot(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
    const [nodes, setNodes] = useState([...satellite.maneuverNodes]);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const previewNodeRef = useRef(null);
    // multiplier step for each axis
    const [multP, setMultP] = useState('1');
    const [multA, setMultA] = useState('1');
    const [multN, setMultN] = useState('1');
    // multiplier step for time offset
    const [multOffset, setMultOffset] = useState('1');
    // multipliers for datetime fields
    const [multH, setMultH] = useState('1');
    const [multMin, setMultMin] = useState('1');
    const [multSVal, setMultSVal] = useState('1');
    const [multMsVal, setMultMsVal] = useState('1');

    const [currentSimTime, setCurrentSimTime] = useState(simTime);
    useEffect(() => {
        const interval = setInterval(() => setCurrentSimTime(satellite.app3d.timeUtils.getSimulatedTime()), 1000);
        return () => clearInterval(interval);
    }, [satellite]);

    const formatTimeDelta = (deltaMs) => {
        const sign = deltaMs < 0 ? '-' : '';
        let absMs = Math.abs(deltaMs);
        const totalSeconds = Math.floor(absMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    useEffect(() => {
        setNodes([...satellite.maneuverNodes]);
        if (selectedIndex !== null) {
            if (selectedIndex >= satellite.maneuverNodes.length) setSelectedIndex(null);
        }
    }, [satellite]);

    useEffect(() => {
        if (selectedIndex !== null && nodes[selectedIndex]) {
            const node = nodes[selectedIndex];
            setTimeMode('datetime');
            const t = node.time;
            setHours(t.getUTCHours()); setMinutes(t.getUTCMinutes()); setSeconds(t.getUTCSeconds()); setMilliseconds(t.getUTCMilliseconds());
            // Compute local basis-projected deltaV for editing
            {
                const dvWorld = node.deltaV.clone();
                const pts = satellite.orbitPath.orbitPoints || [];    
                const per = satellite.getOrbitalElements()?.period;
                let dvLocal;
                if (pts.length > 1 && per) {
                    const nowSim = satellite.app3d.timeUtils.getSimulatedTime();
                    const dt = (t.getTime() - nowSim.getTime()) / 1000;
                    let frac = dt / per;
                    frac = ((frac % 1) + 1) % 1;
                    const idx = Math.floor(frac * pts.length);
                    const ptObj = pts[idx];
                    const nextObj = pts[(idx + 1) % pts.length];
                    if (ptObj && nextObj) {
                        const ptVec = new THREE.Vector3(ptObj.x, ptObj.y, ptObj.z);
                        const nextVec = new THREE.Vector3(nextObj.x, nextObj.y, nextObj.z);
                        const vHat = nextVec.clone().sub(ptVec).normalize();
                        const rHat = ptVec.clone().normalize();
                        const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
                        dvLocal = new THREE.Vector3(
                            dvWorld.dot(vHat),
                            dvWorld.dot(rHat),
                            dvWorld.dot(hHat)
                        );
                    }
                }
                if (!dvLocal) {
                    dvLocal = dvWorld.clone();
                }
                // Quantize local ΔV to two decimal places to reduce floating noise
                const decimals = 2;
                const rvx = parseFloat(dvLocal.x.toFixed(decimals));
                const rvy = parseFloat(dvLocal.y.toFixed(decimals));
                const rvz = parseFloat(dvLocal.z.toFixed(decimals));
                setVx(rvx.toString());
                setVy(rvy.toString());
                setVz(rvz.toString());
            }
        } else {
            setTimeMode('offset'); setOffsetSec('0');
            setHours(simTime.getUTCHours()); setMinutes(simTime.getUTCMinutes()); setSeconds(simTime.getUTCSeconds()); setMilliseconds(simTime.getUTCMilliseconds());
            setVx('0'); setVy('0'); setVz('0');
        }
    }, [selectedIndex]);

    // Create a ManeuverNode instance for preview on mount/unmount
    useEffect(() => {
        const initTime = new Date(simTime);
        const initDV = new THREE.Vector3(0, 0, 0);
        const node = new ManeuverNode({ satellite, time: initTime, deltaV: initDV });
        previewNodeRef.current = node;
        // make preview node white
        if (node.mesh && node.mesh.material) {
            node.mesh.material.color.set(0xffffff);
            node.mesh.material.transparent = true;
            node.mesh.material.opacity = 0.8;
        }
        if (node.arrow) {
            // arrowHelper children: line and cone
            if (node.arrow.line && node.arrow.line.material) node.arrow.line.material.color.set(0xffffff);
            if (node.arrow.cone && node.arrow.cone.material) node.arrow.cone.material.color.set(0xffffff);
        }
        return () => { node.dispose(); previewNodeRef.current = null; };
    }, [satellite]);

    // Live-update selected maneuver node object when fields change
    useEffect(() => {
        if (selectedIndex === null) return;
        const node = nodes[selectedIndex];
        if (!node) return;
        // compute execution time based on mode
        let execTime;
        if (timeMode === 'offset') {
            const off = parseFloat(offsetSec) || 0;
            execTime = new Date(satellite.app3d.timeUtils.getSimulatedTime().getTime() + off * 1000);
        } else {
            execTime = new Date(satellite.app3d.timeUtils.getSimulatedTime());
            execTime.setUTCHours(hours, minutes, seconds, milliseconds);
        }
        // set node properties and update its visual
        node.time = execTime;
        // convert local prograde deltaV to world-space at maneuver execution time
        const dvLocal = new THREE.Vector3(
            parseFloat(vx) || 0,
            parseFloat(vy) || 0,
            parseFloat(vz) || 0
        );
        let deltaV = new THREE.Vector3();
        const pts = satellite.orbitPath.orbitPoints;
        const per = satellite.getOrbitalElements()?.period;
        if (pts && pts.length > 1 && per) {
            const dt = (execTime.getTime() - simTime.getTime()) / 1000;
            let frac = dt / per;
            frac = ((frac % 1) + 1) % 1;
            const idx = Math.floor(frac * pts.length);
            const ptObj = pts[idx];
            const nextObj = pts[(idx + 1) % pts.length];
            if (ptObj && nextObj) {
                const ptVec = new THREE.Vector3(ptObj.x, ptObj.y, ptObj.z);
                const nextVec = new THREE.Vector3(nextObj.x, nextObj.y, nextObj.z);
                const vHat = nextVec.clone().sub(ptVec).normalize();
                const rHat = ptVec.clone().normalize();
                const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
                deltaV.addScaledVector(vHat, dvLocal.x)
                    .addScaledVector(rHat, dvLocal.y)
                    .addScaledVector(hHat, dvLocal.z);
            } else {
                deltaV.copy(dvLocal);
            }
        } else {
            deltaV.copy(dvLocal);
        }
        node.deltaV.copy(deltaV);
        node.update();
    }, [timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, selectedIndex, nodes]);

    // Continuously update the preview ManeuverNode
    useEffect(() => {
        let frameId;
        const update = () => {
            const node = previewNodeRef.current;
            if (node) {
                const currentSim = satellite.app3d.timeUtils.getSimulatedTime();
                const execTime = timeMode === 'offset'
                    ? new Date(currentSim.getTime() + (parseFloat(offsetSec) || 0) * 1000)
                    : (() => { const d = new Date(currentSim); d.setUTCHours(hours, minutes, seconds, milliseconds); return d; })();
                node.time = execTime;
                // convert raw orbitPoints to Vector3 array
                const rawPts = satellite.orbitPath.orbitPoints || [];
                const pts = rawPts.map(p => new THREE.Vector3(p.x, p.y, p.z));
                const el = satellite.getOrbitalElements();
                const per = el?.period;
                const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
                const dvWorld = new THREE.Vector3();
                if (pts && pts.length > 0 && per) {
                    const dt = (execTime.getTime() - currentSim.getTime()) / 1000;
                    let frac = dt / per;
                    frac = ((frac % 1) + 1) % 1;
                    const idx = Math.floor(frac * pts.length);
                    if (pts.length > 1) {
                        const ptVec = pts[idx];
                        const nextVec = pts[(idx + 1) % pts.length];
                        const vHat = nextVec.clone().sub(ptVec).normalize();
                        const rHat = ptVec.clone().normalize();
                        const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
                        dvWorld.addScaledVector(vHat, dvLocal.x);
                        dvWorld.addScaledVector(rHat, dvLocal.y);
                        dvWorld.addScaledVector(hHat, dvLocal.z);
                    }
                } else {
                    dvWorld.copy(dvLocal);
                }
                node.deltaV.copy(dvWorld);
                node.update();
            }
            frameId = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frameId);
    }, [timeMode, offsetSec, hours, minutes, seconds, milliseconds, vx, vy, vz, satellite]);

    const handleSave = () => {
        // grab fresh simulated time to avoid stale state
        const simNow = satellite.app3d.timeUtils.getSimulatedTime();
        let executeTime;
        if (timeMode === 'offset') {
            const offset = parseFloat(offsetSec) || 0;
            executeTime = new Date(simNow.getTime() + offset * 1000);
        } else {
            executeTime = new Date(simNow);
            executeTime.setUTCHours(hours, minutes, seconds, milliseconds);
        }
        // convert raw orbitPoints to Vector3 for basis calculation
        const rawPts = satellite.orbitPath.orbitPoints || [];
        const pts = rawPts.map(p => new THREE.Vector3(p.x, p.y, p.z));
        // compute local prograde basis at maneuver time from orbit path
        const dvLocal = new THREE.Vector3(parseFloat(vx) || 0, parseFloat(vy) || 0, parseFloat(vz) || 0);
        let deltaV;
        const elData = satellite.getOrbitalElements();
        const per = elData?.period;
        if (pts && pts.length > 0 && per) {
            const dt = (executeTime.getTime() - simNow.getTime()) / 1000;
            let frac = dt / per;
            frac = ((frac % 1) + 1) % 1;
            const idx = Math.floor(frac * pts.length);
            const ptObj = pts[idx];
            if (ptObj) {
                const ptVec = new THREE.Vector3(ptObj.x, ptObj.y, ptObj.z);
                const nextObj = pts[(idx + 1) % pts.length];
                const nextVec = new THREE.Vector3(nextObj.x, nextObj.y, nextObj.z);
                const vHat = nextVec.clone().sub(ptVec).normalize();
                const rHat = ptVec.clone().normalize();
                const hHat = new THREE.Vector3().crossVectors(rHat, vHat).normalize();
                deltaV = new THREE.Vector3()
                    .addScaledVector(vHat, dvLocal.x)
                    .addScaledVector(rHat, dvLocal.y)
                    .addScaledVector(hHat, dvLocal.z);
            }
        }
        if (!deltaV) deltaV = dvLocal;
        if (selectedIndex !== null) {
            const old = nodes[selectedIndex];
            satellite.removeManeuverNode(old);
            const newNode = satellite.addManeuverNode(executeTime, deltaV);
            setNodes((prev) => {
                const arr = [...prev]; arr[selectedIndex] = newNode; return arr;
            });
        } else {
            const newNode = satellite.addManeuverNode(executeTime, deltaV);
            setNodes((prev) => [...prev, newNode]);
        }
        setSelectedIndex(null);
    };

    const handleDelete = () => {
        if (selectedIndex !== null) {
            const node = nodes[selectedIndex];
            satellite.removeManeuverNode(node);
            setNodes((prev) => prev.filter((n) => n !== node));
            setSelectedIndex(null);
        }
    };

    return (
        <DraggableModal className="text-[10px]"
            title={`Maneuvers — ${satellite.name || `Satellite ${satellite.id}`}`}
            isOpen={true}
            onClose={onClose}
            defaultPosition={{ x: 20, y: 80 }}
            resizable={true}
            defaultWidth={500}
            defaultHeight={400}
            minWidth={350}
            minHeight={200}
        >
            <div className="flex h-full">
                <div className="w-1/3 border-r p-2 overflow-auto">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold">Nodes</span>
                        <Button size="icon" variant="ghost" onClick={() => setSelectedIndex(null)} title="New Node">
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                    {nodes.length === 0 && <div className="text-xs text-muted-foreground">No maneuvers</div>}
                    {nodes.map((node, i) => (
                        <div key={i}
                            className={`p-1 mb-1 text-xs cursor-pointer rounded ${selectedIndex === i ? 'bg-accent/30' : 'hover:bg-accent/10'}`}
                            onClick={() => setSelectedIndex(i)}
                        >
                            <div>{node.time.toISOString()}</div>
                            <div>ΔV: {node.deltaV.x.toFixed(1)},{node.deltaV.y.toFixed(1)},{node.deltaV.z.toFixed(1)}</div>
                            <div className="text-[10px] text-muted-foreground">
                                In: {formatTimeDelta(node.time.getTime() - currentSimTime.getTime())}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="w-2/3 p-2">
                    <div className="mb-2">
                        <div className="text-[10px] font-semibold mb-1">Execution Time</div>
                        <Tabs value={timeMode} onValueChange={setTimeMode}>
                            <div className="flex items-center space-x-2 mb-1 text-[10px] text-muted-foreground">
                                <span>Mode:</span>
                                <TabsList className="space-x-1">
                                    <TabsTrigger value="offset">Offset (s)</TabsTrigger>
                                    <TabsTrigger value="datetime">Date/Time</TabsTrigger>
                                </TabsList>
                            </div>
                            <TabsContent value="offset">
                                <div className="flex items-center space-x-1">
                                    <Button size="icon" variant="outline" onClick={() => setOffsetSec(String((parseFloat(offsetSec) || 0) - (parseFloat(multOffset) || 0)))}>-</Button>
                                    <Input type="number" value={offsetSec} onChange={(e) => setOffsetSec(e.target.value)} className="w-20" />
                                    <Button size="icon" variant="outline" onClick={() => setOffsetSec(String((parseFloat(offsetSec) || 0) + (parseFloat(multOffset) || 0)))}>+</Button>
                                    <Input type="number" value={multOffset} onChange={(e) => setMultOffset(e.target.value)} className="w-12" />
                                    <span className="text-[10px]">s</span>
                                </div>
                                <div className="text-[10px] mt-1">
                                    Executes at: {new Date(simTime.getTime() + (parseFloat(offsetSec) || 0) * 1000).toISOString()}
                                </div>
                            </TabsContent>
                            <TabsContent value="datetime">
                                <div className="space-y-1">
                                    {[
                                        {label: 'HH', val: hours, setter: setHours, mult: multH, setMult: setMultH, min: 0, max: 23},
                                        {label: 'MM', val: minutes, setter: setMinutes, mult: multMin, setMult: setMultMin, min: 0, max: 59},
                                        {label: 'SS', val: seconds, setter: setSeconds, mult: multSVal, setMult: setMultSVal, min: 0, max: 59},
                                        {label: 'MS', val: milliseconds, setter: setMilliseconds, mult: multMsVal, setMult: setMultMsVal, min: 0, max: 999},
                                    ].map(({label, val, setter, mult, setMult, min, max}) => (
                                        <div key={label} className="flex items-center space-x-3 text-[10px]">
                                            <span>{label}</span>
                                            <Button size="icon" variant="outline" onClick={() => { const n=(parseInt(val)||0)-(parseInt(mult)||0); setter(Math.max(min, Math.min(max, n))); }}>-</Button>
                                            <Input
                                                type="number"
                                                value={String(val).padStart(label==='MS'?3:2, '0')}
                                                onChange={(e) => { let n=parseInt(e.target.value)||0; n=Math.max(min, Math.min(max, n)); setter(n); }}
                                                className="w-[5ch]"
                                                min={min}
                                                max={max}
                                            />
                                            <Button size="icon" variant="outline" onClick={() => { const n=(parseInt(val)||0)+(parseInt(mult)||0); setter(Math.max(min, Math.min(max, n))); }}>+</Button>
                                            <Input type="number" value={mult} onChange={(e) => setMult(e.target.value)} className="w-16" />
                                        </div>
                                    ))}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold mb-1">Delta-V (m/s)</div>
                        {['Prograde', 'Antiradial', 'Normal'].map((axis, idx) => {
                            const val = idx === 0 ? vx : idx === 1 ? vy : vz;
                            const setter = idx === 0 ? setVx : idx === 1 ? setVy : setVz;
                            const mult = idx === 0 ? multP : idx === 1 ? multA : multN;
                            const setMult = idx === 0 ? setMultP : idx === 1 ? setMultA : setMultN;
                            return (
                                <div key={axis} className="mb-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">{axis}</span>
                                        <div className="flex items-center space-x-1">
                                            <Button size="icon" variant="outline" onClick={() => setter(String((parseFloat(val) || 0) - (parseFloat(mult) || 0)))}>-</Button>
                                            <Input
                                                type="number"
                                                value={val}
                                                onChange={(e) => setter(e.target.value)}
                                                className="w-16"
                                            />
                                            <Button size="icon" variant="outline" onClick={() => setter(String((parseFloat(val) || 0) + (parseFloat(mult) || 0)))}>+</Button>
                                            <Input
                                                type="number"
                                                value={mult}
                                                onChange={(e) => setMult(e.target.value)}
                                                className="w-12 ml-2"
                                            />
                                        </div>
                                    </div>
                                    <Slider
                                        value={[parseFloat(val) || 0]}
                                        onValueChange={([v]) => setter(String(v))}
                                        min={-1000}
                                        max={1000}
                                        step={1}
                                        className="mt-1"
                                    />
                                </div>
                            );
                        })}
                        {/* show total delta-v magnitude */}
                        <div className="text-[10px] font-semibold mt-1">|ΔV|: {dvMag.toFixed(1)} m/s</div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-2">
                        {selectedIndex !== null && (
                            <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                        )}
                        <Button size="sm" onClick={handleSave}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
                        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                    </div>
                </div>
            </div>
        </DraggableModal>
    );
}

SatelliteManeuverWindow.propTypes = {
    satellite: PropTypes.object.isRequired,
    onClose: PropTypes.func
}; 