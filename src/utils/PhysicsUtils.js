import { Constants } from './Constants.js';
import * as THREE from 'three';

export class PhysicsUtils {
    static calculateGravitationalForce(m1, m2, r) {
        if (r === 0) {
            console.error('Distance r is zero, returning zero force to avoid division by zero.');
            return 0;
        }
        return Constants.G * (m1 * m2) / (r * r);
    }

    static calculateOrbitalVelocity(mass, radius) {
        return Math.sqrt(Constants.G * mass / radius);
    }

    static calculateEscapeVelocity(mass, radius) {
        return Math.sqrt(2 * Constants.G * mass / radius);
    }

    static calculateGravityAcceleration(mass, radius) {
        return Constants.G * mass / (radius * radius);
    }

    static calculateAcceleration(force, mass) {
        return force / mass;
    }

    static calculateOrbitalElements(position, velocity, mu) {
        const r = position.length();
        const vr = velocity.dot(position) / r;
        const hVec = position.clone().cross(velocity);
        const h = hVec.length();
        const i = Math.acos(hVec.z / h);
        const nVec = new THREE.Vector3(-hVec.y, hVec.x, 0);
        const n = nVec.length();
        const eVec = velocity.clone().cross(hVec).divideScalar(mu).sub(position.clone().divideScalar(r));
        const e = eVec.length();
        let omega = Math.acos(nVec.x / n);
        if (nVec.y < 0) omega = 2 * Math.PI - omega;
        let w = Math.acos(nVec.dot(eVec) / (n * e));
        if (eVec.z < 0) w = 2 * Math.PI - w;
        let theta = Math.acos(eVec.dot(position) / (e * r));
        if (vr < 0) theta = 2 * Math.PI - theta;

        return { h, e, i, omega, w, trueAnomaly: theta };
    }

    static computeOrbit({ h, e, i, omega, w }, mu, numPoints = 100) {
        const points = [];
        const step = 2 * Math.PI / numPoints;

        for (let f = 0; f < 2 * Math.PI; f += step) {
            const r = (h * h / mu) / (1 + e * Math.cos(f));
            
            // Position in the orbital plane
            const xOrbitalPlane = r * Math.cos(f);
            const yOrbitalPlane = r * Math.sin(f);
    
            // Rotate by argument of periapsis
            const cos_w = Math.cos(w);
            const sin_w = Math.sin(w);
            const xAfterPeriapsis = cos_w * xOrbitalPlane - sin_w * yOrbitalPlane;
            const yAfterPeriapsis = sin_w * xOrbitalPlane + cos_w * yOrbitalPlane;
    
            // Rotate by inclination
            const cos_i = Math.cos(i);
            const sin_i = Math.sin(i);
            const xAfterInclination = xAfterPeriapsis;
            const zAfterInclination = sin_i * yAfterPeriapsis;
            const yAfterInclination = cos_i * yAfterPeriapsis;
    
            // Rotate by longitude of ascending node
            const cos_omega = Math.cos(omega);
            const sin_omega = Math.sin(omega);
            const xECI = cos_omega * xAfterInclination - sin_omega * yAfterInclination;
            const yECI = sin_omega * xAfterInclination + cos_omega * yAfterInclination;
            const zECI = zAfterInclination;
    
            // Convert to kilometers for Three.js
            points.push(new THREE.Vector3(xECI * Constants.metersToKm * Constants.scale, yECI * Constants.metersToKm * Constants.scale, zECI * Constants.metersToKm * Constants.scale));
        }
    
        return points;
    }

    static calculateVelocity(velocity, latRad, lonRad, azimuthRad, angleOfAttackRad) {
        // Calculate the initial velocity vector based on the provided parameters
        const velocityVector = new THREE.Vector3(
            velocity * Math.cos(angleOfAttackRad) * Math.cos(azimuthRad),
            velocity * Math.cos(angleOfAttackRad) * Math.sin(azimuthRad),
            velocity * Math.sin(angleOfAttackRad)
        );

        // Rotate the velocity vector based on latitude and longitude
        const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler(latRad, lonRad, 0, 'XYZ')
        );
        velocityVector.applyMatrix4(rotationMatrix);

