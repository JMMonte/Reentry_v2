precision highp float;

// Uniform variables for customization
uniform vec3 lightPosition;     // Position of the light source
uniform float ambientIntensity; // Intensity of ambient light
uniform float lightIntensity;   // Intensity of the main light source
uniform float surfaceRadius;    // Radius of the planet's surface
uniform float atmoRadius;       // Radius of the atmosphere

// Varying variables passed from vertex shader
varying float fov;              // Field of view
varying vec4 vWorldPosition;    // World space position
varying vec3 viewRay;           // View space ray direction

// Mathematical constants
const float PI = 3.14159265359;
const float MAX = 10000.0;

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

// Constants for scattering calculations
const int NUM_OUT_SCATTER = 4;
const int NUM_IN_SCATTER = 8;

// Atmospheric density function
// p: position, ph: phase (ray or mie)
float density(vec3 p, float ph) {
    float actualScaleHeight = 8500.0; // Earth's scale height in meters
    float scale = (atmoRadius - surfaceRadius) / actualScaleHeight;
    float altitude = length(p) - surfaceRadius;
    float rho_0 = 1.225 * 0.08125; // Scaled sea level density
    return rho_0 * exp(-max(altitude, 0.0) / (actualScaleHeight * scale)) * ph;
}

// Optical depth calculation
float optic(vec3 p, vec3 q, float ph) {
    vec3 step = (q - p) / float(NUM_OUT_SCATTER);
    vec3 v = p + step * 0.5;
    float sum = 0.0;
    for (int i = 0; i < NUM_OUT_SCATTER; i++) {
        sum += density(v, ph);
        v += step;
    }
    return sum * length(step);
}

// In-scattering calculation
vec4 in_scatter(vec3 o, vec3 dir, vec2 e, vec3 l, float l_intensity) {
    // Scattering coefficients
    const float ph_ray = 0.15;
    const float ph_mie = 0.05;
    const float ph_alpha = 0.25;
    const vec3 k_ray = vec3(0.1, 1.3, 5.5);
    const vec3 k_mie = vec3(21.0);
    const float k_mie_ex = 1.1;
    const float k_alpha = 2.0;

    vec3 sum_ray = vec3(0.0);
    vec3 sum_mie = vec3(0.0);
    float sum_alpha = 0.0;
    float n_ray0 = 0.0;
    float n_mie0 = 0.01;

    // Ray marching
    float len = (e.y - e.x) / float(NUM_IN_SCATTER);
    vec3 step = dir * len;
    vec3 p = o + dir * (e.x + len * 0.5);

    for (int i = 0; i < NUM_IN_SCATTER; i++, p += step) {
        float d_ray = density(p, ph_ray) * len;
        float d_mie = density(p, ph_mie) * len;
        float d_alpha = density(p, ph_alpha) * len;

        n_ray0 += d_ray;
        n_mie0 += d_mie;

        vec2 f = ray_vs_sphere(p, l, atmoRadius);
        vec3 q = p + l * f.y;

        float n_ray1 = optic(p, q, ph_ray);
        float n_mie1 = optic(p, q, ph_mie);

        vec3 att = exp(-(n_ray0 + n_ray1) * k_ray - (n_mie0 + n_mie1) * k_mie * k_mie_ex);

        sum_ray += d_ray * att;
        sum_mie += d_mie * att;
        sum_alpha += d_alpha;
    }

    // Calculate scattering
    float c = dot(dir, -l);
    float cc = c * c;
    vec3 scatter = sum_ray * k_ray * phase_ray(cc) + sum_mie * k_mie * phase_mie(-0.78, c, cc);
    float alpha = sum_alpha * k_alpha;
    return vec4(scatter * l_intensity, alpha);
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

    // Apply gamma correction
    vec4 I_gamma = pow(I, vec4(1.0 / 2.2));

    // Add ambient light
    vec3 ambientLight = vec3(ambientIntensity);
    I_gamma.rgb += ambientLight;

    // Set final color
    gl_FragColor = I_gamma;
}