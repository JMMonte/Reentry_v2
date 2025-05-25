/* -----------------------------------------------------------
 * Moon Manager - Manages positioning and orientation of all moons
 * Uses centralized orbital data and mechanics for accurate positioning
 * ----------------------------------------------------------- */

import * as THREE from 'three';
import { getBodyData, getBodiesByType } from '../../config/orbitalBodiesData.js';
import {
    computeOrientationQuaternion
} from '../../physics/OrbitPropagator.js';
import { StateVectorCalculator } from '../../physics/StateVectorCalculator.js';
import { planetaryDataManager } from '../../physics/bodies/PlanetaryDataManager.js';

export class MoonManager {
    constructor(hierarchy) {
        this.moons = new Map(); // NAIF ID -> moon object
        this.moonGroups = new Map(); // parent NAIF ID -> Group of moons
        this.scaleFactor = 1e-6; // Default scale factor for visualization
        this.initialized = false;
        this.hierarchy = hierarchy;
        this.stateCalculator = new StateVectorCalculator(hierarchy, planetaryDataManager.naifToBody);
    }

    /**
     * Initialize the moon manager with all known moons
     */
    initialize() {
        if (this.initialized) return;

        // Get all moon bodies from the centralized data
        const moonBodies = getBodiesByType('moon');

        console.log(`MoonManager: Initializing ${moonBodies.length} moons`);

        // Group moons by their parent planet
        const moonsByParent = new Map();
        moonBodies.forEach(moon => {
            const parentId = moon.parent;
            if (!moonsByParent.has(parentId)) {
                moonsByParent.set(parentId, []);
            }
            moonsByParent.get(parentId).push(moon);
        });

        // Create moon objects and groups
        moonsByParent.forEach((moons, parentId) => {
            const parentData = getBodyData(parentId);
            const parentName = parentData ? parentData.name : `Parent ${parentId}`;

            console.log(`Creating ${moons.length} moons for ${parentName}`);

            // Create a group for this planet's moons
            const moonGroup = new THREE.Group();
            moonGroup.name = `${parentName} Moons`;
            this.moonGroups.set(parentId, moonGroup);

            // Create individual moon objects
            moons.forEach(moonData => {
                this.createMoon(moonData, moonGroup);
            });
        });

        this.initialized = true;
    }

    /**
     * Create a moon object with geometry and material
     * @param {Object} moonData - Moon data from orbital bodies
     * @param {THREE.Group} parentGroup - Parent group to add moon to
     */
    createMoon(moonData, parentGroup) {
        const { id, name, radius } = moonData;

        // Scale the moon radius for visualization
        const visualRadius = Math.max(radius * this.scaleFactor, 0.01); // Minimum size for visibility

        // Create geometry - use sphere for most moons
        const geometry = new THREE.SphereGeometry(visualRadius, 16, 16);

        // Create material based on moon type
        const material = this.createMoonMaterial(moonData);

        // Create mesh
        const moonMesh = new THREE.Mesh(geometry, material);
        moonMesh.name = name;
        moonMesh.naifId = id;
        moonMesh.castShadow = true;
        moonMesh.receiveShadow = true;

        // Add to parent group
        parentGroup.add(moonMesh);

        // Store reference
        this.moons.set(id, moonMesh);

        console.log(`Created moon: ${name} (ID: ${id}) with radius ${visualRadius}`);
    }

