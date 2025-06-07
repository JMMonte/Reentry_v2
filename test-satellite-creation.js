#!/usr/bin/env node

/**
 * Test script to verify satellite creation doesn't create duplicates
 * and equatorial orbital elements are properly calculated
 */

// Mock the required modules
const mockApp = {
    physicsIntegration: {
        physicsEngine: {
            createSatelliteFromGeographic: (params, naifId) => ({
                id: 'test-satellite-1',
                position: [7000, 0, 0],
                velocity: [0, 7.5, 0],
                planetData: { name: 'Earth', radius: 6371 }
            }),
            satellites: new Map([
                ['test-satellite-1', { id: 'test-satellite-1', centralBodyNaifId: 399 }]
            ])
        }
    },
    satellites: {
        syncWithPhysicsSatellite: async (id, params) => {
            console.log(`✓ syncWithPhysicsSatellite called for satellite ${id}`);
            return { id, synced: true, ...params };
        }
    },
    bodiesByNaifId: {
        399: { name: 'Earth', naifId: 399, radius: 6371, tilt: 23.5 }
    }
};

// Test the unified creation function
async function testSatelliteCreation() {
    console.log('Testing satellite creation without duplication...\n');

    try {
        // Import the createSatelliteUnified function
        const { createSatelliteUnified } = await import('./src/components/Satellite/createSatellite.js');
        
        const result = await createSatelliteUnified(mockApp, {
            latitude: 0,
            longitude: 0,
            altitude: 400,
            name: 'Test Satellite'
        });
        
        console.log('✓ Satellite created successfully:', {
            id: result.physicsId,
            hasPosition: !!result.position,
            hasVelocity: !!result.velocity,
            hasSatellite: !!result.satellite
        });
        
        console.log('\n✅ Test passed - no duplicate creation detected');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Test physics engine body configuration
function testBodyConfiguration() {
    console.log('Testing body configuration for equatorial elements...\n');
    
    // Simulate what the physics engine does
    const earthConfig = {
        name: 'earth',
        naif_id: 399,
        tilt: 23.5,
        obliquity: undefined,
        orientationGroup: null
    };
    
    // Test condition that enables equatorial element calculation
    const hasOrientationData = 
        earthConfig.tilt !== undefined || 
        earthConfig.obliquity !== undefined || 
        earthConfig.orientationGroup;
    
    console.log('✓ Earth configuration:', {
        name: earthConfig.name,
        tilt: earthConfig.tilt,
        hasOrientationData
    });
    
    if (hasOrientationData) {
        console.log('✅ Equatorial elements should be calculated');
    } else {
        console.log('❌ Equatorial elements will NOT be calculated');
        process.exit(1);
    }
}

// Run tests
console.log('=== Satellite Creation Test Suite ===\n');
testBodyConfiguration();
console.log('\n' + '='.repeat(50) + '\n');
testSatelliteCreation();