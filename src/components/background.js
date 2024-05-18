import * as THREE from 'three';
import starData from '../config/BSC.json';

const RADIUS = 5e8; // Radius of the sphere
// make the STAR_RADIUS calculated from the magnitude and the distance
const STAR_SCALE = RADIUS * 0.12e-2

// Function to convert RA and DEC to Cartesian coordinates
function convertToCartesian(ra, dec, radius = RADIUS) { // Set radius to a large value
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
    const size = Math.max(0.1, 10.0 - parseFloat(mag)); // Increase the range for better visibility
    return size;
}

// Vertex shader
const vertexShader = `
    attribute float size;
    varying float vSize;
    void main() {
        vSize = size;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z); // Adjust size factor as needed
        gl_Position = projectionMatrix * mvPosition;
    }
`;

// Fragment shader
const fragmentShader = `
    varying float vSize;
    void main() {
        float alpha = 1.0;
        vec2 xy = gl_PointCoord.xy - vec2(0.5);
        float ll = length(xy);
        if (ll > 0.5) {
            discard;
        }
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    }
`;

// Function to add stars to the scene
export function addStars(scene) {
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    const starSizes = [];

    starData.forEach(star => {
        const raParts = star.RA.split(':').map(Number);
        const decParts = star.DEC.split(':').map(Number);

        const ra = raParts[0] + raParts[1] / 60 + raParts[2] / 3600;
        const dec = Math.sign(decParts[0]) * (Math.abs(decParts[0]) + decParts[1] / 60 + decParts[2] / 3600);

        const position = convertToCartesian(ra, dec);
        starPositions.push(position.x, position.y, position.z);

        // Convert magnitude to size
        const size = magnitudeToSize(star.MAG);
        starSizes.push(size * STAR_SCALE);
    });

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1));

    const starMaterial = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader,
        fragmentShader,
        transparent: true
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}