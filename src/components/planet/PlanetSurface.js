import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
        
        // Create LOD group
        this.lod = new THREE.LOD();
        this.root.add(this.lod);
        
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

        /* ---------- materials with transparency ---------- */
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
            latitudeMajor: lineMat(0x5d6d7d),  // Neutral gray-blue for graticules
            latitudeMinor: lineMat(0x5d6d7d),  // Same neutral gray-blue
            countryLine: lineMat(0x7788aa),    // Light gray-blue for countries
            stateLine: lineMat(0x8899bb),      // Very light gray-blue for states
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
        
        // LOD detail groups
        this.detailHigh = new THREE.Group();
        this.detailMedium = new THREE.Group();
        this.detailLow = new THREE.Group();
        
        // Geometry collections for merging - separate for each type
        this.graticuleGeometries = {
            high: [],
            medium: [],
            low: []
        };
        this.countryGeometries = {
            high: [],
            medium: []
        };
        this.stateGeometries = {
            high: [],
            medium: []
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
        
        // Different sampling for different LOD levels
        this.#addGraticuleLOD(step, isLat, 2, this.detailHigh);    // High detail: 2° sampling
        this.#addGraticuleLOD(step * 2, isLat, 5, this.detailMedium); // Medium: fewer lines, 5° sampling
        this.#addGraticuleLOD(step * 3, isLat, 10, this.detailLow);   // Low: major lines only, 10° sampling
    }
    
    #addGraticuleLOD(step, isLat, innerStep, targetGroup) {
        const majorStep = step * 3;
        const rangeStart = isLat ? -90 : -180;
        const rangeEnd = isLat ? 90 : 180;
        
        // Determine which geometry collection to use
        let targetCollection;
        if (targetGroup === this.detailHigh) targetCollection = this.graticuleGeometries.high;
        else if (targetGroup === this.detailMedium) targetCollection = this.graticuleGeometries.medium;
        else if (targetGroup === this.detailLow) targetCollection = this.graticuleGeometries.low;
        
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
            
            // Convert to line segments
            const segmentPoints = [];
            for (let i = 0; i < pts.length - 1; i++) {
                segmentPoints.push(pts[i], pts[i + 1]);
            }
            
            if (segmentPoints.length >= 2) {
                const geom = new THREE.BufferGeometry().setFromPoints(segmentPoints);
                targetCollection.push(geom);
            }
        }
    }

    /* ===== borders ===== */

    addCountryBorders() { this.#addBorders(this.countryGeo, this.materials.countryLine, this.countryBorders); }
    addStates() { this.#addBorders(this.stateGeo, this.materials.stateLine, this.states); }

    #addBorders(geojson, material, store) {
        // Add borders to all LOD levels but with different simplification
        this.#addBordersLOD(geojson, material, store, this.detailHigh, 1);    // Full detail
        this.#addBordersLOD(geojson, material, store, this.detailMedium, 3);  // Skip every 3rd point
        // No borders in low detail
    }
    
    #addBordersLOD(geojson, material, store, targetGroup, simplify) {
        // Determine which geometry collection to use based on material/store type
        let targetCollection;
        const isCountry = material === this.materials.countryLine;
        const isState = material === this.materials.stateLine;
        
        if (targetGroup === this.detailHigh) {
            targetCollection = isCountry ? this.countryGeometries.high : this.stateGeometries.high;
        } else if (targetGroup === this.detailMedium) {
            targetCollection = isCountry ? this.countryGeometries.medium : this.stateGeometries.medium;
        }
        
        geojson?.features.forEach(f => {
            const polys = f.geometry.type === 'Polygon'
                ? [f.geometry.coordinates]
                : f.geometry.coordinates;

            polys.forEach(poly => poly.forEach(ring => {
                const pts = [];
                for (let i = 0; i < ring.length; i += simplify) {
                    pts.push(this.#spherical(ring[i][0], ring[i][1]));
                }
                if (pts.length < 2) return;
                
                pts.push(pts[0]); // close loop
                
                // Convert to line segments
                const segmentPoints = [];
                for (let i = 0; i < pts.length - 1; i++) {
                    segmentPoints.push(pts[i], pts[i + 1]);
                }
                
                if (segmentPoints.length >= 2) {
                    const geom = new THREE.BufferGeometry().setFromPoints(segmentPoints);
                    targetCollection.push(geom);
                }
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
     * Initialize LOD levels after all content is added
     */
    initializeLOD() {
        // Merge graticule geometries
        if (this.graticuleGeometries.high.length > 0) {
            const merged = mergeGeometries(this.graticuleGeometries.high);
            const line = new THREE.LineSegments(merged, this.materials.latitudeMajor.clone());
            line.userData.lineType = 'graticule';
            this.detailHigh.add(line);
            this.surfaceLines.push(line);
        }
        if (this.graticuleGeometries.medium.length > 0) {
            const merged = mergeGeometries(this.graticuleGeometries.medium);
            const line = new THREE.LineSegments(merged, this.materials.latitudeMajor.clone());
            line.userData.lineType = 'graticule';
            this.detailMedium.add(line);
            this.surfaceLines.push(line);
        }
        if (this.graticuleGeometries.low.length > 0) {
            const merged = mergeGeometries(this.graticuleGeometries.low);
            const line = new THREE.LineSegments(merged, this.materials.latitudeMajor.clone());
            line.userData.lineType = 'graticule';
            this.detailLow.add(line);
            this.surfaceLines.push(line);
        }
        
        // Merge country border geometries
        if (this.countryGeometries.high.length > 0) {
            const merged = mergeGeometries(this.countryGeometries.high);
            const line = new THREE.LineSegments(merged, this.materials.countryLine.clone());
            line.userData.lineType = 'country';
            this.detailHigh.add(line);
            this.countryBorders.push(line);
        }
        if (this.countryGeometries.medium.length > 0) {
            const merged = mergeGeometries(this.countryGeometries.medium);
            const line = new THREE.LineSegments(merged, this.materials.countryLine.clone());
            line.userData.lineType = 'country';
            this.detailMedium.add(line);
            this.countryBorders.push(line);
        }
        
        // Merge state border geometries
        if (this.stateGeometries.high.length > 0) {
            const merged = mergeGeometries(this.stateGeometries.high);
            const line = new THREE.LineSegments(merged, this.materials.stateLine.clone());
            line.userData.lineType = 'state';
            this.detailHigh.add(line);
            this.states.push(line);
        }
        if (this.stateGeometries.medium.length > 0) {
            const merged = mergeGeometries(this.stateGeometries.medium);
            const line = new THREE.LineSegments(merged, this.materials.stateLine.clone());
            line.userData.lineType = 'state';
            this.detailMedium.add(line);
            this.states.push(line);
        }
        
        // Set up LOD distances based on planet radius to match RadialGrid system
        const baseDistance = this.planetRadius * 25;  // Match RadialGrid base distance
        
        this.lod.addLevel(this.detailHigh, 0);
        this.lod.addLevel(this.detailMedium, baseDistance);  // Switch to medium at 25x radius
        this.lod.addLevel(new THREE.Group(), baseDistance * 4);  // Fade out at 100x radius to match RadialGrid exactly
    }
    
    /**
     * Update feature opacity based on camera distance and planet's apparent size.
     * @param {THREE.Camera} camera
     */
    updateFade(camera) {
        if (!camera || !this.root?.visible) return;
        
        // Check if ANY lines are visible - if not, skip calculations
        const anyLinesVisible = this.lineVisibility.surfaceLines || 
                               this.lineVisibility.countryBorders || 
                               this.lineVisibility.states;
        
        if (!anyLinesVisible && !Object.values(this.pointVisibility).some(v => v)) {
            this.lod.visible = false;
            return; // Skip all calculations if nothing is visible
        }

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
        
        // Skip further processing if fully transparent
        if (masterOpacity === 0) {
            this.lod.visible = false;
            return;
        }

        // Apply opacity and visibility to lines based on their type
        [this.detailHigh, this.detailMedium, this.detailLow].forEach(detail => {
            if (detail) {
                detail.traverse(obj => {
                    if ((obj instanceof THREE.Line || obj instanceof THREE.LineSegments) && obj.material) {
                        const lineType = obj.userData.lineType;
                        let shouldBeVisible = false;
                        
                        if (lineType === 'graticule') shouldBeVisible = this.lineVisibility.surfaceLines;
                        else if (lineType === 'country') shouldBeVisible = this.lineVisibility.countryBorders;
                        else if (lineType === 'state') shouldBeVisible = this.lineVisibility.states;
                        
                        obj.material.opacity = masterOpacity;
                        obj.visible = shouldBeVisible && masterOpacity > 0;
                    }
                });
            }
        });
        
        // LOD group is visible if any lines should be shown
        this.lod.visible = anyLinesVisible && masterOpacity > 0;

        // Apply to POIs (points) based on their individual visibility flags
        Object.keys(this.points).forEach(cat => {
            const categoryIsCurrentlyVisible = this.pointVisibility[cat];
            this.points[cat].forEach(mesh => {
                if (mesh.material) {
                    mesh.material.opacity = masterOpacity;
                }
                mesh.visible = categoryIsCurrentlyVisible && masterOpacity > 0;

                if (mesh.visible) {
                    const poiWorldPos = new THREE.Vector3();
                    mesh.getWorldPosition(poiWorldPos); 
                    const distToPOI = camera.position.distanceTo(poiWorldPos);
                    
                    const pixelSizeTarget = 8; 
                    const poiScale = (distToPOI / (halfH / Math.tan(vFOV / 2))) * pixelSizeTarget;
                    const minScale = 0.1;
                    const maxScale = 100;
                    mesh.scale.set(
                        THREE.MathUtils.clamp(poiScale, minScale, maxScale), 
                        THREE.MathUtils.clamp(poiScale, minScale, maxScale), 
                        1
                    );
                }
            });
        });
    }

    /**
     * Dispose of all Three.js resources to prevent memory leaks
     */
    dispose() {
        // Dispose of textures
        if (this.circleTexture) {
            this.circleTexture.dispose();
        }
        
        // Dispose of geometries
        if (this.circleGeom) {
            this.circleGeom.dispose();
        }
        
        // Dispose of materials
        Object.values(this.materials).forEach(material => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
        
        // Dispose of all mesh geometries and remove from scene
        const disposeGroup = (group) => {
            if (!group) return;
            
            group.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            
            if (group.parent) group.parent.remove(group);
        };
        
        // Dispose all detail groups
        disposeGroup(this.detailHigh);
        disposeGroup(this.detailMedium);
        disposeGroup(this.detailLow);
        
        // Dispose LOD and remove from parent
        if (this.lod) {
            this.lod.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            if (this.lod.parent) this.lod.parent.remove(this.lod);
        }
        
        // Clear all arrays
        this.surfaceLines = [];
        this.countryBorders = [];
        this.states = [];
        Object.keys(this.points).forEach(key => {
            this.points[key] = [];
        });
        
        // Clear references
        this.root = null;
        this.materials = null;
    }
}
