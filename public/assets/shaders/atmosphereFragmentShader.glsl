precision highp float;
uniform vec3 lightPosition;
uniform float ambientIntensity; // New uniform for ambient light intensity
uniform float lightIntensity;
varying float fov;
uniform float surfaceRadius;
uniform float atmoRadius;
varying vec4 vWorldPosition;
varying vec3 viewRay; // View space ray direction

// math const
const float PI = 3.14159265359;
const float MAX = 10000.0;

// Ray intersects sphere
vec2 ray_vs_sphere(vec3 p, vec3 dir, float r) {
    float b = dot(p, dir);
    float c = dot(p, p) - r * r;
    float d = b * b - c;
    if (d < 0.0) return vec2(MAX, -MAX);
    d = sqrt(d);
    return vec2(-b - d, -b + d);
}

// Mie phase function
float phase_mie(float g, float c, float cc) {
    float gg = g * g;
    float a = (1.0 - gg) * (1.0 + cc);
    float b = 1.0 + gg - 2.0 * g * c;
    b *= sqrt(b);
    b *= 2.0 + gg;
    return (3.0 / 8.0 / PI) * a / b;
}

// Rayleigh phase function
float phase_ray(float cc) {
    return (3.0 / 16.0 / PI) * (1.0 + cc);
}

const int NUM_OUT_SCATTER = 4;
const int NUM_IN_SCATTER = 8;

float density(vec3 p, float ph) {
    float actualScaleHeight = 8500.0; // The scale height on Earth in meters
    float scale = (atmoRadius - surfaceRadius) / actualScaleHeight; // Scaling factor based on the gap
    float altitude = length(p) - surfaceRadius;
    float rho_0 = 1.225; // Earth's air density at sea level is approximately 1.225 kg/m^3
    rho_0 *= 0.08125; // Tuning value
    float rho = rho_0 * exp(-max(altitude, 0.0) / (actualScaleHeight * scale));
    return rho * ph;
}

float optic(vec3 p, vec3 q, float ph) {
    vec3 s = (q - p) / float(NUM_OUT_SCATTER);
    vec3 v = p + s * 0.5;
    float sum = 0.0;
    for (int i = 0; i < NUM_OUT_SCATTER; i++) {
        sum += density(v, ph);
        v += s;
    }
    sum *= length(s);
    return sum;
}

vec4 in_scatter(vec3 o, vec3 dir, vec2 e, vec3 l, float l_intensity) {
    const float ph_ray = 0.15;
    const float ph_mie = 0.05;
    const float ph_alpha = 0.25;
    const vec3 k_ray = vec3(0.5, 1.5, 6.5);
    const vec3 k_mie = vec3(21.0);
    const float k_mie_ex = 1.1;
    const float k_alpha = 2.0;

    vec3 sum_ray = vec3(0.0);
    vec3 sum_mie = vec3(0.0);
    float sum_alpha = 0.0;
    float n_ray0 = 0.0;
    float n_mie0 = 0.01;

    float len = (e.y - e.x) / float(NUM_IN_SCATTER);
    vec3 s = dir * len;
    vec3 v = o + dir * (e.x + len * 0.5);

    for (int i = 0; i < NUM_IN_SCATTER; i++, v += s) {
        float d_ray = density(v, ph_ray) * len;
        float d_mie = density(v, ph_mie) * len;
        float d_alpha = density(v, ph_alpha) * len;

        n_ray0 += d_ray;
        n_mie0 += d_mie;

        vec2 f = ray_vs_sphere(v, l, atmoRadius);
        vec3 u = v + l * f.y;

        float n_ray1 = optic(v, u, ph_ray);
        float n_mie1 = optic(v, u, ph_mie);

        vec3 att = exp(-(n_ray0 + n_ray1) * k_ray - (n_mie0 + n_mie1) * k_mie * k_mie_ex);

        sum_ray += d_ray * att;
        sum_mie += d_mie * att;
        sum_alpha += d_alpha;
    }

    float c = dot(dir, -l);
    float cc = c * c;
    vec3 scatter = sum_ray * k_ray * phase_ray(cc) + sum_mie * k_mie * phase_mie(-0.78, c, cc);
    float alpha = sum_alpha * k_alpha;
    return vec4(scatter * l_intensity, alpha);
}

// ray direction
vec3 ray_dir(float fov, vec2 size, vec2 pos) {
    vec2 xy = pos - size * 0.5;
    float cot_half_fov = tan(radians(90.0 - fov * 0.5));
    float z = size.y * 0.5 * cot_half_fov;
    return normalize(vec3(xy, -z));
}

void main() {
    vec4 worldRay = inverse(viewMatrix) * vec4(viewRay, 0.0);
    vec3 dir = normalize(worldRay.xyz);
    vec3 eye = vWorldPosition.xyz;
    vec3 l = normalize(lightPosition - vWorldPosition.xyz);

    vec2 e = ray_vs_sphere(eye, dir, atmoRadius);
    if (e.x > e.y) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    vec2 f = ray_vs_sphere(eye, dir, surfaceRadius);
    e.y = min(e.y, f.x);

    vec4 I = in_scatter(eye, dir, e, l, lightIntensity);
    vec4 I_gamma = pow(I, vec4(1.0 / 2.2));

    // Add ambient light to the final color
    vec3 ambientLight = vec3(ambientIntensity);
    I_gamma.rgb += ambientLight;

    gl_FragColor = I_gamma;
}
