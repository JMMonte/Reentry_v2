import { Body, BaryState, MakeTime } from 'astronomy-engine';
import * as THREE from 'three';

// Conversion constants
const AU_TO_KM = 149597870.7; // Astronomical Units to kilometers

// Canonical orbits and NAIF mapping (populated from solar_system.py)
const SOLAR_SYSTEM_BODIES = [
    // Barycenters
    { id: 0, name: 'Solar System Barycenter', parent: null },
    { id: 10, name: 'Sun', parent: 0 },
    { id: 1, name: 'Mercury Barycenter', parent: 0, canonical_orbit: { a: 57909050.0, e: 0.2056, i: 7.005, Omega: 48.331, omega: 29.124, M0: 174.796 } },
    { id: 2, name: 'Venus Barycenter', parent: 0, canonical_orbit: { a: 108208000.0, e: 0.0067, i: 3.3947, Omega: 76.680, omega: 54.884, M0: 50.416 } },
    { id: 3, name: 'Earth Barycenter', parent: 0, canonical_orbit: { a: 149598023.0, e: 0.0167, i: 0.000, Omega: -11.26064, omega: 114.20783, M0: 358.617 } },
    { id: 4, name: 'Mars Barycenter', parent: 0, canonical_orbit: { a: 227939200.0, e: 0.0935, i: 1.850, Omega: 49.558, omega: 286.502, M0: 19.373 } },
    { id: 5, name: 'Jupiter Barycenter', parent: 0, canonical_orbit: { a: 778570000.0, e: 0.0489, i: 1.303, Omega: 100.464, omega: 273.867, M0: 20.020 } },
    { id: 6, name: 'Saturn Barycenter', parent: 0, canonical_orbit: { a: 1433530000.0, e: 0.0565, i: 2.485, Omega: 113.665, omega: 339.392, M0: 317.020 } },
    { id: 7, name: 'Uranus Barycenter', parent: 0, canonical_orbit: { a: 2875040000.0, e: 0.0463, i: 0.773, Omega: 74.006, omega: 96.998, M0: 142.2386 } },
    { id: 8, name: 'Neptune Barycenter', parent: 0, canonical_orbit: { a: 4504450000.0, e: 0.0097, i: 1.770, Omega: 131.784, omega: 273.187, M0: 256.228 } },
    { id: 9, name: 'Pluto System Barycenter', parent: 0, canonical_orbit: { a: 5906440628.0, e: 0.2488, i: 17.16, Omega: 110.299, omega: 113.834, M0: 14.53 } },
    // Planets
    { id: 199, name: 'Mercury', parent: 1, canonical_orbit: { a: 57909050.0, e: 0.2056, i: 7.005, Omega: 48.331, omega: 29.124, M0: 174.796 } },
    { id: 299, name: 'Venus', parent: 2, canonical_orbit: { a: 108208000.0, e: 0.0067, i: 3.3947, Omega: 76.680, omega: 54.884, M0: 50.416 } },
    { id: 399, name: 'Earth', parent: 3, canonical_orbit: { a: 149598023.0, e: 0.0167, i: 0.000, Omega: -11.26064, omega: 114.20783, M0: 358.617 } },
    { id: 499, name: 'Mars', parent: 4, canonical_orbit: { a: 227939200.0, e: 0.0935, i: 1.850, Omega: 49.558, omega: 286.502, M0: 19.373 } },
    { id: 599, name: 'Jupiter', parent: 5, canonical_orbit: { a: 778570000.0, e: 0.0489, i: 1.303, Omega: 100.464, omega: 273.867, M0: 20.020 } },
    { id: 699, name: 'Saturn', parent: 6, canonical_orbit: { a: 1433530000.0, e: 0.0565, i: 2.485, Omega: 113.665, omega: 339.392, M0: 317.020 } },
    { id: 799, name: 'Uranus', parent: 7, canonical_orbit: { a: 2875040000.0, e: 0.0463, i: 0.773, Omega: 74.006, omega: 96.998, M0: 142.2386 } },
    { id: 899, name: 'Neptune', parent: 8, canonical_orbit: { a: 4504450000.0, e: 0.0097, i: 1.770, Omega: 131.784, omega: 273.187, M0: 256.228 } },
    { id: 999, name: 'Pluto', parent: 9, canonical_orbit: { a: 5906440628.0, e: 0.2488, i: 17.16, Omega: 110.299, omega: 113.834, M0: 14.53 } },
    // Major moons (sample, add more as needed)
    { id: 301, name: 'Moon', parent: 3, canonical_orbit: { a: 384400.0, e: 0.0549, i: 5.145, Omega: 125.08, omega: 318.15, M0: 115.3654 } },
    { id: 401, name: 'Phobos', parent: 4, canonical_orbit: { a: 9376.0, e: 0.0151, i: 1.075, Omega: 49.2, omega: 150.057, M0: 177.4 } },
    { id: 402, name: 'Deimos', parent: 4, canonical_orbit: { a: 23463.2, e: 0.00033, i: 1.788, Omega: 316.65, omega: 260.729, M0: 53.2 } },
    { id: 501, name: 'Io', parent: 5, canonical_orbit: { a: 421700.0, e: 0.0041, i: 0.036, Omega: 43.977, omega: 84.129, M0: 171.016 } },
    { id: 502, name: 'Europa', parent: 5, canonical_orbit: { a: 671034.0, e: 0.009, i: 0.465, Omega: 219.106, omega: 88.970, M0: 29.298 } },
    { id: 503, name: 'Ganymede', parent: 5, canonical_orbit: { a: 1070412.0, e: 0.0013, i: 0.177, Omega: 63.552, omega: 192.417, M0: 192.417 } },
    { id: 504, name: 'Callisto', parent: 5, canonical_orbit: { a: 1882709.0, e: 0.007, i: 0.192, Omega: 298.848, omega: 52.643, M0: 52.643 } },
    // Add more moons as needed from solar_system.py
];

