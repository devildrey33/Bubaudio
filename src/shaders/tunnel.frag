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

#define PI 3.14159265359
#define TAU 6.28318530718
float hash21(vec2 p) {

p = fract(p * vec2(123.34, 456.21));
p += dot(p, p + 45.32);
return fract(p.x * p.y);
}
float noise21(vec2 p) {

vec2 i = floor(p);
vec2 f = fract(p);
f = f * f * (3.0 - 2.0 * f);
return mix(mix(hash21(i),
hash21(i + vec2(1.0, 0.0)), f.x),
mix(hash21(i + vec2(0.0, 1.0)),
hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 palette(float t) {

return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}
void main() {

// aspect-correct centred coords, r ≈ 1 at screen edges
vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;
float r = length(p);
float ang = atan(p.y, p.x);
float t = uTime;
float beat = clamp(uBeat, 0.0, 1.0);
// ---------------------------------------------------------------- tunnel
// Bass opens the corridor (everything scales out slightly)
float rEff  = r / (1.0 + 0.18 * uBass + 0.10 * beat);
float depth = 1.0 / max(rEff, 0.025);

// Waveform warps the wall depth per angle -> breathing corridor
float a01 = ang / TAU + 0.5;
float wf  = texture2D(uWaveform, vec2(fract(a01), 0.5)).r * 2.0 - 1.0;
depth *= 1.0 + 0.08 * wf * (0.4 + uBass);

// Scroll outward (features rush toward the viewer)
float speed = 1.2 + uMid * 3.5 + beat * 2.5;
float z = depth * 1.2 + t * speed;

// Rotation + slow twist, driven by mid
float segs = 14.0;
float a = ang / TAU * segs + t * (0.06 + uMid * 0.28) + depth * 0.09;

float fog = exp(-depth * 0.16);   // distance haze

float rz = fract(z);
float az = fract(a);
float ri = floor(z);
float ai = floor(a);

// distance-to-integer -> crisp rings / spokes
float ringLine  = 1.0 - smoothstep(0.0, 0.10, min(rz, 1.0 - rz));
float spokeLine = 1.0 - smoothstep(0.0, 0.12, min(az, 1.0 - az));

vec3 col = vec3(0.0);

// ------------------------------------------------ 1. neon grid
vec3 ringCol  = palette(fract(ri * 0.13) + uTreble * 0.35 + 0.05);
vec3 spokeCol = palette(fract(ai * 0.17) + 0.42 + uMid * 0.30);
float shim    = 0.65 + 0.55 * noise21(vec2(a, z * 1.5 - t));

col += ringCol  * ringLine  * fog * shim * (0.6 + 1.6 * uVolume + 2.2 * beat);
col += spokeCol * spokeLine * fog * shim * (0.5 + 1.2 * uVolume + 1.6 * beat);

// ------------------------------------------------ 2. wall interior glow
float wallGlow = smoothstep(0.55, 0.0, rz) * 0.35;
col += palette(0.55 + uMid * 0.3) * wallGlow * fog * (0.3 + 1.0 * uBass);

// ------------------------------------------------ 3. beat shockwave
float shock = exp(-pow((rz - 0.5) * 6.0, 2.0)) * beat;
col += palette(0.95) * shock * 1.6 * fog;

// ------------------------------------------------ 4. warp streaks
float streaks = pow(noise21(vec2(a * 5.0, z * 0.6 + t * 2.5)), 8.0) * 6.0;
col += palette(0.7 + uTreble * 0.3) * streaks * fog * (0.3 + uBass + 1.5 * beat);

// ------------------------------------------------ 5. hot core
float coreR  = 0.05 + 0.10 * uBass + 0.04 * beat;
vec3  coreCol = mix(vec3(1.0, 0.95, 1.0), palette(0.1 + uTreble * 0.5), 0.4);
col += coreCol * exp(-r / coreR) * (0.8 + 2.5 * uBass + 1.0 * beat);

// ------------------------------------------------ 6. treble sparkles
float sp = step(0.98 - 0.08 * uTreble, hash21(floor(vec2(a * 3.0, z * 3.0))));
col += vec3(1.0) * sp * uTreble * fog * 2.0;

// ------------------------------------------------ post
col *= 1.0 - 0.35 * smoothstep(0.7, 1.5, r);          // vignette
col += (hash21(vUv * uResolution + t) - 0.5) * 0.04;  // grain
col  = 1.0 - exp(-col * 1.25);                        // tonemap

gl_FragColor = vec4(col, 1.0);
}