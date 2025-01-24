import * as THREE from 'three';
import starData from '../config/data/BSC.json';

/** 
 * =====================
 * CONFIG & CONSTANTS
 * =====================
 */

// Arbitrary scale to control how far stars are placed.
const LIGHT_YEAR_UNIT_SCALE = 9e12; // Scale down from actual light years for visualization

// Controls the minimum/maximum distance assigned to stars based on magnitude.
const MIN_STAR_DISTANCE = 4;    // Closest stars (~4 light years)
const MID_STAR_DISTANCE = 10;  // Medium bright stars (~100 light years)
const MAX_STAR_DISTANCE = 100; // Distant visible stars (~1000 light years)

// Used to scale base star sizes in the scene.
const STAR_SCALE = 1.0;

// Factor to boost (or reduce) the final star size relative to distance.
const SIZE_MULTIPLIER = 1;  // Adjusted for light year distances

// Minimum star size when rendered
const MIN_SIZE = 100.0;

/** 
 * =====================
 * UTILITY FUNCTIONS
 * =====================
 */

/**
 * Convert RA/DEC to Cartesian coordinates using standard spherical-to-Cartesian conversion.
 * RA is expected in hours, DEC in degrees.
 */
function convertToCartesian(raHours, decDeg, radius) {
    // Convert RA from hours to radians, DEC from degrees to radians
    const raRad = THREE.MathUtils.degToRad(raHours * 15);
    const decRad = THREE.MathUtils.degToRad(decDeg);

    const x = radius * Math.cos(decRad) * Math.cos(raRad);
    const y = radius * Math.cos(decRad) * Math.sin(raRad);
    const z = radius * Math.sin(decRad);

    return new THREE.Vector3(x, y, z);
}

/**
 * Approximate distance in light years from the star's apparent magnitude.
 * Uses realistic astronomical distances.
 */
function approximateDistanceFromMagnitude(mag) {
    const numericMag = parseFloat(mag);

    // Brighter stars (mag < 2) are typically closer
    if (numericMag < 2) {
        return (Math.random() * (50 - MIN_STAR_DISTANCE) + MIN_STAR_DISTANCE);
    }
    // Medium bright stars (2 <= mag < 4)
    else if (numericMag < 4) {
        return (Math.random() * (MID_STAR_DISTANCE - 50) + 50);
    }
    // Dimmer stars (4 <= mag < 6)
    else if (numericMag < 6) {
        return (Math.random() * (MAX_STAR_DISTANCE - MID_STAR_DISTANCE) + MID_STAR_DISTANCE);
    }
    // Very dim stars (mag >= 6)
    else {
        return (Math.random() * 1000 + MAX_STAR_DISTANCE);
    }
}

/**
 * Convert star magnitude to a base size in the scene (before applying distance-based scaling).
 * Lower magnitude (brighter) => larger base size. 
 */
function magnitudeToSize(mag) {
    const numericMag = parseFloat(mag);
    return Math.max(MIN_SIZE, 8.0 - numericMag);
}

/** 
 * =====================
 * SHADERS
 * =====================
 */

// Vertex shader: passes the size along and sets point size
const vertexShader = `
    attribute float size;
    varying float vSize;
    void main() {
        vSize = size;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // gl_PointSize sets how large each point is (in pixels)
        gl_PointSize = size;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

// Fragment shader: simple radial gradient for disc-like stars
const fragmentShader = `
    varying float vSize;
    void main() {
        // gl_PointCoord: range (0,0) to (1,1) across the point
        vec2 coord = gl_PointCoord - vec2(0.5);
        float distance = length(coord);
        // Discard fragments outside the circle => round shape
        if (distance > 0.5) discard;
        
        // Simple falloff for a slightly "fuzzy" edge
        gl_FragColor = vec4(
            1.0, 
            1.0, 
            1.0, 
            1.0 - distance * 2.0
        );
    }