// NAIF ID mapping to Astronomy Engine body names
const NAIF_TO_ASTRONOMY_ENGINE = {
    10: 'Sun',
    199: 'Mercury', 
    299: 'Venus',
    399: 'Earth',
    499: 'Mars',
    599: 'Jupiter',
    699: 'Saturn', 
    799: 'Uranus',
    899: 'Neptune',
    301: 'Moon'
};

// Keplerian propagator: converts orbital elements to Cartesian coordinates (km, J2000)
function keplerianToCartesian(orbit, epochJd, targetJd) {
    // Unpack elements
    const { a, e, i, Omega, omega, M0 } = orbit;
    // Convert angles to radians
    const deg2rad = Math.PI / 180;
    const iRad = i * deg2rad;
    const OmegaRad = Omega * deg2rad;
    const omegaRad = omega * deg2rad;
    // Mean motion n (rad/day)
    const mu = 1.32712440018e11; // Sun GM, km^3/s^2
    const n = Math.sqrt(mu / Math.pow(a, 3)) * 86400; // mean motion, rad/day
    // Time since epoch (days)
    const dt = targetJd - epochJd;
    // Mean anomaly at target time
    const M = ((M0 + n * dt) % 360) * deg2rad;
    // Solve Kepler's equation for E (eccentric anomaly)
    let E = M;
    for (let j = 0; j < 8; ++j) {
        E = M + e * Math.sin(E);
    }
    // True anomaly
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    // Distance
    const r = a * (1 - e * Math.cos(E));
    // Position in orbital plane
    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    // Rotate to J2000
    const cosO = Math.cos(OmegaRad), sinO = Math.sin(OmegaRad);
    const cosi = Math.cos(iRad), sini = Math.sin(iRad);
    const cosw = Math.cos(omegaRad), sinw = Math.sin(omegaRad);
    // Perifocal to Ecliptic
    const x = (cosO * cosw - sinO * sinw * cosi) * xOrb + (-cosO * sinw - sinO * cosw * cosi) * yOrb;
    const y = (sinO * cosw + cosO * sinw * cosi) * xOrb + (-sinO * sinw + cosO * cosw * cosi) * yOrb;
    const z = (sinw * sini) * xOrb + (cosw * sini) * yOrb;
    return { x, y, z };
}

function getBodyConfig(naifId) {
    return SOLAR_SYSTEM_BODIES.find(b => b.id === naifId);
}

function getPoleQuaternion(pole_ra, pole_dec) {
    // Convert pole orientation (RA, Dec) to quaternion (J2000)
    // RA/Dec in degrees
    const ra = pole_ra[0] * Math.PI / 180;
    const dec = pole_dec[0] * Math.PI / 180;
    // Z axis in ecliptic frame
    const z = new THREE.Vector3(
        Math.cos(dec) * Math.cos(ra),
        Math.cos(dec) * Math.sin(ra),
        Math.sin(dec)
    );
    // Default up is Z axis
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), z);
    return q;
}

