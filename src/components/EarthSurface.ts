import * as THREE from 'three';
import geojsonData from '../config/ne_50m_admin_0_sovereignty.json';
import geojsonDataStates from '../config/ne_110m_admin_1_states_provinces.json';

interface GeoJSONPoint {
    type: 'Point';
    coordinates: [number, number];
}

interface GeoJSONPolygon {
    type: 'Polygon';
    coordinates: Array<Array<[number, number]>>;
}

interface GeoJSONMultiPolygon {
    type: 'MultiPolygon';
    coordinates: Array<Array<Array<[number, number]>>>;
}

type GeoJSONGeometry = GeoJSONPoint | GeoJSONPolygon | GeoJSONMultiPolygon;

interface GeoJSONFeature {
    type: 'Feature';
    geometry: GeoJSONGeometry;
    properties: Record<string, unknown>;
}

interface GeoJSONData {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
}

interface Materials {
    latitudeLineMajor: THREE.LineBasicMaterial;
    latitudeLineMinor: THREE.LineBasicMaterial;
    countryLine: THREE.LineBasicMaterial;
    stateLine: THREE.LineBasicMaterial;
    cityPoint: THREE.PointsMaterial;
    airportPoint: THREE.PointsMaterial;
    spaceportPoint: THREE.PointsMaterial;
    groundStationPoint: THREE.PointsMaterial;
    observatoryPoint: THREE.PointsMaterial;
}

interface Points {
    cities: THREE.Points[];
    airports: THREE.Points[];
    spaceports: THREE.Points[];
    groundStations: THREE.Points[];
    observatories: THREE.Points[];
}

interface Labels {
    cities: THREE.Sprite[];
    airports: THREE.Sprite[];
    spaceports: THREE.Sprite[];
    groundStations: THREE.Sprite[];
    observatories: THREE.Sprite[];
}

export class EarthSurface {
    private scene: THREE.Object3D;
    private earthRadius: number;
    private heightOffset: number;
    private radius: number;
    private materials: Materials;
    private surfaceLines: THREE.Line[];
    private countryBorders: THREE.Line[];
    private states: THREE.Line[];
    private points: Points;
    private labels: Labels;

