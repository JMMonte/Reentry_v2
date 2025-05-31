/**
 * GhostPlanetManager.js
 * 
 * Manages ghost planet visualization for SOI transitions
 */
import * as THREE from 'three';

export class GhostPlanetManager {
    constructor(app) {
        this.app = app;
        this.ghostPlanets = new Map(); // satelliteId -> Map<key, ghost>
    }

    /**
     * Find SOI transitions in orbit points
     */
    findSOITransitions(points) {
        const transitions = [];
        let lastBodyId = null;
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (lastBodyId !== null && point.centralBodyId !== lastBodyId) {
                // Found a transition
                transitions.push({
                    index: i,
                    time: point.time,
                    fromBody: lastBodyId,
                    toBody: point.centralBodyId,
                    position: point.position,
                    velocity: point.velocity,
                    centralBodyPosition: point.centralBodyPosition,
                    // Target body position might be included if this came from a worker transition
                    targetBodyPosition: point.targetBodyPosition
                });
            }
            lastBodyId = point.centralBodyId;
        }
        
        return transitions;
    }
    
    /**
     * Create or update ghost planets for SOI transitions
     */
    updateGhostPlanets(satelliteId, transitions, points) {
        let satelliteGhosts = this.ghostPlanets.get(satelliteId);
        if (!satelliteGhosts) {
            satelliteGhosts = new Map();
            this.ghostPlanets.set(satelliteId, satelliteGhosts);
        }
        
        // Remove old ghost planets not in current transitions
        const currentTransitionKeys = new Set(transitions.map(t => `${t.fromBody}_${t.toBody}_${t.time}`));
        for (const [key, ghost] of satelliteGhosts) {
            if (!currentTransitionKeys.has(key)) {
                // Remove ghost planet
                if (ghost.group) {
                    this.app.scene.remove(ghost.group);
                    this._disposeGhostGroup(ghost.group);
                }
                satelliteGhosts.delete(key);
            }
        }
        
        // Create new ghost planets for transitions
        for (const transition of transitions) {
            const key = `${transition.fromBody}_${transition.toBody}_${transition.time}`;
            
            if (!satelliteGhosts.has(key)) {
                const ghostData = this._createGhostPlanet(transition);
                if (ghostData) {
                    satelliteGhosts.set(key, ghostData);
                }
            }
        }
        
        // Update label orientations to face camera
        for (const [key, ghost] of satelliteGhosts) {
            if (ghost.labelMesh && this.app.camera) {
                ghost.labelMesh.lookAt(this.app.camera.position);
            }
        }
    }

    /**
     * Create ghost planet visualization
     */
    _createGhostPlanet(transition) {
        // Create ghost planet visualization
        const targetPlanet = this.app.celestialBodies?.find(b => b.naifId === parseInt(transition.toBody));
        if (!targetPlanet) {
            console.warn(`[GhostPlanetManager] Target body ${transition.toBody} not found for ghost planet`);
            return null;
        }
        
        // Get the physics body to access orbital data
        const targetPhysicsBody = this.app.physicsIntegration?.physicsEngine?.bodies[transition.toBody];
        if (!targetPhysicsBody) {
            console.warn(`[GhostPlanetManager] Physics body ${transition.toBody} not found for ghost planet`);
            return null;
        }
        
        // Use the target body position calculated by the worker during propagation
        // This is the exact position of the planet at the moment of SOI transition
        let futurePosition = transition.targetBodyPosition || transition.centralBodyPosition;
        
        // Create a semi-transparent copy of the planet at the future position
        const ghostGroup = new THREE.Group();
        ghostGroup.name = `ghost_${targetPlanet.name}_${transition.time}`;
        
        // Create ghost sphere
        const radius = targetPlanet.radius || 1000; // km
        const geometry = new THREE.SphereGeometry(radius, 32, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.2,
            transparent: true,
            wireframe: true
        });
        
        const ghostMesh = new THREE.Mesh(geometry, material);
        ghostGroup.add(ghostMesh);
        
        // Add SOI sphere
        if (targetPlanet.soiRadius) {
            const soiGeometry = new THREE.SphereGeometry(targetPlanet.soiRadius, 16, 8);
            const soiMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                opacity: 0.1,
                transparent: true,
                wireframe: true
            });
            const soiMesh = new THREE.Mesh(soiGeometry, soiMaterial);
            ghostGroup.add(soiMesh);
        }
        
        // Add label to show time until SOI entry
        const labelMesh = this._createGhostLabel(targetPlanet, transition, radius);
        if (labelMesh) {
            ghostGroup.add(labelMesh);
        }
        
        // Position at the future position
        if (futurePosition) {
            ghostGroup.position.set(
                futurePosition[0],
                futurePosition[1],
                futurePosition[2]
            );
        }
        
        this.app.scene.add(ghostGroup);
        
        return {
            group: ghostGroup,
            transition: transition,
            planet: targetPlanet,
            labelMesh: labelMesh
        };
    }

    /**
     * Create label for ghost planet
     */
    _createGhostLabel(targetPlanet, transition, radius) {
        const timeToSOI = transition.time; // seconds
        const hoursToSOI = (timeToSOI / 3600).toFixed(1);
        
        const labelGeometry = new THREE.PlaneGeometry(radius * 2, radius * 0.5);
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 128;
        
        const ctx = labelCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, 512, 128);
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${targetPlanet.name} in ${hoursToSOI}h`, 256, 64);
        
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.position.y = radius * 1.5;
        
        if (this.app.camera) {
            labelMesh.lookAt(this.app.camera.position);
        }
        
        return labelMesh;
    }

    /**
     * Remove ghost planets for a satellite
     */
    removeGhostPlanets(satelliteId) {
        const ghosts = this.ghostPlanets.get(satelliteId);
        if (ghosts) {
            for (const [key, ghost] of ghosts) {
                if (ghost.group) {
                    this.app.scene.remove(ghost.group);
                    this._disposeGhostGroup(ghost.group);
                }
            }
            this.ghostPlanets.delete(satelliteId);
        }
    }

    /**
     * Dispose of ghost group resources
     */
    _disposeGhostGroup(group) {
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
    }

    /**
     * Clear all ghost planets
     */
    clearAll() {
        for (const [satelliteId, ghosts] of this.ghostPlanets) {
            for (const [key, ghost] of ghosts) {
                if (ghost.group) {
                    this.app.scene.remove(ghost.group);
                    this._disposeGhostGroup(ghost.group);
                }
            }
        }
        this.ghostPlanets.clear();
    }

    /**
     * Update camera-facing labels
     */
    updateLabelOrientations() {
        if (!this.app.camera) return;
        
        for (const [satelliteId, ghosts] of this.ghostPlanets) {
            for (const [key, ghost] of ghosts) {
                if (ghost.labelMesh) {
                    ghost.labelMesh.lookAt(this.app.camera.position);
                }
            }
        }
    }

    /**
     * Get ghost planets for a satellite
     */
    getGhostPlanets(satelliteId) {
        return this.ghostPlanets.get(satelliteId);
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.clearAll();
        this.app = null;
    }
}