import * as THREE from 'three';

export class ManeuverNodeModel {
    constructor(node3D, satellite) {
        this.node3D = node3D;
        this.satellite = satellite;
        this.time = node3D.time;
        this.worldDV = node3D.deltaV.clone();
        // Use stored localDV (set when saving) without recomputation
        this.localDV = node3D.localDV ? node3D.localDV.clone() : new THREE.Vector3();
        // Ensure node3D has localDV set
        node3D.localDV = this.localDV.clone();
    }

    updateLocal() {
        // Keep localDV as originally stored on node3D
        this.localDV.copy(this.node3D.localDV);
    }
} 