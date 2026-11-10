
#ifdef GL_ES
precision highp float;
#endif

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359

// --------------------------------------------------
// UTILITIES
// --------------------------------------------------

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)),
            hash21(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

// --------------------------------------------------
// AUDIO
// --------------------------------------------------

float spectrum(float x) {
    return texture2D(
        uSpectrum,
        vec2(clamp(x, 0.0, 1.0), 0.5)
    ).r;
}

float waveform(float x) {
    return texture2D(
        uWaveform,
        vec2(fract(x), 0.5)
    ).r;
}

// --------------------------------------------------
// OCEAN WAVE FIELD
// --------------------------------------------------

float ocean(vec2 p) {

    float t = uTime;

    float bass = saturate(uBass);
    float mid = saturate(uMid);
    float treble = saturate(uTreble);

    float beat = saturate(uBeat);

    // Audio modulation
    float amplitude = 0.22 + bass * 0.48;
    float speed = 0.7 + bass * 0.7;

    // Main directional waves
    float h = 0.0;

    vec2 d1 = normalize(vec2(0.85, 0.48));
    vec2 d2 = normalize(vec2(-0.55, 0.83));
    vec2 d3 = normalize(vec2(0.25, 1.0));

    float w1 = sin(dot(p, d1) * 2.4 - t * speed);
    float w2 = sin(dot(p, d2) * 3.8 - t * 1.1);
    float w3 = sin(dot(p, d3) * 6.0 - t * 1.6);

    h += w1 * amplitude;
    h += w2 * (0.10 + mid * 0.19);
    h += w3 * (0.035 + treble * 0.07);

    // Secondary wave details
    h += sin(p.x * 8.0 + p.y * 4.0 - t * 2.2)
         * (0.025 + mid * 0.045);

    h += sin(p.x * 13.0 - p.y * 7.0 + t * 2.8)
         * (0.012 + treble * 0.025);

    // Spectrum-driven wave modulation
    float freq = spectrum(fract(p.x * 0.09 + 0.5));
    h += (freq - 0.25) * 0.12 * bass;

    // Waveform ripples
    float wave = waveform(fract(p.x * 0.06 + 0.5));
    h += (wave - 0.5) * 0.12 * mid;

    // Beat impulse
    h += sin(length(p) * 3.0 - t * 3.0)
         * beat * 0.12;

    // Organic turbulence
    float n = noise(p * 2.0 + t * 0.15);
    h += (n - 0.5) * (0.035 + mid * 0.055);

    return h;
}

// --------------------------------------------------
// SURFACE NORMAL
// --------------------------------------------------

vec3 oceanNormal(vec2 p) {

    float e = 0.008;

    float hx = ocean(p + vec2(e, 0.0))
             - ocean(p - vec2(e, 0.0));

    float hy = ocean(p + vec2(0.0, e))
             - ocean(p - vec2(0.0, e));

    return normalize(vec3(-hx / (2.0 * e), 1.0,
                          -hy / (2.0 * e)));
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

void main() {

    vec2 uv = vUv;

    float aspect = uResolution.x / uResolution.y;

    vec2 screen = uv - 0.5;
    screen.x *= aspect;

    float bass = saturate(uBass);
    float mid = saturate(uMid);
    float treble = saturate(uTreble);
    float volume = saturate(uVolume);
    float beat = saturate(uBeat);

    float t = uTime;

    // Sky gradient
    vec3 skyTop = vec3(0.008, 0.018, 0.065);
    vec3 skyBottom = vec3(0.025, 0.13, 0.24);

    float skyGradient = smoothstep(-0.15, 0.48, screen.y);

    vec3 sky = mix(skyBottom, skyTop, skyGradient);

    // Dynamic horizon
    float horizon = 0.08
                  + 0.025 * sin(screen.x * 2.0 + t * 0.3)
                  + bass * 0.035;

    float oceanMask = 1.0 - smoothstep(
        horizon - 0.012,
        horizon + 0.012,
        screen.y
    );

    // Perspective depth mapping
    float depth = max(0.0, horizon - screen.y);

    float perspective = 1.0 / (0.22 + depth * 1.5);

    vec2 p;

    p.x = screen.x * (1.0 + depth * 1.4);
    p.y = depth * 3.0 + 0.12;

    p *= perspective * 0.85;

    // Ocean surface
    float height = ocean(p);

    // Finite-difference lighting
    vec3 normal = oceanNormal(p);

    vec3 lightDir = normalize(vec3(-0.45, 0.8, 0.55));

    float diffuse = max(dot(normal, lightDir), 0.0);

    // Reflection / Fresnel
    vec3 viewDir = normalize(vec3(0.0, 0.55, 1.0));

    float fresnel = pow(
        1.0 - max(dot(normal, viewDir), 0.0),
        3.0
    );

    // Wave crest detection
    float crest = smoothstep(
        0.10,
        0.48,
        normal.x * 0.5 + normal.z * 0.5
    );

    float foam = pow(
        saturate(1.0 - normal.y),
        3.0
    );

    // Ocean colors
    vec3 deepOcean = vec3(0.005, 0.025, 0.09);
    vec3 oceanBlue = vec3(0.015, 0.16, 0.34);
    vec3 cyan = vec3(0.03, 0.55, 0.72);
    vec3 lightCyan = vec3(0.30, 0.90, 1.0);

    float lighting = diffuse * 0.55 + 0.25;

    vec3 water = mix(
        deepOcean,
        oceanBlue,
        saturate(lighting + height * 0.4)
    );

    water = mix(
        water,
        cyan,
        fresnel * 0.75
    );

    // Wave crests and foam
    water += cyan * crest * (0.15 + treble * 0.4);
    water += lightCyan * foam * (0.15 + volume * 0.6);

    // Specular highlights
    vec3 halfDir = normalize(lightDir + viewDir);

    float specular = pow(
        max(dot(normal, halfDir), 0.0),
        42.0
    );

    water += vec3(0.35, 0.8, 1.0)
             * specular
             * (0.5 + treble + beat * 0.5);

    // Depth fog
    float fog = exp(-depth * 1.5);

    water = mix(
        vec3(0.008, 0.035, 0.10),
        water,
        fog
    );

    // Audio energy glow
    water += vec3(0.01, 0.12, 0.24)
             * volume * (0.3 + fresnel);

    // Final composition
    vec3 color = mix(sky, water, oceanMask);

    // Horizon glow
    float horizonGlow = exp(
        -abs(screen.y - horizon) * 38.0
    );

    color += vec3(0.02, 0.18, 0.30)
             * horizonGlow
             * (0.25 + bass + beat);

    // Beat flash
    color += vec3(0.02, 0.12, 0.20)
             * beat * 0.12 * oceanMask;

    // Vignette
    float vignette = 1.0 - 0.35 * dot(
        screen / vec2(aspect, 1.0),
        screen / vec2(aspect, 1.0)
    );

    color *= vignette;

    // Contrast and output
    color = max(color, 0.0);
    color = color / (1.0 + color * 0.35);

    gl_FragColor = vec4(color, 1.0);
}
