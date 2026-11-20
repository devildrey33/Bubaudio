precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;

uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TAU 6.28318530718
#define SPOKE_COUNT 72.0

mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
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

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;

    for (int i = 0; i < 4; i++) {
        value += noise(p) * amp;
        p = p * 2.03 + 17.1;
        amp *= 0.5;
    }

    return value;
}

float spectrum(float x) {
    return texture2D(
        uSpectrum,
        vec2(clamp(x, 0.002, 0.998), 0.5)
    ).r;
}

float waveform(float x) {
    return texture2D(
        uWaveform,
        vec2(fract(x), 0.5)
    ).r * 2.0 - 1.0;
}

float glowLine(float d, float width, float blur) {
    return smoothstep(width + blur, width - blur, abs(d));
}

vec3 punkPalette(float radius, float energy) {
    vec3 deepBlue = vec3(0.005, 0.015, 0.12);
    vec3 cyan = vec3(0.0, 0.95, 1.0);
    vec3 hotPink = vec3(1.0, 0.0, 0.55);
    vec3 violet = vec3(0.40, 0.0, 0.75);

    vec3 color = mix(deepBlue, cyan, smoothstep(0.04, 0.34, radius));
    color = mix(color, violet, smoothstep(0.32, 0.62, radius));
    color = mix(color, hotPink, smoothstep(0.55, 1.05, radius));

    return color * (0.65 + energy * 1.6);
}

