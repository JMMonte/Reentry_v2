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
            // Defensive check: skip invalid lines
            if (majorPoints.length < 2 || majorPoints.some(p => !p.isVector3 || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z))) {
                console.warn('Skipping invalid major graticule line geometry in PlanetSurface:', majorPoints);
            } else {
                const majorGeom = new THREE.BufferGeometry().setFromPoints(majorPoints);
                const majorLine = new THREE.LineSegments(majorGeom, this.materials.latitudeMajor);
                this.root.add(majorLine);
                this.surfaceLines.push(majorLine);
            }
        }
        if (minorPoints.length > 0) {
            if (minorPoints.length < 2 || minorPoints.some(p => !p.isVector3 || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z))) {
                console.warn('Skipping invalid minor graticule line geometry in PlanetSurface:', minorPoints);
            } else {
                const minorGeom = new THREE.BufferGeometry().setFromPoints(minorPoints);
                const minorLine = new THREE.LineSegments(minorGeom, this.materials.latitudeMinor);
                this.root.add(minorLine);
                this.surfaceLines.push(minorLine);
            }
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
                // Defensive check: skip invalid lines
                if (pts.length < 2 || pts.some(p => !p.isVector3 || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z))) {
                    console.warn('Skipping invalid border line geometry in PlanetSurface:', pts);
                    return;
                }
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
            // Defensive check: skip invalid POIs
            if (!pos.isVector3 || !isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
                console.warn('Skipping invalid POI position in PlanetSurface:', pos, feat);
                return;
            }
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
        // Update internal state only
        this.pointVisibility[cat] = v;
        // DO NOT set m.visible here; updateFade will handle it.
    }

    setSurfaceLinesVisible(v) {
        this.lineVisibility.surfaceLines = v;
        // DO NOT set l.visible here; updateFade will handle it.
    }
    setCountryBordersVisible(v) {
        this.lineVisibility.countryBorders = v;
        // DO NOT set b.visible here; updateFade will handle it.
    }
    setStatesVisible(v) {
        this.lineVisibility.states = v;
        // DO NOT set s.visible here; updateFade will handle it.
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
        if (!camera || !this.root?.visible) return;

        const vFOV = THREE.MathUtils.degToRad(camera.fov);
        const halfH = window.innerHeight / 2;

        const planetWorldPos = new THREE.Vector3();
        this.root.getWorldPosition(planetWorldPos);
        const distToPlanet = camera.position.distanceTo(planetWorldPos);
        const planetApparentRadius = (this.planetRadius / distToPlanet) * halfH / Math.tan(vFOV / 2);

        let masterOpacity;
        if (planetApparentRadius < this.fadeEndPixelSize) {
            masterOpacity = 0;
        } else if (planetApparentRadius < this.fadeStartPixelSize) {
            masterOpacity = (planetApparentRadius - this.fadeEndPixelSize) /
                (this.fadeStartPixelSize - this.fadeEndPixelSize);
        } else {
            masterOpacity = 1;
        }
        masterOpacity = THREE.MathUtils.clamp(masterOpacity, 0, 1);

        // Apply to surface lines based on their individual visibility flags
        const applyLineFade = (lines, visibilityFlag) => {
            lines.forEach(line => {
                if (line.material) { // Ensure material exists
                    line.material.opacity = masterOpacity;
                }
                line.visible = visibilityFlag && masterOpacity > 0;
            });
        };

        applyLineFade(this.surfaceLines, this.lineVisibility.surfaceLines);
        applyLineFade(this.countryBorders, this.lineVisibility.countryBorders);
        applyLineFade(this.states, this.lineVisibility.states);

        // Apply to POIs (points) based on their individual visibility flags
        Object.keys(this.points).forEach(cat => {
            const categoryIsCurrentlyVisible = this.pointVisibility[cat];
            this.points[cat].forEach(mesh => {
                if (mesh.material) { // Ensure material exists
                    mesh.material.opacity = masterOpacity;
                }
                mesh.visible = categoryIsCurrentlyVisible && masterOpacity > 0;

                if (mesh.visible) {
                    const poiWorldPos = new THREE.Vector3();
                    // Ensure mesh's world matrix is updated if its parent (this.root) has moved
                    // this.root.updateWorldMatrix(true, false); // Done by THREE.js render loop or App3D's sceneManager
                    mesh.getWorldPosition(poiWorldPos); 
                    const distToPOI = camera.position.distanceTo(poiWorldPos);
                    
                    const pixelSizeTarget = 8; 
                    const poiScale = (distToPOI / (halfH / Math.tan(vFOV / 2))) * pixelSizeTarget;
                    // Clamp scale to avoid POIs becoming too small or inverted
                    const minScale = 0.1; // Minimum sensible scale
                    const maxScale = 100; // Maximum sensible scale (adjust as needed)
                    mesh.scale.set(
                        THREE.MathUtils.clamp(poiScale, minScale, maxScale), 
                        THREE.MathUtils.clamp(poiScale, minScale, maxScale), 
                        1
                    );
                }
            });
        });
    }
}
