precision highp float;

/*
================================================================
 BUBAUDIO — RESONANCE ENGINE
================================================================

CONCEPTO VISUAL:
Una máquina musical cinética suspendida en un espacio oscuro.
Su núcleo es un mecanismo de resonancia formado por anillos,
dientes mecánicos y filamentos luminosos que orbitan alrededor
de un eje central.

El anillo exterior representa la memoria musical: un espectrograma
circular donde las frecuencias graves ocupan una zona y las agudas
otra, mientras que el radio representa el paso del tiempo.

REACTIVIDAD MUSICAL:
- KICK: expande el mecanismo, desplaza sus engranajes y pulsa el núcleo.
- SNARE: fragmenta los anillos y provoca destellos mecánicos.
- VOICE: deforma los filamentos y modifica la evolución cromática.
- HIHAT: genera partículas, pequeñas chispas y microdetalles.

DATOS DE AUDIO:
- SPECTRUM: determina la geometría de los dientes y estructuras radiales.
- WAVEFORM: deforma los filamentos interiores mediante la señal real.
- FFTHISTORY: construye el anillo histórico de frecuencias y memoria temporal.

OBJETIVO:
Una escultura cinética que interpreta la música como un mecanismo
vivo, no como un simple ecualizador circular.
================================================================
*/

// ================================================================
// 1. CONFIGURACIÓN
// ================================================================

// Intensidades generales
#define MASTER_INTENSITY 1.15
#define AUDIO_SENSITIVITY 1.0
#define KICK_INTENSITY 1.35
#define SNARE_INTENSITY 1.15
#define VOICE_INTENSITY 1.0
#define HIHAT_INTENSITY 1.25

// Velocidades
#define ROTATION_SPEED 0.12
#define HISTORY_SPEED 0.025
#define FILAMENT_SPEED 0.35
#define PARTICLE_SPEED 0.8

// Escalas
#define CORE_SCALE 1.0
#define GEAR_SCALE 1.0
#define HISTORY_SCALE 1.0
#define DETAIL_SCALE 1.0

// Brillos
#define CORE_GLOW 1.5
#define RING_GLOW 1.25
#define HISTORY_GLOW 1.0
#define SPARK_GLOW 1.4

// Colores principales
#define COLOR_CYAN vec3(0.08, 0.85, 1.0)
#define COLOR_BLUE vec3(0.12, 0.32, 1.0)
#define COLOR_PURPLE vec3(0.65, 0.20, 1.0)
#define COLOR_PINK vec3(1.0, 0.16, 0.55)
#define COLOR_GOLD vec3(1.0, 0.66, 0.22)

// Geometría
#define PI 3.14159265359
#define TAU 6.28318530718
#define HISTORY_INNER 0.51
#define HISTORY_OUTER 0.94
#define GEAR_RADIUS 0.31
#define CORE_RADIUS 0.17

// ================================================================
// 2. UNIFORMS
// ================================================================

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

// ================================================================
// 3. FUNCIONES AUXILIARES
// ================================================================

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

vec2 rotate2D(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c) * p;
}

vec3 palette(float t) {
    vec3 c = mix(COLOR_BLUE, COLOR_CYAN, smoothstep(0.0, 0.35, t));
    c = mix(c, COLOR_PURPLE, smoothstep(0.35, 0.65, t));
    c = mix(c, COLOR_PINK, smoothstep(0.65, 0.9, t));
    return c;
}

float line(float d, float thickness, float aa) {
    return 1.0 - smoothstep(thickness, thickness + aa, abs(d));
}

float circle(float d, float thickness, float aa) {
    return line(d, thickness, aa);
}

// ================================================================
// 4. LECTURA DE AUDIO
// ================================================================

// Lectura espectral horizontal.
float spectrum(float x) {
    return texture2D(uSpectrum, vec2(fract(x), 0.5)).r;
}

// Lectura de waveform.
// La señal se encuentra normalizada entre 0 y 1.
float waveform(float x) {
    return texture2D(uWaveform, vec2(fract(x), 0.5)).r * 2.0 - 1.0;
}

// Lectura del espectrograma histórico.
// La parte superior representa las muestras recientes.
float history(float frequency, float age) {
    float y = 1.0 - age + uFFTHistoryOffset;
    return texture2D(
        uFFTHistory,
        vec2(clamp(frequency, 0.001, 0.999), clamp(y, 0.001, 0.999))
    ).r;
}

// ================================================================
// 5. NÚCLEO MUSICAL
// ================================================================

