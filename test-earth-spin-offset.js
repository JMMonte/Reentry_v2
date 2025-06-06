#!/usr/bin/env node

/**
 * Understanding Earth's spin offset in Astronomy Engine
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Earth Spin Offset Analysis ===\n');

// The formula in astronomy-engine is:
// spin = 190.41375788700253 + (360.9856122880876 * time.ut)
// where time.ut is days since J2000

// Test at J2000 epoch
const j2000 = new Date('2000-01-01T12:00:00Z');
const j2000Time = Astronomy.MakeTime(j2000);

console.log('At J2000 epoch:');
console.log('  Date:', j2000.toISOString());
console.log('  UT days since J2000:', j2000Time.ut, '(should be 0)');

const j2000Axis = Astronomy.RotationAxis(Astronomy.Body.Earth, j2000Time);
console.log('  Earth spin:', j2000Axis.spin, 'degrees');
console.log('  Expected from formula: 190.41375788700253 degrees');
console.log('  Match:', Math.abs(j2000Axis.spin - 190.41375788700253) < 0.001);

// Get GMST at J2000
const j2000Gmst = Astronomy.SiderealTime(j2000Time);
console.log('  GMST:', j2000Gmst, 'hours =', j2000Gmst * 15, 'degrees');

// The difference
console.log('  Spin - GMST:', j2000Axis.spin - j2000Gmst * 15, 'degrees\n');

// Now test at our current time
const testDate = new Date('2025-01-06T12:00:00Z');
const testTime = Astronomy.MakeTime(testDate);

console.log('At test date:');
console.log('  Date:', testDate.toISOString());
console.log('  UT days since J2000:', testTime.ut);

const testAxis = Astronomy.RotationAxis(Astronomy.Body.Earth, testTime);
const testGmst = Astronomy.SiderealTime(testTime);

console.log('  Earth spin:', testAxis.spin, 'degrees');
console.log('  GMST:', testGmst, 'hours =', testGmst * 15, 'degrees');
console.log('  Spin - GMST:', testAxis.spin - testGmst * 15, 'degrees\n');

// The pattern
console.log('=== Pattern Analysis ===\n');
console.log('The spin formula adds a constant offset of ~190.4° at J2000');
console.log('GMST at J2000 was ~280.5°');
console.log('The difference is: 190.4 - 280.5 = -90.1°\n');

console.log('This -90° offset is consistent across all times.');
console.log('It suggests the spin reference is 90° behind GMST.\n');

// What does this mean?
console.log('=== Interpretation ===\n');
console.log('GMST = 0h means prime meridian faces vernal equinox');
console.log('Spin = 0° should mean the same thing for consistency');
console.log('But Astronomy Engine spin = 0° means something else\n');

console.log('The 90° difference suggests:');
console.log('- Spin = 0° means prime meridian faces 90° west of vernal equinox');
console.log('- This is the autumnal equinox direction (-Y in ecliptic)\n');

console.log('To align with standard expectations:');
console.log('- We need to add 90° to the spin value');
console.log('- This makes spin = 0° align with GMST = 0h');
console.log('- And ensures the texture displays correctly');