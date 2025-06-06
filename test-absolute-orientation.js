#!/usr/bin/env node

/**
 * Test Earth orientation in absolute ecliptic coordinates
 * where +X = vernal equinox
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Testing Earth Orientation in Absolute Ecliptic Frame ===\n');

// Test at noon UTC
const testDate = new Date('2025-01-06T12:00:00Z');
const astroTime = Astronomy.MakeTime(testDate);

console.log('Test time:', testDate.toISOString());
console.log('Scene coordinate system:');
console.log('  +X = Vernal equinox direction');
console.log('  XY plane = Ecliptic');
console.log('  Planets at actual positions\n');

// Get Earth's position
const earthVector = Astronomy.HelioVector(Astronomy.Body.Earth, astroTime);
console.log('Earth heliocentric position:');
console.log(`  X: ${earthVector.x} AU`);
console.log(`  Y: ${earthVector.y} AU`);
console.log(`  Z: ${earthVector.z} AU`);

// Convert to spherical
const r = Math.sqrt(earthVector.x**2 + earthVector.y**2 + earthVector.z**2);
const lon = Math.atan2(earthVector.y, earthVector.x) * 180/Math.PI;
const lat = Math.asin(earthVector.z / r) * 180/Math.PI;

console.log(`  Ecliptic longitude: ${lon}° from vernal equinox`);
console.log(`  Distance: ${r} AU\n`);

// Get Earth's rotation
const axisInfo = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
const spin = ((axisInfo.spin % 360) + 360) % 360;

console.log('Earth rotation:');
console.log(`  Raw spin: ${axisInfo.spin}°`);
console.log(`  Normalized: ${spin}°\n`);

// Now figure out what we should see
console.log('=== Expected View ===\n');

// Earth is at ecliptic longitude ~lon degrees
// The Sun is in the opposite direction from Earth's perspective
const sunDirection = (lon + 180) % 360;
console.log(`From Earth, Sun is at ecliptic longitude: ${sunDirection}°`);

// The subsolar point longitude
const sun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, false);
try {
    const observer = Astronomy.VectorObserver(sun, astroTime);
    console.log(`Subsolar point longitude: ${observer.longitude}°`);
} catch (e) {
    console.log('Could not calculate subsolar point');
}

// For the texture to display correctly:
// The point on Earth facing the Sun should be visible
// This is the subsolar longitude

console.log('\n=== Texture Alignment Analysis ===\n');

console.log('Standard equirectangular Earth texture:');
console.log('  - U=0 (left edge) = 180°W');
console.log('  - U=0.5 (center) = 0° (Prime Meridian)');
console.log('  - U=1 (right edge) = 180°E\n');

console.log('In Three.js with no rotation:');
console.log('  - Texture wraps around sphere');
console.log('  - U=0 maps to -X direction');
console.log('  - U=0.5 maps to +X direction');
console.log('  - So Prime Meridian faces +X\n');

console.log('Current spin value:', spin, '°');
console.log('This rotates Earth eastward by', spin, 'degrees');
console.log('So longitude', spin, 'now faces +X (vernal equinox)\n');

// The problem is:
// 1. Spin=0 means PM faces vernal equinox
// 2. But we want the Sun-facing side to be visible
// 3. The Sun is NOT at the vernal equinox

console.log('=== Solution ===\n');

// Calculate where the Sun is in ecliptic coordinates
const sunEclipticLon = (lon + 180) % 360;
console.log(`Sun is at ecliptic longitude: ${sunEclipticLon}°`);
console.log(`Vernal equinox is at: 0°`);
console.log(`Difference: ${sunEclipticLon}°\n`);

// We need to rotate Earth so the subsolar meridian faces the Sun
// Not the vernal equinox

console.log('To show Earth correctly:');
console.log('1. Without any special offset, spin=' + spin + '° makes longitude ' + spin + '° face +X');
console.log('2. But we want the subsolar longitude to face the Sun direction');
console.log('3. This requires understanding the complete geometry\n');

// Test with GMST
const gmst = Astronomy.SiderealTime(astroTime);
console.log('GMST:', gmst, 'hours =', gmst * 15, 'degrees');
console.log('This is Earth\'s rotation relative to the stars');
console.log('The difference between spin and GMST*15 is:', spin - gmst*15, 'degrees');