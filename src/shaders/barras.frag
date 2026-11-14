// BARRAS 3D — THREE.ShaderMaterial, sin uniforms adicionales.
// 1024 barras = 32x32, sobre una base de 64x64 unidades.
// Cambia GRID_SIZE a 64.0 si quieres 4096 barras (64x64).
// Audio resumido [0,1]; texturas horizontales, amplitud en canal R.
// uWaveform [0,1] con silencio en 0.5. uSpectrum [0,1].
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
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

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

float smoothWaveform(float x) {
    // Suavizado triangular; mantiene la forma de la onda pero elimina ruido fino.
    float texel = 1.0 / 1024.0;
    float value = texture2D(uWaveform, vec2(clamp(x - 2.0 * texel, 0.002, 0.998), 0.5)).r;
    value += texture2D(uWaveform, vec2(clamp(x - texel, 0.002, 0.998), 0.5)).r * 2.0;
    value += texture2D(uWaveform, vec2(clamp(x, 0.002, 0.998), 0.5)).r * 3.0;
    value += texture2D(uWaveform, vec2(clamp(x + texel, 0.002, 0.998), 0.5)).r * 2.0;
    value += texture2D(uWaveform, vec2(clamp(x + 2.0 * texel, 0.002, 0.998), 0.5)).r;
    return value / 9.0;
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

    float height = 0.35 + 26.0 * pow(energy, 0.78)
                 * (0.60 + 0.25 * sat(uVolume) + 0.15 * band)
                 * (1.0 + 0.16 * sat(uBeat));
    return vec3(min(height, MAX_HEIGHT - 0.1), energy, frequency);
}

// Recorrido de las celdas atravesadas por el rayo, no de todas las barras.
// En 16x16 visita como maximo unas 31 celdas por rayo.
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
           * top * (0.25 + 0.70 * data.y + 0.35 * sat(uBeat));

    // Destello adherido a la parte superior de las barras mas energicas.
    float highVolume = smoothstep(0.68, 0.90, sat(uVolume));
    float highBar = smoothstep(0.60, 0.88, data.y);
    float topDistance = abs(p.y - data.x);
    float topSpark = exp(-topDistance * 6.0) * highVolume * highBar;
    float sparkPhase = sin(p.x * 4.7 + p.z * 3.1 + uTime * 5.0);
    topSpark *= smoothstep(0.35, 0.86, sparkPhase);
    color += vec3(1.0, 0.78, 0.28) * topSpark
           * (0.45 + 0.75 * sat(uBeat));

    // Estela procedural: simula acumulacion de movimiento sobre la barra.
    // Se activa solo con volumen alto, beat y energia espectral elevada.
    float fastMotion = smoothstep(0.56, 0.82, sat(uVolume))
                     * (0.28 + 0.72 * sat(uBeat));
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

    // La onda se dibuja tambien sobre el suelo como una linea de osciloscopio.
    float x = clamp((p.x + HALF_BASE) / BASE_SIZE, 0.001, 0.999);
    float wave = smoothWaveform(x) * 2.0 - 1.0;
    float waveTrack = wave * (4.0 + 4.0 * sat(uBass));
    float distanceToWave = abs(p.z - waveTrack);
    float waveformLine = exp(-distanceToWave * (2.0 + 1.8 * sat(uTreble)));
    color += vec3(0.04, 0.65, 0.90) * waveformLine
           * (0.10 + 0.62 * sat(uVolume));

    // Ecos paralelos de la onda: hacen visible la energia incluso entre barras.
    float echoA = exp(-abs(p.z - waveTrack - 1.35) * 3.5);
    float echoB = exp(-abs(p.z - waveTrack + 1.35) * 3.5);
    color += vec3(0.02, 0.20, 0.30) * (echoA + echoB) * sat(uMid) * 0.28;

    float pulseRadius = mod(uTime * 12.0, 48.0);
    float pulse = exp(-abs(length(p.xz) - pulseRadius) * 1.5);
    color += vec3(0.08, 0.38, 0.65) * pulse * sat(uBeat);
    return color;
}

