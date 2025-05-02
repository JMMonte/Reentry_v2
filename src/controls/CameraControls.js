import * as THREE from 'three';

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
                const delta = newBodyPos.clone().sub(this.lastBodyPos);
                this.controls.target.add(delta);
                this.camera.position.add(delta);
            }
            this.lastBodyPos = newBodyPos.clone();
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
     */
    follow(value, app3d) {
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
            // Planet selection by name
            target = app3d.celestialBodies?.find(p => p.name === value);
        }
        // Fallback to first *planet* if nothing matched
        if (!target) {
            const fallback = app3d.celestialBodies?.find(p => typeof p.getMesh === 'function'); // Find first actual planet
            if (fallback) {
                console.warn(`CameraControls.follow: no body found for '${value}', falling back to '${fallback.name}'`);
                target = fallback;
            }
        }
        if (target) {
            this.updateCameraTarget(target);
        } else {
            console.warn('CameraControls.follow: no body found for', value);
        }
    }

    /** Get world position of a body mesh */
    getBodyPosition(body) {
        const pos = new THREE.Vector3();
        if (body.getMesh) {
            body.getMesh().getWorldPosition(pos);
        } else if (body.mesh) {
            body.mesh.getWorldPosition(pos);
        }
        return pos;
    }
}

export { CameraControls };
