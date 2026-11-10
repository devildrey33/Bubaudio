
precision highp float;

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
#define TAU 6.28318530718

// ------------------------------------
// AUDIO
// ------------------------------------

float audioWave(float x) {
    float value = texture2D(
        uWaveform,
        vec2(clamp(x, 0.001, 0.999), 0.5)
    ).r;

    return (value * 2.0 - 1.0);
}

float audioSpectrum(float x) {
    return texture2D(
        uSpectrum,
        vec2(clamp(x, 0.001, 0.999), 0.5)
    ).r;
}

// ------------------------------------
// DISTANCE TO CIRCULAR WAVEFORM
// ------------------------------------

float waveformRing(
    vec2 p,
    float radius,
    float offset,
    float direction
) {
    float angle = atan(p.y, p.x);
    float normalizedAngle = fract(angle / TAU + 1.0);

    float wavePosition;

    if (normalizedAngle < 0.5) {
        wavePosition = normalizedAngle * 2.0;
    } else {
        wavePosition = 1.0 -
            (normalizedAngle - 0.5) * 2.0;
    }

    // Segundo recorrido ligeramente desplazado
    if (direction < 0.0) {
        wavePosition = 1.0 - wavePosition;
    }

    float wave = audioWave(wavePosition);

    float spectrum = audioSpectrum(
        fract(wavePosition * 0.7 + 0.1)
    );

    float movement =
        wave * (0.025 + uVolume * 0.035);

    movement += spectrum * 0.008;
    movement += sin(angle * 3.0 + uTime) * 0.003;

    movement *= 1.0 + uBass * 0.6;

    float targetRadius =
        radius + offset + movement;

    return abs(length(p) - targetRadius);
}

// ------------------------------------
// GLOW
// ------------------------------------

vec3 glowLine(
    float distanceValue,
    vec3 color,
    float width,
    float intensity
) {
    float core = exp(
        -distanceValue * distanceValue /
        (width * width)
    );

    float halo = exp(
        -distanceValue * 7.0
    );

    return color * (
        core * intensity +
        halo * intensity * 0.16
    );
}

// ------------------------------------
// MAIN
// ------------------------------------

void main() {

    vec2 p = vUv - 0.5;

    p.x *= uResolution.x / uResolution.y;

    float radius = length(p);
    float angle = atan(p.y, p.x);

    float time = uTime;

    float bass = clamp(uBass, 0.0, 1.0);
    float mid = clamp(uMid, 0.0, 1.0);
    float treble = clamp(uTreble, 0.0, 1.0);
    float volume = clamp(uVolume, 0.0, 1.0);
    float beat = clamp(uBeat, 0.0, 1.0);

    // --------------------------------
    // COLORS
    // --------------------------------

    vec3 cyan = vec3(0.05, 0.75, 1.0);
    vec3 blue = vec3(0.02, 0.25, 0.85);
    vec3 violet = vec3(0.48, 0.12, 1.0);
    vec3 pink = vec3(0.85, 0.12, 0.75);

    vec3 color = vec3(0.0);

    // --------------------------------
    // BACKGROUND ATMOSPHERE
    // --------------------------------

    float atmosphere = exp(
        -radius * radius * 9.0
    );

    color += vec3(0.005, 0.018, 0.055)
        * atmosphere;

    // --------------------------------
    // OUTER GLASS SPHERE
    // --------------------------------

    float sphereRadius = 0.285;

    float sphereDist = abs(
        radius - sphereRadius
    );

    float sphereGlow = exp(
        -sphereDist * 35.0
    );

    color += blue * sphereGlow * 0.12;

    // --------------------------------
    // DUAL OSCILLOSCOPE
    // --------------------------------

    float outerRadius = 0.57;

    float waveA = waveformRing(
        p,
        outerRadius,
        0.0,
        1.0
    );

    float waveB = waveformRing(
        p,
        outerRadius,
        0.014,
        -1.0
    );

    // La primera mitad es cian
    float normalizedAngle = fract(
        angle / TAU + 1.0
    );

    float firstHalf = 1.0 - smoothstep(
        0.47,
        0.53,
        normalizedAngle
    );

    float secondHalf = 1.0 - firstHalf;

    vec3 waveColorA = mix(
        violet,
        cyan,
        firstHalf
    );

    vec3 waveColorB = mix(
        cyan,
        violet,
        firstHalf
    );

    float waveIntensity =
        0.8 + volume * 1.2 + beat * 0.8;

    color += glowLine(
        waveA,
        waveColorA,
        0.0045,
        waveIntensity
    );

    color += glowLine(
        waveB,
        waveColorB,
        0.0035,
        waveIntensity * 0.7
    );

    // Halo exterior
    color += glowLine(
        waveA,
        waveColorA,
        0.018,
        0.22
    );

    color += glowLine(
        waveB,
        waveColorB,
        0.022,
        0.13
    );

    // --------------------------------
    // INNER CORE
    // --------------------------------

    float coreRadius =
        0.145 +
        bass * 0.012 +
        beat * 0.018;

    float coreDist = length(p);

    float coreMask = 1.0 - smoothstep(
        coreRadius - 0.004,
        coreRadius + 0.004,
        coreDist
    );

    float coreLight = exp(
        -coreDist * 9.0
    );

    float coreAngle = atan(p.y, p.x);

    float organicTexture =
        sin(coreAngle * 9.0 + time * 1.5) *
        cos(coreDist * 55.0 - time * 2.0);

    vec3 coreColor = mix(
        vec3(0.005, 0.035, 0.11),
        vec3(0.02, 0.35, 0.55),
        coreLight
    );

    coreColor += cyan *
        organicTexture * 0.025;

    color = mix(
        color,
        coreColor,
        coreMask * 0.95
    );

    // Núcleo luminoso
    color += cyan *
        exp(-coreDist * 35.0) *
        0.18;

    // Halo alrededor del núcleo
    color += glowLine(
        abs(coreDist - coreRadius),
        cyan,
        0.012,
        0.7 + beat * 0.6
    );

    // --------------------------------
    // ORBITAL PARTICLES
    // --------------------------------

    for (int i = 0; i < 24; i++) {

        float fi = float(i);

        float particleAngle =
            fi * 2.39996 +
            time * (0.08 + mod(fi, 2.0) * 0.04);

        float particleRadius =
            0.46 +
            0.09 * sin(fi * 7.13 + time);

        vec2 particlePosition =
            vec2(cos(particleAngle), sin(particleAngle))
            * particleRadius;

        float particleDist = length(
            p - particlePosition
        );

        float particleGlow = exp(
            -particleDist * 180.0
        );

        vec3 particleColor = mix(
            cyan,
            violet,
            mod(fi, 3.0) / 3.0
        );

        color += particleColor *
            particleGlow *
            (0.25 + treble * 0.9);
    }

    // --------------------------------
    // BEAT FLASH
    // --------------------------------

    color += cyan *
        exp(-abs(radius - outerRadius) * 25.0)
        * beat * 0.25;

    // --------------------------------
    // FINAL
    // --------------------------------

    color *= 1.0 + volume * 0.25;

    color = color / (1.0 + color * 0.35);

    gl_FragColor = vec4(color, 1.0);
}
