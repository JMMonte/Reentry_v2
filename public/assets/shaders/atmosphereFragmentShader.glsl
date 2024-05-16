varying vec3 vNormal;
varying vec3 vViewPosition;

uniform vec3 uColor;
uniform float opacity;
uniform float fresnelPower;
void main() {
    vec3 viewDirection = normalize(-vViewPosition); // View direction in camera space
    float cosTheta = dot(vNormal, viewDirection); // Cosine of the angle between normal and view direction
    float fresnel = pow(1.0 - abs(cosTheta), fresnelPower); // Calculate Fresnel effect based on the view angle

    // Apply logarithmic fade to the fresnel effect
    fresnel = log(1.0 + fresnel * 9.0) / log(10.0);

    gl_FragColor = vec4(uColor, opacity * fresnel);
}