`;

export class BackgroundStars {
    static instance = null;

    constructor(scene, camera) {
        // Ensure only one BackgroundStars instance
        if (BackgroundStars.instance) {
            console.warn('BackgroundStars already exists!');
            return BackgroundStars.instance;
        }

        this.scene = scene;
        this.camera = camera;

        this.starGeometry = new THREE.BufferGeometry();
        this.starPositions = [];
        this.starSizes = [];
        this.originalPositions = [];

        this.initialized = false;

        this.initStars();
        this.addStarsToScene();

        BackgroundStars.instance = this;
    }

    initStars() {
        if (this.initialized) {
            console.warn('Stars already initialized!');
            return;
        }

        starData.forEach(star => {
            // Parse RA "HH:MM:SS" => hours (float)
            const raParts = star.RA.split(':').map(Number);
            const raHours = raParts[0] + (raParts[1] / 60) + (raParts[2] / 3600);

            // Parse DEC "±DD:MM:SS" => degrees (float)
            const decParts = star.DEC.split(':').map(Number);
            const sign = Math.sign(decParts[0]) !== 0 ? Math.sign(decParts[0]) : 1;
            const decDeg = sign * (Math.abs(decParts[0]) + (decParts[1] / 60) + (decParts[2] / 3600));

            // Approximate distance from magnitude
            const approximateDistance = approximateDistanceFromMagnitude(star.MAG) * LIGHT_YEAR_UNIT_SCALE;

            // Convert RA/DEC -> 3D position
            const position = convertToCartesian(raHours, decDeg, approximateDistance);
            this.starPositions.push(position.x, position.y, position.z);
            this.originalPositions.push(position.x, position.y, position.z);

            // Base size from magnitude
            const baseSize = magnitudeToSize(star.MAG);

            // Decrease star size with distance
            const adjustedSize = baseSize / (approximateDistance / LIGHT_YEAR_UNIT_SCALE);
            this.starSizes.push(adjustedSize * STAR_SCALE);
        });

        this.starGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(this.starPositions, 3)
        );
        this.starGeometry.setAttribute(
            'size',
            new THREE.Float32BufferAttribute(this.starSizes, 1)
        );

        this.initialized = true;
    }

    addStarsToScene() {
        const starMaterial = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            // blending: THREE.AdditiveBlending, // optional for a glowing look
        });

        this.stars = new THREE.Points(this.starGeometry, starMaterial);
        this.stars.renderOrder = -1;
        this.scene.add(this.stars);
    }

    /**
     * Update star sizes relative to camera distance each frame,
     * but do NOT move star positions (they're so distant, effectively fixed).
     */
    updateStarPositions() {
        if (!this.initialized || !this.camera) return;

        const cameraPosition = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
        const sizes = new Float32Array(this.starPositions.length / 3);

        for (let i = 0; i < this.starPositions.length / 3; i++) {
            const baseIdx = i * 3;

            // Original absolute position of this star
            const originalPos = new THREE.Vector3(
                this.originalPositions[baseIdx],
                this.originalPositions[baseIdx + 1],
                this.originalPositions[baseIdx + 2]
            );

            const distanceToCamera = originalPos.distanceTo(cameraPosition);

            // The stored starSizes[i] is the base size (already factoring magnitude + initial distance).
            // We'll scale it further by distance to camera and a multiplier to keep them visible.
            const baseSize = this.starSizes[i];
            
            // This formula:
            // 1) Scales size inversely by distance (farther => smaller), but
            // 2) Multiplies by SIZE_MULTIPLIER so stars don't become too tiny.
            let finalSize = baseSize / (distanceToCamera / LIGHT_YEAR_UNIT_SCALE);
            finalSize *= SIZE_MULTIPLIER;

            sizes[i] = Math.max(MIN_SIZE, finalSize);
        }

        this.starGeometry.attributes.size.array = sizes;
        this.starGeometry.attributes.size.needsUpdate = true;
    }

    dispose() {
        if (this.stars) {
            this.scene.remove(this.stars);
            this.starGeometry.dispose();
            this.stars.material.dispose();
        }
        BackgroundStars.instance = null;
    }
}