vec3 renderCore(vec2 p, float r, float angle, float aa) {

    vec3 col = vec3(0.0);

    float kick = saturate(uKick * AUDIO_SENSITIVITY);
    float kickPeak = saturate(uKickPeak);
    float voice = saturate(uVoice);
    float snare = saturate(uSnare);
    float mid = saturate(uMid);

    float pulse = kick * KICK_INTENSITY + kickPeak * 0.22;

    // Oscilación orgánica del núcleo.
    float organic = sin(angle * 5.0 + uTime * 1.7);
    organic += sin(angle * 9.0 - uTime * 1.1) * 0.35;

    float coreR = CORE_RADIUS * CORE_SCALE;
    coreR *= 1.0 + pulse * 0.13;
    coreR += organic * 0.008 * (0.2 + voice * VOICE_INTENSITY);

    // Superficie exterior.
    float core = circle(r - coreR, 0.008, aa);
    col += COLOR_CYAN * core * CORE_GLOW;

    // Núcleo interior.
    float inner = 1.0 - smoothstep(
        coreR * 0.30,
        coreR * 0.95,
        r
    );

    vec3 coreColor = mix(COLOR_BLUE, COLOR_PURPLE, voice * 0.7);
    coreColor = mix(coreColor, COLOR_PINK, snare * 0.4);

    col += coreColor * inner * (0.35 + uVolume * 0.3);

    // Anillo de energía.
    float energyRing = circle(
        r - coreR * 1.23,
        0.003 + pulse * 0.006,
        aa
    );

    col += COLOR_GOLD * energyRing * (0.35 + pulse);

    // Espiral interna de filamentos.
    float spiralAngle = angle + r * 16.0 - uTime * 0.65;
    float spiral = sin(spiralAngle * 3.0 + organic);

    float filament = line(
        spiral,
        0.035,
        0.012
    );

    filament *= smoothstep(coreR * 0.25, coreR * 0.8, r);
    filament *= 1.0 - smoothstep(coreR * 0.8, coreR * 1.05, r);

    col += COLOR_PURPLE * filament * (0.2 + voice * 0.8);

    // Oscilación adicional mediante waveform.
    float wave = waveform(angle / TAU + uTime * 0.025);

    float waveRadius = coreR * 0.67;
    waveRadius += wave * 0.025 * (0.25 + voice * VOICE_INTENSITY);

    float waveLine = circle(r - waveRadius, 0.0025, aa);

    col += COLOR_CYAN * waveLine * 0.9;

    return col;
}

// ================================================================
// 6. ENGRANAJE ESPECTRAL
// ================================================================

vec3 renderGear(vec2 p, float r, float angle, float aa) {

    vec3 col = vec3(0.0);

    float kick = saturate(uKick);
    float snare = saturate(uSnare);
    float midBeat = saturate(uMidBeat);

    // 48 segmentos mecánicos.
    float segments = 48.0;
    float sector = fract(angle / TAU * segments);
    float localAngle = abs(sector - 0.5);

    // Cada diente representa una frecuencia.
    float frequency = fract(angle / TAU + 0.5);
    float fft = spectrum(frequency);

    float bass = spectrum(frequency * 0.35);
    float high = spectrum(0.65 + frequency * 0.34);

    float spectralEnergy = fft * 0.75 + bass * 0.15 + high * 0.1;

    float tooth = mix(0.025, 0.105, spectralEnergy);
    tooth += kick * 0.045;

    float gearExpansion = kick * 0.055;
    gearExpansion += uBassPeak * 0.025;

    float baseRadius = GEAR_RADIUS * GEAR_SCALE;
    baseRadius *= 1.0 + gearExpansion;

    // Movimiento angular del mecanismo.
    float rotation = uTime * ROTATION_SPEED;
    float mechanicalAngle = angle + rotation;

    // Geometría de los dientes.
    float toothMask = 1.0 - smoothstep(0.13, 0.25, localAngle);

    float outerRadius = baseRadius + tooth * toothMask;
    float innerRadius = baseRadius - 0.035;

    float toothBody = smoothstep(innerRadius - aa, innerRadius + aa, r);
    toothBody *= 1.0 - smoothstep(outerRadius - aa, outerRadius + aa, r);

    // Fragmentación rítmica del snare.
    float fracture = sin(mechanicalAngle * 48.0 + uTime * 9.0);
    float fractureMask = smoothstep(-0.35, 0.75, fracture * snare);

    toothBody *= 1.0 - fractureMask * snare * 0.35;

    vec3 gearColor = mix(COLOR_BLUE, COLOR_CYAN, spectralEnergy);
    gearColor = mix(gearColor, COLOR_GOLD, kick * 0.25);

    col += gearColor * toothBody * (0.7 + spectralEnergy);

    // Borde exterior metálico.
    float outerEdge = circle(r - outerRadius, 0.0025, aa);
    col += COLOR_CYAN * outerEdge * RING_GLOW;

    // Borde interior.
    float innerEdge = circle(r - innerRadius, 0.002, aa);
    col += COLOR_PURPLE * innerEdge * 0.8;

    // Segmentos radiales interiores.
    float spokeAngle = fract(angle / TAU * 24.0 + rotation * 0.5);
    float spokes = 1.0 - smoothstep(0.035, 0.09, abs(spokeAngle - 0.5));

    float spokeBody = smoothstep(0.17, 0.19, r);
    spokeBody *= 1.0 - smoothstep(innerRadius - 0.005, innerRadius + 0.005, r);

    col += COLOR_BLUE * spokes * spokeBody * (0.25 + spectralEnergy);

    // Destellos de snare en los dientes.
    float flash = pow(max(0.0, sin(angle * segments + uTime * 7.0)), 12.0);
    col += COLOR_GOLD * flash * toothBody * snare * SNARE_INTENSITY;

    // Anillo intermedio.
    float secondaryRing = circle(
        r - (baseRadius - 0.055),
        0.0018,
        aa
    );

    col += COLOR_PURPLE * secondaryRing * (0.4 + midBeat * 0.8);

    return col;
}