vec3 animatedBackground(vec2 uv, float aspect) {
    vec2 p = uv * vec2(aspect, 1.0);
    float t = mod(uTime, 600.0);
    // Pulso de graves: mezcla el resumen y los primeros bins del espectro.
    // Se limita para que el fondo respire sin robar protagonismo a las barras.
    float lowRhythm = sat(0.68 * smoothSpectrum(0.025) + 0.32 * sat(uBass));
    float bassBreath = 1.0 + lowRhythm * (0.035 + 0.025 * sat(uBeat));
    p /= bassBreath;
    float radius = length(p);

    vec3 color = mix(vec3(0.002, 0.006, 0.018),
                     vec3(0.012, 0.035, 0.075),
                     1.0 - smoothstep(0.0, 1.25, radius));
    color += vec3(0.006, 0.025, 0.065) * lowRhythm;

    // Nebulosa animada de bajo coste.
    float cloud = 0.5 + 0.5 * sin(p.x * 3.1 + sin(p.y * 4.7 + t * (0.16 + lowRhythm * 0.04))
                                  + t * (0.11 + lowRhythm * 0.025));
    cloud *= 0.5 + 0.5 * sin(p.y * 5.3 - t * 0.09 + cloud * 2.2);
    color += vec3(0.015, 0.07, 0.16) * cloud
           * (0.3 + 0.7 * sat(uVolume) + 0.24 * lowRhythm);

    // Rejilla de perspectiva/holografica en el fondo.
    vec2 gridUv = p * (7.0 + 3.0 * sat(uMid)) * (1.0 + lowRhythm * 0.025);
    vec2 gridCell = abs(fract(gridUv - 0.5) - 0.5);
    float grid = 1.0 - smoothstep(0.018, 0.065,
                                  min(gridCell.x, gridCell.y));
    color += vec3(0.01, 0.12, 0.22) * grid
           * (0.18 + 0.34 * sat(uTreble));

    // Frentes de onda que se expanden cuando llega un beat.
    float waveFront = abs(fract(radius * 2.2 - t * 0.12
                                - lowRhythm * 0.08) - 0.5);
    float rings = exp(-waveFront * 34.0)
                * (0.10 + 0.55 * sat(uBeat) + 0.22 * lowRhythm);
    color += vec3(0.025, 0.24, 0.45) * rings;

    float horizonGlow = exp(-abs(p.y + 0.35 * sin(t * 0.13)) * 7.0);
    color += vec3(0.015, 0.10, 0.16) * horizonGlow * lowRhythm * 0.55;
    return color;
}

