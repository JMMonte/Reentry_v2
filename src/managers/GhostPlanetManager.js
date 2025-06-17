/**
 * GhostPlanetManager.js
 * 
 * Manages ghost planet visualization for SOI transitions
 */
import * as THREE from 'three';
import { WebGLLabels } from '../utils/WebGLLabels.js';
import { RENDER_ORDER } from '../components/planet/PlanetConstants.js';

export class GhostPlanetManager {
    constructor(app, labelManager = null) {
        this.app = app;
        this.labelManager = labelManager;
        this.ghostPlanets = new Map(); // Map<satelliteId, Map<time, ghostData>>
        
        // Set up label category for ghost planets
        this.labelCategory = 'ghost_planets';
        
        // Pre-allocate common geometries and materials to avoid repeated creation
        this._sphereGeometry = new THREE.SphereGeometry(1, 32, 16); // Will be scaled per ghost
        this._soiGeometry = new THREE.SphereGeometry(1, 16, 8); // Will be scaled per SOI
        
        // Base materials that will be cloned with different colors/properties
        this._baseMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        this._baseSoiMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.1,
            wireframe: true,
            side: THREE.DoubleSide
        });
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
        
        // Reuse pre-allocated geometry with scaling instead of creating new geometry
        const material = this._baseMaterial.clone();
        material.color.setHex(targetPlanet.color || 0x888888);
        
        const ghostMesh = new THREE.Mesh(this._sphereGeometry, material);
        ghostMesh.scale.setScalar(targetPlanet.radius || 1000); // Scale the geometry instead of creating new one
        
        ghostGroup.add(ghostMesh);
        
        // Add SOI visualization if available
        if (targetPlanet.soiRadius) {
            const soiMaterial = this._baseSoiMaterial.clone();
            soiMaterial.color.setHex(targetPlanet.color || 0x888888);
            
            const soiMesh = new THREE.Mesh(this._soiGeometry, soiMaterial);
            soiMesh.scale.setScalar(targetPlanet.soiRadius); // Scale instead of creating new geometry
            soiMesh.name = `SOI_${targetPlanet.name}`;
            
            ghostGroup.add(soiMesh);
        }
        
        // Add label to show time until SOI entry
        const labelSprite = this._createGhostLabel(targetPlanet, transition, targetPlanet.radius || 1000);
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
     * Create label for ghost planet using LabelManager or WebGLLabels fallback
     */
    _createGhostLabel(targetPlanet, transition, radius) {
        const timeToSOI = transition.time; // seconds
        const hoursToSOI = (timeToSOI / 3600).toFixed(1);
        const labelText = `${targetPlanet.name} in ${hoursToSOI}h`;
        
        let sprite;
        
        if (this.labelManager) {
            // Use LabelManager for consistent styling
            const label = this.labelManager.createLabel(labelText, 'GHOST_LABEL', {
                category: this.labelCategory,
                position: new THREE.Vector3(0, radius * 1.5, 0),
                userData: {
                    targetPlanet: targetPlanet.name,
                    transitionTime: transition.time
                }
            });
            sprite = label.sprite;
        } else {
            // Fallback to WebGLLabels
            const labelConfig = {
                fontSize: 32,
                fontFamily: 'Arial',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent background
                padding: 8,
                pixelScale: 0.0003,
                sizeAttenuation: false,
                renderOrder: RENDER_ORDER.GHOST_LABELS
            };
            
            sprite = WebGLLabels.createLabel(labelText, labelConfig);
            sprite.position.y = radius * 1.5;
        }
        
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
            if (child.geometry && child.geometry !== this._sphereGeometry && child.geometry !== this._soiGeometry) {
                child.geometry.dispose();
            }
            if (child.material && child.material !== this._baseMaterial && child.material !== this._baseSoiMaterial) {
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
        // Use LabelManager for coordinated cleanup if available
        if (this.labelManager && this.labelCategory) {
            this.labelManager.clearCategory(this.labelCategory);
        }
        
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
        
        // Dispose of shared geometries and materials
        this._sphereGeometry.dispose();
        this._soiGeometry.dispose();
        this._baseMaterial.dispose();
        this._baseSoiMaterial.dispose();
    }
}