
precision highp float;

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

// ------------------------------------------------------------
// HASH & NOISE
// ------------------------------------------------------------

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// ------------------------------------------------------------
// FRACTAL TURBULENCE
// ------------------------------------------------------------

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;

    for (int i = 0; i < 4; i++) {
        v += noise(p) * a;
        p = p * 2.02 + vec2(3.7, 1.9);
        a *= 0.5;
    }

    return v;
}

// ------------------------------------------------------------
// INDIVIDUAL FLAME TONGUE
// ------------------------------------------------------------

float flameTongue(
    vec2 p,
    float center,
    float width,
    float height,
    float seed,
    float speed
) {
    float t = uTime * speed;

    // Coordenadas locales: q.y = 0 corresponde al borde inferior.
    vec2 q = vec2(
        (p.x - center) / width,
        p.y / height
    );

    float y = clamp(q.y, 0.0, 1.0);

    // Turbulencia de diferentes escalas.
    float n1 = fbm(vec2(
        q.x * 2.5 + seed,
        y * 3.0 - t
    ));

    float n2 = noise(vec2(
        q.x * 7.0 - seed,
        y * 8.0 - t * 1.7
    ));

    float turbulence = (n1 - 0.5) * 0.65 +
                       (n2 - 0.5) * 0.22;

    // Oscilación lateral orgánica.
    float sway = sin(y * 7.0 - t * 2.0 + seed) * 0.13;
    sway += sin(y * 13.0 + t * 1.3 + seed) * 0.045;

    q.x -= turbulence + sway;

    // Estrechamiento progresivo hacia la punta.
    float taper = 1.0 - pow(y, 1.35) * 0.91;

    // Bordes irregulares.
    float edgeNoise = (n2 - 0.5) * 0.15;
    float shapeWidth = taper + edgeNoise;

    float body = 1.0 - smoothstep(
        shapeWidth * 0.68,
        shapeWidth,
        abs(q.x)
    );

    // Desaparición de la punta.
    float tip = 1.0 - smoothstep(0.88, 1.0, q.y);

    // La llama nace directamente en el borde inferior.
    // No aplicamos ningún fade en su nacimiento.
    float bottom = 1.0 - smoothstep(0.0, 0.045, -q.y);

    return body * tip * bottom;
}

// ------------------------------------------------------------
// SECONDARY FLAMES
// ------------------------------------------------------------

float smallFlames(vec2 p, float energy) {
    float result = 0.0;

    result += flameTongue(
        p, -0.38, 0.095, 0.34 + energy * 0.12,
        3.1, 2.1
    ) * 0.65;

    result += flameTongue(
        p, 0.39, 0.090, 0.39 + energy * 0.12,
        8.4, 2.4
    ) * 0.65;

    result += flameTongue(
        p, -0.12, 0.070, 0.28 + energy * 0.10,
        5.6, 2.7
    ) * 0.55;

    result += flameTongue(
        p, 0.17, 0.075, 0.32 + energy * 0.10,
        9.2, 2.3
    ) * 0.55;

    return result;
}

// ------------------------------------------------------------
// SPARK PARTICLES
// ------------------------------------------------------------

vec3 sparks(vec2 p, float energy) {
    vec3 result = vec3(0.0);

    for (int i = 0; i < 32; i++) {
        float fi = float(i);
        float seed = fi * 17.13;

        float x = (hash21(vec2(seed, 1.0)) - 0.5) * 1.05;

        float velocity = 0.14 +
                         hash21(vec2(seed, 2.0)) * 0.20 +
                         energy * 0.20;

        float y = fract(
            hash21(vec2(seed, 3.0)) +
            uTime * velocity
        );

        float spawn = hash21(vec2(seed, 4.0));

        float posX = x * (0.35 + y * 0.7);
        posX += sin(uTime * 1.8 + seed) * 0.025;

        vec2 pos = vec2(posX, y * 0.85);

        float d = length(p - pos);

        float size = 0.0025 +
                     hash21(vec2(seed, 5.0)) * 0.0025;

        size += uHiHat * 0.002 +
                uHiHatPeak * 0.003 +
                uTrebleBeat * 0.001;

        float particle = 1.0 - smoothstep(
            size * 0.25,
            size,
            d
        );

        float glow = exp(-d * 40.0) * 0.08;

        float brightness = particle + glow;
        brightness *= smoothstep(0.0, 0.15, spawn + 0.15);

        result += vec3(1.0, 0.48, 0.055) * brightness;
    }

    return result;
}

