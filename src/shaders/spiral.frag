precision highp float;
 
// Coordinates from the vertex shader
varying vec2 vUv;
 
// Global time
uniform float uTime;
 
// Render resolution
uniform vec2  uResolution;
 
// Summarised audio data
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;      // expects a decaying envelope: 1.0 on hit -> 0.0
 
// Audio textures (1D, values normalised to 0..1, read from .r)
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TAU 6.28318530718
// ---------------------------------------------------------------- helpers

float hash21(vec2 p) {
p = fract(p * vec2(123.34, 456.21));
p += dot(p, p + 45.32);
return fract(p.x * p.y);
}
vec3 palette(float t) {

return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}
// ---------------------------------------------------------------- main

void main() {
// Aspect-correct, centred coordinates: r = 1.0 on the short axis
vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;
float r = length(p);

float ang = atan(p.y, p.x);
 
// rotation: ~0.12 rad/s ⇒ one full turn every ~52 s
float rot = uTime * 0.2;
ang      += rot;
 
float a01 = fract(ang / TAU + 0.5);   // fract() keeps it in 0..1

float t     = uTime;
float beat  = clamp(uBeat, 0.0, 1.0);
float pixel = 1.0 / uResolution.y;     // ~1px feather

vec3 col = vec3(0.0);

// ------------------------------------------------ 1. background
float bgFall = 1.0 - smoothstep(0.0, 1.3, r);
vec3  bg     = mix(vec3(0.02, 0.01, 0.04), vec3(0.10, 0.04, 0.18), bgFall);
bg          *= 0.7 + 0.6 * uVolume + 0.4 * beat;
col         += bg;

// ------------------------------------------------ 2. bass core
float coreR    = 0.09 + 0.10 * uBass + 0.03 * beat;
float coreGlow = exp(-max(r - coreR, 0.0) * 10.0);
vec3  coreCol  = palette(0.15 + 0.35 * uTreble + t * 0.02);
col += coreCol * coreGlow * (0.5 + 2.2 * uBass + 0.8 * beat);
col += vec3(1.0) * exp(-r * 22.0) * (0.4 + 1.2 * uBass);   // hot centre

// ------------------------------------------------ 3. spectrum bars
const float BARS     = 128.0;
const float SPEC_POW = 0.7;            // <1 gives high freqs more arc space

float cell   = floor(a01 * BARS);
float fc     = (cell + 0.5) / BARS;
float fx     = pow(fc, SPEC_POW);      // perceptual remap of the spectrum
float spec   = texture2D(uSpectrum, vec2(fx, 0.5)).r;
spec = clamp(spec * (0.9 + 0.1 * sin(t * 4.0 + cell * 0.7)), 0.0, 1.0);

// angular gap between bars (tapered ends)
float dAng    = abs(fract(a01 * BARS) - 0.5) * 2.0;   // 0 = centre, 1 = border
float gapMask = 1.0 - smoothstep(0.60, 1.0, dAng);

float baseR  = 0.40 + 0.05 * uBass + 0.02 * beat;
float barLen = spec * (0.30 + 0.30 * uBass + 0.20 * uMid);
float outerR = baseR + barLen;

float radialMask = smoothstep(baseR - pixel, baseR + pixel, r)
                 * (1.0 - smoothstep(outerR - pixel, outerR + pixel, r));
float barMask    = radialMask * gapMask * step(0.015, spec);

vec3 barCol = palette(fc * 1.2 + 0.10 + t * 0.05 + uTreble * 0.30);
col += barCol * barMask * (0.5 + 1.8 * spec) * (0.8 + 0.5 * uTreble);

// ------------------------------------------------ 4. waveform ring
float wave  = texture2D(uWaveform, vec2(a01, 0.5)).r * 2.0 - 1.0;
float waveR = baseR - 0.07 + wave * (0.05 + 0.08 * uBass);
float wLine = 1.0 - smoothstep(0.0, 0.008 + pixel * 1.5, abs(r - waveR));
col += mix(vec3(1.0), palette(0.5 + uMid), 0.35)
     * wLine * (0.5 + 1.2 * uMid + 0.5 * uVolume);

// ------------------------------------------------ 5. beat shockwave
float age    = 1.0 - beat;                       // 0 at hit -> 1 when decayed
float shockR = 0.12 + age * 1.05;                // expands outward
float shockW = 0.02 + 0.06 * beat;
float shock  = exp(-pow((r - shockR) / shockW, 2.0)) * beat;
col += palette(0.75 + age * 0.5) * shock * 1.6;

// ------------------------------------------------ 6. post
col *= 1.0 - 0.50 * smoothstep(0.45, 1.70, r);   // vignette
col += (hash21(vUv * uResolution + t) - 0.5) * 0.035;  // grain
col  = 1.0 - exp(-col * 1.3);                    // soft tonemap

// Remove this line if your renderer already outputs sRGB
col = pow(max(col, 0.0), vec3(1.0 / 2.2));

gl_FragColor = vec4(col, 1.0);
}