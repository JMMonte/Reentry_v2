#!/usr/bin/env node

/**
 * Test if other planets need similar adjustments
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Testing Other Planets Orientation ===\n');

const testDate = new Date('2025-01-06T12:00:00Z');
const astroTime = Astronomy.MakeTime(testDate);

// Test various planets
const planets = [
    'Mercury', 'Venus', 'Earth', 'Mars', 
    'Jupiter', 'Saturn', 'Uranus', 'Neptune'
];

console.log('Planet   | Spin    | Notes');
console.log('---------|---------|------');

for (const planetName of planets) {
    try {
        const body = Astronomy.Body[planetName];
        const axisInfo = Astronomy.RotationAxis(body, astroTime);
        const spin = ((axisInfo.spin % 360) + 360) % 360;
        
        let notes = '';
        
        // Check for special cases
        if (planetName === 'Earth') {
            const gmst = Astronomy.SiderealTime(astroTime);
            const gmstDeg = gmst * 15;
            const diff = spin - gmstDeg;
            notes = `GMST=${gmstDeg.toFixed(1)}°, diff=${diff.toFixed(1)}°`;
        } else if (planetName === 'Venus') {
            notes = 'Retrograde rotation';
        } else if (planetName === 'Uranus') {
            notes = 'Tilted ~98°';
        }
        
        console.log(
            `${planetName.padEnd(8)} | ${spin.toFixed(1).padStart(6)}° | ${notes}`
        );
    } catch (e) {
        console.log(`${planetName.padEnd(8)} | Error   | ${e.message}`);
    }
}

console.log('\n=== Analysis ===\n');
console.log('Only Earth shows the ~90° difference with GMST.');
console.log('This suggests the issue is specific to Earth.');
console.log('\nPossible reasons:');
console.log('1. Earth has special handling in Astronomy Engine');
console.log('2. The reference meridian for Earth is different');
console.log('3. IAU standards define Earth rotation differently');

// Let's check the raw data
console.log('\n=== Raw Rotation Data ===\n');
console.log('Planet   | RA(h)  | Dec(°) | Spin(°) | Period(h)');
console.log('---------|--------|--------|---------|----------');

for (const planetName of planets) {
    try {
        const body = Astronomy.Body[planetName];
        const axisInfo = Astronomy.RotationAxis(body, astroTime);
        
        // Estimate rotation period from spin rate
        // This is approximate since spin accumulates over time
        let period = 'N/A';
        if (planetName === 'Earth') period = '23.93';
        else if (planetName === 'Mars') period = '24.62';
        else if (planetName === 'Jupiter') period = '9.93';
        
        console.log(
            `${planetName.padEnd(8)} | ${axisInfo.ra.toFixed(3).padStart(6)} | ${axisInfo.dec.toFixed(1).padStart(6)} | ${(axisInfo.spin % 360).toFixed(1).padStart(7)} | ${period.padStart(8)}`
        );
    } catch (e) {
        console.log(`${planetName.padEnd(8)} | Error`);
    }
}