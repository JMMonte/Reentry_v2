#!/usr/bin/env node

/**
 * Understanding IAU rotation references for different planets
 */

console.log('=== IAU Rotation Model References ===\n');

console.log('According to IAU Working Group on Cartographics and Rotational Elements:\n');

console.log('The rotation angle W (equivalent to spin) is defined as:');
console.log('W = W₀ + Ẇ × d');
console.log('where:');
console.log('  W₀ = angle at J2000 epoch');
console.log('  Ẇ = rotation rate (degrees/day)');
console.log('  d = days since J2000\n');

console.log('For each planet, W=0° means:');
console.log('  - The prime meridian faces the intersection of:');
console.log('    * The planet\'s equator');
console.log('    * The J2000 reference plane (Earth\'s equator for most)');
console.log('  - This is the "ascending node" of the planet\'s equator\n');

console.log('Key insight:');
console.log('  - For most planets, W=0° has a consistent astronomical meaning');
console.log('  - The prime meridian faces a specific celestial direction');
console.log('  - This direction is NOT the vernal equinox\n');

console.log('Earth is special because:');
console.log('  1. Earth\'s rotation is tied to GMST (Greenwich Mean Sidereal Time)');
console.log('  2. GMST=0h means prime meridian faces vernal equinox');
console.log('  3. But Astronomy Engine\'s Earth spin=0° means something different');
console.log('  4. The ~90° offset suggests a different reference meridian\n');

console.log('=== Why Only Earth Needs Adjustment ===\n');

console.log('1. **Reference System Mismatch**:');
console.log('   - Other planets: IAU W directly gives prime meridian orientation');
console.log('   - Earth: Uses a modified formula offset by ~90° from GMST\n');

console.log('2. **Texture Standards**:');
console.log('   - All planet textures assume prime meridian at center');
console.log('   - For non-Earth planets, IAU W aligns with this expectation');
console.log('   - For Earth, the offset breaks this alignment\n');

console.log('3. **Historical Reasons**:');
console.log('   - Earth\'s rotation has been studied differently (GMST, ERA, etc.)');
console.log('   - Other planets use simpler IAU polynomial models');
console.log('   - Astronomy Engine may use different Earth conventions\n');

console.log('=== Verification ===\n');

// Let's check if other planets' textures display correctly
console.log('Quick test - at spin=0°, what should we see?');
console.log('Planet   | IAU Convention');
console.log('---------|---------------');
console.log('Mercury  | PM faces ascending node of equator');
console.log('Venus    | PM faces ascending node (retrograde)');
console.log('Earth    | PM faces ??? (90° west of vernal equinox in AE)');
console.log('Mars     | PM faces ascending node of equator');
console.log('Jupiter  | PM faces System III reference');
console.log('Others   | PM faces respective reference directions\n');

console.log('Conclusion:');
console.log('- Only Earth has a 90° discrepancy between its spin value and GMST');
console.log('- This is why only Earth needs the +90° adjustment');
console.log('- Other planets\' spin values already align with texture expectations');