
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

    return mix(
        mix(a, b, f.x),
        mix(c, d, f.x),
        f.y
    );
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
// FIRE COLOR
// Temperature: 0 = cold, 1 = extremely hot
// ------------------------------------------------------------

vec3 fireGradient(float temperature) {

    vec3 deepRed = vec3(0.32, 0.008, 0.001);
    vec3 red     = vec3(0.85, 0.035, 0.001);
    vec3 orange  = vec3(1.00, 0.19, 0.003);
    vec3 yellow  = vec3(1.00, 0.61, 0.045);
    vec3 white   = vec3(1.00, 0.91, 0.58);

    vec3 col = mix(
        deepRed,
        red,
        smoothstep(0.05, 0.35, temperature)
    );

    col = mix(
        col,
        orange,
        smoothstep(0.30, 0.57, temperature)
    );

    col = mix(
        col,
        yellow,
        smoothstep(0.55, 0.78, temperature)
    );

    col = mix(
        col,
        white,
        smoothstep(0.82, 1.0, temperature)
    );

    return col;
}

// ------------------------------------------------------------
// INDIVIDUAL FLAME TONGUE
// Each flame has its own shape, movement and temperature.
// ------------------------------------------------------------

vec3 flameTongue(
    vec2 p,
    float center,
    float width,
    float height,
    float seed,
    float speed
) {

    float t = uTime * speed;

    vec2 q = vec2(
        (p.x - center) / width,
        p.y / height
    );

    float y = clamp(q.y, 0.0, 1.0);

    // --------------------------------------------------------
    // TURBULENCE
    // --------------------------------------------------------

    float n1 = fbm(vec2(
        q.x * 2.8 + seed,
        y * 3.8 - t
    ));

    float n2 = noise(vec2(
        q.x * 8.0 - seed,
        y * 9.0 - t * 1.7
    ));

    float n3 = noise(vec2(
        q.x * 15.0 + seed * 2.0,
        y * 13.0 - t * 2.4
    ));

    float turbulence =
        (n1 - 0.5) * 0.75 +
        (n2 - 0.5) * 0.25 +
        (n3 - 0.5) * 0.12;

    // --------------------------------------------------------
    // ORGANIC MOVEMENT
    // --------------------------------------------------------

    float sway = sin(
        y * 7.0 - t * 2.0 + seed
    ) * 0.17;

    sway += sin(
        y * 13.0 + t * 1.5 + seed * 2.0
    ) * 0.065;

    sway += sin(
        y * 20.0 - t * 2.8 + seed
    ) * 0.025;

    q.x -= turbulence + sway;

    // --------------------------------------------------------
    // FLAME SHAPE
    // --------------------------------------------------------

    // Narrowing towards the tip.
    float taper = pow(
        max(1.0 - y, 0.0),
        0.75
    );

    float shapeWidth = 0.045 + taper * 0.90;

    // Irregular edges.
    shapeWidth += (n2 - 0.5) * 0.20;
    shapeWidth += (n3 - 0.5) * 0.09;

    float body = 1.0 - smoothstep(
        shapeWidth * 0.70,
        shapeWidth,
        abs(q.x)
    );

    // Sharper and more irregular tips.
    float tip = 1.0 - smoothstep(
        0.88,
        1.0,
        q.y + (n2 - 0.5) * 0.12
    );

    // Flame birth at bottom.
    float bottom = 1.0 - smoothstep(
        0.0,
        0.045,
        -q.y
    );

    float mask = body * tip * bottom;

    // --------------------------------------------------------
    // LOCAL COMBUSTION
    // --------------------------------------------------------

    // The center burns hotter than the edges.
    float centerHeat = exp(
        -abs(q.x) * 2.8
    );

    // Internal moving combustion channels.
    float channels = fbm(vec2(
        q.x * 5.5 + seed * 2.0,
        y * 8.0 - t * 2.0
    ));

    float filaments = noise(vec2(
        q.x * 13.0 + seed,
        y * 16.0 - t * 3.0
    ));

    // Individual temperature distribution.
    float temperature = 0.92 - y * 0.63;

    temperature += centerHeat * 0.30;

    temperature += (channels - 0.5) * 0.32;
    temperature += (filaments - 0.5) * 0.17;

    // Cooler edges.
    temperature -= smoothstep(
        0.30,
        0.95,
        abs(q.x)
    ) * 0.28;

    // Slightly different temperature for every tongue.
    temperature += sin(
        y * 11.0 + seed
    ) * 0.045;

    temperature = clamp(
        temperature,
        0.0,
        1.0
    );

    // --------------------------------------------------------
    // INTERNAL CONTRAST
    // --------------------------------------------------------

    float combustion = smoothstep(
        0.20,
        0.70,
        channels
    );

    float brightness = 0.72 +
                       combustion * 0.30;

    // Darker moving channels.
    brightness *= 0.76 +
                  filaments * 0.35;

    // Bright central combustion.
    brightness += centerHeat * 0.20;

    // --------------------------------------------------------
    // FINAL TONGUE COLOR
    // --------------------------------------------------------

    vec3 col = fireGradient(temperature);

    col *= brightness;

    // More luminous central filaments.
    col += vec3(0.16, 0.075, 0.008) *
           centerHeat *
           combustion;

    return col * mask;
}

// ------------------------------------------------------------
// SECONDARY FLAMES
// ------------------------------------------------------------