void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= uResolution.x / uResolution.y;

    float t = uTime;
    float audioPower = clamp(
        uBass * 0.90 + uMid * 0.55 + uTreble * 0.30 + uVolume * 0.35,
        0.0,
        2.0
    );

    // Cámara viva: rotación, zoom y sacudida en cada golpe grave.
    p *= rot(
        t * 0.055
        + uBeat * 0.25
        + sin(t * 1.7) * uVolume * 0.035
    );

    float shake = uBeat * 0.035 + uMidBeat * 0.012;
    p += vec2(
        sin(t * 31.0) * shake,
        cos(t * 27.0) * shake
    );

    float radius = length(p);
    float angle = atan(p.y, p.x);
    float angle01 = angle / TAU + 0.5;

    // El ángulo se retuerce como tentáculos. El beat aumenta brutalmente la torsión.
    float tentacleWarp =
        sin(angle * 7.0 - t * 2.7 + radius * 16.0) * (0.018 + uBass * 0.055)
        + sin(angle * 13.0 + t * 3.9 - radius * 22.0) * (0.012 + uMid * 0.045)
        + sin(angle * 29.0 - t * 6.5 + radius * 34.0) * (0.006 + uTreble * 0.025);

    float organicWarp = fbm(vec2(angle * 2.5, radius * 4.0 + t * 0.7));
    tentacleWarp += (organicWarp - 0.5) * (0.025 + audioPower * 0.045);

    float warpedAngle = angle + tentacleWarp;
    float warped01 = warpedAngle / TAU + 0.5;

    // Una lectura angular del espectro crea energía localizada en cada tentáculo.
    float frequencyPosition = pow(fract(warped01 * 1.65), 1.25);
    float spectralEnergy = spectrum(frequencyPosition);

    float localEnergy = clamp(
        spectralEnergy
        + uBass * smoothstep(0.75, 0.0, frequencyPosition) * 0.75
        + uMid * 0.35
        + uTreble * smoothstep(0.45, 1.0, frequencyPosition) * 0.50,
        0.0,
        2.0
    );

    // Forma radial deformada: el borde oscila y se abre con el audio.
    float radialWave =
        sin(warpedAngle * 18.0 - t * 3.0) * (0.025 + uBass * 0.075)
        + sin(warpedAngle * 37.0 + t * 5.0) * (0.010 + uTreble * 0.035)
        + sin(radius * 28.0 - t * 4.0) * (0.008 + uBeat * 0.035);

    float tentacleRadius = radius
        + radialWave
        + localEnergy * (0.055 + uBeat * 0.16)
        + waveform(warped01 + t * 0.025) * (0.012 + uVolume * 0.035);

    // Base oscura con halo central y degradado cyan-magenta.
    // Menos relleno: el fondo debe respirar y dejar zonas negras visibles.
    float centralGlow = exp(-radius * radius * (26.0 - uBeat * 5.0));
    float outerGlow = smoothstep(0.12, 1.15, radius) * 0.32;

    vec3 color = vec3(0.001, 0.001, 0.008);
    color += vec3(0.0, 0.16, 0.38) * centralGlow * (0.42 + uBass * 1.35);
    color += vec3(0.16, 0.0, 0.20) * outerGlow * (0.18 + uTreble * 0.55);

    // Bandas radiales intensas, como anillos de energía que se expanden.
    float bands = 0.0;
    float bandSpace = 10.0 + uBass * 5.0 + uBeat * 8.0;
    float bandPhase = tentacleRadius * bandSpace - t * (1.5 + uBeat * 5.0);
    float bandSignal = abs(sin(bandPhase));
    // Bandas más finas para que no se conviertan en manchas sólidas.
    bands += smoothstep(0.105, 0.008, bandSignal) * (0.12 + localEnergy * 0.95);

    float secondaryBands = abs(sin(
        tentacleRadius * (22.0 + uTreble * 12.0)
        + t * 4.0
        + warpedAngle * 2.0
    ));
    bands += smoothstep(0.085, 0.006, secondaryBands) * (0.045 + uTreble * 0.48);

    color += punkPalette(radius, localEnergy) * bands * 0.72;

    // Rayos negros muy contrastados. Se deforman en función del radio y del audio.
    float spokeAngle = warpedAngle * SPOKE_COUNT;
    spokeAngle += sin(radius * 18.0 - t * 4.0) * (2.0 + uBeat * 8.0);
    spokeAngle += sin(radius * 43.0 + t * 6.0) * (0.6 + uTreble * 2.0);

    float spokeDistance = abs(sin(spokeAngle));
    float spokeWidth = 0.075 + uBeat * 0.10 + uBass * 0.06;
    float blackSpokes = 1.0 - smoothstep(0.0, spokeWidth, spokeDistance);

    // Las rayas se mantienen fuertes en todo el campo, pero respiran cerca del núcleo.
    float spokeFade = smoothstep(0.015, 0.12, radius) * smoothstep(1.25, 0.70, radius);
    blackSpokes *= spokeFade;

    // Flash de color bajo las rayas para dar aspecto de tubo de neón distorsionado.
    color += vec3(0.0, 0.65, 0.95)
        * blackSpokes
        * (0.20 + uBass * 1.3)
        * (1.0 - smoothstep(0.0, 0.28, radius));

    color = mix(color, vec3(0.001, 0.001, 0.004), blackSpokes * 0.94);

    // Halo blanco/cyan en el anillo central.
    // Núcleo reducido: pequeño, afilado y brillante, sin ocupar toda la imagen.
    float coreRadius = 0.070
        + uBass * 0.022
        + uBeat * 0.040
        + sin(t * 5.0) * uVolume * 0.006;

    float coreRing = glowLine(
        radius - coreRadius + radialWave * 0.3,
        0.005 + uBeat * 0.010,
        0.018 + uVolume * 0.020
    );

    color += coreRing * vec3(0.70, 1.0, 1.0)
        * (0.82 + uBeat * 2.2);

    float core = exp(-radius * radius * (100.0 - uBeat * 28.0));
    color += core * vec3(0.0, 0.72, 1.0)
        * (0.75 + uBass * 1.7 + uBeat * 2.8);

    // Rayos internos adicionales, más finos y nerviosos.
    float innerRays = abs(sin(
        warpedAngle * 31.0
        + radius * 55.0
        - t * (7.0 + uTreble * 10.0)
    ));

    innerRays = smoothstep(0.10, 0.015, innerRays);
    innerRays *= smoothstep(0.70, 0.05, radius);
    color += vec3(0.25, 0.75, 1.0) * innerRays * (0.12 + uMid * 0.9);

    // Aberración cromática/glitch de alta frecuencia alrededor del borde.
    float glitch = step(
        0.82,
        hash21(vec2(floor(uv.y * 48.0), floor(t * 14.0)))
    );

    float glitchWave = sin(uv.y * 130.0 + t * 16.0);
    color.r += glitch * max(0.0, glitchWave) * uTrebleBeat * 0.65;
    color.b += glitch * max(0.0, -glitchWave) * uMidBeat * 0.75;

    // Scanlines y viñeta.
    float scan = sin(uv.y * uResolution.y * 0.72);
    color *= mix(
        0.82,
        1.12,
        smoothstep(-0.2, 0.7, scan) * (0.18 + uVolume * 0.30)
    );

    float vignette = smoothstep(1.42, 0.20, radius);
    color *= vignette;

    // Bloom falso muy fuerte para el look punk/neón.
    color += color * color * (1.0 + uBeat * 1.5);
    color = pow(max(color, vec3(0.0)), vec3(0.88));

    gl_FragColor = vec4(color, 1.0);
}
