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
     * @param {object}         opts       — { heightOffset, circleTextureSize, … }
     */
    constructor(
        parentMesh,
        radius,
        countryGeo,
        stateGeo,
        opts = {}
    ) {
        this.root = parentMesh;
        this.radius = radius + (opts.heightOffset ?? 0.01);
        this.countryGeo = countryGeo;
        this.stateGeo = stateGeo;

        /* ---------- shared resources ---------- */
        this.circleTexture = this.#createCircleTexture(opts.circleTextureSize ?? 64);

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
        geojson?.features.forEach(feat => {
            const [lon, lat] = feat.geometry.coordinates;
            const pos = this.#spherical(lon, lat);

            // Create a sprite marker for points of interest
            const spriteMaterial = new THREE.SpriteMaterial({
                map: material.map,
                color: material.color.getHex(),
                transparent: material.transparent,
                alphaTest: material.alphaTest,
                depthWrite: false
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.copy(pos);
            sprite.renderOrder = 3;
            sprite.userData = { feature: feat, category };

            this.root.add(sprite);
            this.points[category].push(sprite);
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
}
