#!/usr/bin/env node

/**
 * Debug script to test Earth orbit generation and identify time sampling issues
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Simple test to trigger orbit generation
console.log('[Debug] Starting Earth orbit debug test...');
console.log('[Debug] This script will simulate orbit generation to see the time sampling issue');

// We'll need to run this through the actual application since it requires Three.js and the physics engine
// Let's create a simple test instead that shows what the time sampling should look like

const EARTH_ORBITAL_PERIOD_DAYS = 27.321661; // Earth around EMB
const EARTH_ORBITAL_PERIOD_SECONDS = EARTH_ORBITAL_PERIOD_DAYS * 24 * 3600;

console.log('\n[Debug] Expected Earth orbit parameters:');
console.log(`  Orbital period: ${EARTH_ORBITAL_PERIOD_DAYS} days`);
console.log(`  Orbital period: ${EARTH_ORBITAL_PERIOD_SECONDS} seconds`);

const numPoints = Math.min(200, Math.max(60, Math.floor(EARTH_ORBITAL_PERIOD_SECONDS / 3600)));
const dt = EARTH_ORBITAL_PERIOD_SECONDS / numPoints;

console.log(`  Number of points: ${numPoints}`);
console.log(`  dt per step: ${dt} seconds (${(dt/3600).toFixed(2)} hours)`);
console.log(`  Time range: ${-(numPoints/2) * dt} to ${(numPoints/2) * dt} seconds`);
console.log(`  Time range: ${-(numPoints/2) * dt / 86400} to ${(numPoints/2) * dt / 86400} days`);
console.log(`  Total time span: ${EARTH_ORBITAL_PERIOD_SECONDS} seconds (${EARTH_ORBITAL_PERIOD_SECONDS/86400} days)`);

console.log('\n[Debug] Sample time offsets:');
const centerTime = new Date();
for (let i = 0; i <= numPoints; i += Math.floor(numPoints/10)) {
    const timeOffset = (i - numPoints / 2) * dt;
    const t = new Date(centerTime.getTime() + timeOffset * 1000);
    console.log(`  Point ${i}/${numPoints}: offset ${timeOffset.toFixed(0)}s (${(timeOffset/86400).toFixed(2)} days) -> ${t.toISOString()}`);
}

console.log('\n[Debug] The time sampling math looks correct.');
console.log('[Debug] The issue might be in:');
console.log('[Debug] 1. StateVectorCalculator._calculateEarthState() returning identical positions');
console.log('[Debug] 2. The orbital elements being used for calculation');
console.log('[Debug] 3. The coordinate frame transformation');
console.log('\n[Debug] Run the development server with: npm run dev');
console.log('[Debug] Then check the browser console for the detailed orbit generation logs.');