import * as THREE from 'three';
import geojsonData from '../config/ne_50m_admin_0_sovereignty.json';
import geojsonDataStates from '../config/ne_110m_admin_1_states_provinces.json';

class EarthSurface {
    constructor(mesh, earthRadius) {
        this.scene = mesh;
        this.earthRadius = earthRadius;
        this.heightOffset = -2;
        this.radius = this.earthRadius + this.heightOffset;

        // Centralize materials
        this.materials = {
            latitudeLineMajor: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1
            }),
            latitudeLineMinor: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1
            }),
            countryLine: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1
            }),
            stateLine: new THREE.LineBasicMaterial({
                color: 0x00FF00,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1
            }),
            cityPoint: new THREE.PointsMaterial({
                color: 0x00A5FF,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1,
                sizeAttenuation: false,
                size: 5
            }),
            airportPoint: new THREE.PointsMaterial({
                color: 0xFF0000,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1,
                sizeAttenuation: false,
                size: 5
            }),
            spaceportPoint: new THREE.PointsMaterial({
                color: 0xFFD700,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1,
                sizeAttenuation: false,
                size: 5
            }),
            groundStationPoint: new THREE.PointsMaterial({
                color: 0x00FF00,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1,
                sizeAttenuation: false,
                size: 5
            }),
            observatoryPoint: new THREE.PointsMaterial({
                color: 0xFF00FF,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1,
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

    addLatitudeLines() {
        for (let lat = -90; lat <= 90; lat += 10) {
            const lineGeometry = new THREE.BufferGeometry();
            const points = [];
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

    addLongitudeLines() {
        for (let lon = -180; lon <= 180; lon += 10) {
            const lineGeometry = new THREE.BufferGeometry();
            const points = [];
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

    addPoints(geojsonData, material, category) {
        const pointGeometry = new THREE.BufferGeometry();
        const pointPositions = [];

        geojsonData.features.forEach((feature) => {
            const lon = feature.geometry.coordinates[0];
            const lat = feature.geometry.coordinates[1];
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 89.96) * (Math.PI / 180);
            const radius = (this.earthRadius + this.heightOffset);
            const vertex = new THREE.Vector3();
            vertex.setFromSphericalCoords(radius, phi, theta);
            pointPositions.push(vertex.x, vertex.y, vertex.z);
        });

        pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
        const points = new THREE.Points(pointGeometry, material);
        this.scene.add(points);
        this.points[category].push(points);
    }

    createTextTexture(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = 'Bold 20px Arial';
        context.fillStyle = 'rgba(255, 255, 255, 1.0)';
        context.fillText(text, 0, 20);
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    addCountryBorders() {
        geojsonData.features.forEach((feature) => {
            const geometryType = feature.geometry.type;
            let polygons = [];

            if (geometryType === 'Polygon') {
                polygons = [feature.geometry.coordinates];
            } else if (geometryType === 'MultiPolygon') {
                polygons = feature.geometry.coordinates;
            }

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
                    this.scene.add(lineMesh);
                    this.countryBorders.push(lineMesh);
                });
            });
        });
    }

    addStates() {
        geojsonDataStates.features.forEach((feature) => {
            const geometryType = feature.geometry.type;
            let polygons = [];

            if (geometryType === 'Polygon') {
                polygons = [feature.geometry.coordinates];
            } else if (geometryType === 'MultiPolygon') {
                polygons = feature.geometry.coordinates;
            }

            polygons.forEach(polygon => {
                polygon.forEach(ring => {
                    const points = ring.map(([lon, lat]) => {
                        const phi = (90 - lat) * (Math.PI / 180);
                        const theta = (lon + 90) * (Math.PI / 180);  // Corrected longitude adjustment
                        return new THREE.Vector3().setFromSphericalCoords(this.radius, phi, theta);
                    });
                    points.push(points[0]);
                    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMesh = new THREE.Line(lineGeometry, this.materials.stateLine);
                    this.scene.add(lineMesh);
                    this.states.push(lineMesh);
                });
            });
        });
    }

    setPointsVisible(category, visible) {
        this.points[category].forEach(point => {
            point.visible = visible;
        });
    }

    setCitiesVisible(visible) {
        this.setPointsVisible('cities', visible);
    }

    setAirportsVisible(visible) {
        this.setPointsVisible('airports', visible);
    }

    setSpaceportsVisible(visible) {
        this.setPointsVisible('spaceports', visible);
    }

    setGroundStationsVisible(visible) {
        this.setPointsVisible('groundStations', visible);
    }

    setObservatoriesVisible(visible) {
        this.setPointsVisible('observatories', visible);
    }

    setCountryBordersVisible(visible) {
        this.countryBorders.forEach(border => {
            border.visible = visible;
        });
    }

    setStatesVisible(visible) {
        this.states.forEach(state => {
            state.visible = visible;
        });
    }

    setSurfaceLinesVisible(visible) {
        this.surfaceLines.forEach(line => {
            line.visible = visible;
        });
    }
}

export { EarthSurface };
