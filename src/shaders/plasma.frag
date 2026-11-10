precision highp float;
 
varying vec2 vUv;
 
uniform float uTime;
uniform vec2  uResolution;
 
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
 
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.141592653589793
#define TAU 6.283185307179586
/* ------------------------------------------------------------------ noise */

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for(int i = 0; i < 5; i++){
        s += a * vnoise(p);
        p = rot * p * 2.03 + 17.1;
        a *= 0.5;
    }
    return s;
}
/* ------------------------------------------- 1-D audio textures (row layout) */

float sampleSpec(float x){
    return texture2D(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}

float sampleWave(float x) {
    // waveforms are usually centered on 0.5 -> remap to -1..1
    return texture2D(uWaveform, vec2(clamp(x, 0.0, 1.0), 0.5)).r * 2.0 - 1.0;
}
/* ------------------------------------------------------ cosine palette (IQ) */

vec3 palette(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
}
/* --------------------------------------------------------------------- main /

/ ---- audio, clamped for safety ---- */
void main() {
    float bass = clamp(uBass, 0.0, 1.0);
    float mid = clamp(uMid, 0.0, 1.0);
    float treb = clamp(uTreble, 0.0, 1.0);
    float vol = clamp(uVolume, 0.0, 1.0);
    float beat = clamp(uBeat, 0.0, 1.0);
    float t = uTime;

    /* ---- centered, aspect-corrected space ---- */
    vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    p *= 2.0;

    /* ---- polar coordinates ---- */
    float r = length(p) + 1e-4;
    float a = atan(p.y, p.x);

    /* ---- waveform shivers the radius (stronger towards the rim) ---- */
    float w = sampleWave(fract(a / TAU + 0.5));
    r += w * (0.02 + 0.10 * treb) * smoothstep(0.0, 0.9, r);

    /* ---- kaleidoscopic fold; mid changes the symmetry order ---- */
    float fold = 4.0 + floor(mid * 5.0 + beat * 2.0);   // 4 .. 11 sectors
    float seg  = TAU / fold;
    float ka   = mod(a + t * 0.12, seg);
    ka = abs(ka - seg * 0.5);                            // mirrored wedge
    vec2 kp = vec2(cos(ka), sin(ka)) * r;

    /* ---- spectrum mapped onto the radius ---- */
    float sp = sampleSpec(clamp(r * 0.55, 0.0, 1.0));

    /* ---- domain warping driven by bass ---- */
    vec2 q = kp * (1.6 + 1.8 * mid) + vec2(0.0, -t * 0.30);
    vec2 warp = vec2(
        fbm(q + vec2(0.0,  t * 0.21)),
        fbm(q + vec2(5.2, -t * 0.17))
    );
    q += warp * (0.6 + 2.4 * bass) + (sp - 0.5) * 1.2;

    /* ---- layered noise + iso-contours ---- */
    float detail = 1.5 + 3.0 * treb;
    float f  = fbm(q * detail);
    float f2 = fbm(q * detail * 2.1 + 3.7);

    float phase = f * 6.0 + r * 3.0 - t * 0.45 - beat * 1.2;
    float iso   = abs(fract(phase) - 0.5);
    float lines = 0.020 / (iso * iso + 0.020);           // glowing filaments

    float iso2   = abs(fract(f2 * 9.0 + t * 0.2) - 0.5);
    float lines2 = 0.006 / (iso2 * iso2 + 0.006);        // fine micro-detail

    /* ---- beat shockwave rings ---- */
    float rings = sin(r * 26.0 - t * 9.0);
    rings = pow(max(rings, 0.0), 6.0) * beat * exp(-r * 2.2);

    /* ---- core bloom ---- */
    float core = exp(-r * (5.0 - 2.5 * bass)) * (0.5 + 1.5 * sp + beat);

    /* ---- colour ---- */
    vec3 base = palette(0.05 + f * 0.7 + r * 0.35 + t * 0.04 + mid * 0.5 + w * 0.08);
    vec3 acc  = palette(0.55 + f2 * 0.5 + treb * 0.4 + t * 0.02);

    vec3 col = vec3(0.0);
    col += base * lines * 0.55;
    col += acc  * lines2 * (0.12 + 0.5 * treb);
    col += mix(base, acc, 0.5) * rings * 1.8;
    col += base * core * (0.35 + 0.9 * vol);
    col += vec3(1.0, 0.85, 0.65) * beat * exp(-r * 6.0) * 0.8;

    /* ---- treble sparkle dust ---- */
    vec2  g = floor(p * (60.0 + 90.0 * treb));
    float h = hash21(g + floor(t * 6.0));
    float star = smoothstep(0.985, 1.0, h) * treb;
    col += vec3(0.80, 0.90, 1.0) * star * 2.0 * exp(-r * 0.8);

    /* ---- post: exposure, falloff, tonemap, gamma, dither ---- */
    col *= 0.55 + 0.9 * vol;
    col *= 1.0 - 0.45 * smoothstep(0.4, 1.7, r);

    col = col / (1.0 + col);                             // Reinhard
    col = pow(max(col, 0.0), vec3(0.4545));              // gamma

    col += (hash21(vUv * uResolution + fract(t)) - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
}