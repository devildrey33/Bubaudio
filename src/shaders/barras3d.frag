// BARRAS 3D — THREE.ShaderMaterial con beats instrumentales y memoria FFT.
// 1024 barras = 32x32, sobre una base de 64x64 unidades.
// Cambia GRID_SIZE a 64.0 si quieres 4096 barras (64x64).
// Audio resumido [0,1]; texturas horizontales, amplitud en canal R.
// uWaveform y uSpectrum [0,1], amplitud en canal R.
// Rayos con intersecciones exactas de cajas y recorrido DDA por la rejilla.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

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
uniform float uKickPeak;
uniform float uSnarePeak;
uniform float uVoicePeak;
uniform float uHiHatPeak;
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

// ---------- CONTROLES RAPIDOS ----------
// valores para retocar la respuesta sin buscar constantes por el shader.
#define BASS_BACKGROUND_GAIN            0.35
#define KICK_IMPACT_GAIN                0.80
#define MID_IMPACT_GAIN                 0.65
#define TREBLE_IMPACT_GAIN              0.85
#define OSCILLOSCOPE_LINE_THICKNESS     2.00
#define OSCILLOSCOPE_LINE_COLOR         vec3(1.0, 1.0, 1.0)
#define OSCILLOSCOPE_BORDER_THICKNESS   3.40
#define PARTICLE_GAIN                   1.00
#define FLOATING_LIGHT_GAIN             1.00
#define FLOATING_LIGHT_SIZE             1.00
#define FLOATING_LIGHT_TRAIL            0.75
#define FLOATING_LIGHT_COUNT            8
#define PEAK_RESPONSE_CURVE             0.72
#define CAMERA_ORBIT_AMOUNT             1.00
#define CAMERA_ORBIT_SPEED              0.075
#define BLOOM_GAIN                      1.00
#define BEAT_BLUR_GAIN                  0.85
#define BACKGROUND_GRID_GAIN            1.00
#define BACKGROUND_GRID_SPEED           0.22
#define BACKGROUND_GRID_ANGLE           27.0
#define BACKGROUND_GRID_SNARE_RESPONSE  0.03
#define BACKGROUND_WAVE_SPEED           0.24
#define BACKGROUND_WAVE_RADIUS          3.00
#define BACKGROUND_WAVE_KICK_SPEED      0.012
#define BACKGROUND_WAVE_SNARE_SPEED     0.012
#define BACKGROUND_WAVE_BLUR            10.0
#define BACKGROUND_WAVE_GAIN            0.32
#define BACKGROUND_RIGHT_WAVE_COLOR     vec3(1.0, 0.035, 0.42)
#define BACKGROUND_INTERSECTION_BLOOM   1.10

const float GRID_SIZE = 32.0;
const float BASE_SIZE = 64.0;
const float HALF_BASE = BASE_SIZE * 0.5;
const float CELL_SIZE = BASE_SIZE / GRID_SIZE;
const float BAR_HALF = CELL_SIZE * 0.38;
const float MAX_HEIGHT = 40.0;
const int MAX_STEPS = 132; // Suficiente para recorrer una rejilla de hasta 64x64.

float sat(float x) {
    return clamp(x, 0.0, 1.0);
}

// Evita divisiones por cero para rayos paralelos a una cara.
vec3 inverseDirection(vec3 d) {
    vec3 safe = d;
    if (abs(safe.x) < 0.0001) safe.x = safe.x < 0.0 ? -0.0001 : 0.0001;
    if (abs(safe.y) < 0.0001) safe.y = safe.y < 0.0 ? -0.0001 : 0.0001;
    if (abs(safe.z) < 0.0001) safe.z = safe.z < 0.0 ? -0.0001 : 0.0001;
    return 1.0 / safe;
}

vec2 boxInterval(vec3 ro, vec3 inv, vec3 lo, vec3 hi) {
    vec3 a = (lo - ro) * inv;
    vec3 b = (hi - ro) * inv;
    vec3 near = min(a, b);
    vec3 far = max(a, b);
    return vec2(max(max(near.x, near.y), near.z),
                min(min(far.x, far.y), far.z));
}

// x = altura; y = energia; z = posicion normalizada en el espectro.
float smoothSpectrum(float x) {
    // Promedio de cinco bins vecinos para evitar saltos entre barras.
    float texel = 1.0 / 1024.0;
    float value = texture2D(uSpectrum, vec2(clamp(x - 2.0 * texel, 0.002, 0.998), 0.5)).r;
    value += texture2D(uSpectrum, vec2(clamp(x - texel, 0.002, 0.998), 0.5)).r * 2.0;
    value += texture2D(uSpectrum, vec2(clamp(x, 0.002, 0.998), 0.5)).r * 3.0;
    value += texture2D(uSpectrum, vec2(clamp(x + texel, 0.002, 0.998), 0.5)).r * 2.0;
    value += texture2D(uSpectrum, vec2(clamp(x + 2.0 * texel, 0.002, 0.998), 0.5)).r;
    return sat(value / 9.0);
}

