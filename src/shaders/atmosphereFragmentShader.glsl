// fragmentShader.glsl
uniform vec3 sunPosition;
uniform vec3 customCameraPosition;  
uniform float earthRadius;
uniform float atmosphereRadius;
varying vec3 vPosition;

const float PI = 3.14159265359;
const float Rayleigh = 1.0 / 8.0; // Adjust this value to control the intensity of Rayleigh scattering
const float RayleighScaleHeight = 8000.0; // Scale height for atmospheric density (meters)
const vec3 InvWavelength = vec3(1.0 / pow(0.650, 4.0), 1.0 / pow(0.570, 4.0), 1.0 / pow(0.475, 4.0)); // RGB wavelengths
const float SunIntensity = 20.0; // Adjust Sun intensity

void main() {
    vec3 viewDirection = normalize(vPosition - customCameraPosition);
    float r = length(vPosition - customCameraPosition);
    float atmosHeight = atmosphereRadius - earthRadius;
    float h = clamp((r - earthRadius) / atmosHeight, 0.0, 1.0);
    float scale = RayleighScaleHeight / atmosHeight;

    // Calculate Rayleigh scattering
    float rayleigh = exp(-h / scale) * Rayleigh;
    vec3 scatter = InvWavelength * rayleigh;

    // Calculate the angle to the sun and phase function
    vec3 sunDir = normalize(sunPosition - vPosition);
    float cosTheta = dot(viewDirection, sunDir);
    float rayleighPhase = 0.75 * (1.0 + cosTheta * cosTheta);

    // Combine scattering with sunlight
    vec3 atmosColor = scatter * rayleighPhase * SunIntensity;

    // Final color computation, adding some ambient light
    vec3 ambient = vec3(0.1, 0.1, 0.2) * h; // Soft ambient light based on height
    gl_FragColor = vec4(atmosColor + ambient, 1.0);
}
