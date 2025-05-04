precision highp float;
#include <common>
#undef PI
#define PI 3.14159265359
#include <logdepthbuf_pars_fragment>

// Uniform variables for customization
uniform vec3 lightPosition;     // Position of the light source
uniform float ambientIntensity; // Intensity of ambient light
uniform float lightIntensity;   // Intensity of the main light source
uniform float surfaceRadius;    // Radius of the planet's surface
uniform float atmoRadius;       // Radius of the atmosphere
uniform float densityScale;    // Global scale for atmospheric density
uniform vec3 atmoColorNear;    // Color near surface
uniform vec3 atmoColorFar;     // Color at outer atmosphere
uniform float worldScale;

// Varying variables passed from vertex shader
varying float fov;              // Field of view
varying vec4 vWorldPosition;    // World space position
varying vec3 viewRay;           // View space ray direction

// Mathematical constants
const float MAX = 100000.0;

// Ray-sphere intersection function
// Returns the near and far intersection distances
vec2 ray_vs_sphere(vec3 p, vec3 dir, float r) {
    float b = dot(p, dir);
    float c = dot(p, p) - r * r;
    float d = b * b - c;
    if (d < 0.0) return vec2(MAX, -MAX);
    d = sqrt(d);
    return vec2(-b - d, -b + d);
}

// Mie scattering phase function
// g: anisotropy factor, c: cosine of scattering angle
float phase_mie(float g, float c, float cc) {
    float gg = g * g;
    float a = (1.0 - gg) * (1.0 + cc);
    float b = 1.0 + gg - 2.0 * g * c;
    b *= sqrt(b);
    b *= 2.0 + gg;
    return (3.0 / 8.0 / PI) * a / b;
}

// Rayleigh scattering phase function
// cc: squared cosine of scattering angle
float phase_ray(float cc) {
    return (3.0 / 16.0 / PI) * (1.0 + cc);
}

// Constants for scattering calculations (aggressive performance)
const int NUM_OUT_SCATTER = 4;  // minimal samples
const int NUM_IN_SCATTER = 4;   // minimal samples

// Calculate the horizon line gradient
float calculateHorizonGradient(vec3 position, vec3 rayDir) {
    // Calculate distance from ray to Earth's surface
    float a = dot(rayDir, rayDir);
    float b = 2.0 * dot(rayDir, position);
    float c = dot(position, position) - surfaceRadius * surfaceRadius;
    float discriminant = b * b - 4.0 * a * c;
    
    if (discriminant < 0.0) return 1.0;
    
    float horizonDist = (-b - sqrt(discriminant)) / (2.0 * a);
    float gradientWidth = (atmoRadius - surfaceRadius) * 1.5;
    return smoothstep(0.0, gradientWidth, horizonDist);
}

// Optimized atmospheric density function
float density(vec3 p, float ph) {
    float actualScaleHeight =85000.0 * worldScale;
    float scale = (atmoRadius - surfaceRadius) / actualScaleHeight;
    float altitude = length(p) - surfaceRadius;
    float h = altitude / (actualScaleHeight * scale);
    
    float density = exp(-h);
    float densityVariation = 1.0 - smoothstep(0.0, 0.15, h);
    
    // Simplified horizon enhancement
    float horizonFactor = h * (1.0 - h * 3.33);
    horizonFactor = max(0.0, horizonFactor);
    
    return density * densityVariation * (1.0 + horizonFactor * 0.5) * ph * densityScale;
}

// Optimized optical depth calculation
float optic(vec3 p, vec3 q, float ph) {
    vec3 step = (q - p) / float(NUM_OUT_SCATTER);
    vec3 v = p + step * 0.5;
    float sum = 0.0;
    float stepLength = length(step);
    
    for (int i = 0; i < NUM_OUT_SCATTER; i++) {
        float h = length(v) - surfaceRadius;
        sum += density(v, ph) * exp(-h * 0.25);
        v += step;
    }
    
    return sum * stepLength;
}

