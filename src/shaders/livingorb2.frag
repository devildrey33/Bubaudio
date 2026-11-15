
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
uniform float uTrebleBeat;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TWO_PI 6.28318530718

float hash(vec2 p)
{
    return fract(
        sin(dot(p, vec2(127.1, 311.7))) *
        43758.5453
    );
}

vec2 direction8(float index)
{
    const float DIAGONAL = 0.70710678;

    if (index < 0.5)
    {
        return vec2(0.0, 1.0);
    }

    if (index < 1.5)
    {
        return vec2(DIAGONAL, DIAGONAL);
    }

    if (index < 2.5)
    {
        return vec2(1.0, 0.0);
    }

    if (index < 3.5)
    {
        return vec2(DIAGONAL, -DIAGONAL);
    }

    if (index < 4.5)
    {
        return vec2(0.0, -1.0);
    }

    if (index < 5.5)
    {
        return vec2(-DIAGONAL, -DIAGONAL);
    }

    if (index < 6.5)
    {
        return vec2(-1.0, 0.0);
    }

    return vec2(-DIAGONAL, DIAGONAL);
}

vec2 randomMotionTarget(float stepIndex, float creatureId, vec2 amplitude)
{
    float seed = creatureId + 1.0;
    float directionIndex = floor(
        hash(vec2(stepIndex + seed * 17.13, seed * 31.7)) * 8.0
    );
    vec2 direction = direction8(directionIndex);
    float targetDistance = 10.0;

    if (abs(direction.x) > 0.5)
    {
        targetDistance = min(targetDistance, amplitude.x / abs(direction.x));
    }

    if (abs(direction.y) > 0.5)
    {
        targetDistance = min(targetDistance, amplitude.y / abs(direction.y));
    }

    return direction * targetDistance;
}

vec2 creatureMotion(float creatureId, float time, vec2 amplitude)
{
    float seed = creatureId + 1.0;
    float motionDuration = mix(
        5.0,
        10.0,
        hash(vec2(seed * 19.1, seed * 31.7))
    );
    float motionPhase = hash(vec2(seed * 47.3, seed * 11.9));
    float motionTime = time / motionDuration + motionPhase;
    float motionStep = floor(motionTime);
    float motionProgress = fract(motionTime);
    float transition = smoothstep(0.0, 0.38, motionProgress);
    return mix(
        randomMotionTarget(motionStep - 1.0, creatureId, amplitude),
        randomMotionTarget(motionStep, creatureId, amplitude),
        transition
    );
}

vec2 creatureHome(float creatureId, float creatureGroup, float aspect)
{
    float localIndex = mod(creatureId, 8.0);
    float column = mod(localIndex, 4.0);
    float row = floor(localIndex / 4.0);
    float laneStart = mix(-aspect, 0.0, creatureGroup);
    float x = laneStart + (column + 0.5) * aspect * 0.25;
    float y = mix(-0.28, 0.28, row);
    float seed = creatureId + 1.0;
    x += (hash(vec2(seed * 13.7, seed * 29.1)) - 0.5) * aspect * 0.08;
    y += (hash(vec2(seed * 41.3, seed * 5.7)) - 0.5) * 0.08;
    return vec2(x, y);
}

vec2 voronoi(vec2 p, float time)
{
    vec2 cell = floor(p);
    vec2 local = fract(p);
    float nearest = 10.0;
    float secondNearest = 10.0;

    for (int y = -1; y <= 1; y++)
    {
        for (int x = -1; x <= 1; x++)
        {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 currentCell = cell + neighbor;
            vec2 phase = TWO_PI * vec2(
                hash(currentCell + vec2(19.1, 7.7)),
                hash(currentCell + vec2(31.7, 41.3))
            );
            vec2 point = 0.5 + 0.22 * sin(phase + time);
            float distanceToPoint = length(neighbor + point - local);

            if (distanceToPoint < nearest)
            {
                secondNearest = nearest;
                nearest = distanceToPoint;
            }
            else if (distanceToPoint < secondNearest)
            {
                secondNearest = distanceToPoint;
            }
        }
    }

    return vec2(nearest, secondNearest - nearest);
}

