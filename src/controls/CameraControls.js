import * as THREE from 'three';
import { objectPool } from '../utils/ObjectPool.js';

class CameraControls {
    constructor(camera, controls) {
        this.camera = camera;
        this.controls = controls;
        this.followTarget = null;
        this.lastBodyPos = null;
        // Initialize spherical coordinates for state serialization/restoration
        this.spherical = new THREE.Spherical();
        // Calculate initial spherical based on current camera position and controls target
        const offset = this.camera.position.clone().sub(this.controls.target);
        this.spherical.setFromVector3(offset);
        this.sphericalRadius = this.spherical.radius;
        this.sphericalPhi = this.spherical.phi;
        this.sphericalTheta = this.spherical.theta;
    }

    /** Called each frame to update controls (pan/orbit/zoom) */
    updateCameraPosition() {
        if (this.followTarget) {
            const newBodyPos = this.getBodyPosition(this.followTarget);
            if (this.lastBodyPos) {
                // Use pooled vector for delta calculation
                const delta = objectPool.getVector3();
                delta.copy(newBodyPos).sub(this.lastBodyPos);
                this.controls.target.add(delta);
                this.camera.position.add(delta);
                objectPool.releaseVector3(delta);
            }
            
            // Update lastBodyPos in place instead of cloning
            if (!this.lastBodyPos) {
                this.lastBodyPos = new THREE.Vector3();
            }
            this.lastBodyPos.copy(newBodyPos);
        }
        this.controls.update();
    }

    /** Teleport camera and pivot to follow a new body, preserving current offset */
    updateCameraTarget(body) {
        this.followTarget = body;
        const bodyPos = this.getBodyPosition(body);
        const camToPivot = this.camera.position.clone().sub(this.controls.target);
        this.controls.target.copy(bodyPos);
        this.camera.position.copy(bodyPos.clone().add(camToPivot));
        this.lastBodyPos = bodyPos.clone();
        this.controls.update();
    }

    /** Clear any follow behavior (pan/orbit/zoom remains) */
    clearCameraTarget() {
        this.followTarget = null;
        this.lastBodyPos = null;
        // no-op: controls continue to work relative to current pivot
    }

    /**
     * Follow a selection value or object directly.
     * @param {string|object} value - 'none', planet name, 'satellite-<id>', or object instance
     * @param {App3D} app3d - the App3D instance to lookup satellites
     * @param {boolean} [suppressLog] - If true, suppress warnings for missing bodies
     */
    follow(value, app3d, suppressLog = false) {
        if (!value || value === 'none') {
            this.clearCameraTarget();
            return;
        }
        let target = null;
        // Satellite selection: 'satellite-<id>'
        if (typeof value === 'string' && value.startsWith('satellite-')) {
            const id = parseInt(value.split('-')[1], 10);
            const sats = typeof app3d.satellites.getSatellites === 'function'
                ? app3d.satellites.getSatellites()
                : app3d.satellites;
            target = sats?.[id];
        } else if (typeof value === 'object' && value.id != null) {
            target = value; // direct satellite object
        } else {
            // Planet selection by name (case-sensitive first)
            target = app3d.celestialBodies?.find(p => p.name === value);
            // Fallback to case-insensitive match if not found
            if (!target && typeof value === 'string') {
                target = app3d.celestialBodies?.find(p => p.name?.toLowerCase() === value.toLowerCase());
            }
        }
        // Fallback to first *planet* if nothing matched
        if (!target) {
            const fallback = app3d.celestialBodies?.find(p => typeof p.getMesh === 'function'); // Find first actual planet
            if (fallback) {
                if (!suppressLog) {
                    console.warn(`CameraControls.follow: no body found for '${value}', falling back to '${fallback.name}'`);
                }
                target = fallback;
            }
        }
        if (target) {
            this.updateCameraTarget(target);
        } else {
            if (!suppressLog) {
                console.warn('CameraControls.follow: no body found for', value);
            }
        }
    }

    /** Get world position of a body mesh */
    getBodyPosition(body) {
        // Reuse a cached vector instead of creating new one every frame
        if (!this._bodyPosCache) {
            this._bodyPosCache = new THREE.Vector3();
        }
        const pos = this._bodyPosCache;
        
        if (body.getMesh) {
            const mesh = body.getMesh();
            if (mesh && typeof mesh.getWorldPosition === 'function') {
                mesh.getWorldPosition(pos);
                return pos;
            }
        }
        // Fallback for barycenters: use orbitGroup or orientationGroup
        if (body.orbitGroup && typeof body.orbitGroup.getWorldPosition === 'function') {
            body.orbitGroup.getWorldPosition(pos);
            return pos;
        }
        if (body.orientationGroup && typeof body.orientationGroup.getWorldPosition === 'function') {
            body.orientationGroup.getWorldPosition(pos);
            return pos;
        }
        // Fallback: if body itself is an Object3D
        if (typeof body.getWorldPosition === 'function') {
            body.getWorldPosition(pos);
            return pos;
        }
        return pos;
    }
}

export { CameraControls };
