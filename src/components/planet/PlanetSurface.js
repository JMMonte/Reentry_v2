import * as THREE from 'three';

/**
 * Adds graticules, borders and point‐of‐interest billboards to a planet mesh.
 * All primitives are children of `parentMesh`, so they inherit its transforms.
 */
export class PlanetSurface {
    /**
     * @param {THREE.Object3D} parentMesh — the planet mesh (or a group) to attach children to
     * @param {number}         planetRadius — core planet radius (scene units)
     * @param {object}         countryGeo — GeoJSON with national borders
     * @param {object}         stateGeo   — GeoJSON with state / province borders
     * @param {object}         opts       — configuration options:
     *   @param {number} [opts.heightOffset=2]       — offset above the surface
     *   @param {number} [opts.circleTextureSize=32]   — size of the point texture
     *   @param {number} [opts.circleSegments=16]      — segments for circle geometry
     *   @param {number} [opts.markerSize=1]           — radius of the marker circle
     *   @param {number} [opts.fadeStartPixelSize=50]   — Default: fade starts when planet apparent height < 50px
     *   @param {number} [opts.fadeEndPixelSize=15]      — Default: fully faded when planet apparent height < 15px
     */
    constructor(
        parentMesh,
        planetRadius,
        countryGeo,
        stateGeo,
        opts = {}
    ) {
        // Attach primitives directly to the planet mesh so its scale (oblateness) is applied
        this.root = parentMesh;
        // Destructure options with defaults
        const {
            heightOffset = 2,
            circleTextureSize = 64,
            circleSegments = 16,
            markerSize = 1,
            fadeStartPixelSize = 50,
            fadeEndPixelSize = 15,
            polarScale = 1.0
        } = opts;
        this.polarScale = polarScale;
        // Assign properties
        this.planetRadius = planetRadius;
        this.heightOffset = heightOffset;
        this.circleTextureSize = circleTextureSize;
        this.circleSegments = circleSegments;
        this.markerSize = markerSize;
        this.fadeStartPixelSize = fadeStartPixelSize;
        this.fadeEndPixelSize = fadeEndPixelSize;
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

        // Internal state for line visibility toggles
        this.lineVisibility = {
            surfaceLines: true, // Default state for graticules
            countryBorders: true, // Default state for country borders
            states: true       // Default state for state borders
        };

        // Internal state for visibility toggles
        this.pointVisibility = {
            cities: true, airports: true, spaceports: true,
            groundStations: true, observatories: true, missions: true
        };
    }

    /* ===== graticule lines ===== */

