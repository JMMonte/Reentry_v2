import * as THREE from 'three';
import { Constants } from '../../utils/Constants';
import { ManeuverCalculator } from './ManeuverCalculator';
import { GroundTrack } from './GroundTrack';
import { ApsisVisualizer } from '../ApsisVisualizer';
import { PhysicsUtils } from '../../utils/PhysicsUtils';

interface SatelliteParams {
    scene: THREE.Scene;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    id: number;
    color: number | string;
    mass?: number;
    size?: number;
    app3d: App3D;
    name?: string;
}

interface App3D extends THREE.EventDispatcher {
    createDebugWindow?: (satellite: Satellite) => void;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
}

interface DisplaySettingEvent extends CustomEvent {
    detail: {
        key: 'showOrbits' | 'showTraces' | 'showGroundTraces' | 'showSatVectors';
        value: boolean;
    };
}

export class Satellite {
    private scene: THREE.Scene;
    public readonly id: number;
    public name?: string;
    private color: number | string;
    private mass: number;
    private size: number;
    private position: THREE.Vector3;
    private velocity: THREE.Vector3;
    private initialized: boolean;
    private updateBuffer: Array<any>;
    private landed: boolean;
    private maneuverNodes: Array<any>;
    private maneuverCalculator: ManeuverCalculator;
    private app3d: App3D;
    private baseScale: number;

    // Performance optimization counters
    private orbitUpdateCounter: number;
    private readonly orbitUpdateInterval: number;
    private groundTrackUpdateCounter: number;
    private readonly groundTrackUpdateInterval: number;
    private traceUpdateCounter: number;
    private readonly traceUpdateInterval: number;

    // THREE.js objects with definite assignment assertions
    private orientation!: THREE.Quaternion;
    private mesh!: THREE.Mesh;
    private velocityVector!: THREE.ArrowHelper;
    private orientationVector!: THREE.ArrowHelper;
    private traceLine!: THREE.Line;
    private tracePoints!: Array<THREE.Vector3>;
    private orbitLine?: THREE.Line;
    private groundTrack?: GroundTrack;
    private apsisVisualizer?: ApsisVisualizer & { visible?: boolean };

    constructor({
        scene,
        position,
        velocity,
        id,
        color,
        mass = 100,
        size = 1,
        app3d,
        name
    }: SatelliteParams) {
        this.scene = scene;
        this.id = id;
        this.name = name;
        this.color = color;
        this.mass = mass;
        this.size = size;
        this.position = position.clone();
        this.velocity = velocity.clone();
        this.initialized = false;
        this.updateBuffer = [];
        this.landed = false;
        this.maneuverNodes = [];
        this.maneuverCalculator = new ManeuverCalculator();
        this.app3d = app3d;
        this.baseScale = 4;

        // Initialize counters
        this.orbitUpdateCounter = 0;
        this.orbitUpdateInterval = 30;
        this.groundTrackUpdateCounter = 0;
        this.groundTrackUpdateInterval = 10;
        this.traceUpdateCounter = 0;
        this.traceUpdateInterval = 5;

        // Initialize orientation quaternion
        this.orientation = new THREE.Quaternion();
        if (velocity) {
            const upVector = new THREE.Vector3(0, 1, 0);
            const velocityDir = velocity.clone().normalize();
            this.orientation.setFromUnitVectors(upVector, velocityDir);
        }

        // Create debug window
        if (this.app3d.createDebugWindow) {
            this.app3d.createDebugWindow(this);
        }

        this.initializeVisuals();

        // Subscribe to display options changes
        this.app3d.addEventListener('displaySettingChanged', ((event: DisplaySettingEvent) => {
            const { key, value } = event.detail;
            switch (key) {
                case 'showOrbits':
                    if (this.orbitLine) this.orbitLine.visible = value;
                    if (this.apsisVisualizer) this.apsisVisualizer.visible = value;
                    break;
                case 'showTraces':
                    if (this.traceLine) this.traceLine.visible = value;
                    break;
                case 'showGroundTraces':
                    if (this.groundTrack) this.groundTrack.setVisible(value);
                    break;
                case 'showSatVectors':
                    if (this.velocityVector) this.velocityVector.visible = value;
                    if (this.orientationVector) this.orientationVector.visible = value;
                    break;
            }
        }) as EventListener);
    }

