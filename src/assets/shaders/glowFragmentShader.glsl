precision highp float;

uniform vec3 sunDirection;
uniform vec3 rayleighCoefficients;
uniform float mieCoefficient;
uniform float mieG;

varying float intensity;
varying float viewSun;

const float PI = 3.14159265359;

// Rayleigh phase function
float rayleighPhase(float cosTheta) {
    return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

// Mie phase function (Henyey-Greenstein)
float miePhase(float cosTheta, float g) {
    float g2 = g * g;
    float denom = pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
    return (1.0 - g2) / (4.0 * PI * denom);
}

void main() {
    // scattering angle
    float cosTheta = viewSun;
    
    // compute phase functions
    float pr = rayleighPhase(cosTheta);
    float pm = miePhase(cosTheta, mieG);

    // combine scattering contributions
    vec3 scatter = rayleighCoefficients * pr + vec3(mieCoefficient) * pm;

    // shape glow by rim intensity
    vec3 color = scatter * intensity;
    float alpha = intensity;

    gl_FragColor = vec4(color, alpha);
} 