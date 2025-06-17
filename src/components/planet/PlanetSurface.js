import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WebGLLabels } from '../../utils/WebGLLabels.js';
import { RENDER_ORDER } from './PlanetConstants.js';
import { objectPool } from '../../utils/ObjectPool.js';

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
     *   @param {number} [opts.atmosphereRenderOrder=100] — Render order for atmosphere
     *   @param {object} [opts.renderOrderOverrides={}] — Override render order values
     * @param {LabelManager} [labelManager] — optional LabelManager instance
     * @param {DisplaySettingsManager} [displaySettingsManager] — optional DisplaySettingsManager instance
     */
    constructor(
        parentMesh,
        planetRadius,
        countryGeo,
        stateGeo,
        opts = {},
        labelManager = null,
        displaySettingsManager = null
    ) {
        this.root = parentMesh;
        this.labelManager = labelManager;
        this.displaySettingsManager = displaySettingsManager;

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
            polarScale = 1.0,
            poiRenderOrder = 3,
            renderOrderOverrides = {},
            planetName = 'unknown'
        } = opts;
        this.polarScale = polarScale;
        this.poiRenderOrder = poiRenderOrder;
        this.planetName = planetName;
        
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
        this.renderOrderOverrides = renderOrderOverrides;

        // Set up label category for this planet's POI labels
        this.labelCategory = `poi_labels_${this.planetName.toLowerCase()}`;

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
            leaderLine: new THREE.LineBasicMaterial({
                color: 0x5d6d7d, transparent: true, opacity: 1.0,
                depthWrite: false, linewidth: 2
            }),
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

        // WebGL labels for POIs
        this.labels = {
            cities: [], airports: [], spaceports: [],
            groundStations: [], observatories: [], missions: []
        };

        // Leader lines connecting POIs to labels
        this.leaders = {
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

        // Internal state for visibility toggles - sync with display settings if available
        this.pointVisibility = this.#getInitialPOIVisibility();

        // Memoization for POI visibility updates
        this._poiVisibilityCache = {
            lastOpacity: -1,
            lastVisibilitySettings: null,
            needsUpdate: true
        };

        // Camera tracking for leader line updates
        this.lastCameraDistance = 0;
        this.leaderUpdateThreshold = 0.05; // 5% distance change triggers update

        // Animation state for the entire surface
        this.fadeAnimation = {
            targetOpacity: 1,
            currentOpacity: 1,
            startOpacity: 1,
            startTime: 0,
            animating: false
        };
        this.animationDuration = 300; // 300ms fade duration
    }

    /**
     * Get initial POI visibility from display settings or use defaults
     * @private
     */
    #getInitialPOIVisibility() {
        if (this.displaySettingsManager && this.displaySettingsManager.getSetting) {
            return {
                cities: this.displaySettingsManager.getSetting('showCities') ?? false,
                airports: this.displaySettingsManager.getSetting('showAirports') ?? false,
                spaceports: this.displaySettingsManager.getSetting('showSpaceports') ?? false,
                groundStations: this.displaySettingsManager.getSetting('showGroundStations') ?? false,
                observatories: this.displaySettingsManager.getSetting('showObservatories') ?? false,
                missions: this.displaySettingsManager.getSetting('showMissions') ?? false
            };
        }
        
        // Fallback to app defaults (matching DisplayOptions.jsx defaults)
        return {
            cities: false,
            airports: false,
            spaceports: false,
            groundStations: false,
            observatories: false,
            missions: false
        };
    }

    /**
     * Refresh POI visibility settings from display settings manager
     * @public
     */
    refreshPOIVisibilityFromSettings() {
        this.pointVisibility = this.#getInitialPOIVisibility();
        
        // Mark cache as needing update and force immediate visibility update
        this._poiVisibilityCache.needsUpdate = true;
        this._updatePOIVisibilityOptimized(1.0); // Force update with full opacity
    }

    /**
     * Centralized, memoized POI visibility update with single-pass efficiency
     * @private
     * @param {number} opacity - Global opacity (0-1)
     */
    _updatePOIVisibilityOptimized(opacity) {
        // Create visibility settings hash for memoization
        const visibilityHash = JSON.stringify(this.pointVisibility);
        
        // Check if visibility settings changed (this should trigger updates)
        const visibilityChanged = this._poiVisibilityCache.lastVisibilitySettings !== visibilityHash;
        
        // Check if opacity changed significantly (avoid micro-updates)
        const opacityChanged = Math.abs(this._poiVisibilityCache.lastOpacity - opacity) > 0.01;
        
        // Only update if something meaningful changed or forced update needed
        if (!this._poiVisibilityCache.needsUpdate && !visibilityChanged && !opacityChanged) {
            return; // No update needed
        }

        // Update cache
        this._poiVisibilityCache.lastOpacity = opacity;
        this._poiVisibilityCache.lastVisibilitySettings = visibilityHash;
        this._poiVisibilityCache.needsUpdate = false;

        // Single-pass update for all POI categories
        Object.keys(this.pointVisibility).forEach(category => {
            const categoryVisible = this.pointVisibility[category];
            const finalVisibility = categoryVisible && opacity > 0.01;
            const leaderOpacity = opacity * 0.8; // Leader lines slightly more transparent

            // Batch update all elements of this category in parallel
            const [meshes, leaders, labels] = [
                this.points[category] || [],
                this.leaders[category] || [],
                this.labels[category] || []
            ];

            // Only update visibility if visibility settings changed, otherwise just update opacity
            if (visibilityChanged || this._poiVisibilityCache.needsUpdate) {
                // Update both visibility and opacity
                meshes.forEach(mesh => {
                    if (mesh.material) mesh.material.opacity = opacity;
                    mesh.visible = finalVisibility;
                });

                leaders.forEach(leader => {
                    if (leader.material) leader.material.opacity = leaderOpacity;
                    leader.visible = finalVisibility;
                });

                labels.forEach(sprite => {
                    if (sprite.material) sprite.material.opacity = opacity;
                    sprite.visible = finalVisibility;
                });
            } else if (opacityChanged) {
                // Only update opacity, preserve existing visibility state
                meshes.forEach(mesh => {
                    if (mesh.material) mesh.material.opacity = opacity;
                    // Don't change mesh.visible - preserve current state
                });

                leaders.forEach(leader => {
                    if (leader.material) leader.material.opacity = leaderOpacity;
                    // Don't change leader.visible - preserve current state
                });

                labels.forEach(sprite => {
                    if (sprite.material) sprite.material.opacity = opacity;
                    // Don't change sprite.visible - preserve current state
                });
            }
        });
    }

    /* ===== graticule lines ===== */

    addLatitudeLines(step = 10) { this.#addGraticule(step, true); }
    addLongitudeLines(step = 10) { this.#addGraticule(step, false); }

    #addGraticule(step, isLat) {

        // Different sampling for different LOD levels
        this.#addGraticuleLOD(step, isLat, 2, this.detailHigh);    // High detail: 2° sampling
        this.#addGraticuleLOD(step * 2, isLat, 5, this.detailMedium); // Medium: fewer lines, 5° sampling
        this.#addGraticuleLOD(step * 3, isLat, 10, this.detailLow);   // Low: major lines only, 10° sampling
    }

    #addGraticuleLOD(step, isLat, innerStep, targetGroup) {
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

        geojson?.features.forEach(feat => {
            const [lon, lat] = feat.geometry.coordinates;
            // Compute position on oblate spheroid via mesh scale + offset
            const pos = this.#spherical(lon, lat);
            // Defensive check: skip invalid POIs
            if (!pos.isVector3 || !isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
                // Skip invalid POI positions
                return;
            }
            const circleMaterial = new THREE.MeshBasicMaterial({
                map: this.circleTexture,
                color: material.color.getHex(),
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(circleGeom, circleMaterial);
            mesh.position.copy(pos);
            // Compute local normal (sphere normal) and transform to world for orientation
            const sphereNorm = mesh.position.clone().normalize();
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.root.matrixWorld);
            const worldNorm = sphereNorm.applyMatrix3(normalMatrix).normalize();
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNorm);
            mesh.userData = { feature: feat, category };
            mesh.visible = this.pointVisibility[category]; // Set initial visibility based on display settings
            mesh.renderOrder = this.renderOrderOverrides.POI ?? RENDER_ORDER.POI;
            this.root.add(mesh);
            this.points[category].push(mesh);

            // Create leader line from POI to label position
            const leaderGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(), // POI position (will be updated)
                new THREE.Vector3()  // Label position (will be updated)
            ]);
            const leader = new THREE.Line(leaderGeom, this.materials.leaderLine.clone());
            leader.frustumCulled = false; // Prevent disappearing at glancing angles
            leader.userData = { category, parentPOI: mesh, sphereNormal: sphereNorm.clone() };
            leader.visible = this.pointVisibility[category]; // Set initial visibility based on display settings
            leader.renderOrder = this.renderOrderOverrides.POI_LEADERS ?? RENDER_ORDER.POI_LEADERS;
            this.root.add(leader);
            this.leaders[category].push(leader);

            // Create WebGL label sprite at end of leader line
            const poiName = feat.properties?.name || feat.properties?.NAME || feat.properties?.scalerank || `${category}`;
            if (poiName && poiName.trim()) {
                let labelSprite;
                
                if (this.labelManager) {
                    // Use LabelManager for consistent styling
                    const label = this.labelManager.createLabel(poiName.trim(), 'POI_LABEL', {
                        category: this.labelCategory,
                        position: pos,
                        visible: this.pointVisibility[category], // Set initial visibility based on display settings
                        userData: {
                            parentPOI: mesh,
                            parentLeader: leader,
                            feature: feat,
                            category
                        }
                    });
                    labelSprite = label.sprite;
                } else {
                    // Fallback to WebGLLabels
                    labelSprite = WebGLLabels.createLabel(poiName.trim(), {
                        fontSize: 48,
                        color: '#5d6d7d',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        padding: 16,
                        sizeAttenuation: false, // constant screen size
                        transparent: true,
                        depthWrite: false,
                        depthTest: true
                    });
                    
                    labelSprite.userData = {
                        parentPOI: mesh,
                        parentLeader: leader,
                        feature: feat,
                        category
                    };
                    labelSprite.renderOrder = this.renderOrderOverrides.POI_LABELS ?? RENDER_ORDER.POI_LABELS;
                    labelSprite.visible = this.pointVisibility[category]; // Set initial visibility based on display settings
                }

                // Initial position (will be updated in updateLeaderLines)
                labelSprite.position.copy(pos);

                this.root.add(labelSprite);
                this.labels[category].push(labelSprite);
            }
        });
    }

    /* ===== visibility helpers ===== */

    #setPointsVisible(cat, v) {
        // Update internal state only
        this.pointVisibility[cat] = v;
        // DO NOT set m.visible here; updateFade will handle it.
        // Labels will also be handled by updateFade
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

        // Debug: Draw a visible circle
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
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
            line.renderOrder = this.renderOrderOverrides.SURFACE ?? RENDER_ORDER.SURFACE;
            this.detailHigh.add(line);
            this.surfaceLines.push(line);
        }
        if (this.graticuleGeometries.medium.length > 0) {
            const merged = mergeGeometries(this.graticuleGeometries.medium);
            const line = new THREE.LineSegments(merged, this.materials.latitudeMajor.clone());
            line.userData.lineType = 'graticule';
            line.renderOrder = this.renderOrderOverrides.SURFACE ?? RENDER_ORDER.SURFACE;
            this.detailMedium.add(line);
            this.surfaceLines.push(line);
        }
        if (this.graticuleGeometries.low.length > 0) {
            const merged = mergeGeometries(this.graticuleGeometries.low);
            const line = new THREE.LineSegments(merged, this.materials.latitudeMajor.clone());
            line.userData.lineType = 'graticule';
            line.renderOrder = this.renderOrderOverrides.SURFACE ?? RENDER_ORDER.SURFACE;
            this.detailLow.add(line);
            this.surfaceLines.push(line);
        }

        // Merge country border geometries
        if (this.countryGeometries.high.length > 0) {
            const merged = mergeGeometries(this.countryGeometries.high);
            const line = new THREE.LineSegments(merged, this.materials.countryLine.clone());
            line.userData.lineType = 'country';
            line.renderOrder = this.renderOrderOverrides.SURFACE ?? RENDER_ORDER.SURFACE;
            this.detailHigh.add(line);
            this.countryBorders.push(line);
        }
        if (this.countryGeometries.medium.length > 0) {
            const merged = mergeGeometries(this.countryGeometries.medium);
            const line = new THREE.LineSegments(merged, this.materials.countryLine.clone());
            line.userData.lineType = 'country';
            line.renderOrder = this.renderOrderOverrides.SURFACE ?? RENDER_ORDER.SURFACE;
            this.detailMedium.add(line);
            this.countryBorders.push(line);
        }

        // Merge state border geometries
        if (this.stateGeometries.high.length > 0) {
            const merged = mergeGeometries(this.stateGeometries.high);
            const line = new THREE.LineSegments(merged, this.materials.stateLine.clone());
            line.userData.lineType = 'state';
            line.renderOrder = this.renderOrderOverrides.SURFACE ?? RENDER_ORDER.SURFACE;
            this.detailHigh.add(line);
            this.states.push(line);
        }
        if (this.stateGeometries.medium.length > 0) {
            const merged = mergeGeometries(this.stateGeometries.medium);
            const line = new THREE.LineSegments(merged, this.materials.stateLine.clone());
            line.userData.lineType = 'state';
            line.renderOrder = this.renderOrderOverrides.SURFACE ?? RENDER_ORDER.SURFACE;
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
     * Update leader lines and label positions based on camera distance
     * @param {THREE.Camera} camera
     */
    updateLeaderLines(camera) {
        if (!camera || !this.root?.visible) return;

        const planetWorldPos = objectPool.getVector3();
        try {
            this.root.getWorldPosition(planetWorldPos);
            
            // Use cached distance for better performance
            const planetId = this.planetName || 'unknown';
            let cameraDistance = window.app3d?.distanceCache?.getDistance?.(planetId);
            
            // Fallback to direct calculation if cache not available
            if (!cameraDistance || cameraDistance === 0) {
                cameraDistance = camera.position.distanceTo(planetWorldPos);
            }

            // Only update if camera distance changed significantly
            // BUT always update if this is the first time (lastCameraDistance === 0)
            const distanceChange = this.lastCameraDistance > 0 ? 
                Math.abs(cameraDistance - this.lastCameraDistance) / this.lastCameraDistance : 
                1; // Force update on first call
            
            if (distanceChange < this.leaderUpdateThreshold && this.lastCameraDistance > 0) {
                return;
            }

            this.lastCameraDistance = cameraDistance;

            // Calculate leader length based on desired screen-space distance
            // This makes the leader line length define the POI-to-label distance
            const vFOV = THREE.MathUtils.degToRad(camera.fov);
            const halfH = window.innerHeight / 2;
            const targetPixelDistance = 40; // Desired distance in pixels from POI to label
            const leaderLength = (cameraDistance / (halfH / Math.tan(vFOV / 2))) * targetPixelDistance;
            
            // Clamp to reasonable world-space limits
            const clampedLeaderLength = THREE.MathUtils.clamp(
                leaderLength,
                this.planetRadius * 0.001,  // Min: 0.1% of planet radius
                this.planetRadius * 0.2     // Max: 20% of planet radius
            );

            // Update all leader lines and their associated labels
            Object.keys(this.leaders).forEach(category => {
                this.leaders[category].forEach((leader, index) => {
                    const poi = leader.userData.parentPOI;
                    const sphereNorm = leader.userData.sphereNormal;
                    
                    if (!poi || !sphereNorm) return;

                    // Update leader line geometry – use pooled vector to avoid allocations
                    const poiPos = poi.position;
                    const labelPos = objectPool.getVector3();
                    try {
                        labelPos.copy(sphereNorm)
                            .multiplyScalar(clampedLeaderLength)
                            .add(poiPos);

                        const positions = leader.geometry.attributes.position;
                        positions.setXYZ(0, poiPos.x, poiPos.y, poiPos.z);
                        positions.setXYZ(1, labelPos.x, labelPos.y, labelPos.z);
                        positions.needsUpdate = true;

                        // Update associated label position to match leader line end
                        const label = this.labels[category][index];
                        if (label) {
                            label.position.copy(labelPos);
                        }
                    } finally {
                        objectPool.releaseVector3(labelPos);
                    }
                });
            });
        } finally {
            objectPool.releaseVector3(planetWorldPos);
        }
    }

    /**
     * Force immediate update of leader lines and label positions
     * Call this after POI creation to ensure proper initial positioning
     * @param {THREE.Camera} camera
     */
    forceUpdateLeaderLines(camera) {
        if (!camera) return;
        
        // Reset lastCameraDistance to force an update
        const previousDistance = this.lastCameraDistance;
        this.lastCameraDistance = 0;
        
        // Call updateLeaderLines directly (not updateFade) to avoid overriding initial visibility
        this.updateLeaderLines(camera);
        
        // If update didn't happen for some reason, restore previous distance
        if (this.lastCameraDistance === 0) {
            this.lastCameraDistance = previousDistance;
        }
    }

    /**
     * Update feature opacity based on camera distance.
     * @param {THREE.Camera} camera
     */
    updateFade(camera) {
        if (!camera || !this.root?.visible) return;

        // Update leader lines first
        this.updateLeaderLines(camera);

        // Check if ANY lines are visible - if not, skip calculations
        const anyLinesVisible = this.lineVisibility.surfaceLines ||
            this.lineVisibility.countryBorders ||
            this.lineVisibility.states;

        const anyPOIsVisible = Object.values(this.pointVisibility).some(v => v);

        if (!anyLinesVisible && !anyPOIsVisible) {
            this.lod.visible = false;
            return; // Skip all calculations if nothing is visible
        }

        const planetWorldPos = objectPool.getVector3();
        try {
            this.root.getWorldPosition(planetWorldPos);
            
            // Use centralized distance cache for massive performance improvement
            const planetId = this.planetName || 'unknown';
            let distance = window.app3d?.distanceCache?.getDistance?.(planetId);
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                distance = camera.position.distanceTo(planetWorldPos);
            }

            // Determine target opacity based on distance threshold
            // Surface features should appear when close enough to see details
            const fadeThreshold = this.planetRadius * 10;   // Much closer threshold for surface details
            let targetOpacity = distance < fadeThreshold ? 1 : 0;

            // Check if we need to start a new animation
            const currentTime = Date.now();
            if (targetOpacity !== this.fadeAnimation.targetOpacity) {
                this.fadeAnimation.targetOpacity = targetOpacity;
                this.fadeAnimation.startOpacity = this.fadeAnimation.currentOpacity;
                this.fadeAnimation.startTime = currentTime;
                this.fadeAnimation.animating = true;
            }

            // Update animation if active
            if (this.fadeAnimation.animating) {
                const elapsed = currentTime - this.fadeAnimation.startTime;
                const progress = Math.min(elapsed / this.animationDuration, 1);

                // Use easing function for smooth animation
                const eased = this.easeInOutCubic(progress);
                this.fadeAnimation.currentOpacity = this.fadeAnimation.startOpacity +
                    (this.fadeAnimation.targetOpacity - this.fadeAnimation.startOpacity) * eased;

                if (progress >= 1) {
                    this.fadeAnimation.animating = false;
                    this.fadeAnimation.currentOpacity = this.fadeAnimation.targetOpacity;
                }
            }

            // Apply opacity to entire surface
            const opacity = this.fadeAnimation.currentOpacity;

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

                            obj.material.opacity = opacity;
                            obj.visible = shouldBeVisible && opacity > 0.01;
                        }
                    });
                }
            });

            // LOD group is visible if any lines should be shown
            this.lod.visible = anyLinesVisible && opacity > 0.01;

            // Use optimized centralized POI visibility update
            this._updatePOIVisibilityOptimized(opacity);
            
            // Update POI scaling for visible POIs only
            this._updatePOIScalingOptimized(camera, distance);
            
        } finally {
            objectPool.releaseVector3(planetWorldPos);
        }
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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

        // Dispose leader lines
        Object.keys(this.leaders).forEach(cat => {
            this.leaders[cat].forEach(leader => {
                if (leader.geometry) leader.geometry.dispose();
                if (leader.material) leader.material.dispose();
            });
            this.leaders[cat] = [];
        });

        // Dispose labels
        if (this.labelManager && this.labelCategory) {
            // Use LabelManager for coordinated cleanup
            this.labelManager.clearCategory(this.labelCategory);
        } else {
            // Fallback cleanup for WebGLLabels
            Object.keys(this.labels).forEach(cat => {
                this.labels[cat].forEach(label => {
                    WebGLLabels.disposeLabel(label);
                });
                this.labels[cat] = [];
            });
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
        this.fadeAnimation = null;
    }

    /**
     * Optimized POI scaling update - only processes visible POIs
     * @private
     * @param {THREE.Camera} camera
     * @param {number} planetDistance - Distance from camera to planet center
     */
    _updatePOIScalingOptimized(camera, planetDistance) {
        // Pre-calculate common values
        const vFOV = THREE.MathUtils.degToRad(camera.fov);
        const halfH = window.innerHeight / 2;
        const pixelSizeTarget = 8;
        const minScale = 0.1;
        const maxScale = 100;
        const scalePrecisionThreshold = this.planetRadius * 5;

        Object.keys(this.pointVisibility).forEach(category => {
            if (!this.pointVisibility[category]) return; // Skip invisible categories

            this.points[category]?.forEach(mesh => {
                if (!mesh.visible) return; // Skip invisible POIs

                // Optimize distance calculation
                let distToPOI = planetDistance; // Use cached planet distance as approximation
                
                // Only do precise calculation for very close POIs where accuracy matters
                if (planetDistance < scalePrecisionThreshold) {
                    const poiWorldPos = objectPool.getVector3();
                    try {
                        mesh.getWorldPosition(poiWorldPos);
                        distToPOI = camera.position.distanceTo(poiWorldPos);
                    } finally {
                        objectPool.releaseVector3(poiWorldPos);
                    }
                }

                // Calculate and apply POI scale
                const poiScale = (distToPOI / (halfH / Math.tan(vFOV / 2))) * pixelSizeTarget;
                const clampedScale = THREE.MathUtils.clamp(poiScale, minScale, maxScale);
                mesh.scale.set(clampedScale, clampedScale, 1);
            });
        });
    }
}
