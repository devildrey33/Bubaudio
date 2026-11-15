precision highp float;

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

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define TAU 6.28318530718

float hash21(vec2 point)
{
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
}

vec3 audioRibbon(
    vec2 point,
    float angle,
    float colorOffset,
    float strength,
    float widthScale
)
{
    float c = cos(angle);
    float s = sin(angle);
    vec2 localPoint = mat2(c, -s, s, c) * point;
    float wavePosition = fract(localPoint.x * 0.075 + 0.5 + uTime * 0.008);
    float wave = texture2D(uWaveform, vec2(wavePosition, 0.5)).r * 2.0 - 1.0;
    float frequency = texture2D(
        uSpectrum,
        vec2(fract(abs(localPoint.x) * 0.18), 0.5)
    ).r;
    float centerLine = wave * (0.075 + uBass * 0.23)
                     + 0.018 * sin(localPoint.x * 2.4 + uTime * 0.25);
    float width = (0.028 + frequency * (0.13 + uMid * 0.05)) * widthScale;
    float distanceToLine = abs(localPoint.y - centerLine);
    float core = 1.0 - smoothstep(width * 0.38, width, distanceToLine);
    float glow = exp(-distanceToLine / max(width * 2.8, 0.012));
    vec3 hue;
    if (colorOffset < 0.5)
    {
        hue = mix(vec3(0.30, 0.82, 0.20), vec3(0.62, 0.68, 0.86),
                  smoothstep(-1.4, 1.4, localPoint.x));
    }
    else if (colorOffset < 0.7)
    {
        hue = mix(vec3(0.70, 0.70, 0.84), vec3(0.24, 0.78, 0.38),
                  smoothstep(-1.2, 1.2, localPoint.x));
    }
    float energy = (core * (0.65 + frequency * 1.5)
                  + glow * (0.12 + uVolume * 0.24)) * strength;
    return hue * energy;
}

void main()
{
    vec2 point = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float angle01 = fract(angle / TAU + 0.5 + uTime * 0.006);
    float pixel = 1.0 / uResolution.y;
    float beat = max(uBeat, max(uMidBeat, uTrebleBeat));
    vec3 color = vec3(0.001, 0.002, 0.009);

    vec2 starCell = floor(point * 34.0);
    vec2 starOffset = fract(point * 34.0) - 0.5;
    float starSeed = hash21(starCell);
    float star = (1.0 - smoothstep(0.012, 0.055, length(starOffset)))
               * step(0.986, starSeed);
    float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + starSeed * 4.0) + starSeed * TAU);
    color += vec3(0.44, 0.57, 0.92) * star * twinkle * (0.45 + uVolume * 0.8);

    float vignette = 1.0 - smoothstep(0.72, 1.75, radius);
    color += audioRibbon(point, 0.0, 0.32, 1.15, 1.5);
    color += audioRibbon(point, 1.5708, 0.64, 0.78, 0.42);

    float spectrum = texture2D(
        uSpectrum,
        vec2(pow(angle01, 0.72), 0.5)
    ).r;
    float waveform = texture2D(uWaveform, vec2(angle01, 0.5)).r * 2.0 - 1.0;
    float ringRadius = 0.66
                     + waveform * (0.012 + uBass * 0.025)
                     + (spectrum - 0.12) * (0.11 + uTreble * 0.06);
    float ringDistance = abs(radius - ringRadius);
    float ringLine = exp(-pow(ringDistance / (0.003 + pixel * 1.2), 2.0));
    float ringGlow = exp(-ringDistance * 18.0);
    color += vec3(0.12, 0.84, 0.30)
           * (ringLine * (0.75 + spectrum * 1.2) + ringGlow * 0.14);

    float innerWaveRadius = 0.31 + waveform * (0.018 + uBass * 0.055);
    float innerWave = exp(-pow((radius - innerWaveRadius) / (0.003 + pixel), 2.0));
    color += vec3(0.16, 0.72, 0.32) * innerWave * (0.6 + uMid * 0.7);

    float spiralPhase = mod(angle + uTime * 0.12 + TAU, TAU) / TAU;
    float spiralRadius = 0.17 + spiralPhase * 0.72;
    float spiralDistance = abs(radius - spiralRadius);
    float spiralLine = exp(-pow(spiralDistance / (0.006 + pixel * 1.4), 2.0));
    float spiralGlow = exp(-spiralDistance * 18.0);
    color += vec3(0.62, 0.78, 0.92) * (spiralLine * 0.85 + spiralGlow * 0.10);

    float coreRadius = 0.072 + uBass * 0.022 + beat * 0.025;
    float core = 1.0 - smoothstep(coreRadius - pixel, coreRadius + pixel, radius);
    float coreRim = exp(-pow((radius - coreRadius) / (0.008 + pixel), 2.0));
    float sphereShade = 0.62 + 0.38 * clamp(1.0 - length(point) / max(coreRadius, 0.001), 0.0, 1.0);
    color += vec3(0.18, 0.34, 0.92) * core * sphereShade;
    color += vec3(0.60, 0.74, 1.0) * coreRim * (0.65 + uBeat);
    color += vec3(1.0, 0.98, 1.0) * exp(-radius * 52.0) * (1.35 + uBass + beat * 0.8);
    color += vec3(0.30, 0.32, 0.86) * exp(-max(radius - coreRadius, 0.0) * 10.0)
           * (0.10 + uVolume * 0.16 + beat * 0.2);

    float beatRingRadius = 0.16 + (1.0 - beat) * 0.58;
    float beatRing = exp(-pow((radius - beatRingRadius) / (0.012 + beat * 0.025), 2.0)) * beat;
    color += vec3(0.22, 0.86, 0.40) * beatRing * 1.2;

    color *= vignette;
    color = 1.0 - exp(-color * (1.25 + uVolume * 0.35));
    color = pow(max(color, 0.0), vec3(1.0 / 2.2));
    gl_FragColor = vec4(color, 1.0);
}
