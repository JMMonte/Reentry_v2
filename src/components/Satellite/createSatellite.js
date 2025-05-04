import * as THREE from 'three';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Constants } from '../../utils/Constants.js';
import { inertialToWorld } from '../../utils/FrameTransforms.js';

/*──────────────── session-wide unique ID counter ────────────────*/
let nextSatelliteId = 0;
export function resetSatelliteIdCounter() { nextSatelliteId = 0; }

/*────────────────── bright random colours (unchanged) ───────────*/
const brightColors = [
    0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,
    0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,
    0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,
    0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,
    0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF
];

/*──────────────────────── core creator ──────────────────────────*/
export async function createSatellite(app, params) {
    const id = nextSatelliteId++;
    const color = brightColors[Math.floor(Math.random() * brightColors.length)];

    const satParams = {
        ...params,
        id,
        color,
        mass: params.mass ?? 100,
        size: params.size ?? 1,
        name: params.name,
        ballisticCoefficient: params.ballisticCoefficient
    };

    const sat = app.satellites.addSatellite(satParams);

    const disp = app.displaySettingsManager?.settings || app.displaySettings || {};
    if (sat.orbitLine) sat.orbitLine.visible = disp.showOrbits;
    if (sat.apsisVisualizer) sat.apsisVisualizer.visible = disp.showOrbits;
    if (sat.velocityVector) sat.velocityVector.visible = disp.showSatVectors;
    if (sat.orientationVector) sat.orientationVector.visible = disp.showSatVectors;

    if (sat.orbitLine?.visible) sat.updateOrbitLine(params.position, params.velocity);

    app.createDebugWindow?.(sat);
    app.updateSatelliteList?.();
    return sat;
}

/*────────────────────— internal helper —────────────────────────*/
// Lat/Lon → inertial/ecliptic world:
function launchFromLatLon(app, {
    latitude, longitude, altitude,
    velocity = 0, azimuth = 0, angleOfAttack = 0,
    mass, size, name
}) {
    // 1) pure geodetic → world position (lat,lon) on rotated Earth mesh
    const earthMesh = app.earth.getMesh();
    // compute world radius (km × scale)
    const R_m = Constants.earthRadius + altitude * Constants.kmToMeters;
    const worldR = R_m * Constants.metersToKm;
    // local Cartesian before tilt/rotation
    const posLocal = PhysicsUtils.convertLatLonToCartesian(
        latitude, longitude, worldR
    );
    // transform through planet's tiltGroup & rotationGroup
    earthMesh.localToWorld(posLocal);
    // compute local ECEF position & velocity (m, m/s)
    const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
        latitude,
        longitude,
        altitude * Constants.kmToMeters,
        velocity * Constants.kmToMeters,
        azimuth,
        angleOfAttack,
        new THREE.Quaternion(), // no tilt
        new THREE.Quaternion()  // no spin
    );
    // add Earth's spin velocity (m/s)
    const spinVel = PhysicsUtils.calculateEarthSurfaceVelocity(
        positionECEF,
        Constants.earthRotationSpeed
    );
    const velECEFfull = velocityECEF.clone().add(spinVel);
    // rotate ECEF velocity into world orientation and scale to km×scale
    const worldQuat = earthMesh.getWorldQuaternion(new THREE.Quaternion());
    const velWorld = velECEFfull.clone()
        .applyQuaternion(worldQuat)
        .multiplyScalar(Constants.metersToKm);
    return createSatellite(app, { position: posLocal, velocity: velWorld, mass, size, name });
}

/*────────── public wrappers — lat/lon launch (free or circular) ──────────*/
export function createSatelliteFromLatLon(app, p) {
    const params = { ...p };
    if (params.circular) {
        const r = Constants.earthRadius + params.altitude * Constants.kmToMeters;
        // orbital velocity in m/s → convert to km/s for launchFromLatLon
        const vCirc = PhysicsUtils.calculateOrbitalVelocity(Constants.earthMass, r) * Constants.metersToKm;
        params.velocity = vCirc;
    }
    return launchFromLatLon(app, params);
}
// backward-compatible alias for circular launches
export function createSatelliteFromLatLonCircular(app, p) {
    return createSatelliteFromLatLon(app, { ...p, circular: true });
}