vec4 renderEye(
    vec2 facePosition,
    vec2 center,
    vec2 eyeScale,
    vec2 gaze,
    float bass,
    float treble,
    float bassBeat,
    float trebleBeat,
    float time,
    vec3 scleraTint,
    vec3 irisPrimary,
    vec3 irisSecondary,
    vec3 eyeAccent
)
{
    vec2 eyePosition = (facePosition - center) / eyeScale;
    float eyeDistance = length(eyePosition);
    float socket = 1.0 - smoothstep(1.0, 1.18, eyeDistance);
    float eyeball = 1.0 - smoothstep(0.82, 0.94, eyeDistance);

    vec3 eyeColor = vec3(0.004, 0.008, 0.028);
    vec3 sclera = scleraTint
                * (0.82 + max(eyePosition.y, 0.0) * 0.18)
                * (1.0 + trebleBeat * 0.2);
    eyeColor = mix(eyeColor, sclera, eyeball);

    vec2 irisPosition = eyePosition - gaze;
    float irisDistance = length(irisPosition);
    float irisRadius = 0.37 + bass * 0.04 + bassBeat * 0.05
                     + trebleBeat * 0.035;
    float iris = 1.0 - smoothstep(
        irisRadius - 0.025,
        irisRadius + 0.025,
        irisDistance
    );
    float irisRays = 0.7 + 0.3 * cos(
        atan(irisPosition.y, irisPosition.x) * 18.0 + time * 0.8
    );
    vec3 irisColor = mix(
        irisPrimary,
        irisSecondary,
        0.5 + 0.5 * sin(time * 0.5 + treble + trebleBeat * 0.8)
    ) * irisRays * (1.0 + trebleBeat * 0.8);
    eyeColor = mix(eyeColor, irisColor, iris);

    float pupilRadius = 0.13 + bass * 0.10 + bassBeat * 0.12;
    float pupil = 1.0 - smoothstep(
        pupilRadius - 0.02,
        pupilRadius + 0.02,
        irisDistance
    );
    eyeColor = mix(eyeColor, vec3(0.001, 0.003, 0.012), pupil);

    vec2 glintPosition = irisPosition - vec2(-0.12, 0.14);
    float glint = exp(-dot(glintPosition, glintPosition) * 220.0);
    eyeColor += vec3(0.8, 0.96, 1.0) * glint * eyeball
              * (1.0 + trebleBeat * 0.5);

    float eyeRim = smoothstep(0.78, 0.88, eyeDistance)
                 * (1.0 - smoothstep(0.94, 1.02, eyeDistance));
    eyeColor += eyeAccent * eyeRim
              * (0.15 + treble * 0.25 + trebleBeat * 0.75);

    return vec4(eyeColor, socket);
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

    vec2 screenUv = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / uResolution.y;
    screenUv.x *= aspect;
    float screenRadius = length(screenUv);
    float beat = clamp(uBeat, 0.0, 1.0);
    float trebleBeat = clamp(uTrebleBeat, 0.0, 1.0);

    vec3 deepBlue = vec3(0.008, 0.015, 0.09);
    vec3 blue = vec3(0.015, 0.18, 0.65);
    vec3 cyan = vec3(0.015, 0.85, 1.0);
    vec3 violet = vec3(0.38, 0.04, 0.95);
    vec3 pink = vec3(1.0, 0.06, 0.48);
    vec3 white = vec3(0.85, 0.97, 1.0);

    // ----------------------------------------
    // DARK, AUDIO-REACTIVE VORONOI BACKGROUND
    // ----------------------------------------

    float audioEnergy = clamp(
        uBass * 0.35 + uMid * 0.2 + uTreble * 0.1
        + uVolume * 0.25 + beat * 0.1 + trebleBeat * 0.1,
        0.0,
        1.0
    );
    vec2 voronoiData = voronoi(
        screenUv * 4.5,
        t * (0.07 + audioEnergy * 0.14)
    );
    float edgeCore = 1.0 - smoothstep(0.008, 0.028, voronoiData.y);
    float edgeGlow = 1.0 - smoothstep(0.02, 0.14, voronoiData.y);
    float cellCenters = exp(-voronoiData.x * 2.8);
    float patternFade = 1.0 - smoothstep(0.9, 2.0, screenRadius);
    float colorPhase = 0.5 + 0.5 * sin(
        screenUv.x * 0.7 + screenUv.y * 0.9 + t * 0.16 + uTreble * 0.8
    );
    vec3 patternColor = mix(cyan, pink, colorPhase);
    float patternGain = 0.45 + audioEnergy * 0.65
                      + beat * 0.35 + trebleBeat * 0.3;
    vec3 background = vec3(0.0015, 0.002, 0.006);
    background += patternColor
                * (edgeCore * 0.42 + edgeGlow * 0.12 + cellCenters * 0.025)
                * patternGain
                * patternFade;
    background += deepBlue * exp(-screenRadius * 1.3)
                * (0.08 + uVolume * 0.1 + beat * 0.08);

    // Render both independently so their identity and palette follow them
    // across the screen, including when their silhouettes overlap.
    vec3 color = background;
    for (int creatureIndex = 0; creatureIndex < 16; creatureIndex++)
    {
        float creatureId = float(creatureIndex);
        float creatureGroup = floor(creatureId / 8.0);
        vec3 creatureDeepBlue = mix(
            deepBlue,
            vec3(0.10, 0.012, 0.018),
            creatureGroup
        );
        vec3 creatureBlue = mix(
            blue,
            vec3(0.68, 0.10, 0.018),
            creatureGroup
        );
        vec3 creatureCyan = mix(
            cyan,
            vec3(1.0, 0.34, 0.035),
            creatureGroup
        );
        vec3 creatureViolet = mix(
            violet,
            vec3(0.92, 0.025, 0.30),
            creatureGroup
        );
        vec3 creaturePink = mix(
            pink,
            vec3(1.0, 0.72, 0.08),
            creatureGroup
        );
        vec3 creatureWhite = mix(
            white,
            vec3(1.0, 0.88, 0.62),
            creatureGroup
        );
        vec3 creatureSclera = mix(
            vec3(0.48, 0.72, 0.86),
            vec3(0.94, 0.70, 0.48),
            creatureGroup
        );
        float creatureBassBeat = beat * (1.0 - creatureGroup);
        float creatureTrebleBeat = trebleBeat * creatureGroup;
        float creatureBeat = max(creatureBassBeat, creatureTrebleBeat);
        float creatureBandLevel = mix(uBass, uTreble, creatureGroup);
        float sizeResponse = smoothstep(
            0.015,
            0.45,
            clamp(creatureBandLevel, 0.0, 1.0)
        );
        const float CREATURE_EXTENT = 1.08;
        float maximumCreatureScale = min(
            0.40,
            aspect * 0.5 / CREATURE_EXTENT
        );
        float creatureScale = min(
            maximumCreatureScale * 1.07,
            maximumCreatureScale * (
                0.82 + sizeResponse * 0.18 + creatureBeat * 0.07
            )
        );
        vec2 movement = creatureMotion(
            creatureId,
            uTime,
            vec2(aspect * 0.65, 0.38)
        );
        vec2 creatureCenter =
            creatureHome(creatureId, creatureGroup, aspect) + movement;

        if (length(screenUv - creatureCenter) >
            creatureScale * CREATURE_EXTENT)
        {
            continue;
        }

        vec2 uv = (
            screenUv - creatureCenter
        ) / creatureScale;
        t = uTime + creatureId * 1.73;

        float radius = length(uv);
        float angle = atan(uv.y, uv.x);
        float angle01 = fract(angle / TWO_PI);
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

        float organic =
            sin(angle * 4.0 + t * 0.8) * 0.018 +
            sin(angle * 7.0 - t * 0.5) * 0.012;

        float bodyRadius =
            0.34 +
            organic +
            wave * (0.025 + creatureBandLevel * 0.055) +
            creatureBeat * 0.04;

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
        for (int i = 0; i < 9; i++)
        {
            float id = float(i);

            float baseAngle = id * TWO_PI / 9.0 + creatureId * 0.35;

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
                0.27 +
                armFFT * 0.16 +
                creatureBandLevel * 0.12 +
                armWave * 0.04;

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
        // SMOOTH SPHERE CORE
        // ----------------------------------------

        float sphereR = clamp(radius / bodyRadius, 0.0, 1.0);

        // ----------------------------------------
        // 3D LIGHTING
        // ----------------------------------------

        float sphereZ = sqrt(max(0.001, 1.0 - sphereR * sphereR));

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

        vec3 plasmaColor = mix(
            creatureDeepBlue,
            creatureBlue,
            1.0 - sphereR * 0.65
        );

        plasmaColor = mix(
            plasmaColor,
            creatureViolet,
            (0.12 + 0.08 * sin(angle * 2.0 - t * 0.3 + uMid * 0.3))
        );

        // Surface illumination
        plasmaColor *= 0.4 + diffuse * 0.75;

        plasmaColor += creatureWhite * highlight * 1.5;
        plasmaColor += creatureWhite * creatureBeat * (0.28 + rim * 0.65);

        plasmaColor += creatureViolet * rim * 0.8;

        plasmaColor += mix(creatureBlue, creatureCyan, 0.5 + 0.5 * sin(t))
                     * exp(-sphereR * 3.5)
                     * (0.12 + uBass * 0.35 + beat * 0.25);

        vec2 facePosition = uv / max(bodyRadius, 0.001);
        // Cada ojo elige de forma independiente una de ocho direcciones.
        float gazeStep = floor(t / 3.0);
        float gazeProgress = fract(t / 3.0);
        float gazeSeed = 13.7 + creatureId * 89.3;
        float previousDirection = floor(hash(vec2(gazeStep - 1.0, gazeSeed)) * 8.0);
        float currentDirection = floor(hash(vec2(gazeStep, gazeSeed)) * 8.0);
        float gazeBlend = smoothstep(0.0, 0.35, gazeProgress);
        vec2 gazeOffset = mix(
            direction8(previousDirection),
            direction8(currentDirection),
            gazeBlend
        );
        vec2 gaze = gazeOffset * min(
            1.0,
            0.30 / max(length(gazeOffset), 0.001)
        );

        vec4 eye = renderEye(
            facePosition,
            vec2(0.0, 0.02),
            vec2(0.64, 0.50),
            gaze,
            uBass,
            uTreble,
            creatureBassBeat,
            creatureTrebleBeat,
            t,
            creatureSclera,
            creatureBlue,
            creatureViolet,
            creatureCyan
        );
        plasmaColor = mix(plasmaColor, eye.rgb, eye.a);

        // ----------------------------------------
        // TENTACLE COLORS
        // ----------------------------------------

        vec3 tentacleColor = mix(
            creatureCyan,
            creatureViolet,
            0.5 + 0.5 * sin(angle * 3.0 + t)
        );

        tentacleColor += creaturePink * uTreble * 0.2;

        vec3 tendrils =
            tentacleColor * tentacleGlow * (0.8 + creatureBeat * 0.7);

        tendrils += creatureWhite * tentacleCore * (1.2 + creatureBeat * 0.8);

        // ----------------------------------------
        // ENERGY AURA
        // ----------------------------------------

        float aura = exp(
            -abs(radius - bodyRadius) * 16.0
        );

        aura *= 1.0 - bodyMask;

        vec3 auraColor = mix(
            creatureCyan,
            creatureViolet,
            0.5 + 0.5 * sin(t * 0.8)
        );

        // ----------------------------------------
        // FINAL COMPOSITION
        // ----------------------------------------

        vec3 creatureColor = plasmaColor * bodyMask;
        creatureColor += tendrils;
        creatureColor += auraColor * aura * (0.35 + creatureBeat * 1.1);
        creatureColor += creatureBlue *
            exp(-radius * 4.0) *
            bodyMask *
            (0.15 + creatureBandLevel * 0.5);

        float creatureAlpha = clamp(
            bodyMask + tentacleGlow * 0.35 + tentacleCore * 0.5 + aura * 0.35,
            0.0,
            1.0
        );
        color = creatureColor + color * (1.0 - creatureAlpha);
    }

    // General volume
    color *= 0.65 + uVolume * 1.4;

    // Subtle vignette
    color *= exp(-screenRadius * 0.6);

    // Interpolate neighboring waveform samples so the trace stays smooth
    // even when the audio texture uses nearest-neighbor filtering.
    const float WAVEFORM_SIZE = 1024.0;
    float waveformPosition = clamp(vUv.x, 0.0, 1.0) * (WAVEFORM_SIZE - 1.0);
    float waveformIndex = floor(waveformPosition);
    float waveformBlend = fract(waveformPosition);
    float waveformSampleA = texture2D(
        uWaveform,
        vec2((waveformIndex + 0.5) / WAVEFORM_SIZE, 0.0)
    ).r;
    float waveformSampleB = texture2D(
        uWaveform,
        vec2((min(waveformIndex + 1.0, WAVEFORM_SIZE - 1.0) + 0.5) / WAVEFORM_SIZE, 0.0)
    ).r;
    float scopeWave = mix(waveformSampleA, waveformSampleB, waveformBlend) * 2.0 - 1.0;
    float scopeY = -0.82 + scopeWave * (0.12 + uVolume * 0.06);
    float scopeDistance = abs(screenUv.y - scopeY);
    float scopeThickness = 1.2 / uResolution.y;
    float scopeLine = 1.0 - smoothstep(
        scopeThickness,
        scopeThickness * 2.6,
        scopeDistance
    );
    float scopeGlow = exp(-scopeDistance * 55.0);
    color += vec3(1.0) * (scopeLine * 1.6 + scopeGlow * 0.15) * patternFade;

    // Tonemapping
    color = 1.0 - exp(-color * 1.3);

    gl_FragColor = vec4(color, 1.0);
}
