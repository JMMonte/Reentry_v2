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
        // Per-body gravity (dynamically created based on physics engine data)
        // We'll create these dynamically in _updateEntry based on actual physics data
        // This ensures we only show vectors for bodies that actually affect the satellite
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
            // Properly dispose of Three.js objects to prevent memory leaks
            if (obj.arrow) {
                obj.arrow.line?.geometry?.dispose();
                obj.arrow.line?.material?.dispose();
                obj.arrow.cone?.geometry?.dispose();
                obj.arrow.cone?.material?.dispose();
            }
            if (obj.label?.element) {
                obj.label.element.remove();
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
        const setArrow = (arrow, worldDir, scaleFactor = 1) => {
            if (!worldDir || worldDir.length() === 0) {
                arrow.visible = false;
                return;
            }
            arrow.visible = true;
            const localDir = worldDir.clone().applyMatrix4(invWorldMatrix).normalize();
            arrow.setDirection(localDir);
            const adjustedLen = len * scaleFactor;
            arrow.setLength(adjustedLen, adjustedLen * this.cfg.headLengthFactor, adjustedLen * this.cfg.headWidthFactor);
        };
        
        const setLabel = (label, worldDir, scaleFactor = 1) => {
            if (!worldDir || worldDir.length() === 0) {
                label.visible = false;
                return;
            }
            label.visible = true;
            const localDir = worldDir.clone().applyMatrix4(invWorldMatrix).normalize();
            label.position.copy(localDir.clone().multiplyScalar(len * scaleFactor));
        };

        // Get physics state from PhysicsEngine (single source of truth)
        const physicsState = this.app3d.physicsIntegration?.physicsEngine?.getSimulationState();
        const satPhysicsData = physicsState?.satellites?.[sat.id];
        
        if (!satPhysicsData) {
            // Hide all vectors if no physics data available
            Object.values(arrows).forEach(({ arrow, label }) => {
                arrow.visible = false;
                label.visible = false;
            });
            return;
        }

        // === VELOCITY VECTOR ===
        // Convert from physics engine coordinate system (planet-centric km/s) to world coordinates
        let worldVelocity = null;
        if (satPhysicsData.velocity && Array.isArray(satPhysicsData.velocity)) {
            const satVel = new THREE.Vector3(...satPhysicsData.velocity);
            // Get central body velocity to compute absolute velocity
            const centralBodyId = satPhysicsData.centralBodyNaifId || sat.centralBodyNaifId;
            const centralBody = physicsState?.bodies?.[centralBodyId];
            
            if (centralBody?.velocity && Array.isArray(centralBody.velocity)) {
                const cbVel = new THREE.Vector3(...centralBody.velocity);
                worldVelocity = satVel.clone().add(cbVel);
            } else {
                worldVelocity = satVel.clone();
            }
            
            // Scale velocity vector for better visibility (velocity is typically much larger than acceleration)
            const velMagnitude = worldVelocity.length();
            if (velMagnitude > 0) {
                worldVelocity.normalize();
                setArrow(arrows.velocity.arrow, worldVelocity, 1.2); // Slightly longer for visibility
                setLabel(arrows.velocity.label, worldVelocity, 1.2);
            }
        }

        // === ORIENTATION VECTOR ===
        // Use satellite mesh's actual world +Y direction (pointing direction)
        const meshWorldPos2 = new THREE.Vector3();
        mesh.getWorldPosition(meshWorldPos2);
        const meshWorldTip = mesh.localToWorld(new THREE.Vector3(0, 1, 0));
        const orientDir = meshWorldTip.sub(meshWorldPos2).normalize();
        setArrow(arrows.orientation.arrow, orientDir);
        setLabel(arrows.orientation.label, orientDir);

        // === GRAVITATIONAL ACCELERATION VECTORS ===
        // Per-body gravity vectors from physics engine (dynamically create as needed)
        if (satPhysicsData.a_bodies && typeof satPhysicsData.a_bodies === 'object') {
            Object.entries(satPhysicsData.a_bodies).forEach(([bodyId, accArray]) => {
                const bodyName = this._getBodyNameFromId(bodyId, physicsState);
                const key = `body_${bodyName}`;
                
                // Create arrow if it doesn't exist
                if (!arrows[key] && Array.isArray(accArray) && accArray.length === 3) {
                    const accVec = new THREE.Vector3(...accArray);
                    if (accVec.length() > 1e-10) { // Only create if there's meaningful acceleration
                        const makeArrow = color => new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0, color);
                        arrows[key] = {
                            arrow: makeArrow(0x00ff00),
                            label: this._makeLabel(`${bodyName}→`, '#00ff00', new THREE.Vector3(0, 0, 0))
                        };
                        // Add to mesh
                        arrows[key].arrow.position.set(0, 0, 0);
                        arrows[key].label.position.set(0, 0, 0);
                        mesh.add(arrows[key].arrow);
                        mesh.add(arrows[key].label);
                        this.labels.push(arrows[key].label);
                    }
                }
                
                // Update existing arrow
                if (arrows[key] && Array.isArray(accArray) && accArray.length === 3) {
                    const accVec = new THREE.Vector3(...accArray);
                    if (accVec.length() > 1e-10) {
                        setArrow(arrows[key].arrow, accVec.normalize(), 0.8);
                        setLabel(arrows[key].label, accVec.normalize(), 0.8);
                    } else {
                        arrows[key].arrow.visible = false;
                        arrows[key].label.visible = false;
                    }
                }
            });
        }

        // === J2 PERTURBATION VECTOR ===
        if (satPhysicsData.a_j2 && Array.isArray(satPhysicsData.a_j2) && arrows.j2) {
            const j2Vec = new THREE.Vector3(...satPhysicsData.a_j2);
            if (j2Vec.length() > 0) {
                setArrow(arrows.j2.arrow, j2Vec.normalize(), 0.6);
                setLabel(arrows.j2.label, j2Vec.normalize(), 0.6);
            } else {
                arrows.j2.arrow.visible = false;
                arrows.j2.label.visible = false;
            }
        }

        // === ATMOSPHERIC DRAG VECTOR ===
        if (satPhysicsData.a_drag && Array.isArray(satPhysicsData.a_drag) && arrows.drag) {
            const dragVec = new THREE.Vector3(...satPhysicsData.a_drag);
            if (dragVec.length() > 0) {
                setArrow(arrows.drag.arrow, dragVec.normalize(), 0.6);
                setLabel(arrows.drag.label, dragVec.normalize(), 0.6);
            } else {
                arrows.drag.arrow.visible = false;
                arrows.drag.label.visible = false;
            }
        }

        // === TOTAL ACCELERATION VECTOR ===
        if (satPhysicsData.a_total && Array.isArray(satPhysicsData.a_total) && arrows.total) {
            const totalVec = new THREE.Vector3(...satPhysicsData.a_total);
            if (totalVec.length() > 0) {
                setArrow(arrows.total.arrow, totalVec.normalize(), 1.0);
                setLabel(arrows.total.label, totalVec.normalize(), 1.0);
            } else {
                arrows.total.arrow.visible = false;
                arrows.total.label.visible = false;
            }
        }
    }

    /**
     * Get human-readable body name from NAIF ID
     */
    _getBodyNameFromId(naifId, physicsState) {
        const body = physicsState?.bodies?.[naifId];
        if (body?.name) {
            return body.name;
        }
        // Fallback to common NAIF IDs
        const naifNames = {
            10: 'Sun', 199: 'Mercury', 299: 'Venus', 399: 'Earth', 
            499: 'Mars', 599: 'Jupiter', 699: 'Saturn', 799: 'Uranus', 899: 'Neptune'
        };
        return naifNames[naifId] || naifId.toString();
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
