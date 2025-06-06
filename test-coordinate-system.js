#!/usr/bin/env node

/**
 * Test to understand the coordinate system differences
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Understanding Coordinate System Differences ===\n');

// Test at vernal equinox 2025
const vernalEquinox = new Date('2025-03-20T09:01:00Z'); // Approximate vernal equinox
const astroTime = Astronomy.MakeTime(vernalEquinox);

console.log('Test at vernal equinox:', vernalEquinox.toISOString());
console.log('');

// At vernal equinox, the Sun crosses the celestial equator
// moving from south to north at the "First Point of Aries"
// This defines the zero point for right ascension

const sun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, false);
const sunEqu = Astronomy.Ecliptic(sun); // Convert to equatorial

console.log('Sun position at vernal equinox:');
console.log('  Ecliptic longitude:', sunEqu.elon, 'degrees (should be ~0)');
console.log('  Ecliptic latitude:', sunEqu.elat, 'degrees (should be ~0)');
console.log('');

// Get Earth rotation
const axisInfo = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
console.log('Earth rotation:');
console.log('  Spin:', axisInfo.spin, 'degrees');
console.log('  Normalized:', ((axisInfo.spin % 360) + 360) % 360, 'degrees');
console.log('');

// Test the relationship between different reference frames
console.log('=== Reference Frame Analysis ===');
console.log('');
console.log('1. IAU/Astronomy Engine reference:');
console.log('   - Zero spin = Prime meridian aligned with vernal equinox');
console.log('   - Spin increases eastward (same as longitude)');
console.log('');
console.log('2. Three.js/OpenGL reference:');
console.log('   - +X axis points "right" (east when viewing from north)');
console.log('   - +Y axis points "up" (north)');
console.log('   - +Z axis points "toward viewer" (out of screen)');
console.log('   - With Z-up: +X=east, +Y=north, +Z=up');
console.log('');
console.log('3. Texture mapping:');
console.log('   - Equirectangular texture has prime meridian at center');
console.log('   - Texture U=0 maps to longitude 180°W');
console.log('   - Texture U=0.5 maps to longitude 0° (prime meridian)');
console.log('   - Texture U=1 maps to longitude 180°E');
console.log('');

// Test quaternion creation
console.log('=== Testing Quaternion Creation ===');
console.log('');

// Simulate the quaternion calculation
function testQuaternionForSpin(spinDeg) {
    const spinRad = spinDeg * Math.PI / 180;
    
    // Assuming pole at north (simplified)
    const poleVector = { x: 0, y: 0, z: 1 };
    
    // In Three.js, rotation around Z axis
    // Positive rotation is counterclockwise when looking down the axis
    const q = {
        x: 0,
        y: 0,
        z: Math.sin(spinRad / 2),
        w: Math.cos(spinRad / 2)
    };
    
    return q;
}

// Test key angles
const testAngles = [0, 90, 180, 270];
console.log('Spin | Quaternion (x,y,z,w) | What should face +X');
console.log('-----|----------------------|--------------------');

for (const angle of testAngles) {
    const q = testQuaternionForSpin(angle);
    let facing = '';
    
    // Determine what longitude faces +X after rotation
    // Starting point: 0° spin means prime meridian faces +X
    // But if texture has prime meridian at center (U=0.5)...
    if (angle === 0) facing = '0° (Prime Meridian)';
    else if (angle === 90) facing = '90°W';
    else if (angle === 180) facing = '180°';
    else if (angle === 270) facing = '90°E';
    
    console.log(
        `${angle}° | (${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)}, ${q.w.toFixed(3)}) | ${facing}`
    );
}

console.log('');
console.log('=== Solution Analysis ===');
console.log('');
console.log('The issue appears to be:');
console.log('1. Astronomy Engine spin=0 means prime meridian aligned with vernal equinox');
console.log('2. In Three.js, we want spin=0 to show prime meridian facing the camera (+X)');
console.log('3. The difference is the hour angle between vernal equinox and the Sun');
console.log('');
console.log('Potential solutions:');
console.log('1. Add GMST-based offset to align properly');
console.log('2. Use a different reference for texture mapping');
console.log('3. Adjust the texture itself to match the coordinate system');