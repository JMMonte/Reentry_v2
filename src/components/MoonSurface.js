import * as THREE from 'three';
import contourData from '../config/data/moon_map_contours_simplified.json';  

class MoonSurface {
    constructor(mesh, moonRadius) {
        this.mesh = mesh;
        this.moonRadius = moonRadius;
        this.heightOffset = 0.5;
        this.radius = this.moonRadius + this.heightOffset;

        this.materials = {
            contourLine: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
            })
        };

        this.surfaceLines = [];
        this.adjustments = {
            lonOffset: 90.48,
            lonScale: 0.4068,
            latScale: 0.4061,
            flipLat: true,
            flipLon: false
        };
        this.addContourLines();
    }

    updateAdjustments(newAdjustments) {
        this.adjustments = { ...this.adjustments, ...newAdjustments };
        this.redrawContours();
    }

    clearContours() {
        this.surfaceLines.forEach(line => {
            this.mesh.remove(line);
            line.geometry.dispose();
        });
        this.surfaceLines = [];
    }

    redrawContours() {
        this.clearContours();
        this.addContourLines();
    }

    addContourLines() {
        const { lonOffset, lonScale, latScale, flipLat, flipLon } = this.adjustments;

        contourData.features.forEach((feature) => {
            const geometryType = feature.geometry.type;
            let lines = [];

            if (geometryType === 'LineString') {
                lines = [feature.geometry.coordinates];
            } else if (geometryType === 'MultiLineString') {
                lines = feature.geometry.coordinates;
            }

            lines.forEach(line => {
                const points = line.map(([x, y]) => {
                    // Convert from pixel coordinates to longitude/latitude
                    let lon = x * lonScale - 180;
                    let lat = 90 - (y * latScale);

                    if (flipLon) lon = -lon;
                    if (flipLat) lat = -lat;
                    
                    const phi = (90 - lat) * (Math.PI / 180);
                    const theta = (lon + lonOffset) * (Math.PI / 180);
                    return new THREE.Vector3().setFromSphericalCoords(this.radius, phi, theta);
                });
                
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                const lineMesh = new THREE.Line(lineGeometry, this.materials.contourLine);
                this.surfaceLines.push(lineMesh);
                this.mesh.add(lineMesh);
            });
        });
    }

    setVisibility(visible) {
        this.surfaceLines.forEach(line => {
            line.visible = visible;
        });
    }
}

export { MoonSurface };
