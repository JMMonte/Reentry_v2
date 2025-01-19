import * as THREE from 'three';
import starData from '../config/BSC.json';

interface StarData {
    RA: string;
    DEC: string;
    MAG: string;
}

const RADIUS = 5e5; // Radius of the sphere
const STAR_SCALE = RADIUS * 0.12e-5;

// Function to convert RA and DEC to Cartesian coordinates
function convertToCartesian(ra: number, dec: number, radius: number = RADIUS): THREE.Vector3 {
    const raRad = THREE.MathUtils.degToRad(ra * 15); // Convert RA from hours to degrees, then to radians
    const decRad = THREE.MathUtils.degToRad(dec); // Convert DEC to radians
    const x = radius * Math.cos(decRad) * Math.cos(raRad);
    const y = radius * Math.cos(decRad) * Math.sin(raRad);
    const z = radius * Math.sin(decRad);
    return new THREE.Vector3(x, y, z);
}

// Normalize magnitude to a size value
function magnitudeToSize(mag: string): number {
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
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private readonly constantDistance: number;
    private starGeometry: THREE.BufferGeometry;
    private starPositions: number[];
    private starSizes: number[];
    private stars!: THREE.Points;

    constructor(scene: THREE.Scene, camera: THREE.Camera) {
        this.scene = scene;
        this.camera = camera;
        this.constantDistance = RADIUS;
        this.starGeometry = new THREE.BufferGeometry();
        this.starPositions = [];
        this.starSizes = [];

        this.initStars();
        this.addStarsToScene();
    }

    private initStars(): void {
        (starData as StarData[]).forEach(star => {
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

    private addStarsToScene(): void {
        const starMaterial = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false, // Ensure stars are always rendered behind other objects
        });

        this.stars = new THREE.Points(this.starGeometry, starMaterial);
        this.stars.renderOrder = -1; // Render stars first
        this.scene.add(this.stars);

        this.updateStarPositions();
    }

    private updateStarPositions = (): void => {
        const cameraPosition = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
        
        const positions = this.starGeometry.attributes.position.array;
        for (let i = 0; i < positions.length / 3; i++) {
            const starPosition = new THREE.Vector3(
                this.starPositions[i * 3],
                this.starPositions[i * 3 + 1],
                this.starPositions[i * 3 + 2]
            );

            // Offset star position by camera position
            starPosition.add(cameraPosition);

            (positions as Float32Array)[i * 3] = starPosition.x;
            (positions as Float32Array)[i * 3 + 1] = starPosition.y;
            (positions as Float32Array)[i * 3 + 2] = starPosition.z;
        }

        this.starGeometry.attributes.position.needsUpdate = true;

        requestAnimationFrame(this.updateStarPositions);
    };

    public dispose(): void {
        this.scene.remove(this.stars);
        this.starGeometry.dispose();
        (this.stars.material as THREE.Material).dispose();
    }
} 