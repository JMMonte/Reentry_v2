import * as THREE from 'three';

/**
 * Adds graticules, borders and point‐of‐interest billboards to a planet mesh.
 * All primitives are children of `parentMesh`, so they inherit its transforms.
 */
export class PlanetSurface {
    /**
     * @param {THREE.Object3D} parentMesh — the planet mesh (or a group) to attach children to
     * @param {number}         radius     — planet radius (scene units)
     * @param {object}         countryGeo — GeoJSON with national borders
     * @param {object}         stateGeo   — GeoJSON with state / province borders
     * @param {object}         opts       — configuration options:
     *   @param {number} [opts.heightOffset=0.01]       — offset above the surface
     *   @param {number} [opts.circleTextureSize=32]   — size of the point texture
     *   @param {number} [opts.circleSegments=16]      — segments for circle geometry
     *   @param {number} [opts.markerSize=1]           — radius of the marker circle
     *   @param {number} [opts.fadeStartFactor=2.0]      — fade out surface features between these radius multiples
     *   @param {number} [opts.fadeEndFactor=3.0]        — fade out surface features between these radius multiples
     */
    constructor(
        parentMesh,
        radius,
        countryGeo,
        stateGeo,
        opts = {}
    ) {
        this.root = parentMesh;
        // Destructure options with defaults
        const {
            heightOffset = 0.01,
            circleTextureSize = 64,
            circleSegments = 16,
            markerSize = 1,
            fadeStartFactor = 2.0,
            fadeEndFactor = 3.0
        } = opts;
        // Assign properties
        this.heightOffset = heightOffset;
        this.circleTextureSize = circleTextureSize;
        this.circleSegments = circleSegments;
        this.markerSize = markerSize;
        this.radius = radius + heightOffset;
        this.fadeStartDistance = this.radius * fadeStartFactor;
        this.fadeEndDistance = this.radius * fadeEndFactor;
        this.countryGeo = countryGeo;
        this.stateGeo = stateGeo;

        /* ---------- shared resources ---------- */
        this.circleTexture = this.#createCircleTexture(circleTextureSize);
        // Pre-create circle geometry for POI markers
        this.circleGeom = new THREE.CircleGeometry(markerSize, circleSegments);

        /* ---------- materials ---------- */
        const lineMat = c => new THREE.LineBasicMaterial({
            color: c, transparent: true, depthWrite: false, blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor
        });
        const pointMat = c => new THREE.PointsMaterial({
            color: c, map: this.circleTexture, size: 8, alphaTest: 0.5,
            transparent: true, depthWrite: false, blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor, sizeAttenuation: false
        });

        this.materials = {
            latitudeMajor: lineMat(0x00a5ff),
            latitudeMinor: lineMat(0x00a5ff),
            countryLine: lineMat(0x00a5ff),
            stateLine: lineMat(0x00ff00),
            cityPoint: pointMat(0x00a5ff),
            airportPoint: pointMat(0xff0000),
            spaceportPoint: pointMat(0xffd700),
            groundStationPoint: pointMat(0x00ff00),
            observatoryPoint: pointMat(0xff00ff),
            missionPoint: pointMat(0xffff00)
        };

        /* ---------- collections ---------- */
        this.surfaceLines = [];
        this.countryBorders = [];
        this.states = [];
        this.points = {
            cities: [], airports: [], spaceports: [],
            groundStations: [], observatories: [], missions: []
        };
    }

    /* ===== graticule lines ===== */

