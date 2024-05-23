import * as THREE from 'three';
import geojsonData from '../config/ne_50m_admin_0_sovereignty.json';
import geojsonDataCities from '../config/ne_110m_populated_places.json';
import geojsonDataAirports from '../config/ne_10m_airports.json';
import geojsonDataStates from '../config/ne_110m_admin_1_states_provinces.json';

// Materials for lines with different levels of visibility
const materialMajor = new THREE.LineBasicMaterial({
    color: 0x00A5FF,
    polygonOffset: true,
    polygonOffsetFactor: 10,
    polygonOffsetUnits: 1
});
const materialMinor = new THREE.LineBasicMaterial({
    color: 0x00A5FF,
    polygonOffset: true,
    polygonOffsetFactor: 10,
    polygonOffsetUnits: 1
});

const stateLinesMaterial = new THREE.LineBasicMaterial({
    color: 0x00FF00,
    polygonOffset: true,
    polygonOffsetFactor: 10,
    polygonOffsetUnits: 1
});

const heightOffset = -2;

// Function to add latitude lines to the scene
function addLatitudeLines(scene, earthRadius) {
    for (let lat = -90; lat <= 90; lat += 10) {
        const lineGeometry = new THREE.BufferGeometry();
        const points = [];
        for (let lon = -180; lon <= 180; lon += 2) {
            const phi = THREE.MathUtils.degToRad(90 - lat);
            const theta = THREE.MathUtils.degToRad(lon);
            const x = (earthRadius + heightOffset) * Math.sin(phi) * Math.cos(theta);
            const y = (earthRadius + heightOffset) * Math.cos(phi);
            const z = (earthRadius + heightOffset) * Math.sin(phi) * Math.sin(theta);
            points.push(new THREE.Vector3(x, y, z));
        }
        // Close the loop by adding the first point again
        points.push(points[0]);
        lineGeometry.setFromPoints(points);
        const line = new THREE.Line(lineGeometry, lat % 30 === 0 ? materialMajor : materialMinor);
        scene.add(line);
    }
}

// Function to add longitude lines to the scene
function addLongitudeLines(scene, earthRadius) {
    for (let lon = -180; lon <= 180; lon += 10) {
        const lineGeometry = new THREE.BufferGeometry();
        const points = [];
        for (let lat = -90; lat <= 90; lat += 2) {
            const phi = THREE.MathUtils.degToRad(90 - lat);
            const theta = THREE.MathUtils.degToRad(lon);
            const x = (earthRadius + heightOffset) * Math.sin(phi) * Math.cos(theta);
            const y = (earthRadius + heightOffset) * Math.cos(phi);
            const z = (earthRadius + heightOffset) * Math.sin(phi) * Math.sin(theta);
            points.push(new THREE.Vector3(x, y, z));
        }
        // Close the loop by adding the first point again
        points.push(points[0]);
        lineGeometry.setFromPoints(points);
        const line = new THREE.Line(lineGeometry, lon % 30 === 0 ? materialMajor : materialMinor);
        scene.add(line);
    }
}

// Function to add country borders from GeoJSON data
function addCountryBorders(scene, earthRadius) {
    geojsonData.features.forEach((feature) => {
        const geometryType = feature.geometry.type;
        let polygons = [];

        if (geometryType === 'Polygon') {
            polygons = [feature.geometry.coordinates];  // Wrap in an array to unify handling
        } else if (geometryType === 'MultiPolygon') {
            polygons = feature.geometry.coordinates;
        }

        polygons.forEach(polygon => {
            polygon.forEach(ring => {
                const points = ring.map(([lon, lat]) => {
                    const phi = (90 - lat) * (Math.PI / 180); 
                    const theta = (lon + 89.96) * (Math.PI / 180);
                    const radius = (earthRadius + heightOffset);  // Slightly above surface to prevent z-fighting
                    return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
                });
                // Close the loop by adding the first point again
                points.push(points[0]);
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                const lineMaterial = materialMajor;
                const lineMesh = new THREE.Line(lineGeometry, lineMaterial);
                scene.add(lineMesh);
            });
        });
    });
}

function addCities(scene, earthRadius) {
    geojsonDataCities.features.forEach((feature) => {
        const lon = feature.geometry.coordinates[0];
        const lat = feature.geometry.coordinates[1];
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 89.96) * (Math.PI / 180);
        const radius = (earthRadius + heightOffset);
        const cityGeometry = new THREE.SphereGeometry(1, 4, 4);
        const cityMaterial = new THREE.MeshBasicMaterial({ color: 0x00A5FF });
        const cityMesh = new THREE.Mesh(cityGeometry, cityMaterial);
        cityMesh.position.setFromSphericalCoords(radius, phi, theta);
        scene.add(cityMesh);
    });
}

function addAirports(scene, earthRadius) {
    geojsonDataAirports.features.forEach((feature) => {
        const lon = feature.geometry.coordinates[0];
        const lat = feature.geometry.coordinates[1];
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 89.96) * (Math.PI / 180);
        const radius = (earthRadius + heightOffset);
        const airportGeometry = new THREE.SphereGeometry(2, 4, 4);
        const airportMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
        const airportMesh = new THREE.Mesh(airportGeometry, airportMaterial);
        airportMesh.position.setFromSphericalCoords(radius, phi, theta);
        scene.add(airportMesh);
    });
}

function addStates(scene, earthRadius) {
    geojsonDataStates.features.forEach((feature) => {
        const geometryType = feature.geometry.type;
        let polygons = [];

        if (geometryType === 'Polygon') {
            polygons = [feature.geometry.coordinates];  // Wrap in an array to unify handling
        } else if (geometryType === 'MultiPolygon') {
            polygons = feature.geometry.coordinates;
        }

        polygons.forEach(polygon => {
            polygon.forEach(ring => {
                const points = ring.map(([lon, lat]) => {
                    const phi = (90 - lat) * (Math.PI / 180); 
                    const theta = (lon + 89.96) * (Math.PI / 180);
                    const radius = (earthRadius + heightOffset);  // Slightly above surface to prevent z-fighting
                    return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
                });
                // Close the loop by adding the first point again
                points.push(points[0]);
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                const lineMaterial = stateLinesMaterial;
                const lineMesh = new THREE.Line(lineGeometry, lineMaterial);
                scene.add(lineMesh);
            });
        });
    });
}

export { addLatitudeLines, addLongitudeLines, addCountryBorders, addCities, addAirports, addStates};
