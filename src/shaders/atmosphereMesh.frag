// src/shaders/atmosphereMesh.frag

#define MAX_ATMOS 1 // Mesh shader handles one atmosphere

// Uniforms (Per-atmosphere basis)
uniform vec3 uPlanetPosition; // World position of planet center (km)
uniform float uPlanetRadius;    // Planet equatorial radius (km)
uniform float uPolarRadius;     // Planet polar radius (km)
uniform float uAtmosphereHeight; // Atmosphere height above surface (km)
uniform vec3 uSunPosition;    // World position of the sun (km)
uniform float uSunIntensity;
uniform vec3 uCameraPosition; // Camera position in world space

// Raymarching parameters
uniform int uNumLightSteps;   // Steps for light scattering
const int MIN_VIEW_STEPS = 2;
const int MAX_VIEW_STEPS = 16; // Can increase for mesh shader
const float VIEW_STEPS_SCALE_FACTOR = 0.1; // Adjust if needed

// Atmosphere properties
uniform float uDensityScaleHeight; // Scale height for density falloff
uniform vec3 uRayleighScatteringCoeff; // RGB scattering coefficients
uniform float uMieScatteringCoeff;    // Mie scattering coefficient (monochromatic)
uniform float uMieAnisotropy;         // Mie phase function anisotropy (g)

// Transformation
uniform mat3 uPlanetFrame;      // World-to-Local rotation matrix for planet tilt

// Varyings from vertex shader
varying vec3 vWorldPosition; // Fragment position in world space
varying vec3 vNormal;        // Fragment normal in world space
varying vec3 vViewDirection; // World space vector from fragment TO camera (CameraPos - WorldPos)

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
    vec2 atmIsect = intersectEllipsoid(rayOrigin, rayDir, aAtm, bAtm);
    if(atmIsect.y < 0.0)
        return vec3(0.0);
    float rayStart = max(0.0, atmIsect.x);
    float rayEnd = atmIsect.y;
    vec2 plIsect = intersectEllipsoid(rayOrigin, rayDir, aPl, bPl);
    if(plIsect.x > 0.0 && plIsect.x < rayEnd)
        return vec3(1000.0); // Hit planet
    float stepSize = (rayEnd - rayStart) / float(numStepsLight);
    vec3 opticalDepth = vec3(0.0);
    for(int j = 0; j < MAX_VIEW_STEPS; ++j) { // Use MAX_VIEW_STEPS as limit
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

// --- Main Raymarching Logic (adapted for mesh) --- 

void main() {
    // Transform camera and sun positions to planet local space
    vec3 eyeLocal = uPlanetFrame * (uCameraPosition - uPlanetPosition);
    vec3 sunLocal = uPlanetFrame * (uSunPosition - uPlanetPosition);
    vec3 fragLocal = uPlanetFrame * (vWorldPosition - uPlanetPosition);
    vec3 dirLocal = normalize(fragLocal - eyeLocal);

    float planetRadius = uPlanetRadius;
    float atmosphereRadius = uPlanetRadius + uAtmosphereHeight;

    // Ray-sphere intersection with atmosphere shell (centered at origin in local space)
    vec3 oc = eyeLocal;
    float b = dot(oc, dirLocal);
    float c = dot(oc, oc) - atmosphereRadius * atmosphereRadius;
    float h = b * b - c;
    if (h < 0.0) discard; // Ray misses atmosphere

    float t0 = -b - sqrt(h);
    float t1 = -b + sqrt(h);
    float tStart = max(t0, 0.0);
    float tEnd = t1;

    // Ray-sphere intersection with planet
    float cPlanet = dot(oc, oc) - planetRadius * planetRadius;
    float hPlanet = b * b - cPlanet;
    if (hPlanet > 0.0) {
        float tPlanet = -b - sqrt(hPlanet);
        if (tPlanet > tStart && tPlanet < tEnd) {
            tEnd = tPlanet; // Stop at planet surface
        }
    }

    float stepSize = (tEnd - tStart) / float(uNumLightSteps);
    vec3 sum = vec3(0.0);
    float opticalDepth = 0.0;
    float scaleHeight = uDensityScaleHeight;

    for (int i = 0; i < uNumLightSteps; ++i) {
        float t = tStart + (float(i) + 0.5) * stepSize;
        vec3 samplePos = eyeLocal + dirLocal * t;
        float height = length(samplePos) - planetRadius;
        float density = getDensity(height, scaleHeight);

        // Rayleigh phase
        float sunDot = dot(normalize(sunLocal - samplePos), dirLocal);
        float rayleighPhase = 3.0 / (16.0 * PI) * (1.0 + sunDot * sunDot);
        vec3 rayleighScatter = uRayleighScatteringCoeff * rayleighPhase * density * uSunIntensity;

        // Mie phase
        float miePhase = phaseMie(sunDot, uMieAnisotropy);
        vec3 mieScatter = vec3(uMieScatteringCoeff * miePhase * density * uSunIntensity);

        // Combine scattering
        vec3 scatter = rayleighScatter + mieScatter;

        // Night side fading: soft fade, always keep some haze on day side
        float sunIllum = dot(normalize(sunLocal - samplePos), normalize(samplePos));
        float hazeFade = smoothstep(-0.2, 0.2, sunIllum); // Soft transition
        scatter *= mix(0.2, 1.0, hazeFade); // Always at least 0.2 haze on day side

        // Accumulate with Beer-Lambert extinction
        float extinction = exp(-opticalDepth);
        sum += scatter * extinction * stepSize;
        opticalDepth += density * stepSize * 0.05; // 0.05: extinction fudge factor
    }

    float intensity = length(sum);
    gl_FragColor = vec4(sum, intensity); // Physically-based color and alpha
} 