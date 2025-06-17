import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../../assets/fonts/helvetiker_regular.typeface.json';
import { ArrowUtils } from '../../utils/ArrowUtils.js';
import { WebGLLabels } from '../../utils/WebGLLabels.js';

const ARROW_COLORS = {
    velocity: 0xff00ff, // bright magenta
};

// Add a simple unique ID generator for debugging
let planetVectorsInstanceCounter = 0;

export class PlanetVectors {
    constructor(body, scene, sun, options = {}, labelManager = null) {
        this.instanceId = planetVectorsInstanceCounter++; // Assign unique ID
        this.body = body;
        this.scene = scene; // should be rebaseGroup
        this.sun = sun; // Sun mesh or object with getWorldPosition
        this.options = { name: 'Planet', ...options };
        this.labelManager = labelManager;
        this.labelCategory = `planet_vectors_${body.naifId || body.name}`;
        // Detect barycenter: use type property if available, else fallback to old logic
        const isBarycenter = body.type === 'barycenter' || !body.radius || !body.rotationGroup;
        // Use Mercury's radius for barycenter axes
        this.radius = isBarycenter ? 2439.7 : body.radius || 1; // Mercury mean radius in km
        this.arrowLength = this.radius * 2;
        this.arrowHeadLength = this.radius * 0.15;
        this.arrowHeadWidth = this.radius * 0.07;
        this.fontLoader = new FontLoader();
        this.font = null;
        this.group = new THREE.Group(); // This group is always added to the scene and remains visible.
        // Parent to orientationGroup (ecliptic/orbital frame), not rotationGroup
        (body.orientationGroup || body.orbitGroup || scene).add(this.group);
        this.group.position.set(0, 0, 0); // Always at local origin of parent
        this.isBarycenter = isBarycenter;
        
        // Initialize storage arrays early to avoid undefined errors
        this.labelSprites = [];
        this.directionalArrows = [];
        this.axesHelpers = [];
        
        // Initialize components
        this.#initAsync();
    }

