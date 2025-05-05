// src/shaders/atmosphereRaymarch.frag
// Fragment shader for fullscreen multi-atmosphere raymarching pass

#define MAX_ATMOS 10

// Uniforms (to be supplied by CPU)
uniform int uNumAtmospheres;
uniform vec3 uPlanetPosition[MAX_ATMOS]; // World position of each planet center (km)
uniform float uPlanetRadius[MAX_ATMOS];    // Planet radius (km)
uniform float uAtmosphereHeight[MAX_ATMOS]; // Atmosphere height above surface (km)
uniform vec3 uSunPosition;    // World position of the sun (km)
uniform sampler2D tDiffuse; // Texture from the previous render pass (scene)
uniform vec2 uResolution; // Viewport resolution
uniform mat4 uInverseProjectionMatrix;
uniform mat4 uInverseViewMatrix;
uniform float uSunIntensity[MAX_ATMOS];
uniform vec3 uRelativeCameraPos[MAX_ATMOS]; // Camera position relative to each planet center (km)

// Screen-space center and radius (UV space) for each atmosphere
uniform vec2 uPlanetScreenPos[MAX_ATMOS];
uniform float uPlanetScreenRadius[MAX_ATMOS];

// Raymarching parameters
uniform int uNumLightSteps[MAX_ATMOS];   // Steps for light scattering (per planet)
const int MIN_VIEW_STEPS = 2;
const int MAX_VIEW_STEPS = 8; // Lowered for performance on large planets
const float VIEW_STEPS_SCALE_FACTOR = 0.05; 

// Atmosphere properties (per planet)
uniform float uDensityScaleHeight[MAX_ATMOS]; // Scale height for density falloff
uniform vec3 uRayleighScatteringCoeff[MAX_ATMOS]; // RGB scattering coefficients
uniform float uMieScatteringCoeff[MAX_ATMOS];    // Mie scattering coefficient (monochromatic)
uniform float uMieAnisotropy[MAX_ATMOS];         // Mie phase function anisotropy (g)

// Add new uniforms for oblate spheroid
uniform float uEquatorialRadius[MAX_ATMOS];
uniform float uPolarRadius[MAX_ATMOS];
uniform mat3 uPlanetFrame[MAX_ATMOS];

// Add uniform for camera distance
uniform float uCameraDistance[MAX_ATMOS];

// Elliptical culling uniforms
uniform vec2 uEllipseCenter[MAX_ATMOS];
uniform float uEllipseAxisA[MAX_ATMOS];
uniform float uEllipseAxisB[MAX_ATMOS];
uniform float uEllipseAngle[MAX_ATMOS];

// Varyings from vertex shader
varying vec2 vUv; // Screen UV coordinates

const float PI = 3.141592653589793;

// Helper: Simplified exponential density falloff
float getDensity(float height, float scaleHeight) {
    return exp(-height / scaleHeight);
}

