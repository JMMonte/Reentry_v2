import * as THREE from 'three';

export class ConnectionManager {
    constructor(app) {
        this.app = app;
        this.lineOfSightWorker = null;
        this.connectionsGroup = new THREE.Group();
        this.enabled = false;
    }

    initialize() {
        // Add connections group to scene
        this.app.scene.add(this.connectionsGroup);
    }

    updateConnections() {
        if (this.enabled && this.lineOfSightWorker && Object.keys(this.app.satellites).length > 0) {
            this.lineOfSightWorker.postMessage({
                type: 'UPDATE_SATELLITES',
                satellites: Object.values(this.app.satellites).map(sat => ({
                    id: sat.id,
                    position: sat.position
                }))
            });
        }
    }

    updateConnectionVisuals(connections) {
        // Clear existing connections
        while (this.connectionsGroup.children.length > 0) {
            const line = this.connectionsGroup.children[0];
            line.geometry.dispose();
            line.material.dispose();
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

    setEnabled(enabled) {
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

    initWorker() {
        if (!this.lineOfSightWorker) {
            console.log('Initializing line of sight worker');
            this.lineOfSightWorker = new Worker(new URL('../workers/lineOfSightWorker.js', import.meta.url), { type: 'module' });
            this.lineOfSightWorker.onmessage = (e) => {
                if (e.data.type === 'CONNECTIONS_UPDATED') {
                    this.updateConnectionVisuals(e.data.connections);
                }
            };

            // Trigger initial connection update
            this.updateConnections();
        }
    }

    cleanup() {
        // Clean up worker
        if (this.lineOfSightWorker) {
            this.lineOfSightWorker.terminate();
            this.lineOfSightWorker = null;
        }

        // Clear existing connections
        while (this.connectionsGroup.children.length > 0) {
            const line = this.connectionsGroup.children[0];
            line.geometry.dispose();
            line.material.dispose();
            this.connectionsGroup.remove(line);
        }
    }

    dispose() {
        this.cleanup();
        if (this.connectionsGroup.parent) {
            this.connectionsGroup.parent.remove(this.connectionsGroup);
        }
    }
} 