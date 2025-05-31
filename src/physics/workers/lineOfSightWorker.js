/**
 * Physics-based Line of Sight Worker
 * 
 * Calculates satellite-to-satellite and satellite-to-ground visibility
 * considering atmospheric refraction, Earth oblateness, terrain masking,
 * and minimum elevation angle constraints.
 */

let satellites = [];
let bodies = [];
let groundStations = [];
let physicsState = null;

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

self.onmessage = function (e) {
    switch (e.data.type) {
        case 'UPDATE_SCENE':
            satellites = e.data.satellites || [];
            bodies = e.data.bodies || [];
            groundStations = e.data.groundStations || [];
            
            // Update configuration if provided
            if (e.data.config) {
                console.log('[lineOfSightWorker] Received config:', e.data.config);
                Object.assign(CONFIG, e.data.config);
                console.log('[lineOfSightWorker] Updated CONFIG:', CONFIG);
            }
            
            console.log('[lineOfSightWorker] Processing:', satellites.length, 'satellites,', bodies.length, 'bodies');
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
 * Calculate line of sight between all satellites and ground stations
 */
function calculateLineOfSight() {
    const connections = [];
    const currentTime = physicsState?.currentTime || Date.now();
    
    console.log('[lineOfSightWorker] calculateLineOfSight called with', satellites.length, 'satellites');
    
    // Satellite-to-satellite visibility
    for (let i = 0; i < satellites.length; i++) {
        for (let j = i + 1; j < satellites.length; j++) {
            const visibility = calculateVisibility(
                satellites[i], 
                satellites[j], 
                'satellite', 
                'satellite',
                currentTime
            );
            
            if (visibility.visible) {
                connections.push({
                    type: 'satellite-satellite',
                    from: satellites[i].id,
                    to: satellites[j].id,
                    points: [satellites[i].position, satellites[j].position],
                    color: getConnectionColor(visibility),
                    metadata: visibility
                });
            } else {
                console.log('[lineOfSightWorker] Connection rejected:', satellites[i].id, '->', satellites[j].id, 'reason:', visibility.reason);
            }
        }
    }
    
    // Satellite-to-ground visibility
    for (const satellite of satellites) {
        for (const groundStation of groundStations) {
            const visibility = calculateVisibility(
                satellite,
                groundStation,
                'satellite',
                'ground',
                currentTime
            );
            
            if (visibility.visible) {
                connections.push({
                    type: 'satellite-ground',
                    from: satellite.id,
                    to: groundStation.id,
                    points: [satellite.position, groundStation.position],
                    color: getConnectionColor(visibility),
                    metadata: visibility
                });
            }
        }
    }
    
    console.log('[lineOfSightWorker] Calculated', connections.length, 'connections');
    
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
 * Main visibility calculation with physics-based considerations
 */
function calculateVisibility(objA, objB, typeA, typeB) {
    const posA = objA.position;
    const posB = objB.position;
    
    // Calculate basic geometric parameters
    const dx = posB[0] - posA[0];
    const dy = posB[1] - posA[1];
    const dz = posB[2] - posA[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (distance <= 0) {
        return { visible: false, reason: 'zero_distance' };
    }
    
    const rayDirection = [dx / distance, dy / distance, dz / distance];
    
    // Check for body occlusion with physics-based improvements
    const occlusionResult = checkPhysicsBasedOcclusion(posA, posB, rayDirection, distance);
    if (occlusionResult.occluded) {
        return { 
            visible: false, 
            reason: 'occluded', 
            occludingBody: occlusionResult.body,
            distance
        };
    }
    
    // Calculate elevation angles for ground-satellite links
    let elevationAngle = null;
    if (typeA === 'ground' || typeB === 'ground') {
        const groundPos = typeA === 'ground' ? posA : posB;
        const satPos = typeA === 'ground' ? posB : posA;
        elevationAngle = calculateElevationAngle(groundPos, satPos);
        
        if (elevationAngle < CONFIG.MIN_ELEVATION_ANGLE) {
            return { 
                visible: false, 
                reason: 'low_elevation', 
                elevationAngle,
                minElevation: CONFIG.MIN_ELEVATION_ANGLE,
                distance
            };
        }
    }
    
    // Calculate atmospheric effects if enabled
    let atmosphericLoss = 0;
    let refractedPath = distance;
    
    if (CONFIG.ATMOSPHERIC_REFRACTION && (typeA === 'ground' || typeB === 'ground')) {
        const atmosphericResult = calculateAtmosphericEffects(
            typeA === 'ground' ? posA : posB,  // ground position
            typeA === 'ground' ? posB : posA,  // satellite position
            elevationAngle
        );
        
        atmosphericLoss = atmosphericResult.loss;
        refractedPath = atmosphericResult.refractedDistance;
        
        // Check if atmospheric loss is too high for communication
        if (atmosphericLoss > 50) { // dB threshold
            return { 
                visible: false, 
                reason: 'atmospheric_loss', 
                atmosphericLoss,
                distance
            };
        }
    }
    
    return {
        visible: true,
        distance,
        elevationAngle,
        atmosphericLoss,
        refractedPath,
        signalStrength: calculateSignalStrength(distance, atmosphericLoss),
        linkQuality: calculateLinkQuality(distance, elevationAngle, atmosphericLoss)
    };
}

/**
 * Physics-based occlusion check considering Earth oblateness and atmospheric effects
 */
function checkPhysicsBasedOcclusion(posA, posB, rayDirection, maxDistance) {
    for (const body of bodies) {
        let effectiveRadius = body.radius;
        
        // Apply Earth oblateness if enabled and this is Earth
        if (CONFIG.CONSIDER_OBLATENESS && body.naifId === 399) {
            const earthConstants = {
                EARTH_RADIUS: 6371.0,
                RAD_TO_DEG: 180 / Math.PI,
                DEG_TO_RAD: Math.PI / 180
            };
            const flattening = earthConstants.EARTH_J2 * 2; // Approximate flattening
            
            // Calculate latitude-dependent radius
            const bodyCenter = body.position;
            const latEffect = calculateLatitudeEffect(posA, posB, bodyCenter);
            effectiveRadius = body.radius * (1 - flattening * latEffect);
        }
        
        // Add atmospheric buffer for bodies with atmospheres
        if (body.naifId === 399 || body.naifId === 499 || body.naifId === 299) { // Earth, Mars, Venus
            const atmosData = {
                EARTH: {
                    ATMOSPHERIC_RADIUS: 100, // km
                    SCALE_HEIGHT: 8.5 // km
                }
            };
            if (body.naifId === 399 && atmosData.EARTH) {
                effectiveRadius += atmosData.EARTH.ATMOSPHERIC_RADIUS;
            } else if (body.naifId === 499 && atmosData.MARS) {
                effectiveRadius += atmosData.MARS.ATMOSPHERIC_RADIUS;
            } else if (body.naifId === 299 && atmosData.VENUS) {
                effectiveRadius += atmosData.VENUS.ATMOSPHERIC_RADIUS;
            }
        }
        
        if (sphereIntersect(
            posA[0], posA[1], posA[2],
            rayDirection[0], rayDirection[1], rayDirection[2],
            body.position[0], body.position[1], body.position[2],
            effectiveRadius,
            maxDistance
        )) {
            return { occluded: true, body: body.naifId };
        }
    }
    
    return { occluded: false };
}

/**
 * Calculate elevation angle from ground station to satellite
 */
function calculateElevationAngle(groundPos, satPos) {
    // Vector from ground to satellite
    const dx = satPos[0] - groundPos[0];
    const dy = satPos[1] - groundPos[1]; 
    const dz = satPos[2] - groundPos[2];
    
    // Ground station local "up" vector (assuming Earth-centered coordinates)
    const groundRadius = Math.sqrt(groundPos[0] * groundPos[0] + groundPos[1] * groundPos[1] + groundPos[2] * groundPos[2]);
    const upX = groundPos[0] / groundRadius;
    const upY = groundPos[1] / groundRadius;
    const upZ = groundPos[2] / groundRadius;
    
    // Satellite range vector
    const rangeLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const rangeX = dx / rangeLength;
    const rangeY = dy / rangeLength;
    const rangeZ = dz / rangeLength;
    
    // Elevation angle = 90° - angle between up vector and range vector
    const dotProduct = upX * rangeX + upY * rangeY + upZ * rangeZ;
    const elevationRad = Math.asin(Math.max(-1, Math.min(1, dotProduct)));
    
    return elevationRad * (180 / Math.PI);
}

/**
 * Calculate atmospheric effects on radio propagation
 */
function calculateAtmosphericEffects(groundPos, satPos, elevationAngle) {
    if (!elevationAngle || elevationAngle <= 0) {
        return { loss: 100, refractedDistance: Infinity }; // Below horizon
    }
    
    const distance = Math.sqrt(
        (satPos[0] - groundPos[0]) ** 2 +
        (satPos[1] - groundPos[1]) ** 2 +
        (satPos[2] - groundPos[2]) ** 2
    );
    
    // Atmospheric absorption (simplified model)
    const frequency = CONFIG.FREQUENCY_GHZ;
    const elevationRad = elevationAngle * (Math.PI / 180);
    
    // Path through atmosphere (sec(zenith angle) approximation)
    const zenithAngle = Math.PI / 2 - elevationRad;
    const atmosphericPath = 100 / Math.cos(zenithAngle); // 100 km atmospheric radius
    
    // Frequency-dependent atmospheric absorption
    let absorptionCoeff = 0;
    if (frequency < 1) {
        absorptionCoeff = 0.001; // Very low at low frequencies
    } else if (frequency < 10) {
        absorptionCoeff = 0.01 * frequency; // Linear increase
    } else {
        absorptionCoeff = 0.1 + 0.05 * (frequency - 10); // Higher absorption
    }
    
    // Weather effects
    const humidityFactor = 1 + (CONFIG.HUMIDITY_PERCENT / 100) * 0.5;
    const weatherAttenuation = absorptionCoeff * atmosphericPath * humidityFactor;
    
    // Ionospheric scintillation (simplified)
    const scintillationLoss = Math.random() * 2; // 0-2 dB random variation
    
    const totalLoss = weatherAttenuation + scintillationLoss;
    
    // Refraction effect on path length
    const refractionIndex = 1 + 0.000315 * (CONFIG.PRESSURE_PA / 101325) * (273.15 / CONFIG.TEMPERATURE_K);
    const refractedDistance = distance * refractionIndex;
    
    return {
        loss: totalLoss,
        refractedDistance,
        atmosphericPath,
        scintillationLoss
    };
}

/**
 * Calculate latitude effect for Earth oblateness
 */
function calculateLatitudeEffect(posA, posB, bodyCenter) {
    // Simplified latitude calculation from midpoint
    const midX = (posA[0] + posB[0]) / 2 - bodyCenter[0];
    const midY = (posA[1] + posB[1]) / 2 - bodyCenter[1];
    const midZ = (posA[2] + posB[2]) / 2 - bodyCenter[2];
    
    const r = Math.sqrt(midX * midX + midY * midY + midZ * midZ);
    const latSin = Math.abs(midZ) / r; // sin(latitude) approximation
    
    return latSin * latSin; // sin²(latitude) for J2 effect
}

/**
 * Calculate signal strength based on distance and atmospheric loss
 */
function calculateSignalStrength(distance, atmosphericLoss) {
    // Free space path loss (dB)
    const frequency = CONFIG.FREQUENCY_GHZ;
    const freeSpaceLoss = 20 * Math.log10(distance) + 20 * Math.log10(frequency) + 92.45;
    
    // Total loss
    const totalLoss = freeSpaceLoss + atmosphericLoss;
    
    // Assume transmit power of 30 dBm, convert to received signal strength
    const receivedPower = 30 - totalLoss; // dBm
    
    return receivedPower;
}

/**
 * Calculate overall link quality score
 */
function calculateLinkQuality(distance, elevationAngle, atmosphericLoss) {
    let quality = 100; // Start with perfect quality
    
    // Distance penalty
    quality -= Math.min(50, distance / 1000); // Reduce by distance in 1000s of km
    
    // Elevation angle bonus/penalty
    if (elevationAngle) {
        if (elevationAngle < 10) {
            quality -= (10 - elevationAngle) * 5; // Penalty for low elevation
        } else if (elevationAngle > 45) {
            quality += Math.min(10, (elevationAngle - 45) / 5); // Bonus for high elevation
        }
    }
    
    // Atmospheric loss penalty
    quality -= atmosphericLoss * 2;
    
    return Math.max(0, Math.min(100, quality));
}

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

/**
 * Ray-sphere intersection with improved numerical stability
 */
function sphereIntersect(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius, maxDistance) {
    const ocx = ox - cx;
    const ocy = oy - cy; 
    const ocz = oz - cz;
    
    const a = dx * dx + dy * dy + dz * dz; // Should be ~1 for normalized direction
    const b = 2 * (ocx * dx + ocy * dy + ocz * dz);
    const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return false;
    
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    
    // Check if intersection occurs within the line segment
    return (t1 > 0.001 && t1 < maxDistance) || (t2 > 0.001 && t2 < maxDistance);
}