    private initializeVisuals(): void {
        // Satellite mesh - pyramid shape (cone with 3 segments)
        const geometry = new THREE.ConeGeometry(0.5, 2, 3);
        const material = new THREE.MeshBasicMaterial({ 
            color: this.color,
            side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(Constants.satelliteRadius);

        // Add to scene
        this.scene.add(this.mesh);
        
        // Add onBeforeRender callback to maintain relative size and orientation
        const targetSize = 0.005;
        this.mesh.onBeforeRender = (
            renderer: THREE.WebGLRenderer,
            scene: THREE.Scene,
            camera: THREE.Camera
        ): void => {
            // Only update scale and orientation if visible
            if (this.mesh.visible) {
                const distance = camera.position.distanceTo(this.mesh.position);
                const scale = distance * targetSize;
                this.mesh.scale.set(scale, scale, scale);
                
                // Update mesh orientation
                this.mesh.quaternion.copy(this.orientation);
                
                // Scale vectors with camera distance - only if they exist and are visible
                if (this.velocityVector && this.velocityVector.visible) {
                    this.velocityVector.setLength(scale * 20);
                }
                if (this.orientationVector && this.orientationVector.visible) {
                    this.orientationVector.setLength(scale * 20);
                }
            }
        };

        // Initialize vectors
        // Velocity vector (red)
        this.velocityVector = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            this.mesh.position,
            this.baseScale * 3,
            0xff0000
        );
        this.velocityVector.visible = false;
        this.scene.add(this.velocityVector);

        // Orientation vector (blue) - represents body frame z-axis
        const bodyZAxis = new THREE.Vector3(0, 1, 0);
        bodyZAxis.applyQuaternion(this.orientation);
        this.orientationVector = new THREE.ArrowHelper(
            bodyZAxis,
            this.mesh.position,
            this.baseScale * 3,
            0x0000ff
        );
        this.orientationVector.visible = false;
        this.scene.add(this.orientationVector);

        // Initialize trace line
        const traceGeometry = new THREE.BufferGeometry();
        const traceMaterial = new THREE.LineBasicMaterial({ 
            color: this.color,
            linewidth: 2,
            transparent: true,
            opacity: 0.5
        });
        this.traceLine = new THREE.Line(traceGeometry, traceMaterial);
        this.traceLine.frustumCulled = false;
        this.traceLine.visible = false;
        this.scene.add(this.traceLine);
        this.tracePoints = [];

        // Initialize orbit line
        const orbitGeometry = new THREE.BufferGeometry();
        const orbitMaterial = new THREE.LineBasicMaterial({ 
            color: this.color,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });
        this.orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        this.orbitLine.frustumCulled = false;
        this.orbitLine.visible = false;
        this.scene.add(this.orbitLine);
    }

    public updatePosition(position: THREE.Vector3, velocity: THREE.Vector3): void {
        this.position.copy(position);
        this.velocity.copy(velocity);
        this.mesh.position.copy(position);
        
        // Update orientation based on velocity
        const upVector = new THREE.Vector3(0, 1, 0);
        const velocityDir = velocity.clone().normalize();
        this.orientation.setFromUnitVectors(upVector, velocityDir);
        
        // Update vectors
        this.updateVectors();
        
        // Update trace line
        this.traceUpdateCounter++;
        if (this.traceUpdateCounter >= this.traceUpdateInterval) {
            this.traceUpdateCounter = 0;
            this.tracePoints.push(position.clone());
            if (this.tracePoints.length > 1000) {
                this.tracePoints.shift();
            }
            this.traceLine.geometry.setFromPoints(this.tracePoints);
        }
    }

    public updateOrbitLine(position: THREE.Vector3, velocity: THREE.Vector3): void {
        if (!this.orbitLine) return;

        const orbitPoints = PhysicsUtils.calculateOrbitalPosition(position, velocity);
        this.orbitLine.geometry.setFromPoints(orbitPoints);

        // Update apsis visualizer if it exists
        if (this.apsisVisualizer) {
            this.apsisVisualizer.update(position, velocity);
            // Set visibility through an optional property
            if (this.orbitLine.visible !== undefined) {
                this.apsisVisualizer.visible = this.orbitLine.visible;
            }
        }
    }

    public updateSatellite(currentTime: number, realDeltaTime: number, warpedDeltaTime: number): void {
        // Update orbit line periodically
        this.orbitUpdateCounter++;
        if (this.orbitUpdateCounter >= this.orbitUpdateInterval) {
            this.orbitUpdateCounter = 0;
            this.updateOrbitLine(this.position, this.velocity);
        }

        // Update ground track periodically
        if (this.groundTrack) {
            this.groundTrackUpdateCounter++;
            if (this.groundTrackUpdateCounter >= this.groundTrackUpdateInterval) {
                this.groundTrackUpdateCounter = 0;
                this.groundTrack.update(this.position);
            }
        }
    }

    public setVisible(visible: boolean): void {
        this.mesh.visible = visible;
        if (this.orbitLine) this.orbitLine.visible = visible;
        if (this.traceLine) this.traceLine.visible = visible;
        if (this.groundTrack) this.groundTrack.setVisible(visible);
        if (this.apsisVisualizer) this.apsisVisualizer.visible = visible;
        this.setVectorsVisible(visible);
    }

    public setVectorsVisible(visible: boolean): void {
        if (this.velocityVector) this.velocityVector.visible = visible;
        if (this.orientationVector) this.orientationVector.visible = visible;
    }

    public getSpeed(): number {
        return this.velocity.length();
    }

    public getRadialAltitude(): number {
        return this.position.length();
    }

    public getSurfaceAltitude(): number {
        return this.getRadialAltitude() - Constants.earthRadius;
    }

    public getOrbitalElements(): Record<string, number> {
        return PhysicsUtils.calculateOrbitalElements(this.position, this.velocity);
    }

    public dispose(): void {
        // Remove from scene
        this.scene.remove(this.mesh);
        this.scene.remove(this.velocityVector);
        this.scene.remove(this.orientationVector);
        this.scene.remove(this.traceLine);
        if (this.orbitLine) this.scene.remove(this.orbitLine);
        if (this.groundTrack) this.groundTrack.dispose();
        if (this.apsisVisualizer) this.apsisVisualizer.dispose();

        // Dispose geometries and materials
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.traceLine.geometry.dispose();
        (this.traceLine.material as THREE.Material).dispose();
        if (this.orbitLine) {
            this.orbitLine.geometry.dispose();
            (this.orbitLine.material as THREE.Material).dispose();
        }

        // Clear arrays
        this.tracePoints = [];
        this.updateBuffer = [];
        this.maneuverNodes = [];
    }

    private updateVectors(): void {
        // Update velocity vector
        const velocityDir = this.velocity.clone().normalize();
        this.velocityVector.position.copy(this.position);
        this.velocityVector.setDirection(velocityDir);

        // Update orientation vector
        const bodyZAxis = new THREE.Vector3(0, 1, 0);
        bodyZAxis.applyQuaternion(this.orientation);
        this.orientationVector.position.copy(this.position);
        this.orientationVector.setDirection(bodyZAxis);
    }
} 