import * as THREE from 'three';
import type { App3D, Satellite, CelestialBody } from '../types';

interface ConnectionPoint {
    id: string;
    position: THREE.Vector3;
}

interface Connection {
    points: [number, number, number][];
    color: 'red' | 'green';
}

interface WorkerMessage {
    type: string;
    satellites?: ConnectionPoint[];
    connections?: Connection[];
}

export class ConnectionManager {
    private app: App3D;
    private lineOfSightWorker: Worker | null;
    private connectionsGroup: THREE.Group;
    private enabled: boolean;

    constructor(app: App3D) {
        this.app = app;
        this.lineOfSightWorker = null;
        this.connectionsGroup = new THREE.Group();
        this.enabled = false;
    }

    public initialize(): void {
        // Add connections group to scene
        this.app.scene.add(this.connectionsGroup);
    }

    private getSceneObjects(): ConnectionPoint[] {
        const objects: ConnectionPoint[] = [];

        // Get all satellites
        if (this.app.satellites) {
            Object.values(this.app.satellites).forEach(sat => {
                objects.push({
                    id: sat.id,
                    position: sat.position
                });
            });
        }

        // Get all celestial bodies from the scene
        this.app.scene.traverse((object: THREE.Object3D) => {
            const celestialBody = object as unknown as CelestialBody;
            if (celestialBody.name && celestialBody.position && celestialBody.mass) {
                objects.push({
                    id: celestialBody.name,
                    position: celestialBody.position
                });
            }
        });

        return objects;
    }

    public updateConnections(): void {
        if (this.enabled && this.lineOfSightWorker) {
            const objects = this.getSceneObjects();
            if (objects.length > 0) {
                this.lineOfSightWorker.postMessage({
                    type: 'UPDATE_SATELLITES',
                    satellites: objects
                });
            }
        }
    }

    private updateConnectionVisuals(connections: Connection[]): void {
        // Clear existing connections
        while (this.connectionsGroup.children.length > 0) {
            const line = this.connectionsGroup.children[0];
            if (line instanceof THREE.Line) {
                line.geometry.dispose();
                (line.material as THREE.Material).dispose();
            }
            this.connectionsGroup.remove(line);
        }

        // Create new connections if enabled
        if (this.enabled) {
            connections.forEach(conn => {
                const material = new THREE.LineBasicMaterial({ 
                    color: conn.color === 'red' ? 0xff0000 : 0x00ff00,
                    opacity: conn.color === 'red' ? 0.8 : 0.5, // Make red lines more visible
                    transparent: true 
                });
                
                const geometry = new THREE.BufferGeometry();
                const vertices = new Float32Array(conn.points.flat());
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                
                const line = new THREE.Line(geometry, material);
                this.connectionsGroup.add(line);
            });
        }
    }

    public setEnabled(enabled: boolean): void {
        if (this.enabled !== enabled) {
            this.enabled = enabled;
            
            if (enabled) {
                this.initWorker();
            } else {
                this.cleanup();
            }
        }
    }

    private initWorker(): void {
        if (!this.lineOfSightWorker) {
            console.log('Initializing line of sight worker');
            this.lineOfSightWorker = new Worker(
                new URL('../workers/lineOfSightWorker.js', import.meta.url),
                { type: 'module' }
            );

            this.lineOfSightWorker.onmessage = (e: MessageEvent<WorkerMessage>) => {
                if (e.data.type === 'CONNECTIONS_UPDATED' && e.data.connections) {
                    this.updateConnectionVisuals(e.data.connections);
                }
            };

            // Trigger initial connection update
            this.updateConnections();
        }
    }

    private cleanup(): void {
        // Clean up worker
        if (this.lineOfSightWorker) {
            this.lineOfSightWorker.terminate();
            this.lineOfSightWorker = null;
        }

        // Clear existing connections
        while (this.connectionsGroup.children.length > 0) {
            const line = this.connectionsGroup.children[0];
            if (line instanceof THREE.Line) {
                line.geometry.dispose();
                (line.material as THREE.Material).dispose();
            }
            this.connectionsGroup.remove(line);
        }
    }

    public dispose(): void {
        this.cleanup();
        if (this.connectionsGroup.parent) {
            this.connectionsGroup.parent.remove(this.connectionsGroup);
        }
    }
} 