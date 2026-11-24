precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform vec2  uResolution;
uniform float uVolume;
uniform float uBass, uMid, uTreble;
uniform float uBeat, uMidBeat, uTrebleBeat;
uniform float uBassPeak, uMidPeak, uTreblePeak;
uniform float uKick, uSnare, uVoice, uHiHat;
uniform float uKickPeak, uSnarePeak, uVoicePeak, uHiHatPeak;
uniform sampler2D uSpectrum, uWaveform, uFFTHistory;
uniform float uFFTHistoryOffset;
uniform float uFlux, uCentroid;
uniform vec2  uMouse, uMouseDelta;
uniform float uMouseMiddle, uMouseRight, uMouseButton4, uMouseButton5;

// ================================ CONFIG ================================
#define PI 3.14159265359
#define TAU 6.28318530718

// --- Geometría de la placa ---
#define PLATE_R        0.88      // radio del plato (en espacio aspect-correcto)
#define PLATE_EDGE     0.028     // suavizado del borde
#define NODAL_THICK    0.085     // grosor de la "arena" sobre líneas nodales
#define RIM_WIDTH      0.045     // grosor del anillo del borde

// --- Sensibilidad al audio ---
#define KICK_SCALE     0.55      // expansión por kick
#define SNARE_SPIKE    1.70      // fuerza del destello/fragmentación por snare
#define VOICE_WARP     0.32      // deformación orgánica por voz
#define HIHAT_SPARK    2.30      // chispas/granos por hihat
#define FLUX_TURB      0.55      // turbulencia de alta frecuencia
#define BASS_GLOW      0.60      // brillo base del núcleo
#define BEAT_PULSE     0.45      // refuerzo de borde por uBeat

// --- Animación ---
#define SPIN_SPEED     0.18      // rotación global
#define MODE_SPEED     0.55      // fase de los modos Chladni
#define HIST_RIPPLE    0.55      // velocidad radial del ripple histórico
#define HIST_STRENGTH  0.55      // intensidad del ripple

// --- Granos / microdetalle ---
#define GRAIN_DENSITY  240.0
#define GRAIN_SIZE     0.055
#define GRAIN_BRIGHT   2.00

// --- Colores ---
#define COL_COOL    vec3(0.18, 0.55, 1.00)
#define COL_WARM    vec3(1.00, 0.42, 0.12)
#define COL_ACCENT  vec3(1.00, 0.18, 0.55)
#define COL_SAND    vec3(1.00, 0.94, 0.78)
#define COL_BG      vec3(0.015, 0.020, 0.040)