float kickPulse() {
    return sat(max(uBeat, uKickPeak));
}

float midPulse() {
    return sat(max(uMidBeat, uVoicePeak));
}

float treblePulse() {
    return sat(max(uTrebleBeat, uHiHatPeak));
}

vec3 barData(vec2 cell) {
    float index = cell.x + cell.y * GRID_SIZE;
    float frequency = (index + 0.5) / (GRID_SIZE * GRID_SIZE);
    float energy = smoothSpectrum(frequency);

    float lowWeight = 1.0 - smoothstep(0.04, 0.25, frequency);
    float highWeight = smoothstep(0.25, 0.80, frequency);
    float midWeight = max(0.0, 1.0 - lowWeight - highWeight);
    float band = sat(uBass) * lowWeight + sat(uMid) * midWeight
               + sat(uTreble) * highWeight;
    float transient = kickPulse() * lowWeight
                    + midPulse() * midWeight
                    + treblePulse() * highWeight;

    float height = 0.35 + 26.0 * pow(energy, 0.78)
                 * (0.60 + 0.25 * sat(uVolume) + 0.15 * band)
                 * (1.0 + 0.10 * sat(uBeat) + 0.12 * transient);
    return vec3(min(height, MAX_HEIGHT - 0.1), energy, frequency);
}

// Recorrido de las celdas atravesadas por el rayo, no de todas las barras.
// En 32x32 visita como maximo unas 63 celdas por rayo.
float traceBars(vec3 ro, vec3 rd, out vec3 normal, out vec3 data) {
    normal = vec3(0.0, 1.0, 0.0);
    data = vec3(0.0);
    vec3 inv = inverseDirection(rd);
    vec2 bounds = boxInterval(ro, inv,
        vec3(-HALF_BASE, 0.0, -HALF_BASE),
        vec3( HALF_BASE, MAX_HEIGHT, HALF_BASE));
    float current = max(bounds.x, 0.0);
    float end = bounds.y;
    if (end <= current) return -1.0;

    vec3 entry = ro + rd * (current + 0.002);
    vec2 cell = clamp(floor((entry.xz + HALF_BASE) / CELL_SIZE),
                      vec2(0.0), vec2(GRID_SIZE - 1.0));
    vec2 direction = vec2(rd.x < 0.0 ? -1.0 : 1.0,
                          rd.z < 0.0 ? -1.0 : 1.0);
    vec2 nextBoundary = -HALF_BASE
                      + (cell + max(direction, vec2(0.0))) * CELL_SIZE;
    vec2 nextT = (nextBoundary - ro.xz) * inv.xz;
    vec2 deltaT = abs(inv.xz) * CELL_SIZE;
    // Un rayo exactamente vertical nunca cambia de columna.
    if (abs(rd.x) < 0.0001) { nextT.x = 10000.0; deltaT.x = 10000.0; }
    if (abs(rd.z) < 0.0001) { nextT.y = 10000.0; deltaT.y = 10000.0; }

    for (int step = 0; step < MAX_STEPS; step++) {
        if (current > end || cell.x < 0.0 || cell.y < 0.0
            || cell.x >= GRID_SIZE || cell.y >= GRID_SIZE) break;

        vec3 info = barData(cell);
        vec2 center = -HALF_BASE + (cell + 0.5) * CELL_SIZE;
        vec3 lo = vec3(center.x - BAR_HALF, 0.0, center.y - BAR_HALF);
        vec3 hi = vec3(center.x + BAR_HALF, info.x, center.y + BAR_HALF);
        vec2 hit = boxInterval(ro, inv, lo, hi);
        float cellEnd = min(end, min(nextT.x, nextT.y));

        if (hit.x <= hit.y && hit.y >= current
            && hit.x >= current - 0.003 && hit.x <= cellEnd + 0.003) {
            vec3 near = min((lo - ro) * inv, (hi - ro) * inv);
            if (near.y >= near.x && near.y >= near.z)
                normal = vec3(0.0, -sign(rd.y), 0.0);
            else if (near.x >= near.z)
                normal = vec3(-sign(rd.x), 0.0, 0.0);
            else
                normal = vec3(0.0, 0.0, -sign(rd.z));
            data = info;
            return max(hit.x, 0.0);
        }

        if (nextT.x < nextT.y) {
            current = nextT.x;
            nextT.x += deltaT.x;
            cell.x += direction.x;
        } else {
            current = nextT.y;
            nextT.y += deltaT.y;
            cell.y += direction.y;
        }
    }
    return -1.0;
}

