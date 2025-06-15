/**
 * GhostPlanetManager.js
 * 
 * Manages ghost planet visualization for SOI transitions
 */
import * as THREE from 'three';
import { WebGLLabels } from '../utils/WebGLLabels.js';

export class GhostPlanetManager {
    constructor(app) {
        this.app = app;
        this.ghostPlanets = new Map(); // Map<satelliteId, Map<time, ghostData>>
    }

    /**
     * Find SOI transition events in satellite trajectory points
     */
    findSOITransitions(points) {
        if (!points || points.length < 2) return [];
        
        const transitions = [];
        let previousCentralBody = null;
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const currentCentralBody = point.centralBody;
            
            if (previousCentralBody !== null && currentCentralBody !== previousCentralBody) {
                // SOI transition detected
                transitions.push({
                    time: point.time,
                    fromBody: previousCentralBody,
                    toBody: currentCentralBody,
                    position: [point.x, point.y, point.z],
                    centralBodyPosition: point.centralBodyPosition,
                    targetBodyPosition: point.targetBodyPosition
                });
            }
            
            previousCentralBody = currentCentralBody;
        }
        
        return transitions;
    }
    
    /**
     * Update ghost planets for a satellite
     */
    updateGhostPlanets(satelliteId, transitions) {
        // Remove existing ghost planets for this satellite
        this.removeGhostPlanets(satelliteId);
        
        if (!transitions || transitions.length === 0) return;
        
        const ghosts = new Map();
        
        // Create ghost planets for each transition
        transitions.forEach(transition => {
            const ghost = this._createGhostPlanet(transition);
            if (ghost) {
                ghosts.set(transition.time, ghost);
            }
        });
        
        this.ghostPlanets.set(satelliteId, ghosts);
        }
        
    /**
     * Update all ghost planets (called each frame)
     */
    update() {
        // Get all satellites' ghost planets  
        const satelliteGhosts = Array.from(this.ghostPlanets.values());
        
        for (const ghosts of satelliteGhosts) {
            // Update label orientations to face camera
            for (const [ghost] of ghosts) {
                if (ghost.labelSprite && this.app.camera) {
                    ghost.labelSprite.lookAt(this.app.camera.position);
                }
            }
        }
        
        // Update label orientations to face camera
        for (const [ghost] of satelliteGhosts) {
            if (ghost.labelSprite && this.app.camera) {
                ghost.labelSprite.lookAt(this.app.camera.position);
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
        const labelSprite = this._createGhostLabel(targetPlanet, transition, radius);
        if (labelSprite) {
            ghostGroup.add(labelSprite);
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
            labelSprite: labelSprite
        };
    }

    /**
     * Create label for ghost planet using WebGLLabels
     */
    _createGhostLabel(targetPlanet, transition, radius) {
        const timeToSOI = transition.time; // seconds
        const hoursToSOI = (timeToSOI / 3600).toFixed(1);
        const labelText = `${targetPlanet.name} in ${hoursToSOI}h`;
        
        // Use WebGLLabels for consistent styling
        const labelConfig = {
            fontSize: 32,
            fontFamily: 'Arial',
            color: '#ffffff',
            backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent background
            padding: 8,
            pixelScale: 0.0003,
            sizeAttenuation: false,
            renderOrder: 998
        };
        
        const sprite = WebGLLabels.createLabel(labelText, labelConfig);
        sprite.position.y = radius * 1.5;
        
        return sprite;
    }

    /**
     * Remove ghost planets for a satellite
     */
    removeGhostPlanets(satelliteId) {
        const ghosts = this.ghostPlanets.get(satelliteId);
        if (ghosts) {
            for (const [ghost] of ghosts) {
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
            // Dispose WebGL labels properly
            if (child instanceof THREE.Sprite) {
                WebGLLabels.disposeLabel(child);
            }
        });
    }

    /**
     * Clear all ghost planets
     */
    clearAll() {
        for (const [ghosts] of this.ghostPlanets) {
            for (const [ghost] of ghosts) {
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
        
        for (const [ghosts] of this.ghostPlanets) {
            for (const [ghost] of ghosts) {
                if (ghost.labelSprite) {
                    ghost.labelSprite.lookAt(this.app.camera.position);
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