#!/usr/bin/env node

/**
 * Test quaternion creation for all planets to understand why only Earth needs adjustment
 */

import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';

// Set Three.js to Z-up
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

console.log('=== Testing Quaternion Creation for All Planets ===\n');

const testDate = new Date('2025-01-06T12:00:00Z');
const astroTime = Astronomy.MakeTime(testDate);

// Function to simulate our quaternion creation
function createQuaternion(axisInfo) {
    // Convert RA/Dec to radians
    const raRad = axisInfo.ra * (Math.PI / 12);
    const decRad = axisInfo.dec * (Math.PI / 180);
    const spinRad = ((axisInfo.spin % 360) * Math.PI / 180);
    
    // Create pole vector in J2000 equatorial
    const poleX_eqj = Math.cos(decRad) * Math.cos(raRad);
    const poleY_eqj = Math.cos(decRad) * Math.sin(raRad);
    const poleZ_eqj = Math.sin(decRad);
    
    // Transform to ecliptic (rotate by -23.43928° around X)
    const obliquity = 23.43928 * Math.PI / 180;
    const poleX_ecl = poleX_eqj;
    const poleY_ecl = poleY_eqj * Math.cos(-obliquity) - poleZ_eqj * Math.sin(-obliquity);
    const poleZ_ecl = poleY_eqj * Math.sin(-obliquity) + poleZ_eqj * Math.cos(-obliquity);
    
    const poleVector = new THREE.Vector3(poleX_ecl, poleY_ecl, poleZ_ecl);
    
    // Create quaternion
    const zAxis = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(zAxis, poleVector.clone().normalize());
    
    // Apply spin
    const spinQuat = new THREE.Quaternion();
    spinQuat.setFromAxisAngle(poleVector.clone().normalize(), spinRad);
    quaternion.premultiply(spinQuat);
    
    return { quaternion, poleVector, spinDeg: (axisInfo.spin % 360) };
}

// Test all planets
const planets = [
    { name: 'Mercury', body: Astronomy.Body.Mercury },
    { name: 'Venus', body: Astronomy.Body.Venus },
    { name: 'Earth', body: Astronomy.Body.Earth },
    { name: 'Mars', body: Astronomy.Body.Mars },
    { name: 'Jupiter', body: Astronomy.Body.Jupiter },
    { name: 'Saturn', body: Astronomy.Body.Saturn },
    { name: 'Uranus', body: Astronomy.Body.Uranus },
    { name: 'Neptune', body: Astronomy.Body.Neptune }
];

console.log('Planet   | Pole(RA,Dec) | Spin    | Prime Meridian Direction | Notes');
console.log('---------|--------------|---------|-------------------------|-------');

for (const planet of planets) {
    try {
        const axisInfo = Astronomy.RotationAxis(planet.body, astroTime);
        const result = createQuaternion(axisInfo);
        
        // Test what direction the prime meridian faces
        const pmVector = new THREE.Vector3(1, 0, 0); // Initial PM direction
        pmVector.applyQuaternion(result.quaternion);
        const pmAngle = Math.atan2(pmVector.y, pmVector.x) * 180 / Math.PI;
        
        let notes = '';
        if (planet.name === 'Earth') {
            const gmst = Astronomy.SiderealTime(astroTime);
            notes = `GMST=${(gmst*15).toFixed(0)}°`;
        }
        
        console.log(
            `${planet.name.padEnd(8)} | ${axisInfo.ra.toFixed(1)}h,${axisInfo.dec.toFixed(0).padStart(4)}° | ${result.spinDeg.toFixed(1).padStart(6)}° | Faces ${pmAngle.toFixed(0).padStart(4)}° from +X | ${notes}`
        );
    } catch (e) {
        console.log(`${planet.name.padEnd(8)} | Error: ${e.message}`);
    }
}

console.log('\n=== Analysis ===\n');

// Check rotation axis formulas
console.log('Checking Astronomy Engine source for each planet:\n');

// Let's understand the difference
console.log('Key differences in how planets are handled:\n');
console.log('1. Earth uses a special EarthRotationAxis() function');
console.log('2. Other planets use body_axis_t() with IAU formulas');
console.log('3. Earth\'s spin formula: 190.414 + 360.9856 * days');
console.log('4. Other planets have different spin formulas\n');

// Test Earth specifically
const earthAxis = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
const gmst = Astronomy.SiderealTime(astroTime);

console.log('Earth specifics:');
console.log(`  Spin from Astronomy Engine: ${(earthAxis.spin % 360).toFixed(1)}°`);
console.log(`  GMST: ${gmst.toFixed(3)}h = ${(gmst * 15).toFixed(1)}°`);
console.log(`  Difference: ${((earthAxis.spin % 360) - gmst * 15).toFixed(1)}°`);
console.log('');

// Test what happens with textures
console.log('=== Texture Mapping Expectations ===\n');
console.log('Standard planet textures:');
console.log('  - Equirectangular projection');
console.log('  - Prime meridian at texture center (U=0.5)');
console.log('  - 180°W at left edge (U=0)');
console.log('  - 180°E at right edge (U=1)\n');

console.log('Three.js UV mapping:');
console.log('  - U=0.5 maps to +X direction');
console.log('  - Rotation around Z axis changes what faces +X\n');

console.log('The issue:');
console.log('  - All planet textures follow the same standard');
console.log('  - But only Earth\'s spin reference differs from the standard');
console.log('  - Other planets\' spin=0 means prime meridian faces a consistent direction');
console.log('  - Earth\'s spin=0 means prime meridian faces 90° west of that direction');