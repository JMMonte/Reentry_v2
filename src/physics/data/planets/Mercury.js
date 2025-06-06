/**
 * Mercury Configuration
 * 
 * Physical, orbital, and rendering properties for Mercury
 */

import * as THREE from 'three';
import {PhysicsConstants} from '../../core/PhysicsConstants.js';

const mercuryMass = 3.301e23; // kg
const mercuryRadius = 2439.7; // km
const mercuryGM = PhysicsConstants.PHYSICS.G * mercuryMass; // km³/s²

export default {
    name: 'mercury',
    parent: 'mercury_barycenter',
    naif_id: 199,
    astronomyEngineName: 'Mercury',
    symbol: '☿',
    mass: mercuryMass,
    radius: mercuryRadius,
    GM: mercuryGM, // km³/s²
    j2: 6.0e-5,
    rotationPeriod: 5067000,
    oblateness: 0,
    soiRadius: 112397,
    lodLevelsKey: 'default',
    materials: {
        surfaceConfig: {
            materialType: 'standard',
            textureKey: 'mercuryTexture',
            normalMapKey: 'mercuryNormalTexture',
            params: {
                normalScale: new THREE.Vector2(0.5, 0.5),
                roughness: 0.7,
                metalness: 0.1,
            }
        },
    },
    radialGridConfig: {
        markerStep: 8000,
        labelMarkerStep: 40000,
        circles: [
            { radius: 5000, label: '5,000 km', style: 'minor' },
            { radius: 20000, label: '20,000 km', style: 'minor' },
            { radius: 50000, label: '50,000 km', style: 'minor' },
            { radius: 112000, label: 'SOI', style: 'dashed-major', dashScale: 2 },
            { radius: 1500, label: 'Magnetosphere', style: 'dashed', dashScale: 1.5 },
        ],
        radialLines: { count: 22 },
    },
    addLight: true,
    lightOptions: { color: 0xcccccc, intensity: 2439.7, helper: false },
    type: 'planet',
    
    // Orientation (IAU 2023/2025)
    poleRA: 281.0103,     // deg at J2000.0
    poleDec: 61.4155,     // deg at J2000.0  
    poleRARate: -0.0328,  // deg per century
    poleDecRate: -0.0049, // deg per century
    spin: 329.5988,       // deg at J2000.0
    spinRate: 6.1385108,  // deg/day
    orientationEpoch: 2451545.0, // JD (J2000.0)
    
    // canonicalOrbit can be added if needed from orbitalBodiesData.js
}; 