vec3 barPalette(float frequency, float heightRatio) {
    // Gradiente recuperado: amber -> magenta -> azul electrico.
    // Mantiene una lectura cromatica clara por bandas de frecuencia.
    vec3 amber = vec3(1.0, 0.16, 0.018);
    vec3 magenta = vec3(0.92, 0.025, 0.42);
    vec3 electricBlue = vec3(0.015, 0.22, 1.0);
    vec3 color = mix(amber, magenta, smoothstep(0.08, 0.42, frequency));
    color = mix(color, electricBlue, smoothstep(0.42, 0.78, frequency));
    color = mix(color, vec3(0.02, 0.90, 1.0), smoothstep(0.78, 1.0, frequency));

    // Emision adicional en las puntas altas para un aspecto mas llamativo.
    float light = smoothstep(0.04, 0.88, heightRatio);
    float neonEdge = smoothstep(0.62, 1.0, heightRatio);
    color *= 0.15 + 0.85 * light;
    color += color * neonEdge * (0.16 + 0.18 * sat(uBeat));
    return color;
}

vec3 shadeBar(vec3 p, vec3 rd, vec3 normal, vec3 data) {
    float y = sat(p.y / max(data.x, 0.01));
    vec3 base = barPalette(data.z, y);
    vec3 light = normalize(vec3(-0.45, 0.90, 0.35));
    float diffuse = max(dot(normal, light), 0.0);
    vec3 halfway = normalize(light - rd);
    float specular = pow(max(dot(normal, halfway), 0.0), 36.0);
    float fresnel = pow(1.0 - max(dot(normal, -rd), 0.0), 3.0);
    float top = max(normal.y, 0.0);

    // Franjas tipo LED en las caras laterales.
    float stripe = smoothstep(0.80, 0.94, fract(p.y * 0.72));
    float led = mix(1.0 - stripe * 0.38, 1.0, top);
    vec3 color = base * (0.26 + 0.65 * diffuse) * led;
    color += base * (0.12 + 0.40 * data.y + 0.20 * sat(uVolume));
    color += base * fresnel * (0.18 + 0.35 * sat(uTreble));
    color += vec3(0.65, 0.85, 1.0) * specular * 0.45;
    color += mix(base, vec3(0.8, 0.95, 1.0), 0.45)
           * top * (0.25 + 0.70 * data.y
                   + 0.26 * KICK_IMPACT_GAIN * kickPulse()
                   + 0.18 * TREBLE_IMPACT_GAIN * treblePulse());

    // Destello adherido a la parte superior de las barras mas energicas.
    float highVolume = smoothstep(0.68, 0.90, sat(uVolume));
    float highBar = smoothstep(0.60, 0.88, data.y);
    float topDistance = abs(p.y - data.x);
    float topSpark = exp(-topDistance * 6.0) * highVolume * highBar;
    float sparkPhase = sin(p.x * 4.7 + p.z * 3.1 + uTime * 5.0);
    topSpark *= smoothstep(0.35, 0.86, sparkPhase);
    color += vec3(1.0, 0.78, 0.28) * topSpark
           * (0.45 + 0.75 * TREBLE_IMPACT_GAIN * treblePulse());

    // Estela procedural: simula acumulacion de movimiento sobre la barra.
    // Se activa solo con volumen alto, beat y energia espectral elevada.
    float fastMotion = smoothstep(0.56, 0.82, sat(uVolume))
                     * (0.20 + 0.80 * max(KICK_IMPACT_GAIN * kickPulse(),
                                           max(MID_IMPACT_GAIN * midPulse(),
                                               TREBLE_IMPACT_GAIN * treblePulse())));
    float energeticBar = smoothstep(0.54, 0.82, data.y);
    float trailActivation = fastMotion * energeticBar;
    float normalizedY = sat(p.y / max(data.x, 0.01));
    float trailPhase = fract(normalizedY * 0.82 - uTime * (0.85 + 0.35 * sat(uBass))
                             + data.z * 2.0);
    float trailBand = exp(-abs(trailPhase - 0.32) * 24.0);
    float trailFade = smoothstep(0.02, 0.20, normalizedY)
                    * (1.0 - smoothstep(0.78, 1.0, normalizedY));
    vec3 trailColor = mix(vec3(0.08, 0.78, 1.0),
                          vec3(1.0, 0.04, 0.62),
                          smoothstep(0.25, 0.85, data.z));
    color += trailColor * trailBand * trailFade * trailActivation
           * (0.16 + 0.48 * sat(uTreble));

    // Halo vertical en la cara superior: da la sensacion de que la barra
    // deja una imagen residual cuando cambia rapidamente de altura.
    float verticalGhost = exp(-max(data.x - p.y, 0.0) * 0.34)
                        * trailActivation * (1.0 - normalizedY);
    color += trailColor * verticalGhost * 0.075;
    return color;
}