    constructor(mesh: THREE.Object3D, earthRadius: number) {
        this.scene = mesh;
        this.earthRadius = earthRadius;
        this.heightOffset = 0.5;
        this.radius = this.earthRadius + this.heightOffset;

        // Centralize materials
        this.materials = {
            latitudeLineMajor: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
            }),
            latitudeLineMinor: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
            }),
            countryLine: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
            }),
            stateLine: new THREE.LineBasicMaterial({
                color: 0x00FF00,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
            }),
            cityPoint: new THREE.PointsMaterial({
                color: 0x00A5FF,
                transparent: true,
                depthWrite: true,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
                sizeAttenuation: false,
                size: 5
            }),
            airportPoint: new THREE.PointsMaterial({
                color: 0xFF0000,
                transparent: true,
                depthWrite: true,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
                sizeAttenuation: false,
                size: 5
            }),
            spaceportPoint: new THREE.PointsMaterial({
                color: 0xFFD700,
                transparent: true,
                depthWrite: true,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
                sizeAttenuation: false,
                size: 5
            }),
            groundStationPoint: new THREE.PointsMaterial({
                color: 0x00FF00,
                transparent: true,
                depthWrite: true,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
                sizeAttenuation: false,
                size: 5
            }),
            observatoryPoint: new THREE.PointsMaterial({
                color: 0xFF00FF,
                transparent: true,
                depthWrite: true,
                depthTest: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.SrcAlphaFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
                sizeAttenuation: false,
                size: 5
            })
        };

        this.surfaceLines = [];
        this.countryBorders = [];
        this.states = [];
        this.points = {
            cities: [],
            airports: [],
            spaceports: [],
            groundStations: [],
            observatories: []
        };
        this.labels = {
            cities: [],
            airports: [],
            spaceports: [],
            groundStations: [],
            observatories: []
        };
    }

    public addLatitudeLines(): void {
        for (let lat = -90; lat <= 90; lat += 10) {
            const lineGeometry = new THREE.BufferGeometry();
            const points: THREE.Vector3[] = [];
            for (let lon = -180; lon <= 180; lon += 2) {
                const phi = THREE.MathUtils.degToRad(90 - lat);
                const theta = THREE.MathUtils.degToRad(lon);
                const x = (this.radius) * Math.sin(phi) * Math.cos(theta);
                const y = (this.radius) * Math.cos(phi);
                const z = (this.radius) * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            points.push(points[0]);
            lineGeometry.setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lat % 30 === 0 ? this.materials.latitudeLineMajor : this.materials.latitudeLineMinor);
            this.scene.add(line);
            this.surfaceLines.push(line);
        }
    }

    public addLongitudeLines(): void {
        for (let lon = -180; lon <= 180; lon += 10) {
            const lineGeometry = new THREE.BufferGeometry();
            const points: THREE.Vector3[] = [];
            for (let lat = -90; lat <= 90; lat += 2) {
                const phi = THREE.MathUtils.degToRad(90 - lat);
                const theta = THREE.MathUtils.degToRad(lon);
                const x = (this.radius) * Math.sin(phi) * Math.cos(theta);
                const y = (this.radius) * Math.cos(phi);
                const z = (this.radius) * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            points.push(points[0]);
            lineGeometry.setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lon % 30 === 0 ? this.materials.latitudeLineMajor : this.materials.latitudeLineMinor);
            this.scene.add(line);
            this.surfaceLines.push(line);
        }
    }

    public addPoints(geojsonData: GeoJSONData, material: THREE.PointsMaterial, category: keyof Points): void {
        const pointGeometry = new THREE.BufferGeometry();
        const pointPositions: number[] = [];

        geojsonData.features.forEach((feature) => {
            if (feature.geometry.type === 'Point') {
                const [lon, lat] = feature.geometry.coordinates;
                const phi = (90 - lat) * (Math.PI / 180);
                const theta = (lon + 89.96) * (Math.PI / 180);
                const radius = (this.earthRadius + this.heightOffset);
                const vertex = new THREE.Vector3();
                vertex.setFromSphericalCoords(radius, phi, theta);
                pointPositions.push(vertex.x, vertex.y, vertex.z);
            }
        });

        pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
        const points = new THREE.Points(pointGeometry, material);
        points.renderOrder = 3;
        points.visible = false;
        this.scene.add(points);
        this.points[category].push(points);
    }

    private createTextTexture(text: string): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        context.font = 'Bold 20px Arial';
        context.fillStyle = 'rgba(255, 255, 255, 1.0)';
        context.fillText(text, 0, 20);
        return new THREE.CanvasTexture(canvas);
    }

    public addCountryBorders(): void {
        const typedGeoJSON = (geojsonData as unknown) as GeoJSONData;
        
        typedGeoJSON.features.forEach((feature) => {
            if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                const polygons = feature.geometry.type === 'Polygon' 
                    ? [feature.geometry.coordinates] 
                    : feature.geometry.coordinates;

                polygons.forEach(polygon => {
                    polygon.forEach(ring => {
                        const points = ring.map(([lon, lat]) => {
                            const phi = (90 - lat) * (Math.PI / 180);
                            const theta = (lon + 89.96) * (Math.PI / 180);
                            const radius = (this.radius);
                            return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
                        });
                        points.push(points[0]);
                        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                        const lineMesh = new THREE.Line(lineGeometry, this.materials.countryLine);
                        lineMesh.visible = false;
                        this.scene.add(lineMesh);
                        this.countryBorders.push(lineMesh);
                    });
                });
            }
        });
    }

    public addStates(): void {
        const typedGeoJSON = (geojsonDataStates as unknown) as GeoJSONData;
        
        typedGeoJSON.features.forEach((feature) => {
            if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                const polygons = feature.geometry.type === 'Polygon' 
                    ? [feature.geometry.coordinates] 
                    : feature.geometry.coordinates;

                polygons.forEach(polygon => {
                    polygon.forEach(ring => {
                        const points = ring.map(([lon, lat]) => {
                            const phi = (90 - lat) * (Math.PI / 180);
                            const theta = (lon + 90) * (Math.PI / 180);
                            return new THREE.Vector3().setFromSphericalCoords(this.radius, phi, theta);
                        });
                        points.push(points[0]);
                        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                        const lineMesh = new THREE.Line(lineGeometry, this.materials.stateLine);
                        lineMesh.visible = false;
                        this.scene.add(lineMesh);
                        this.states.push(lineMesh);
                    });
                });
            }
        });
    }

    private setPointsVisible(category: keyof Points, visible: boolean): void {
        this.points[category].forEach(point => {
            point.visible = visible;
        });
    }

    public setCitiesVisible(visible: boolean): void {
        this.setPointsVisible('cities', visible);
    }

    public setAirportsVisible(visible: boolean): void {
        this.setPointsVisible('airports', visible);
    }

    public setSpaceportsVisible(visible: boolean): void {
        this.setPointsVisible('spaceports', visible);
    }

    public setGroundStationsVisible(visible: boolean): void {
        this.setPointsVisible('groundStations', visible);
    }

    public setObservatoriesVisible(visible: boolean): void {
        this.setPointsVisible('observatories', visible);
    }

    public setCountryBordersVisible(visible: boolean): void {
        this.countryBorders.forEach(border => {
            border.visible = visible;
        });
    }

    public setStatesVisible(visible: boolean): void {
        this.states.forEach(state => {
            state.visible = visible;
        });
    }

    public setSurfaceLinesVisible(visible: boolean): void {
        this.surfaceLines.forEach(line => {
            line.visible = visible;
        });
    }
} 