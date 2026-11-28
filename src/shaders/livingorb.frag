
varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

// Mouse position in normalized canvas coordinates (0..1).
uniform vec2 uMouse;
// Short 0..1 envelope triggered by mouse button 4.
uniform float uMouseClick4;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
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

uniform float uBassPeak;
uniform float uMidPeak;
uniform float uTreblePeak;

uniform float uFlux;
uniform float uCentroid;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TWO_PI 6.28318530718

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 randomMotionTarget(float stepIndex, float creatureId, vec2 amplitude)
{
    // Pick a continuous direction and a point INSIDE an elliptical range.
    // The old eight-direction system sent the creature to the perimeter
    // (often a corner), making later beat pulses look as if they originated
    // from an off-centre point.
    float seed = creatureId + 1.0;
    float angle = TWO_PI * hash(vec2(
        stepIndex + seed * 17.13,
        seed * 31.7
    ));

    float distance = sqrt(hash(vec2(
        stepIndex + seed * 53.71,
        seed * 13.9
    ))) * 0.72;

    return vec2(cos(angle) * amplitude.x,
                sin(angle) * amplitude.y) * distance;
}

vec2 creatureMotion(float creatureId, float time, vec2 amplitude)
{
    float seed = creatureId + 1.0;

    float motionDuration = mix(
        5.0, 15.0,
        hash(vec2(seed * 19.1, seed * 31.7))
    );

    float motionPhase = hash(vec2(seed * 47.3, seed * 11.9));
    float motionTime = time / motionDuration + motionPhase;
    float motionStep = floor(motionTime);
    float motionProgress = fract(motionTime);
    // Smoothly travel between targets for the whole interval; avoid the
    // abrupt early move followed by a long stationary pause.
    float transition = smoothstep(0.0, 1.0, motionProgress);

    return mix(
        randomMotionTarget(motionStep - 1.0, creatureId, amplitude),
        randomMotionTarget(motionStep, creatureId, amplitude),
        transition
    );
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

// --------------------------------------------
// EYES
// --------------------------------------------

vec4 renderEye(
    vec2 facePosition,
    vec2 center,
    vec2 eyeScale,
    vec2 gaze,
    float bass,
    float treble,
    float bassBeat,
    float midBeat,
    float trebleBeat,
    float snare,
    float voice,
    float varcentroid,
    float time,
    float eyeFlash,
    vec3 scleraTint,
    vec3 irisPrimary,
    vec3 irisSecondary,
    vec3 eyeAccent
)
{
    // Enlarge the complete eye during the mouse-button flash.
    vec2 eyePosition = (facePosition - center) / (eyeScale * (1.0 + eyeFlash * 0.28));
    float eyeDistance = length(eyePosition);

    float eyeBeat = max(
        max(max(bassBeat, midBeat), trebleBeat),
        snare
    );

    float socket = 1.0 - smoothstep(1.0, 1.18, eyeDistance);
    float eyeball = 1.0 - smoothstep(0.82, 0.94, eyeDistance);

    vec3 eyeColor = vec3(0.004, 0.008, 0.028);

    vec3 sclera = scleraTint
                * (0.82 + max(eyePosition.y, 0.0) * 0.18)
                * (1.0 + eyeBeat * 0.65 + voice * 0.15);

    eyeColor = mix(eyeColor, sclera, eyeball);

    vec2 irisPosition = eyePosition - gaze;
    float irisDistance = length(irisPosition);

    float irisRadius = 0.37
                     + bass * 0.04
                     + bassBeat * 0.05
                     + midBeat * 0.04
                     + trebleBeat * 0.035
                     + voice * 0.025
                     + eyeFlash * 0.075;

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
        clamp(
            0.5 + 0.5 * sin(time * 0.5 + treble + varcentroid * 2.0),
            0.0,
            1.0
        )
    ) * irisRays * (1.0 + eyeBeat);

    eyeColor = mix(eyeColor, irisColor, iris);

    float pupilRadius = 0.13
                      + bass * 0.10
                      + bassBeat * 0.12
                      + voice * 0.025
                      + eyeFlash * 0.075;

    float pupil = 1.0 - smoothstep(
        pupilRadius - 0.02,
        pupilRadius + 0.02,
        irisDistance
    );

    eyeColor = mix(eyeColor, vec3(0.001, 0.003, 0.012), pupil);

    vec2 glintPosition = irisPosition - vec2(-0.12, 0.14);
    float glint = exp(-dot(glintPosition, glintPosition) * 220.0);

    eyeColor += vec3(0.8, 0.96, 1.0) * glint * eyeball
              * (1.0 + eyeBeat * 0.8);

    // Snare adds a short secondary reflection.
    eyeColor += vec3(1.0, 0.92, 0.78)
              * glint * snare * 0.75 * eyeball;

    eyeColor += irisPrimary * eyeBeat * 0.45 * eyeball * (1.0 - pupil);

    // Brief bright flash over the whole eyeball.
    eyeColor += vec3(0.75, 0.9, 1.0) * eyeFlash * eyeball * 1.8;

    float eyeRim = smoothstep(0.78, 0.88, eyeDistance)
                 * (1.0 - smoothstep(0.94, 1.02, eyeDistance));

    eyeColor += eyeAccent * eyeRim
              * (0.15 + treble * 0.25 + eyeBeat * 1.1);

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
    float midBeat = clamp(uMidBeat, 0.0, 1.0);
    float trebleBeat = clamp(uTrebleBeat, 0.0, 1.0);

    // Instrument envelopes and transient peaks.
    float kick = clamp(max(uKick, uKickPeak * 0.85), 0.0, 1.0);
    float snare = clamp(max(uSnare, uSnarePeak * 0.85), 0.0, 1.0);
    float voice = clamp(max(uVoice, uVoicePeak * 0.85), 0.0, 1.0);
    float hiHat = clamp(max(uHiHat, uHiHatPeak * 0.85), 0.0, 1.0);

    float bassPeak = clamp(uBassPeak, 0.0, 1.0);
    float midPeak = clamp(uMidPeak, 0.0, 1.0);
    float treblePeak = clamp(uTreblePeak, 0.0, 1.0);

    float flux = clamp(uFlux, 0.0, 1.0);
    float varcentroid = clamp(uCentroid, 0.0, 1.0);

    // Transient combinations used by the three creatures.
    float kickPulse = max(kick, max(bassPeak * 0.65, beat));
    float snarePulse = max(snare, max(treblePeak * 0.45, trebleBeat));
    float voicePulse = max(voice, max(midPeak * 0.45, midBeat));

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
        uBass * 0.35 +
        uMid * 0.2 +
        uTreble * 0.1 +
        uVolume * 0.25 +
        beat * 0.1 +
        midBeat * 0.1 +
        trebleBeat * 0.1 +
        flux * 0.16,
        0.0,
        1.0
    );

    vec2 voronoiData = voronoi(
        screenUv * 4.5,
        t * (0.07 + audioEnergy * 0.14 + flux * 0.08)
    );

    float edgeCore = 1.0 - smoothstep(0.008, 0.028, voronoiData.y);
    float edgeGlow = 1.0 - smoothstep(0.02, 0.14, voronoiData.y);
    float cellCenters = exp(-voronoiData.x * 2.8);
    float patternFade = 1.0 - smoothstep(0.9, 2.0, screenRadius);

    // Spectral centroid moves the existing blue/pink color balance.
    float colorPhase = clamp(
        0.5 +
        0.5 * sin(
            screenUv.x * 0.7 +
            screenUv.y * 0.9 +
            t * 0.16 +
            uTreble * 0.8 +
            (varcentroid - 0.5) * 1.2
        ),
        0.0,
        1.0
    );

    vec3 patternColor = mix(cyan, pink, colorPhase);

    float patternGain = 0.45
                      + audioEnergy * 0.65
                      + beat * 0.35
                      + midBeat * 0.32
                      + trebleBeat * 0.3
                      + flux * 0.25;

    vec3 background = vec3(0.0015, 0.002, 0.006);

    background += patternColor
                * (edgeCore * 0.42 + edgeGlow * 0.12 + cellCenters * 0.025)
                * patternGain
                * patternFade;

    background += deepBlue * exp(-screenRadius * 1.3)
                * (0.08 + uVolume * 0.1 + beat * 0.08);
    
    // Final image accumulator: start with the background.
    vec3 color = background;
    // ----------------------------------------
    // THREE ORGANIC CREATURES
    // ----------------------------------------

    // The render order rotates over time. Creature identity (colour,
    // anatomy and instrument) is kept separate from its draw order.
    float orderOffset = mod(floor(uTime / 14.0), 3.0);

    for (int creatureIndex = 0; creatureIndex < 3; creatureIndex++)
    {
        float creatureId = mod(float(creatureIndex) + orderOffset, 3.0);

        float blueGroup = 1.0 - step(0.5, creatureId);
        float redGroup = step(0.5, creatureId) * (1.0 - step(1.5, creatureId));
        float greenGroup = step(1.5, creatureId);

        vec3 creatureDeepBlue =
            deepBlue * blueGroup +
            vec3(0.10, 0.012, 0.018) * redGroup +
            vec3(0.004, 0.07, 0.015) * greenGroup;

        vec3 creatureBlue =
            blue * blueGroup +
            vec3(0.68, 0.10, 0.018) * redGroup +
            vec3(0.015, 0.35, 0.045) * greenGroup;

        vec3 creatureCyan =
            cyan * blueGroup +
            vec3(1.0, 0.34, 0.035) * redGroup +
            vec3(0.10, 0.95, 0.18) * greenGroup;

        vec3 creatureViolet =
            violet * blueGroup +
            vec3(0.92, 0.025, 0.30) * redGroup +
            vec3(0.04, 0.7, 0.10) * greenGroup;

        vec3 creaturePink =
            pink * blueGroup +
            vec3(1.0, 0.72, 0.08) * redGroup +
            vec3(0.68, 0.95, 0.10) * greenGroup;

        vec3 creatureWhite =
            white * blueGroup +
            vec3(1.0, 0.88, 0.62) * redGroup +
            vec3(0.72, 1.0, 0.72) * greenGroup;

        vec3 creatureSclera =
            vec3(0.48, 0.72, 0.86) * blueGroup +
            vec3(0.94, 0.70, 0.48) * redGroup +
            vec3(0.52, 0.86, 0.56) * greenGroup;

        // Each creature is now driven by a specific instrument.
        float creatureKick = kick * blueGroup;
        float creatureSnare = snare * redGroup;
        float creatureHiHat = hiHat * greenGroup;

        // Dedicated transient peaks.
        float creatureKickPeak = uKickPeak * blueGroup;
        float creatureSnarePeak = uSnarePeak * redGroup;
        float creatureHiHatPeak = uHiHatPeak * greenGroup;

        // Instrument-specific rhythmic responses.
        float creatureBassBeat = max(
            creatureKick,
            creatureKickPeak
        );

        float creatureMidBeat = max(
            creatureHiHat,
            creatureHiHatPeak
        );

        float creatureTrebleBeat = max(
            creatureSnare,
            creatureSnarePeak
        );

        float creatureBeat = max(
            max(creatureBassBeat, creatureMidBeat),
            creatureTrebleBeat
        );

        // Use each instrument's envelope as its main energy source.
        float creatureBandLevel =
            kick * blueGroup +
            snare * redGroup +
            hiHat * greenGroup;

        float creaturePeak =
            creatureKickPeak +
            creatureSnarePeak +
            creatureHiHatPeak;

        float creatureVoice = 0.0;

        float sizeResponse = smoothstep(
            0.015,
            0.45,
            clamp(creatureBandLevel, 0.0, 1.0)
        );
        const float CREATURE_EXTENT = 1.08;

        float maximumCreatureScale = min(
            0.65,
            aspect * 0.5 / CREATURE_EXTENT
        );

        // Kick expands the blue organism; other organisms retain
        // their original band-driven scale response.
        float creatureScale = 1.25 * min(
            maximumCreatureScale * 1.22,
            maximumCreatureScale * (
                0.82 +
                sizeResponse * 0.18 +
                creatureBeat * 0.22 +
                creatureKick * 0.09 +
                creaturePeak * 0.035
            )
        );

        // IMPORTANT: position limits are calculated from the maximum
        // resting scale, not the instantaneous beat-expanded scale.
        // Previously creatureExtent used creatureScale, which grows on a
        // beat. That made screenLimit shrink on the beat and clamp the
        // creatureCenter back toward its anchor, so the pulse looked as if
        // it was being pulled toward the creature's old position.
        float positionExtent = maximumCreatureScale * CREATURE_EXTENT;

        vec2 screenLimit = max(
            vec2(aspect, 1.0) - vec2(positionExtent + 0.04),
            vec2(0.0)
        );

        // Three independent orbital paths overlap around the centre.
        // There are no left/middle/right lanes: the creatures can approach,
        // cross and partially overlap one another.
        float orbitAngle = uTime * 0.105
                         + creatureId * (TWO_PI / 3.0);

        vec2 creatureAnchor = vec2(
            cos(orbitAngle) * aspect * 0.25,
            sin(orbitAngle) * 0.17
        );

        // Independent slow wandering is added to the orbit.
        vec2 movement = creatureMotion(
            creatureId,
            uTime,
            vec2(aspect * 0.29, 0.22)
        );

        // This is the one and only world-space centre of the organism.
        // Every body part and every audio pulse is evaluated relative to it.
        vec2 creatureCenter = clamp(
            creatureAnchor + movement,
            -screenLimit,
            screenLimit
        );

        // All radial geometry, beat expansion and tentacle roots use this
        // local origin. Moving the creature translates the whole coordinate
        // frame without shifting the pulse relative to its body.
        vec2 creatureLocalPosition = screenUv - creatureCenter;
        vec2 uv = creatureLocalPosition / creatureScale;

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

        // Each species keeps the original rounded core, but its silhouette
        // now has a different anatomical rhythm.
        float blueArmorShape =
            sin(angle * 8.0 + t * 0.22) * 0.018 +
            sin(angle * 16.0 - t * 0.16) * 0.005;

        float redLobedShape =
            sin(angle * 3.0 + 0.45) * 0.026 +
            sin(angle * 6.0 - t * 0.32) * 0.012 +
            sin(angle * 9.0 + t * 0.18) * 0.005;

        float greenBellShape =
            sin(angle * 5.0 + t * 0.42) * 0.022 +
            sin(angle * 10.0 - t * 0.65) * 0.008;

        float organic =
            blueArmorShape * blueGroup +
            redLobedShape * redGroup +
            greenBellShape * greenGroup;

        // Voice changes the organic deformation.
        float voiceDeformation = sin(
            angle * 3.0 + t * (1.0 + voice * 1.8)
        ) * creatureVoice * 0.018;

        float speciesBodyRadius =
            0.35 * blueGroup +
            0.335 * redGroup +
            0.305 * greenGroup;

        float bodyRadius =
            speciesBodyRadius +
            organic +
            voiceDeformation +
            wave * (
                0.025 +
                creatureBandLevel * 0.055 +
                creatureVoice * 0.025
            ) +
            creatureBeat * 0.04 +
            creatureKick * (0.035 + blueGroup * 0.025) -
            creatureSnare * redGroup * 0.012;

        float bodyDist = radius - bodyRadius;

        float bodyMask = 1.0 - smoothstep(
            -0.008,
            0.008,
            bodyDist
        );

        // ----------------------------------------
        // SPECIES-SPECIFIC EXTREMITIES
        // ----------------------------------------

        float tentacleGlow = 0.0;
        float tentacleCore = 0.0;
        float anatomyGlow = 0.0;
        float anatomyCore = 0.0;

        // Eight muscular arms for the colossus, six articulated arms for
        // the predator and ten branching arms for the sensory organism.
        float armCount =
            8.0 * blueGroup +
            6.0 * redGroup +
            10.0 * greenGroup;

        for (int i = 0; i < 10; i++)
        {
            float id = float(i);

            if (id < armCount)
            {
                float baseAngle = id * TWO_PI / armCount
                                + creatureId * 0.35
                                + (redGroup * 0.12 * sin(id * 4.7));

                float audioIndex = fract((id + 0.5) / armCount);

                float armWave = texture2D(
                    uWaveform,
                    vec2(audioIndex, 0.0)
                ).r * 2.0 - 1.0;

                float armFFT = texture2D(
                    uSpectrum,
                    vec2(audioIndex, 0.0)
                ).r;

                float armLength =
                    0.28 +
                    armFFT * (0.12 + blueGroup * 0.07) +
                    creatureBandLevel * 0.10 +
                    armWave * 0.025 +
                    creatureKick * blueGroup * 0.075 +
                    creatureSnare * redGroup * 0.035 +
                    creatureHiHat * greenGroup * 0.025;

                float progress = clamp(
                    (radius - bodyRadius) / max(armLength, 0.001),
                    0.0,
                    1.0
                );

                // Different movement signatures: heavy muscle, sharp
                // articulated recoil, and fast sensory-filament vibration.
                float blueSway = sin(
                    progress * 4.2 - t * 1.25 + id * 1.7
                ) * (0.055 + creatureKick * 0.035);

                float redSway = sin(
                    progress * 6.5 + t * 3.0 + id * 2.4
                ) * 0.075
                + creatureSnare * 0.055 * sin(progress * 19.0 + id);

                float greenSway = sin(
                    progress * 8.0 - t * 7.5 + id * 2.8
                ) * (0.045 + creatureHiHat * 0.035);

                float sway = blueSway * blueGroup
                           + redSway * redGroup
                           + greenSway * greenGroup;

                float secondarySway = sin(
                    progress * 11.0 - t * (1.8 + greenGroup * 5.5) + id * 1.3
                ) * (0.018 + greenGroup * 0.025);

                float curvature = sway + secondarySway
                                + armWave * (0.045 + greenGroup * 0.035);

                // The predator's arms bend at three visible joints.
                float jointBend = redGroup * creatureSnare * 0.035 * (
                    sin(progress * 9.0 + id) +
                    0.55 * sin(progress * 17.0 - t * 2.0 + id)
                );

                float armAngle = baseAngle + curvature + jointBend;

                float angularDist = abs(
                    angleDifference(angle, armAngle)
                );

                float dist = angularDist * max(radius, 0.1);

                // Thick roots taper toward the tips. The blue arms have
                // muscular swellings; red arms retain a segmented profile.
                float blueMuscle = 1.0
                    + 0.20 * sin(progress * 22.0 - t * 1.8 + id * 2.1)
                    + 0.10 * sin(progress * 39.0 + id);

                float redSegmentProfile = 1.0
                    + 0.13 * sin(progress * 18.0 + id * 1.7);

                float baseWidth =
                    0.043 * blueGroup +
                    0.032 * redGroup +
                    0.015 * greenGroup;

                float tipWidth =
                    0.0045 * blueGroup +
                    0.0035 * redGroup +
                    0.0022 * greenGroup;

                float width = mix(baseWidth, tipWidth, progress);
                width *= blueMuscle * blueGroup
                       + redSegmentProfile * redGroup
                       + (1.0 + 0.08 * sin(progress * 28.0 - t * 8.0 + id)) * greenGroup;
                width += creatureKick * blueGroup * 0.008 * (1.0 - progress);
                width = max(width, 0.0015);

                float endFade = 1.0 - smoothstep(0.91, 1.0, progress);

                float armVisibility = step(bodyRadius, radius) *
                    (1.0 - smoothstep(
                        armLength * 0.97,
                        armLength,
                        radius - bodyRadius
                    ));

                float core = 1.0 - smoothstep(
                    width * 0.38,
                    width * 0.78,
                    dist
                );

                float glow = exp(-dist / max(width * 2.8, 0.001));

                float fineShimmer = 0.72 + 0.28 * sin(
                    progress * 42.0 - t * 10.0 + id * 7.1
                );

                float shimmerGain = 1.0 + creatureHiHat * fineShimmer * 0.65;

                tentacleCore += core * armVisibility * endFade;
                tentacleGlow += glow * armVisibility * endFade
                              * (0.48 + armFFT * 0.7)
                              * shimmerGain;

                // Blue: luminous muscle knots and transverse pressure rings.
                float muscleKnots = max(
                    exp(-abs(progress - 0.28) * 34.0),
                    max(
                        exp(-abs(progress - 0.56) * 34.0),
                        exp(-abs(progress - 0.80) * 34.0)
                    )
                );
                anatomyGlow += muscleKnots * glow * armVisibility
                             * blueGroup * (0.35 + creatureKick * 1.1);

                // Red: bright joint nodes and short lateral spines at
                // three positions along each articulated arm.
                float jointNodes = max(
                    exp(-abs(progress - 0.24) * 48.0),
                    max(
                        exp(-abs(progress - 0.52) * 48.0),
                        exp(-abs(progress - 0.79) * 48.0)
                    )
                );
                anatomyGlow += jointNodes * glow * armVisibility
                             * redGroup * (0.45 + creatureSnare * 1.5);
                anatomyCore += jointNodes * core * armVisibility * redGroup * 0.7;

                float spineWindow = max(
                    exp(-abs(progress - 0.30) * 42.0),
                    max(
                        exp(-abs(progress - 0.57) * 42.0),
                        exp(-abs(progress - 0.82) * 42.0)
                    )
                );

                float spineSpread = 0.045 + 0.035 * progress
                                  + creatureSnare * 0.045;
                float spineLeftAngle = armAngle + spineSpread;
                float spineRightAngle = armAngle - spineSpread;
                float spineLeftDist = abs(angleDifference(angle, spineLeftAngle))
                                    * max(radius, 0.1);
                float spineRightDist = abs(angleDifference(angle, spineRightAngle))
                                     * max(radius, 0.1);
                float spineWidth = mix(0.010, 0.0015, progress);
                float spineLeft = exp(-spineLeftDist / max(spineWidth, 0.001))
                                * spineWindow * armVisibility * redGroup;
                float spineRight = exp(-spineRightDist / max(spineWidth, 0.001))
                                 * spineWindow * armVisibility * redGroup;
                anatomyGlow += (spineLeft + spineRight) * (0.55 + creatureSnare * 1.3);
                anatomyCore += (spineLeft + spineRight) * 0.45;

                // Green: two fine branches grow outward from each main arm.
                // They begin partway along the limb so the root stays readable.
                float branchStart = smoothstep(0.28, 0.43, progress);
                float branchEnd = 1.0 - smoothstep(0.88, 1.0, progress);
                float branchActive = branchStart * branchEnd * greenGroup;
                float branchSpread = 0.075 + progress * 0.13
                                   + 0.018 * sin(t * 3.0 + id);
                float branchLeftAngle = armAngle + branchSpread;
                float branchRightAngle = armAngle - branchSpread;
                float branchLeftDist = abs(angleDifference(angle, branchLeftAngle))
                                     * max(radius, 0.1);
                float branchRightDist = abs(angleDifference(angle, branchRightAngle))
                                      * max(radius, 0.1);
                float branchWidth = mix(0.008, 0.0012, progress);
                float branchLeft = exp(-branchLeftDist / max(branchWidth * 2.0, 0.001))
                                 * branchActive;
                float branchRight = exp(-branchRightDist / max(branchWidth * 2.0, 0.001))
                                  * branchActive;
                anatomyGlow += (branchLeft + branchRight)
                             * (0.35 + creatureHiHat * 1.25)
                             * (0.6 + armFFT);
                anatomyCore += (branchLeft + branchRight) * 0.55;

                // Tiny sensory bulbs sit along the green branches.
                float sensoryBulbs = max(
                    exp(-abs(progress - 0.48) * 55.0),
                    exp(-abs(progress - 0.72) * 55.0)
                );
                anatomyGlow += sensoryBulbs * (branchLeft + branchRight)
                             * greenGroup * (0.7 + creatureHiHat * 1.5);
            }
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

        vec3 lightDir = normalize(vec3(-0.5, 0.7, 0.8));

        float diffuse = max(dot(normal, lightDir), 0.0);

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

        float rim = pow(1.0 - sphereZ, 2.0);

        // Surface structures: armored radial seams on the blue species,
        // overlapping organic lobes on the red one, and soft membranes on green.
        float blueSeams = 1.0 - smoothstep(
            0.018,
            0.065,
            abs(sin(angle * 4.0 + 0.12 * sin(t)))
        );
        blueSeams *= smoothstep(0.25, 0.72, sphereR) * blueGroup;

        float redRidges = 0.5 + 0.5 * sin(angle * 6.0 + sphereR * 8.0 + t * 0.25);
        redRidges = pow(redRidges, 8.0) * redGroup;

        float greenMembranes = (0.5 + 0.5 * sin(angle * 10.0 + sphereR * 12.0 - t * 0.8));
        greenMembranes *= smoothstep(0.18, 0.85, sphereR) * greenGroup;

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
            0.12 + 0.08 * sin(
                angle * 2.0 - t * 0.3 + uMid * 0.3
            )
        );

        // Spectral centroid shifts the existing palette subtly.
        float spectralShift = (varcentroid - 0.5) * 0.16;

        plasmaColor = mix(
            plasmaColor,
            creatureCyan,
            clamp(spectralShift + 0.08, 0.0, 0.16)
        );

        plasmaColor *= 0.4 + diffuse * 0.75;

        plasmaColor += creatureWhite * highlight * 1.5;

        plasmaColor += creatureWhite * creatureBeat
                     * (0.28 + rim * 0.65);

        plasmaColor += creatureViolet * rim * 0.8;

        plasmaColor -= creatureDeepBlue * blueSeams * 0.48;
        plasmaColor += creatureCyan * blueSeams * (0.12 + creatureKick * 0.25);
        plasmaColor += creaturePink * redRidges * (0.08 + creatureSnare * 0.22);
        plasmaColor += creatureCyan * greenMembranes * (0.035 + creatureHiHat * 0.12);

        plasmaColor += mix(
            creatureBlue,
            creatureCyan,
            0.5 + 0.5 * sin(t)
        ) * exp(-sphereR * 3.5)
          * (
              0.12 +
              uBass * 0.35 +
              beat * 0.25 +
              creatureKick * 0.12
          );

        // Snare adds a transient surface flash rather than a permanent glow.
        plasmaColor += creatureWhite
                     * creatureSnare
                     * (0.08 + rim * 0.22)
                     * bodyMask;

        // ----------------------------------------
        // FACE / EYES
        // ----------------------------------------

        vec2 facePosition = uv / max(bodyRadius, 0.001);

        // ----------------------------------------
        // MOUSE-TRACKING GAZE
        // ----------------------------------------

        // Convert the normalized mouse position to the same aspect-corrected
        // coordinate system used by screenUv.
        vec2 mouseScreen = uMouse * 2.0 - 1.0;
        mouseScreen.x *= aspect;

        // Find the mouse relative to this creature and then to its eye.
        // Each creature therefore looks toward the cursor from its own position.
        vec2 mouseFacePosition =
            ((mouseScreen - creatureCenter) / creatureScale)
            / max(bodyRadius, 0.001);

        vec2 eyeCenter = vec2(0.0, 0.02);
        vec2 eyeScale =
            vec2(0.62, 0.48) * blueGroup +
            vec2(0.43, 0.59) * redGroup +
            vec2(0.34, 0.31) * greenGroup;

        vec2 mouseEyePosition = (mouseFacePosition - eyeCenter) / eyeScale;
        float mouseGazeDistance = length(mouseEyePosition);

        // Limit iris travel so it remains inside the eyeball.
        vec2 gaze = mouseEyePosition
                  * min(1.0, 0.30 / max(mouseGazeDistance, 0.001));

        // uMouseClick4 is a decaying envelope supplied by JavaScript.
        float eyeFlash = clamp(uMouseClick4, 0.0, 1.0);

        vec4 eye = renderEye(
            facePosition,
            eyeCenter,
            eyeScale,
            gaze,
            uBass,
            uTreble,
            creatureBassBeat,
            creatureMidBeat,
            creatureTrebleBeat,
            snare,
            voice,
            varcentroid,
            t,
            eyeFlash,
            creatureSclera,
            creatureBlue,
            creatureViolet,
            creatureCyan
        );

        plasmaColor = mix(plasmaColor, eye.rgb, eye.a);

        // Six small independent sensory eyes surround the green organism's
        // central eye. They use the same mouse gaze, but remain individually
        // positioned around the bell-shaped core.
        if (greenGroup > 0.5)
        {
            for (int sensorIndex = 0; sensorIndex < 6; sensorIndex++)
            {
                float sensorAngle = float(sensorIndex) * TWO_PI / 6.0
                                  + t * 0.045;
                vec2 sensorCenter = vec2(
                    cos(sensorAngle) * 0.69,
                    sin(sensorAngle) * 0.69
                );
                vec2 sensorScale = vec2(0.105, 0.105);
                vec2 sensorMousePosition =
                    (mouseFacePosition - sensorCenter) / sensorScale;
                float sensorMouseDistance = length(sensorMousePosition);
                vec2 sensorGaze = sensorMousePosition
                    * min(1.0, 0.22 / max(sensorMouseDistance, 0.001));

                vec4 sensorEye = renderEye(
                    facePosition,
                    sensorCenter,
                    sensorScale,
                    sensorGaze,
                    uBass,
                    uTreble,
                    creatureBassBeat,
                    creatureMidBeat,
                    creatureTrebleBeat,
                    snare,
                    voice,
                    varcentroid,
                    t + float(sensorIndex) * 0.17,
                    eyeFlash * 0.65,
                    creatureSclera,
                    creatureBlue,
                    creatureViolet,
                    creatureCyan
                );

                plasmaColor = mix(plasmaColor, sensorEye.rgb, sensorEye.a);
            }
        }

        // ----------------------------------------
        // TENTACLE COLORS
        // ----------------------------------------

        vec3 tentacleColor = mix(
            creatureCyan,
            creatureViolet,
            0.5 + 0.5 * sin(angle * 3.0 + t)
        );

        tentacleColor += creaturePink * uTreble * 0.2;

        // HiHat increases the fine filament brightness.
        tentacleColor += creatureWhite * creatureHiHat * 0.12;

        vec3 tendrils = tentacleColor
                      * tentacleGlow
                      * (0.8 + creatureBeat * 0.7);

        tendrils += creatureWhite
                  * tentacleCore
                  * (1.2 + creatureBeat * 0.8 + creatureSnare * 0.3);

        // Anatomical nodes, armor seams, joints, spines and sensory branches.
        tendrils += creatureCyan * anatomyGlow
                  * (0.65 + creatureBeat * 0.55);
        tendrils += creatureWhite * anatomyCore
                  * (0.45 + creatureSnare * 0.65 + creatureHiHat * 0.35);

        // ----------------------------------------
        // ENERGY AURA
        // ----------------------------------------

        float aura = exp(-abs(radius - bodyRadius) * 16.0);
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

        creatureColor += auraColor * aura
                       * (0.35 + creatureBeat * 1.1 + flux * 0.12);

        creatureColor += creatureBlue
                       * exp(-radius * 4.0)
                       * bodyMask
                       * (0.15 + creatureBandLevel * 0.5);

        float creatureAlpha = clamp(
            bodyMask +
            tentacleGlow * 0.35 +
            tentacleCore * 0.5 +
            anatomyGlow * 0.22 +
            anatomyCore * 0.25 +
            aura * 0.35,
            0.0,
            1.0
        );

        color = creatureColor + background * 0.0
              + color * (1.0 - creatureAlpha);
    }

    // ----------------------------------------
    // GENERAL VOLUME
    // ----------------------------------------

    color *= 0.65 + uVolume * 1.4;

    // Subtle activity response without washing out the palette.
    color += color * flux * 0.08;

    color *= exp(-screenRadius * 0.6);

    // ----------------------------------------
    // BOTTOM OSCILLOSCOPE
    // ----------------------------------------

    const float WAVEFORM_SIZE = 1024.0;

    float waveformPosition = clamp(vUv.x, 0.0, 1.0)
                           * (WAVEFORM_SIZE - 1.0);

    float waveformIndex = floor(waveformPosition);
    float waveformBlend = fract(waveformPosition);

    float waveformSampleA = texture2D(
        uWaveform,
        vec2(
            (waveformIndex + 0.5) / WAVEFORM_SIZE,
            0.0
        )
    ).r;

    float waveformSampleB = texture2D(
        uWaveform,
        vec2(
            (min(waveformIndex + 1.0, WAVEFORM_SIZE - 1.0) + 0.5)
            / WAVEFORM_SIZE,
            0.0
        )
    ).r;

    float scopeWave = mix(
        waveformSampleA,
        waveformSampleB,
        waveformBlend
    ) * 2.0 - 1.0;

    float scopeY = -0.82 + scopeWave * (
        0.12 +
        uVolume * 0.06 +
        kick * 0.025
    );

    float scopeDistance = abs(screenUv.y - scopeY);

    float scopeThickness = 1.2 / uResolution.y;

    float scopeLine = 1.0 - smoothstep(
        scopeThickness,
        scopeThickness * 2.6,
        scopeDistance
    );

    float scopeGlow = exp(-scopeDistance * 55.0);

    float scopeIntensity = 1.0 + snare * 0.25 + hiHat * 0.12;

    color += vec3(1.0)
           * (scopeLine * 1.6 + scopeGlow * 0.15)
           * patternFade
           * scopeIntensity;

    // ----------------------------------------
    // TONEMAPPING
    // ----------------------------------------

    color = 1.0 - exp(-color * 1.3);

    gl_FragColor = vec4(color, 1.0);
}