    /**
     * Create material for a moon based on its properties
     * @param {Object} moonData - Moon data
     * @returns {THREE.Material} Three.js material
     */
    createMoonMaterial(moonData) {
        const { name } = moonData;

        // Basic material properties
        let color = 0xaaaaaa; // Default gray

        // Customize based on moon name/type
        if (name.includes('Io')) {
            color = 0xffff88; // Yellowish for sulfur
        } else if (name.includes('Europa')) {
            color = 0xaaccff; // Blueish for ice
        } else if (name.includes('Ganymede')) {
            color = 0x886644; // Brownish
        } else if (name.includes('Callisto')) {
            color = 0x444444; // Dark gray
        } else if (name.includes('Titan')) {
            color = 0xffaa44; // Orange for atmosphere
        } else if (name.includes('Enceladus')) {
            color = 0xffffff; // White for ice
        } else if (name.includes('Moon')) {
            color = 0xcccccc; // Light gray for Earth's Moon
        } else if (name.includes('Phobos') || name.includes('Deimos')) {
            color = 0x664422; // Dark brown for Mars moons
        } else if (name.includes('Triton')) {
            color = 0xddddff; // Light blue-white
        } else if (name.includes('Charon')) {
            color = 0x998877; // Gray-brown
        }

        return new THREE.MeshPhongMaterial({
            color: color,
            shininess: 1,
            transparent: false
        });
    }

    /**
     * Update all moon positions and orientations
     * @param {Date} currentTime - Current simulation time
     * @param {Object} planetPositions - Map of planet positions for relative positioning
     */
    updateMoons(currentTime, planetPositions = {}) {
        if (!this.initialized) {
            this.initialize();
        }

        this.moons.forEach((moonMesh, naifId) => {
            this.updateMoonPosition(moonMesh, naifId, currentTime, planetPositions);
            this.updateMoonOrientation(moonMesh, naifId, currentTime);
        });
    }

    /**
     * Update a single moon's position
     * @param {THREE.Mesh} moonMesh - Moon mesh object
     * @param {number} naifId - NAIF ID of the moon
     * @param {Date} currentTime - Current simulation time
     * @param {Object} planetPositions - Map of planet positions
     */
    updateMoonPosition(moonMesh, naifId, currentTime, planetPositions) {
        const moonData = getBodyData(naifId);
        if (!moonData || !moonData.canonicalOrbit) {
            console.warn(`Moon ${naifId}: No moon data or orbital elements`);
            return;
        }

        // Get moon state from physics engine (which now includes isRelativePositioning flag)
        const physicsBody = window.app?.physicsIntegration?.physicsEngine?.bodies[naifId];
        if (!physicsBody) {
            console.warn(`Moon ${naifId}: No physics body data found`);
            return;
        }

        const relativePosition = new THREE.Vector3().fromArray(physicsBody.position);

        if (physicsBody.isRelativePositioning && physicsBody.parentNaif) {
            const parentPlanet = window.app?.bodiesByNaifId?.[physicsBody.parentNaif];
            if (parentPlanet && parentPlanet.getEquatorialGroup) {
                const equatorialGroup = parentPlanet.getEquatorialGroup();
                // Detach from previous parent if any, and attach to new parent's equatorial group
                if (moonMesh.parent !== equatorialGroup) {
                    moonMesh.parent?.remove(moonMesh); // Remove from old parent
                    equatorialGroup.add(moonMesh);      // Add to new parent
                }
                // Position is now relative to the parent's equatorialGroup
                let equatorialPosition = relativePosition.clone();
                // If moon's referenceFrame is 'xxx_equatorial', apply planet's orientation quaternion
                const referenceFrame = moonData.orbitalElements?.referenceFrame || moonData.referenceFrame;
                if (referenceFrame && /_equatorial$/i.test(referenceFrame)) {
                    // Apply the parent planet's orientation quaternion
                    if (parentPlanet.orientationGroup?.quaternion) {
                        equatorialPosition.applyQuaternion(parentPlanet.orientationGroup.quaternion);
                    }
                }
                moonMesh.position.copy(equatorialPosition);
            } else {
                console.warn(`Moon ${naifId}: Parent planet or equatorial group not found for relative positioning.`);
                // Fallback to absolute positioning if parent/group not found
                this._positionMoonAbsolutely(moonMesh, naifId, currentTime, planetPositions, relativePosition);
            }
        } else {
            // Standard absolute positioning (e.g., for Earth's Moon or fallbacks)
            this._positionMoonAbsolutely(moonMesh, naifId, currentTime, planetPositions, relativePosition);
        }
    }

