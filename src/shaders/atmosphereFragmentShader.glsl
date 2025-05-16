precision highp float;
#include <common>
#undef  PI
#define PI 3.14159265359
#include <logdepthbuf_pars_fragment>

// --- UNIFORMS needed for geometry test ---
uniform vec3 lightPosition;     // world space (Restored)
uniform float ambientIntensity; // (Restored)
uniform float lightIntensity;   // (Restored)
uniform float surfaceRadius;
uniform float atmoRadius;
uniform float polarScale;
uniform float atmoYScale;
uniform vec3 atmoColorNear;     // (Restored)
uniform vec3 atmoColorFar;      // (Restored)
uniform float densityScale;      // (Restored)
uniform float worldScale;        // (Restored)
uniform mat3 planetFrame;
uniform vec3 planetPosition;
// Removed lighting/scattering uniforms

// --- VARYINGS needed for geometry test ---
varying vec3 vLocalPos;
varying vec3 vRelativeEyeLocal;
varying vec3 vViewDirLocal;
// Removed other varyings

// --- CONSTANTS ---
const float MAX = 100000.0;
const int NUM_OUT_SCATTER = 4;
const int NUM_IN_SCATTER = 4;

const float phR = 0.142, phM = 0.047;
const vec3 kR = vec3(0.142, 0.33, 0.85);
const vec3 kM = vec3(0.17);
const float kMex = 1.1;
const float multi = 0.425;

// --- GEOMETRY HELPERS (Keep ray_vs_ellipsoid) ---
vec2 ray_vs_ellipsoid(vec3 p, vec3 dir, float rEqu, float scaleY) {
    float rPol = rEqu * scaleY;
    float ix2 = 1.0 / (rEqu * rEqu);
    float iy2 = 1.0 / (rPol * rPol);
    float iz2 = ix2;
    float a = dir.x * dir.x * ix2 + dir.y * dir.y * iy2 + dir.z * dir.z * iz2;
    float b = p.x * dir.x * ix2 + p.y * dir.y * iy2 + p.z * dir.z * iz2;
    float c = p.x * p.x * ix2 + p.y * p.y * iy2 + p.z * p.z * iz2 - 1.0;
    float disc = b * b - a * c;

    if(disc < 0.0)
        return vec2(MAX, -MAX);

    float sd = sqrt(disc);
    return vec2((-b - sd) / a, (-b + sd) / a);
}

// --- PHASE FUNCTIONS (Restored) ---
float phase_mie(float g, float c, float cc) {
    float gg = g * g;
    float num = (1.0 - gg) * (1.0 + cc);
    float den = (1.0 + gg - 2.0 * g * c);
    den = den * sqrt(den) * (2.0 + gg);
    return (3.0 / 8.0 / PI) * num / den;
}
float phase_ray(float cc) {
    return (3.0 / 16.0 / PI) * (1.0 + cc);
}

// --- VISUAL HELPERS (Restored) ---
float calculateHorizonGradient(vec3 pos, vec3 dir) {
    float w = (atmoRadius - surfaceRadius) * 1.5;
    vec2 s = ray_vs_ellipsoid(pos, dir, surfaceRadius, polarScale);
    return smoothstep(0.0, w, s.x);
}

// --- Density Profile (Restored) ---
float density(vec3 p, float ph) {
    // Restore worldScale usage for scale height
    float H = 85000.0 * worldScale; // Characteristic scale height
    float scale = (atmoRadius - surfaceRadius) / H;
    // Calculate altitude based on local position p relative to planet center
    float alt = length(vec3(p.x, p.y / polarScale, p.z)) - surfaceRadius;
    float h = alt / (H * scale);

    /* density */
    float d = exp(-clamp(h, -70.0, 70.0)); // Clamp exponent to avoid NaN/Inf

    /* variable density term (Restored) */
    float var = 1.0 - smoothstep(0.0, 0.15, h);

    /* horizon */
    float hor = max(0.0, h * (1.0 - h * 3.33));

    // Restore var term usage
    return d * var * (1.0 + hor * 0.5) * ph * densityScale;
}

// --- OPTICAL DEPTH (Restored) ---
float optic(vec3 p, vec3 q, float ph) {
    vec3 step = (q - p) / float(NUM_OUT_SCATTER);
    vec3 v = p + step * 0.5;
    float sum = 0.0;
    float len = length(step);

    /* sum */
    for(int i = 0; i < NUM_OUT_SCATTER; i++) {
        float h = length(vec3(v.x, v.y / polarScale, v.z)) - surfaceRadius;
        sum += density(v, ph) * exp(-h * 0.25);
        v += step;
    }
    return sum * len;
}

