
precision highp float;

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

#define PI 3.14159265359
#define TWO_PI 6.28318530718

// --------------------------------------------
// NOISE
// --------------------------------------------

float hash(vec2 p)
{
    return fract(
        sin(dot(p, vec2(127.1, 311.7))) *
        43758.5453
    );
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

// --------------------------------------------
// ANGULAR DISTANCE
// --------------------------------------------

float angleDifference(float a, float b)
{
    return atan(sin(a - b), cos(a - b));
}

// --------------------------------------------
// MAIN
// --------------------------------------------

void main()
{
    float t = uTime;

    // Coordinates
    vec2 uv = vUv * 2.0 - 1.0;

    uv.x *= uResolution.x / uResolution.y;

    float radius = length(uv);
    float angle = atan(uv.y, uv.x);

    float angle01 = fract(angle / TWO_PI);

    // ----------------------------------------
    // AUDIO
    // ----------------------------------------

    float wave = texture2D(
        uWaveform,
        vec2(angle01, 0.0)
    ).r * 2.0 - 1.0;

    float fft = texture2D(
        uSpectrum,
        vec2(angle01, 0.0)
    ).r;

    // ----------------------------------------
    // ORGANIC BODY
    // ----------------------------------------

    float n1 = noise(
        uv * 8.0 + vec2(t * 0.25, -t * 0.2)
    );

    float n2 = noise(
        uv * 15.0 - vec2(t * 0.3, t * 0.15)
    );

    float organic =
        sin(angle * 4.0 + t * 0.8) * 0.018 +
        sin(angle * 7.0 - t * 0.5) * 0.012 +
        (n1 - 0.5) * 0.035;

    float bodyRadius =
        0.34 +
        organic +
        wave * (0.025 + uBass * 0.055) +
        uBeat * 0.025;

    float bodyDist = radius - bodyRadius;

    float bodyMask = 1.0 - smoothstep(
        -0.008,
        0.008,
        bodyDist
    );

    // ----------------------------------------
    // LIVING TENTACLES
    // ----------------------------------------

    float tentacleGlow = 0.0;
    float tentacleCore = 0.0;

    // Nine independent organic extensions
    for (int i = 0; i < 15; i++)
    {
        float id = float(i);

        float baseAngle = id * TWO_PI / 9.0;

        // Individual audio sample per tentacle
        float audioIndex = fract(id / 9.0);

        float armWave = texture2D(
            uWaveform,
            vec2(audioIndex, 0.0)
        ).r * 2.0 - 1.0;

        float armFFT = texture2D(
            uSpectrum,
            vec2(audioIndex, 0.0)
        ).r;

        // Different length for every tentacle
        float armLength =
            0.20 +
            armFFT * 0.13 +
            uBass * 0.10 +
            armWave * 0.035;

        // Radial position along tentacle
        float progress = clamp(
            (radius - bodyRadius) / armLength,
            0.0,
            1.0
        );

        // Organic movement and curvature
        float sway =
            sin(
                progress * 5.0 +
                t * (1.2 + uMid * 2.0) +
                id * 2.1
            ) * 0.11;

        float secondarySway =
            sin(
                progress * 9.0 -
                t * 1.8 +
                id
            ) * 0.035;

        float curvature =
            sway +
            secondarySway +
            armWave * 0.09;

        // Each tentacle has its own animated angle
        float armAngle =
            baseAngle +
            curvature;

        float angularDist = abs(
            angleDifference(angle, armAngle)
        );

        // Convert angular distance to pixels
        float dist = angularDist * max(radius, 0.1);

        // Organic taper
        float width = mix(
            0.019 + uBass * 0.004,
            0.002,
            progress
        );

        // End of tentacle
        float endFade = 1.0 - smoothstep(
            0.88,
            1.0,
            progress
        );

        // Only render outside the body
        float armVisibility = step(bodyRadius, radius) *
                       (1.0 - smoothstep(
                           armLength * 0.97,
                           armLength,
                           radius - bodyRadius
                       ));

        // Bright central filament
        float core = 1.0 - smoothstep(
            width * 0.2,
            width * 0.65,
            dist
        );

        // Soft energy halo
        float glow = exp(
            -dist / max(width * 2.5, 0.001)
        );

        tentacleCore +=
            core * armVisibility * endFade;

        tentacleGlow +=
            glow * armVisibility * endFade *
            (0.5 + armFFT);
    }

    // ----------------------------------------
    // LIQUID PLASMA CORE
    // ----------------------------------------

    float liquid1 = noise(
        uv * 10.0 + vec2(t * 0.35, -t * 0.2)
    );

    float liquid2 = noise(
        uv * 20.0 - vec2(t * 0.25, t * 0.3)
    );

    float liquid3 = noise(
        uv * 5.0 + vec2(-t * 0.15, t * 0.2)
    );

    float plasma = sin(
        liquid1 * 12.0 +
        liquid2 * 9.0 +
        t * 1.5
    );

    float veins = pow(
        abs(sin(plasma * 3.0 + liquid3 * 8.0)),
        8.0
    );

    // ----------------------------------------
    // 3D LIGHTING
    // ----------------------------------------

    float sphereZ = sqrt(
        max(
            0.001,
            1.0 - pow(radius / bodyRadius, 2.0)
        )
    );

    vec2 lightOffset = uv / max(bodyRadius, 0.001);

    vec3 normal = normalize(
        vec3(
            -lightOffset.x * 0.8,
            -lightOffset.y * 0.8,
            sphereZ
        )
    );

    vec3 lightDir = normalize(
        vec3(-0.5, 0.7, 0.8)
    );

    float diffuse = max(
        dot(normal, lightDir),
        0.0
    );

    float highlight = pow(
        max(
            dot(
                reflect(-lightDir, normal),
                vec3(0.0, 0.0, 1.0)
            ),
            0.0
        ),
        24.0
    );

    float rim = pow(
        1.0 - sphereZ,
        2.0
    );

    // ----------------------------------------
    // COLOR PALETTE
    // ----------------------------------------

    vec3 deepBlue = vec3(0.008, 0.015, 0.09);

    vec3 blue = vec3(0.015, 0.18, 0.65);

    vec3 cyan = vec3(0.015, 0.85, 1.0);

    vec3 violet = vec3(0.38, 0.04, 0.95);

    vec3 pink = vec3(1.0, 0.06, 0.48);

    vec3 white = vec3(0.85, 0.97, 1.0);

    // Plasma body
    vec3 plasmaColor = mix(
        deepBlue,
        blue,
        liquid1
    );

    plasmaColor = mix(
        plasmaColor,
        violet,
        liquid2 * 0.8
    );

    plasmaColor = mix(
        plasmaColor,
        cyan,
        smoothstep(0.2, 0.9, plasma) * 0.7
    );

    plasmaColor += pink * veins * 0.25;

    // Surface illumination
    plasmaColor *= 0.3 + diffuse * 0.9;

    plasmaColor += white * highlight * 1.5;

    plasmaColor += violet * rim * 0.8;

    plasmaColor += cyan * veins * uTreble * 0.4;

    // ----------------------------------------
    // TENTACLE COLORS
    // ----------------------------------------

    vec3 tentacleColor = mix(
        cyan,
        violet,
        0.5 + 0.5 * sin(angle * 3.0 + t)
    );

    tentacleColor += pink * uTreble * 0.2;

    vec3 tendrils =
        tentacleColor * tentacleGlow * 0.8;

    tendrils += white * tentacleCore * 1.2;

    // ----------------------------------------
    // ENERGY AURA
    // ----------------------------------------

    float aura = exp(
        -abs(radius - bodyRadius) * 16.0
    );

    aura *= 1.0 - bodyMask;

    vec3 auraColor = mix(
        cyan,
        violet,
        0.5 + 0.5 * sin(t * 0.8)
    );

    // ----------------------------------------
    // FINAL COMPOSITION
    // ----------------------------------------

    vec3 color = vec3(0.0);

    // Main body
    color += plasmaColor * bodyMask;

    // Organic tentacles
    color += tendrils;

    // Outer aura
    color += auraColor * aura * 0.35;

    // Internal glow
    color += blue *
        exp(-radius * 4.0) *
        bodyMask *
        (0.15 + uBass * 0.5);

    // Beat pulse
    color *= 1.0 + uBeat * 0.8;

    // General volume
    color *= 0.65 + uVolume * 1.4;

    // Subtle vignette
    color *= exp(-radius * 0.6);

    // Tonemapping
    color = 1.0 - exp(-color * 1.3);

    gl_FragColor = vec4(color, 1.0);
}