vec3 shadeFloor(vec3 p) {
    vec2 local = (p.xz + HALF_BASE) / CELL_SIZE;
    vec2 fraction = fract(local);
    vec2 edge = min(fraction, 1.0 - fraction) * CELL_SIZE;
    float grid = 1.0 - smoothstep(0.025, 0.11, min(edge.x, edge.y));
    vec3 color = vec3(0.008, 0.016, 0.026);
    color += vec3(0.025, 0.15, 0.22) * grid * (0.40 + sat(uMid));

    float pulseRadius = mod(uTime * 12.0, 48.0);
    float pulse = exp(-abs(length(p.xz) - pulseRadius) * 1.5);
    color += vec3(0.08, 0.38, 0.65) * pulse * kickPulse();
    return color;
}

float smoothWaveform(float x) {
    float texel = 1.0 / 1024.0;
    float value = texture2D(uWaveform, vec2(clamp(x - 2.0 * texel, 0.002, 0.998), 0.5)).r;
    value += texture2D(uWaveform, vec2(clamp(x - texel, 0.002, 0.998), 0.5)).r * 2.0;
    value += texture2D(uWaveform, vec2(clamp(x, 0.002, 0.998), 0.5)).r * 3.0;
    value += texture2D(uWaveform, vec2(clamp(x + texel, 0.002, 0.998), 0.5)).r * 2.0;
    value += texture2D(uWaveform, vec2(clamp(x + 2.0 * texel, 0.002, 0.998), 0.5)).r;
    return value / 9.0;
}

float oscilloscopeLineDistance(vec2 uv) {
    float x = clamp(uv.x, 0.002, 0.998);
    float waveform = smoothWaveform(x) * 2.0 - 1.0;
    float amplitude = 0.105 + 0.035 * sat(uVolume) + 0.025 * sat(uBass);
    float waveY = 0.78 - waveform * amplitude;
    return abs(uv.y - waveY);
}

float oscilloscopeBorderMask(vec2 uv) {
    float lineWidth = (0.0024 + 0.0012 * sat(uTreble)
                     + 0.0012 * sat(uBeat)) * OSCILLOSCOPE_LINE_THICKNESS * uBass;
    float borderWidth = lineWidth * OSCILLOSCOPE_BORDER_THICKNESS * uBass + 0.0012;
    float distanceToLine = oscilloscopeLineDistance(uv);
    return 1.0 - smoothstep(borderWidth, borderWidth + 0.0025,
                             distanceToLine);
}

vec3 foregroundOscilloscope(vec2 uv) {
    float lineWidth = (0.0024 + 0.0012 * sat(uTreble)
                     + 0.0012 * sat(uBeat)) * OSCILLOSCOPE_LINE_THICKNESS * uBass;
    float distanceToLine = oscilloscopeLineDistance(uv);
    float line = 1.0 - smoothstep(lineWidth, lineWidth + 0.0025,
                                   distanceToLine);
    float glow = exp(-distanceToLine * (115.0 - 25.0 * sat(uVolume)))
               * (0.10 + 0.18 * sat(uVolume));
    return OSCILLOSCOPE_LINE_COLOR * (line + glow);
}

vec3 dynamicBackgroundPalette(float timeValue, float phaseOffset) {
    // Paleta neon: cian, violeta, magenta y amber, con transicion suave.
    float cycle = 0.5 + 0.5 * sin(timeValue * 0.095 + phaseOffset
                                  + 0.55 * sin(timeValue * 0.031 + phaseOffset * 1.7));
    vec3 cyan = vec3(0.02, 0.82, 1.00);
    vec3 violet = vec3(0.34, 0.08, 1.00);
    vec3 magenta = vec3(1.00, 0.025, 0.48);
    vec3 amber = vec3(1.00, 0.38, 0.035);
    vec3 coolMix = mix(cyan, violet, smoothstep(0.10, 0.48, cycle));
    vec3 warmMix = mix(magenta, amber, smoothstep(0.52, 0.90, cycle));
    return mix(coolMix, warmMix, smoothstep(0.34, 0.72, cycle));
}