// ------------------------------------------------------------
// FIRE COLOR
// ------------------------------------------------------------

vec3 fireGradient(float y) {
    vec3 deepRed = vec3(0.48, 0.018, 0.002);
    vec3 red     = vec3(0.88, 0.065, 0.004);
    vec3 orange  = vec3(1.00, 0.22, 0.008);
    vec3 yellow  = vec3(1.00, 0.66, 0.055);

    vec3 col = mix(
        deepRed,
        red,
        smoothstep(0.55, 0.95, y)
    );

    col = mix(
        orange,
        col,
        smoothstep(0.20, 0.55, y)
    );

    col = mix(
        yellow,
        col,
        smoothstep(0.05, 0.30, y)
    );

    return col;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

void main() {

    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;

    // --------------------------------------------------------
    // CORRECTED COORDINATES
    // --------------------------------------------------------

    // X está centrada horizontalmente.
    // Y conserva el rango original 0..1.
    // IMPORTANTE: p.y = 0 es ahora el borde inferior.
    vec2 p = uv - 0.5;
    p.x *= aspect;

    vec2 fireP = vec2(p.x, uv.y);

    // --------------------------------------------------------
    // AUDIO ANALYSIS
    // --------------------------------------------------------

    float bass = clamp(uBass, 0.0, 1.0);
    float mid = clamp(uMid, 0.0, 1.0);
    float treble = clamp(uTreble, 0.0, 1.0);

    float kick = clamp(uKick, 0.0, 1.0);
    float snare = clamp(uSnare, 0.0, 1.0);
    float voice = clamp(uVoice, 0.0, 1.0);
    float hihat = clamp(uHiHat, 0.0, 1.0);

    float impact = clamp(
        max(uKickPeak, uBeat * 0.7),
        0.0, 1.0
    );

    float secondaryImpact = clamp(
        max(uSnarePeak, uMidBeat * 0.65),
        0.0, 1.0
    );

    float energy = clamp(
        bass * 0.45 +
        mid * 0.20 +
        uVolume * 0.20 +
        kick * 0.15,
        0.0, 1.0
    );

    // --------------------------------------------------------
    // TEXTURE REACTIVITY
    // --------------------------------------------------------

    float specBass = texture2D(
        uSpectrum,
        vec2(0.08, 0.5)
    ).r;

    float specMid = texture2D(
        uSpectrum,
        vec2(0.38, 0.5)
    ).r;

    float specHigh = texture2D(
        uSpectrum,
        vec2(0.82, 0.5)
    ).r;

    // Waveform horizontal, con centro neutral en 0.5.
    float wave = texture2D(
        uWaveform,
        vec2(clamp(uv.x, 0.001, 0.999), 0.5)
    ).r * 2.0 - 1.0;

    // --------------------------------------------------------
    // FIRE DIMENSIONS
    // --------------------------------------------------------

    float fireHeight = 0.47 +
                       bass * 0.12 +
                       kick * 0.09 +
                       impact * 0.10;

    fireHeight = clamp(fireHeight, 0.42, 0.78);

    float widthBoost = bass * 0.045 +
                       impact * 0.035;

    // Movimiento lateral de toda la estructura.
    float globalSway = sin(uTime * 1.3) * 0.012 +
                       sin(uTime * 2.7) * mid * 0.018;

    globalSway += wave * 0.008;

    fireP.x -= globalSway;

    // --------------------------------------------------------
    // MAIN FLAMES: 7 INDEPENDENT TONGUES
    // --------------------------------------------------------

    float f1 = flameTongue(
        fireP, -0.29, 0.155 + widthBoost,
        fireHeight * 0.78 + impact * 0.06,
        1.2, 1.35
    );

    float f2 = flameTongue(
        fireP, -0.19, 0.165 + widthBoost,
        fireHeight * 0.94,
        3.7, 1.65
    );

    float f3 = flameTongue(
        fireP, -0.065, 0.155,
        fireHeight * 0.82 + bass * 0.08,
        6.3, 1.45
    );

    float f4 = flameTongue(
        fireP, 0.075, 0.165,
        fireHeight,
        8.5, 1.8
    );

    float f5 = flameTongue(
        fireP, 0.205, 0.145 + widthBoost,
        fireHeight * 0.87,
        11.3, 1.55
    );

    float f6 = flameTongue(
        fireP, 0.315, 0.125,
        fireHeight * 0.72,
        14.8, 2.0
    );

    float f7 = flameTongue(
        fireP, -0.39, 0.105,
        fireHeight * 0.64,
        17.4, 1.9
    );

    float mainFire = max(
        max(max(f1, f2), max(f3, f4)),
        max(f5, max(f6, f7))
    );

    // Lenguas secundarias.
    float secondary = smallFlames(
        fireP,
        energy + impact * 0.4
    );

    float flames = max(mainFire, secondary * 0.82);

    // --------------------------------------------------------
    // BASE FIRE
    // --------------------------------------------------------

    float baseWidth = 0.40 + bass * 0.055;

    float base = 1.0 - smoothstep(
        baseWidth * 0.72,
        baseWidth,
        abs(fireP.x)
    );

    base *= 1.0 - smoothstep(0.0, 0.30, uv.y);

    // Núcleo caliente.
    float core = exp(-abs(fireP.x) * 11.0);
    core *= exp(-uv.y * 8.0);

    // --------------------------------------------------------
    // COLOR AND HEAT
    // --------------------------------------------------------

    float normalizedHeight = clamp(
        uv.y / fireHeight,
        0.0, 1.0
    );

    vec3 fireColor = fireGradient(normalizedHeight);

    float heatNoise = fbm(vec2(
        fireP.x * 7.0 + specMid,
        uv.y * 6.0 - uTime * 2.0
    ));

    fireColor *= 0.90 + heatNoise * 0.20;

    // Núcleo amarillo sin sobreexposición.
    fireColor += vec3(0.22, 0.12, 0.012) *
                 core * (0.7 + bass * 0.35);

    // --------------------------------------------------------
    // AUDIO DYNAMICS
    // --------------------------------------------------------

    float kickIntensity = 1.0 +
                          kick * 0.25 +
                          impact * 0.45;

    float organicIntensity = 1.0 +
                             mid * 0.08 +
                             voice * 0.06 +
                             secondaryImpact * 0.08;

    float flicker = 0.96 +
                    sin(uTime * 15.0) * 0.025 +
                    sin(uTime * 23.0 + 1.7) * 0.018;

    float intensity = kickIntensity *
                      organicIntensity *
                      flicker;

    float flash = impact * 0.18 +
                  uSnarePeak * 0.06;

    // --------------------------------------------------------
    // AMBIENT GLOW
    // --------------------------------------------------------

    float glow = exp(-abs(fireP.x) * 5.0);
    glow *= exp(-uv.y * 4.5);

    vec3 glowColor = vec3(0.65, 0.065, 0.004);

    // --------------------------------------------------------
    // SPARKS
    // --------------------------------------------------------

    // Las partículas también nacen y ascienden en coordenadas
    // verticales 0..1, igual que el fuego.
    vec3 particleColor = sparks(
        vec2(p.x, uv.y),
        energy + hihat
    );

    // --------------------------------------------------------
    // FINAL COMPOSITION
    // --------------------------------------------------------

    vec3 color = vec3(0.0);

    color += glowColor * glow *
             (0.08 + bass * 0.055);

    color += vec3(0.95, 0.24, 0.012) *
             base * 0.35;

    color += fireColor * flames * intensity;

    color += fireColor * flames * flash;

    color += particleColor *
             (0.55 + treble * 0.75 + uHiHatPeak * 0.5);

    color *= 0.88 + uVolume * 0.12;

    // --------------------------------------------------------
    // TONEMAPPING
    // --------------------------------------------------------

    color = color / (1.0 + color * 0.85);
    color = pow(max(color, 0.0), vec3(0.92));

    gl_FragColor = vec4(color, 1.0);
}