    async #initAsync() {
        try {
            this.font = this.fontLoader.parse(helveticaRegular);
            this.#createVelocityVector();
            this.#createAxesHelpers();
            this.setVisible(false);
        } catch (error) {
            console.error('Failed to initialize PlanetVectors:', error);
        }
    }

    #createVelocityVector() {
        if (!this.font) return;
        
        // Create velocity arrow
        const velocityResult = ArrowUtils.createArrowHelper({
            direction: new THREE.Vector3(1, 0, 0),
            origin: new THREE.Vector3(0, 0, 0),
            length: this.arrowLength,
            color: ARROW_COLORS.velocity,
            headLengthRatio: this.arrowHeadLength / this.arrowLength,
            headWidthRatio: this.arrowHeadWidth / this.arrowLength,
            depthTest: true,
            depthWrite: true,
            transparent: false,
            opacity: 1,
            visible: false
        });
        
        this.velocityArrow = velocityResult.arrow;
        this.velocityDispose = velocityResult.dispose;
        
        // Create velocity label - using the same pattern as RadialGrid
        this.velocityLabel = this.#createLabel(
            `${this.options.name} Velocity`, 
            new THREE.Vector3(0, 0, 0),
            '#ff00ff'
        );
        this.velocityLabel.visible = false;
        
        // Add to group (not directly to orbitGroup like the old code)
        this.group.add(this.velocityArrow);
        this.group.add(this.velocityLabel);
        
        this.directionalArrows.push(this.velocityArrow);
    }

    #createAxesHelpers() {
        // Orbit axes (X, Y, Z) - added to orbitGroup space
        if (this.body.orbitGroup) {
            this.orbitAxesHelper = new THREE.AxesHelper(this.radius * 2);
            this.body.orbitGroup.add(this.orbitAxesHelper);
            this.orbitAxesHelper.visible = false;
            
            // Create axis labels - add them to orbitGroup to match axes helper coordinate space
            const orbitLabels = this.#createAxisLabels(['X', 'Y', 'Z'], 'ecliptic');
            orbitLabels.forEach(label => this.body.orbitGroup.add(label)); // Same parent as axes helper!
            
            this.axesHelpers.push(this.orbitAxesHelper);
        }
        
        // Rotation axes (X, Y only) - added to rotationGroup space  
        if (this.body.rotationGroup) {
            this.rotationAxesHelper = new THREE.AxesHelper(this.radius * 2);
            
            // Remove Z axis from geometry
            const positions = this.rotationAxesHelper.geometry.attributes.position;
            const newPositions = new Float32Array(4 * 3); // Only X and Y axes
            newPositions.set(positions.array.slice(0, 12));
            this.rotationAxesHelper.geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
            
            this.body.rotationGroup.add(this.rotationAxesHelper);
            this.rotationAxesHelper.visible = false;
            
            // Create axis labels - add them to rotationGroup to match axes helper coordinate space  
            const rotationLabels = this.#createAxisLabels(['X', 'Y'], 'body');
            rotationLabels.forEach(label => this.body.rotationGroup.add(label)); // Same parent as axes helper!
            
            this.axesHelpers.push(this.rotationAxesHelper);
        }
    }
    
    #createAxisLabels(axes, context) {
        const colors = { X: '#ff0000', Y: '#00ff00', Z: '#0000ff' };
        const labelTexts = {
            ecliptic: {
                X: `${this.body.name} Ecliptic X`,
                Y: `${this.body.name} Ecliptic Y`, 
                Z: `${this.body.name} Ecliptic Z`
            },
            body: {
                X: `${this.body.name} Prime Meridian`,
                Y: `${this.body.name} Rotation Axis`
            }
        };
        
        return axes.map(axis => {
            const position = new THREE.Vector3(
                axis === 'X' ? this.radius * 2 : 0,
                axis === 'Y' ? this.radius * 2 : 0,
                axis === 'Z' ? this.radius * 2 : 0
            );
            
            return this.#createLabel(
                labelTexts[context][axis] || `${this.body.name} ${axis}`,
                position,
                colors[axis]
            );
        });
    }
    
    #createLabel(text, position, color = '#ffffff') {
        let sprite;
        
        if (this.labelManager) {
            // Use LabelManager - following RadialGrid pattern exactly
            const label = this.labelManager.createLabel(text, 'VECTOR_LABEL', {
                position: position.clone(),
                category: this.labelCategory,
                color: color,
                userData: { planet: this.body.name }
            });
            sprite = label.sprite;
            this.labelSprites.push(label); // Store label object
        } else {
            // Fallback to WebGLLabels - same config as RadialGrid
            const labelConfig = {
                fontSize: 42,
                fontFamily: 'sans-serif',
                color: color,
                pixelScale: 0.0002,
                sizeAttenuation: false,
                transparent: true,
                renderOrder: 1000,    // High render order
                depthWrite: false,    // Critical for rendering in front
                depthTest: true
            };
            
            sprite = WebGLLabels.createLabel(text, labelConfig);
            sprite.position.copy(position);
            this.labelSprites.push(sprite); // Store sprite directly
        }
        
        // Force render properties - same as RadialGrid
        sprite.renderOrder = 9999;
        sprite.material.depthWrite = false;
        sprite.material.depthTest = true;
        sprite.material.transparent = true;
    
        return sprite;
    }

    updateVectors() {
        if (!this.velocityArrow || !this.velocityLabel) return;
        
        const velocity = this.#getPhysicsVelocity();
        
        if (velocity && velocity.length() > 0.001) {
            const velocityLen = velocity.length();
            const velocityDir = velocity.clone().normalize();
            
            // Update arrow
            this.velocityArrow.setDirection(velocityDir);
            this.velocityArrow.setLength(this.arrowLength, this.arrowHeadLength, this.arrowHeadWidth);
            this.velocityArrow.visible = true;
            
            // Update label
            const labelText = `${this.options.name} Velocity\n${velocityLen.toFixed(3)} km/s`;
            if (this.labelManager) {
                const labelObj = this.labelSprites.find(l => l.sprite === this.velocityLabel);
                if (labelObj?.updateText) labelObj.updateText(labelText);
            } else {
                WebGLLabels.updateLabel(this.velocityLabel, labelText);
            }
            
            // Position label at arrow tip
            const labelPos = velocityDir.clone().multiplyScalar(this.arrowLength * 1.1);
            this.velocityLabel.position.copy(labelPos);
            this.velocityLabel.visible = true;
        } else {
            this.velocityArrow.visible = false;
            this.velocityLabel.visible = false;
        }
    }

    updateFading(camera) {
        // Get distance using same method as RadialGrid
        let center = new THREE.Vector3();
        if (this.body?.getMesh && this.body.getMesh()) {
            this.body.getMesh().getWorldPosition(center);
        } else if (this.isBarycenter && this.body.orbitGroup) {
            this.body.orbitGroup.getWorldPosition(center);
        } else {
            return;
        }

        const planetId = this.body?.name || 'unknown';
        let distance = window.app3d?.distanceCache?.getDistance?.(planetId);
        if (!distance || distance === 0) {
            distance = camera.position.distanceTo(center);
        }

        // Same fade logic as RadialGrid
        const fadeStart = this.radius * 25;
        const fadeEnd = this.radius * 100;
        let opacity = 1;
        if (distance > fadeStart) {
            opacity = distance >= fadeEnd ? 0 : 1 - (distance - fadeStart) / (fadeEnd - fadeStart);
            opacity = Math.max(0, Math.min(1, opacity));
        }

        // Apply fading to all labels and arrows - simplified like RadialGrid
        if (this.labelSprites) {
            this.labelSprites.forEach(item => {
                const sprite = item.sprite || item;
                if (sprite && sprite.material) {
                    sprite.material.opacity = opacity;
                    sprite.visible = opacity > 0.01;
                }
            });
        }

        if (this.directionalArrows) {
            this.directionalArrows.forEach(arrow => {
                if (arrow && arrow.line && arrow.cone) {
                    arrow.line.material.opacity = opacity;
                    arrow.line.material.transparent = opacity < 1;
                    arrow.line.material.needsUpdate = true;
                    arrow.cone.material.opacity = opacity;
                    arrow.cone.material.transparent = opacity < 1;
                    arrow.cone.material.needsUpdate = true;
                    arrow.visible = opacity > 0;
                }
            });
        }

        // Fade axes helpers
        if (this.axesHelpers) {
            this.axesHelpers.forEach(helper => {
                if (helper) helper.visible = opacity > 0;
            });
        }
    }

    setVisible(visible) {
        if (this.directionalArrows) {
            this.directionalArrows.forEach(arrow => {
                if (arrow) arrow.visible = visible;
            });
        }
        if (this.labelSprites) {
            this.labelSprites.forEach(item => {
                const sprite = item.sprite || item;
                if (sprite) sprite.visible = visible;
            });
        }
    }

    setAxesVisible(visible) {
        if (this.axesHelpers) {
            this.axesHelpers.forEach(helper => {
                if (helper) helper.visible = visible;
            });
        }
    }

    setPlanetVectorsVisible(visible) {
        this.setVisible(visible);
        this.setAxesVisible(visible);
    }
    
    /**
     * Dispose of all resources and clean up memory
     */
    dispose() {
        // Clear polling interval if it exists
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
        
        // Remove event listener if added
        if (this.body && typeof this.body.removeEventListener === 'function') {
            this.body.removeEventListener('planetMeshLoaded', this.#initAsync);
        }
        
        // Dispose velocity arrow
        if (this.velocityDispose) {
            this.velocityDispose();
            this.velocityDispose = null;
        }
        
        // Dispose label sprites using LabelManager or fallback
        if (this.labelManager) {
            this.labelManager.clearCategory(this.labelCategory);
        } else if (this.labelSprites) {
            // For backward compatibility, handle mixed arrays
            this.labelSprites.forEach(item => {
                if (item) {
                    if (item.sprite) {
                        // Label object from LabelManager
                        WebGLLabels.disposeLabel(item.sprite);
                    } else if (item.isSprite || item.material) {
                        // Direct sprite
                        WebGLLabels.disposeLabel(item);
                    }
                }
            });
        }
        this.labelSprites = [];

        // Dispose individual dispose functions if they exist
        if (this.labelDisposeFunctions) {
            this.labelDisposeFunctions.forEach(dispose => dispose());
            this.labelDisposeFunctions = [];
        }

        // Clean up axes helpers and their labels
        const disposeAxesHelper = (helper) => {
            if (helper && helper.parent) {
                helper.parent.remove(helper);
                // AxesHelper is disposable
                if (helper.dispose) helper.dispose();
            }
            // Axes labels are now included in labelSprites and disposed via WebGLLabels
        };

        this.axesHelpers.forEach(disposeAxesHelper);

        // Clear references
        this.directionalArrows = [];
        this.axesHelpers = [];
        this.velocityArrow = null;
        this.velocityLabel = null;

        // Remove main group from scene
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        
        // Clear references
        this.body = null;
        this.scene = null;
        this.sun = null;
        this.font = null;
        this.group = null;
        this.labelManager = null;
    }

    /**
     * Get local velocity (velocity in local reference frame) from physics engine data
     * @returns {THREE.Vector3|null} Local velocity vector in km/s or null if not available
     */
    #getPhysicsVelocity() {
        if (window.app3d?.physicsIntegration && this.body.naifId) {
            try {
                if (this.body.localVelocity && Array.isArray(this.body.localVelocity)) {
                    const localVel = new THREE.Vector3(
                        this.body.localVelocity[0],
                        this.body.localVelocity[1],
                        this.body.localVelocity[2]
                    );
                    
                    const magnitude = localVel.length();
                    
                    // Show velocity vector if it's significant
                    if (magnitude > 0.001) {
                        return localVel;
                    } else {
                        return null;
                    }
                }
                
            } catch (error) {
                console.warn(`[PlanetVectors] Failed to get local velocity for ${this.body.name}:`, error);
            }
        }
        
        return null;
    }
} 