// ================================================================
// 7. MEMORIA ESPECTRAL CIRCULAR
// ================================================================

vec3 renderHistory(vec2 p, float r, float angle, float aa) {

    vec3 col = vec3(0.0);

    float frequency = fract(angle / TAU + 0.5);

    // Radio convertido en posición temporal.
    float age = saturate(
        (r - HISTORY_INNER) /
        (HISTORY_OUTER - HISTORY_INNER)
    );

    float fftHistory = history(frequency, age);

    // La historia de audio deforma físicamente el anillo.
    float displacement = fftHistory * 0.055 * HISTORY_SCALE;

    // Flujo temporal suave.
    float temporal = sin(age * 85.0 - uTime * HISTORY_SPEED * 40.0);

    float historyRadius = HISTORY_INNER + age * (
        HISTORY_OUTER - HISTORY_INNER
    );

    historyRadius += displacement;

    // Banda espectral histórica.
    float band = circle(r - historyRadius, 0.0025 + fftHistory * 0.004, aa);

    // Intensidad según energía histórica.
    float historyIntensity = smoothstep(0.035, 0.25, fftHistory);

    float hue = fract(
        frequency * 0.7 +
        age * 0.45 +
        uCentroid * 0.2
    );

    vec3 historyColor = palette(hue);

    col += historyColor * band * historyIntensity * HISTORY_GLOW;

    // Microsegmentos históricos.
    float detailAngle = fract(angle / TAU * 160.0);
    float segment = 1.0 - smoothstep(
        0.35,
        0.47,
        abs(detailAngle - 0.5)
    );

    float segmentBand = band * segment;

    col += COLOR_CYAN * segmentBand * historyIntensity * 0.45;

    // Textura de actividad reciente.
    float recent = 1.0 - age;
    float recentEnergy = smoothstep(0.04, 0.5, fftHistory);

    float recentGlow = recentEnergy * exp(-recent * 3.5);

    col += COLOR_GOLD * recentGlow * band * 0.55;

    // Marcas temporales del anillo.
    float ticks = abs(sin(age * 190.0 + temporal * 0.4));
    ticks = 1.0 - smoothstep(0.0, 0.13, ticks);

    col += COLOR_BLUE * ticks * band * 0.25;

    return col;
}

// ================================================================
// 8. FILAMENTOS Y CONEXIONES
// ================================================================

