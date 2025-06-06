#!/usr/bin/env node

/**
 * Test natural Earth orientation without any hardcoding
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Testing Natural Earth Orientation ===\n');

// Test at a specific time when we know where things should be
const testDate = new Date('2025-01-06T12:00:00Z'); // Noon UTC
const astroTime = Astronomy.MakeTime(testDate);

console.log('Test time:', testDate.toISOString());
console.log('');

// Get Earth's rotation info
const axisInfo = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
console.log('Earth rotation from Astronomy Engine:');
console.log('  RA:', axisInfo.ra, 'hours');
console.log('  Dec:', axisInfo.dec, 'degrees');
console.log('  Spin:', axisInfo.spin, 'degrees');
console.log('  North pole:', axisInfo.north);
console.log('');

// Normalize spin as in our code
const normalizedSpin = ((axisInfo.spin % 360) + 360) % 360;
console.log('Normalized spin:', normalizedSpin, 'degrees');
console.log('');

// Calculate where the Sun is
const sun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, false);
console.log('Sun position (geocentric):');
console.log('  x:', sun.x, 'AU');
console.log('  y:', sun.y, 'AU');
console.log('  z:', sun.z, 'AU');

// Convert to spherical coordinates to understand the geometry
const sunDist = Math.sqrt(sun.x * sun.x + sun.y * sun.y + sun.z * sun.z);
const sunLon = Math.atan2(sun.y, sun.x) * 180 / Math.PI;
const sunLat = Math.asin(sun.z / sunDist) * 180 / Math.PI;
console.log('Sun spherical (ecliptic):');
console.log('  Distance:', sunDist, 'AU');
console.log('  Longitude:', sunLon, 'degrees');
console.log('  Latitude:', sunLat, 'degrees');
console.log('');

// Calculate subsolar point (where Sun is at zenith)
try {
    const observer = Astronomy.VectorObserver(sun, astroTime);
    console.log('Subsolar point:');
    console.log('  Longitude:', observer.longitude, 'degrees');
    console.log('  Latitude:', observer.latitude, 'degrees');
} catch (e) {
    console.log('Could not calculate subsolar point:', e.message);
}
console.log('');

// Test GMST (Greenwich Mean Sidereal Time)
// This tells us the rotation angle of Earth relative to the stars
const gmst = Astronomy.SiderealTime(astroTime);
console.log('GMST:', gmst, 'hours =', gmst * 15, 'degrees');
console.log('');

// The relationship should be:
// - At 0h GMST, the vernal equinox is on the meridian at Greenwich
// - The spin angle from Astronomy Engine should align with this
// - Our texture has prime meridian at the center

console.log('=== Expected vs Actual ===');
console.log('At noon UTC on this date:');
console.log('- Sun should be roughly over longitude 0° (varies with equation of time)');
console.log('- GMST tells us Earth\'s rotation relative to stars');
console.log('- Spin from Astronomy Engine should match GMST-based calculation');
console.log('');

// Calculate expected spin based on GMST
// Spin = GMST * 15 (convert hours to degrees)
const expectedSpin = gmst * 15;
console.log('Expected spin from GMST:', expectedSpin, 'degrees');
console.log('Actual spin:', normalizedSpin, 'degrees');
console.log('Difference:', normalizedSpin - expectedSpin, 'degrees');
console.log('');

// Test texture alignment
console.log('=== Texture Alignment ===');
console.log('Standard Earth texture has:');
console.log('- Prime meridian (0° longitude) at center');
console.log('- 180° longitude at edges');
console.log('');
console.log('For correct display:');
console.log('- When spin = 0°, prime meridian should face +X direction');
console.log('- When spin = 90°, 90°W should face +X direction');
console.log('- When spin = 180°, 180° should face +X direction');
console.log('- When spin = 270°, 90°E should face +X direction');
console.log('');

// Test at different times to see the pattern
console.log('=== Testing at different times ===');
const times = [
    '2025-01-06T00:00:00Z',
    '2025-01-06T06:00:00Z',
    '2025-01-06T12:00:00Z',
    '2025-01-06T18:00:00Z'
];

console.log('Time (UTC) | GMST | Spin | Normalized | Expected from GMST');
console.log('-----------|------|------|------------|------------------');

for (const timeStr of times) {
    const time = new Date(timeStr);
    const astro = Astronomy.MakeTime(time);
    const axis = Astronomy.RotationAxis(Astronomy.Body.Earth, astro);
    const gmstHours = Astronomy.SiderealTime(astro);
    const norm = ((axis.spin % 360) + 360) % 360;
    const expected = gmstHours * 15;
    
    console.log(
        `${time.toISOString().substr(11, 8)} | ${gmstHours.toFixed(2)}h | ${axis.spin.toFixed(1)}° | ${norm.toFixed(1)}° | ${expected.toFixed(1)}°`
    );
}