vec3 foregroundOscilloscope(vec2 uv) {
    // Osciloscopio frontal: uv esta en coordenadas 0..1 y se dibuja
    // despues de las barras, por lo que siempre queda en primer plano.
    float x = clamp(uv.x, 0.002, 0.998);
    float sampleWave = texture2D(uWaveform, vec2(x, 0.5)).r * 2.0 - 1.0;
    float sampleWaveNext = texture2D(uWaveform,
                                     vec2(clamp(x + 0.004, 0.002, 0.998), 0.5)).r * 2.0 - 1.0;
    float waveAmplitude = 0.105 + 0.035 * sat(uVolume) + 0.025 * sat(uBass);
    float center = 0.78;
    float waveY = center - sampleWave * waveAmplitude;
    float lineDistance = abs(uv.y - waveY);
    float lineWidth = 0.0022 + 0.0016 * sat(uTreble) + 0.0018 * sat(uBeat);
    float line = 1.0 - smoothstep(lineWidth, lineWidth + 0.0035, lineDistance);
    float halo = exp(-lineDistance * (150.0 - 38.0 * sat(uVolume)));
    float broadBloom = exp(-lineDistance * (28.0 - 8.0 * sat(uVolume)));

    // Pequeños conectores entre muestras para conservar continuidad visual.
    float slope = abs(sampleWaveNext - sampleWave);
    float sharpGlow = smoothstep(0.035, 0.20, slope) * halo;
    vec3 result = vec3(0.0);
    // Paleta calida para separarlo de las barras cian/violeta.
    result += vec3(1.0, 0.24, 0.045) * line * (0.72 + 0.70 * sat(uVolume));
    result += vec3(0.85, 0.035, 0.16) * halo * (0.25 + 0.48 * sat(uMid));
    result += vec3(1.0, 0.68, 0.12) * sharpGlow * sat(uTreble) * 0.42;
    result += vec3(0.38, 0.015, 0.08) * broadBloom * (0.12 + 0.30 * sat(uVolume));

    // Reticula y limites del panel del osciloscopio.
    float panel = 1.0 - smoothstep(0.0, 0.035, abs(uv.y - center));
    float horizontalGrid = 1.0 - smoothstep(0.0015, 0.005,
                                             abs(fract(uv.y * 10.0) - 0.5));
    float verticalGrid = 1.0 - smoothstep(0.0015, 0.005,
                                           abs(fract(uv.x * 16.0) - 0.5));
    float grid = max(horizontalGrid, verticalGrid);
    result += vec3(0.20, 0.045, 0.025) * grid * panel
            * (0.08 + 0.12 * sat(uVolume));

    float border = 1.0 - smoothstep(0.001, 0.007,
                         min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    result += vec3(0.35, 0.07, 0.025) * border * 0.22;

    // Un destello breve hace evidente cada golpe de percusion.
    result += vec3(1.0, 0.34, 0.04) * line * sat(uBeat) * 0.42;
    return result;
}

vec3 proceduralBloom(vec2 uv, vec3 sceneColor) {
    float t = mod(uTime, 600.0);
    float brightness = dot(sceneColor, vec3(0.2126, 0.7152, 0.0722));
    float brightPass = smoothstep(0.42, 1.15, brightness);

    // Bloom local de altas luces: conserva el color de cada material y añade
    // una segunda capa suave sin necesitar una textura de framebuffer.
    vec3 glow = sceneColor * brightPass * (0.08 + 0.16 * sat(uVolume));

    // Resplandor volumetrico detras de las barras, mas intenso en cada beat.
    vec2 p = uv * 2.0 - 1.0;
    float centerGlow = exp(-length(p * vec2(0.72, 1.05)) * 2.4);
    float movingGlow = 0.5 + 0.5 * sin(t * 0.7 + p.x * 4.0 + p.y * 2.0);
    glow += vec3(0.03, 0.14, 0.30) * centerGlow
          * (0.08 + 0.22 * sat(uBeat) + 0.08 * movingGlow * sat(uBass));

    return glow;
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec3 audioParticles(vec2 uv) {
    // Particulas en pantalla, activadas solo durante volumen alto.
    float activation = smoothstep(0.70, 0.90, sat(uVolume));
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
        float size = 0.0025 + 0.006 * seed2 + 0.005 * sat(uBeat);
        float point = exp(-distanceToParticle * distanceToParticle
                          / max(size * size, 0.00001));
        float fade = smoothstep(0.0, 0.12, life)
                   * (1.0 - smoothstep(0.72, 1.0, life));
        vec3 tint = mix(vec3(1.0, 0.28, 0.06),
                        vec3(0.30, 0.82, 1.0),
                        step(0.58, seed));
        result += tint * point * fade * activationFactor * (0.22 + 0.95 * sat(uBeat));
    }
    return result;
}

void main() {
    vec2 resolution = max(uResolution, vec2(1.0));
    vec2 uv = vUv * 2.0 - 1.0;
    float aspect = resolution.x / resolution.y;
    // En vertical se conserva el ancho de la base en vez de recortarlo.
    vec2 screen = uv * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));

    // Camara orbital suave; para fijarla, sustituye por: float yaw = 0.78;
    float yaw = 0.78 + 0.20 * sin(uTime * 0.08);
    vec3 ro = vec3(cos(yaw) * 88.0, 76.0, sin(yaw) * 88.0);
    vec3 target = vec3(0.0, 9.0, 0.0);
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);
    vec3 rd = normalize(forward * 2.15 + right * screen.x + up * screen.y);

    vec3 background = animatedBackground(vUv * 2.0 - 1.0, max(aspect, 1.0));

    // Pantalla trasera: se dibuja antes de las barras, que ahora la ocluyen
    // de forma natural. La atenuacion crea profundidad y evita que compita
    // con las alturas del grafico.
    background += foregroundOscilloscope(vUv) * (0.48 + 0.18 * sat(uVolume));
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