    addLatitudeLines(step = 10) { this.#addGraticule(step, true); }
    addLongitudeLines(step = 10) { this.#addGraticule(step, false); }

    #addGraticule(step, isLat) {
        const majorStep = step * 3;
        const rangeStart = isLat ? -90 : -180;
        const rangeEnd = isLat ? 90 : 180;

        for (let d = rangeStart; d <= rangeEnd; d += step) {
            const pts = [];
            const innerStep = 2;
            if (isLat) {
                for (let lon = -180; lon <= 180; lon += innerStep)
                    pts.push(this.#spherical(lon, d));
            } else {
                for (let lat = -90; lat <= 90; lat += innerStep)
                    pts.push(this.#spherical(d, lat));
            }
            pts.push(pts[0]); // close loop

            const mat = (d % majorStep === 0)
                ? this.materials.latitudeMajor
                : this.materials.latitudeMinor;

            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                mat
            );
            this.root.add(line);
            this.surfaceLines.push(line);
        }
    }

    /* ===== borders ===== */

    addCountryBorders() { this.#addBorders(this.countryGeo, this.materials.countryLine, this.countryBorders); }
    addStates() { this.#addBorders(this.stateGeo, this.materials.stateLine, this.states); }

    #addBorders(geojson, material, store) {
        geojson?.features.forEach(f => {
            const polys = f.geometry.type === 'Polygon'
                ? [f.geometry.coordinates]
                : f.geometry.coordinates;

            polys.forEach(poly => poly.forEach(ring => {
                const pts = ring.map(([lon, lat]) => this.#spherical(lon, lat));
                pts.push(pts[0]);
                const line = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(pts),
                    material
                );
                this.root.add(line);
                store.push(line);
            }));
        });
    }

    /* ===== points-of-interest ===== */

    /**
     * Adds billboard markers for a GeoJSON FeatureCollection.
     * @param {object}            geojson   GeoJSON collection with Point coords
     * @param {THREE.Material}    material  base material (will be cloned)
     * @param {keyof this.points} category  'cities' | 'airports' | …
     */
    addInstancedPoints(geojson, material, category) {
        // Use pre-created circle geometry for POI markers
        const circleGeom = this.circleGeom;
        geojson?.features.forEach(feat => {
            const [lon, lat] = feat.geometry.coordinates;
            const pos = this.#spherical(lon, lat);

            // Create a circle mesh marker for points of interest
            const circleMaterial = new THREE.MeshBasicMaterial({
                map: material.map,
                color: material.color.getHex(),
                transparent: material.transparent,
                alphaTest: material.alphaTest,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(circleGeom, circleMaterial);
            mesh.position.copy(pos);
            // Orient the marker flush with surface (normal along radial direction)
            const normal = pos.clone().normalize();
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            mesh.renderOrder = 3;
            mesh.userData = { feature: feat, category };
            mesh.visible = true;

            this.root.add(mesh);
            this.points[category].push(mesh);
        });
    }

    /* ===== visibility helpers ===== */

    #setPointsVisible(cat, v) { this.points[cat].forEach(m => m.visible = v); }

    setSurfaceLinesVisible(v) { this.surfaceLines.forEach(l => l.visible = v); }
    setCountryBordersVisible(v) { this.countryBorders.forEach(b => b.visible = v); }
    setStatesVisible(v) { this.states.forEach(s => s.visible = v); }

    setCitiesVisible(v) { this.#setPointsVisible('cities', v); }
    setAirportsVisible(v) { this.#setPointsVisible('airports', v); }
    setSpaceportsVisible(v) { this.#setPointsVisible('spaceports', v); }
    setGroundStationsVisible(v) { this.#setPointsVisible('groundStations', v); }
    setObservatoriesVisible(v) { this.#setPointsVisible('observatories', v); }
    setMissionsVisible(v) { this.#setPointsVisible('missions', v); }

    /* ===== internal utilities ===== */

    #spherical(lon, lat) {
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon + 90);
        return new THREE.Vector3().setFromSphericalCoords(this.radius, phi, theta);
    }

    #createCircleTexture(size) {
        const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        return new THREE.CanvasTexture(canvas);
    }

    /**
     * Update feature opacity based on camera distance to surface.
     * @param {THREE.Camera} camera
     */
    updateFade(camera) {
        if (!camera) return;
        const worldPos = new THREE.Vector3();
        this.root.getWorldPosition(worldPos);
        const dist = worldPos.distanceTo(camera.position);
        let opacity;
        if (dist <= this.fadeStartDistance) {
            opacity = 1;
        } else if (dist >= this.fadeEndDistance) {
            opacity = 0;
        } else {
            opacity = (this.fadeEndDistance - dist) / (this.fadeEndDistance - this.fadeStartDistance);
        }
        // Apply to graticules, borders, and states
        this.surfaceLines.forEach(line => { line.material.opacity = opacity; });
        this.countryBorders.forEach(line => { line.material.opacity = opacity; });
        this.states.forEach(line => { line.material.opacity = opacity; });
        // Apply to point features
        Object.values(this.points).flat().forEach(mesh => {
            mesh.material.opacity = opacity;
        });
    }
}