// Enhanced in-scattering calculation
vec4 in_scatter(vec3 o, vec3 dir, vec2 e, vec3 l, float l_intensity) {
    // Enhanced scattering coefficients
    const float ph_ray = 0.142;
    const float ph_mie = 0.047;
    const vec3 k_ray = vec3(0.142, 0.33, 0.85);
    const vec3 k_mie = vec3(0.17);
    const float k_mie_ex = 1.1;
    
    // Multi-scattering approximation coefficients
    const float multi_scatter = 0.425;
    const vec3 multi_k_ray = k_ray * 0.5;
    const vec3 multi_k_mie = k_mie * 0.5;
    
    vec3 sum_ray = vec3(0.0);
    vec3 sum_mie = vec3(0.0);
    float n_ray0 = 0.0;
    float n_mie0 = 0.0;
    
    float len = (e.y - e.x) / float(NUM_IN_SCATTER);
    vec3 step = dir * len;
    vec3 p = o + dir * (e.x + len * 0.5);
    
    // Ray marching loop
    for (int i = 0; i < NUM_IN_SCATTER; i++) {
        float h = length(p) - surfaceRadius;
        float d_ray = density(p, ph_ray) * len;
        float d_mie = density(p, ph_mie) * len;
        
        n_ray0 += d_ray;
        n_mie0 += d_mie;
        
        vec2 f = ray_vs_sphere(p, l, atmoRadius);
        vec3 q = p + l * f.y;
        
        float n_ray1 = optic(p, q, ph_ray);
        float n_mie1 = optic(p, q, ph_mie);
        
        vec3 ray_ext = exp(-(n_ray0 + n_ray1) * k_ray);
        vec3 mie_ext = exp(-(n_mie0 + n_mie1) * k_mie * k_mie_ex);
        vec3 extinction = ray_ext * mie_ext;
        
        vec3 ms_ray = d_ray * extinction * (1.0 + multi_scatter * (1.0 - extinction));
        vec3 ms_mie = d_mie * extinction * (1.0 + multi_scatter * (1.0 - extinction));
        
        sum_ray += ms_ray;
        sum_mie += ms_mie;
        
        p += step;
    }
    
    float c = dot(dir, -l);
    float cc = c * c;
    float ray_phase = phase_ray(cc);
    float mie_phase = phase_mie(-0.85, c, cc);
    
    // Calculate base scattering
    vec3 scatter = sum_ray * k_ray * ray_phase + sum_mie * k_mie * mie_phase;
    
    // Add sun position-dependent brightness
    float sun_fade = smoothstep(-0.1, 0.1, dot(normalize(l), vec3(0.0, 0.0, 1.0)));
    scatter *= mix(0.756, 1.32, sun_fade);
    
    // Calculate horizon gradient
    float horizonGrad = calculateHorizonGradient(p, dir);
    
    // gradient between near and far atmosphere colors
    vec3 horizonColor = mix(
        atmoColorNear,
        atmoColorFar,
        horizonGrad
    );
    scatter *= mix(1.2, 1.0, horizonGrad);
    scatter *= horizonColor;
    
    // Calculate opacity with horizon enhancement
    float altitude = length(p) - surfaceRadius;
    float viewAngle = abs(dot(normalize(p), dir));
    float baseOpacity = (1.0 - smoothstep(0.0, 1.0, viewAngle)) * (1.0 - smoothstep(0.0, atmoRadius - surfaceRadius, altitude));
    float horizonOpacity = mix(0.284, 0.945, baseOpacity);
    horizonOpacity *= mix(1.3, 1.0, horizonGrad);
    
    return vec4(scatter * l_intensity, horizonOpacity);
}

void main() {
    // Transform view ray to world space
    vec4 worldRay = inverse(viewMatrix) * vec4(viewRay, 0.0);
    vec3 dir = normalize(worldRay.xyz);
    vec3 eye = vWorldPosition.xyz;
    vec3 l = normalize(lightPosition - vWorldPosition.xyz);

    // Calculate atmosphere intersection
    vec2 e = ray_vs_sphere(eye, dir, atmoRadius);
    if (e.x > e.y) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    // Limit the ray to the first hit with the planet surface
    vec2 f = ray_vs_sphere(eye, dir, surfaceRadius);
    e.y = min(e.y, f.x);

    // Calculate in-scattering
    vec4 I = in_scatter(eye, dir, e, l, lightIntensity);
    
    // Calculate horizon gradient for final adjustments
    float finalHorizonGrad = calculateHorizonGradient(eye, dir);
    
    // Enhanced gamma correction with horizon-aware exposure
    float exposure = mix(0.85, 1.7, smoothstep(0.0, 0.5, dot(normalize(l), vec3(0.0, 0.0, 1.0))));
    exposure *= mix(1.3, 1.0, finalHorizonGrad); // Boost exposure near horizon
    
    vec4 I_gamma = pow(I * exposure, vec4(1.0 / 2.2));
    
    // Enhanced sky color with horizon transition
    vec3 skyColor = mix(
        vec3(0.095, 0.189, 0.33),
        vec3(0.378, 0.567, 0.85),
        smoothstep(-0.2, 0.2, dot(normalize(l), vec3(0.0, 0.0, 1.0)))
    );
    
    // Add warmer tint near horizon
    skyColor = mix(
        skyColor * vec3(1.2, 1.1, 1.0), // Warmer near horizon
        skyColor,
        finalHorizonGrad
    );
    
    I_gamma.rgb += skyColor * ambientIntensity * 0.66;
    
    // Final color with enhanced horizon transition
    gl_FragColor = I_gamma;
    float finalAlpha = mix(0.284, 0.898, gl_FragColor.a);
    finalAlpha *= mix(1.2, 1.0, finalHorizonGrad); // Stronger opacity near ground
    gl_FragColor.a = clamp(finalAlpha, 0.0, 1.0);

    // --- Hybrid ambient multiple scattering approximation ---
    float multiAmbient = 0.3;
    float sunSideFactor = max(dot(dir, l), 0.0);
    gl_FragColor.rgb += gl_FragColor.rgb * multiAmbient * (1.0 - finalHorizonGrad) * sunSideFactor;

    #include <logdepthbuf_fragment>
}