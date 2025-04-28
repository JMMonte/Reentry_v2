// Rim glow vertex shader
// Calculates rim intensity and view-sun dot for color shifting

precision highp float;

uniform vec3 sunDirection;
varying float intensity;
varying float viewSun;
varying float normalDotSun;

void main() {
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 viewDir = normalize(cameraPosition - worldPos);
    float rim = pow(max(0.0, 1.0 - dot(worldNormal, viewDir)), 2.0);
    float lit = dot(worldNormal, sunDirection);
    intensity = rim * step(0.0, lit);
    viewSun = dot(viewDir, sunDirection);
    normalDotSun = lit;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
} 