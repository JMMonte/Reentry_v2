import * as THREE from 'three';
import { Manager } from '../types';

interface App3D {
    scene: THREE.Scene;
    satellites: {
        [key: string | number]: {
            id: string | number;
            position: THREE.Vector3;
        };
    };
}

interface SatelliteData {
    id: string | number;
    position: THREE.Vector3;
}

interface Connection {
    color: 'red' | 'green';
    points: [number, number, number][];
}

interface WorkerMessage {
    type: 'UPDATE_SATELLITES';
    satellites: SatelliteData[];
}

interface WorkerResponse {
    type: 'CONNECTIONS_UPDATED';
    connections: Connection[];
}

export class ConnectionManager implements Manager {
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

    public async initialize(): Promise<void> {
        // Add connections group to scene
        this.app.scene.add(this.connectionsGroup);
    }

    public updateConnections(): void {
        if (this.enabled && this.lineOfSightWorker && Object.keys(this.app.satellites).length > 0) {
            const message: WorkerMessage = {
                type: 'UPDATE_SATELLITES',
                satellites: Object.values(this.app.satellites).map(sat => ({
                    id: sat.id,
                    position: sat.position
                }))
            };
            this.lineOfSightWorker.postMessage(message);
        }
    }

    private updateConnectionVisuals(connections: Connection[]): void {
        // Clear existing connections
        while (this.connectionsGroup.children.length > 0) {
            const line = this.connectionsGroup.children[0];
            if (line instanceof THREE.Line) {
                line.geometry.dispose();
                line.material.dispose();
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
                // Force immediate update
                this.updateConnections();
            } else {
                this.cleanup();
            }
        }
    }

    private initWorker(): void {
        if (!this.lineOfSightWorker) {
            console.log('Initializing line of sight worker');
            this.lineOfSightWorker = new Worker(new URL('../workers/lineOfSightWorker.ts', import.meta.url), { type: 'module' });
            this.lineOfSightWorker.onmessage = (e: MessageEvent<WorkerResponse>) => {
                if (e.data.type === 'CONNECTIONS_UPDATED') {
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
                line.material.dispose();
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