vec3 smallFlames(vec2 p, float energy) {

    vec3 result = vec3(0.0);

    result += flameTongue(
        p,
        -0.44,
        0.075,
        0.34 + energy * 0.12,
        3.1,
        2.1
    ) * 0.72;

    result += flameTongue(
        p,
        0.45,
        0.075,
        0.39 + energy * 0.12,
        8.4,
        2.4
    ) * 0.72;

    result += flameTongue(
        p,
        -0.20,
        0.065,
        0.28 + energy * 0.10,
        5.6,
        2.7
    ) * 0.65;

    result += flameTongue(
        p,
        0.23,
        0.065,
        0.32 + energy * 0.10,
        9.2,
        2.3
    ) * 0.65;

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

        float x = (
            hash21(vec2(seed, 1.0)) - 0.5
        ) * 1.05;

        float velocity = 0.14 +
                         hash21(vec2(seed, 2.0)) * 0.20 +
                         energy * 0.20;

        float y = fract(
            hash21(vec2(seed, 3.0)) +
            uTime * velocity
        );

        float spawn = hash21(vec2(seed, 4.0));

        float posX = x * (0.35 + y * 0.7);

        posX += sin(
            uTime * 1.8 + seed
        ) * 0.025;

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

        brightness *= smoothstep(
            0.0,
            0.15,
            spawn + 0.15
        );

        result += vec3(1.0, 0.48, 0.055) *
                  brightness;
    }

    return result;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------

void main() {

    vec2 uv = vUv;

    float aspect = uResolution.x / uResolution.y;

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
        0.0,
        1.0
    );

    float secondaryImpact = clamp(
        max(uSnarePeak, uMidBeat * 0.65),
        0.0,
        1.0
    );

    float energy = clamp(
        bass * 0.45 +
        mid * 0.20 +
        uVolume * 0.20 +
        kick * 0.15,
        0.0,
        1.0
    );

    // --------------------------------------------------------
    // AUDIO TEXTURES
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

    fireHeight = clamp(
        fireHeight,
        0.42,
        0.78
    );

    float widthBoost = bass * 0.025 +
                       impact * 0.020;

    // Global movement.
    float globalSway = sin(uTime * 1.3) * 0.012 +
                       sin(uTime * 2.7) * mid * 0.018;

    globalSway += wave * 0.008;

    fireP.x -= globalSway;

    // --------------------------------------------------------
    // MAIN FLAMES: 7 DISTINCT TONGUES
    // --------------------------------------------------------

    vec3 mainFire = vec3(0.0);

    // Left outer flame.
    mainFire += flameTongue(
        fireP,
        -0.39,
        0.090 + widthBoost,
        fireHeight * 0.72,
        1.2,
        1.35
    );

    // Left tall flame.
    mainFire += flameTongue(
        fireP,
        -0.255,
        0.095 + widthBoost,
        fireHeight * 0.94,
        3.7,
        1.65
    );

    // Left central flame.
    mainFire += flameTongue(
        fireP,
        -0.12,
        0.082,
        fireHeight * 0.79 + bass * 0.08,
        6.3,
        1.45
    );

    // Main central flame.
    mainFire += flameTongue(
        fireP,
        0.015,
        0.095,
        fireHeight,
        8.5,
        1.8
    );

    // Right central flame.
    mainFire += flameTongue(
        fireP,
        0.155,
        0.085 + widthBoost,
        fireHeight * 0.87,
        11.3,
        1.55
    );

    // Right tall flame.
    mainFire += flameTongue(
        fireP,
        0.29,
        0.090,
        fireHeight * 0.91,
        14.8,
        2.0
    );

    // Right outer flame.
    mainFire += flameTongue(
        fireP,
        0.415,
        0.075,
        fireHeight * 0.65,
        17.4,
        1.9
    );

    // --------------------------------------------------------
    // SECONDARY FLAMES
    // --------------------------------------------------------

    vec3 secondary = smallFlames(
        fireP,
        energy + impact * 0.4
    );

    // --------------------------------------------------------
    // BASE FIRE
    // --------------------------------------------------------

    float baseWidth = 0.40 + bass * 0.055;

    float base = 1.0 - smoothstep(
        baseWidth * 0.72,
        baseWidth,
        abs(fireP.x)
    );

    base *= 1.0 - smoothstep(
        0.0,
        0.30,
        uv.y
    );

    // Hot central nucleus.
    float core = exp(
        -abs(fireP.x) * 11.0
    );

    core *= exp(-uv.y * 8.0);

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

    float glow = exp(
        -abs(fireP.x) * 5.0
    );

    glow *= exp(-uv.y * 4.5);

    vec3 glowColor = vec3(
        0.65,
        0.065,
        0.004
    );

    // --------------------------------------------------------
    // SPARKS
    // --------------------------------------------------------

    vec3 particleColor = sparks(
        vec2(p.x, uv.y),
        energy + hihat
    );

    // --------------------------------------------------------
    // FINAL COMPOSITION
    // --------------------------------------------------------

    vec3 color = vec3(0.0);

    // Ambient glow.
    color += glowColor * glow *
             (0.08 + bass * 0.055);

    // Continuous burning base.
    color += vec3(0.95, 0.24, 0.012) *
             base * 0.35;

    // Individual tongues.
    color += mainFire * intensity;

    // Secondary tongues.
    color += secondary * intensity * 0.85;

    // Audio flashes.
    color += (mainFire + secondary) * flash;

    // Hot nucleus.
    color += vec3(0.22, 0.12, 0.012) *
             core * (0.7 + bass * 0.35);

    // Particles.
    color += particleColor *
             (0.55 + treble * 0.75 + uHiHatPeak * 0.5);

    color *= 0.88 + uVolume * 0.12;

    // --------------------------------------------------------
    // TONEMAPPING
    // --------------------------------------------------------

    color = color / (1.0 + color * 0.85);

    color = pow(
        max(color, 0.0),
        vec3(0.92)
    );

    gl_FragColor = vec4(color, 1.0);
}