vec3 animatedBackground(vec2 uv, float aspect) {
    vec2 p = uv * vec2(aspect, 1.0);
    float t = mod(uTime, 600.0);
    // Pulso de graves: mezcla el resumen y los primeros bins del espectro.
    // Se limita para que el fondo respire sin robar protagonismo a las barras.
    float lowRhythm = sat(0.55 * smoothSpectrum(0.025)
                         + BASS_BACKGROUND_GAIN * sat(uBass)
                         + 0.20 * sat(uKickPeak));
    float bassBreath = 1.0 + lowRhythm * (0.035 + 0.025 * sat(uBeat));
    p /= bassBreath;
    float radius = length(p);
    vec3 backgroundTint = dynamicBackgroundPalette(t, 0.15);
    vec3 gridTint = dynamicBackgroundPalette(t, 2.10);
    vec3 leftWaveTint = dynamicBackgroundPalette(t, 4.35);

    vec3 color = mix(vec3(0.002, 0.006, 0.018),
                     backgroundTint * 0.075,
                     1.0 - smoothstep(0.0, 1.25, radius));
    color += backgroundTint * 0.028 * lowRhythm;

    // Nebulosa animada de bajo coste.
    float cloud = 0.5 + 0.5 * sin(p.x * 3.1 + sin(p.y * 4.7 + t * (0.16 + lowRhythm * 0.04))
                                  + t * (0.11 + lowRhythm * 0.025));
    cloud *= 0.5 + 0.5 * sin(p.y * 5.3 - t * 0.09 + cloud * 2.2);
    color += mix(backgroundTint, vec3(0.02, 0.10, 0.20), 0.35) * cloud
           * (0.3 + 0.7 * sat(uVolume) + 0.24 * lowRhythm);

    // Rejilla de perspectiva/holografica en el fondo.
    // La rejilla se desplaza en diagonal a 27 grados en sentido horario.
    // El signo negativo convierte el angulo matematico en horario en pantalla.
    float gridAngle = -BACKGROUND_GRID_ANGLE * 0.01745329252;
    vec2 gridDirection = vec2(cos(gridAngle), sin(gridAngle));
    // El movimiento lateral es constante y no se multiplica por ningun dato
    // de audio. La rejilla usa una coordenada independiente del pulso de
    // graves aplicado a p, por lo que solo responde a la caja.
    vec2 gridMotion = gridDirection * t * BACKGROUND_GRID_SPEED;
    vec2 gridP = uv * vec2(aspect, 1.0);
    float hiHatGridResponse = sat(uHiHatPeak);
    float gridScale = 7.0 + 7.0 * hiHatGridResponse
                    * BACKGROUND_GRID_SNARE_RESPONSE;
    vec2 gridUv = gridP * gridScale + gridMotion;
    vec2 gridCell = abs(fract(gridUv - 0.5) - 0.5);
    float grid = 1.0 - smoothstep(0.018, 0.065,
                                  min(gridCell.x, gridCell.y));
    color += gridTint * grid * BACKGROUND_GRID_GAIN
           * (0.18 + 0.52 * hiHatGridResponse
              * BACKGROUND_GRID_SNARE_RESPONSE);

    // Dos frentes de onda nacen en los laterales y avanzan hacia el centro.
    // La izquierda responde solo al bombo; la derecha, solo a la caja.
    float leftWaveSpeed = BACKGROUND_WAVE_SPEED
                        * (1.0 + BACKGROUND_WAVE_KICK_SPEED * kickPulse());
    float rightWaveSpeed = BACKGROUND_WAVE_SPEED
                         * (1.0 + BACKGROUND_WAVE_SNARE_SPEED * sat(uSnarePeak));
    vec2 leftSource = vec2(-max(aspect, 1.0) * 0.92, 0.0);
    vec2 rightSource = vec2(max(aspect, 1.0) * 0.92, 0.0);
    float leftRadius = length(p - leftSource);
    float rightRadius = length(p - rightSource);
    float leftFront = abs(fract(leftRadius * BACKGROUND_WAVE_RADIUS
                                - t * leftWaveSpeed) - 0.5);
    float rightFront = abs(fract(rightRadius * BACKGROUND_WAVE_RADIUS
                                 - t * rightWaveSpeed) - 0.5);
    float leftStrength = 0.10 + 0.35 * kickPulse();
    float rightStrength = 0.10 + 0.35 * sat(uSnarePeak);
    float leftRings = exp(-leftFront * BACKGROUND_WAVE_BLUR) * leftStrength;
    float rightRings = exp(-rightFront * BACKGROUND_WAVE_BLUR) * rightStrength;
    float leftHalo = exp(-leftFront * 5.5) * (0.025 + 0.06 * kickPulse());
    float rightHalo = exp(-rightFront * 5.5)
                    * (0.025 + 0.06 * sat(uSnarePeak));
    vec3 rightWaveTint = mix(BACKGROUND_RIGHT_WAVE_COLOR,
                             dynamicBackgroundPalette(t, 7.49), 0.22);
    color += (leftWaveTint * (leftRings + leftHalo)
           + rightWaveTint * (rightRings + rightHalo))
           * 0.5 * BACKGROUND_WAVE_GAIN;

    // Destello localizado donde el nucleo de cada onda cruza una linea de
    // rejilla. La mascara evita crear bloom en zonas donde no hay cruce.
    float leftWaveCore = exp(-leftFront * 28.0);
    float rightWaveCore = exp(-rightFront * 28.0);
    float intersectionCore = grid * (leftWaveCore + rightWaveCore) * 0.5;
    vec3 intersectionTint = mix(gridTint,
                                (leftWaveTint + rightWaveTint) * 0.5,
                                0.55);
    color += intersectionTint * intersectionCore
           * BACKGROUND_INTERSECTION_BLOOM
           * (0.22 + 0.78 * max(max(kickPulse(), sat(uSnarePeak)),
                                sat(uHiHatPeak)));

    float horizonGlow = exp(-abs(p.y + 0.35 * sin(t * 0.13)) * 7.0);
    vec3 horizonTint = mix((leftWaveTint + rightWaveTint) * 0.5,
                           backgroundTint, 0.45);
    color += horizonTint * horizonGlow * lowRhythm * 0.55;
    return color;
}

