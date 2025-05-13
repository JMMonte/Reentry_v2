import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helveticaRegular from '../assets/fonts/helvetiker_regular.typeface.json';
import { TimeUtils } from './TimeUtils.js';

export class Vectors {
    constructor(earth, scene, timeUtils) {
        this.earth = earth;
        this.scene = scene;
        this.timeUtils = timeUtils;
        this.scale = earth.radius * 2;
        this.satellites = [];
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

    initVectors() {
        if (!this.font) {
            console.warn('Font not loaded yet, skipping vector initialization');
            return;
        }

        this.initNorthPoleVector();
        this.initSunDirection();
        this.initGreenwichVector();
        if (this.satellites.length > 0) {
            this.initSatelliteVectors(this.satellites);
        }
    }

    createLabel(text, position) {
        const fontSize = 64;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

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

        const spriteScale = this.scale * 0.01; // Adjust the scale factor as needed
        sprite.scale.set(spriteScale * (textWidth / textHeight), spriteScale, 1);
        sprite.position.copy(position);
        sprite.renderOrder = 999;  // Ensure labels are rendered last

        this.scene.add(sprite);

        return sprite;
    }


    initNorthPoleVector() {
        // compute actual north pole orientation from planet's tiltGroup
        const northPoleDirection = new THREE.Vector3(0, 1, 0)
            .applyQuaternion(this.earth.getTiltGroup().quaternion)
            .normalize();
        this.northPoleVector = new THREE.ArrowHelper(
            northPoleDirection,
            this.earth.getMesh().position,
            this.scale,
            0x0000ff
        );
        this.northPoleVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        this.scene.add(this.northPoleVector);
        this.northPoleLabel = this.createLabel(
            'Earth Rotation Axis Pole',
            this.northPoleVector.position.clone().add(northPoleDirection.multiplyScalar(this.scale))
        );
    }

    initSunDirection() {
        // compute actual sun direction from timeUtils
        const sunDirection = TimeUtils.getSunPosition(this.timeUtils.getSimulatedTime()).normalize();
        this.sunDirectionArrow = new THREE.ArrowHelper(
            sunDirection,
            this.earth.getMesh().position,
            this.scale,
            0xffff00
        );
        this.sunDirectionArrow.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        this.scene.add(this.sunDirectionArrow);
        this.sunDirectionLabel = this.createLabel(
            'Sun Direction',
            this.sunDirectionArrow.position.clone().add(sunDirection.multiplyScalar(this.scale))
        );
    }

    initGreenwichVector() {
        // compute actual Greenwich meridian direction on equator
        const greenwichDirection = this.timeUtils.getGreenwichPosition(this.earth).normalize();
        this.greenwichVector = new THREE.ArrowHelper(
            greenwichDirection,
            this.earth.getMesh().position,
            this.scale,
            0x00ff00
        );
        this.greenwichVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        this.scene.add(this.greenwichVector);
        this.greenwichLabel = this.createLabel(
            'Greenwich-Equator',
            this.greenwichVector.position.clone().add(greenwichDirection.multiplyScalar(this.scale))
        );
    }

    initSatelliteVectors() {
        this.satellites.forEach(satellite => {
            this.addSatellite(satellite);
        });
    }

    updateSatelliteVectors() {
        this.satellites.forEach(entry => {
            if (entry && entry.velocityVector && entry.satellite && entry.satellite.body && entry.satellite.body.velocity) {
                try {
                    const satellite = entry.satellite;
                    const velocityVector = entry.velocityVector;
                    velocityVector.position.copy(satellite.mesh.position);
                    const velocity = new THREE.Vector3(
                        satellite.body.velocity.x,
                        satellite.body.velocity.y,
                        satellite.body.velocity.z
                    ).normalize();
                    const velocityLength = satellite.body.velocity.length();
                    velocityVector.setDirection(velocity);
                    velocityVector.setLength(velocityLength * 0.1, this.scale * 0.02, this.scale * 0.005);
                    const gravityDirection = new THREE.Vector3().subVectors(
                        this.earth.getMesh().position,
                        entry.satellite.mesh.position
                    ).normalize();
                    const gravityMagnitude = gravityDirection.length() * this.scale * 0.05;
                    entry.gravityVector.position.copy(entry.satellite.mesh.position);
                    entry.gravityVector.setDirection(gravityDirection);
                    entry.gravityVector.setLength(gravityMagnitude * 1, this.scale * 0.02, this.scale * 0.005);
                } catch (error) {
                    console.error('Error updating vector for satellite:', entry, error);
                }
            } else {
                console.warn('Missing properties for', entry);
            }
        });
    }

    updateVectors() {
        if (this.northPoleVector) {
            const northPoleDirection = this.timeUtils.getEarthTilt();
            this.northPoleVector.setDirection(northPoleDirection);
            this.northPoleLabel.position.copy(this.northPoleVector.position.clone().add(northPoleDirection.multiplyScalar(this.scale)));
        }
        if (this.sunDirectionArrow) {
            const sunDirection = TimeUtils.getSunPosition(this.timeUtils.getSimulatedTime()).normalize();
            this.sunDirectionArrow.setDirection(sunDirection);
            this.sunDirectionLabel.position.copy(this.sunDirectionArrow.position.clone().add(sunDirection.multiplyScalar(this.scale)));
        }
        if (this.greenwichVector) {
            const greenwichDirection = this.timeUtils.getGreenwichPosition(this.earth).normalize();
            this.greenwichVector.setDirection(greenwichDirection);
            this.greenwichLabel.position.copy(this.greenwichVector.position.clone().add(greenwichDirection.multiplyScalar(this.scale)));
        }
        this.updateSatelliteVectors();
    }

    setVisible(visible) {
        if (this.velocityVector) this.velocityVector.visible = visible;
        if (this.velocityLabel) this.velocityLabel.visible = visible;
        if (this.northPoleVector) this.northPoleVector.visible = visible;
        if (this.northPoleLabel) this.northPoleLabel.visible = visible;
        if (this.sunDirectionArrow) this.sunDirectionArrow.visible = visible;
        if (this.sunDirectionLabel) this.sunDirectionLabel.visible = visible;
        if (this.greenwichVector) this.greenwichVector.visible = visible;
        if (this.greenwichLabel) this.greenwichLabel.visible = visible;
    }

    setSatVisible(visible) {
        this.satellites.forEach(entry => {
            if (entry.velocityVector) {
                entry.velocityVector.visible = visible;
            }
            if (entry.gravityVector) {
                entry.gravityVector.visible = visible;
            }
        });
    }

    removeSatellite(satellite) {
        const index = this.satellites.findIndex(entry => entry.satellite === satellite);
        if (index !== -1) {
            if (this.satellites[index].velocityVector) {
                this.scene.remove(this.satellites[index].velocityVector);
            }
            if (this.satellites[index].gravityVector) {
                this.scene.remove(this.satellites[index].gravityVector);
            }
            if (this.satellites[index].velocityLabel) {
                this.scene.remove(this.satellites[index].velocityLabel);
            }
            if (this.satellites[index].gravityLabel) {
                this.scene.remove(this.satellites[index].gravityLabel);
            }
            this.satellites.splice(index, 1);
        }
    }

    addSatellite(satellite) {
        const velocityDirection = new THREE.Vector3(1, 0, 0);
        const velocityVector = new THREE.ArrowHelper(
            velocityDirection.normalize(),
            satellite.mesh.position,
            this.scale * 0.2, 0xff0000
        );
        this.scene.add(velocityVector);
        const gravityDirection = new THREE.Vector3().subVectors(
            this.earth.getMesh().position,
            satellite.mesh.position
        ).normalize();
        const gravityMagnitude = gravityDirection.length() * this.scale * 0.05;
        const gravityVector = new THREE.ArrowHelper(
            gravityDirection,
            satellite.mesh.position,
            gravityMagnitude, 0x00ff00,
            this.scale * 0.05,
            this.scale * 0.01
        );
        this.scene.add(gravityVector);
        this.satellites.push({
            satellite: satellite,
            velocityVector: velocityVector,
            gravityVector: gravityVector,
        });
    }

    getGreenwichSurfacePosition() {
        const halfScale = this.scale / 2;
        const greenwichPosition = this.greenwichVector.position.clone();
        const greenwichDirection = this.greenwichVector.getDirection(new THREE.Vector3()).normalize();
        const greenwichSurfacePosition = greenwichPosition.add(greenwichDirection.multiplyScalar(halfScale));
        return greenwichSurfacePosition;
    }

    toggleVelocityVectorVisibility(visible) {
        if (this.velocityVector) this.velocityVector.visible = visible;
        if (this.velocityLabel) this.velocityLabel.visible = visible;
    }

    toggleNorthPoleVectorVisibility(visible) {
        if (this.northPoleVector) this.northPoleVector.visible = visible;
        if (this.northPoleLabel) this.northPoleLabel.visible = visible;
    }

    toggleSunDirectionArrowVisibility(visible) {
        if (this.sunDirectionArrow) this.sunDirectionArrow.visible = visible;
        if (this.sunDirectionLabel) this.sunDirectionLabel.visible = visible;
    }

    toggleGreenwichVectorVisibility(visible) {
        if (this.greenwichVector) this.greenwichVector.visible = visible;
        if (this.greenwichLabel) this.greenwichLabel.visible = visible;
    }
}
