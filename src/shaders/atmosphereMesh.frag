// src/shaders/atmosphereMesh.frag

// #define MAX_ATMOS 1 // Mesh shader handles one atmosphere

// Uniforms (Per-atmosphere basis)
uniform float uPlanetRadius;    // Planet equatorial radius (km)
uniform float uPolarRadius;     // Planet polar radius (km)
uniform float uAtmosphereHeight; // Atmosphere height above surface (km)
uniform vec3 uSunPosition;    // World position of the sun (km) - actually sun_world - planet_world from JS
uniform float uSunIntensity;
uniform vec3 uCameraPosition; // Camera position in world space - actually cam_world - planet_world from JS

// Raymarching parameters
uniform int uNumLightSteps;   // Steps for light and view sampling
uniform float uSampleDistributionPower; // >1 biases more samples toward the limb

// Atmosphere properties
uniform float uDensityScaleHeight; // Scale height for density falloff
uniform float uRayleighScaleHeight; // Rayleigh scale height (km)
uniform float uMieScaleHeight;      // Mie scale height (km)
uniform vec3 uRayleighScatteringCoeff; // RGB scattering coefficients
uniform float uMieScatteringCoeff;    // Mie scattering coefficient (monochromatic)
uniform float uMieAnisotropy;         // Mie phase function anisotropy (g)
// Global haze intensity multiplier (1.0 = normal)
uniform float uHazeIntensity;

// New uniform for boosting scale heights
uniform float uScaleHeightMultiplier;

// Transformation
uniform mat3 uPlanetFrame;      // World-to-Local rotation matrix for planet tilt

// Varyings from vertex shader
// varying vec3 vWorldPositionFromPlanetCenter; // OLD
varying vec3 vFragPositionPlanetLocal; // NEW - fragment position in planet's local, body-fixed, scaled frame
// varying vec3 vNormal;        // OLD - Fragment normal in world space, unused

const float PI = 3.141592653589793;

// --- Reused Helper Functions from atmosphereRaymarch.frag --- 

// Simplified exponential density falloff
float getDensity(float height, float scaleHeight) {
    return exp(-height / scaleHeight);
}

