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
        /** tuneables (optional): */
        headLengthFactor = 0.20,
        headWidthFactor = 0.10,
        lengthFactor = 0.1,  // camera-distance multiplier for all arrows
        updateHz = 60,        // throttling frequency
        fadeStart = Infinity,
        fadeEnd = Infinity
    }) {
        if (!scene || !satelliteManager || !camera) {
            throw new Error('SatelliteVectors: scene, satelliteManager and camera are required');
        }

        // — publics —
        this.scene = scene;
        this.timeUtils = timeUtils;
        this.satelliteManager = satelliteManager;
        this.camera = camera;
        this.gravitySources = gravitySources;

        // — config —
        this.cfg = {
            headLengthFactor,
            headWidthFactor,
            lengthFactor
        };
        this._msPerUpdate = 1000 / updateHz;
        this._lastUpdateMS = 0;

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
        const now = performance.now();
        if (!force && now - this._lastUpdateMS < this._msPerUpdate) return;
        this._lastUpdateMS = now;

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
        this._entries.forEach(({ vel, orient, grav, velLabel, orientLabel, gravLabels }) => {
            // hide/show arrows
            vel.visible = orient.visible = flag;
            grav.forEach(g => g.visible = flag);
            // hide/show labels (CSS2D objects)
            if (velLabel) velLabel.visible = flag;
            if (orientLabel) orientLabel.visible = flag;
            gravLabels?.forEach(l => (l.visible = flag));
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

        const makeArrow = color =>
            new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), mesh.position, 0, color);

        const vel = makeArrow(0xff0000);
        const orient = makeArrow(0x0000ff);
        const grav = this.gravitySources.map(() => makeArrow(0x00ff00));

        this.scene.add(vel, orient, ...grav);
        // create labels for vectors
        const velDiv = document.createElement('div');
        velDiv.className = 'vector-label';
        velDiv.textContent = 'v→';
        velDiv.style.color = '#ff0000';
        velDiv.style.fontSize = '12px';
        const velLabel = new CSS2DObject(velDiv);
        velLabel.position.copy(mesh.position);

        const orientDiv = document.createElement('div');
        orientDiv.className = 'vector-label';
        orientDiv.textContent = 'y→';
        orientDiv.style.color = '#0000ff';
        orientDiv.style.fontSize = '12px';
        const orientLabel = new CSS2DObject(orientDiv);
        orientLabel.position.copy(mesh.position);

        const gravLabels = this.gravitySources.map(src => {
            // use symbol from body, default 'g'
            const symbol = src.body.symbol || 'g';
            const div = document.createElement('div');
            div.className = 'vector-label';
            div.textContent = symbol + '→';
            div.style.color = '#00ff00';
            div.style.fontSize = '12px';
            const label = new CSS2DObject(div);
            label.position.copy(mesh.position);
            return label;
        });

        this.scene.add(velLabel, orientLabel, ...gravLabels);
        this.labels.push(velLabel, orientLabel, ...gravLabels);
        this._entries.set(sat.id, { sat, vel, orient, grav, velLabel, orientLabel, gravLabels });
    }

    _remove(id) {
        const e = this._entries.get(id);
        if (!e) return;
        this.scene.remove(e.vel, e.orient, ...e.grav, e.velLabel, e.orientLabel, ...e.gravLabels);
        // remove labels from fade list
        this.labels = this.labels.filter(l => l !== e.velLabel && l !== e.orientLabel && !e.gravLabels.includes(l));
        this._entries.delete(id);
    }

    _updateEntry({ sat, vel, orient, grav, velLabel, orientLabel, gravLabels }) {
        const pos = sat.visualizer.mesh.position;
        const camDist = pos.distanceTo(this.camera.position);
        const len = camDist * this.cfg.lengthFactor;

        // velocity arrow
        vel.visible = true;
        // use normalized velocity from debug if provided, else compute
        let velDirVec;
        if (sat.debug?.velDir) {
            velDirVec = this._tmpDir.set(
                sat.debug.velDir.x, sat.debug.velDir.y, sat.debug.velDir.z
            );
        } else {
            velDirVec = this._tmpDir.copy(sat.velocity).normalize();
        }
        this._updateArrow(vel, velDirVec, pos, camDist);
        velLabel.visible = true;
        velLabel.position.copy(pos).add(velDirVec.clone().multiplyScalar(len));

        // orientation arrow (body Y-axis)
        orient.visible = true;
        const orientDir = this._tmpVec.set(0, 1, 0)
            .applyQuaternion(sat.orientation)
            .normalize();
        this._updateArrow(orient, orientDir, pos, camDist);
        orientLabel.visible = true;
        orientLabel.position.copy(pos).add(orientDir.clone().multiplyScalar(len));

        // gravity arrows
        grav.forEach((gArrow, i) => {
            const src = this.gravitySources[i];
            const accDir = sat.debug?.perturbation?.accDir?.[src?.name];
            const accRaw = sat.debug?.perturbation?.acc?.[src?.name];
            if (!src?.mesh || (!accRaw && !accDir)) {
                gArrow.visible = false;
                gravLabels[i].visible = false;
                return;
            }
            gArrow.visible = true;
            // use precomputed unit direction if available
            const dir = accDir
                ? this._tmpAcc.set(accDir.x, accDir.y, accDir.z)
                : this._tmpAcc.set(accRaw.x, accRaw.y, accRaw.z).normalize();
            this._updateArrow(gArrow, dir, pos, camDist);
            const label = gravLabels[i];
            label.visible = true;
            label.position.copy(pos).add(dir.clone().multiplyScalar(len));
        });
    }

    /** Common arrow update: constant length & head relative to camera distance. */
    _updateArrow(arrow, dir, pos, camDist) {
        const len = camDist * this.cfg.lengthFactor;
        const { headLengthFactor: h, headWidthFactor: w } = this.cfg;
        arrow.position.copy(pos);
        arrow.setDirection(dir);
        arrow.setLength(len, len * h, len * w);
    }
}

/**
 * @typedef {{
 *   sat:      any,
 *   vel:      THREE.ArrowHelper,
 *   orient:   THREE.ArrowHelper,
 *   grav:     THREE.ArrowHelper[]
 * }} Entry
 */