function getRotationQuaternion(pole_ra, pole_dec, pm, jd) {
    // pm: [deg, deg/day, deg/day^2]
    // Compute prime meridian angle at jd
    const d = jd - 2451545.0;
    const angle = (pm[0] + pm[1] * d + pm[2] * d * d) * Math.PI / 180;
    // Pole orientation
    const poleQ = getPoleQuaternion(pole_ra, pole_dec);
    // Rotate about Z by angle
    const rotQ = new THREE.Quaternion();
    rotQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle); // Negative for right-handed
    return poleQ.multiply(rotQ);
}

export class SolarSystemManager {
    constructor() {
        // Optionally, load or cache body data here
    }

    /**
     * Get the J2000 position of a body by NAIF ID at a given JS Date.
     * @param {number} naifId
     * @param {Date} date
     * @returns {{x: number, y: number, z: number}} Position in km, J2000
     */
    getBodyPosition(naifId, date) {
        const bodyName = NAIF_TO_ASTRONOMY_ENGINE[naifId];
        if (bodyName) {
            try {
                // Use correct astronomy-engine function names
                const bodyPosition = Body(bodyName, date);
                return {
                    position: new THREE.Vector3(
                        bodyPosition.x * AU_TO_KM,
                        bodyPosition.y * AU_TO_KM,
                        bodyPosition.z * AU_TO_KM
                    ),
                    quaternion: new THREE.Quaternion(0, 0, 0, 1) // Default quaternion
                };
            } catch (error) {
                console.warn(`Failed to get position for ${bodyName}:`, error);
                // Fallback to default position
                return {
                    position: new THREE.Vector3(0, 0, 0),
                    quaternion: new THREE.Quaternion(0, 0, 0, 1)
                };
            }
        }
        // Fallback: use canonical_orbit from SOLAR_SYSTEM_BODIES
        const body = SOLAR_SYSTEM_BODIES.find(b => b.id === naifId);
        if (body && body.canonical_orbit) {
            // Assume epochJd is J2000 (2451545.0)
            const epochJd = 2451545.0;
            const targetJd = MakeTime(date).jd;
            return keplerianToCartesian(body.canonical_orbit, epochJd, targetJd);
        }
        throw new Error(`Unknown body NAIF ID: ${naifId}`);
    }

    /**
     * Get the full state of a body: position, velocity, quaternion (J2000, km, km/s, Three.js Y-up)
     * @param {number} naifId
     * @param {Date} date
     * @returns {{ position: {x:number,y:number,z:number}, velocity: {x:number,y:number,z:number}, quaternion: THREE.Quaternion|null }}
     */
    getBodyState(naifId, date) {
        // Position
        const bodyName = NAIF_TO_ASTRONOMY_ENGINE[naifId];
        let pos, pos2, vel;
        const dt = 60; // seconds for finite difference
        const date2 = new Date(date.getTime() + dt * 1000);
        if (bodyName) {
            // Use barycentric vector
            const AU_KM = 149597870.7;
            const vec1 = BaryState(bodyName, date);
            const vec2 = BaryState(bodyName, date2);
            pos = { x: vec1.x * AU_KM, y: vec1.y * AU_KM, z: vec1.z * AU_KM };
            pos2 = { x: vec2.x * AU_KM, y: vec2.y * AU_KM, z: vec2.z * AU_KM };
        } else {
            const body = getBodyConfig(naifId);
            if (!body || !body.canonical_orbit) throw new Error(`No orbit for NAIF ${naifId}`);
            const epochJd = 2451545.0;
            const jd1 = MakeTime(date).jd;
            const jd2 = MakeTime(date2).jd;
            pos = keplerianToCartesian(body.canonical_orbit, epochJd, jd1);
            pos2 = keplerianToCartesian(body.canonical_orbit, epochJd, jd2);
        }
        // Velocity (km/s)
        vel = {
            x: (pos2.x - pos.x) / dt,
            y: (pos2.y - pos.y) / dt,
            z: (pos2.z - pos.z) / dt,
        };
        // Quaternion (orientation)
        let quaternion = null;
        const body = getBodyConfig(naifId);
        if (body && body.pole_ra && body.pole_dec && body.pm) {
            const jd = MakeTime(date).jd;
            quaternion = getRotationQuaternion(body.pole_ra, body.pole_dec, body.pm, jd);
            // Convert from Z-up (J2000) to Y-up (Three.js)
            const zUpToYUp = new THREE.Quaternion();
            zUpToYUp.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            quaternion = quaternion.clone().premultiply(zUpToYUp);
        }
        return { position: pos, velocity: vel, quaternion };
    }
} 