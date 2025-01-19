import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../../public/assets/fonts/helvetiker_regular.typeface.json';

interface VectorObject {
    vector: THREE.ArrowHelper | null;
    label: THREE.Sprite | null;
    visible: boolean;
}

interface EarthVectors {
    northPole: VectorObject;
    greenwich: VectorObject;
    sunDirection: VectorObject;
}

interface SatelliteVectors {
    velocity: {
        vector: THREE.ArrowHelper;
        visible: boolean;
    };
    gravity: {
        vector: THREE.ArrowHelper;
        visible: boolean;
    };
}

interface SatelliteEntry {
    satellite: {
        id: string;
        mesh: THREE.Mesh;
        body: {
            velocity: THREE.Vector3;
        };
    };
    vectors: SatelliteVectors;
}

interface TimeUtils {
    getEarthTilt(): THREE.Vector3;
    getSunPosition(): THREE.Vector3;
    getGreenwichPosition(earth: Earth): THREE.Vector3;
}

interface Earth {
    EARTH_RADIUS: number;
    earthMesh: THREE.Mesh;
}

export class Vectors {
    private earth: Earth;
    private scene: THREE.Scene;
    private timeUtils: TimeUtils;
    private scale: number;
    private earthVectors: EarthVectors;
    private satelliteVectors: Map<string, SatelliteEntry>;
    private fontLoader: FontLoader;
    private font: Font | null;

    constructor(earth: Earth, scene: THREE.Scene, timeUtils: TimeUtils) {
        this.earth = earth;
        this.scene = scene;
        this.timeUtils = timeUtils;
        this.scale = this.earth.EARTH_RADIUS * 2;
        
        // Organize vectors by type
        this.earthVectors = {
            northPole: { vector: null, label: null, visible: false },
            greenwich: { vector: null, label: null, visible: false },
            sunDirection: { vector: null, label: null, visible: false }
        };

        this.satelliteVectors = new Map();
        this.fontLoader = new FontLoader();
        this.font = null;

        // Attempt to parse the imported font JSON
        try {
            this.font = this.fontLoader.parse(helveticaRegular);
            this.initVectors();
        } catch (error) {
            console.error('Failed to parse font:', error);
        }
    }

    private initVectors(): void {
        if (!this.font) {
            console.warn('Font not loaded yet, skipping vector initialization');
            return;
        }

        this.initEarthVectors();
    }

    private initEarthVectors(): void {
        // North Pole Vector
        const northPoleDirection = new THREE.Vector3(0, 1, 0);
        const northPoleVector = new THREE.ArrowHelper(
            northPoleDirection,
            this.earth.earthMesh.position,
            this.scale,
            0x0000ff
        );
        northPoleVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        northPoleVector.visible = false;
        this.scene.add(northPoleVector);
        
        const northPoleLabel = this.createLabel(
            'Earth Rotation Axis',
            northPoleVector.position.clone().add(northPoleDirection.multiplyScalar(this.scale))
        );
        northPoleLabel.visible = false;
        
        this.earthVectors.northPole = { vector: northPoleVector, label: northPoleLabel, visible: false };

        // Greenwich Vector
        const greenwichDirection = new THREE.Vector3(0, 0, 1);
        const greenwichVector = new THREE.ArrowHelper(
            greenwichDirection,
            this.earth.earthMesh.position,
            this.scale,
            0x00ff00
        );
        greenwichVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        greenwichVector.visible = false;
        this.scene.add(greenwichVector);
        
        const greenwichLabel = this.createLabel(
            'Greenwich-Equator',
            greenwichVector.position.clone().add(greenwichDirection.multiplyScalar(this.scale))
        );
        greenwichLabel.visible = false;
        
        this.earthVectors.greenwich = { vector: greenwichVector, label: greenwichLabel, visible: false };

        // Sun Direction Vector
        const sunDirection = new THREE.Vector3(0, 1, 0);
        const sunDirectionVector = new THREE.ArrowHelper(
            sunDirection,
            this.earth.earthMesh.position,
            this.scale,
            0xffff00
        );
        sunDirectionVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        sunDirectionVector.visible = false;
        this.scene.add(sunDirectionVector);
        
        const sunDirectionLabel = this.createLabel(
            'Sun Direction',
            sunDirectionVector.position.clone().add(sunDirection.multiplyScalar(this.scale))
        );
        sunDirectionLabel.visible = false;
        
        this.earthVectors.sunDirection = { vector: sunDirectionVector, label: sunDirectionLabel, visible: false };
    }

    private createLabel(text: string, position: THREE.Vector3): THREE.Sprite {
        const fontSize = 64;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Could not get 2D context for label canvas');
        }

        context.font = `${fontSize}px Arial`;
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;

        canvas.width = textWidth;
        canvas.height = textHeight;

