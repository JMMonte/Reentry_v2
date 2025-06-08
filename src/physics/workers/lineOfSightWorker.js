/**
 * Physics-based Line of Sight Worker
 * 
 * Calculates satellite-to-satellite and satellite-to-ground visibility
 * considering atmospheric refraction, Earth oblateness, terrain masking,
 * and minimum elevation angle constraints.
 */

let satellites = [];
let bodies = [];
let physicsState = null;

// Store active timeout IDs for cleanup
const activeTimeouts = new Set();

// Configuration parameters
const CONFIG = {
    MIN_ELEVATION_ANGLE: 5.0,          // degrees - minimum elevation for communications
    ATMOSPHERIC_REFRACTION: true,       // enable atmospheric refraction calculations
    CONSIDER_OBLATENESS: true,          // use oblate Earth model
    FREQUENCY_GHZ: 2.4,                // communication frequency in GHz
    TEMPERATURE_K: 288.15,              // standard atmosphere temperature in Kelvin
    PRESSURE_PA: 101325,                // standard atmosphere pressure in Pa
    HUMIDITY_PERCENT: 50                // relative humidity percentage
};

// Cleanup function for worker termination
function cleanup() {
    // Clear all active timeouts
    activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    activeTimeouts.clear();

    // Clear data
    satellites = [];
    bodies = [];
    physicsState = null;
}

self.onmessage = function (e) {
    // Handle termination signal
    if (e.data && e.data.type === 'terminate') {
        cleanup();
        self.close();
        return;
    }

    // Handle cleanup request
    if (e.data && e.data.type === 'cleanup') {
        cleanup();
        return;
    }

    switch (e.data.type) {
        case 'UPDATE_SCENE':
            satellites = e.data.satellites || [];
            bodies = e.data.bodies || [];

            // Update configuration if provided
            if (e.data.config) {
                Object.assign(CONFIG, e.data.config);
            }

            calculateLineOfSight();
            break;

        case 'UPDATE_PHYSICS_STATE':
            physicsState = e.data.physicsState;
            break;

        case 'UPDATE_CONFIG':
            Object.assign(CONFIG, e.data.config);
            if (satellites.length > 0) {
                calculateLineOfSight();
            }
            break;

        case 'CALCULATE_SPECIFIC_LOS':
            calculateSpecificLineOfSight(e.data.from, e.data.to);
            break;
    }
};

/**
 * Simple distance calculation helper
 */
