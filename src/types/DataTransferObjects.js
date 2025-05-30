/**
 * Data Transfer Objects for clean communication between layers
 */

/**
 * Maneuver Node DTO
 * @typedef {Object} ManeuverNodeDTO
 * @property {string} id - Unique identifier
 * @property {Date} executionTime - When to execute the maneuver
 * @property {Object} deltaV - Delta-V in local coordinates
 * @property {number} deltaV.prograde - Prograde component (km/s)
 * @property {number} deltaV.normal - Normal component (km/s)
 * @property {number} deltaV.radial - Radial component (km/s)
 * @property {number} deltaMagnitude - Total delta-V magnitude (km/s)
 * @property {Object} predictedOrbit - Predicted orbital elements after maneuver
 * @property {number} predictedOrbit.semiMajorAxis - km
 * @property {number} predictedOrbit.eccentricity
 * @property {number} predictedOrbit.inclination - degrees
 * @property {number} predictedOrbit.longitudeOfAscendingNode - degrees
 * @property {number} predictedOrbit.argumentOfPeriapsis - degrees
 * @property {number} predictedOrbit.trueAnomaly - degrees
 * @property {number} predictedOrbit.period - seconds
 */

/**
 * Hohmann Transfer Request DTO
 * @typedef {Object} HohmannTransferRequestDTO
 * @property {number} targetPeriapsis - Target periapsis altitude (km above surface)
 * @property {number} targetApoapsis - Target apoapsis altitude (km above surface)
 * @property {number} targetInclination - Target inclination (degrees)
 * @property {number} targetLAN - Target longitude of ascending node (degrees)
 * @property {number} targetArgP - Target argument of periapsis (degrees)
 * @property {Date} [burnTime] - Optional specific burn time
 */

/**
 * Hohmann Transfer Response DTO
 * @typedef {Object} HohmannTransferResponseDTO
 * @property {ManeuverNodeDTO[]} maneuverNodes - Array of maneuver nodes (usually 2)
 * @property {number} totalDeltaV - Total delta-V required (km/s)
 * @property {number} transferTime - Transfer duration (seconds)
 * @property {number} planeChangeAngle - Required plane change (degrees)
 * @property {Object} burn1 - First burn details
 * @property {number} burn1.deltaV - Delta-V magnitude (km/s)
 * @property {Date} burn1.time - Execution time
 * @property {Object} burn2 - Second burn details
 * @property {number} burn2.deltaV - Delta-V magnitude (km/s)
 * @property {Date} burn2.time - Execution time
 * @property {number} burn2.orbitalComponent - Orbital change component (km/s)
 * @property {number} burn2.planeChangeComponent - Plane change component (km/s)
 */

/**
 * Orbit Prediction Request DTO
 * @typedef {Object} OrbitPredictionRequestDTO
 * @property {string} satelliteId - Satellite identifier
 * @property {Date} startTime - Start time for prediction
 * @property {number} duration - Prediction duration (seconds)
 * @property {number} timeStep - Time step for prediction points (seconds)
 * @property {ManeuverNodeDTO[]} maneuverNodes - Maneuver nodes to include
 */

/**
 * Orbit Prediction Response DTO
 * @typedef {Object} OrbitPredictionResponseDTO
 * @property {Object[]} trajectory - Array of position/velocity points
 * @property {Date} trajectory[].time - Time at this point
 * @property {number[]} trajectory[].position - [x, y, z] in km
 * @property {number[]} trajectory[].velocity - [vx, vy, vz] in km/s
 * @property {Object} finalOrbit - Final orbital elements
 * @property {boolean} atmosphereEntry - Whether orbit enters atmosphere
 * @property {Date} [atmosphereEntryTime] - Time of atmosphere entry if applicable
 */

/**
 * Maneuver Visualization DTO
 * @typedef {Object} ManeuverVisualizationDTO
 * @property {string} nodeId - Maneuver node identifier
 * @property {number[]} position - Node position [x, y, z] in km
 * @property {number[]} deltaVDirection - Delta-V direction vector (normalized)
 * @property {number} deltaVMagnitude - Delta-V magnitude (km/s)
 * @property {string} color - Hex color for visualization
 * @property {number} scale - Visual scale factor
 * @property {boolean} showPredictedOrbit - Whether to show predicted orbit
 * @property {number[][]} predictedOrbitPoints - Array of [x, y, z] points for orbit
 */

/**
 * Create a ManeuverNodeDTO
 * @param {Object} params
 * @returns {ManeuverNodeDTO}
 */
export function createManeuverNodeDTO(params) {
    return {
        id: params.id || generateId(),
        executionTime: params.executionTime,
        deltaV: {
            prograde: params.deltaV.prograde || 0,
            normal: params.deltaV.normal || 0,
            radial: params.deltaV.radial || 0
        },
        deltaMagnitude: Math.sqrt(
            params.deltaV.prograde ** 2 + 
            params.deltaV.normal ** 2 + 
            params.deltaV.radial ** 2
        ),
        predictedOrbit: params.predictedOrbit || null
    };
}

/**
 * Create a HohmannTransferRequestDTO
 * @param {Object} params
 * @returns {HohmannTransferRequestDTO}
 */
export function createHohmannTransferRequestDTO(params) {
    return {
        targetPeriapsis: params.targetPeriapsis,
        targetApoapsis: params.targetApoapsis,
        targetInclination: params.targetInclination || 0,
        targetLAN: params.targetLAN || 0,
        targetArgP: params.targetArgP || 0,
        burnTime: params.burnTime || null
    };
}

/**
 * Create a ManeuverVisualizationDTO
 * @param {Object} params
 * @returns {ManeuverVisualizationDTO}
 */
export function createManeuverVisualizationDTO(params) {
    return {
        nodeId: params.nodeId,
        position: params.position,
        deltaVDirection: params.deltaVDirection,
        deltaVMagnitude: params.deltaVMagnitude,
        color: params.color || '#ffffff',
        scale: params.scale || 1,
        showPredictedOrbit: params.showPredictedOrbit !== false,
        predictedOrbitPoints: params.predictedOrbitPoints || []
    };
}

/**
 * Generate unique ID
 * @returns {string}
 */
function generateId() {
    return `mn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate ManeuverNodeDTO
 * @param {ManeuverNodeDTO} dto
 * @returns {boolean}
 */
export function validateManeuverNodeDTO(dto) {
    return dto &&
        dto.id &&
        dto.executionTime instanceof Date &&
        dto.deltaV &&
        typeof dto.deltaV.prograde === 'number' &&
        typeof dto.deltaV.normal === 'number' &&
        typeof dto.deltaV.radial === 'number' &&
        typeof dto.deltaMagnitude === 'number';
}

export default {
    createManeuverNodeDTO,
    createHohmannTransferRequestDTO,
    createManeuverVisualizationDTO,
    validateManeuverNodeDTO
};