/*────────── orbital-element creator ───────────────*/
export function createSatelliteFromOrbitalElements(app, {
    semiMajorAxis, eccentricity, inclination,
    raan, argumentOfPeriapsis, trueAnomaly,
    referenceFrame = 'inertial',
    mass, size, name
}) {
    // Compute the inertial position & velocity
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        inclination,
        argumentOfPeriapsis,
        raan,
        trueAnomaly
    );

    // Delegate to FrameTransforms for ecliptic/inertial/equatorial handling
    const { position, velocity } = inertialToWorld(
        app.earth,
        positionECI,
        velocityECI,
        { referenceFrame }
    );

    // Ecliptic: world XY-plane is ecliptic, so use ECI directly
    if (referenceFrame === 'ecliptic') {
        const pos = positionECI.clone().multiplyScalar(Constants.metersToKm);
        const vel = velocityECI.clone().multiplyScalar(Constants.metersToKm);
        return createSatellite(app, { position: pos, velocity: vel, mass, size, name });
    }
    // Equatorial: tilt frame by -ε (remove axial tilt) so orbit is in planet equatorial plane
    if (referenceFrame === 'equatorial') {
        const pos = positionECI.clone().applyQuaternion(PhysicsUtils.invTiltQuaternion).multiplyScalar(Constants.metersToKm);
        const vel = velocityECI.clone().applyQuaternion(PhysicsUtils.invTiltQuaternion).multiplyScalar(Constants.metersToKm);
        return createSatellite(app, { position: pos, velocity: vel, mass, size, name });
    }

    return createSatellite(app, { position, velocity, mass, size, name });
}

/*────────── ground-track helper (unchanged except frame) ──────*/
export async function getVisibleLocationsFromOrbitalElements(
    app, orbitParams, locations, options = {}
) {
    const { semiMajorAxis } = orbitParams;
    /* use the world-space satellite produced above */
    const sat = createSatelliteFromOrbitalElements(app, { ...orbitParams, mass: 1, size: 0.1, name: 'tmp' });
    const startPos = sat.position.clone().multiplyScalar(Constants.kmToMeters);
    const startVel = sat.velocity.clone().multiplyScalar(Constants.kmToMeters);

    const mu = Constants.earthGravitationalParameter;
    const baseT = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis * Constants.kmToMeters, 3) / mu);
    const periods = options.numPeriods ?? 1;
    const steps = (options.numPoints ?? 180) * periods;

    const eciPts = await PhysicsUtils.propagateOrbit(
        startPos, startVel,
        [{ position: new THREE.Vector3(0, 0, 0), mass: Constants.earthMass }],
        baseT * periods,
        steps
    );

    const ReKm = Constants.earthRadius * Constants.metersToKm;
    const t0 = Date.now();
    const out = [];

    eciPts.forEach((pKm, idx) => {
        const t = t0 + idx * (baseT * periods * 1000 / steps);
        const gmst = PhysicsUtils.calculateGMST(t);
        const { lat, lon } = PhysicsUtils.eciTiltToLatLon(
            pKm.clone().multiplyScalar(Constants.kmToMeters), gmst
        );
        const alt = pKm.length() - ReKm;

        const theta = Math.acos(Constants.earthRadius /
            (Constants.earthRadius + alt * Constants.kmToMeters));
        const cosLimit = Math.cos(theta);
        const lat1 = THREE.MathUtils.degToRad(lat);
        const lon1 = THREE.MathUtils.degToRad(lon);
        const sinLat1 = Math.sin(lat1);
        const cosLat1 = Math.cos(lat1);

        const visible = locations.filter(loc => {
            const lat2 = THREE.MathUtils.degToRad(loc.lat);
            const lon2 = THREE.MathUtils.degToRad(loc.lon);
            let dLon = Math.abs(lon2 - lon1);
            if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
            const cosC = sinLat1 * Math.sin(lat2) + cosLat1 * Math.cos(lat2) * Math.cos(dLon);
            return cosC >= cosLimit;
        });

        out.push({ time: t, lat, lon, altitude: alt, visible });
    });

    /* remove the temporary satellite */
    app.satellites.removeSatellite?.(sat.id);

    return out;
}
