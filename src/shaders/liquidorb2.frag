
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
        mix(
            hash(i),
            hash(i + vec2(1.0, 0.0)),
            f.x
        ),
        mix(
            hash(i + vec2(0.0, 1.0)),
            hash(i + vec2(1.0, 1.0)),
            f.x
        ),
        f.y
    );
}

// --------------------------------------------
// AUDIO-REACTIVE SURFACE
// --------------------------------------------

float surfaceHeight(vec2 p)
{
    float r = length(p);
    float a = atan(p.y, p.x);

    float index = fract(a / TWO_PI);

    float wave = texture2D(
        uWaveform,
        vec2(index, 0.0)
    ).r * 2.0 - 1.0;

    float fft = texture2D(
        uSpectrum,
        vec2(index, 0.0)
    ).r;

    float n1 = noise(
        p * 8.0 + vec2(uTime * 0.25, -uTime * 0.2)
    );

    float n2 = noise(
        p * 16.0 - vec2(uTime * 0.3, uTime * 0.18)
    );

    float waves =
        sin(r * 24.0 - uTime * 1.8 + n1 * 5.0);

    float detail =
        sin(a * 9.0 + uTime + n2 * 4.0);

    float height = 0.0;

    height += wave * (0.035 + uBass * 0.055);

    height += fft * (0.018 + uTreble * 0.025);

    height += waves * 0.012;

    height += detail * 0.009;

    height += (n1 - 0.5) * 0.035;

    height += (n2 - 0.5) * 0.018;

    return height;
}

// --------------------------------------------
// MAIN
// --------------------------------------------

void main()
{
    float t = uTime;

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
    // SPHERE SHAPE
    // ----------------------------------------

    float organic =
        sin(angle * 3.0 + t * 0.7) * 0.018 +
        sin(angle * 6.0 - t * 0.5) * 0.012 +
        sin(angle * 11.0 + t * 0.3) * 0.007;

    float pulse =
        uBass * 0.035 +
        uBeat * 0.025 +
        sin(t * 1.2) * 0.008;

    float deformation =
        wave * (0.025 + uBass * 0.065);

    float orbRadius =
        0.47 + organic + pulse + deformation;

    // Circular boundary
    float edge = orbRadius - radius;

    float aa = 0.002;

    float mask = smoothstep(
        -aa,
        aa,
        edge
    );

    // ----------------------------------------
    // FAKE 3D SPHERE
    // ----------------------------------------

    float sphereZ = sqrt(
        max(0.001, 1.0 - pow(radius / orbRadius, 2.0))
    );

    // Surface height and finite-difference normal
    float h = surfaceHeight(uv);

    float e = 0.003;

    float hx = surfaceHeight(uv + vec2(e, 0.0));
    float hy = surfaceHeight(uv + vec2(0.0, e));

    vec3 normal = normalize(
        vec3(
            -(hx - h) / e,
            -(hy - h) / e,
            sphereZ * 0.8 + 0.25
        )
    );

    // ----------------------------------------
    // LIGHTING
    // ----------------------------------------

    vec3 light1 = normalize(vec3(-0.6, 0.7, 0.8));

    vec3 light2 = normalize(vec3(0.7, -0.3, 0.6));

    float diffuse1 = max(dot(normal, light1), 0.0);

    float diffuse2 = max(dot(normal, light2), 0.0);

    vec3 viewDir = vec3(0.0, 0.0, 1.0);

    vec3 halfDir = normalize(light1 + viewDir);

    float specular = pow(
        max(dot(normal, halfDir), 0.0),
        40.0
    );

    float rim = pow(
        1.0 - sphereZ,
        2.0
    );

    // ----------------------------------------
    // LIQUID TEXTURE
    // ----------------------------------------

    float n1 = noise(
        uv * 9.0 + vec2(t * 0.3, -t * 0.2)
    );

    float n2 = noise(
        uv * 18.0 - vec2(t * 0.2, t * 0.35)
    );

    float veins = pow(
        abs(
            sin(
                n1 * 13.0 +
                n2 * 8.0 +
                h * 80.0
            )
        ),
        9.0
    );

    float flow = sin(
        n1 * 12.0 -
        n2 * 8.0 +
        t * 1.5
    );

    // ----------------------------------------
    // COLOR PALETTE
    // ----------------------------------------

    vec3 deepBlue = vec3(0.008, 0.015, 0.09);

    vec3 blue = vec3(0.015, 0.20, 0.65);

    vec3 cyan = vec3(0.02, 0.85, 1.0);

    vec3 violet = vec3(0.38, 0.06, 0.95);

    vec3 pink = vec3(1.0, 0.08, 0.48);

    vec3 white = vec3(0.85, 0.97, 1.0);

    float colorMix = smoothstep(
        -0.4,
        0.7,
        flow + n1
    );

    vec3 baseColor = mix(
        deepBlue,
        blue,
        colorMix
    );

    baseColor = mix(
        baseColor,
        violet,
        smoothstep(0.3, 0.9, n2)
    );

    baseColor = mix(
        baseColor,
        cyan,
        smoothstep(0.5, 0.95, flow) * 0.7
    );

    baseColor += pink * veins * 0.3;

    // ----------------------------------------
    // REFLECTIONS
    // ----------------------------------------

    vec3 lighting =
        baseColor * (0.25 + diffuse1 * 0.7);

    lighting += cyan * diffuse2 * 0.25;

    lighting += white * specular * 1.5;

    lighting += violet * rim * 0.7;

    lighting += white * veins * uTreble * 0.35;

    // ----------------------------------------
    // INNER ENERGY
    // ----------------------------------------

    float innerGlow = exp(-radius * 3.0);

    lighting += blue * innerGlow * 0.25;

    lighting += cyan * innerGlow * uBass * 0.4;

    // ----------------------------------------
    // MEMBRANE EDGE
    // ----------------------------------------

    float edgeGlow = exp(-abs(edge) * 35.0);

    lighting += cyan * edgeGlow * 0.35;

    // ----------------------------------------
    // OUTER AURA
    // ----------------------------------------

    float aura = exp(
        -max(-edge, 0.0) * 12.0
    ) * (1.0 - mask);

    vec3 auraColor = mix(
        cyan,
        violet,
        0.5 + 0.5 * sin(t + angle * 2.0)
    );

    vec3 color = auraColor * aura *
        (0.12 + uVolume * 0.5 + uBeat * 0.4);

    // Sphere body
    color += lighting * mask;

    // ----------------------------------------
    // AUDIO REACTIVITY
    // ----------------------------------------

    color *= 1.0 + uBeat * 0.65;

    color *= 0.7 + uVolume * 1.2;

    // ----------------------------------------
    // FINAL
    // ----------------------------------------

    float vignette = exp(-radius * 0.65);

    color *= vignette;

    color = 1.0 - exp(-color * 1.35);

    gl_FragColor = vec4(color, 1.0);
}