// Rayleigh phase function
float phaseRayleigh(float cosTheta) {
    return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

// Mie phase function (Henyey-Greenstein)
float phaseMie(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 / (4.0 * PI)) * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Ray-ellipsoid intersection (centered at origin, aligned with axes)
vec2 intersectEllipsoid(vec3 rayOrigin, vec3 rayDir, float a, float b) {
    float ix2 = 1.0 / (a * a);
    float iz2 = ix2;
    float iy2 = 1.0 / (b * b);
    float dx = rayDir.x, dy = rayDir.y, dz = rayDir.z;
    float ox = rayOrigin.x, oy = rayOrigin.y, oz = rayOrigin.z;
    float A = dx * dx * ix2 + dy * dy * iy2 + dz * dz * iz2;
    float B = 2.0 * (ox * dx * ix2 + oy * dy * iy2 + oz * dz * iz2);
    float C = ox * ox * ix2 + oy * oy * iy2 + oz * oz * iz2 - 1.0;
    float disc = B * B - 4.0 * A * C;
    if(disc < 0.0)
        return vec2(-1.0);
    float sqrtDisc = sqrt(disc);
    float t0 = (-B - sqrtDisc) / (2.0 * A);
    float t1 = (-B + sqrtDisc) / (2.0 * A);
    return vec2(t0, t1);
}

// Ellipsoidal altitude (distance above surface)
float ellipsoidAltitude(vec3 pos, float a, float b) {
    vec3 dir = normalize(pos);
    float surfaceDist = 1.0 / sqrt((dir.x * dir.x + dir.z * dir.z) / (a * a) + (dir.y * dir.y) / (b * b));
    return length(pos) - surfaceDist;
}

// Calculate optical depth along a ray (ellipsoid version)
vec3 calculateOpticalDepthEllipsoid(
    vec3 rayOrigin, vec3 rayDir, int numStepsLight,
    float aAtm, float bAtm, float aPl, float bPl,
    float scaleHeight, vec3 rayleighCoeff, float mieCoeff
) {
    // Apply multiplier to the incoming scaleHeight (e.g., uDensityScaleHeight)
    float effectiveScaleHeight = scaleHeight * uScaleHeightMultiplier;

    vec2 atmIsect = intersectEllipsoid(rayOrigin, rayDir, aAtm, bAtm);
    if(atmIsect.y < 0.0) return vec3(0.0);
    float rayStart = max(0.0, atmIsect.x);
    float rayEnd   = atmIsect.y;
    float stepSize = (rayEnd - rayStart) / float(numStepsLight);
    vec3 opticalDepth = vec3(0.0);
    for(int j = 0; j < numStepsLight; ++j) {
        float t = rayStart + (float(j) + 0.5) * stepSize;
        vec3 samplePos = rayOrigin + rayDir * t;
        float height = ellipsoidAltitude(samplePos, aPl, bPl);
        if(height < 0.0) continue;
        float density = getDensity(height, effectiveScaleHeight); // Use boosted scale height
        // separate Rayleigh and Mie extinction
        vec3 rayExt = rayleighCoeff * density;
        vec3 mieExt = vec3(mieCoeff * density);
        opticalDepth += (rayExt + mieExt) * stepSize;
    }
    return opticalDepth;
}

// --- Main Raymarching Logic (adapted for mesh) --- 

void main() {
    // uCameraPosition from JS is (camera_world - planet_world_center)
    // uSunPosition from JS is (sun_world - planet_world_center)
    // uPlanetFrame transforms these world-oriented relative vectors to planet's local rotated frame.
    vec3 eyeLocal = uPlanetFrame * uCameraPosition;
    vec3 sunLocal = uPlanetFrame * uSunPosition;

    // vFragPositionPlanetLocal is the fragment's position in the planet's local, body-fixed, scaled frame.
    vec3 fragLocal = vFragPositionPlanetLocal;
    
    vec3 dirLocal = normalize(fragLocal - eyeLocal);

    // Offset ray origin slightly if inside or very close to the surface
    float camDist = length(eyeLocal);
    if (camDist < uPlanetRadius) {
        eyeLocal = eyeLocal * (uPlanetRadius / max(camDist, 1e-6));
    }

    // Define equatorial and polar radii for planet AND atmosphere shell
    float planetEquatorialRadius = uPlanetRadius;
    float planetPolarRadius = uPolarRadius; // Already a uniform

    float atmEquatorialRadius = uPlanetRadius + uAtmosphereHeight;
    // Calculate polar radius for atmosphere: polar planet radius + thickness
    float atmPolarRadius = uPolarRadius + uAtmosphereHeight;

    // Ray-ellipsoid intersection with ATMOSPHERE SHELL (in planet local space)
    vec2 atmIntersection = intersectEllipsoid(eyeLocal, dirLocal, atmEquatorialRadius, atmPolarRadius);

    // if (atmIntersection.y < 0.0) discard; // Ray misses atmosphere entirely - Keeping commented for now
    if (atmIntersection.y < 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // Output transparent black if ray misses
        return;
    }

    float tStart = max(0.0, atmIntersection.x); // Start at near intersection with atmosphere
    float tEnd = atmIntersection.y;            // End at far intersection with atmosphere

    // Ray-ellipsoid intersection with PLANET BODY
    vec2 planetIntersection = intersectEllipsoid(eyeLocal, dirLocal, planetEquatorialRadius, planetPolarRadius);

    if (planetIntersection.x > 0.0 && planetIntersection.x < tEnd) {
        // If ray hits planet before exiting atmosphere, shorten the ray
        tEnd = planetIntersection.x;
    }

    vec3 accumulatedColor = vec3(0.0);
    vec3 accumulatedTransmittance = vec3(1.0);
    // use separate scale heights, multiplied by the new uniform
    float rayleighScale = uRayleighScaleHeight * uScaleHeightMultiplier;
    float mieScale      = uMieScaleHeight * uScaleHeightMultiplier;

    // initial boundary in-scatter at tStart to avoid black rim
    {
        vec3 boundaryPos = eyeLocal + dirLocal * tStart;
        float height0 = ellipsoidAltitude(boundaryPos, planetEquatorialRadius, planetPolarRadius);
        if (height0 > 0.0) {
            // densities at boundary
            float densityR0 = getDensity(height0, rayleighScale);
            float densityM0 = getDensity(height0, mieScale);
            vec3 lightDir0 = normalize(sunLocal - boundaryPos);
            // skip boundary if shadowed by planet
            vec2 oc0 = intersectEllipsoid(boundaryPos, lightDir0, planetEquatorialRadius, planetPolarRadius);
            if (!(oc0.x > 0.0 && oc0.x < oc0.y)) {
                float cos0 = dot(dirLocal, lightDir0);
                float pr0 = phaseRayleigh(cos0);
                float pm0 = phaseMie(cos0, uMieAnisotropy);
                vec3 scat0 = uRayleighScatteringCoeff * densityR0 * pr0
                           + vec3(uMieScatteringCoeff * densityM0 * pm0);
                // optical depth to sun from boundary
                vec3 od0 = calculateOpticalDepthEllipsoid(
                    boundaryPos, lightDir0, uNumLightSteps,
                    atmEquatorialRadius, atmPolarRadius,
                    planetEquatorialRadius, planetPolarRadius,
                    uDensityScaleHeight, uRayleighScatteringCoeff, uMieScatteringCoeff // uDensityScaleHeight will be boosted inside the function
                );
                vec3 trans0 = exp(-od0);
                // accumulate initial sample
                accumulatedColor += scat0 * uSunIntensity * trans0 * accumulatedTransmittance * ((tEnd - tStart) / float(uNumLightSteps));
            }
        }
    }

    // view-ray integration using uNumLightSteps with non-linear distribution
    int viewSteps = uNumLightSteps;
    float viewStepSize = (tEnd - tStart) / float(viewSteps);
    for (int i = 0; i < viewSteps; ++i) {
        float fi = (float(i) + 0.5) / float(viewSteps);
        float t = tStart + pow(fi, uSampleDistributionPower) * (tEnd - tStart);
        vec3 samplePos = eyeLocal + dirLocal * t;
        float height = ellipsoidAltitude(samplePos, planetEquatorialRadius, planetPolarRadius);
        if (height < 0.0) continue;
        float densityR = getDensity(height, rayleighScale);
        float densityM = getDensity(height, mieScale);
        vec3 rayExt = uRayleighScatteringCoeff * densityR;
        vec3 mieExt = vec3(uMieScatteringCoeff * densityM);
        vec3 extinctionCoeff = rayExt + mieExt;
        vec3 stepTransmittance = exp(-extinctionCoeff * viewStepSize);
        vec3 lightDir = normalize(sunLocal - samplePos);
        // skip in-scatter if shadowed
        vec2 sunPlanetIsect = intersectEllipsoid(samplePos, lightDir, planetEquatorialRadius, planetPolarRadius);
        if (sunPlanetIsect.x > 0.0 && sunPlanetIsect.x < sunPlanetIsect.y) {
            accumulatedTransmittance *= stepTransmittance;
            continue;
        }
        vec3 opticalDepthToSun = calculateOpticalDepthEllipsoid(
            samplePos, lightDir, uNumLightSteps,
            atmEquatorialRadius, atmPolarRadius,
            planetEquatorialRadius, planetPolarRadius,
            uDensityScaleHeight, uRayleighScatteringCoeff, uMieScatteringCoeff // uDensityScaleHeight will be boosted inside the function
        );
        vec3 transToSun = exp(-opticalDepthToSun);
        float cosTheta = dot(dirLocal, lightDir);
        float pr = phaseRayleigh(cosTheta);
        float pm = phaseMie(cosTheta, uMieAnisotropy);
        vec3 rayScat = uRayleighScatteringCoeff * densityR * pr;
        vec3 mieScat = vec3(uMieScatteringCoeff * densityM * pm);
        vec3 totalScattering = rayScat + mieScat;
        vec3 inScattered = totalScattering * uSunIntensity * transToSun;
        accumulatedColor += inScattered * accumulatedTransmittance * viewStepSize;
        accumulatedTransmittance *= stepTransmittance;
        if (accumulatedTransmittance.x + accumulatedTransmittance.y + accumulatedTransmittance.z < 1e-2) {
            break;
        }
    }
    float meanTrans = (accumulatedTransmittance.x + accumulatedTransmittance.y + accumulatedTransmittance.z) / 3.0;
    // Apply haze intensity multiplier to scattered color
    accumulatedColor *= uHazeIntensity;
    gl_FragColor = vec4(accumulatedColor, 1.0 - meanTrans); // Corrected alpha for transmittance
} 