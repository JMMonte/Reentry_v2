// SatelliteVectors.js
// ──────────────────────────────────────────────────────────────────────────────
// Visualises velocity, gravity and attitude vectors for each satellite.
// Call `updateSatelliteVectors()` every animation frame (does its own
//  throttling).  Toggle drawing with `setVisible(flag)`.
// ──────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LabelFader } from './LabelFader.js';

export class SatelliteVectors {
    /** @param {Object} p */
    constructor({
        scene,
        timeUtils,
        satelliteManager,
        gravitySources = [],
        camera,
        app3d,
        /** tuneables (optional): */
        headLengthFactor = 0.20,
        headWidthFactor = 0.10,
        lengthFactor = 0.1,  // camera-distance multiplier for all arrows
        fadeStart = Infinity,
        fadeEnd = Infinity
    }) {
        if (!scene || !satelliteManager || !camera || !app3d) {
            throw new Error('SatelliteVectors: scene, satelliteManager, camera, and app3d are required');
        }

        // — publics —
        this.scene = scene;
        this.timeUtils = timeUtils;
        this.satelliteManager = satelliteManager;
        this.camera = camera;
        this.gravitySources = gravitySources;
        this.app3d = app3d;

        // — config —
        this.cfg = {
            headLengthFactor,
            headWidthFactor,
            lengthFactor
        };

        // — cache —
        /** @type {Map<number|string, Entry>} */
        this._entries = new Map();
        this._tmpDir = new THREE.Vector3();   // scratch to avoid churn
        this._tmpVec = new THREE.Vector3();
        this._tmpAcc = new THREE.Vector3();

        this._visible = true;
        this.labels = [];
        this.labelFader = new LabelFader(this.labels, fadeStart, fadeEnd);

        // Sync any satellites that already exist
        this.updateSatelliteVectors(true /*force*/);
    }

    // ────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ────────────────────────────────────────────────────────────────────────
    updateSatelliteVectors(force = false) {
        if (!this._visible && !force) return;
        const sats = this.satelliteManager.getSatellites() ?? {};
        const satsKeys = Object.keys(sats);
        // Add newcomers (convert key to proper id type)
        for (const idStr of satsKeys) {
            const id = isNaN(idStr) ? idStr : Number(idStr);
            if (!this._entries.has(id)) {
                this._add(sats[idStr]);
            }
        }
        // Remove satellites no longer present
        for (const key of Array.from(this._entries.keys())) {
            if (!satsKeys.includes(String(key))) {
                this._remove(key);
            }
        }
        // Update vectors for all remaining entries
        this._entries.forEach(e => this._updateEntry(e));
        if (this.labelFader) this.labelFader.update(this.camera);
    }

    setVisible(flag) {
        this._visible = flag;
        this._entries.forEach(entry => {
            Object.values(entry.arrows).forEach(obj => {
                if (obj.arrow) obj.arrow.visible = flag;
                if (obj.label) obj.label.visible = flag;
            });
        });
        // if toggled on, force immediate re-sync of vectors
        if (flag) this.updateSatelliteVectors(true);
    }

