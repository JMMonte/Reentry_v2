import * as THREE from 'three';
import starData from '../config/BSC.json';

const RADIUS = 9.4607e14; // ~1000 light-years in sim units (1 unit = 10km)
const STAR_SCALE = 0.7; // Base multiplier for star point sizes

// Function to convert RA and DEC to Cartesian coordinates
function convertToCartesian(ra, dec, radius = RADIUS) {
    const raRad = THREE.MathUtils.degToRad(ra * 15); // Convert RA from hours to degrees, then to radians
    const decRad = THREE.MathUtils.degToRad(dec); // Convert DEC to radians
    const x = radius * Math.cos(decRad) * Math.cos(raRad);
    const y = radius * Math.cos(decRad) * Math.sin(raRad);
    const z = radius * Math.sin(decRad);
    return new THREE.Vector3(x, y, z);
}

// Normalize magnitude to a size value
function magnitudeToSize(mag) {
    // Assuming brighter stars (lower mag values) are larger; adjust the factor as needed
    const size = Math.max(0.01, 8.0 - parseFloat(mag)); // Increase the range for better visibility
    return size;
}

// Vertex shader
const vertexShader = `
    attribute float size;
    varying float vSize;
    void main() {
        vSize = size;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

// Simplified Fragment shader for debugging
const fragmentShader = `
    varying float vSize;
    void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float distance = length(coord);
        if (distance > 0.5) {
            discard;
        }
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0 - distance * 2.0); // Add smooth transparency
    }
`;

export class BackgroundStars {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.constantDistance = RADIUS;
        this.starGeometry = new THREE.BufferGeometry();
        this.starPositions = [];
        this.starSizes = [];

        this.initStars();
        this.addStarsToScene();
    }

    initStars() {
        starData.forEach(star => {
            const raParts = star.RA.split(':').map(Number);
            const decParts = star.DEC.split(':').map(Number);

            const ra = raParts[0] + raParts[1] / 60 + raParts[2] / 3600;
            const dec = Math.sign(decParts[0]) * (Math.abs(decParts[0]) + decParts[1] / 60 + decParts[2] / 3600);

            const position = convertToCartesian(ra, dec, this.constantDistance);
            this.starPositions.push(position.x, position.y, position.z);

            const size = magnitudeToSize(star.MAG);
            this.starSizes.push(size * STAR_SCALE);
        });

        this.starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.starPositions, 3));
        this.starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(this.starSizes, 1));
    }

    addStarsToScene() {
        const starMaterial = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false, // Ensure stars are always rendered behind other objects
        });

        this.stars = new THREE.Points(this.starGeometry, starMaterial);
        this.stars.renderOrder = -1; // Render stars first
        this.stars.frustumCulled = false; // Always render stars regardless of frustum culling
        this.scene.add(this.stars);
    }
}
