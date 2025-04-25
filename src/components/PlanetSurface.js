import * as THREE from 'three';

export class PlanetSurface {
    constructor(parentMesh, earthRadius, primaryGeojsonData, stateGeojsonData, surfaceOptions = {}) {
        this.scene = parentMesh;
        this.earthRadius = earthRadius;
        this.heightOffset = surfaceOptions.heightOffset || 0.01;
        this.radius = this.earthRadius + this.heightOffset;

        this.primaryGeojsonData = primaryGeojsonData;
        this.stateGeojsonData = stateGeojsonData;

        this.circleTexture = this.createCircleTexture(surfaceOptions.circleTextureSize || 64);

        this.materials = {
            latitudeLineMajor: new THREE.LineBasicMaterial({color: 0x00A5FF, transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor}),
            latitudeLineMinor: new THREE.LineBasicMaterial({color: 0x00A5FF, transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor}),
            countryLine: new THREE.LineBasicMaterial({color: 0x00A5FF, transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor}),
            stateLine: new THREE.LineBasicMaterial({color: 0x00FF00, transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor}),
            cityPoint: new THREE.PointsMaterial({color: 0x00A5FF, map: this.circleTexture, alphaTest: 0.5, transparent: true, depthWrite: true, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, sizeAttenuation: false, size: 4}),
            airportPoint: new THREE.PointsMaterial({color: 0xFF0000, map: this.circleTexture, alphaTest: 0.5, transparent: true, depthWrite: true, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, sizeAttenuation: false, size: 4}),
            spaceportPoint: new THREE.PointsMaterial({color: 0xFFD700, map: this.circleTexture, alphaTest: 0.5, transparent: true, depthWrite: true, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, sizeAttenuation: false, size: 4}),
            groundStationPoint: new THREE.PointsMaterial({color: 0x00FF00, map: this.circleTexture, alphaTest: 0.5, transparent: true, depthWrite: true, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, sizeAttenuation: false, size: 4}),
            observatoryPoint: new THREE.PointsMaterial({color: 0xFF00FF, map: this.circleTexture, alphaTest: 0.5, transparent: true, depthWrite: true, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, sizeAttenuation: false, size: 4})
        };

        this.surfaceLines = [];
        this.countryBorders = [];
        this.states = [];
        this.points = {cities: [], airports: [], spaceports: [], groundStations: [], observatories: []};
    }

    addLatitudeLines(step = 10) {
        const majorStep = step * 3;
        for (let lat = -90; lat <= 90; lat += step) {
            const lineGeometry = new THREE.BufferGeometry();
            const points = [];
            for (let lon = -180; lon <= 180; lon += 2) {
                const phi = THREE.MathUtils.degToRad(90 - lat);
                const theta = THREE.MathUtils.degToRad(lon);
                const x = this.radius * Math.sin(phi) * Math.cos(theta);
                const y = this.radius * Math.cos(phi);
                const z = this.radius * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            points.push(points[0]);
            lineGeometry.setFromPoints(points);
            const material = (lat % majorStep === 0) ? this.materials.latitudeLineMajor : this.materials.latitudeLineMinor;
            const line = new THREE.Line(lineGeometry, material);
            this.scene.add(line);
            this.surfaceLines.push(line);
        }
    }

    addLongitudeLines(step = 10) {
        const majorStep = step * 3;
        for (let lon = -180; lon <= 180; lon += step) {
            const lineGeometry = new THREE.BufferGeometry();
            const points = [];
            for (let lat = -90; lat <= 90; lat += 2) {
                const phi = THREE.MathUtils.degToRad(90 - lat);
                const theta = THREE.MathUtils.degToRad(lon);
                const x = this.radius * Math.sin(phi) * Math.cos(theta);
                const y = this.radius * Math.cos(phi);
                const z = this.radius * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
            points.push(points[0]);
            lineGeometry.setFromPoints(points);
            const material = (lon % majorStep === 0) ? this.materials.latitudeLineMajor : this.materials.latitudeLineMinor;
            const line = new THREE.Line(lineGeometry, material);
            this.scene.add(line);
            this.surfaceLines.push(line);
        }
    }

    addInstancedPoints(geojsonData, material, category, dotRadius = 0.05) {
        const instCount = geojsonData.features.length;
        const sphereGeo = new THREE.SphereGeometry(dotRadius, 6, 6);
        const meshMat = new THREE.MeshBasicMaterial({
            color: material.color,
            map: material.map,
            alphaTest: material.alphaTest,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
            depthTest: material.depthTest,
            blending: material.blending,
            blendEquation: material.blendEquation,
            blendSrc: material.blendSrc,
            blendDst: material.blendDst
        });
        const inst = new THREE.InstancedMesh(sphereGeo, meshMat, instCount);
        inst.renderOrder = 3;
        inst.userData = {features: geojsonData.features, category};
        const tempObj = new THREE.Object3D();
        for (let i = 0; i < instCount; i++) {
            const feat = geojsonData.features[i];
            const [lon, lat] = feat.geometry.coordinates;
            const phi = THREE.MathUtils.degToRad(90 - lat);
            const theta = THREE.MathUtils.degToRad(lon);
            const pos = new THREE.Vector3().setFromSphericalCoords(this.radius, phi, theta);
            tempObj.position.copy(pos);
            tempObj.updateMatrix();
            inst.setMatrixAt(i, tempObj.matrix);
        }
        inst.instanceMatrix.needsUpdate = true;
        this.scene.add(inst);
        this.points[category].push(inst);
    }

    addCountryBorders() {
        this.primaryGeojsonData.features.forEach(feature => {
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
                        const phi = THREE.MathUtils.degToRad(90 - lat);
                        const theta = THREE.MathUtils.degToRad(lon);
                        return new THREE.Vector3().setFromSphericalCoords(this.radius, phi, theta);
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
        this.stateGeojsonData.features.forEach(feature => {
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
                        const phi = THREE.MathUtils.degToRad(90 - lat);
                        const theta = THREE.MathUtils.degToRad(lon);
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
        this.points[category].forEach(point => point.visible = visible);
    }

    setCitiesVisible(visible) { this.setPointsVisible('cities', visible); }
    setAirportsVisible(visible) { this.setPointsVisible('airports', visible); }
    setSpaceportsVisible(visible) { this.setPointsVisible('spaceports', visible); }
    setGroundStationsVisible(visible) { this.setPointsVisible('groundStations', visible); }
    setObservatoriesVisible(visible) { this.setPointsVisible('observatories', visible); }
    setCountryBordersVisible(visible) { this.countryBorders.forEach(border => border.visible = visible); }
    setStatesVisible(visible) { this.states.forEach(state => state.visible = visible); }
    setSurfaceLinesVisible(visible) { this.surfaceLines.forEach(line => line.visible = visible); }
} 