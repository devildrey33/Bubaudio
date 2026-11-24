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
// Los peaks van de 0 a 1
uniform float uKickPeak;
uniform float uSnarePeak;
uniform float uVoicePeak;
uniform float uHiHatPeak;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

uniform sampler2D uFFTHistory;
//uniform float uFFTHistoryOffset;


//==========================================================
// CONFIG
//==========================================================

#define WAVE_HEIGHT         0.5
#define WAVE_WIDTH          0.016
#define WAVE_GLOW_SIZE      2.0
#define WAVE_GLOW_INTENSITY 0.03
#define WAVE_INTENSITY      8.0

#define NETWORK_SCALE       9.0
#define NETWORK_REACTION    2.0

#define BG_DISTORTION       0.015

#define SPARKS_INTENSITY    0.6

#define CELL_SMALL_SIZE     0.07
#define CELL_MEDIUM_SIZE    0.11
#define CELL_LARGE_SIZE     0.17


float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}

float spectrum(float x) {
    return texture2D(uSpectrum, vec2(clamp(x,0.0,1.0),0.0)).r;
}

float spectrumHistory(float x, float y) {
    return texture2D(
        uFFTHistory,
        vec2(clamp(x, 0.0, 1.0), clamp(y, 0.0, 1.0))
    ).r;
}

float spectrumTrend(float x) {
    float current = spectrumHistory(x, 0.0);
    float old = spectrumHistory(x, 0.75);
    return current - old;
}

mat2 rotate(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c,-s,s,c);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0,0.0));
    float c = hash(i + vec2(0.0,1.0));
    float d = hash(i + vec2(1.0,1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(a,b,u.x),
        mix(c,d,u.x),
        u.y
    );
}

float fbm(vec2 p) {

    float v = 0.0;
    float a = 0.5;

    for(int i = 0; i < 5; i++) {
        v += noise(p) * a;
        p *= 2.0;
        a *= 0.5;
    }

    return v;
}

vec2 getNode(vec2 cell) {

    float rnd = hash(cell);

    return cell + vec2(
        sin(uTime * 0.40 + rnd * 6.283185),
        cos(uTime * 0.60 + rnd * 6.283185)
    ) * 0.35;
}

