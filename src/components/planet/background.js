import * as THREE from 'three';
import starData from '../../config/BSC.json';

const RADIUS = 9.4607e14; // ~1000 light-years in sim units (1 unit = 1km)
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

// Vertex shader with camera-relative sizing
const vertexShader = `
    attribute float size;
    uniform float screenHeight;
    uniform float fov;
    varying float vSize;
    
    void main() {
        vSize = size;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float distance = length(mvPosition.xyz);
        
        // Calculate pixel size based on distance and FOV
        // Stars should be point-like with size based on magnitude
        float baseSizePixels = size * 1.2; // Base size from magnitude (1.2 scale factor)
        
        // Adjust for FOV (wider FOV = smaller stars)
        float fovFactor = 50.0 / fov; // Normalized to 50 degree FOV
        
        // Final pixel size with minimum visibility
        gl_PointSize = max(baseSizePixels * fovFactor, 1.0);
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
        
        // Uniforms for shader
        this.uniforms = {
            screenHeight: { value: window.innerHeight },
            fov: { value: camera.fov }
        };

        this.initStars();
        this.addStarsToScene();
        
        // Listen for window resize
        this._onResize = this.onResize.bind(this);
        window.addEventListener('resize', this._onResize);
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
            uniforms: this.uniforms,
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
    
    onResize() {
        this.uniforms.screenHeight.value = window.innerHeight;
    }
    
    update() {
        // Update FOV if camera FOV changed
        if (this.camera && this.uniforms.fov.value !== this.camera.fov) {
            this.uniforms.fov.value = this.camera.fov;
        }
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        
        if (this.stars) {
            this.scene.remove(this.stars);
            this.stars.geometry.dispose();
            this.stars.material.dispose();
            this.stars = null;
        }
        this.starGeometry = null;
        this.starPositions = null;
        this.starSizes = null;
        this.uniforms = null;
    }
}
