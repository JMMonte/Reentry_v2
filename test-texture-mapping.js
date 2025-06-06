#!/usr/bin/env node

/**
 * Test to understand exactly how the texture should be mapped
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Understanding Earth Texture Mapping ===\n');

// Test at a known time - noon at Greenwich
const testDate = new Date('2025-01-06T12:00:00Z');
const astroTime = Astronomy.MakeTime(testDate);

console.log('Test time:', testDate.toISOString());
console.log('This is noon at Greenwich (0° longitude)\n');

// Get all the relevant angles
const axisInfo = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
const spin = ((axisInfo.spin % 360) + 360) % 360;
const gmst = Astronomy.SiderealTime(astroTime);

console.log('Rotation values:');
console.log(`  Astronomy Engine spin: ${spin}°`);
console.log(`  GMST: ${gmst} hours = ${gmst * 15}°`);
console.log(`  Difference: ${spin - gmst * 15}°\n`);

// Get Sun position
const sun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, false);
let subsolarLon;
try {
    const observer = Astronomy.VectorObserver(sun, astroTime);
    subsolarLon = observer.longitude;
    console.log(`Subsolar longitude: ${subsolarLon}°`);
} catch (e) {
    // Fallback calculation
    const sunLon = Math.atan2(-sun.y, -sun.x) * 180/Math.PI;
    subsolarLon = sunLon;
    console.log(`Subsolar longitude (approx): ${subsolarLon}°`);
}

console.log('\n=== Texture Mapping Logic ===\n');

console.log('Standard Earth texture:');
console.log('  - Has prime meridian (0°) at center (U=0.5)');
console.log('  - Has 180°W at left edge (U=0)');
console.log('  - Has 180°E at right edge (U=1)\n');

console.log('Three.js sphere UV mapping:');
console.log('  - U=0 wraps to negative X (-X direction)');
console.log('  - U=0.5 faces positive X (+X direction)');
console.log('  - U=1 wraps back to negative X\n');

console.log('With no rotation (identity quaternion):');
console.log('  - Prime meridian (texture center) faces +X');
console.log('  - 90°W faces +Y');
console.log('  - 90°E faces -Y');
console.log('  - 180° faces -X\n');

console.log('Current situation:');
console.log(`  - It's noon at Greenwich (Sun over 0° longitude)`);
console.log(`  - Subsolar point is at ${subsolarLon}° longitude`);
console.log(`  - Astronomy Engine says spin = ${spin}°`);
console.log(`  - This means longitude ${spin}° faces +X (vernal equinox)\n`);

// The key insight:
console.log('=== The Key Issue ===\n');
console.log('We want a static view where:');
console.log('  1. All planets are at their correct positions');
console.log('  2. Earth shows the correct face (rotation)');
console.log('  3. The texture displays correctly\n');

console.log('Since +X points to vernal equinox (not the Sun):');
console.log('  - We should NOT try to make Earth face the Sun');
console.log('  - We should show Earth\'s correct astronomical orientation');
console.log('  - The spin value should align with astronomical standards\n');

// Calculate what longitude should face vernal equinox
console.log('=== Correct Orientation ===\n');

// GMST tells us Earth's rotation relative to the stars
// At GMST = 0h, prime meridian faces vernal equinox
// At GMST = Xh, longitude X*15° faces vernal equinox
const longitudeFacingVE = gmst * 15;

console.log(`GMST = ${gmst}h means:`);
console.log(`  - Longitude ${longitudeFacingVE}° should face vernal equinox (+X)`);
console.log(`  - But Astronomy Engine spin = ${spin}°`);
console.log(`  - Difference: ${longitudeFacingVE - spin}°\n`);

// This difference is consistently ~90°
// This suggests Astronomy Engine uses a different reference

console.log('=== Conclusion ===\n');
console.log('The ~90° difference suggests:');
console.log('  1. Astronomy Engine spin might be relative to a different meridian');
console.log('  2. Or there\'s a quarter-turn difference in the reference frame');
console.log('  3. We need to add 90° to align with GMST expectations\n');

console.log('With +90° offset:');
console.log(`  - Adjusted spin = ${(spin + 90) % 360}°`);
console.log(`  - This is very close to GMST * 15 = ${gmst * 15}°`);
console.log(`  - Difference: ${((spin + 90) % 360) - gmst * 15}°`);