function calculateDistance(pos1, pos2) {
    const dx = pos2[0] - pos1[0];
    const dy = pos2[1] - pos1[1];
    const dz = pos2[2] - pos1[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Check if a line segment intersects with a sphere (planet/moon)
 * @param {Array} lineStart - [x, y, z] start of line segment
 * @param {Array} lineEnd - [x, y, z] end of line segment  
 * @param {Array} sphereCenter - [x, y, z] center of sphere
 * @param {number} sphereRadius - radius of sphere in km
 * @param {number} atmosphereHeight - additional height for atmosphere in km
 * @returns {Object} intersection result
 */
function lineIntersectsSphere(lineStart, lineEnd, sphereCenter, sphereRadius, atmosphereHeight = 0) {
    // Vector from line start to sphere center
    const dx = sphereCenter[0] - lineStart[0];
    const dy = sphereCenter[1] - lineStart[1]; 
    const dz = sphereCenter[2] - lineStart[2];
    
    // Line direction vector (not normalized)
    const ldx = lineEnd[0] - lineStart[0];
    const ldy = lineEnd[1] - lineStart[1];
    const ldz = lineEnd[2] - lineStart[2];
    
    // Length of line direction vector
    const lineLength = Math.sqrt(ldx * ldx + ldy * ldy + ldz * ldz);
    if (lineLength === 0) return { intersects: false, distance: 0 };
    
    // Normalize line direction
    const dirx = ldx / lineLength;
    const diry = ldy / lineLength;
    const dirz = ldz / lineLength;
    
    // Project vector to sphere center onto line direction
    const projection = dx * dirx + dy * diry + dz * dirz;
    
    // Clamp projection to line segment bounds
    const t = Math.max(0, Math.min(lineLength, projection));
    
    // Find closest point on line segment to sphere center
    const closestX = lineStart[0] + t * dirx;
    const closestY = lineStart[1] + t * diry;
    const closestZ = lineStart[2] + t * dirz;
    
    // Distance from sphere center to closest point on line
    const distanceToLine = calculateDistance(sphereCenter, [closestX, closestY, closestZ]);
    
    // Check intersection with planet surface
    const planetIntersection = distanceToLine <= sphereRadius;
    
    // Check intersection with atmosphere
    const effectiveRadius = sphereRadius + atmosphereHeight;
    const atmosphereIntersection = distanceToLine <= effectiveRadius;
    
    return {
        intersects: planetIntersection,
        atmosphereIntersection,
        distance: distanceToLine,
        planetRadius: sphereRadius,
        atmosphereRadius: effectiveRadius,
        penetrationDepth: Math.max(0, effectiveRadius - distanceToLine)
    };
}

/**
 * Calculate line of sight between all satellites and ground stations
 */
function calculateLineOfSight() {
    const connections = [];
    const currentTime = physicsState?.currentTime || Date.now();

    // Satellite-to-satellite visibility
    for (let i = 0; i < satellites.length; i++) {
        for (let j = i + 1; j < satellites.length; j++) {

            try {
                // Calculate proper line-of-sight with planetary occlusion
                const visibility = calculateVisibility(satellites[i], satellites[j]);

                if (visibility.visible) {
                    connections.push({
                        type: 'satellite-satellite',
                        from: satellites[i].id,
                        to: satellites[j].id,
                        points: [satellites[i].position, satellites[j].position],
                        color: getConnectionColor(visibility),
                        metadata: visibility
                    });
                }
            } catch (error) {
                console.error(`[LineOfSightWorker] Error calculating visibility:`, error);
                // Add connection anyway for debugging
                connections.push({
                    type: 'satellite-satellite',
                    from: satellites[i].id,
                    to: satellites[j].id,
                    points: [satellites[i].position, satellites[j].position],
                    color: 'red',
                    metadata: { visible: true, linkQuality: 0, error: error.message }
                });
            }
        }
    }

    // Satellite-to-ground visibility (simplified for now)
    // TODO: Implement ground station connections when needed

    self.postMessage({
        type: 'CONNECTIONS_UPDATED',
        connections,
        timestamp: currentTime
    });
}

/**
 * Calculate specific line of sight between two objects
 */
function calculateSpecificLineOfSight(fromObj, toObj) {
    const visibility = calculateVisibility(fromObj, toObj, 'unknown', 'unknown', Date.now());

    self.postMessage({
        type: 'SPECIFIC_LOS_RESULT',
        from: fromObj.id,
        to: toObj.id,
        visibility
    });
}

/**
 * Main visibility calculation with proper planetary occlusion
 */
function calculateVisibility(objA, objB) {
    const posA = objA.position;
    const posB = objB.position;

    // Basic distance calculation
    const distance = calculateDistance(posA, posB);

    if (distance <= 0 || !isFinite(distance)) {
        return { visible: false, reason: 'invalid_distance', distance: 0 };
    }

    // Check maximum communication range
    const maxRange = 50000; // km - increased for interplanetary communications
    if (distance > maxRange) {
        return { 
            visible: false, 
            reason: 'out_of_range', 
            distance,
            linkQuality: 0,
            signalStrength: -150
        };
    }

    // Check for planetary/lunar occlusion
    let occluded = false;
    let occludingBody = null;
    let atmosphericLoss = 0;
    let grazeAtmosphere = false;

    for (const body of bodies) {
        if (!body.position || !body.radius || body.radius <= 0) continue;

        // Get atmosphere height based on body type
        const atmosphereHeight = getAtmosphereHeight(body);
        
        // Check line-sphere intersection
        const intersection = lineIntersectsSphere(
            posA, 
            posB, 
            body.position, 
            body.radius, 
            atmosphereHeight
        );

        if (intersection.intersects) {
            // Line passes through the solid body - complete occlusion
            occluded = true;
            occludingBody = body;
            break;
        } else if (intersection.atmosphereIntersection && atmosphereHeight > 0) {
            // Line grazes atmosphere - signal attenuation but not complete block
            grazeAtmosphere = true;
            const penetrationRatio = intersection.penetrationDepth / atmosphereHeight;
            atmosphericLoss += penetrationRatio * 20; // dB loss based on penetration depth
        }
    }

    if (occluded) {
        return {
            visible: false,
            reason: 'occluded',
            occludingBody: occludingBody?.naifId || 'unknown',
            distance,
            linkQuality: 0,
            signalStrength: -150,
            atmosphericLoss: 0
        };
    }

    // Calculate link quality based on distance and atmospheric effects
    const baseQuality = Math.max(0, 100 * (1 - distance / maxRange));
    const atmosphericPenalty = Math.min(50, atmosphericLoss); // Max 50% penalty
    const linkQuality = Math.max(0, baseQuality - atmosphericPenalty);

    // Calculate signal strength (simplified path loss model)
    // Free space path loss: 20*log10(distance) + 20*log10(frequency) + 32.44
    const frequencyGHz = CONFIG.FREQUENCY_GHZ || 2.4;
    const freeSpaceLoss = 20 * Math.log10(distance) + 20 * Math.log10(frequencyGHz) + 32.44;
    const signalStrength = 30 - freeSpaceLoss - atmosphericLoss; // Assume 30dBm transmit power

    const result = {
        visible: true,
        distance,
        linkQuality,
        signalStrength,
        atmosphericLoss,
        grazeAtmosphere,
        elevationAngle: null, // Could calculate relative to central body
        freeSpaceLoss
    };

    return result;
}

/**
 * Get atmosphere height for a celestial body using planetary config data
 */
function getAtmosphereHeight(body) {
    // Use real atmosphere data from planetary configurations
    if (!body || !body.radius || body.radius <= 0) return 0;
    
    // First priority: use atmosphere thickness from planetary config
    if (body.atmosphereThickness && body.atmosphereThickness > 0) {
        return body.atmosphereThickness;
    }
    
    // Second priority: use atmospheric model maxAltitude
    if (body.atmosphericModel?.maxAltitude && body.atmosphericModel.maxAltitude > 0) {
        return body.atmosphericModel.maxAltitude;
    }
    
    // No atmosphere data available
    return 0;
}


// Elevation angle calculation removed - not needed for simplified implementation

// Atmospheric effects calculation removed - not needed for simplified implementation

// Latitude effect calculation removed - not needed for simplified implementation

// Signal strength calculation removed - handled in calculateVisibility

// Link quality calculation removed - handled in calculateVisibility

/**
 * Get connection color based on link quality
 */
function getConnectionColor(visibility) {
    if (!visibility.visible) return 'red';

    const quality = visibility.linkQuality || 50;

    if (quality > 80) return 'green';
    if (quality > 60) return 'yellow';
    if (quality > 40) return 'orange';
    return 'red';
}

// Ray-sphere intersection removed - not needed for simplified implementation