    addLatitudeLines(step = 10) { this.#addGraticule(step, true); }
    addLongitudeLines(step = 10) { this.#addGraticule(step, false); }

    #addGraticule(step, isLat) {
        const majorStep = step * 3;
        const rangeStart = isLat ? -90 : -180;
        const rangeEnd = isLat ? 90 : 180;
        const innerStep = 2;
        const majorPoints = [];
        const minorPoints = [];
        for (let d = rangeStart; d <= rangeEnd; d += step) {
            const pts = [];
            if (isLat) {
                for (let lon = -180; lon <= 180; lon += innerStep) {
                    pts.push(this.#spherical(lon, d));
                }
            } else {
                for (let lat = -90; lat <= 90; lat += innerStep) {
                    pts.push(this.#spherical(d, lat));
                }
            }
            pts.push(pts[0]); // close loop
            const target = (d % majorStep === 0) ? majorPoints : minorPoints;
            for (let i = 0; i < pts.length - 1; i++) {
                target.push(pts[i], pts[i + 1]);
            }
        }
        if (majorPoints.length > 0) {
            const majorGeom = new THREE.BufferGeometry().setFromPoints(majorPoints);
            const majorLine = new THREE.LineSegments(majorGeom, this.materials.latitudeMajor);
            this.root.add(majorLine);
            this.surfaceLines.push(majorLine);
        }
        if (minorPoints.length > 0) {
            const minorGeom = new THREE.BufferGeometry().setFromPoints(minorPoints);
            const minorLine = new THREE.LineSegments(minorGeom, this.materials.latitudeMinor);
            this.root.add(minorLine);
            this.surfaceLines.push(minorLine);
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
        const circleGeom = this.circleGeom;
        const poiRenderOrder = this.poiRenderOrder ?? 3;
        geojson?.features.forEach(feat => {
            const [lon, lat] = feat.geometry.coordinates;
            // Compute position on oblate spheroid via mesh scale + offset
            const pos = this.#spherical(lon, lat);
            const circleMaterial = new THREE.MeshBasicMaterial({
                map: material.map,
                color: material.color.getHex(),
                transparent: material.transparent,
                alphaTest: material.alphaTest,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(circleGeom, circleMaterial);
            mesh.position.copy(pos);
            // Compute local normal (sphere normal) and transform to world for orientation
            const sphereNorm = mesh.position.clone().normalize();
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.root.matrixWorld);
            const worldNorm = sphereNorm.applyMatrix3(normalMatrix).normalize();
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNorm);
            mesh.renderOrder = poiRenderOrder;
            mesh.userData = { feature: feat, category };
            mesh.visible = true;
            this.root.add(mesh);
            this.points[category].push(mesh);
        });
    }

    /* ===== visibility helpers ===== */

    #setPointsVisible(cat, v) {
        // Update internal state
        this.pointVisibility[cat] = v;
        // Update actual mesh visibility immediately based on current fade opacity
        // This avoids waiting for the next updateFade call
        this.points[cat].forEach(m => {
            const currentOpacity = m.material.opacity;
            m.visible = v && currentOpacity > 0;
        });
    }

    setSurfaceLinesVisible(v) {
        this.lineVisibility.surfaceLines = v;
        this.surfaceLines.forEach(l => { l.visible = v && l.material.opacity > 0; });
    }
    setCountryBordersVisible(v) {
        this.lineVisibility.countryBorders = v;
        this.countryBorders.forEach(b => { b.visible = v && b.material.opacity > 0; });
    }
    setStatesVisible(v) {
        this.lineVisibility.states = v;
        this.states.forEach(s => { s.visible = v && s.material.opacity > 0; });
    }

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
        // Compute point on unit sphere, then scale by planetRadius + offset
        const radius = this.planetRadius + this.heightOffset;
        const v = new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
        // Apply polar scaling for oblateness
        v.y *= this.polarScale;
        return v;
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
     * Update feature opacity based on camera distance and planet's apparent size.
     * @param {THREE.Camera} camera
     */
    updateFade(camera) {
        if (!camera || !window) return;

        const worldPos = new THREE.Vector3();
        this.root.getWorldPosition(worldPos);
        const dist = worldPos.distanceTo(camera.position);

        const fovY = THREE.MathUtils.degToRad(camera.fov);
        const screenH = window.innerHeight;
        const angularDiameter = 2 * Math.atan(this.planetRadius / dist);
        const pixelHeight = (angularDiameter / fovY) * screenH;

        let opacity;
        if (pixelHeight >= this.fadeStartPixelSize) {
            opacity = 1;
        } else if (pixelHeight <= this.fadeEndPixelSize) {
            opacity = 0;
        } else {
            opacity = (pixelHeight - this.fadeEndPixelSize) / (this.fadeStartPixelSize - this.fadeEndPixelSize);
        }

        // Clamp opacity
        const clampedOpacity = Math.max(0, Math.min(1, opacity));

        // Apply to graticules, borders, and states
        const surfaceLinesVisible = this.lineVisibility.surfaceLines;
        this.surfaceLines.forEach(line => {
            line.material.opacity = clampedOpacity;
            line.visible = surfaceLinesVisible && clampedOpacity > 0;
        });

        const countryBordersVisible = this.lineVisibility.countryBorders;
        this.countryBorders.forEach(line => {
            line.material.opacity = clampedOpacity;
            line.visible = countryBordersVisible && clampedOpacity > 0;
        });

        const statesVisible = this.lineVisibility.states;
        this.states.forEach(line => {
            line.material.opacity = clampedOpacity;
            line.visible = statesVisible && clampedOpacity > 0;
        });

        // Apply to point features, respecting individual visibility toggles
        for (const category in this.points) {
            const isCategoryVisible = this.pointVisibility[category];
            this.points[category].forEach(mesh => {
                mesh.material.opacity = clampedOpacity;
                // Visible only if category toggle is on AND fade opacity > 0
                mesh.visible = isCategoryVisible && clampedOpacity > 0;
            });
        }
    }
}
