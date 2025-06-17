import * as THREE from 'three';
import { objectPool } from '../utils/ObjectPool.js';

class SmartCamera {
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
        
        // Store the offset to maintain relative position when switching targets
        this.cameraOffset = offset.clone();
        this.offsetSpherical = this.spherical.clone();
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

    /** Update the stored camera offset when user manually adjusts the camera */
    updateStoredOffset() {
        const currentOffset = this.camera.position.clone().sub(this.controls.target);
        this.cameraOffset.copy(currentOffset);
        this.offsetSpherical.setFromVector3(currentOffset);
        
        // Update individual spherical properties for serialization
        this.sphericalRadius = this.offsetSpherical.radius;
        this.sphericalPhi = this.offsetSpherical.phi;
        this.sphericalTheta = this.offsetSpherical.theta;
    }

    /** Teleport camera and pivot to follow a new body, preserving current offset */
    updateCameraTarget(body) {
        // Store current offset before switching targets
        this.updateStoredOffset();
        
        this.followTarget = body;
        const bodyPos = this.getBodyPosition(body);
        
        // Use stored spherical offset for consistent distance/angle preservation
        const newCameraPos = objectPool.getVector3();
        newCameraPos.setFromSpherical(this.offsetSpherical);
        newCameraPos.add(bodyPos);
        
        // Update control target first, then camera position
        this.controls.target.copy(bodyPos);
        this.camera.position.copy(newCameraPos);
        
        // Update tracking position
        if (!this.lastBodyPos) {
            this.lastBodyPos = new THREE.Vector3();
        }
        this.lastBodyPos.copy(bodyPos);
        
        objectPool.releaseVector3(newCameraPos);
        
        // Update controls after setting positions to ensure they sync properly
        this.controls.update();
    }

    /** Clear any follow behavior (pan/orbit/zoom remains) */
    clearCameraTarget() {
        // Store current offset before clearing target
        this.updateStoredOffset();
        
        this.followTarget = null;
        this.lastBodyPos = null;
        // no-op: controls continue to work relative to current pivot
    }

    /** 
     * Set the camera offset using spherical coordinates
     * @param {number} radius - Distance from target
     * @param {number} phi - Polar angle (0 to π)
     * @param {number} theta - Azimuthal angle (0 to 2π)
     */
    setSphericalOffset(radius, phi, theta) {
        this.offsetSpherical.set(radius, phi, theta);
        this.sphericalRadius = radius;
        this.sphericalPhi = phi;
        this.sphericalTheta = theta;
        
        // Update cartesian offset
        this.cameraOffset.setFromSpherical(this.offsetSpherical);
        
        // Apply to current target if following
        if (this.followTarget) {
            const bodyPos = this.getBodyPosition(this.followTarget);
            const newCameraPos = objectPool.getVector3();
            newCameraPos.setFromSpherical(this.offsetSpherical);
            newCameraPos.add(bodyPos);
            
            this.camera.position.copy(newCameraPos);
            this.controls.target.copy(bodyPos);
            
            objectPool.releaseVector3(newCameraPos);
            this.controls.update();
        }
    }

    /**
     * Complete camera state management - get current state for serialization
     */
    getState() {
        return {
            position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
            target: { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z },
            spherical: { radius: this.sphericalRadius, phi: this.sphericalPhi, theta: this.sphericalTheta },
            followTarget: this.followTarget?.name || null
        };
    }

    /**
     * Complete camera state management - restore state from serialization
     */
    setState(state, app3d) {
        if (!state) return;
        
        // Set camera position and target directly
        if (state.target) {
            this.controls.target.set(state.target.x, state.target.y, state.target.z);
        }
        if (state.position) {
            this.camera.position.set(state.position.x, state.position.y, state.position.z);
        }
        
        // Restore spherical offset
        if (state.spherical) {
            this.sphericalRadius = state.spherical.radius;
            this.sphericalPhi = state.spherical.phi;
            this.sphericalTheta = state.spherical.theta;
            this.spherical.set(state.spherical.radius, state.spherical.phi, state.spherical.theta);
            this.offsetSpherical.copy(this.spherical);
        }
        
        this.controls.update();
        
        // Restore follow target if specified
        if (state.followTarget && app3d) {
            this.follow(state.followTarget, app3d, true);
        } else {
            this.clearCameraTarget();
        }
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
                    console.warn(`SmartCamera.follow: no body found for '${value}', falling back to '${fallback.name}'`);
                }
                target = fallback;
            }
        }
        if (target) {
            this.updateCameraTarget(target);
        } else {
            if (!suppressLog) {
                console.warn('SmartCamera.follow: no body found for', value);
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

export { SmartCamera };
