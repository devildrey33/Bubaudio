// MATRIZ + DISTORSION DE ONDA AUDIOREACTIVA
// Shader procedural para THREE.ShaderMaterial / GLSL ES 1.00.
// Requiere varying vec2 vUv desde el vertex shader.
// Audio resumido y texturas en el canal R, normalizados a [0,1].
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

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float sat(float x) {
    return clamp(x, 0.0, 1.0);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(41.17, 289.31))) * 43758.5453;
    return fract(vec2(n, n * 1.731 + 17.17));
}

float spectrum(float x) {
    return sat(texture2D(uSpectrum, vec2(clamp(x, 0.002, 0.998), 0.5)).r);
}

float waveform(float x) {
    return texture2D(uWaveform, vec2(clamp(x, 0.002, 0.998), 0.5)).r * 2.0 - 1.0;
}

// Caracteres pseudo-digitales de 5x7 bits. No necesita una textura de fuente.
float glyph5x7(float id, vec2 cell) {
    float x = floor(cell.x);
    float y = floor(cell.y);
    if (x < 0.0 || x > 4.0 || y < 0.0 || y > 6.0) return 0.0;

    // Cada identificador genera una mascara determinista con diagonales y huecos.
    float seed = floor(id * 17.0 + 3.0);
    float bitA = floor(mod(seed * 1.37 + y * 5.0 + x * 3.0, 7.0));
    float bitB = floor(mod(seed * 0.73 + y * 3.0 - x * 2.0, 5.0));
    float frame = step(0.5, step(0.5, x) * step(x, 3.5)
                             + step(0.5, y) * step(y, 5.5));
    float diagonal = step(0.5, mod(x + y + seed, 3.0));
    float center = step(0.5, 1.0 - abs(x - 2.0)) * step(0.5, 1.0 - abs(y - 3.0));
    return max(frame * step(0.5, bitA), max(diagonal * step(0.5, bitB), center));
}

// Una columna de caracteres con profundidad y velocidad propia.
float matrixColumn(vec2 p, float columnCount, float seedOffset) {
    float scaledX = p.x * columnCount;
    float column = floor(scaledX);
    float localX = fract(scaledX);
    float seed = hash21(vec2(column, seedOffset));
    float speed = mix(0.55, 1.65, seed) * (0.70 + 0.55 * sat(uMid));
    float head = fract(uTime * speed * 0.085 + seed * 4.0 + seedOffset);
    float trailLength = mix(0.16, 0.43, hash21(vec2(column + 4.0, seedOffset)));
    float localY = fract(p.y + head);
    float trail = 1.0 - smoothstep(trailLength, 0.0, localY);
    float row = floor((p.y + head) * 25.0);
    float glyphX = fract(localX * 7.0) * 5.0;
    float glyphY = fract((p.y + head) * 25.0) * 7.0;
    float id = hash21(vec2(column + row * 0.17, seedOffset + 11.0));
    float glyph = glyph5x7(id * 13.0, vec2(glyphX, glyphY));

    float headLight = 1.0 - smoothstep(0.0, 0.12, localY);
    float scan = 0.72 + 0.28 * sin((p.y + head) * 25.0 * PI);
    float audioBand = spectrum(fract((column + 0.5) / columnCount));
    return glyph * trail * scan * (0.38 + 0.82 * audioBand)
         + glyph * headLight * (0.75 + 0.8 * sat(uBeat));
}

