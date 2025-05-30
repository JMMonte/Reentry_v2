/**
 * Mercury Configuration
 * 
 * Physical, orbital, and rendering properties for Mercury
 */

import * as THREE from 'three';
import {Constants} from '../../../utils/Constants.js';

const mercuryMass = 3.301e23; // kg
const mercuryRadius = 2439.7; // km
const mercuryGM = Constants.G * mercuryMass; // km³/s²

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
    rotationalElements: {
        poleRA: [281.0103, -0.0328, 0.0],
        poleDec: [61.4155, -0.0049, 0.0],
        primeMeridian: [329.5988, 6.1385108, 0.0]
    },
    // canonicalOrbit can be added if needed from orbitalBodiesData.js
}; 