void main() {

    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;

    p.x *= uResolution.x / uResolution.y;

    float waveform = 0.0;

    waveform += texture2D(uWaveform, vec2(uv.x - 0.004, 0.0)).r;
    waveform += texture2D(uWaveform, vec2(uv.x - 0.002, 0.0)).r;
    waveform += texture2D(uWaveform, vec2(uv.x,          0.0)).r;
    waveform += texture2D(uWaveform, vec2(uv.x + 0.002, 0.0)).r;
    waveform += texture2D(uWaveform, vec2(uv.x + 0.004, 0.0)).r;

    waveform *= 0.2;

    p *= rotate(uTime * 0.02 + uTreble * 0.04);
    float networkMemory = spectrumHistory(0.5, 0.5);

    p += vec2(sin(uTime * 0.3 + p.y * 2.0), cos(uTime * 0.3 + p.x * 2.0)) * networkMemory * 0.10;

    p += vec2(sin(uTime + p.y * 3.0), cos(uTime + p.x * 3.0)) * waveform * BG_DISTORTION;

    float networkScale = NETWORK_SCALE + uKick * NETWORK_REACTION + uKickPeak * 1.5;

    vec2 gridPos = p * networkScale;
    vec2 id = floor(gridPos);
    vec2 gv = fract(gridPos) - 0.5;

    float membranes = 0.0;

    float smallCells = 0.0;
    float mediumCells = 0.0;
    float largeCells = 0.0;

    float smallNuclei = 0.0;
    float mediumNuclei = 0.0;
    float largeNuclei = 0.0;

    float lowEnergy = (spectrum(0.04) + spectrum(0.08) + spectrum(0.12)) * 0.333;
    float midEnergy = (spectrum(0.30) + spectrum(0.40) + spectrum(0.50)) * 0.333;
    float highEnergy = (spectrum(0.75) + spectrum(0.85) + spectrum(0.95)) * 0.333;
    float bassTrend = (spectrumTrend(0.08) + spectrumTrend(0.12)) * 0.5;
    float midTrend = (spectrumTrend(0.35) + spectrumTrend(0.45)) * 0.5;
    float trebleTrend = (spectrumTrend(0.80) + spectrumTrend(0.95)) * 0.5;

    float subBass = (spectrum(0.01) + spectrum(0.02) + spectrum(0.03)) * 0.333;

    float bassCells = 0.0;
    float midCells = 0.0;
    float trebleCells = 0.0;
    float ghostNuclei = 0.0;

    for(int y = -1; y <= 1; y++) {
        for(int x = -1; x <= 1; x++) {

            vec2 offset = vec2(float(x), float(y));

            vec2 node = getNode(id + offset);

            vec2 local = node - (id + gv);

            float seed = hash(id + offset) * 20.0;
            // Cada neurona escucha una zona distinta del espectro
            float freqPos = fract(seed * 0.073);
            vec3 neuronFreqColor = mix(vec3(0.10,0.30,1.00), vec3(1.00,0.20,0.60), freqPos);
            float freqEnergy = spectrum(freqPos);

            float h0 = spectrumHistory(freqPos, 0.00);
            float h1 = spectrumHistory(freqPos, 0.12);
            float h2 = spectrumHistory(freqPos, 0.24);
            float h3 = spectrumHistory(freqPos, 0.36);
            float h4 = spectrumHistory(freqPos, 0.48);
            float h5 = spectrumHistory(freqPos, 0.60);
            float h6 = spectrumHistory(freqPos, 0.72);
            float h7 = spectrumHistory(freqPos, 0.84);

            float neuronMemory = (h0 + h1 + h2 + h3 + h4 + h5 + h6 + h7) * 0.125;
            
//            float neuronActivity = smoothstep(0.25, 0.55, neuronMemory);
            float brainRegion = fbm((id + vec2(13.0, 7.0)) * 0.22 + uTime * 0.03);
            float regionMask = spectrumHistory(fract(id.x * 0.13 + id.y * 0.17), 0.50);
            float neuronActivity = smoothstep(0.25, 0.55, regionMask);
            neuronActivity *= smoothstep(0.35, 0.65, brainRegion);

            float freqGrowth = max(h0 - h4, 0.0);

            float sizeRnd = hash(id + offset + vec2(17.0));

            float angle = atan(local.y, local.x);

            float radius = length(local);

            float breathing = sin(uTime * (1.0 + neuronMemory * 6.0) + seed) * 0.02 + freqGrowth * 0.08;

            float wobble = sin(angle * 5.0 + seed + uTime * 0.5) * 0.03 + sin(angle * 9.0 - seed * 2.0) * 0.02;

            float dendrites = smoothstep(0.7, 1.0, sin(angle * (18.0 + neuronMemory * 25.0) + seed));
            float baseRadius;

            if(sizeRnd < 0.33) {
                baseRadius = CELL_SMALL_SIZE;
            }
            else if(sizeRnd < 0.66) {
                baseRadius = CELL_MEDIUM_SIZE;
            }
            else {
                baseRadius = CELL_LARGE_SIZE;
            }

            float nucleus = (1.0 - smoothstep(0.0, baseRadius * 0.45, radius)) * neuronActivity;
            float neuronGhost = h4 * 0.35 + h5 * 0.25 + h6 * 0.20 + h7 * 0.20;
            ghostNuclei += nucleus * neuronGhost * neuronActivity;

            float cellRadius = baseRadius * (1.0 + neuronGhost * 0.5) + wobble + breathing;
            float membrane = (1.0 - smoothstep(cellRadius, cellRadius + 0.025, radius)) * neuronActivity;

            membrane += dendrites * smoothstep(cellRadius, cellRadius + 0.05, radius) * 0.4;
            membrane *= 0.35;


            float pulse = sin(uTime * (2.0 + neuronMemory * 8.0) + seed) * 0.5 + 0.5;
            pulse *= 0.25 + neuronMemory;

            if(sizeRnd < 0.33) {
                smallCells += membrane;
                smallNuclei += nucleus * pulse;
            }
            else if(sizeRnd < 0.66) {
                mediumCells += membrane;
                mediumNuclei += nucleus * pulse;
            }
            else {
                largeCells += membrane;
                largeNuclei += nucleus * pulse;
            }

            membranes += membrane;
            bassCells   += membrane * spectrum(0.10);
            midCells    += membrane * spectrum(0.40);
            trebleCells += membrane * spectrum(0.85);
        }
    }

    float sceneRadius = length(p);

    float core = exp(-sceneRadius * 12.0);

    core *= 0.8 + subBass * 5.0 + uKickPeak * 1.5;
    core += uKickPeak * 0.4;

    float activity = max(sin(uTime * (8.0 + uVoice * 15.0 + uHiHat * 10.0) - membranes * 20.0), 0.0);

    float sparks = pow(max(0.0, fbm(p * 30.0 + uTime * 3.0)), 24.0);

    sparks *= SPARKS_INTENSITY * (0.05 + highEnergy * 1.5 + max(trebleTrend, 0.0) * 6.0);

    float synapseHistory = (
        spectrumHistory(0.10,0.20) +
        spectrumHistory(0.25,0.30) +
        spectrumHistory(0.40,0.40) +
        spectrumHistory(0.55,0.50) +
        spectrumHistory(0.70,0.60) +
        spectrumHistory(0.85,0.70)
    ) * 0.166;

    float synapse = pow(max(0.0, fbm(p * 16.0 + uTime * 0.4 + midEnergy * 8.0)), 6.0);
    synapse *= 1.0 + max(midTrend, 0.0) * 2.0;

    float neuralBurst = max(bassTrend,0.0) + max(midTrend,0.0) + max(trebleTrend,0.0);

    float snareFlash = pow(uSnarePeak, 2.5);

    vec3 col = vec3(0.005, 0.010, 0.030);
    col += vec3(0.4, 0.9, 1.0) * neuralBurst * membranes * 0.6;

    // Graves
    col += vec3(0.05,0.30,1.00) * bassCells * (0.2 + lowEnergy * 3.0);

    // Medios
    col += vec3(0.65,0.20,1.00) * midCells * (0.2 + midEnergy * 3.0);

    // Agudos
    col += vec3(1.00,0.25,0.65) * trebleCells * (0.2 + highEnergy * 3.0);

    // Núcleos
    col += vec3(0.45,0.70,1.00) * smallNuclei;
    col += vec3(0.80,0.60,1.00) * mediumNuclei;
    col += vec3(1.00,0.75,0.90) * largeNuclei;
    // Memoria histórica
    //col += vec3(.10,0.60,1.00) * ghostNuclei * 0.02;

    // synapse
    col += vec3(0.35,0.80,1.00) * synapse * uVoicePeak * 0.6;
    // flash de la caja
    col += vec3(0.3,0.7,1.0) * snareFlash * membranes * 0.35;

    // Actividad neuronal
    col += vec3(0.5,0.7,1.0) * activity *  0.15;

    // Beat
    col += vec3(0.3,0.9,1.0) * uKickPeak * membranes * 0.75;

    // Núcleo central
    col += vec3(0.15,0.75,1.0) * core * 0.75;
    
    // Actividad espectral global
    col += vec3(0.10,0.35,1.00) * lowEnergy  * 0.8;
    col += vec3(0.60,0.20,1.00) * midEnergy  * 0.6;
    col += vec3(1.00,0.30,0.60) * highEnergy * 0.5;

    // Chispas
    col += vec3(1.0) * sparks;

    ///======================================================
    // WAVEFORM
    //======================================================

    float centeredWave = (waveform - 0.5) * WAVE_HEIGHT + 0.2;

    float waveInner = 1.0 - smoothstep(0.0, WAVE_WIDTH, abs(uv.y - centeredWave));
    float waveOuter = 1.0 - smoothstep(0.0, WAVE_WIDTH * 2.5, abs(uv.y - centeredWave));
    float waveGlow  = 1.0 - smoothstep(0.0, WAVE_WIDTH * WAVE_GLOW_SIZE, abs(uv.y - centeredWave));

    float waveOutline = max(0.0, waveOuter - waveInner);

    float waveR = 1.0 - smoothstep(0.0, WAVE_WIDTH, abs(uv.y - (centeredWave + 0.0035)));
    float waveG = waveInner;
    float waveB = 1.0 - smoothstep(0.0, WAVE_WIDTH, abs(uv.y - (centeredWave - 0.0035)));

    // Borde negro para destacar sobre fondos brillantes
    col = mix(col, vec3(0.0), waveOutline * 0.85);

    // Glow principal
    col += vec3(0.0, 1.0, 1.0) * waveGlow * 0.20;

    // Línea principal
    vec3 waveColor = vec3(1.0, 1.0, 1.0);
    col = mix(col, waveColor, clamp(waveInner * 2.0, 0.0, 1.0));

    // Aberración cromática sutil
//    col += vec3(waveR * 0.25, 0.0, waveB * 0.25);

    // Realce con bombos
    col += vec3(0.0, 0.6, 0.0) * waveInner * uKickPeak;

    vec2 edge = abs(uv - 0.5) * 2.0;

    float memory = spectrumHistory(fract(length(p) * 0.4), 0.85);
    col += vec3(0.15, 0.25, 0.5) * memory * 0.25;    


    float vignetteX = 1.0 - smoothstep(0.65, 1.0, edge.x);
    float vignetteY = 1.0 - smoothstep(0.65, 1.0, edge.y);

    float vignette = vignetteX * vignetteY;

    col *= vignette;

    gl_FragColor = vec4(col, 1.0);
}