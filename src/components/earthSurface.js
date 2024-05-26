import * as THREE from 'three';
import geojsonData from '../config/ne_50m_admin_0_sovereignty.json';
import geojsonDataCities from '../config/ne_110m_populated_places.json';
import geojsonDataAirports from '../config/ne_10m_airports.json';
import geojsonDataStates from '../config/ne_110m_admin_1_states_provinces.json';
import geojsonDataSpaceports from '../config/spaceports.json';
import geojsonDataGroundStations from '../config/ground_stations.json';

class EarthSurface {
    constructor(mesh, earthRadius) {
        this.scene = mesh;
        this.earthRadius = earthRadius;
        this.heightOffset = -2;

        // Centralize materials
        this.latitudeLineMajorMaterial = new THREE.LineBasicMaterial({
            color: 0x00A5FF,
            polygonOffset: true,
            polygonOffsetFactor: 10,
            polygonOffsetUnits: 1
        });
        this.latitudeLineMinorMaterial = new THREE.LineBasicMaterial({
            color: 0x00A5FF,
            polygonOffset: true,
            polygonOffsetFactor: 10,
            polygonOffsetUnits: 1
        });

        this.stateLineMaterial = new THREE.LineBasicMaterial({
            color: 0x00FF00,
            polygonOffset: true,
            polygonOffsetFactor: 10,
            polygonOffsetUnits: 1
        });

        this.cityPointMaterial = new THREE.PointsMaterial({
            color: 0x00A5FF,
            size: 5,
            sizeAttenuation: false,
            polygonOffset: true,
            polygonOffsetFactor: 10,
            polygonOffsetUnits: 1,
        });
        this.airportPointMaterial = new THREE.PointsMaterial({
            color: 0xFF0000,
            size: 5,
            sizeAttenuation: false,
            polygonOffset: true,
            polygonOffsetFactor: 10,
            polygonOffsetUnits: 1,
        });
        this.spaceportPointMaterial = new THREE.PointsMaterial({
            color: 0xFFD700,
            size: 5,
            sizeAttenuation: false,
            polygonOffset: true,
            polygonOffsetFactor: 10,
            polygonOffsetUnits: 1,
        });
        this.groundStationPointMaterial = new THREE.PointsMaterial({
            color: 0x00FF00,
            size: 5,
            sizeAttenuation: false,
            polygonOffset: true,
            polygonOffsetFactor: 10,
            polygonOffsetUnits: 1,
        });

        this.features = [];
        this.cities = [];
        this.airports = [];
        this.spaceports = [];
        this.countries = [];
        this.states = [];
        this.groundStations = [];
    }

    addLatitudeLines() {
        for (let lat = -90; lat <= 90; lat += 10) {
            const lineGeometry = new THREE.BufferGeometry();
            const points = [];
            for (let lon = -180; lon <= 180; lon += 2) {
                const phi = THREE.MathUtils.degToRad(90 - lat);
                const theta = THREE.MathUtils.degToRad(lon);
                const x = (this.earthRadius + this.heightOffset) * Math.sin(phi) * Math.cos(theta);
                const y = (this.earthRadius + this.heightOffset) * Math.cos(phi);
                const z = (this.earthRadius + this.heightOffset) * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            points.push(points[0]);
            lineGeometry.setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lat % 30 === 0 ? this.latitudeLineMajorMaterial : this.latitudeLineMinorMaterial);
            this.scene.add(line);
            this.features.push(line);
        }
    }

    addLongitudeLines() {
        for (let lon = -180; lon <= 180; lon += 10) {
            const lineGeometry = new THREE.BufferGeometry();
            const points = [];
            for (let lat = -90; lat <= 90; lat += 2) {
                const phi = THREE.MathUtils.degToRad(90 - lat);
                const theta = THREE.MathUtils.degToRad(lon);
                const x = (this.earthRadius + this.heightOffset) * Math.sin(phi) * Math.cos(theta);
                const y = (this.earthRadius + this.heightOffset) * Math.cos(phi);
                const z = (this.earthRadius + this.heightOffset) * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            points.push(points[0]);
            lineGeometry.setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lon % 30 === 0 ? this.latitudeLineMajorMaterial : this.latitudeLineMinorMaterial);
            this.scene.add(line);
            this.features.push(line);
        }
    }

    addCities() {
        const cityGeometry = new THREE.BufferGeometry();
        const cityPositions = [];

        geojsonDataCities.features.forEach((feature) => {
            const lon = feature.geometry.coordinates[0];
            const lat = feature.geometry.coordinates[1];
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 89.96) * (Math.PI / 180);
            const radius = (this.earthRadius + this.heightOffset);
            const vertex = new THREE.Vector3();
            vertex.setFromSphericalCoords(radius, phi, theta);
            cityPositions.push(vertex.x, vertex.y, vertex.z);
        });

        cityGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cityPositions, 3));
        const cityPoints = new THREE.Points(cityGeometry, this.cityPointMaterial);
        this.scene.add(cityPoints);
        this.cities.push(cityPoints);
    }

    addAirports() {
        const airportGeometry = new THREE.BufferGeometry();
        const airportPositions = [];

        geojsonDataAirports.features.forEach((feature) => {
            const lon = feature.geometry.coordinates[0];
            const lat = feature.geometry.coordinates[1];
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 89.96) * (Math.PI / 180);
            const radius = (this.earthRadius + this.heightOffset);
            const vertex = new THREE.Vector3();
            vertex.setFromSphericalCoords(radius, phi, theta);
            airportPositions.push(vertex.x, vertex.y, vertex.z);
        });

        airportGeometry.setAttribute('position', new THREE.Float32BufferAttribute(airportPositions, 3));
        const airportPoints = new THREE.Points(airportGeometry, this.airportPointMaterial);
        this.scene.add(airportPoints);
        this.airports.push(airportPoints);
    }

    addSpaceports() {
        const spaceportGeometry = new THREE.BufferGeometry();
        const spaceportPositions = [];

        geojsonDataSpaceports.features.forEach((feature) => {
            const lon = feature.geometry.coordinates[0];
            const lat = feature.geometry.coordinates[1];
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 89.96) * (Math.PI / 180);
            const radius = (this.earthRadius + this.heightOffset);
            const vertex = new THREE.Vector3();
            vertex.setFromSphericalCoords(radius, phi, theta);
            spaceportPositions.push(vertex.x, vertex.y, vertex.z);
        });

        spaceportGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spaceportPositions, 3));
        const spaceportPoints = new THREE.Points(spaceportGeometry, this.spaceportPointMaterial);
        this.scene.add(spaceportPoints);
        this.spaceports.push(spaceportPoints);
    }

    addGroundStations() {
        const groundStationGeometry = new THREE.BufferGeometry();
        const groundStationPositions = [];

        geojsonDataGroundStations.features.forEach((feature) => {
            const lon = feature.geometry.coordinates[0];
            const lat = feature.geometry.coordinates[1];
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 89.96) * (Math.PI / 180);
            const radius = (this.earthRadius + this.heightOffset);
            const vertex = new THREE.Vector3();
            vertex.setFromSphericalCoords(radius, phi, theta);
            groundStationPositions.push(vertex.x, vertex.y, vertex.z);
        });

        groundStationGeometry.setAttribute('position', new THREE.Float32BufferAttribute(groundStationPositions, 3));
        const groundStationPoints = new THREE.Points(groundStationGeometry, this.groundStationPointMaterial);
        this.scene.add(groundStationPoints);
        this.groundStations.push(groundStationPoints);
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
                        const radius = (this.earthRadius + this.heightOffset);
                        return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
                    });
                    points.push(points[0]);
                    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMesh = new THREE.Line(lineGeometry, this.latitudeLineMajorMaterial);
                    this.scene.add(lineMesh);
                    this.countries.push(lineMesh);
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
                        const theta = (lon + 89.96) * (Math.PI / 180);
                        const radius = (this.earthRadius + this.heightOffset);
                        return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
                    });
                    points.push(points[0]);
                    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMesh = new THREE.Line(lineGeometry, this.stateLineMaterial);
                    this.scene.add(lineMesh);
                    this.states.push(lineMesh);
                });
            });
        });
    }

    setCitiesVisible(visible) {
        this.cities.forEach(city => {
            city.visible = visible;
        });
    }

    setAirportsVisible(visible) {
        this.airports.forEach(airport => {
            airport.visible = visible;
        });
    }

    setSpaceportsVisible(visible) {
        this.spaceports.forEach(spaceport => {
            spaceport.visible = visible;
        });
    }

    setCountryBordersVisible(visible) {
        this.countries.forEach(country => {
            country.visible = visible;
        });
    }

    setStatesVisible(visible) {
        this.states.forEach(state => {
            state.visible = visible;
        });
    }

    setSurfaceLinesVisible(visible) {
        this.features.forEach(feature => {
            feature.visible = visible;
        });
    }

    setGroundStationsVisible(visible) {
        this.groundStations.forEach(groundStation => {
            groundStation.visible = visible;
        });
    }
}

export { EarthSurface };