// --- IN-SCATTER INTEGRATOR (Restored with debug check) ---
vec4 in_scatter(vec3 o, vec3 dir, vec2 e, vec3 l, float L) {
    /* sum */
    vec3 sumR = vec3(0.0), sumM = vec3(0.0);
    float nR0 = 0.0, nM0 = 0.0;

    /* step */
    float seg = (e.y - e.x) / float(NUM_IN_SCATTER);
    vec3 step = dir * seg;
    vec3 p = o + dir * (e.x + seg * 0.5);

    /* density */
    for(int i = 0; i < NUM_IN_SCATTER; i++) {
        float h = length(vec3(p.x, p.y / polarScale, p.z)) - surfaceRadius;
        float dR = density(p, phR) * seg;
        float dM = density(p, phM) * seg;

        /* optical depth */
        nR0 += dR;
        nM0 += dM;

        // Declare optical depth variables before the conditional block
        float nR1, nM1;

        /* intersection */
        vec2 f = ray_vs_ellipsoid(p, l, atmoRadius, atmoYScale);

        // --- Original intersection & optical depth calculation --- 
        // NOTE: This might still be unstable at grazing angles if f.x > f.y due to precision
        vec3 q = p + l * f.y;
        nR1 = optic(p, q, phR);
        nM1 = optic(p, q, phM);

         /* extinction */
        vec3 extR = exp(-(nR0 + nR1) * kR);
        vec3 extM = exp(-(nM0 + nM1) * kM * kMex);
        vec3 ext = extR * extM;

        /* scattering */
        sumR += dR * ext * (1.0 + multi * (1.0 - ext));
        sumM += dM * ext * (1.0 + multi * (1.0 - ext));

        p += step;
    }

    /* scattering */
    float c = dot(dir, -l);
    float cc = c * c;
    vec3 scatter = sumR * kR * phase_ray(cc) + sumM * kM * phase_mie(-0.85, c, cc);
    float sunFade = smoothstep(-0.1, 0.1, dot(normalize(l), vec3(0.0, 0.0, 1.0)));
    scatter *= mix(0.756, 1.32, sunFade);

    /* horizon */
    // Need p from loop end - recalculate or pass last p?
    // For now, approximate using o + dir * e.y
    vec3 approxEndPoint = o + dir * e.y;
    float horGrad = calculateHorizonGradient(approxEndPoint, dir);
    vec3 horCol = mix(atmoColorNear, atmoColorFar, horGrad); // Restore horizon color gradient
    scatter *= mix(1.0, 1.0, horGrad) * horCol;

    /* opacity */
    float alt = length(vec3(approxEndPoint.x, approxEndPoint.y / polarScale, approxEndPoint.z)) - surfaceRadius;
    float vAng = abs(dot(normalize(vec3(approxEndPoint.x, approxEndPoint.y / polarScale, approxEndPoint.z)), dir));
    float baseO = (1.0 - smoothstep(0.0, 1.0, vAng)) * (1.0 - smoothstep(0.0, atmoRadius - surfaceRadius, alt));
    float op = mix(0.284, 0.945, baseO);
    op *= mix(1.3, 1.0, horGrad);

    return vec4(scatter * L, op);
}

/* ========== main ========== */
void main() {
    // Calculate local frame view direction
    vec3 eyeLocal = vRelativeEyeLocal;
    vec3 dirLocal = normalize(vViewDirLocal);

    // Restore: Calculate Light direction relative to planet center, in local frame
    vec3 relativeLightWorld = lightPosition - planetPosition; // Sun pos relative to planet, world frame
    vec3 lightLocal = planetFrame * normalize(relativeLightWorld); // Light direction in local frame

    // Test intersection with Atmosphere
    vec2 e = ray_vs_ellipsoid(eyeLocal, dirLocal, atmoRadius, atmoYScale);

    // Test intersection with Surface
    vec2 f = ray_vs_ellipsoid(eyeLocal, dirLocal, surfaceRadius, polarScale);

    if(e.x > e.y) {
        // Ray misses atmosphere entirely
        discard; // Discard fragment if it doesn't hit the atmosphere bounds
        return;
    }

    // Clip view ray to surface
    e.y = min(e.y, f.x);

    // Integrate scattering using actual lightIntensity
    vec4 I = in_scatter(eyeLocal, dirLocal, e, lightLocal, lightIntensity);

    // --- Final Color Compositing (Restored) ---
    float hGrad = calculateHorizonGradient(eyeLocal, dirLocal);
    float sunDot = dot(dirLocal, -normalize(lightLocal)); // Use normalized light direction for dot product

    /* exposure */
    float expT = mix(0.85, 1.7, smoothstep(0.0, 0.5, sunDot));
    expT *= mix(1.3, 1.0, hGrad);
    vec4 col = pow(I * expT, vec4(1.0 / 2.2));

    /* sky */
    // Restore Sky Color Calculation
    vec3 sky = mix(vec3(0.095, 0.189, 0.33), vec3(0.378, 0.567, 0.85), smoothstep(-0.2, 0.2, sunDot));
    sky = mix(sky * vec3(1.2, 1.1, 1.0), sky, hGrad);
    col.rgb += sky * ambientIntensity * 0.66; // Restore ambient intensity usage

    /* alpha */
    float alpha = mix(0.284, 0.898, col.a);
    alpha *= mix(1.0, 1.0, hGrad);
    col.a = clamp(alpha, 0.0, 1.0);

    /* ambient multiple scattering approx. */
    col.rgb += col.rgb * 0.3 * (1.0 - hGrad) * max(dot(dirLocal, -normalize(lightLocal)), 0.0); // Use normalized local light dir

    vec4 outColor = col;

    #include <logdepthbuf_fragment>
    gl_FragColor = outColor;
}