// Helper: Rayleigh phase function
float phaseRayleigh(float cosTheta) {
    return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

// Helper: Mie phase function (Henyey-Greenstein)
float phaseMie(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 / (4.0 * PI)) * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Helper: Calculate view ray direction from UV and camera matrices
vec3 getViewRayDir(vec2 uv) {
    vec2 ndc = uv * 2.0 - 1.0;
    vec4 clipNear = vec4(ndc.x, ndc.y, -1.0, 1.0);
    vec4 viewNear = uInverseProjectionMatrix * clipNear;
    viewNear /= viewNear.w;
    vec3 worldDir = (uInverseViewMatrix * vec4(viewNear.xyz, 0.0)).xyz;
    return normalize(worldDir);
}

// Helper: Ray-ellipsoid intersection (centered at origin, aligned with axes)
// a = equatorial radius (X/Z), b = polar radius (Y axis)
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

// Helper: Ellipsoidal altitude (distance above surface)
// a = equatorial radius (X/Z), b = polar radius (Y axis)
float ellipsoidAltitude(vec3 pos, float a, float b) {
    // a = equatorial radius (X/Z), b = polar radius (Y axis)
    vec3 dir = normalize(pos);
    // Scale factor = 1 / sqrt((dir.x^2 + dir.z^2)/a^2 + dir.y^2/b^2)
    float surfaceDist = 1.0 / sqrt((dir.x * dir.x + dir.z * dir.z) / (a * a) + (dir.y * dir.y) / (b * b));
    return length(pos) - surfaceDist;
}

// Function: Calculate optical depth along a ray (ellipsoid version)
vec3 calculateOpticalDepthEllipsoid(
    vec3 rayOrigin,
    vec3 rayDir,
    int numStepsLight,
    float aAtm,
    float bAtm,
    float aPl,
    float bPl,
    float scaleHeight,
    vec3 rayleighCoeff,
    float mieCoeff
) {
    vec2 atmIsect = intersectEllipsoid(rayOrigin, rayDir, aAtm, bAtm);
    if(atmIsect.y < 0.0)
        return vec3(0.0);
    float rayStart = max(0.0, atmIsect.x);
    float rayEnd = atmIsect.y;
    vec2 plIsect = intersectEllipsoid(rayOrigin, rayDir, aPl, bPl);
    if(plIsect.x > 0.0 && plIsect.x < rayEnd)
        return vec3(1000.0);
    float stepSize = (rayEnd - rayStart) / float(numStepsLight);
    vec3 opticalDepth = vec3(0.0);
    for(int j = 0; j < MAX_VIEW_STEPS; ++j) {
        if(j >= numStepsLight)
            break;
        float t = rayStart + (float(j) + 0.5) * stepSize;
        vec3 samplePos = rayOrigin + rayDir * t;
        float height = ellipsoidAltitude(samplePos, aPl, bPl);
        if(height < 0.0)
            continue;
        float density = getDensity(height, scaleHeight);
        vec3 extinctionCoeff = (rayleighCoeff + mieCoeff) * density;
        opticalDepth += extinctionCoeff * stepSize;
    }
    return opticalDepth;
}

// Main raymarching function for a single oblate atmosphere
vec4 calculateAtmosphereColor(
    vec2 uv,
    vec3 planetPos,
    float aPl,
    float bPl,
    float aAtm,
    float bAtm,
    mat3 planetFrame,
    vec3 sunPos,
    float sunIntensity,
    vec3 relCameraPos,
    int numLightSteps,
    float scaleHeight,
    vec3 rayleighCoeff,
    float mieCoeff,
    float mieAnisotropy,
    float cameraDist
) {
    vec3 sceneColor = texture2D(tDiffuse, uv).rgb;
    // Transform ray origin and direction into planet's local frame
    vec3 rayOriginLocal = planetFrame * relCameraPos;
    vec3 rayDirLocal = planetFrame * getViewRayDir(uv);

    // --- Optimization 1: Early Ray Termination ---
    // Check intersection with atmosphere bounding ellipsoid
    vec2 atmIsect = intersectEllipsoid(rayOriginLocal, rayDirLocal, aAtm, bAtm);
    // If ray doesn't intersect atmosphere OR intersection is entirely behind camera (t_max <= 0),
    // and camera is outside the bounding sphere, return transparent black.
    float boundingRadius = max(aAtm, bAtm);
    float camDistLocal = length(rayOriginLocal);
    if(atmIsect.y <= atmIsect.x || (atmIsect.y <= 0.0 && camDistLocal > boundingRadius)) {
        return vec4(0.0);
    }

    // Check intersection with planet ellipsoid
    vec2 plIsect = intersectEllipsoid(rayOriginLocal, rayDirLocal, aPl, bPl);

    // Determine ray start and end points within the atmosphere
    float epsilon = 1e-3; // Small offset to avoid self-intersection if inside
    float rayStart = camDistLocal < boundingRadius ? epsilon : max(0.0, atmIsect.x);
    float rayEnd = atmIsect.y;
    // If ray hits the planet, clamp the end point
    if(plIsect.x > rayStart && plIsect.x < rayEnd)
        rayEnd = plIsect.x;

    // If the ray segment is effectively zero length, return transparent black
    float rayLength = max(0.0, rayEnd - rayStart);
    if(rayLength <= epsilon) {
        return vec4(0.0);
    }

    // --- Optimization 2: Adaptive Light Step Count ---
    const float MIN_LIGHT_STEPS = 4.0;
    const float CLOSE_DISTANCE_FACTOR_LIGHT = 5.0;  // Start reducing steps
    const float FAR_DISTANCE_FACTOR_LIGHT = 25.0; // Reach minimum steps sooner
    float closeDistLight = aPl * CLOSE_DISTANCE_FACTOR_LIGHT;
    float farDistLight = aPl * FAR_DISTANCE_FACTOR_LIGHT;
    float distFactorLight = smoothstep(closeDistLight, farDistLight, cameraDist);
    int actualLightSteps = int(mix(float(numLightSteps), MIN_LIGHT_STEPS, distFactorLight));
    actualLightSteps = max(int(MIN_LIGHT_STEPS), actualLightSteps);

    // Transform sun position to local frame
    vec3 relativeSunPos = sunPos - planetPos;
    vec3 sunLocal = planetFrame * relativeSunPos;

    vec3 accumulatedColor = vec3(0.0);
    vec3 accumulatedTransmittance = vec3(1.0);

    // --- Optimization 3: Adaptive View Step Count (based on distance AND ray length) ---
    const float CLOSE_DISTANCE_FACTOR_VIEW = 4.0; // Start reducing view steps slightly closer
    const float FAR_DISTANCE_FACTOR_VIEW = 20.0; // Reach minimum view steps even sooner
    float closeDistView = aPl * CLOSE_DISTANCE_FACTOR_VIEW;
    float farDistView = aPl * FAR_DISTANCE_FACTOR_VIEW;
    // Calculate base view steps based on ray length (as before)
    int baseStepsView = int(clamp(rayLength * VIEW_STEPS_SCALE_FACTOR, float(MIN_VIEW_STEPS), float(MAX_VIEW_STEPS)));
    // Calculate distance factor for view steps
    float distFactorView = smoothstep(closeDistView, farDistView, cameraDist);
    // Interpolate between base steps and minimum steps based on distance
    int actualStepsView = int(mix(float(baseStepsView), float(MIN_VIEW_STEPS), distFactorView));
    // Clamp to ensure it's within [MIN_VIEW_STEPS, MAX_VIEW_STEPS]
    actualStepsView = clamp(actualStepsView, MIN_VIEW_STEPS, MAX_VIEW_STEPS);
    // --- End Optimization 3 ---

    // Use the adaptive view steps calculation
    // int numStepsView = int(clamp(rayLength * VIEW_STEPS_SCALE_FACTOR, float(MIN_VIEW_STEPS), float(MAX_VIEW_STEPS))); // OLD
    int numStepsView = actualStepsView; // NEW
    float stepSize = rayLength / float(numStepsView);

    if(numStepsView == 0 || stepSize <= 1e-6) {
        // Simplified case for very short rays (or edge cases)
        float height = ellipsoidAltitude(rayOriginLocal, aPl, bPl);
        vec3 initialExtinction = (rayleighCoeff + mieCoeff) * getDensity(max(0.0, height), scaleHeight);
        accumulatedTransmittance = exp(-initialExtinction * rayLength);
    } else {
        for(int i = 0; i < MAX_VIEW_STEPS; ++i) { // Loop up to MAX_VIEW_STEPS
            if(i >= numStepsView) // But break early based on calculated numStepsView
                break;

            float t = rayStart + (float(i) + 0.5) * stepSize;
            vec3 samplePos = rayOriginLocal + rayDirLocal * t;
            float height = ellipsoidAltitude(samplePos, aPl, bPl);

            if(height < 0.0) {
                 // Skip step if sample is somehow inside the planet (should be rare with rayEnd clamp)
                continue;
            }

            float density = getDensity(height, scaleHeight);
            vec3 lightDir = normalize(sunLocal - samplePos);

            // Use the adaptive step count for optical depth towards the sun
            vec3 opticalDepthToSun = calculateOpticalDepthEllipsoid(samplePos, lightDir, actualLightSteps, // Use adaptive steps
            aAtm, bAtm, aPl, bPl, scaleHeight, rayleighCoeff, mieCoeff);
            vec3 transmittanceToSun = exp(-opticalDepthToSun);

            float cosTheta = dot(rayDirLocal, lightDir);
            float rayleighPhase = phaseRayleigh(cosTheta);
            float miePhase = phaseMie(cosTheta, mieAnisotropy);

            vec3 rayleighScattering = rayleighCoeff * rayleighPhase;
            vec3 mieScattering = vec3(mieCoeff * miePhase);
            vec3 totalScattering = (rayleighScattering + mieScattering) * density;
            vec3 extinctionCoeff = (rayleighCoeff + mieCoeff) * density;

            vec3 stepTransmittance = exp(-extinctionCoeff * stepSize);
            vec3 inScatteredLight = totalScattering * sunIntensity * transmittanceToSun;

            // Add contribution for this step
            // Integral: ∫ InScattered * Transmittance * dt
            // Approximation: Σ (InScattered * Transmittance * stepSize)
            accumulatedColor += inScatteredLight * accumulatedTransmittance * stepSize;

            // Update transmittance for the next step
            accumulatedTransmittance *= stepTransmittance;

            // Early exit if transmittance is very low (avoids unnecessary steps)
            if(accumulatedTransmittance.x + accumulatedTransmittance.y + accumulatedTransmittance.z < 3e-5) {
                break;
            }
        }
    }

    // Combine final color with scene color using accumulated transmittance
    // This part seems missing, let's add additive blending for now
    // vec3 finalColor = sceneColor * accumulatedTransmittance + accumulatedColor;
    vec3 finalColor = accumulatedColor; // Just return atmosphere color for now

    return vec4(finalColor, 1.0);
}

void main() {
    vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;
    vec3 accum = vec3(0.0); // Start with black, additively blend atmospheres

    for(int i = 0; i < MAX_ATMOS; ++i) {
        if(i >= uNumAtmospheres)
            break;

        // --- Elliptical culling (TEMPORARILY DISABLED FOR DEBUGGING) ---
        // Transform vUv into ellipse's local frame
        vec2 relUv = vUv - uEllipseCenter[i];
        float ca = cos(-uEllipseAngle[i]);
        float sa = sin(-uEllipseAngle[i]);
        // Rotate by -angle
        vec2 uvRot;
        uvRot.x = relUv.x * ca - relUv.y * sa;
        uvRot.y = relUv.x * sa + relUv.y * ca;
        // --- end elliptical culling ---

        // Swap a and b so a is equatorial (X/Z), b is polar (Y)
        float aPl = uEquatorialRadius[i]; // Equatorial (X/Z)
        float bPl = uPolarRadius[i];      // Polar (Y)
        float aAtm = aPl + uAtmosphereHeight[i];
        float bAtm = bPl + uAtmosphereHeight[i];
        mat3 frame = uPlanetFrame[i];

        // Pass a as equatorial, b as polar to all functions
        vec4 atmCol = calculateAtmosphereColor(vUv, uPlanetPosition[i], aPl, bPl, aAtm, bAtm, frame, uSunPosition, uSunIntensity[i], uRelativeCameraPos[i], uNumLightSteps[i], uDensityScaleHeight[i], uRayleighScatteringCoeff[i], uMieScatteringCoeff[i], uMieAnisotropy[i], uCameraDistance[i] // Pass distance here
        );
        accum = accum + atmCol.rgb; // Additive blending
    }

    // Add the original scene color back in
    gl_FragColor = vec4(sceneColor + accum, 1.0);
}