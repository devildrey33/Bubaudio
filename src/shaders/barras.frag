
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

uniform float uKick;
uniform float uSnare;
uniform float uVoice;
uniform float uHiHat;

uniform float uKickPeak;
uniform float uSnarePeak;
uniform float uVoicePeak;
uniform float uHiHatPeak;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI  3.14159265359
#define TAU 6.28318530718

// ============================================================================
// CONTROLES
// ============================================================================

#define ROTATION_SPEED 0.20

#define SPECTRUM_MIN_BARS 8.0
#define SPECTRUM_MAX_BARS 32.0
#define SPECTRUM_FREQUENCY_POWER 0.70

#define CORE_KICK_GAIN 0.12
#define SPECTRUM_MAX_LENGTH 0.30
#define WAVEFORM_AMPLITUDE 0.09

#define EDGE_INTENSITY 0.65
#define GRID_INTENSITY 0.18
#define PARTICLE_COUNT 36.0
#define PARTICLE_SIZE 0.009

#define VIGNETTE_INTENSITY 0.38
#define GRAIN_INTENSITY 0.025
#define TONEMAP_EXPOSURE 1.30
#define OUTPUT_GAMMA 2.20

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec3 palette(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

float lineMask(float d, float width) {
    return 1.0 - smoothstep(width, width + 0.002, d);
}

float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

// ============================================================================
// SISTEMA 1: REJILLA HOLOGRÁFICA
// ============================================================================

float holographicGrid(vec2 p, float r, float t) {
    float edge = smoothstep(0.55, 0.85, r);

    vec2 grid = abs(fract(p * 8.0) - 0.5);
    float lines = min(grid.x, grid.y);

    float gridMask = lineMask(lines, 0.012);

    vec2 fineGrid = abs(fract(p * 24.0) - 0.5);
    float fineLines = min(fineGrid.x, fineGrid.y);
    float fineMask = lineMask(fineLines, 0.018);

    return edge * (gridMask * 0.55 + fineMask * 0.20)
         * (0.7 + 0.3 * sin(t * 1.5 + p.x * 2.0));
}

// ============================================================================
// SISTEMA 2: BOMBO — BARRIDOS DE ENERGÍA LATERALES
// ============================================================================

vec3 kickSystem(vec2 p, float r, float peak, float t) {
    vec3 result = vec3(0.0);

    float edge = smoothstep(0.52, 0.90, r);

    float scan = fract(t * 0.32 + 0.5);

    float leftScan = abs(p.x + scan * 1.7);
    float rightScan = abs(p.x - scan * 1.7);

    float scanLine = exp(-leftScan * 90.0)
                   + exp(-rightScan * 90.0);

    result += vec3(0.10, 0.48, 1.0)
            * scanLine * edge * peak * 2.5;

    float side = abs(abs(p.x) - 0.88 * (uResolution.x / uResolution.y));

    float frame = lineMask(side, 0.012);

    float horizontalLines = lineMask(
        abs(fract(p.y * 5.0 + 0.5) - 0.5),
        0.025
    );

    result += vec3(0.08, 0.35, 1.0)
            * frame * horizontalLines * edge
            * (0.2 + peak * 2.0);

    float sideGlow = exp(
        -pow(abs(p.x) - 0.85 * (uResolution.x / uResolution.y), 2.0) * 22.0
    );

    result += vec3(0.08, 0.25, 1.0)
            * sideGlow * peak * 1.4;

    return result;
}

// ============================================================================
// SISTEMA 3: VOZ — COLUMNAS HOLOGRÁFICAS
// ============================================================================

vec3 voiceSystem(vec2 p, float r, float peak, float t) {
    vec3 result = vec3(0.0);

    float edge = smoothstep(0.48, 0.82, r);

    float column = abs(fract(p.x * 9.0) - 0.5);
    float columns = lineMask(column, 0.035);

    float scan = fract(t * 0.16);

    float verticalScan = exp(
        -pow(fract(p.y * 0.5 + scan) - 0.5, 2.0) * 1200.0
    );

    float distortion = sin(p.x * 18.0 + t * 2.0) * 0.012 * peak;

    float waveLines = lineMask(
        abs(fract((p.y + distortion) * 12.0) - 0.5),
        0.025
    );

    float structure = columns * waveLines;

    result += vec3(0.75, 0.18, 1.0)
            * structure * edge * (0.15 + peak * 2.0);

    result += vec3(0.55, 0.12, 1.0)
            * verticalScan * columns * edge * peak * 1.5;

    float blocks = lineMask(
        abs(fract(p.y * 16.0 + p.x * 2.0) - 0.5),
        0.07
    );

    result += vec3(0.35, 0.12, 0.85)
            * blocks * columns * edge * peak * 0.8;

    return result;
}

// ============================================================================
// SISTEMA 4: CAJA — RAYOS LÁSER DIAGONALES
// ============================================================================

vec3 snareSystem(vec2 p, float r, float peak, float t) {
    vec3 result = vec3(0.0);

    float edge = smoothstep(0.50, 0.78, r);
    float aspect = uResolution.x / uResolution.y;

    vec2 a = vec2(-aspect, -1.0);
    vec2 b = vec2( aspect,  1.0);

    vec2 c = vec2(-aspect,  1.0);
    vec2 d = vec2( aspect, -1.0);

    float beam1 = lineMask(segment(p, a, b), 0.0025);
    float beam2 = lineMask(segment(p, c, d), 0.0025);

    float diagonal = abs(p.x + p.y * aspect * 0.65);
    float diagonal2 = abs(p.x - p.y * aspect * 0.65);

    float secondary1 = lineMask(diagonal, 0.006);
    float secondary2 = lineMask(diagonal2, 0.006);

    float flash = peak * peak;

    result += vec3(0.08, 0.85, 1.0)
            * (beam1 + beam2) * edge * flash * 3.0;

    result += vec3(0.05, 0.40, 0.9)
            * (secondary1 + secondary2) * edge * peak * 1.5;

    return result;
}

// ============================================================================
// SISTEMA 5: CHARLES — PARTÍCULAS DIGITALES
// ============================================================================

vec3 hihatSystem(vec2 p, float r, float peak, float t) {
    vec3 result = vec3(0.0);

    float edge = smoothstep(0.40, 0.72, r);

    for (int i = 0; i < 36; i++) {
        float fi = float(i);

        vec2 seed = vec2(
            fi * 17.31 + 4.2,
            fi * 31.73 + 8.1
        );

        vec2 pos = vec2(
            hash21(seed),
            hash21(seed + 13.7)
        );

        pos = (pos - 0.5) * vec2(
            2.0 * (uResolution.x / uResolution.y),
            2.0
        );

        pos.y += sin(t * 0.7 + fi * 2.0) * 0.025;
        pos.x += cos(t * 0.5 + fi * 1.7) * 0.018;

        float dist = length(p - pos);

        float particle = exp(
            -dist * dist / (PARTICLE_SIZE * PARTICLE_SIZE)
        );

        float core = exp(-dist * dist / 0.000008);

        float variation = hash21(seed + 29.1);

        result += vec3(0.25, 0.85, 1.0)
                * particle * edge
                * (0.12 + peak * 3.0)
                * (0.5 + variation);

        result += vec3(0.65, 0.9, 1.0)
                * core * edge * peak * 2.0;
    }

    return result;
}

// ============================================================================
// FRAGMENT PRINCIPAL
// ============================================================================

void main() {

    vec2 p = (vUv - 0.5)
           * vec2(uResolution.x / uResolution.y, 1.0)
           * 2.0;

    float r = length(p);
    float ang = atan(p.y, p.x);

    float t = uTime;

    ang += t * ROTATION_SPEED;

    float a01 = fract(ang / TAU + 0.5);

    float kick = clamp(uKick, 0.0, 1.0);
    float voice = clamp(uVoice, 0.0, 1.0);
    float hihat = clamp(uHiHat, 0.0, 1.0);

    float kickPeak = clamp(uKickPeak, 0.0, 1.0);
    float voicePeak = clamp(uVoicePeak, 0.0, 1.0);
    float snarePeak = clamp(uSnarePeak, 0.0, 1.0);
    float hihatPeak = clamp(uHiHatPeak, 0.0, 1.0);

    float pixel = 1.0 / uResolution.y;

    vec3 col = vec3(0.0);

    // ------------------------------------------------------------------------
    // 1. FONDO
    // ------------------------------------------------------------------------

    float bgFall = 1.0 - smoothstep(0.0, 1.3, r);

    vec3 bg = mix(
        vec3(0.012, 0.008, 0.025),
        vec3(0.045, 0.025, 0.10),
        bgFall
    );

    bg *= 0.7 + 0.6 * uVolume + 0.15 * kick;

    col += bg;

    // ------------------------------------------------------------------------
    // 2. NÚCLEO RADIAL ORIGINAL
    // ------------------------------------------------------------------------

    float coreR = 0.09 + CORE_KICK_GAIN * kick;

    float coreGlow = exp(-max(r - coreR, 0.0) * 10.0);

    vec3 coreCol = palette(
        0.15 + 0.35 * hihat + t * 0.02 + voice * 0.1
    );

    col += coreCol * coreGlow * (0.5 + 2.0 * kick);

    // ------------------------------------------------------------------------
    // 3. BARRAS DE ESPECTRO — 4 CUADRANTES, 8 GRÁFICOS DINÁMICOS
    // ------------------------------------------------------------------------

    // El volumen determina el número de barras.
    // Volumen bajo: 8 barras.
    // Volumen alto: 32 barras.
    float volumeFactor = smoothstep(0.02, 0.45, clamp(uVolume, 0.0, 1.0));
    float dynamicBarCount = mix(SPECTRUM_MIN_BARS, SPECTRUM_MAX_BARS, volumeFactor);

    float quadrantAngle = fract(a01 * 4.0);

    float secondHalf = step(0.5, quadrantAngle);

    float halfAngle = fract(quadrantAngle * 2.0);

    // Índice dinámico de barra.
    float cell = min(
        floor(halfAngle * dynamicBarCount),
        dynamicBarCount - 1.0
    );

    // Invertimos el orden del segundo gráfico.
    float spectrumCell = mix(
        cell,
        dynamicBarCount - 1.0 - cell,
        secondHalf
    );

    // Muestreo del espectro.
    float fc = (spectrumCell + 0.5) / dynamicBarCount;
    float fx = pow(fc, SPECTRUM_FREQUENCY_POWER);

    float spec = texture2D(
        uSpectrum,
        vec2(fx, 0.5)
    ).r;

    spec = clamp(
        spec * (0.9 + 0.1 * sin(t * 4.0 + spectrumCell * 0.7)),
        0.0,
        1.0
    );

    // Separación entre barras.
    float dAng = abs(
        fract(halfAngle * dynamicBarCount) - 0.5
    ) * 2.0;

    float gapMask = 1.0 - smoothstep(0.60, 1.0, dAng);

    // Longitud radial.
    float baseR = 0.40 + 0.05 * kick;

    float barLen = spec * (
        SPECTRUM_MAX_LENGTH + 0.30 * kick + 0.20 * voice
    );

    float outerR = baseR + barLen;

    float radialMask =
        smoothstep(baseR - pixel, baseR + pixel, r) *
        (1.0 - smoothstep(outerR - pixel, outerR + pixel, r));

    float barMask = radialMask * gapMask * step(0.015, spec);

    vec3 barCol = palette(
        fc * 1.2 + 0.10 + t * 0.05 + hihat * 0.30
    );

    col += barCol * barMask
         * (0.5 + 1.8 * spec)
         * (0.8 + 0.5 * hihat);

    // ------------------------------------------------------------------------
    // 4. WAVEFORM — MISMA DISTRIBUCIÓN QUE LAS BARRAS
    // ------------------------------------------------------------------------

    float waveU = mix(
        halfAngle,
        1.0 - halfAngle,
        secondHalf
    );

    float wave = texture2D(
        uWaveform,
        vec2(waveU, 0.5)
    ).r * 2.0 - 1.0;

    float waveR = baseR - 0.07
                + wave * (0.05 + WAVEFORM_AMPLITUDE * kick);

    float wLine = 1.0 - smoothstep(
        0.0,
        0.008 + pixel * 1.5,
        abs(r - waveR)
    );

    col += mix(
        vec3(1.0),
        palette(0.5 + voice),
        0.35
    ) * wLine * (0.5 + 1.2 * voice + 0.5 * uVolume);

    // ------------------------------------------------------------------------
    // 5. EXPANSIÓN GEOMÉTRICA PERIFÉRICA
    // ------------------------------------------------------------------------

    float grid = holographicGrid(p, r, t);

    col += vec3(0.12, 0.25, 0.55) * grid * GRID_INTENSITY;

    col += kickSystem(p, r, kickPeak, t) * EDGE_INTENSITY;

    col += voiceSystem(p, r, voicePeak, t) * EDGE_INTENSITY;

    col += snareSystem(p, r, snarePeak, t) * EDGE_INTENSITY;

    col += hihatSystem(p, r, hihatPeak, t) * EDGE_INTENSITY;

    // ------------------------------------------------------------------------
    // 6. POSTPROCESADO
    // ------------------------------------------------------------------------

    col *= 1.0 - VIGNETTE_INTENSITY * smoothstep(0.45, 1.70, r);

    col += (hash21(vUv * uResolution + t) - 0.5) * GRAIN_INTENSITY;

    col = 1.0 - exp(-col * TONEMAP_EXPOSURE);

    col = pow(max(col, 0.0), vec3(1.0 / OUTPUT_GAMMA));

    gl_FragColor = vec4(col, 1.0);
}