vec3 renderFilaments(vec2 p, float r, float angle, float aa) {

    vec3 col = vec3(0.0);

    float voice = saturate(uVoice);
    float kick = saturate(uKick);

    // 9 filamentos orgánicos principales.
    float filamentAngle = angle * 9.0;

    float wave = waveform(
        fract(angle / TAU * 3.0 + uTime * 0.02)
    );

    float distortion = sin(
        filamentAngle +
        uTime * FILAMENT_SPEED
    );

    distortion += cos(
        angle * 17.0 - uTime * 0.8
    ) * 0.25;

    float organicRadius = 0.38 + distortion * 0.025;
    organicRadius += wave * 0.018 * voice;
    organicRadius += sin(angle * 4.0 + uTime) * 0.012;

    float filament = line(
        r - organicRadius,
        0.002 + voice * 0.002,
        aa
    );

    filament *= smoothstep(0.33, 0.39, r);
    filament *= 1.0 - smoothstep(0.43, 0.46, r);

    vec3 filamentColor = mix(COLOR_CYAN, COLOR_PURPLE, voice);

    col += filamentColor * filament * (0.4 + voice * 1.2);

    // Filamentos secundarios.
    float secondary = sin(angle * 18.0 + uTime * 0.5 + wave * voice * 3.0);

    float secondaryLine = line(
        secondary,
        0.04,
        0.025
    );

    secondaryLine *= smoothstep(0.37, 0.4, r);
    secondaryLine *= 1.0 - smoothstep(0.47, 0.5, r);

    col += COLOR_BLUE * secondaryLine * 0.22;

    // Conexiones radiales activadas por el kick.
    float connectionAngle = fract(angle / TAU * 36.0);

    float connections = 1.0 - smoothstep(
        0.035,
        0.08,
        abs(connectionAngle - 0.5)
    );

    float connectionBody = smoothstep(0.39, 0.4, r);
    connectionBody *= 1.0 - smoothstep(0.48, 0.49, r);

    col += COLOR_GOLD * connections * connectionBody * kick * 0.45;

    return col;
}

// ================================================================
// 9. PARTÍCULAS Y MICRODETALLES
// ================================================================

vec3 renderParticles(vec2 p, float r, float angle, float aa) {

    vec3 col = vec3(0.0);

    float hiHat = saturate(uHiHat);
    float treble = saturate(uTreble);
    float flux = saturate(uFlux);

    // 96 partículas distribuidas angularmente.
    float id = floor(angle / TAU * 96.0);

    float rnd = hash21(vec2(id, 17.0));
    float rnd2 = hash21(vec2(id, 39.0));

    float particleAngle = id / 96.0 * TAU;

    particleAngle += (rnd - 0.5) * 0.045;
    particleAngle += uTime * (rnd2 - 0.5) * PARTICLE_SPEED;

    float frequency = fract(id / 96.0);

    float particleFFT = spectrum(frequency);

    float particleRadius = 0.43 + rnd * 0.48;
    particleRadius += particleFFT * 0.04;

    particleRadius += sin(
        uTime * (1.0 + rnd2 * 3.0) + id
    ) * 0.008;

    float particleIntensity = hiHat * HIHAT_INTENSITY;
    particleIntensity += flux * 0.4;
    particleIntensity += treble * 0.25;

    // Posición angular relativa.
    float particleDelta = abs(
        fract((angle - particleAngle) / TAU + 0.5) - 0.5
    );

    float particleDistance = length(vec2(
        particleDelta * TAU * particleRadius,
        r - particleRadius
    ));

    float particle = 1.0 - smoothstep(
        0.002,
        0.005 + rnd * 0.004,
        particleDistance
    );

    particle *= step(0.3, rnd + hiHat * 0.6);

    vec3 particleColor = mix(COLOR_CYAN, COLOR_GOLD, rnd2);

    col += particleColor * particle * particleIntensity * SPARK_GLOW;

    // Chispas exteriores.
    float spark = pow(
        max(0.0, sin(angle * 96.0 + uTime * 4.0 + rnd * TAU)),
        18.0
    );

    float sparkBand = circle(r - (0.85 + rnd * 0.07), 0.003, aa);

    col += COLOR_GOLD * spark * sparkBand * hiHat * 0.75;

    return col;
}

// ================================================================
// 10. FONDO Y PROFUNDIDAD
// ================================================================

vec3 renderBackground(vec2 p, float r, float angle) {

    vec3 col = vec3(0.006, 0.009, 0.022);

    // Viñeta espacial.
    float vignette = 1.0 - smoothstep(0.35, 1.5, r);

    col *= 0.55 + vignette * 0.45;

    // Iluminación ambiental del mecanismo.
    float ambient = exp(-r * 3.2);

    col += COLOR_BLUE * ambient * 0.035;
    col += COLOR_PURPLE * exp(-r * 5.0) * 0.025;

    // Campo de pequeñas marcas ambientales.
    vec2 grid = p * 38.0;
    vec2 cell = floor(grid);

    float randomDot = hash21(cell);

    vec2 local = fract(grid) - 0.5;

    float dots = 1.0 - smoothstep(
        0.025,
        0.055,
        length(local)
    );

    dots *= step(0.985, randomDot);

    col += COLOR_BLUE * dots * 0.18;

    // Circunferencia ambiental exterior.
    float outer = circle(r - 0.985, 0.001, 0.003);

    col += COLOR_BLUE * outer * 0.18;

    return col;
}