void main() {
    float bass = sat(uBass);
    float mid = sat(uMid);
    float treble = sat(uTreble);
    float volume = sat(uVolume);
    float beat = sat(uBeat);
    float t = mod(uTime, 600.0);

    vec2 resolution = max(uResolution, vec2(1.0));
    vec2 uv = vUv;
    vec2 aspectUv = (uv * 2.0 - 1.0)
                  * vec2(resolution.x / resolution.y, 1.0);

    // Distorsion principal: cada punto de la pantalla toma una onda de audio.
    float waveSample = waveform(uv.x * 0.92 + 0.04);
    float waveSample2 = waveform(fract(uv.x * 0.53 + t * 0.018));
    float waveField = sin(uv.x * 18.0 + t * 1.3)
                    * (0.45 + 0.55 * abs(waveSample));
    float distortion = waveSample * (0.035 + 0.13 * volume)
                     + waveField * (0.008 + 0.035 * mid)
                     + waveSample2 * 0.028 * beat;

    vec2 warped = uv;
    warped.y += distortion;
    warped.x += sin(uv.y * 15.0 - t * 1.8) * (0.006 + 0.025 * bass);

    // Separacion cromatica reactiva, como aberracion de una pantalla dañada.
    float chroma = 0.002 + 0.010 * treble + 0.018 * beat;
    vec2 redUv = warped + vec2(chroma * waveSample, 0.0);
    vec2 blueUv = warped - vec2(chroma * waveSample, 0.0);

    float greenRain = matrixColumn(warped, 34.0, 2.0);
    float redRain = matrixColumn(redUv, 34.0, 8.0);
    float blueRain = matrixColumn(blueUv, 34.0, 17.0);

    vec3 color = vec3(redRain * 0.44, greenRain, blueRain * 0.72);

    // Rejilla digital y lineas de refresco.
    vec2 gridUv = warped * vec2(34.0, 25.0);
    vec2 gridCell = fract(gridUv);
    float gridLines = 1.0 - smoothstep(0.035, 0.12,
                           min(gridCell.x, gridCell.y));
    float scanline = 0.5 + 0.5 * sin(warped.y * resolution.y * 0.09 + t * 8.0);
    color += vec3(0.005, 0.07, 0.04) * gridLines * (0.5 + 0.5 * scanline);
    color *= 0.82 + 0.18 * scanline;

    // Onda sonora visible: una serpiente luminosa que atraviesa la lluvia.
    float waveY = 0.5 + waveSample * (0.07 + 0.15 * volume)
                + 0.025 * sin(uv.x * 52.0 - t * 3.0);
    float distanceToWave = abs(uv.y - waveY);
    float waveLine = exp(-distanceToWave * (115.0 - 35.0 * treble));
    float waveHalo = exp(-distanceToWave * 22.0);
    color += vec3(0.10, 0.95, 0.62) * waveLine * (0.4 + volume * 0.9);
    color += vec3(0.02, 0.36, 0.28) * waveHalo * (0.25 + mid * 0.55);

    // Banda de espectro deformadora en el centro.
    float spectralBand = spectrum(uv.x);
    float bandY = 0.51 + (spectralBand - 0.5) * (0.09 + 0.10 * bass);
    float band = exp(-abs(uv.y - bandY) * 38.0) * spectralBand;
    color += vec3(0.05, 0.42, 0.22) * band * (0.3 + volume);

    // Glitches horizontales disparados por graves y beats.
    float glitchSeed = floor(uv.y * 95.0 + t * 0.7);
    float glitchRandom = hash21(vec2(glitchSeed, floor(t * 2.0)));
    float glitch = step(0.76 - beat * 0.20, glitchRandom)
                 * step(0.30, sin(t * 8.0 + glitchSeed));
    float glitchOffset = (hash21(vec2(glitchSeed + 8.0, t)) - 0.5)
                       * glitch * (0.035 + 0.11 * bass);
    float glitchRain = matrixColumn(warped + vec2(glitchOffset, 0.0), 34.0, 29.0);
    color += vec3(glitchRain * 0.20, glitchRain * 0.55, glitchRain * 0.30) * glitch;

    // Destellos verticales de alta frecuencia.
    float sparkColumn = floor(uv.x * 34.0);
    float sparkId = hash21(vec2(sparkColumn, floor(t * 0.45)));
    float spark = exp(-abs(fract(uv.y + t * (0.05 + sparkId * 0.1)) - sparkId)
                      * 65.0);
    color += vec3(0.25, 1.0, 0.64) * spark * treble
           * (0.18 + 0.75 * beat);

    // Viñeta y brillo fosforado de monitor.
    float vignette = 1.0 - smoothstep(0.35, 1.25, length(aspectUv));
    float phosphor = 0.90 + 0.10 * sin(uv.y * resolution.y * 0.045);
    color *= (0.38 + 0.62 * vignette) * phosphor;
    color *= 0.60 + 0.75 * volume;
    color = vec3(1.0) - exp(-color * 1.65);
    color = pow(max(color, vec3(0.0)), vec3(0.92));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