        return velocityVector;
    }

    static calculateVerticalAcceleration(planetRadius, planetMass, altitude) {
        return Constants.G * planetMass / Math.pow(planetRadius + altitude, 2);
    }

    static calculateDragForce(velocity, dragCoefficient, crossSectionalArea, atmosphericDensity) {
        return 0.5 * dragCoefficient * crossSectionalArea * atmosphericDensity * velocity * velocity;
    }

    static calculateAtmosphericDensity(altitude) {
        const rho0 = Constants.atmosphereSeaLevelDensity; // kg/m^3 at sea level
        const H = Constants.atmosphereScaleHeight; // Scale height in meters
        return rho0 * Math.exp(-altitude / H);
    }

    static calculateAzimuthFromInclination(latitude, inclination, raan) {
        // Convert degrees to radians
        const latRad = THREE.MathUtils.degToRad(latitude);
        const incRad = THREE.MathUtils.degToRad(inclination);
        const raanRad = THREE.MathUtils.degToRad(raan);

        // Calculate azimuth based on spherical trigonometry
        // This formula gives the azimuth angle needed to achieve the desired inclination
        // from the given latitude, considering the right ascension of ascending node (RAAN)
        let azimuth = Math.asin(
            Math.cos(incRad) / Math.cos(latRad)
        );

        // Adjust azimuth based on RAAN
        azimuth = azimuth + raanRad;

        // Convert back to degrees
        return THREE.MathUtils.radToDeg(azimuth);
    }

    static calculateEarthSurfaceVelocity(satellitePosition, earthRadius, earthRotationSpeed, earthInclination) {
        const earthSurfaceVelocity = new THREE.Vector3(
            -earthRotationSpeed * earthRadius * Math.sin(earthInclination * Math.PI / 180),
            0,
            earthRotationSpeed * earthRadius * Math.cos(earthInclination * Math.PI / 180)
        );
        earthSurfaceVelocity.add(satellitePosition);
        return earthSurfaceVelocity;
    }

    static eciToEcef(position, gmst) {
        const x = position.x * Math.cos(gmst) + position.y * Math.sin(gmst);
        const y = -position.x * Math.sin(gmst) + position.y * Math.cos(gmst);
        const z = position.z;
        return new THREE.Vector3(x, y, z);
    }
    
    static calculateGMST(date) {
        const jd = date / 86400000 + 2440587.5;
        const T = (jd - 2451545.0) / 36525.0;
        const GMST = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
        return THREE.MathUtils.degToRad(GMST % 360);
    }
    
    static calculateIntersectionWithEarth(position) {
        const earthRadius = Constants.earthRadius * Constants.metersToKm * Constants.scale;
        const origin = new THREE.Vector3(0, 0, 0);
        const direction = position.clone().normalize();
        
        // Ray from position to the center of the Earth
        const ray = new THREE.Ray(origin, direction);
        
        // Find intersection with the Earth's surface
        const intersection = ray.at(earthRadius, new THREE.Vector3());
        return intersection;
    }

    static calculatePositionAndVelocity(latitude, longitude, altitude, velocity, azimuth, angleOfAttack, tiltQuaternion, earthQuaternion) {
        const latRad = THREE.MathUtils.degToRad(latitude);
        const lonRad = THREE.MathUtils.degToRad(-longitude);
        const azimuthRad = THREE.MathUtils.degToRad(azimuth);
        const angleOfAttackRad = THREE.MathUtils.degToRad(angleOfAttack);
        const a = Constants.earthRadius;
        const b = Constants.earthPolarRadius;
        const e2 = 1 - (b * b) / (a * a);
        const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
        const X = (N + altitude) * Math.cos(latRad) * Math.cos(lonRad);
        const Z = (N + altitude) * Math.cos(latRad) * Math.sin(lonRad);
        const Y = ((1 - e2) * N + altitude) * Math.sin(latRad);
        let positionECI = new THREE.Vector3(X, Y, Z);
        const up = new THREE.Vector3(X, Y, Z).normalize();
        const north = new THREE.Vector3(
            -Math.sin(latRad) * Math.cos(lonRad),
            Math.cos(latRad),
            -Math.sin(latRad) * Math.sin(lonRad)
        ).normalize();
        const east = new THREE.Vector3().crossVectors(north, up).normalize();
        const horizontalVelocityENU = new THREE.Vector3(
            Math.cos(azimuthRad) * north.x + Math.sin(azimuthRad) * east.x,
            Math.cos(azimuthRad) * north.y + Math.sin(azimuthRad) * east.y,
            Math.cos(azimuthRad) * north.z + Math.sin(azimuthRad) * east.z
        ).normalize();
        const velocityENU = new THREE.Vector3(
            horizontalVelocityENU.x * Math.cos(angleOfAttackRad) + up.x * Math.sin(angleOfAttackRad),
            horizontalVelocityENU.y * Math.cos(angleOfAttackRad) + up.y * Math.sin(angleOfAttackRad),
            horizontalVelocityENU.z * Math.cos(angleOfAttackRad) + up.z * Math.sin(angleOfAttackRad)
        ).multiplyScalar(velocity);
        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        positionECI.applyQuaternion(correctionQuaternion);
        velocityENU.applyQuaternion(correctionQuaternion);
        // Apply Earth's rotation then axial tilt, matching earth group transform order
        positionECI.applyQuaternion(earthQuaternion);
        velocityENU.applyQuaternion(earthQuaternion);
        positionECI.applyQuaternion(tiltQuaternion);
        velocityENU.applyQuaternion(tiltQuaternion);
        const position = new THREE.Vector3(positionECI.x, positionECI.y, positionECI.z);
        const velocityECEF = new THREE.Vector3(velocityENU.x, velocityENU.y, velocityENU.z);
        return { positionECEF: position, velocityECEF: velocityECEF };
    }

    static calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis,
        eccentricity,
        inclination,
        argumentOfPeriapsis,
        raan,
        trueAnomaly
    ) {
        // Convert all angles from degrees to radians
        const a = semiMajorAxis;
        const e = eccentricity;
        const i = THREE.MathUtils.degToRad(inclination);
        const omega = THREE.MathUtils.degToRad(argumentOfPeriapsis);
        const Omega = THREE.MathUtils.degToRad(raan);
        const f = THREE.MathUtils.degToRad(trueAnomaly);

        // Standard gravitational parameter
        const mu = Constants.earthGravitationalParameter;

        // Distance from focus to satellite
        const p = a * (1 - e * e);
        const r = p / (1 + e * Math.cos(f));

        // Position in perifocal coordinates
        const x_p = r * Math.cos(f);
        const y_p = r * Math.sin(f);
        const z_p = 0;

        // Velocity in perifocal coordinates
        const h = Math.sqrt(mu * p);
        const vx_p = -mu / h * Math.sin(f);
        const vy_p = mu / h * (e + Math.cos(f));
        const vz_p = 0;

        // Build rotation matrix: perifocal -> ECI
        // R = Rz(-Omega) * Rx(-i) * Rz(-omega)
        const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
        const cosi = Math.cos(i), sini = Math.sin(i);
        const cosw = Math.cos(omega), sinw = Math.sin(omega);

        // Rotation matrix elements
        const R11 = cosO * cosw - sinO * sinw * cosi;
        const R12 = -cosO * sinw - sinO * cosw * cosi;
        const R13 = sinO * sini;
        const R21 = sinO * cosw + cosO * sinw * cosi;
        const R22 = -sinO * sinw + cosO * cosw * cosi;
        const R23 = -cosO * sini;
        const R31 = sinw * sini;
        const R32 = cosw * sini;
        const R33 = cosi;

        // Position in ECI
        const positionECI = new THREE.Vector3(
            R11 * x_p + R12 * y_p + R13 * z_p,
            R21 * x_p + R22 * y_p + R23 * z_p,
            R31 * x_p + R32 * y_p + R33 * z_p
        );

        // Velocity in ECI
        const velocityECI = new THREE.Vector3(
            R11 * vx_p + R12 * vy_p + R13 * vz_p,
            R21 * vx_p + R22 * vy_p + R23 * vz_p,
            R31 * vx_p + R32 * vy_p + R33 * vz_p
        );

        return { positionECI, velocityECI };
    }

    static orbitalVelocityAtAnomaly(orbitalElements, trueAnomaly, mu) {
        const { h, e } = orbitalElements;
        const r = (h * h / mu) / (1 + e * Math.cos(trueAnomaly));
        const velocityMagnitude = Math.sqrt(mu * ((2 / r) - (1 / (h * h / mu / (1 - e * e)))));
        const velocityAngle = trueAnomaly + Math.PI / 2; // Perpendicular to the radius vector in the orbital plane
        const xVelocity = velocityMagnitude * Math.cos(velocityAngle);
        const yVelocity = velocityMagnitude * Math.sin(velocityAngle);
        return new THREE.Vector3(xVelocity, yVelocity, 0);
    }

    static rotateToECI(velocity, inclination, omega, w) {
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.multiply(new THREE.Matrix4().makeRotationZ(-w));
        rotationMatrix.multiply(new THREE.Matrix4().makeRotationX(-inclination));
        rotationMatrix.multiply(new THREE.Matrix4().makeRotationZ(-omega));
        velocity.applyMatrix4(rotationMatrix);
        return velocity;
    }

    static calculateOrbitalPosition(orbitalElements, mu) {
        const { h, e, i, omega, w, trueAnomaly } = orbitalElements;
        const r = (h * h / mu) / (1 + e * Math.cos(trueAnomaly));
        const position = new THREE.Vector3(
            r * Math.cos(trueAnomaly),
            r * Math.sin(trueAnomaly),
            0
        );
        return this.rotateToECI(position, i, omega, w);
    }

    static calculateStateVectorsAtAnomaly(orbitalElements, trueAnomaly, mu) {
        const { h, e, i, omega, w } = orbitalElements;
        const r = (h * h / mu) / (1 + e * Math.cos(trueAnomaly));

        // Position in the orbital plane
        const x = r * Math.cos(trueAnomaly);
        const y = r * Math.sin(trueAnomaly);

        // Rotate by argument of periapsis
        const position = new THREE.Vector3(x, y, 0);
        position.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);

        // Rotate by inclination
        position.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);

        // Rotate by longitude of ascending node
        position.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);

        // Velocity in the orbital plane
        const vr = (mu / h) * e * Math.sin(trueAnomaly);
        const vt = (mu / h) * (1 + e * Math.cos(trueAnomaly));
        const vx = vr * Math.cos(trueAnomaly) - vt * Math.sin(trueAnomaly);
        const vy = vr * Math.sin(trueAnomaly) + vt * Math.cos(trueAnomaly);
        const velocity = new THREE.Vector3(vx, vy, 0);

        // Rotate velocity by argument of periapsis, inclination, and longitude of ascending node
        velocity.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);
        velocity.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);
        velocity.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);

        return { position, velocity };
    }

    static calculateDeltaVAtAnomaly(currentOrbitalElements, targetOrbitalElements, trueAnomaly, mu) {
        const currentState = this.calculateStateVectorsAtAnomaly(currentOrbitalElements, trueAnomaly, mu);
        const targetState = this.calculateStateVectorsAtAnomaly(targetOrbitalElements, trueAnomaly, mu);

        const deltaV = targetState.velocity.clone().sub(currentState.velocity);

        return deltaV.length(); // Return the magnitude of Delta-V
    }

    static convertLatLonToCartesian(lat, lon, radius = Constants.earthRadius * Constants.metersToKm * Constants.scale) {
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon);
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);
    }

    static ecefToGeodetic(x, y, z) {
        const a = Constants.earthRadius;
        const b = Constants.earthPolarRadius;
        const e2 = 1 - (b * b) / (a * a);
        const p = Math.sqrt(x * x + y * y);
        const theta = Math.atan2(z * a, p * b);
        const lon = Math.atan2(y, x);
        const lat = Math.atan2(
            z + e2 * b * Math.pow(Math.sin(theta), 3),
            p - e2 * a * Math.pow(Math.cos(theta), 3)
        );
        const N = a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
        const alt = p / Math.cos(lat) - N;

        return {
            latitude: THREE.MathUtils.radToDeg(lat),
            longitude: THREE.MathUtils.radToDeg(lon),
            altitude: alt
        };
    }

    // Maneuvering Methods //
    // ------------------- //

    static calculateHohmannOrbitRaiseDeltaV(r1, r2, mu = Constants.earthGravitationalParameter) {
        const v1 = Math.sqrt(mu / r1);
        const v_transfer1 = Math.sqrt(mu * (2 / r1 - 1 / ((r1 + r2) / 2)));
        const v_transfer2 = Math.sqrt(mu * (2 / r2 - 1 / ((r1 + r2) / 2)));
        const v2 = Math.sqrt(mu / r2);

        const deltaV1 = v_transfer1 - v1;
        const deltaV2 = v2 - v_transfer2;

        return { deltaV1, deltaV2, totalDeltaV: deltaV1 + deltaV2 };
    }

    static calculateHohmannInterceptDeltaV(r1, r2, mu = Constants.earthGravitationalParameter) {
        const a_transfer = (r1 + r2) / 2;
        const v1 = Math.sqrt(mu / r1);
        const v_transfer1 = Math.sqrt(mu * (2 / r1 - 1 / a_transfer));
        const v_transfer2 = Math.sqrt(mu * (2 / r2 - 1 / a_transfer));
        const v2 = Math.sqrt(mu / r2);

        const deltaV1 = v_transfer1 - v1;
        const deltaV2 = v2 - v_transfer2;

        return { deltaV1, deltaV2, totalDeltaV: deltaV1 + deltaV2 };
    }

    static calculateHohmannTransferNodes(r1, r2, orbitalElements, mu = Constants.earthGravitationalParameter) {
        const { deltaV1, deltaV2 } = this.calculateHohmannOrbitRaiseDeltaV(r1, r2, mu);

        const trueAnomaly1 = orbitalElements.trueAnomaly;
        const trueAnomaly2 = trueAnomaly1 + Math.PI;

        const burnDirection1 = new THREE.Vector3(1, 0, 0); // Assumes burn is in the prograde direction
        const burnDirection2 = new THREE.Vector3(1, 0, 0); // Assumes burn is in the prograde direction

        const burnNode1 = {
            trueAnomaly: trueAnomaly1,
            deltaV: deltaV1,
            direction: burnDirection1
        };

        const burnNode2 = {
            trueAnomaly: trueAnomaly2,
            deltaV: deltaV2,
            direction: burnDirection2
        };

        return { burnNode1, burnNode2 };
    }

    static meanAnomalyFromTrueAnomaly(trueAnomaly, eccentricity) {
        const E = 2 * Math.atan(Math.sqrt((1 - eccentricity) / (1 + eccentricity)) * Math.tan(trueAnomaly / 2));
        return E - eccentricity * Math.sin(E);
    }

    static getPositionAtTime(orbitalElements, time) {
        const mu = Constants.G * Constants.earthMass;
        const { semiMajorAxis: a, eccentricity: e, inclination: i, longitudeOfAscendingNode: omega, argumentOfPeriapsis: w } = orbitalElements;

        const n = Math.sqrt(mu / Math.pow(a, 3));
        const M = n * time;
        const E = this.solveKeplersEquation(M, e);
        const trueAnomaly = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
        const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));

        const x = r * Math.cos(trueAnomaly);
        const y = r * Math.sin(trueAnomaly);

        const position = new THREE.Vector3(x, y, 0);
        position.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);
        position.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);
        position.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);
        position.multiplyScalar(Constants.metersToKm * Constants.scale);

        return position;
    }

    static cartesianToGeodetic(x, y, z) {
        const r = Math.sqrt(x*x + y*y + z*z);
        const latitude = Math.asin(y / r);
        const longitude = Math.atan2(x, z);
        return {
            latitude: THREE.MathUtils.radToDeg(latitude),
            longitude: THREE.MathUtils.radToDeg(longitude)
        };
    }

    static solveKeplersEquation(M, e, tol = 1e-6) {
        let E = M;
        let deltaE;
        do {
            deltaE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
            E += deltaE;
        } while (Math.abs(deltaE) > tol);
        return E;
    }

    /**
     * Propagate a satellite's orbit for one period including multiple gravity sources using RK4.
     * @param {THREE.Vector3} initialPosition - Initial position in meters.
     * @param {THREE.Vector3} initialVelocity - Initial velocity in m/s.
     * @param {Array<{position:THREE.Vector3, mass:number}>} bodies - Array of gravity bodies.
     * @param {number} period - Orbital period in seconds.
     * @param {number} [numPoints=180] - Number of points to sample.
     * @returns {THREE.Vector3[]} Array of points (in scaled km) representing one orbit cycle.
     */
    static propagateOrbit(initialPosition, initialVelocity, bodies, period, numPoints = 180) {
        const dt = period / numPoints;
        let pos = initialPosition.clone();
        let vel = initialVelocity.clone();
        const points = [];
        // Helper: acceleration due to multiple bodies
        function accel(p) {
            const a = new THREE.Vector3();
            bodies.forEach(body => {
                const d = new THREE.Vector3().subVectors(body.position, p);
                const r2 = d.lengthSq();
                const r = Math.sqrt(r2);
                if (r > 0) {
                    const mag = Constants.G * body.mass / r2;
                    a.addScaledVector(d.normalize(), mag);
                }
            });
            return a;
        }
        for (let i = 0; i < numPoints; i++) {
            // RK4 integration step
            const p0 = pos.clone();
            const v0 = vel.clone();
            const a0 = accel(p0);
            const k1p = v0.clone().multiplyScalar(dt);
            const k1v = a0.clone().multiplyScalar(dt);

            const p1 = p0.clone().addScaledVector(k1p, 0.5);
            const v1 = v0.clone().addScaledVector(k1v, 0.5);
            const a1 = accel(p1);
            const k2p = v1.clone().multiplyScalar(dt);
            const k2v = a1.clone().multiplyScalar(dt);

            const p2 = p0.clone().addScaledVector(k2p, 0.5);
            const v2 = v0.clone().addScaledVector(k2v, 0.5);
            const a2 = accel(p2);
            const k3p = v2.clone().multiplyScalar(dt);
            const k3v = a2.clone().multiplyScalar(dt);

            const p3 = p0.clone().add(k3p);
            const v3 = v0.clone().add(k3v);
            const a3 = accel(p3);
            const k4p = v3.clone().multiplyScalar(dt);
            const k4v = a3.clone().multiplyScalar(dt);

            // Update state
            pos.add(
                k1p.clone().addScaledVector(k2p, 2).addScaledVector(k3p, 2).add(k4p).multiplyScalar(1 / 6)
            );
            vel.add(
                k1v.clone().addScaledVector(k2v, 2).addScaledVector(k3v, 2).add(k4v).multiplyScalar(1 / 6)
            );

            // Convert to scaled km and record
            points.push(
                pos.clone().multiplyScalar(Constants.metersToKm * Constants.scale)
            );
        }
        return points;
    }

    // Calculate periapsis and apoapsis radii from orbital elements
    static calculateApsidesFromElements(elements, mu) {
        if (!elements) return null;
        const { h, e } = elements;
        const rPeriapsis = (h * h / (mu * (1 + e)));
        const rApoapsis = e < 1 ? (h * h / (mu * (1 - e))) : null;
        return { rPeriapsis, rApoapsis };
    }

    // Calculate orbital elements, apsis radii, and altitudes from state vectors
    static calculateApsis(position, velocity, mu) {
        const elements = this.calculateOrbitalElements(position, velocity, mu);
        if (!elements) return null;
        const apsides = this.calculateApsidesFromElements(elements, mu);
        if (!apsides) return null;
        const { rPeriapsis, rApoapsis } = apsides;
        const periapsisAltitude = (rPeriapsis - Constants.earthRadius) * Constants.metersToKm;
        const apoapsisAltitude = rApoapsis !== null ? (rApoapsis - Constants.earthRadius) * Constants.metersToKm : null;
        return { orbitalElements: elements, rPeriapsis, rApoapsis, periapsisAltitude, apoapsisAltitude };
    }

    // Calculate orbital elements with detailed apsis data (centralized for debug/UI)
    static calculateDetailedOrbitalElements(position, velocity, mu) {
        // Based on Satellite.getOrbitalElements
        const r_mag = position.length();
        const v2 = velocity.lengthSq();
        const energy = (v2 / 2) - (mu / r_mag);
        const r = position.clone();
        const v = velocity.clone();
        // Specific angular momentum
        const hVec = new THREE.Vector3().crossVectors(r, v);
        const h_mag = hVec.length();
        // Semi-major axis in meters
        const sma = -mu / (2 * energy);
        // Eccentricity vector
        const ev = new THREE.Vector3()
            .crossVectors(v, hVec)
            .divideScalar(mu)
            .sub(r.clone().divideScalar(r_mag));
        const ecc = ev.length();
        // Inclination in degrees
        const inc = Math.acos(hVec.z / h_mag) * (180 / Math.PI);
        // Node vector
        const n = new THREE.Vector3(0, 0, 1).cross(hVec);
        const n_mag = n.length();
        // Longitude of ascending node in degrees
        let lan = Math.acos(n.x / n_mag) * (180 / Math.PI);
        if (n.y < 0) lan = 360 - lan;
        // Argument of periapsis in degrees
        let aop = Math.acos(n.dot(ev) / (n_mag * ecc)) * (180 / Math.PI);
        if (ev.z < 0) aop = 360 - aop;
        // True anomaly in degrees
        let ta = Math.acos(ev.dot(r) / (ecc * r_mag)) * (180 / Math.PI);
        if (r.dot(v) < 0) ta = 360 - ta;
        // Orbital period in seconds
        const period = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);
        // Periapsis and apoapsis distances in meters
        const rPeriapsis = sma * (1 - ecc);
        const rApoapsis = sma * (1 + ecc);
        return {
            semiMajorAxis: sma * Constants.metersToKm,
            eccentricity: ecc,
            inclination: inc,
            longitudeOfAscendingNode: lan,
            argumentOfPeriapsis: aop,
            trueAnomaly: ta,
            period: period,
            specificAngularMomentum: h_mag,
            specificOrbitalEnergy: energy,
            periapsisAltitude: (rPeriapsis - Constants.earthRadius) * Constants.metersToKm,
            apoapsisAltitude: (rApoapsis - Constants.earthRadius) * Constants.metersToKm,
            periapsisRadial: rPeriapsis * Constants.metersToKm,
            apoapsisRadial: rApoapsis * Constants.metersToKm
        };
    }
}