// ================================================================
// 11. COMPOSICIÓN PRINCIPAL
// ================================================================

void main() {

    // Coordenadas centradas con corrección de aspecto.
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= uResolution.x / uResolution.y;

    float aa = 1.5 / uResolution.y;

    // Interacción opcional.
    vec2 mouse = (uMouse - 0.5) * 2.0;
    mouse.x *= uResolution.x / uResolution.y;

    float mouseInfluence = saturate(uMouseMiddle + uMouseRight);

    p -= mouse * 0.025 * mouseInfluence;

    float globalKick = saturate(
        uKick * KICK_INTENSITY +
        uKickPeak * 0.2
    );

    float globalSnare = saturate(
        uSnare * SNARE_INTENSITY
    );

    float globalVoice = saturate(
        uVoice * VOICE_INTENSITY
    );

    // Movimiento global de la máquina.
    float globalScale = 1.0 + globalKick * 0.045;

    p /= globalScale;

    // Ligera rotación rítmica.
    float rotation = uTime * ROTATION_SPEED;
    rotation += globalKick * 0.025;
    rotation += globalSnare * 0.012;

    p = rotate2D(p, rotation);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Modulación cromática global.
    float centroidColor = saturate(uCentroid);

    // ============================================================
    // CAPAS VISUALES
    // ============================================================

    vec3 color = renderBackground(p, r, angle);

    // Memoria musical: capa posterior.
    color += renderHistory(p, r, angle, aa);

    // Estructura mecánica principal.
    color += renderGear(p, r, angle, aa);

    // Conexiones orgánicas.
    color += renderFilaments(p, r, angle, aa);

    // Partículas de alta frecuencia.
    color += renderParticles(p, r, angle, aa);

    // Núcleo central.
    color += renderCore(p, r, angle, aa);

    // ============================================================
    // DESTELLOS MUSICALES
    // ============================================================

    // Snare: destello radial breve y fragmentado.
    float snareFlash = pow(
        max(0.0, sin(angle * 32.0 + uTime * 12.0)),
        10.0
    );

    float snareRing = circle(
        r - 0.49,
        0.002 + globalSnare * 0.003,
        aa
    );

    color += COLOR_PINK * snareRing * snareFlash * globalSnare;

    // Kick: expansión luminosa desde el núcleo.
    float kickGlow = exp(-abs(r - 0.31) * 28.0);

    color += COLOR_GOLD * kickGlow * globalKick * 0.22;

    // Voice: iluminación cromática evolutiva.
    float voiceGlow = exp(-abs(r - 0.4) * 12.0);

    vec3 voiceColor = mix(
        COLOR_PURPLE,
        COLOR_PINK,
        0.5 + 0.5 * sin(uTime * 0.45)
    );

    color += voiceColor * voiceGlow * globalVoice * 0.12;

    // Flux: actividad transitoria en el contorno.
    float fluxGlow = exp(-abs(r - 0.91) * 45.0);

    color += COLOR_CYAN * fluxGlow * saturate(uFlux) * 0.2;

    // HiHat: pequeños destellos de alta frecuencia.
    float highFlash = pow(
        max(0.0, sin(angle * 120.0 + uTime * 15.0)),
        22.0
    );

    float highRing = circle(r - 0.93, 0.002, aa);

    color += COLOR_GOLD * highFlash * highRing *
             saturate(uHiHat) * 0.35;

    // ============================================================
    // CONTROL CROMÁTICO Y TONEMAPPING
    // ============================================================

    float energy = saturate(uVolume);

    // La intensidad crece sin convertir toda la imagen en blanco.
    color *= MASTER_INTENSITY;
    color *= 0.9 + energy * 0.18;

    // Ligero enriquecimiento cromático según el centroide.
    color = mix(
        color,
        color * mix(COLOR_CYAN, COLOR_PURPLE, centroidColor) * 1.15,
        0.10
    );

    // Compresión suave de altas intensidades.
    color = color / (1.0 + color * 0.48);

    // Contraste final.
    color = pow(max(color, vec3(0.0)), vec3(0.88));

    // Viñeta final.
    float vignette = smoothstep(1.45, 0.35, r);

    color *= 0.72 + vignette * 0.28;

    // Salida.
    gl_FragColor = vec4(color, 1.0);
}