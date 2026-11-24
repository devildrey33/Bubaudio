/*
 BUBAUDIO — RESONANCE LOOM

 Concepto: un diafragma acústico suspendido, como una cámara de resonancia viva.
 Sus costillas concéntricas y filamentos radiales convierten la música en una
 estructura legible: el kick dilata la cámara, el snare rompe y desplaza sus
 costillas, la voz deforma orgánicamente el diafragma y el hi-hat enciende
 partículas microscópicas en el borde. El espectro decide la geometría radial;
 la waveform modula la membrana; FFTHistory dibuja la memoria temporal como
 filamentos verticales: X = graves -> agudos, Y = historia, arriba = reciente.
 Flux y centroid gobiernan respectivamente la tensión de los filamentos y el
 desplazamiento cromático. La interacción del ratón inclina suavemente la
 cámara, pero nunca es necesaria.
*/

#ifdef GL_ES
precision highp float;
#endif

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform float uVolume;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;
uniform float uBassPeak;
uniform float uMidPeak;
uniform float uTreblePeak;
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
uniform sampler2D uFFTHistory;
uniform float uFFTHistoryOffset;
uniform float uFlux;
uniform float uCentroid;
uniform vec2 uMouse;
uniform vec2 uMouseDelta;
uniform float uMouseMiddle;
uniform float uMouseRight;
uniform float uMouseButton4;
uniform float uMouseButton5;

/* Intensities */
#define I_CORE       1.15
#define I_RIB        1.35
#define I_FILAMENT   1.05
#define I_PARTICLE   1.20
#define I_HISTORY    1.00
#define I_GLOW       0.72
/* Velocities */
#define V_ROTATE     0.075
#define V_HISTORY    0.018
#define V_WAVE       1.90
#define V_DRIFT      0.31
/* Scales */
#define S_CORE       0.205
#define S_RIB        0.355
#define S_HISTORY    0.72
#define S_DETAIL     34.0
#define S_PARTICLES  46.0
/* Brightness */
#define B_CORE       1.12
#define B_RIB        0.82
#define B_FILAMENT   0.62
#define B_PARTICLE   0.78
#define B_MAX        1.55
/* Audio sensitivity */
#define A_KICK       1.35
#define A_SNARE      1.10
#define A_VOICE      1.00
#define A_HIHAT      1.25
#define A_FLUX       1.20
#define A_CENTROID   0.90
#define A_HISTORY    1.35
/* Main colors */
#define COL_DEEP     vec3(0.008, 0.012, 0.030)
#define COL_CYAN     vec3(0.055, 0.72, 0.92)
#define COL_VIOLET   vec3(0.40, 0.16, 0.95)
#define COL_CORAL    vec3(1.00, 0.23, 0.22)
#define COL_GOLD     vec3(1.00, 0.70, 0.20)

