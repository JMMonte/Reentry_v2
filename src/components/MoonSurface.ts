import * as THREE from 'three';
import contourData from '../config/moon_map_contours_simplified.json';

interface GeoJSONFeature {
    type: 'Feature';
    geometry: {
        type: 'LineString' | 'MultiLineString';
        coordinates: [number, number][] | [number, number][][];
    };
    properties: Record<string, unknown>;
}

interface GeoJSONData {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
}

interface Materials {
    contourLine: THREE.LineBasicMaterial;
}

interface Adjustments {
    lonOffset: number;
    lonScale: number;
    latScale: number;
    flipLat: boolean;
    flipLon: boolean;
}

export class MoonSurface {
    private mesh: THREE.Object3D;
    private moonRadius: number;
    private heightOffset: number;
    private radius: number;
    private materials: Materials;
    private surfaceLines: THREE.Line[];
    private adjustments: Adjustments;

    constructor(mesh: THREE.Object3D, moonRadius: number) {
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

    public updateAdjustments(newAdjustments: Partial<Adjustments>): void {
        this.adjustments = { ...this.adjustments, ...newAdjustments };
        this.redrawContours();
    }

    private clearContours(): void {
        this.surfaceLines.forEach(line => {
            this.mesh.remove(line);
            line.geometry.dispose();
        });
        this.surfaceLines = [];
    }

    private redrawContours(): void {
        this.clearContours();
        this.addContourLines();
    }

    private addContourLines(): void {
        const { lonOffset, lonScale, latScale, flipLat, flipLon } = this.adjustments;
        const typedContourData = (contourData as unknown) as GeoJSONData;

        typedContourData.features.forEach((feature) => {
            const geometryType = feature.geometry.type;
            let lines: [number, number][][] = [];

            if (geometryType === 'LineString') {
                lines = [feature.geometry.coordinates as [number, number][]];
            } else if (geometryType === 'MultiLineString') {
                lines = feature.geometry.coordinates as [number, number][][];
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

    public setVisibility(visible: boolean): void {
        this.surfaceLines.forEach(line => {
            line.visible = visible;
        });
    }
} 