// ================================ HELPERS ================================
float hash(float n){ return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float specAt(float x){ return texture2D(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r; }
float waveAt(float x){ return texture2D(uWaveform, vec2(clamp(x, 0.0, 1.0), 0.5)).r; }

// Modo de Chladni simplificado (nodos radiales × nodos angulares)
float chladniMode(float r, float th, float n, float m, float ph){
    return sin(n * th + ph) * sin(m * PI * r);
}

// Gaussiana 1D segura (evita pow de base negativa)
float gauss(float x, float w){ float d = x / w; return exp(-d * d); }

// ================================ MAIN ================================
void main(){
    // --- 1. Coordenadas con corrección de aspect ratio ---
    vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;

    // desplazamiento por ratón (opcional, sutil, funciona sin interacción)
    p -= (uMouse - 0.5) * 0.05 * (0.25 + uMouseMiddle * 0.75);

    // deformación orgánica por voz (baja frecuencia)
    float vW = uVoice * VOICE_WARP;
    p += vec2(sin(p.y * 3.7 + uTime * 0.9), cos(p.x * 3.1 - uTime * 0.7)) * vW * 0.45;

    // kick expande la placa (más el beat residual)
    float kickAmt = uKick * KICK_SCALE + uKickPeak * 0.15;
    vec2 pp = p / (1.0 + kickAmt * 0.35);

    float r  = length(pp);
    float th = atan(pp.y, pp.x) + uTime * SPIN_SPEED;

    // waveform → desplazamiento angular (la forma de onda rompe la simetría)
    float wv = waveAt(fract(th / TAU + 0.5) + uTime * 0.02) - 0.5;
    th += wv * (0.10 + 0.15 * uMid);

    // --- 2. Espectro → números de modo (la geometría depende del espectro) ---
    float sBass = specAt(0.06);
    float sLow  = specAt(0.18);
    float sMid  = specAt(0.40);
    float sHigh = specAt(0.70);

    // n = simetría angular, m = nodos radiales
    float nA = 3.0 + floor(sBass * 3.0 + uBass * 2.0);
    float mA = 2.0 + floor(sLow  * 2.0 + uBass * 1.5);
    float nB = 5.0 + floor(sMid  * 3.0 + uMid  * 1.5);
    float mB = 3.0 + floor(sHigh * 3.0 + uTreble * 2.0);

    // --- 3. Snare fragmenta el ángulo y el radio (destello rítmico) ---
    float snareJ = uSnare * SNARE_SPIKE;
    th += snareJ * sin(r * 50.0 - uTime * 15.0) * 0.06;
    r  += snareJ * sin(th * 8.0 + uTime * 10.0) * 0.004;

    // --- 4. Turbulencia fina por flux (microdetalle vivo) ---
    th += uFlux * FLUX_TURB * sin(r * 12.0 + uTime * 2.0) * 0.02;

    // --- 5. Patrón Chladni combinado ---
    float phA = uTime * MODE_SPEED;
    float phB = uTime * MODE_SPEED * 1.37 + 1.1;
    float modeA = chladniMode(r, th, nA, mA, phA);
    float modeB = chladniMode(r, th, nB, mB, -phB);
    float wB    = clamp(0.30 + uMid * 0.50 + uTreble * 0.30, 0.0, 0.80);
    float pattern = mix(modeA, modeB, wB);

    // arena sobre líneas nodales (|pattern| ≈ 0)
    float nodal = 1.0 - smoothstep(0.0, NODAL_THICK, abs(pattern));

    // --- 6. Máscaras ---
    float plateMask = 1.0 - smoothstep(PLATE_R - PLATE_EDGE, PLATE_R + PLATE_EDGE, r);
    float rim       = gauss(r - PLATE_R, RIM_WIDTH);

    // --- 7. Paleta cromática (centroid + voz) ---
    vec3 baseCol  = mix(COL_COOL, COL_WARM, clamp(uCentroid * 1.3, 0.0, 1.0));
    baseCol       = mix(baseCol, COL_ACCENT, uVoice * 0.55);

    // --- 8. Composición ---
    vec3 col = COL_BG;

    // fondo suave (drift lento, respira con la música)
    float bg = 0.5 + 0.5 * sin(vUv.x * 3.0 + uTime * 0.05) * cos(vUv.y * 3.5 - uTime * 0.07);
    col += baseCol * bg * (0.012 + uVolume * 0.010);

    // núcleo interior del plato (respiración por bass)
    col += baseCol * plateMask * (0.06 + uBass * BASS_GLOW * 0.15 + uVolume * 0.04);

    // arena / líneas nodales (elemento principal reconocible)
    float sandBright = 0.65 + uBass * 0.60 + uSnare * 0.40;
    col += COL_SAND * nodal * plateMask * sandBright * 0.55;
    col += baseCol  * nodal * plateMask * 0.35;

    // --- 9. Ripple desde uFFTHistory (profundidad temporal) ---
    float histY = clamp(uFFTHistoryOffset + r * HIST_RIPPLE, 0.0, 1.0);
    float histX = clamp(fract(th / TAU + 0.5) * 0.92 + 0.04, 0.0, 1.0);
    float ripple = texture2D(uFFTHistory, vec2(histX, histY)).r;
    ripple = pow(max(ripple, 0.0), 1.4);
    col += baseCol * ripple * HIST_STRENGTH * plateMask * (0.35 + nodal * 0.65);

    // --- 10. Granos de arena (hihat + treble, saltan de las líneas nodales) ---
    vec2 gUV = pp * GRAIN_DENSITY * (1.0 + uTime * 0.02);
    vec2 gI  = floor(gUV);
    vec2 gF  = fract(gUV) - 0.5;
    float gh1 = hash2(gI);
    float gh2 = hash2(gI + 31.7);
    vec2 jitter = (vec2(gh1, gh2) - 0.5) * 0.55;
    float gd = length(gF - jitter);
    float grainMask = (1.0 - smoothstep(0.0, GRAIN_SIZE, gd)) * step(0.55, gh1);
    float grainEnergy = (0.35 + nodal * 1.20) * (0.30 + uHiHat * HIHAT_SPARK + uTreble * 0.5);
    col += COL_SAND * grainMask * grainEnergy * plateMask * GRAIN_BRIGHT * 0.40;

    // chispas extra por hihat cerca del borde
    float sparkR = 1.0 - smoothstep(0.0, 0.14, abs(r - PLATE_R + 0.08 * sin(th * 20.0 + uTime * 8.0)));
    col += COL_SAND * sparkR * uHiHat * 1.2 * plateMask;

    // --- 11. Borde brillante (rim) ---
    col += baseCol * rim * (0.60 + uBassPeak * 0.80 + uBeat * BEAT_PULSE);

    // --- 12. Corona espectral fuera de la placa (frecuencia ≈ ángulo) ---
    float outside   = smoothstep(PLATE_R, PLATE_R + 0.15, r);
    float freqAngle = clamp(fract(th / TAU + 0.5), 0.0, 1.0);
    float specOut   = texture2D(uSpectrum, vec2(freqAngle, 0.5)).r;
    float corona    = exp(-(r - PLATE_R) * 5.5) * specOut * outside;
    col += baseCol * corona * (0.9 + uFlux * 0.8) * 0.9;

    // --- 13. Anillo interior por snare (fragmentación breve) ---
    float snareRing = uSnare * SNARE_SPIKE * gauss(r - PLATE_R * 0.55, 0.075);
    col += COL_ACCENT * snareRing * 0.55;

    // --- 14. Tonemap suave + viñeteado (evita saturación en picos) ---
    col = 1.0 - exp(-col * 1.4);
    float vig = length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0);
    col *= 1.0 - 0.25 * smoothstep(0.7, 1.5, vig);

    gl_FragColor = vec4(col, 1.0);
}