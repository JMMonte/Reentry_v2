import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ManeuverNode } from '../../../components/Satellite/ManeuverNode.js';
import { ManeuverNodeModel } from '../../../models/ManeuverNodeModel.js';
import { Constants } from '../../../utils/Constants.js';

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

    // Hohmann transfer mode state
    const [maneuverMode, setManeuverMode] = useState('manual');
    // Target orbit shape: circular | elliptical | moon
    const [shapeType, setShapeType] = useState('circular');
    // Circular and elliptical orbit presets
    const presets = [
        { name: '200 km (LEO)', altitude: 200 },
        { name: '35786 km (GEO)', altitude: 35786 }
    ];
    const [selectedPreset, setSelectedPreset] = useState(presets[0].altitude);
    const [customRadiusKm, setCustomRadiusKm] = useState('');
    // Elliptical orbit presets
    const ellipticalPresets = [
        { name: 'GTO', periapsis: 250, apoapsis: 35786 },
        { name: 'Molniya', periapsis: 500, apoapsis: 40000 }
    ];
    const [selectedEllPreset, setSelectedEllPreset] = useState(ellipticalPresets[0]);
    // For elliptical shape: periapsis and apoapsis in km
    const [ellPeriKm, setEllPeriKm] = useState('');
    const [ellApoKm, setEllApoKm] = useState('');
    // Plane change angle in degrees
    const [planeChangeDeg, setPlaneChangeDeg] = useState('0');
    // State to hold Hohmann transfer summary details
    const [hohmannDetails, setHohmannDetails] = useState(null);

    // Generate Hohmann transfer nodes
    const generateHohmann = () => {
        // Clear any existing maneuver nodes before generating new transfer
        satellite.maneuverNodes.slice().forEach(node => satellite.removeManeuverNode(node));

        const simNow = satellite.app3d.timeUtils.getSimulatedTime();
        // Current radius in meters
        const r1 = satellite.position.length();
        let r_target_pe, r_target_ap;
        if (shapeType === 'moon') {
            // Target the Moon's actual position for TLI
            const jd = satellite.app3d.timeUtils.getJulianDate();
            const moonPos = satellite.app3d.moon.getMoonPosition(jd);
            const moonVec = new THREE.Vector3(moonPos.x, moonPos.y, moonPos.z);
            r_target_ap = moonVec.length();
            r_target_pe = r_target_ap;
        } else if (shapeType === 'circular') {
            // Use custom radius if provided, else preset radius
            const customAlt = parseFloat(customRadiusKm);
            r_target_ap = (!isNaN(customAlt) && customAlt > 0)
                ? customAlt * Constants.kmToMeters + Constants.earthRadius
                : presets.find(p => p.altitude === selectedPreset).altitude * Constants.kmToMeters + Constants.earthRadius;
            r_target_pe = r_target_ap;
        } else { // elliptical
            const peri = parseFloat(ellPeriKm) || 0;
            const apo = parseFloat(ellApoKm) || 0;
            r_target_pe = peri * Constants.kmToMeters + Constants.earthRadius;
            r_target_ap = apo * Constants.kmToMeters + Constants.earthRadius;
        }
        const mu = Constants.earthGravitationalParameter;
        // Velocities for circular orbit assumption at current
        const v1 = Math.sqrt(mu / r1);
        // Plane change delta-V
        const planeRad = (parseFloat(planeChangeDeg) || 0) * (Math.PI / 180);
        const dv_plane = 2 * v1 * Math.sin(planeRad / 2);
        // Transfer ellipse semi-major axis
        const aTrans = (r1 + r_target_ap) / 2;
        const vTrans1 = Math.sqrt(mu * (2 / r1 - 1 / aTrans));
        const dv1 = vTrans1 - v1;
        // Compute second burn delta-V only for non-lunar transfers
        let dv2 = 0;
        if (shapeType !== 'moon') {
            const aTarget = (r_target_pe + r_target_ap) / 2;
            const vTarget = Math.sqrt(mu * (2 / r_target_ap - 1 / aTarget));
            const vTrans2 = Math.sqrt(mu * (2 / r_target_ap - 1 / aTrans));
            dv2 = vTarget - vTrans2;
        }
        // Burn times: time to reach apogee of transfer ellipse
        const transferTime = Math.PI * Math.sqrt((aTrans ** 3) / mu);
        const time1 = new Date(simNow);
        const time2 = new Date(simNow.getTime() + transferTime * 1000);
        // Compute additional orbit metrics
        const altitude1Km = (r1 - Constants.earthRadius) * Constants.metersToKm;
        const altitudeTargetKm = (r_target_ap - Constants.earthRadius) * Constants.metersToKm;
        const aTransKm = aTrans * Constants.metersToKm;
        const eTrans = (r_target_ap - r1) / (r_target_ap + r1);
        // Compute final target orbit semi-major axis and period
        const aTarget = (r_target_pe + r_target_ap) / 2;
        const finalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(aTarget, 3) / mu);
        const aTargetKm = aTarget * Constants.metersToKm;
        // Time until burns in seconds
        const dt1Sec = (time1.getTime() - simNow.getTime()) / 1000;
        const dt2Sec = (time2.getTime() - simNow.getTime()) / 1000;
        // Prepare Hohmann transfer summary details
        const totalDv = Math.abs(dv1) + Math.abs(dv_plane) + (shapeType !== 'moon' ? Math.abs(dv2) : 0);
        setHohmannDetails({
            dv1, dv2, dv_plane, transferTime, time1, time2, totalDv,
            altitude1Km, altitudeTargetKm, aTransKm, eTrans, dt1Sec, dt2Sec, aTargetKm, finalPeriod
        });
        // Add first burn node
        if (Math.abs(dv1) > 1e-6 || Math.abs(dv_plane) > 1e-6) {
            const node1 = satellite.addManeuverNode(time1, new THREE.Vector3(dv1, 0, dv_plane));
            node1.localDV = new THREE.Vector3(dv1, 0, dv_plane);
            node1.update();
        }
        // Add second burn node only for non-lunar transfers
        if (shapeType !== 'moon' && Math.abs(dv2) > 1e-6) {
            const node2 = satellite.addManeuverNode(time2, new THREE.Vector3(dv2, 0, 0));
            node2.localDV = new THREE.Vector3(dv2, 0, 0);
            node2.update();
        }
        // Refresh UI list
        satellite.maneuverNodes.sort((a, b) => a.time.getTime() - b.time.getTime());
        setNodes(buildNodeModels());
    };

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

    // Create and dispose preview ManeuverNode only in manual mode
    useEffect(() => {
        if (maneuverMode !== 'manual') return;
        const initNode = new ManeuverNode({ satellite, time: new Date(simTime), deltaV: new THREE.Vector3() });
        previewNodeRef.current = initNode;
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
            initNode.dispose();
            previewNodeRef.current = null;
            delete satellite.app3d.previewNode;
        };
    }, [satellite, maneuverMode]);

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

    // Compute additional details for Moon TLI
    const computeMoonTransferDetails = () => {
        // placeholder for optimal plane change/time adjustment calculations
        console.log('Computing Moon TLI details...');
    };

    // Reset Hohmann summary when mode or shapeType changes
    useEffect(() => {
        setHohmannDetails(null);
    }, [maneuverMode, shapeType]);

    // Initialize elliptical parameters when elliptical preset is selected
    useEffect(() => {
        if (shapeType === 'elliptical') {
            setEllPeriKm(selectedEllPreset.periapsis);
            setEllApoKm(selectedEllPreset.apoapsis);
        }
    }, [selectedEllPreset, shapeType]);

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
        getCompositePath,
        // Hohmann transfer exports
        maneuverMode, setManeuverMode,
        shapeType, setShapeType,
        presets,
        selectedPreset, setSelectedPreset,
        customRadiusKm, setCustomRadiusKm,
        ellPeriKm, setEllPeriKm,
        ellApoKm, setEllApoKm,
        planeChangeDeg, setPlaneChangeDeg,
        generateHohmann,
        hohmannDetails,
        // Elliptical presets and compute function
        ellipticalPresets,
        selectedEllPreset, setSelectedEllPreset,
        computeMoonTransferDetails
    };
} 