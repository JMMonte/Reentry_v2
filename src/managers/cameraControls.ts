import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface BodyWithMesh {
    getMesh?: () => THREE.Object3D;
    mesh?: THREE.Object3D;
}

export class CameraControls {
    private camera: THREE.PerspectiveCamera;
    private controls: OrbitControls;
    private followingBody: BodyWithMesh | null;
    private initialOffset: THREE.Vector3;
    private targetPosition: THREE.Vector3;
    private needsSmoothTransition: boolean;
    private spherical: THREE.Spherical;
    private sphericalRadius: number;
    private sphericalPhi: number;
    private sphericalTheta: number;

    constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
        this.camera = camera;
        this.controls = controls;
        this.followingBody = null;
        this.initialOffset = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3();
        this.needsSmoothTransition = false;
        this.spherical = new THREE.Spherical();
        this.sphericalRadius = 0;
        this.sphericalPhi = 0;
        this.sphericalTheta = 0;

        this.updateSphericalFromCamera();

        this.controls.enablePan = true;

        this.controls.addEventListener('change', () => {
            this.updateSphericalFromCamera();
        });
    }

    private updateSphericalFromCamera(): void {
        const offset = new THREE.Vector3();
        if (this.controls.target) {
            offset.copy(this.camera.position).sub(this.controls.target);
        }
        this.spherical.setFromVector3(offset);
        this.sphericalRadius = this.spherical.radius;
        this.sphericalPhi = this.spherical.phi;
        this.sphericalTheta = this.spherical.theta;
    }

    public updateCameraPosition(): void {
        if (this.followingBody) {
            const targetPosition = this.getBodyPosition(this.followingBody);
            if (targetPosition) {
                this.targetPosition.copy(targetPosition);

                if (this.needsSmoothTransition) {
                    const smoothFactor = 0.1; // Adjust this value for smoother transitions
                    this.controls.target.lerp(this.targetPosition, smoothFactor);

                    if (this.controls.target.distanceTo(this.targetPosition) < 0.01) {
                        this.controls.target.copy(this.targetPosition);
                        this.needsSmoothTransition = false;
                    }
                } else {
                    this.controls.target.copy(this.targetPosition);
                }

                this.spherical.set(this.sphericalRadius, this.sphericalPhi, this.sphericalTheta);
                const deltaPosition = new THREE.Vector3().setFromSpherical(this.spherical);
                this.camera.position.copy(this.controls.target).add(deltaPosition);
                this.controls.update();
            }
        } else {
            this.controls.update();
        }
    }

    public updateCameraTarget(body: BodyWithMesh): void {
        if (body) {
            this.followingBody = body;
            const targetPosition = this.getBodyPosition(body);
            if (targetPosition) {
                this.initialOffset.copy(this.camera.position).sub(this.controls.target);
                this.controls.target.copy(targetPosition);
                this.camera.position.copy(targetPosition).add(this.initialOffset);
                this.controls.update();
                this.targetPosition.copy(targetPosition);
                this.needsSmoothTransition = true;
                this.updateSphericalFromCamera();
            }
        }
    }

    public clearCameraTarget(): void {
        this.followingBody = null;
        this.controls.update();
    }

    public updateInitialOffset(): void {
        if (this.followingBody) {
            const targetPosition = this.getBodyPosition(this.followingBody);
            if (targetPosition) {
                this.initialOffset.copy(this.camera.position).sub(targetPosition);
            }
        }
    }

    private getBodyPosition(body: BodyWithMesh): THREE.Vector3 {
        if (body.getMesh) {
            return body.getMesh().position;
        } else if (body.mesh) {
            return body.mesh.position;
        } else {
            return new THREE.Vector3();
        }
    }

    public smoothTransition(): void {
        if (this.needsSmoothTransition && this.followingBody) {
            const currentPosition = new THREE.Vector3();
            currentPosition.copy(this.controls.target);
            const targetPosition = this.getBodyPosition(this.followingBody);

            if (targetPosition && !currentPosition.equals(targetPosition)) {
                const smoothFactor = 0.1;
                currentPosition.lerp(targetPosition, smoothFactor);
                this.controls.target.copy(currentPosition);

                const cameraTargetPosition = new THREE.Vector3();
                cameraTargetPosition.copy(currentPosition).add(this.initialOffset);
                this.camera.position.copy(cameraTargetPosition);

                this.controls.update();
            } else {
                this.needsSmoothTransition = false;
            }
        }
    }
} 