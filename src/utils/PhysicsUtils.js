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
        if (!position || !velocity) return null;

        try {
            const r = position.length(); // Position magnitude
            const v = velocity.length(); // Velocity magnitude

            // Angular momentum vector h = r × v
            const h_vector = new THREE.Vector3().crossVectors(position, velocity);
            const h = h_vector.length(); // Angular momentum magnitude

            // Radial velocity
            const vr = velocity.clone().dot(position) / r;

            // Eccentricity vector calculation 
            // Calculate the first term: (v^2 - μ/r)r
            const term1 = position.clone().multiplyScalar((v * v - mu / r) / mu);

            // Calculate the second term: (r·v)v / μ
            const term2 = velocity.clone().multiplyScalar(position.clone().dot(velocity) / mu);

            // Subtract to get e = ((v^2 - μ/r)r - (r·v)v) / μ
            const e_vector = term1.sub(term2);
            const eccentricity = e_vector.length();

            // Specific orbital energy
            const specificEnergy = (v * v / 2) - (mu / r);

            // Semi-major axis (a = -μ/(2ε))
            let semiMajorAxis;
            if (Math.abs(specificEnergy) < 1e-10) {
                // Parabolic orbit
                semiMajorAxis = Infinity;
            } else {
                semiMajorAxis = -mu / (2 * specificEnergy);
            }

            // For inclination, we need the angular momentum vector z-component
            const inclination = Math.acos(h_vector.z / h); // Inclination in radians

            // Node vector (perpendicular to angular momentum and z-axis)
            const nodeVector = new THREE.Vector3(0, 0, 1).cross(h_vector);
            const nodeLength = nodeVector.length();

            // Calculate longitude of ascending node
            let longitudeOfAscendingNode = 0;
            if (nodeLength > 1e-10) {
                // n is not zero, so orbit is inclined
                nodeVector.normalize();
                longitudeOfAscendingNode = Math.acos(nodeVector.x);
                if (nodeVector.y < 0) {
                    longitudeOfAscendingNode = 2 * Math.PI - longitudeOfAscendingNode;
                }
            }

            // Calculate argument of periapsis
            let argumentOfPeriapsis = 0;
            if (nodeLength > 1e-10 && eccentricity > 1e-10) {
                // Neither circular nor equatorial orbit
                const dotProduct = nodeVector.dot(e_vector) / eccentricity;
                argumentOfPeriapsis = Math.acos(Math.min(1, Math.max(-1, dotProduct))); // Clamp to avoid floating point errors
                if (e_vector.z < 0) {
                    argumentOfPeriapsis = 2 * Math.PI - argumentOfPeriapsis;
                }
            }

            // Calculate true anomaly
            let trueAnomaly = 0;
            if (eccentricity > 1e-10) {
                // Non-circular orbit
                const dotProduct = e_vector.dot(position) / (eccentricity * r);
                trueAnomaly = Math.acos(Math.min(1, Math.max(-1, dotProduct))); // Clamp to avoid floating point errors
                if (vr < 0) {
                    trueAnomaly = 2 * Math.PI - trueAnomaly;
                }
            } else if (nodeLength > 1e-10) {
                // Circular inclined orbit
                const dotProduct = nodeVector.dot(position) / r;
                trueAnomaly = Math.acos(Math.min(1, Math.max(-1, dotProduct))); // Clamp to avoid floating point errors
                if (h_vector.dot(new THREE.Vector3().crossVectors(nodeVector, position)) < 0) {
                    trueAnomaly = 2 * Math.PI - trueAnomaly;
                }
            } else {
                // Circular equatorial orbit
                trueAnomaly = Math.acos(position.x / r);
                if (position.y < 0) {
                    trueAnomaly = 2 * Math.PI - trueAnomaly;
                }
            }

            // Calculate period (only valid for elliptical orbits)
            let period = null;
            if (semiMajorAxis > 0 && isFinite(semiMajorAxis)) {
                period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
            }

            // Calculate periapsis and apoapsis distances (only valid for elliptical orbits)
            let periapsisDistance = null;
            let apoapsisDistance = null;
            let periapsisAltitude = null;
            let apoapsisAltitude = null;

            if (eccentricity < 1 && eccentricity >= 0) {
                // Elliptical orbit (including circular when e=0)
                periapsisDistance = semiMajorAxis * (1 - eccentricity); // in meters
                apoapsisDistance = semiMajorAxis * (1 + eccentricity);  // in meters

                // Convert distances to km
                const periapsisDistanceKm = periapsisDistance * Constants.metersToKm;
                const apoapsisDistanceKm = apoapsisDistance * Constants.metersToKm;

                // Calculate altitudes
                const earthRadiusKm = Constants.earthRadius * Constants.metersToKm;
                periapsisAltitude = periapsisDistanceKm - earthRadiusKm;
                apoapsisAltitude = apoapsisDistanceKm - earthRadiusKm;
            }

            // Convert values to appropriate units for display
            const semiMajorAxisKm = isFinite(semiMajorAxis) ? semiMajorAxis * Constants.metersToKm : null;

            // Convert radians to degrees for display
            const inclinationDeg = (inclination * 180 / Math.PI).toFixed(2);
            const longitudeOfAscendingNodeDeg = (longitudeOfAscendingNode * 180 / Math.PI).toFixed(2);
            const argumentOfPeriopsisDeg = (argumentOfPeriapsis * 180 / Math.PI).toFixed(2);
            const trueAnomalyDeg = (trueAnomaly * 180 / Math.PI).toFixed(2);

            const result = {
                // Display values (some converted to degrees or km)
                semiMajorAxis: semiMajorAxisKm,
                eccentricity: eccentricity,
                inclination: inclinationDeg,
                longitudeOfAscendingNode: longitudeOfAscendingNodeDeg,
                argumentOfPeriapsis: argumentOfPeriopsisDeg,
                trueAnomaly: trueAnomalyDeg,
                period: period,
                specificEnergy: specificEnergy,
                periapsisDistance: periapsisDistance ? periapsisDistance * Constants.metersToKm : null,
                periapsisAltitude: periapsisAltitude,
                apoapsisDistance: apoapsisDistance ? apoapsisDistance * Constants.metersToKm : null,
                apoapsisAltitude: apoapsisAltitude,

                // Raw values needed for orbit computation (in radians)
                h: h,
                e: eccentricity,
                i: inclination,
                omega: longitudeOfAscendingNode,
                w: argumentOfPeriapsis
            };

            return result;
        } catch (error) {
            console.error('Error calculating orbital elements:', error);
            return null;
        }
    }

    static computeOrbit(orbitalElements, mu, numPoints = 100) {
        if (!orbitalElements) return [];

        // Extract the raw orbital element values (not the degree values)
        const { h, e, i, omega, w } = orbitalElements;

        // Check if we have all the required values for orbit computation
        if (h === undefined || e === undefined || i === undefined ||
            omega === undefined || w === undefined) {

            console.error('Invalid orbital elements for orbit computation', orbitalElements);
            return [];
        }

        // Make sure we're working with numbers, not strings
        const hVal = Number(h);
        const eVal = Number(e);
        const iVal = Number(i);
        const omegaVal = Number(omega);
        const wVal = Number(w);

        const points = [];
        const step = 2 * Math.PI / numPoints;

        for (let f = 0; f < 2 * Math.PI; f += step) {
            // Skip points for near-parabolic orbits where the formula might break down
            if (Math.abs(eVal - 1.0) < 1e-5 && Math.cos(f) < -0.99) continue;

            const r = (hVal * hVal / mu) / (1 + eVal * Math.cos(f));

            // Position in the orbital plane
            const xOrbitalPlane = r * Math.cos(f);
            const yOrbitalPlane = r * Math.sin(f);

            // Rotate by argument of periapsis
            const cos_w = Math.cos(wVal);
            const sin_w = Math.sin(wVal);
            const xAfterPeriapsis = cos_w * xOrbitalPlane - sin_w * yOrbitalPlane;
            const yAfterPeriapsis = sin_w * xOrbitalPlane + cos_w * yOrbitalPlane;

            // Rotate by inclination
            const cos_i = Math.cos(iVal);
            const sin_i = Math.sin(iVal);
            const xAfterInclination = xAfterPeriapsis;
            const zAfterInclination = sin_i * yAfterPeriapsis;
            const yAfterInclination = cos_i * yAfterPeriapsis;

            // Rotate by longitude of ascending node
            const cos_omega = Math.cos(omegaVal);
            const sin_omega = Math.sin(omegaVal);
            const xECI = cos_omega * xAfterInclination - sin_omega * yAfterInclination;
            const yECI = sin_omega * xAfterInclination + cos_omega * yAfterInclination;
            const zECI = zAfterInclination;

            // Convert to kilometers for Three.js
            points.push(new THREE.Vector3(
                xECI * Constants.metersToKm * Constants.scale,
                yECI * Constants.metersToKm * Constants.scale,
                zECI * Constants.metersToKm * Constants.scale
            ));
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
        positionECI.applyQuaternion(tiltQuaternion);
        velocityENU.applyQuaternion(tiltQuaternion);
        positionECI.applyQuaternion(earthQuaternion);
        velocityENU.applyQuaternion(earthQuaternion);
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
        // Constants
        const mu = Constants.earthGravitationalParameter;

        // Convert angles from degrees to radians if necessary
        const iRad = THREE.MathUtils.degToRad(inclination);
        const raanRad = THREE.MathUtils.degToRad(raan);
        const argPeriapsisRad = THREE.MathUtils.degToRad(argumentOfPeriapsis);
        const trueAnomalyRad = THREE.MathUtils.degToRad(trueAnomaly);

        // Earth's obliquity in radians (approximately 23.44 degrees)
        const earthObliquity = THREE.MathUtils.degToRad(23.44);

        // Perifocal coordinates
        const p = semiMajorAxis * (1 - eccentricity * eccentricity);
        if (p <= 0) {
            console.error('Invalid value for p:', p);
            return {
                positionECI: new THREE.Vector3(),
                velocityECI: new THREE.Vector3(),
            };
        }

        const r = p / (1 + eccentricity * Math.cos(trueAnomalyRad));
        const xP = r * Math.cos(trueAnomalyRad);
        const yP = r * Math.sin(trueAnomalyRad);
        const zP = 0;

        const positionPerifocal = new THREE.Vector3(xP, yP, zP);

        // Velocity in perifocal coordinates
        const h = Math.sqrt(
            mu * semiMajorAxis * (1 - eccentricity * eccentricity)
        );
        if (isNaN(h) || h <= 0) {
            console.error('Invalid value for h:', h);
            return {
                positionECI: new THREE.Vector3(),
                velocityECI: new THREE.Vector3(),
            };
        }

        const sqrtMuOverP = Math.sqrt(mu / p);
        if (isNaN(sqrtMuOverP) || sqrtMuOverP <= 0) {
            console.error('Invalid value for sqrtMuOverP:', sqrtMuOverP);
            return {
                positionECI: new THREE.Vector3(),
                velocityECI: new THREE.Vector3(),
            };
        }

        const vxP = -sqrtMuOverP * Math.sin(trueAnomalyRad);
        const vyP = sqrtMuOverP * (eccentricity + Math.cos(trueAnomalyRad));
        const vzP = 0;

        const velocityPerifocal = new THREE.Vector3(vxP, vyP, vzP);

        // Rotation matrices
        const R1 = new THREE.Matrix4().makeRotationZ(-raanRad);
        const R2 = new THREE.Matrix4().makeRotationX(-iRad);
        const R3 = new THREE.Matrix4().makeRotationZ(-argPeriapsisRad);

        // Earth's obliquity rotation matrix
        const R_obliquity = new THREE.Matrix4().makeRotationX(earthObliquity);

        // Flip Y and Z coordinates to handle the Three.js coordinate system
        const flipYzMatrix = new THREE.Matrix4().set(
            1, 0, 0, 0,
            0, 0, 1, 0,
            0, -1, 0, 0,
            0, 0, 0, 1
        );

        // Total rotation matrix including Earth's obliquity
        const rotationMatrix = new THREE.Matrix4()
            .multiplyMatrices(flipYzMatrix, R_obliquity)
            .multiply(R3)
            .multiply(R2)
            .multiply(R1);

        // Convert to ECI coordinates with Earth's tilt
        const positionECI = positionPerifocal.applyMatrix4(rotationMatrix);
        const velocityECI = velocityPerifocal.applyMatrix4(rotationMatrix);

        if (
            isNaN(positionECI.x) ||
            isNaN(positionECI.y) ||
            isNaN(positionECI.z) ||
            isNaN(velocityECI.x) ||
            isNaN(velocityECI.y) ||
            isNaN(velocityECI.z)
        ) {
            console.error('Invalid ECI coordinates:', positionECI, velocityECI);
            return {
                positionECI: new THREE.Vector3(),
                velocityECI: new THREE.Vector3(),
            };
        }

        // Return the position and velocity in ECI frame
        return {
            positionECI: new THREE.Vector3(
                positionECI.x,
                positionECI.y,
                positionECI.z
            ),
            velocityECI: new THREE.Vector3(
                velocityECI.x,
                velocityECI.y,
                velocityECI.z
            ),
        };
    }

    static orbitalVelocityAtAnomaly(orbitalElements, trueAnomaly, mu) {
        if (!orbitalElements) {
            console.error('Invalid orbital elements');
            return new THREE.Vector3();
        }

        // Extract orbital elements, ensuring compatibility with both formats
        const h = orbitalElements.h;
        const e = orbitalElements.e || orbitalElements.eccentricity;

        // Convert trueAnomaly to radians if it's a string
        if (typeof trueAnomaly === 'string') {
            trueAnomaly = THREE.MathUtils.degToRad(parseFloat(trueAnomaly));
        }

        const r = (h * h / mu) / (1 + e * Math.cos(trueAnomaly));
        const velocityMagnitude = Math.sqrt(mu * ((2 / r) - (1 / (h * h / mu / (1 - e * e)))));
        const velocityAngle = trueAnomaly + Math.PI / 2; // Perpendicular to the radius vector in the orbital plane
        const xVelocity = velocityMagnitude * Math.cos(velocityAngle);
        const yVelocity = velocityMagnitude * Math.sin(velocityAngle);
        return new THREE.Vector3(xVelocity, yVelocity, 0);
    }

    static rotateToECI(velocity, inclination, omega, w) {
        // Convert to radians if the values are strings or degrees
        if (typeof inclination === 'string') {
            inclination = THREE.MathUtils.degToRad(parseFloat(inclination));
        }
        if (typeof omega === 'string') {
            omega = THREE.MathUtils.degToRad(parseFloat(omega));
        }
        if (typeof w === 'string') {
            w = THREE.MathUtils.degToRad(parseFloat(w));
        }

        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.multiply(new THREE.Matrix4().makeRotationZ(-w));
        rotationMatrix.multiply(new THREE.Matrix4().makeRotationX(-inclination));
        rotationMatrix.multiply(new THREE.Matrix4().makeRotationZ(-omega));
        velocity.applyMatrix4(rotationMatrix);
        return velocity;
    }

    static calculateOrbitalPosition(orbitalElements, mu, time) {
        if (!orbitalElements) {
            console.error('Invalid orbital elements');
            return new THREE.Vector3();
        }

        // Extract orbital elements, handling both raw values and degree values
        const h = orbitalElements.h;
        const e = orbitalElements.e || orbitalElements.eccentricity;

        // Handle both raw radians and degree string values
        let i, omega, w, trueAnomaly;

        // For i (inclination)
        if (typeof orbitalElements.i === 'number') {
            i = orbitalElements.i; // Already in radians
        } else if (orbitalElements.inclination !== undefined) {
            // Convert from degrees to radians if it's a string or a number in degrees
            i = THREE.MathUtils.degToRad(parseFloat(orbitalElements.inclination));
        } else {
            console.error('No valid inclination found in orbital elements');
            return new THREE.Vector3();
        }

        // For omega (longitude of ascending node)
        if (typeof orbitalElements.omega === 'number') {
            omega = orbitalElements.omega; // Already in radians
        } else if (orbitalElements.longitudeOfAscendingNode !== undefined) {
            // Convert from degrees to radians if it's a string or a number in degrees
            omega = THREE.MathUtils.degToRad(parseFloat(orbitalElements.longitudeOfAscendingNode));
        } else {
            console.error('No valid longitude of ascending node found in orbital elements');
            return new THREE.Vector3();
        }

        // For w (argument of periapsis)
        if (typeof orbitalElements.w === 'number') {
            w = orbitalElements.w; // Already in radians
        } else if (orbitalElements.argumentOfPeriapsis !== undefined) {
            // Convert from degrees to radians if it's a string or a number in degrees
            w = THREE.MathUtils.degToRad(parseFloat(orbitalElements.argumentOfPeriapsis));
        } else {
            console.error('No valid argument of periapsis found in orbital elements');
            return new THREE.Vector3();
        }

        // For trueAnomaly
        if (typeof orbitalElements.trueAnomaly === 'string') {
            trueAnomaly = THREE.MathUtils.degToRad(parseFloat(orbitalElements.trueAnomaly));
        } else {
            trueAnomaly = orbitalElements.trueAnomaly;
        }

        const r = (h * h / mu) / (1 + e * Math.cos(trueAnomaly));
        const position = new THREE.Vector3(
            r * Math.cos(trueAnomaly),
            r * Math.sin(trueAnomaly),
            0
        );
        return this.rotateToECI(position, i, omega, w);
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

    static calculateStateVectorsAtAnomaly(orbitalElements, trueAnomaly, mu) {
        if (!orbitalElements) {
            console.error('Invalid orbital elements');
            return {
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3()
            };
        }

        // Extract orbital elements, handling both raw values and degree values
        const h = orbitalElements.h;
        const e = orbitalElements.e || orbitalElements.eccentricity;

        // Handle both raw radians and degree string values
        let i, omega, w;

        // For i (inclination)
        if (typeof orbitalElements.i === 'number') {
            i = orbitalElements.i; // Already in radians
        } else if (orbitalElements.inclination !== undefined) {
            // Convert from degrees to radians if it's a string or a number in degrees
            i = THREE.MathUtils.degToRad(parseFloat(orbitalElements.inclination));
        } else {
            console.error('No valid inclination found in orbital elements');
            return {
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3()
            };
        }

        // For omega (longitude of ascending node)
        if (typeof orbitalElements.omega === 'number') {
            omega = orbitalElements.omega; // Already in radians
        } else if (orbitalElements.longitudeOfAscendingNode !== undefined) {
            // Convert from degrees to radians if it's a string or a number in degrees
            omega = THREE.MathUtils.degToRad(parseFloat(orbitalElements.longitudeOfAscendingNode));
        } else {
            console.error('No valid longitude of ascending node found in orbital elements');
            return {
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3()
            };
        }

        // For w (argument of periapsis)
        if (typeof orbitalElements.w === 'number') {
            w = orbitalElements.w; // Already in radians
        } else if (orbitalElements.argumentOfPeriapsis !== undefined) {
            // Convert from degrees to radians if it's a string or a number in degrees
            w = THREE.MathUtils.degToRad(parseFloat(orbitalElements.argumentOfPeriapsis));
        } else {
            console.error('No valid argument of periapsis found in orbital elements');
            return {
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3()
            };
        }

        // Convert trueAnomaly to radians if it's a string
        if (typeof trueAnomaly === 'string') {
            trueAnomaly = THREE.MathUtils.degToRad(parseFloat(trueAnomaly));
        }

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
        const p = h * h / mu;
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
        const r = Math.sqrt(x * x + y * y + z * z);
        const latitude = Math.asin(y / r);
        const longitude = Math.atan2(x, z);
        return {
            latitude: THREE.MathUtils.radToDeg(latitude),
            longitude: THREE.MathUtils.radToDeg(longitude)
        };
    }

    // Conversion methods added from SatellitePhysics
    static positionToMeters(position) {
        if (!position) return null;
        return new THREE.Vector3(
            position.x,
            position.y,
            position.z
        );
    }

    static positionToKm(position) {
        if (!position) return null;
        return new THREE.Vector3(
            position.x * Constants.metersToKm,
            position.y * Constants.metersToKm,
            position.z * Constants.metersToKm
        );
    }

    static velocityToMetersPerSecond(velocity) {
        if (!velocity) return null;
        return new THREE.Vector3(
            velocity.x,
            velocity.y,
            velocity.z
        );
    }

    static velocityToKmPerSecond(velocity) {
        if (!velocity) return null;
        return new THREE.Vector3(
            velocity.x * Constants.metersToKm,
            velocity.y * Constants.metersToKm,
            velocity.z * Constants.metersToKm
        );
    }

    static getSpeed(velocity) {
        return velocity ? velocity.length() : 0;
    }

    static getRadialAltitude(position) {
        if (!position) return 0;
        const positionM = this.positionToMeters(position);
        // Calculate distance from Earth center in meters, then convert to km and subtract Earth radius in km
        return positionM.length() * Constants.metersToKm - Constants.earthRadius * Constants.metersToKm;
    }

    static getSurfaceAltitude(position) {
        if (!position) return 0;
        const positionLengthM = this.positionToMeters(position).length();
        const earthRadiusM = Constants.earthRadius;
        return (positionLengthM - earthRadiusM) * Constants.metersToKm;
    }

    static getAltitude(position) {
        if (!position) return 0;

        // Get position in km
        const positionKm = this.positionToKm(position);

        // Earth radius in km
        const earthRadiusKm = Constants.earthRadius * Constants.metersToKm;

        // Calculate distance in km
        return positionKm.length() - earthRadiusKm;
    }
}