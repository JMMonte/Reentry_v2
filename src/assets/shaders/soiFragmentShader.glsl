precision highp float;

uniform vec3 color;
uniform float power;

varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    // Compute fresnel term based on view direction and normal
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), power);
    // Apply color and alpha based on fresnel
    gl_FragColor = vec4(color * fresnel, fresnel);
} 