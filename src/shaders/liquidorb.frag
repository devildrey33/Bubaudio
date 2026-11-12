
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

// ==================================================
// DIGITAL OCEAN 2.0
// GERSTNER WAVES
// ==================================================

float sat(float x) {
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

// ==================================================
// AUDIO RESPONSE
// ==================================================

float bass;
float mid;
float treble;
float volume;
float beat;

void initializeAudio() {
    bass = sat(uBass);
    mid = sat(uMid);
    treble = sat(uTreble);
    volume = sat(uVolume);
    beat = sat(uBeat);
}

// ==================================================
// GERSTNER WAVE FIELD
// ==================================================

float oceanHeight(vec2 p, out float foamSignal) {

    float t = uTime;

    float height = 0.0;
    vec2 displacement = vec2(0.0);

    foamSignal = 0.0;

    // Main wave directions
    vec2 d1 = normalize(vec2(0.85, 0.45));
    vec2 d2 = normalize(vec2(-0.65, 0.76));
    vec2 d3 = normalize(vec2(0.30, 1.0));
    vec2 d4 = normalize(vec2(-0.95, 0.20));
    vec2 d5 = normalize(vec2(0.65, -0.70));

    // Audio-driven amplitudes
    float A1 = 0.27 + bass * 0.42;
    float A2 = 0.14 + mid * 0.20;
    float A3 = 0.075 + treble * 0.10;
    float A4 = 0.055 + mid * 0.08;
    float A5 = 0.035 + treble * 0.045;

    // Wave frequencies
    float K1 = 2.0;
    float K2 = 3.3;
    float K3 = 5.5;
    float K4 = 8.0;
    float K5 = 12.0;

    // Gerstner horizontal displacement
    float Q1 = 0.85 + bass * 0.35;
    float Q2 = 0.65 + mid * 0.25;
    float Q3 = 0.45 + treble * 0.20;
    float Q4 = 0.30;
    float Q5 = 0.20;

    // Initial phases
    float P1 = dot(p, d1) * K1 - t * 1.0;
    float P2 = dot(p, d2) * K2 - t * 1.35;
    float P3 = dot(p, d3) * K3 - t * 1.75;
    float P4 = dot(p, d4) * K4 - t * 2.1;
    float P5 = dot(p, d5) * K5 - t * 2.7;

    // Horizontal orbital displacement
    displacement += d1 * Q1 * A1 * cos(P1);
    displacement += d2 * Q2 * A2 * cos(P2);
    displacement += d3 * Q3 * A3 * cos(P3);
    displacement += d4 * Q4 * A4 * cos(P4);
    displacement += d5 * Q5 * A5 * cos(P5);

    // Approximate inverse Gerstner mapping
    vec2 q = p - displacement;

    // Recalculate phases on displaced surface
    P1 = dot(q, d1) * K1 - t * 1.0;
    P2 = dot(q, d2) * K2 - t * 1.35;
    P3 = dot(q, d3) * K3 - t * 1.75;
    P4 = dot(q, d4) * K4 - t * 2.1;
    P5 = dot(q, d5) * K5 - t * 2.7;

    // Vertical displacement
    float s1 = sin(P1);
    float s2 = sin(P2);
    float s3 = sin(P3);
    float s4 = sin(P4);
    float s5 = sin(P5);

    height += A1 * s1;
    height += A2 * s2;
    height += A3 * s3;
    height += A4 * s4;
    height += A5 * s5;

    // Sharpen wave crests
    float sharp1 = pow(max(s1, 0.0), 12.0);
    float sharp2 = pow(max(s2, 0.0), 10.0);
    float sharp3 = pow(max(s3, 0.0), 8.0);

    foamSignal += sharp1 * 0.65;
    foamSignal += sharp2 * 0.35;
    foamSignal += sharp3 * 0.20;

    // Additional organic turbulence
    float n = noise(q * 2.5 + t * 0.15);
    height += (n - 0.5) * (0.06 + mid * 0.08);

    // Spectrum modulation
    float freq = spectrum(fract(q.x * 0.035 + 0.5));
    height += (freq - 0.25) * bass * 0.16;

    // Waveform modulation
    float wave = waveform(fract(q.x * 0.025 + 0.5));
    height += (wave - 0.5) * mid * 0.12;

    // Beat-generated traveling wave
    height += sin(length(q) * 2.8 - t * 3.0)
              * beat * 0.17;

    foamSignal += beat * 0.15 * sharp1;

    return height;
}

// ==================================================
// SURFACE NORMAL
// ==================================================

vec3 oceanNormal(vec2 p) {

    float e = 0.006;

    float f;
    float h1 = oceanHeight(p + vec2(e, 0.0), f);
    float h2 = oceanHeight(p - vec2(e, 0.0), f);
    float h3 = oceanHeight(p + vec2(0.0, e), f);
    float h4 = oceanHeight(p - vec2(0.0, e), f);

    float dx = (h1 - h2) / (2.0 * e);
    float dy = (h3 - h4) / (2.0 * e);

    return normalize(vec3(-dx, 1.0, -dy));
}

// ==================================================
// MAIN RENDER
// ==================================================

void main() {

    initializeAudio();

    vec2 uv = vUv;

    float aspect = uResolution.x / uResolution.y;

    vec2 screen = uv - 0.5;
    screen.x *= aspect;

    // ----------------------------------------------
    // SKY
    // ----------------------------------------------

    float horizon = 0.095
                  + sin(screen.x * 2.0 + uTime * 0.3) * 0.015
                  + bass * 0.025;

    vec3 skyTop = vec3(0.004, 0.012, 0.045);
    vec3 skyBottom = vec3(0.025, 0.13, 0.24);

    float skyMix = smoothstep(-0.05, 0.48, screen.y);

    vec3 sky = mix(skyBottom, skyTop, skyMix);

    // ----------------------------------------------
    // PERSPECTIVE OCEAN
    // ----------------------------------------------

    float depth = max(0.0, horizon - screen.y);

    float oceanMask = 1.0 - smoothstep(
        horizon - 0.008,
        horizon + 0.008,
        screen.y
    );

    // Perspective exaggeration
    float perspective = 1.0 + depth * 3.5;

    vec2 p = vec2(
        screen.x * perspective * 1.6,
        depth * 4.0 + 0.25
    );

    // Slightly rotate wave field
    float angle = 0.12;

    p = mat2(
        cos(angle), -sin(angle),
        sin(angle), cos(angle)
    ) * p;

    // ----------------------------------------------
    // SURFACE
    // ----------------------------------------------

    float foamSignal;

    float height = oceanHeight(p, foamSignal);

    vec3 normal = oceanNormal(p);

    vec3 lightDir = normalize(vec3(-0.5, 0.8, 0.45));
    vec3 viewDir = normalize(vec3(0.0, 0.45, 1.0));

    float diffuse = max(dot(normal, lightDir), 0.0);

    float fresnel = pow(
        1.0 - max(dot(normal, viewDir), 0.0),
        3.0
    );

    // ----------------------------------------------
    // WAVE CRESTS
    // ----------------------------------------------

    float slope = length(normal.xz);

    float crest = smoothstep(
        0.35,
        1.45,
        slope
    );

    float foam = smoothstep(
        0.30,
        0.85,
        foamSignal
    );

    // Animated foam texture
    float foamNoise = noise(
        p * 12.0 + vec2(uTime * 0.7, -uTime * 0.4)
    );

    foam *= smoothstep(0.22, 0.70, foamNoise);

    // ----------------------------------------------
    // WATER COLORS
    // ----------------------------------------------

    vec3 abyss = vec3(0.002, 0.012, 0.045);
    vec3 deepBlue = vec3(0.005, 0.045, 0.13);
    vec3 oceanBlue = vec3(0.008, 0.16, 0.32);
    vec3 turquoise = vec3(0.015, 0.48, 0.64);
    vec3 brightCyan = vec3(0.28, 0.88, 1.0);

    float depthColor = exp(-depth * 1.15);

    vec3 water = mix(
        abyss,
        deepBlue,
        sat(diffuse * 0.65 + 0.15)
    );

    water = mix(
        water,
        oceanBlue,
        sat(0.25 + fresnel * 0.65 + height * 0.15)
    );

    water += turquoise * crest * 0.28;

    // Reflections
    water += brightCyan * fresnel
             * (0.25 + treble * 0.5);

    // Specular glints
    vec3 halfDir = normalize(lightDir + viewDir);

    float specular = pow(
        max(dot(normal, halfDir), 0.0),
        55.0
    );

    water += brightCyan * specular
             * (0.6 + volume + beat);

    // Foam
    water = mix(
        water,
        vec3(0.55, 0.90, 1.0),
        foam * (0.35 + volume * 0.45)
    );

    // Depth atmosphere
    water = mix(
        abyss,
        water,
        depthColor
    );

    // ----------------------------------------------
    // LIGHT RAYS
    // ----------------------------------------------

    float rays = pow(
        max(dot(normal, lightDir), 0.0),
        7.0
    );

    water += turquoise * rays
             * (0.10 + volume * 0.25);

    // ----------------------------------------------
    // AUDIO ENERGY
    // ----------------------------------------------

    water += vec3(0.0, 0.08, 0.18)
             * bass * (0.25 + crest);

    water += brightCyan * treble * foam * 0.25;

    // ----------------------------------------------
    // COMPOSITION
    // ----------------------------------------------

    vec3 color = mix(sky, water, oceanMask);

    float horizonGlow = exp(
        -abs(screen.y - horizon) * 38.0
    );

    color += vec3(0.025, 0.20, 0.34)
             * horizonGlow
             * (0.3 + bass + beat * 0.5);

    // Beat flash
    color += vec3(0.01, 0.10, 0.22)
             * beat * oceanMask * 0.15;

    // Vignette
    float vignette = 1.0 - 0.32 * dot(
        screen,
        screen
    );

    color *= vignette;

    // Tonemapping
    color = max(color, 0.0);
    color = color / (1.0 + color * 0.35);

    gl_FragColor = vec4(color, 1.0);
}