#define PI 3.14159265359
#define TAU 6.28318530718

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec2 sat(vec2 x) { return clamp(x, 0.0, 1.0); }
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise21(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float sdRing(float r, float radius, float width) { return 1.0 - smoothstep(width, width * 0.18, abs(r - radius)); }
float lineGlow(float d, float width) { return 1.0 - smoothstep(width, width * 0.16, abs(d)); }
vec3 palette(float t) {
    t = fract(t);
    vec3 a = mix(COL_CYAN, COL_VIOLET, smoothstep(0.05, 0.55, t));
    return mix(a, COL_CORAL, smoothstep(0.55, 0.86, t));
}
float spectrum(float x) {
    x = clamp(x, 0.002, 0.998);
    return texture2D(uSpectrum, vec2(x, 0.5)).r;
}
float waveform(float x) {
    return texture2D(uWaveform, vec2(fract(x), 0.5)).r * 2.0 - 1.0;
}
float history(float x, float y) {
    /* y=1 is recent; offset permits a scrolling history texture. */
    return texture2D(uFFTHistory, vec2(clamp(x, 0.002, 0.998), fract(y + uFFTHistoryOffset))).r;
}

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
    vec2 mouse = (uMouse - 0.5) * vec2(0.16, 0.10);
    float energy = sat(0.48 * uVolume + 0.32 * uBass + 0.20 * uMid);
    float kick = sat(A_KICK * max(uKick, uKickPeak));
    float snare = sat(A_SNARE * max(uSnare, uSnarePeak));
    float voice = sat(A_VOICE * max(uVoice, uVoicePeak));
    float hat = sat(A_HIHAT * max(uHiHat, uHiHatPeak));
    float flux = sat(A_FLUX * uFlux);
    float centroidVal = sat(A_CENTROID * uCentroid);
    float beat = sat(max(uBeat, uMidBeat));

    /* Camera tilt and slow musical rotation. */
    p -= mouse * 0.18;
    float t = uTime * V_ROTATE + uBassPeak * 0.035;
    float cs = cos(t), sn = sin(t);
    p = mat2(cs, -sn, sn, cs) * p;
    float r = length(p), ang = atan(p.y, p.x);
    float a01 = fract(ang / TAU + 0.5);
    float dir = sin(ang * 8.0 + uTime * 0.8);
    vec3 col = COL_DEEP * (0.56 + 0.14 * noise21(p * 8.0 + uTime * 0.03));

    /* The central acoustic diaphragm: a calm anchor that remains legible. */
    float membrane = exp(-18.0 * r * r);
    float membranePulse = 1.0 + kick * 0.42 + voice * 0.18 * sin(uTime * 2.0);
    vec3 coreColor = mix(COL_CYAN, COL_GOLD, centroidVal * 0.72 + uTreble * 0.18);
    col += coreColor * membrane * B_CORE * membranePulse * I_CORE;
    col += COL_VIOLET * exp(-38.0 * abs(r - S_CORE * (1.0 + kick * 0.20))) * 0.72;

    /* Concentric ribs: bass controls radius, spectrum controls their local shape. */
    float ribs = 0.0;
    for (int i = 1; i <= 6; i++) {
        float fi = float(i) / 6.0;
        float sp = spectrum(fi * 0.36 + 0.015);
        float wave = waveform(fi * 0.17 + uTime * 0.012) * 0.5;
        float radius = S_CORE + fi * S_RIB + kick * fi * 0.030 + sp * 0.050 * sin(ang * 3.0 + fi * 7.0);
        radius += wave * 0.020 * (0.4 + voice);
        ribs += sdRing(r, radius, 0.0035 + sp * 0.006 + snare * 0.002) * (0.38 + sp * 0.90);
    }
    col += mix(COL_CYAN, COL_VIOLET, centroidVal) * ribs * B_RIB * I_RIB;

    /* Radial ribs / spokes: a recognizable instrument-like scaffold. */
    float spokeCount = 18.0 + floor(uMid * 8.0);
    float spokePhase = a01 * spokeCount + snare * 0.22 * sin(a01 * 47.0);
    float spokeCell = abs(fract(spokePhase) - 0.5) * 2.0;
    float spoke = 1.0 - smoothstep(0.18, 0.035, spokeCell);
    float spokeData = spectrum(fract(a01 + 0.03));
    float spokeEnd = 0.34 + spokeData * 0.22 + kick * 0.13;
    float spokeBand = smoothstep(spokeEnd, spokeEnd - 0.10, r) * smoothstep(0.13, 0.18, r);
    float spokeBreak = 0.72 + 0.28 * sin(a01 * 91.0 + uTime * (3.0 + flux * 8.0));
    col += mix(COL_VIOLET, COL_CORAL, centroidVal) * spoke * spokeBand * spokeBreak * (B_RIB + snare * 0.55);

    /* FFTHistory becomes a memory field behind the current diaphragm. */
    float hist = 0.0;
    for (int j = 0; j < 4; j++) {
        float fy = 0.18 + float(j) * 0.19;
        float h = history(a01, fy);
        float historyArc = exp(-34.0 * abs(r - (0.49 + float(j) * 0.065 + h * 0.050)));
        hist += historyArc * h * (1.0 - float(j) * 0.16);
    }
    float recent = history(a01, 0.96);
    col += mix(COL_VIOLET, COL_CORAL, a01 * 0.8 + centroidVal * 0.4) * hist * I_HISTORY * B_FILAMENT;

    /* Voice bends the filaments; their amplitude is read from current spectrum. */
    float bend = voice * 0.055 * sin(ang * 5.0 + uTime * V_WAVE + waveform(a01 + uTime * 0.025) * 2.0);
    float filamentRadius = 0.57 + bend + spokeData * 0.11 + recent * 0.06;
    float filament = exp(-120.0 * abs(r - filamentRadius));
    filament *= 0.45 + 0.55 * sin(a01 * 118.0 + uTime * (1.0 + flux * 4.0));
    col += palette(a01 + uTime * 0.008 + centroidVal * 0.4) * filament * I_FILAMENT * B_FILAMENT;

    /* Hi-hat microdetail: deterministic sparks on the outer listening rim. */
    vec2 grid = floor(vec2(a01 * S_PARTICLES, r * 31.0));
    float rnd = hash21(grid);
    float spark = step(0.84, rnd) * smoothstep(0.45, 0.76, r);
    float sparkPulse = sin(uTime * (8.0 + rnd * 9.0) + rnd * TAU) * 0.5 + 0.5;
    spark *= smoothstep(0.48, 0.78, hat * 0.72 + sparkPulse * 0.28);
    col += mix(COL_GOLD, COL_CYAN, rnd) * spark * B_PARTICLE * I_PARTICLE * (0.35 + hat * 1.4);

    /* Snare fragments: short, offset cuts across the outer rim. */
    float fragments = pow(max(0.0, sin(a01 * 37.0 + uTime * (6.0 + flux * 10.0))), 18.0);
    fragments *= exp(-70.0 * abs(r - (0.70 + snare * 0.04)));
    col += COL_CORAL * fragments * snare * (0.65 + flux) * A_SNARE;

    /* Quiet passages retain a faint material grain; peaks are compressed, not white. */
    float grain = (noise21(p * 52.0 + uTime * 0.2) - 0.5) * 0.035 * (0.25 + energy);
    col += grain * vec3(0.25, 0.40, 0.58);
    col *= 0.84 + 0.16 * smoothstep(1.05, 0.0, r);
    col = min(col, vec3(B_MAX));
    col = 1.0 - exp(-col * (1.12 + energy * 0.30));
    col = pow(max(col, 0.0), vec3(0.92));
    gl_FragColor = vec4(col, 1.0);
}