    // Helper for absolute positioning (extracted for clarity)
    _positionMoonAbsolutely(moonMesh, naifId, currentTime, planetPositions, relativePositionIfKnown) {
        const moonData = getBodyData(naifId);
        const parentId = moonData.parent;
        const parentPosition = planetPositions[parentId];

        // Ensure mesh is parented to the scene directly for absolute positioning
        if (moonMesh.parent !== window.app?.scene) {
            moonMesh.parent?.remove(moonMesh);
            window.app?.scene?.add(moonMesh);
        }

        if (parentPosition && relativePositionIfKnown) {
            const finalPosition = parentPosition.clone().add(relativePositionIfKnown);
            moonMesh.position.copy(finalPosition);
        } else {
            // Fallback to re-calculate absolute state if needed
            const absoluteState = this.stateCalculator.calculateStateVector(naifId, currentTime);
            if (absoluteState) {
                moonMesh.position.copy(absoluteState.position);
            }
        }
    }

    /**
     * Update a single moon's orientation
     * @param {THREE.Mesh} moonMesh - Moon mesh object
     * @param {number} naifId - NAIF ID of the moon
     * @param {Date} currentTime - Current simulation time
     */
    updateMoonOrientation(moonMesh, naifId, currentTime) {
        const quaternion = computeOrientationQuaternion(naifId, currentTime);
        moonMesh.quaternion.copy(quaternion);
    }

    /**
     * Get all moon groups to add to the scene
     * @returns {Array<THREE.Group>} Array of moon groups
     */
    getMoonGroups() {
        if (!this.initialized) {
            this.initialize();
        }
        return Array.from(this.moonGroups.values());
    }

    /**
     * Get moon group for a specific parent planet
     * @param {number} parentNaifId - Parent planet NAIF ID
     * @returns {THREE.Group|null} Moon group or null
     */
    getMoonGroup(parentNaifId) {
        return this.moonGroups.get(parentNaifId) || null;
    }

    /**
     * Get moon mesh by NAIF ID
     * @param {number} naifId - NAIF ID of the moon
     * @returns {THREE.Mesh|null} Moon mesh or null
     */
    getMoon(naifId) {
        return this.moons.get(naifId) || null;
    }

    /**
     * Set scale factor for all moons
     * @param {number} scaleFactor - New scale factor
     */
    setScaleFactor(scaleFactor) {
        this.scaleFactor = scaleFactor;

        // Update existing moon sizes
        this.moons.forEach((moonMesh, naifId) => {
            const moonData = getBodyData(naifId);
            if (moonData) {
                const visualRadius = Math.max(moonData.radius * scaleFactor, 0.01);
                moonMesh.geometry.dispose();
                moonMesh.geometry = new THREE.SphereGeometry(visualRadius, 16, 16);
            }
        });
    }

    /**
     * Toggle visibility of moons for a specific parent planet
     * @param {number} parentNaifId - Parent planet NAIF ID
     * @param {boolean} visible - Visibility state
     */
    setMoonGroupVisibility(parentNaifId, visible) {
        const moonGroup = this.moonGroups.get(parentNaifId);
        if (moonGroup) {
            moonGroup.visible = visible;
        }
    }

    /**
     * Get orbital information for all moons
     * @returns {Array} Array of moon orbital data
     */
    getMoonOrbitalInfo() {
        const info = [];
        this.moons.forEach((moonMesh, naifId) => {
            const moonData = getBodyData(naifId);
            if (moonData && moonData.canonicalOrbit) {
                info.push({
                    id: naifId,
                    name: moonData.name,
                    parent: moonData.parent,
                    parentName: getBodyData(moonData.parent)?.name,
                    elements: moonData.canonicalOrbit,
                    radius: moonData.radius,
                    mass: moonData.mass,
                    GM: moonData.GM
                });
            }
        });
        return info;
    }

    /**
     * Dispose of all moon resources
     */
    dispose() {
        this.moons.forEach(moonMesh => {
            moonMesh.geometry.dispose();
            moonMesh.material.dispose();
        });
        this.moons.clear();
        this.moonGroups.clear();
        this.initialized = false;
    }
} 