        context.font = `${fontSize}px Arial`;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);

        const spriteScale = this.scale * 0.01;
        sprite.scale.set(spriteScale * (textWidth / textHeight), spriteScale, 1);
        sprite.position.copy(position);
        sprite.renderOrder = 999;

        this.scene.add(sprite);
        return sprite;
    }

    public addSatellite(satellite: { id: string; mesh: THREE.Mesh; body: { velocity: THREE.Vector3 } }): void {
        const vectors: SatelliteVectors = {
            velocity: {
                vector: new THREE.ArrowHelper(
                    new THREE.Vector3(1, 0, 0),
                    satellite.mesh.position,
                    this.scale * 0.2,
                    0xff0000
                ),
                visible: false
            },
            gravity: {
                vector: new THREE.ArrowHelper(
                    new THREE.Vector3(0, -1, 0),
                    satellite.mesh.position,
                    this.scale * 0.2,
                    0x00ff00
                ),
                visible: false
            }
        };

        vectors.velocity.vector.visible = false;
        vectors.gravity.vector.visible = false;

        this.scene.add(vectors.velocity.vector);
        this.scene.add(vectors.gravity.vector);
        
        this.satelliteVectors.set(satellite.id, {
            satellite,
            vectors
        });
    }

    public removeSatellite(satellite: { id: string }): void {
        const entry = this.satelliteVectors.get(satellite.id);
        if (entry) {
            Object.values(entry.vectors).forEach(({ vector }) => {
                if (vector) {
                    this.scene.remove(vector);
                }
            });
            this.satelliteVectors.delete(satellite.id);
        }
    }

    public updateVectors(): void {
        this.updateEarthVectors();
        this.updateSatelliteVectors();
    }

    private updateEarthVectors(): void {
        const { northPole, sunDirection, greenwich } = this.earthVectors;

        if (northPole.vector) {
            const northPoleDirection = this.timeUtils.getEarthTilt();
            northPole.vector.setDirection(northPoleDirection);
            if (northPole.label) {
                northPole.label.position.copy(
                    northPole.vector.position.clone().add(northPoleDirection.multiplyScalar(this.scale))
                );
            }
        }

        if (sunDirection.vector) {
            const sunDir = this.timeUtils.getSunPosition().normalize();
            sunDirection.vector.setDirection(sunDir);
            if (sunDirection.label) {
                sunDirection.label.position.copy(
                    sunDirection.vector.position.clone().add(sunDir.multiplyScalar(this.scale))
                );
            }
        }

        if (greenwich.vector) {
            const greenwichDir = this.timeUtils.getGreenwichPosition(this.earth).normalize();
            greenwich.vector.setDirection(greenwichDir);
            if (greenwich.label) {
                greenwich.label.position.copy(
                    greenwich.vector.position.clone().add(greenwichDir.multiplyScalar(this.scale))
                );
            }
        }
    }

    private updateSatelliteVectors(): void {
        this.satelliteVectors.forEach(({ satellite, vectors }) => {
            if (satellite.body && satellite.body.velocity) {
                const velocity = new THREE.Vector3(
                    satellite.body.velocity.x,
                    satellite.body.velocity.y,
                    satellite.body.velocity.z
                ).normalize();
                
                const velocityLength = satellite.body.velocity.length();
                vectors.velocity.vector.position.copy(satellite.mesh.position);
                vectors.velocity.vector.setDirection(velocity);
                vectors.velocity.vector.setLength(velocityLength * 0.1, this.scale * 0.02, this.scale * 0.005);

                const gravityDirection = new THREE.Vector3()
                    .subVectors(this.earth.earthMesh.position, satellite.mesh.position)
                    .normalize();
                const gravityMagnitude = gravityDirection.length() * this.scale * 0.05;
                vectors.gravity.vector.position.copy(satellite.mesh.position);
                vectors.gravity.vector.setDirection(gravityDirection);
                vectors.gravity.vector.setLength(gravityMagnitude, this.scale * 0.02, this.scale * 0.005);
            }
        });
    }

    public setVisible(visible: boolean): void {
        this.setEarthVectorsVisible(visible);
        this.setSatelliteVectorsVisible(visible);
    }

    private setEarthVectorsVisible(visible: boolean): void {
        Object.values(this.earthVectors).forEach(vectorObj => {
            if (vectorObj.vector) {
                vectorObj.vector.visible = visible;
            }
            if (vectorObj.label) {
                vectorObj.label.visible = visible;
            }
            vectorObj.visible = visible;
        });
    }

    private setSatelliteVectorsVisible(visible: boolean): void {
        this.satelliteVectors.forEach(({ vectors }) => {
            Object.values(vectors).forEach(vectorObj => {
                vectorObj.vector.visible = visible;
                vectorObj.visible = visible;
            });
        });
    }

    public dispose(): void {
        // Remove and dispose of Earth vectors
        Object.values(this.earthVectors).forEach(vectorObj => {
            if (vectorObj.vector) {
                this.scene.remove(vectorObj.vector);
            }
            if (vectorObj.label) {
                this.scene.remove(vectorObj.label);
                (vectorObj.label.material as THREE.SpriteMaterial).map?.dispose();
                vectorObj.label.material.dispose();
            }
        });

        // Remove and dispose of satellite vectors
        this.satelliteVectors.forEach(({ vectors }) => {
            Object.values(vectors).forEach(({ vector }) => {
                this.scene.remove(vector);
            });
        });
        this.satelliteVectors.clear();
    }
} 