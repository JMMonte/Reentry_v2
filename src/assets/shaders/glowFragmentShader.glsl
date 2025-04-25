precision highp float;

uniform vec3 innerColor;
uniform vec3 midColor;
uniform vec3 sunDirection;
varying float intensity;
varying float viewSun;

void main() {
    float t = intensity;
    vec3 color;
    if (t < 0.5) {
        color = mix(innerColor, midColor, t * 2.0);
    } else {
        color = mix(midColor, vec3(0.0), (t - 0.5) * 2.0);
    }
    // red shift only when exactly behind the Earth
    float backDot = -viewSun;
    float redFactor = smoothstep(0.95, 1.0, backDot);
    vec3 redColor = vec3(1.0, 0.3, 0.1);
    color = mix(color, redColor, redFactor);
    gl_FragColor = vec4(color, intensity * 0.6);
} 