vec3 proceduralBloom(vec2 uv, vec3 sceneColor) {
    float t = mod(uTime, 600.0);
    float brightness = dot(sceneColor, vec3(0.2126, 0.7152, 0.0722));
    float brightPass = smoothstep(0.42, 1.15, brightness);

    // Bloom local de altas luces: conserva el color de cada material y añade
    // una segunda capa suave sin necesitar una textura de framebuffer.
    float peakPulse = max(max(kickPulse(), midPulse()), treblePulse());
    float beatBlur = sat(max(uBeat, peakPulse));
    float blurThreshold = 0.42 - 0.18 * beatBlur;
    float blurPass = smoothstep(blurThreshold, 1.15, brightness);
    vec3 glow = sceneColor * max(brightPass, blurPass)
              * BLOOM_GAIN * (0.08 + 0.16 * sat(uVolume));

    // El beat ensancha el desenfoque, pero nunca cambia la direccion del
    // desplazamiento de las barras ni de la camara.
    glow += sceneColor * beatBlur * BEAT_BLUR_GAIN
          * (0.08 + 0.22 * sat(uVolume));

    // Resplandor volumetrico detras de las barras, mas intenso en cada beat.
    vec2 p = uv * 2.0 - 1.0;
    float centerGlow = exp(-length(p * vec2(0.72, 1.05)) * 2.4);
    float movingGlow = 0.5 + 0.5 * sin(t * 0.7 + p.x * 4.0 + p.y * 2.0);
    glow += vec3(0.03, 0.14, 0.30) * centerGlow
          * (0.08 + 0.18 * kickPulse() + 0.16 * treblePulse()
             + 0.08 * movingGlow * sat(uBass));

    return glow;
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec3 audioParticles(vec2 uv) {
    // Particulas en pantalla, activadas solo durante volumen alto.
    float activation = smoothstep(0.70, 0.90, sat(uVolume))
                     * (0.30 + 0.70 * max(max(kickPulse(), midPulse()), treblePulse()));
    float t = mod(uTime, 600.0);
    vec3 result = vec3(0.0);

    for (int i = 0; i < 28; i++) {
        float id = float(i);
        float seed = hash21(vec2(id + 4.0, 17.0));
        float seed2 = hash21(vec2(id + 19.0, 31.0));
        float column = floor(seed * 32.0);
        float frequency = (column + 0.5) / 32.0;
        float energy = smoothSpectrum(frequency);
        float barActivation = smoothstep(0.58, 0.86, energy);
        float activationFactor = activation * barActivation;

        float speed = 0.08 + seed2 * 0.20;
        float life = fract(seed + t * speed);
        float x = (seed * 2.0 - 1.0) * 0.92;
        float y = fract(seed2 + life * 0.75) * 0.82 + 0.08;
        vec2 particle = vec2(x, y);
        float distanceToParticle = length(uv - particle);
        float size = 0.0025 + 0.006 * seed2
                   + 0.005 * max(max(kickPulse(), midPulse()), treblePulse());
        float point = exp(-distanceToParticle * distanceToParticle
                          / max(size * size, 0.00001));
        float fade = smoothstep(0.0, 0.12, life)
                   * (1.0 - smoothstep(0.72, 1.0, life));
        vec3 tint = mix(vec3(1.0, 0.28, 0.06),
                        vec3(0.30, 0.82, 1.0),
                        step(0.58, seed));
        result += tint * point * fade * activationFactor * PARTICLE_GAIN
                * (0.22 + 0.95 * max(KICK_IMPACT_GAIN * kickPulse(),
                                      max(MID_IMPACT_GAIN * midPulse(),
                                          TREBLE_IMPACT_GAIN * treblePulse())));
    }
    return result;
}

vec3 floatingOrb(vec2 uv, vec2 position, vec2 previous,
                 float peak, vec3 tint) {
    float response = pow(sat(peak), PEAK_RESPONSE_CURVE);
    float distanceToCore = length(uv - position);
    float distanceToTrail = min(length(uv - previous), distanceToCore + 0.0001);
    float core = exp(-distanceToCore * distanceToCore
                     / max(0.0012 * FLOATING_LIGHT_SIZE, 0.00001));
    float halo = exp(-distanceToCore * (22.0 / max(FLOATING_LIGHT_SIZE, 0.2)));
    float trail = exp(-distanceToTrail * 19.0)
                * FLOATING_LIGHT_TRAIL * (0.25 + 0.75 * response);
    return tint * (core * (0.18 + 1.45 * response)
                   + halo * (0.12 + 0.78 * response) + trail * 0.24)
         * response * FLOATING_LIGHT_GAIN;
}

vec3 floatingLights(vec2 uv) {
    float t = mod(uTime, 600.0);
    vec2 center = vec2(0.50, 0.43);
    float orbit = 0.055 + 0.025 * sat(uBass);
    vec3 result = vec3(0.0);

    // Kick: orbe ámbar grande, con pulso radial.
    float a0 = t * 0.43;
    vec2 kickPos = center + vec2(cos(a0), sin(a0) * 0.70) * (0.25 + orbit);
    vec2 kickPrev = center + vec2(cos(a0 - 0.10), sin(a0 - 0.10) * 0.70) * (0.25 + orbit);
    result += floatingOrb(uv, kickPos, kickPrev, uKickPeak,
                          vec3(1.0, 0.18, 0.025));

    // Snare: flash magenta que cruza el fondo en diagonal.
    float snarePhase = fract(t * 0.17);
    vec2 snarePos = vec2(0.12 + snarePhase * 0.76,
                         0.24 + 0.15 * sin(t * 1.4));
    vec2 snarePrev = snarePos - vec2(0.055, 0.012);
    result += floatingOrb(uv, snarePos, snarePrev, uSnarePeak,
                          vec3(1.0, 0.02, 0.46));

    // Voz: orbe violeta lento y flotante, más atmosférico.
    float voiceAngle = t * 0.19 + 2.1;
    vec2 voicePos = center + vec2(cos(voiceAngle) * 0.42,
                                  sin(voiceAngle * 1.23) * 0.24);
    vec2 voicePrev = center + vec2(cos(voiceAngle - 0.08) * 0.42,
                                   sin((voiceAngle - 0.08) * 1.23) * 0.24);
    result += floatingOrb(uv, voicePos, voicePrev, uVoicePeak,
                          vec3(0.52, 0.08, 1.0));

    // Hi-hat: punto cian pequeño y veloz, casi una chispa.
    float hatAngle = t * 1.18;
    vec2 hatPos = center + vec2(cos(hatAngle) * 0.36,
                                sin(hatAngle) * 0.16 + 0.11);
    vec2 hatPrev = center + vec2(cos(hatAngle - 0.16) * 0.36,
                                 sin(hatAngle - 0.16) * 0.16 + 0.11);
    result += floatingOrb(uv, hatPos, hatPrev, uHiHatPeak,
                          vec3(0.02, 0.85, 1.0));

#if FLOATING_LIGHT_COUNT >= 5
    // Satélite de kick: más pequeño y desplazado respecto al orbe principal.
    float kickSatelliteAngle = -t * 0.71 + 1.4;
    vec2 kickSatellite = center + vec2(cos(kickSatelliteAngle) * 0.46,
                                       sin(kickSatelliteAngle) * 0.28);
    vec2 kickSatellitePrev = center + vec2(cos(kickSatelliteAngle + 0.10) * 0.46,
                                           sin(kickSatelliteAngle + 0.10) * 0.28);
    result += floatingOrb(uv, kickSatellite, kickSatellitePrev, uKickPeak,
                          vec3(1.0, 0.48, 0.04)) * 0.62;
#endif

#if FLOATING_LIGHT_COUNT >= 6
    // Satélite de caja: recorrido vertical con pulsos magenta.
    float snareSatellitePhase = fract(t * 0.29 + 0.36);
    vec2 snareSatellite = vec2(0.78 + 0.10 * sin(t * 1.8),
                               0.12 + snareSatellitePhase * 0.64);
    vec2 snareSatellitePrev = snareSatellite - vec2(0.012, 0.07);
    result += floatingOrb(uv, snareSatellite, snareSatellitePrev, uSnarePeak,
                          vec3(1.0, 0.04, 0.70)) * 0.56;
#endif

#if FLOATING_LIGHT_COUNT >= 7
    // Satélite de voz: deriva lenta en el lateral izquierdo.
    float voiceSatellitePhase = t * 0.23;
    vec2 voiceSatellite = vec2(0.18 + 0.12 * sin(voiceSatellitePhase),
                               0.56 + 0.18 * cos(voiceSatellitePhase * 0.73));
    vec2 voiceSatellitePrev = voiceSatellite
                            - vec2(0.018 * cos(voiceSatellitePhase),
                                   -0.014 * sin(voiceSatellitePhase));
    result += floatingOrb(uv, voiceSatellite, voiceSatellitePrev, uVoicePeak,
                          vec3(0.30, 0.10, 1.0)) * 0.58;
#endif

#if FLOATING_LIGHT_COUNT >= 8
    // Satélite de hi-hat: chispa blanca/cian que rebota por la parte superior.
    float hatSatellitePhase = t * 1.72;
    vec2 hatSatellite = vec2(0.50 + 0.34 * sin(hatSatellitePhase),
                             0.16 + 0.06 * sin(hatSatellitePhase * 2.0));
    vec2 hatSatellitePrev = hatSatellite
                          - vec2(0.04 * cos(hatSatellitePhase),
                                 0.02 * cos(hatSatellitePhase * 2.0));
    result += floatingOrb(uv, hatSatellite, hatSatellitePrev, uHiHatPeak,
                          vec3(0.28, 1.0, 1.0)) * 0.48;
#endif

    return result;
}

void main() {
    vec2 resolution = max(uResolution, vec2(1.0));
    vec2 uv = vUv * 2.0 - 1.0;
    float aspect = resolution.x / resolution.y;
    // En vertical se conserva el ancho de la base en vez de recortarlo.
    vec2 screen = uv * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));

    // Camara orbital suave; para fijarla, sustituye por: float yaw = 0.78;
    float t = mod(uTime, 600.0);
    // Orbita amplia: el grafico se contempla desde varios angulos sin perder
    // el centro. El cabeceo responde suavemente a graves y voz.
    // Orbita continua y unidireccional: no hay vaiven izquierda-derecha.
    float yaw = 1.20 + mod(t * CAMERA_ORBIT_SPEED, 6.28318530718)
              * CAMERA_ORBIT_AMOUNT;
    float elevation = 70.0 + 10.0 * sin(t * 0.052 + 0.7)
                    + 8.0 * sat(uBass) + 4.0 * sat(uVoicePeak);
    vec3 ro = vec3(cos(yaw) * 92.0, elevation, sin(yaw) * 92.0);
    vec3 target = vec3(0.0, 8.0 + 2.5 * sat(uBass), 0.0);
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);
    vec3 rd = normalize(forward * 2.15 + right * screen.x + up * screen.y);

    vec3 background = animatedBackground(vUv * 2.0 - 1.0, max(aspect, 1.0));

    // Osciloscopio limpio: línea blanca con un contorno negro, sin panel.
    background *= 1.0 - oscilloscopeBorderMask(vUv) * 0.94;
    background += foregroundOscilloscope(vUv) * (0.72 + 0.18 * sat(uVolume));
    background += floatingLights(vUv);
    vec3 normal;
    vec3 data;
    float barHit = traceBars(ro, rd, normal, data);
    vec3 color = background;
    float distanceToScene = 0.0;

    if (barHit >= 0.0) {
        vec3 p = ro + rd * barHit;
        color = shadeBar(p, rd, normal, data);
        distanceToScene = barHit;
    } else if (rd.y < -0.0001) {
        float floorHit = -ro.y / rd.y;
        vec3 p = ro + rd * floorHit;
        if (abs(p.x) <= HALF_BASE && abs(p.z) <= HALF_BASE) {
            color = shadeFloor(p);
            distanceToScene = floorHit;
        }
    }

    if (distanceToScene > 0.0) {
        float fog = 1.0 - exp(-distanceToScene * 0.0020);
        color = mix(color, background, fog * 0.55);
    }

    // El osciloscopio ya vive en el fondo; aqui solo se suma el bloom frontal.
    color += proceduralBloom(vUv, color);
    color += audioParticles(uv);
    float vignette = 1.0 - smoothstep(0.45, 1.65, length(uv));
    color *= 0.65 + vignette * 0.35;
    color = vec3(1.0) - exp(-color * 1.25);

    gl_FragColor = vec4(color, 1.0);
    // Three.js moderno. Para GLSL puro, elimina esta linea y convierte a sRGB.
    #include <colorspace_fragment>
}