    // ────────────────────────────────────────────────────────────────────────
    // INTERNALS
    // ────────────────────────────────────────────────────────────────────────
    _add(sat) {
        const mesh = sat?.visualizer?.mesh;
        if (!mesh) return;
        const makeArrow = color => new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0, color);
        const arrows = {};
        // Velocity
        arrows.velocity = { arrow: makeArrow(0xff0000), label: this._makeLabel('v→', '#ff0000', new THREE.Vector3(0, 0, 0)) };
        // Orientation
        arrows.orientation = { arrow: makeArrow(0x0000ff), label: this._makeLabel('y→', '#0000ff', new THREE.Vector3(0, 0, 0)) };
        // Per-body gravity
        this.gravitySources.forEach((src) => {
            const key = `body_${src.name}`;
            arrows[key] = {
                arrow: makeArrow(0x00ff00),
                label: this._makeLabel((src.body.symbol || src.name || 'g') + '→', '#00ff00', new THREE.Vector3(0, 0, 0))
            };
        });
        // J2
        arrows.j2 = { arrow: makeArrow(0xff00ff), label: this._makeLabel('J2→', '#ff00ff', new THREE.Vector3(0, 0, 0)) };
        // Drag
        arrows.drag = { arrow: makeArrow(0x00ffff), label: this._makeLabel('Drag→', '#00ffff', new THREE.Vector3(0, 0, 0)) };
        // Total
        arrows.total = { arrow: makeArrow(0xffff00), label: this._makeLabel('Total→', '#ffff00', new THREE.Vector3(0, 0, 0)) };
        // Add all arrows and labels as children of the mesh
        Object.values(arrows).forEach(obj => {
            obj.arrow.position.set(0, 0, 0);
            obj.label.position.set(0, 0, 0);
            mesh.add(obj.arrow);
            mesh.add(obj.label);
            this.labels.push(obj.label);
        });
        this._entries.set(sat.id, { sat, arrows });
    }

    _remove(id) {
        const e = this._entries.get(id);
        if (!e) return;
        const mesh = e.sat?.visualizer?.mesh;
        Object.values(e.arrows).forEach(obj => {
            if (mesh) {
                mesh.remove(obj.arrow);
                mesh.remove(obj.label);
            }
            this.labels = this.labels.filter(l => l !== obj.label);
        });
        this._entries.delete(id);
    }

    _updateEntry({ sat, arrows }) {
        const mesh = sat.visualizer.mesh;
        // Ensure world matrix is up-to-date
        mesh.updateWorldMatrix(true, false);
        // Compute the inverse world matrix for transforming world directions to local
        const invWorldMatrix = mesh.matrixWorld.clone().invert();
        const camWorldPos = this.camera.position.clone();
        const meshWorldPos = new THREE.Vector3();
        mesh.getWorldPosition(meshWorldPos);
        const camDist = meshWorldPos.distanceTo(camWorldPos);
        // Compensate for mesh's world scale
        const meshWorldScale = new THREE.Vector3();
        mesh.getWorldScale(meshWorldScale);
        const avgScale = (meshWorldScale.x + meshWorldScale.y + meshWorldScale.z) / 3;
        const len = (camDist * this.cfg.lengthFactor) / (avgScale || 1);
        // Helper to set direction in local space
        const setArrow = (arrow, worldDir) => {
            const localDir = worldDir.clone().applyMatrix4(invWorldMatrix).normalize();
            arrow.setDirection(localDir);
            arrow.setLength(len, len * this.cfg.headLengthFactor, len * this.cfg.headWidthFactor);
        };
        const setLabel = (label, worldDir) => {
            const localDir = worldDir.clone().applyMatrix4(invWorldMatrix).normalize();
            label.position.copy(localDir.clone().multiplyScalar(len));
        };
        // Velocity (world velocity = planet-centric + central body velocity)
        let worldVel = null;
        try {
            const centralBodyId = sat.centralBodyNaifId;
            const bodies = this.app3d.physicsIntegration?.physicsEngine?.bodies;
            const cb = bodies?.[centralBodyId];
            if (cb && cb.velocity) {
                worldVel = this._tmpDir.copy(sat.velocity).add(cb.velocity).normalize();
            } else {
                worldVel = this._tmpDir.copy(sat.velocity).normalize();
            }
        } catch {
            worldVel = this._tmpDir.copy(sat.velocity).normalize();
        }
        setArrow(arrows.velocity.arrow, worldVel);
        setLabel(arrows.velocity.label, worldVel);
        // Orientation (use mesh's actual world +Y direction)
        const meshWorldPos2 = new THREE.Vector3();
        mesh.getWorldPosition(meshWorldPos2);
        const meshWorldTip = mesh.localToWorld(new THREE.Vector3(0, 1, 0));
        const orientDir = meshWorldTip.sub(meshWorldPos2).normalize();
        setArrow(arrows.orientation.arrow, orientDir);
        setLabel(arrows.orientation.label, orientDir);
        // Per-body gravity
        if (sat.a_bodies) {
            Object.entries(sat.a_bodies).forEach(([bodyId, vec]) => {
                const key = `body_${bodyId}`;
                if (arrows[key]) {
                    const dir = this._tmpAcc.set(vec[0], vec[1], vec[2]).normalize();
                    setArrow(arrows[key].arrow, dir);
                    setLabel(arrows[key].label, dir);
                }
            });
        }
        // J2
        if (sat.a_j2 && arrows.j2) {
            const dir = this._tmpAcc.set(sat.a_j2[0], sat.a_j2[1], sat.a_j2[2]).normalize();
            setArrow(arrows.j2.arrow, dir);
            setLabel(arrows.j2.label, dir);
        }
        // Drag
        if (sat.a_drag && arrows.drag) {
            const dir = this._tmpAcc.set(sat.a_drag[0], sat.a_drag[1], sat.a_drag[2]).normalize();
            setArrow(arrows.drag.arrow, dir);
            setLabel(arrows.drag.label, dir);
        }
        // Total
        if (sat.a_total && arrows.total) {
            const dir = this._tmpAcc.set(sat.a_total[0], sat.a_total[1], sat.a_total[2]).normalize();
            setArrow(arrows.total.arrow, dir);
            setLabel(arrows.total.label, dir);
        }
    }

    _makeLabel(text, color, pos) {
        const div = document.createElement('div');
        div.className = 'vector-label';
        div.textContent = text;
        div.style.color = color;
        div.style.fontSize = '12px';
        const label = new CSS2DObject(div);
        label.position.copy(pos);
        return label;
    }
}

/**
 * @typedef {{
 *   sat:      any,
 *   arrows:   {
 *     velocity: { arrow: THREE.ArrowHelper, label: CSS2DObject },
 *     orientation: { arrow: THREE.ArrowHelper, label: CSS2DObject },
 *     body_${bodyName}: { arrow: THREE.ArrowHelper, label: CSS2DObject },
 *     j2: { arrow: THREE.ArrowHelper, label: CSS2DObject },
 *     drag: { arrow: THREE.ArrowHelper, label: CSS2DObject },
 *     total: { arrow: THREE.ArrowHelper, label: CSS2DObject }
 *   }
 * }} Entry
 */
