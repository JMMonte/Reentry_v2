#!/usr/bin/env node

/**
 * Test quaternion transformation and coordinate system alignment
 */

import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';

// THREE.js uses Z-up globally
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

console.log('=== Testing Quaternion Transformation Chain ===\n');

// Test date
const testDate = new Date('2025-01-06T12:00:00Z');
const astroTime = Astronomy.MakeTime(testDate);

// Get Earth's axis info
const axisInfo = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
console.log('Earth axis info:');
console.log('  RA:', axisInfo.ra, 'hours =', axisInfo.ra * 15, 'degrees');
console.log('  Dec:', axisInfo.dec, 'degrees');
console.log('  Spin:', axisInfo.spin, 'degrees');
console.log('  North pole vector:', axisInfo.north);
console.log('');

// Step 1: Create pole vector in J2000 equatorial coordinates
const raRad = axisInfo.ra * (Math.PI / 12); // Convert hours to radians
const decRad = axisInfo.dec * (Math.PI / 180);

const poleX_eqj = Math.cos(decRad) * Math.cos(raRad);
const poleY_eqj = Math.cos(decRad) * Math.sin(raRad);
const poleZ_eqj = Math.sin(decRad);

console.log('Pole vector in J2000 equatorial:');
console.log(`  (${poleX_eqj.toFixed(6)}, ${poleY_eqj.toFixed(6)}, ${poleZ_eqj.toFixed(6)})`);
console.log('');

// Step 2: Transform to ecliptic coordinates
// J2000 obliquity = 23.43928°
const obliquity = 23.43928 * Math.PI / 180;

// Rotation matrix from equatorial to ecliptic (rotate around X by -obliquity)
const poleX_ecl = poleX_eqj;
const poleY_ecl = poleY_eqj * Math.cos(-obliquity) - poleZ_eqj * Math.sin(-obliquity);
const poleZ_ecl = poleY_eqj * Math.sin(-obliquity) + poleZ_eqj * Math.cos(-obliquity);

console.log('Pole vector in J2000 ecliptic:');
console.log(`  (${poleX_ecl.toFixed(6)}, ${poleY_ecl.toFixed(6)}, ${poleZ_ecl.toFixed(6)})`);
console.log('');

// Step 3: Create quaternion from pole and spin
const poleVector = new THREE.Vector3(poleX_ecl, poleY_ecl, poleZ_ecl);
const spinRad = (axisInfo.spin % 360) * Math.PI / 180;

console.log('Creating quaternion:');
console.log('  Pole vector (ecliptic):', poleVector);
console.log('  Spin angle:', axisInfo.spin % 360, 'degrees');
console.log('');

// Method 1: setFromUnitVectors + spin
const zAxis = new THREE.Vector3(0, 0, 1);
const quaternion1 = new THREE.Quaternion();
quaternion1.setFromUnitVectors(zAxis, poleVector.clone().normalize());

// Apply spin rotation around the pole axis
const spinQuat = new THREE.Quaternion();
spinQuat.setFromAxisAngle(poleVector.clone().normalize(), spinRad);

// Combine rotations
quaternion1.premultiply(spinQuat);

console.log('Quaternion (method 1):', quaternion1);
console.log('');

// Test what this quaternion does to key vectors
console.log('=== Testing Quaternion Effects ===');
console.log('');

function testQuaternion(quat, label) {
    console.log(label + ':');
    
    // Test what happens to cardinal directions
    const vectors = {
        '+X (East)': new THREE.Vector3(1, 0, 0),
        '+Y (North)': new THREE.Vector3(0, 1, 0),
        '+Z (Up)': new THREE.Vector3(0, 0, 1),
        'Prime Meridian': new THREE.Vector3(1, 0, 0) // Assuming PM points to +X initially
    };
    
    for (const [name, vec] of Object.entries(vectors)) {
        const rotated = vec.clone().applyQuaternion(quat);
        console.log(`  ${name} → (${rotated.x.toFixed(3)}, ${rotated.y.toFixed(3)}, ${rotated.z.toFixed(3)})`);
    }
    console.log('');
}

testQuaternion(quaternion1, 'Current quaternion');

// Now test what we expect
console.log('=== Expected Behavior ===');
console.log('');
console.log('In Three.js default view:');
console.log('  - Camera looks down -Z axis (from above when Z is up)');
console.log('  - +X points right (east)');
console.log('  - +Y points up on screen (north)');
console.log('  - Earth rotates counterclockwise (eastward)');
console.log('');
console.log('For correct texture display:');
console.log('  - When looking at Earth from above north pole');
console.log('  - Prime meridian should be visible at center when Sun is at noon over Greenwich');
console.log('  - Currently seeing:', axisInfo.spin % 360, 'degrees rotation');
console.log('');

// Calculate where prime meridian is pointing
const pmVector = new THREE.Vector3(1, 0, 0);
pmVector.applyQuaternion(quaternion1);
const pmAngle = Math.atan2(pmVector.y, pmVector.x) * 180 / Math.PI;

console.log('Prime meridian is pointing:', pmAngle, 'degrees from +X');
console.log('For correct display, it should point toward the Sun');
console.log('');

// The issue might be the reference frame
console.log('=== Reference Frame Issue ===');
console.log('');
console.log('Astronomy Engine uses:');
console.log('  - Spin = 0 when prime meridian aligns with vernal equinox');
console.log('  - This is the standard IAU definition');
console.log('');
console.log('Three.js scene expects:');
console.log('  - Objects at (0,0,0) viewed from default camera position');
console.log('  - Earth centered at origin');
console.log('  - Sun somewhere on the -X side (since Earth orbits counterclockwise)');
console.log('');
console.log('The 180° offset likely comes from:');
console.log('  1. Vernal equinox is at +X in ecliptic coordinates');
console.log('  2. We want Earth to show the Sun-facing side');
console.log('  3. But the Sun is on the opposite side of Earth from vernal equinox');