# Apsis Detection System Usage

The apsis detection system provides sophisticated analysis of periapsis and apoapsis points in n-body propagated satellite trajectories.

## Basic Usage

```javascript
import { ApsisDetection } from './src/services/ApsisDetection.js';

// Initialize the service
const apsisDetector = new ApsisDetection({
    minSeparation: 300, // Minimum 300 seconds between apsis points
    tolerance: 0.001,   // 1 meter tolerance for distance comparisons
    debugLogging: true
});

// Example orbit data from propagation
const orbitPoints = [
    { position: [7000, 0, 0], time: 0, centralBodyId: 399 },
    { position: [7500, 1000, 0], time: 600, centralBodyId: 399 },
    { position: [8000, 0, 0], time: 1200, centralBodyId: 399 }, // Apoapsis
    { position: [7500, -1000, 0], time: 1800, centralBodyId: 399 },
    { position: [7000, 0, 0], time: 2400, centralBodyId: 399 }  // Periapsis
];

// Detect all apsis points
const allApsis = apsisDetector.detectApsisPoints(orbitPoints);
console.log('All apsis points:', allApsis);

// Find next apsis from current position (e.g., at 25% through orbit)
const currentTime = 600;
const nextPeriapsis = apsisDetector.findNextPeriapsis(orbitPoints, currentTime);
const nextApoapsis = apsisDetector.findNextApoapsis(orbitPoints, currentTime);

console.log('Next periapsis:', nextPeriapsis);
console.log('Next apoapsis:', nextApoapsis);
```

## Advanced Features

### SOI Transition Handling

```javascript
// Orbit data with SOI transitions (Earth → Moon → Earth)
const multiSOIOrbit = [
    // Earth segment
    { position: [200000, 0, 0], time: 0, centralBodyId: 399 },
    { position: [300000, 0, 0], time: 1000, centralBodyId: 399 },
    
    // Moon segment  
    { position: [50000, 0, 0], time: 2000, centralBodyId: 301 },
    { position: [40000, 0, 0], time: 3000, centralBodyId: 301 },
    
    // Earth return segment
    { position: [250000, 0, 0], time: 4000, centralBodyId: 399 }
];

// Automatically handles SOI segmentation
const apsisWithSOI = apsisDetector.detectApsisPoints(multiSOIOrbit);
// Returns separate apsis analysis for each SOI segment
```

### Precise Position Interpolation

```javascript
// Get exact position at apsis time
const apsisTime = 1200; // Time of detected apoapsis
const interpolatedPosition = apsisDetector.interpolatePosition(
    orbitPoints, 
    apsisTime
);
console.log('Exact apoapsis position:', interpolatedPosition);
```

### Statistical Analysis

```javascript
// Get comprehensive statistics
const stats = apsisDetector.getApsisStatistics(orbitPoints);
console.log(`Orbital period: ${stats.period.toFixed(0)} seconds`);
console.log(`Eccentricity: ${stats.eccentricity.toFixed(3)}`);
console.log(`Semi-major axis: ${stats.semiMajorAxis.toFixed(0)} km`);

// Analyze trajectory for chaotic behavior
const chaosAnalysis = apsisDetector.analyzeChaos(orbitPoints);
if (chaosAnalysis.isChaotic) {
    console.log('Warning: Chaotic trajectory detected');
    console.log(`Distance variation: ${chaosAnalysis.distanceVariation.toFixed(3)}`);
}
```

## Integration with Physics Engine

```javascript
// In your satellite management code
class SatelliteManager {
    constructor(physicsEngine) {
        this.physicsEngine = physicsEngine;
        this.apsisDetector = new ApsisDetection();
    }
    
    async predictNextApsis(satelliteId) {
        // Get satellite's propagated orbit
        const orbitData = await this.propagateOrbit(satelliteId, 14400); // 4 hours
        
        // Find next apsis points
        const currentTime = this.physicsEngine.simulationTime;
        const nextPeriapsis = this.apsisDetector.findNextPeriapsis(orbitData, currentTime);
        const nextApoapsis = this.apsisDetector.findNextApoapsis(orbitData, currentTime);
        
        return { nextPeriapsis, nextApoapsis };
    }
}
```

## Three.js Visualization Integration

```javascript
// Render apsis points as camera-relative spheres
class ApsisVisualizer {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.apsisDetector = new ApsisDetection();
    }
    
    updateApsisVisualization(satelliteId, orbitData, orbitMeshGroup) {
        // Detect apsis points
        const apsisPoints = this.apsisDetector.detectApsisPoints(orbitData);
        
        // Remove old apsis markers
        this.clearApsisMarkers(orbitMeshGroup);
        
        // Add new markers
        apsisPoints.forEach(apsis => {
            const geometry = new THREE.SphereGeometry(
                apsis.type === 'periapsis' ? 50 : 75, 16, 16
            );
            const material = new THREE.MeshBasicMaterial({
                color: apsis.type === 'periapsis' ? 0xff0000 : 0x00ff00,
                transparent: true,
                opacity: 0.8
            });
            
            const sphere = new THREE.Mesh(geometry, material);
            const position = this.apsisDetector.interpolatePosition(orbitData, apsis.time);
            sphere.position.fromArray(position);
            
            // Make camera-relative (always face camera)
            sphere.lookAt(this.camera.position);
            
            // Add to orbit group so it moves with the orbit
            orbitMeshGroup.add(sphere);
        });
    }
}
```

## Configuration Options

```javascript
const apsisDetector = new ApsisDetection({
    minSeparation: 600,     // Minimum seconds between apsis points
    tolerance: 0.001,       // Distance comparison tolerance (km)
    requireAlternating: true, // Enforce periapsis/apoapsis alternation
    enableEdgeDetection: true, // Include start/end points as potential apsis
    debugLogging: false,    // Enable detailed logging
    refinement: {
        enabled: true,      // Use quadratic interpolation for precision
        maxIterations: 10   // Maximum refinement iterations
    }
});
```

## Error Handling

The system gracefully handles:
- Insufficient orbit data (< 3 points)
- Chaotic trajectories with no clear apsis
- SOI transitions during trajectory
- Numerical precision issues
- Empty or invalid orbit segments

All edge cases are properly validated and return appropriate error states or fallback behavior.