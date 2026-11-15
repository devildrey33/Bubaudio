// Tunel procedural para una escena fullscreen.
// Cada pixel proyecta un rayo desde la camara y calcula donde alcanza la pared
// cilindrica; la forma de esa pared se colorea con datos de audio y luces.
precision highp float;

// Coordenadas interpoladas de la superficie fullscreen, en el rango 0..1.
varying vec2 vUv;

// Tiempo global de animacion y dimensiones actuales del render.
uniform float uTime;
uniform vec2 uResolution;

// Niveles normalizados por banda y envolventes de deteccion de beats.
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

// Texturas 1D (1024 muestras): espectro de frecuencias y forma de onda.
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TAU 6.28318530718
// En estas coordenadas, el signo negativo gira en sentido horario.
#define VIEW_ROTATION -0.78539816339

// Controles principales de movimiento. PARTICLE_SPEED se multiplica por el
// avance del tunel; ambos valores deben ser positivos para mantener avance.
#define TUNNEL_SPEED 1.8
#define PARTICLE_SPEED 6.0

// Valor pseudoaleatorio estable para cada indice de particula. Al no depender
// del tiempo, cada aguja conserva su angulo, distancia y color entre frames.
float particleHash(float value)
{
    return fract(sin(value * 127.1 + 311.7) * 43758.5453);
}

// Paleta ciclica de colores saturados, desplazada por una fase temporal.
vec3 vividPalette(float phase)
{
    return 0.5 + 0.5 * cos(TAU * (phase + vec3(0.0, 0.333, 0.667)));
}

void main()
{
    // Limitar las entradas de audio evita valores fuera del rango esperado.
    float time = max(uTime, 0.0);
    float bass = clamp(uBass, 0.0, 1.0);
    float mid = clamp(uMid, 0.0, 1.0);
    float treble = clamp(uTreble, 0.0, 1.0);
    float volume = clamp(uVolume, 0.0, 1.0);
    float beat = clamp(uBeat, 0.0, 1.0);
    float midBeat = clamp(uMidBeat, 0.0, 1.0);
    float trebleBeat = clamp(uTrebleBeat, 0.0, 1.0);
    float audioEnergy = clamp(
        bass * 0.3 + mid * 0.25 + treble * 0.2 + volume * 0.25
        + beat * 0.15 + midBeat * 0.12 + trebleBeat * 0.12,
        0.0,
        1.0
    );
    float hueCycle = fract(time * 0.035);
    float beatStrength = clamp(beat + midBeat + trebleBeat, 0.0, 1.5);
    vec3 bassBeatColor = vividPalette(hueCycle);
    vec3 midBeatColor = vividPalette(hueCycle + 0.333);
    vec3 trebleBeatColor = vividPalette(hueCycle + 0.667);
    vec3 beatEmission = beat * bassBeatColor
                      + midBeat * midBeatColor
                      + trebleBeat * trebleBeatColor;
    vec3 activeBeatColor = beatEmission / max(beat + midBeat + trebleBeat, 0.001);

    // Pasar de UV a coordenadas centradas y corregir el aspecto para que los
    // circulos sigan siendo circulos tambien en pantallas panoramicas.
    vec2 screen = vUv * 2.0 - 1.0;
    screen.x *= uResolution.x / uResolution.y;
    float rotationCos = cos(VIEW_ROTATION);
    float rotationSin = sin(VIEW_ROTATION);
    screen = vec2(
        screen.x * rotationCos - screen.y * rotationSin,
        screen.x * rotationSin + screen.y * rotationCos
    );
    float screenRadius = length(screen);

    // El desplazamiento del patron solo crece con el tiempo: el tunel nunca
    // retrocede. El rayo apunta hacia +Z, desde la camara hacia el fondo.
    float forwardTravel = time * TUNNEL_SPEED;
    vec3 rayDirection = normalize(vec3(screen * 1.18, 1.5));
    float rayAngle = atan(rayDirection.y, rayDirection.x);
    float angle01 = fract(rayAngle / TAU + 0.5);
    float sectorPosition = angle01 * 20.0;
    float sectorId = floor(sectorPosition);
    float sectorPhase = fract(sectorPosition);
    float barPanel = mod(sectorId, 2.0);

    // Leer la forma de onda interpolando entre texeles. Las muestras se toman
    // en el centro de cada texel y el indice siguiente envuelve en el extremo,
    // evitando escalones en el cierre circular.
    const float WAVEFORM_SIZE = 1024.0;
    float waveformPosition = angle01 * WAVEFORM_SIZE;
    float waveformIndex = floor(waveformPosition);
    float waveformBlend = fract(waveformPosition);
    float waveformSampleA = texture2D(
        uWaveform,
        vec2((waveformIndex + 0.5) / WAVEFORM_SIZE, 0.5)
    ).r;
    float waveformSampleB = texture2D(
        uWaveform,
        vec2((mod(waveformIndex + 1.0, WAVEFORM_SIZE) + 0.5) / WAVEFORM_SIZE, 0.5)
    ).r;
    float waveform = mix(waveformSampleA, waveformSampleB, waveformBlend) * 2.0 - 1.0;

    // El espectro se distribuye alrededor de la circunferencia; el exponente
    // da mas resolucion visual a las frecuencias bajas.
    float spectrum = texture2D(
        uSpectrum,
        vec2(pow(angle01, 1.35), 0.0)
    ).r;
    spectrum = clamp(spectrum, 0.0, 1.0);

    // Interseccion del rayo con la pared. La forma de onda, los graves y los
    // tres tipos de beat deforman el radio, pero nunca invierten el avance.
    const float BASE_WALL_RADIUS = 1.42;
    float wallRadius = BASE_WALL_RADIUS
                     + waveform * (0.11 + bass * 0.055) * (1.0 - barPanel)
                     + bass * 0.025
                     + beat * 0.07
                     + midBeat * 0.035
                     + trebleBeat * 0.025;
    float radialRay = max(length(rayDirection.xy), 0.04);
    float hitDistance = wallRadius / radialRay;
    float staticHitDistance = BASE_WALL_RADIUS / radialRay;
    vec3 wallPosition = rayDirection * hitDistance;
    float tunnelZ = wallPosition.z + forwardTravel;

    // Anillos estructurales calculados sobre el radio base, no sobre la pared
    // deformada. Sirven de soporte visual estable bajo los efectos de audio.
    float staticTunnelZ = rayDirection.z * staticHitDistance + forwardTravel;
    float staticAxialPhase = fract(staticTunnelZ / 2.3);
    float staticAxialEdge = min(staticAxialPhase, 1.0 - staticAxialPhase);
    float staticRingCore = exp(-staticAxialEdge * 85.0);
    float staticRingGlow = exp(-staticAxialEdge * 18.0);

    // Dividir la pared en 20 sectores angulares y paneles repetidos en Z.
    // Los sectores pares conservan el osciloscopio; los impares reservaran
    // su superficie para barras de espectro.
    float angularEdge = min(sectorPhase, 1.0 - sectorPhase);
    float axialCell = fract(tunnelZ / 2.3);
    float axialEdge = min(axialCell, 1.0 - axialCell);
    float panelMask = smoothstep(0.018, 0.075, angularEdge)
                    * smoothstep(0.025, 0.10, axialEdge);
    float seamWidth = 120.0 / (1.0 + beatStrength * 1.2);
    float angularSeam = exp(-angularEdge * seamWidth);
    float axialSeam = exp(-axialEdge * 75.0);

    float ringCore = exp(-axialEdge * 85.0);
    float ringGlow = exp(-axialEdge * 18.0);
    float panelId = floor(sectorPosition);
    float ringId = floor(tunnelZ / 2.3);
    float panelAlternate = mod(panelId + ringId, 2.0);
    float panelShade = 0.72 + panelAlternate * 0.28 + spectrum * 0.18;

    // Paleta de materiales y luces. La normal apunta hacia el interior del
    // tunel para calcular la iluminacion de sus paneles.
    vec3 cyan = vividPalette(hueCycle + 0.5);
    vec3 violet = vividPalette(hueCycle + 0.83);
    vec3 warmLight = vividPalette(hueCycle + 0.16);
    vec3 neon = mix(
        cyan,
        violet,
        0.5 + 0.5 * sin(rayAngle * 2.0 + tunnelZ * 0.12)
    );
    vec3 inwardNormal = -normalize(vec3(
        cos(rayAngle),
        sin(rayAngle),
        0.0
    ));
    vec3 keyLight = normalize(vec3(-0.45, 0.55, -0.8));
    float diffuse = 0.35 + 0.65 * max(dot(inwardNormal, keyLight), 0.0);

    vec3 wallColor = mix(
        vec3(0.006, 0.012, 0.038),
        vec3(0.018, 0.052, 0.12),
        panelShade * panelMask
    );
    wallColor *= diffuse;

    // Resplandor de juntas y anillos: su intensidad puede responder al nivel
    // de audio sin alterar la direccion de movimiento.
    wallColor += neon * (angularSeam * 0.48 + axialSeam * 0.22);
    wallColor += activeBeatColor * angularSeam * beatStrength * 2.2;
    wallColor += vec3(1.0) * angularSeam * beatStrength * 0.35;
    wallColor += neon * ringGlow * (0.10 + audioEnergy * 0.22);

    // En los paneles pares, mantener la linea luminosa que acompana el nivel
    // del espectro. Los impares la sustituyen por un pequeno grafico de barras.
    float stripCenter = 0.22 + 0.56 * fract(panelId * 0.618);
    float spectralStrip = exp(-abs(axialCell - stripCenter) * 90.0)
                        * panelMask
                        * (1.0 - barPanel)
                        * smoothstep(0.04, 0.72, spectrum);
    wallColor += mix(cyan, warmLight, treble)
               * spectralStrip
               * (0.45 + spectrum * 2.2 + treble * 0.35);

    // Cada panel impar contiene 16 barras distribuidas por su ancho angular;
    // la altura de cada una responde a una banda del espectro.
    const float BARS_PER_PANEL = 16.0;
    float barPosition = sectorPhase * BARS_PER_PANEL;
    float barIndex = floor(barPosition);
    float barPhase = fract(barPosition);
    float spectrumBin = (floor(panelId * 0.5) * BARS_PER_PANEL
                       + barIndex + 0.5) / (10.0 * BARS_PER_PANEL);
    float barLevel = texture2D(
        uSpectrum,
        vec2(pow(spectrumBin, 1.35), 0.0)
    ).r;
    barLevel = clamp(barLevel, 0.0, 1.0);

    // Los espacios entre barras conservan su forma vertical. Se limita la
    // altura al 25% de la escala anterior para que el grafico sea mas compacto.
    float barGapMask = smoothstep(0.08, 0.18, barPhase)
                     * (1.0 - smoothstep(0.82, 0.92, barPhase));
    float barVertical = clamp((axialCell - 0.08) / 0.84, 0.0, 1.0);
    float barHeight = (0.12 + barLevel * 0.82) * 0.25;
    float barHeightMask = 1.0 - smoothstep(
        barHeight - 0.035,
        barHeight + 0.035,
        barVertical
    );
    float barMask = barPanel * panelMask * barGapMask * barHeightMask
                  * smoothstep(0.025, 0.22, barLevel);
    wallColor += mix(cyan, warmLight, treble * 0.7)
               * barMask
               * (0.45 + barLevel * 2.4);

    // Los beats colorean los anillos dinamicos; los agudos anaden un acento
    // calido en las juntas verticales.
    float pulseLight = beat * 1.25 + midBeat * 0.9 + trebleBeat * 0.75;
    wallColor += cyan * ringCore * (0.35 + pulseLight * 2.2);
    wallColor += warmLight * angularSeam * trebleBeat * 0.55;

    // Atenuar la pared con la distancia. El anillo blanco usa la distancia
    // del radio base para mantener su posicion independiente del audio.
    float distanceFade = exp(-hitDistance * 0.018);
    wallColor *= 0.34 + 0.66 * distanceFade;
    float staticDistanceFade = exp(-staticHitDistance * 0.018);
    wallColor += vec3(1.0)
               * (staticRingCore * 0.9 + staticRingGlow * 0.12)
               * (0.34 + 0.66 * staticDistanceFade);

    // Fondo oscuro y portal de fuga al centro. La pared aparece gradualmente
    // desde el centro para ocultar la singularidad del cilindro infinito.
    vec3 portalColor = vec3(0.003, 0.008, 0.028);
    portalColor += cyan * exp(-dot(screen, screen) * 20.0)
                 * (0.10 + audioEnergy * 0.24 + beat * 0.4);
    float wallVisibility = smoothstep(0.015, 0.16, screenRadius);
    vec3 color = mix(portalColor, wallColor, wallVisibility);

    // Aro y brillo del portal frontal; su radio pulsa suavemente con graves y
    // beats, y el punto central aporta una referencia de profundidad.
    float portalRadius = 0.085 + beat * 0.018 + bass * 0.012;
    float portalRing = exp(-pow((screenRadius - portalRadius) / 0.012, 2.0));
    color += cyan * portalRing * (0.35 + beat * 1.8 + midBeat * 0.8);
    color += vec3(0.75, 0.9, 1.0) * exp(-screenRadius * 34.0)
           * (0.18 + volume * 0.25 + beat * 0.45);

    // La esfera central crece con cualquiera de los tres detectores de beat.
    // Cada banda aporta su propio color y su energia de emision.
    float sphereBeatStrength = beatStrength;
    float sphereRadius = 0.038 + sphereBeatStrength * 0.024;
    vec2 spherePosition = screen / sphereRadius;
    float sphereDistanceSquared = dot(spherePosition, spherePosition);
    float sphereMask = 1.0 - smoothstep(
        0.90,
        1.0,
        sqrt(sphereDistanceSquared)
    );
    float sphereZ = sqrt(max(0.001, 1.0 - sphereDistanceSquared));
    vec3 sphereNormal = normalize(vec3(-spherePosition, sphereZ));
    vec3 sphereLightDirection = normalize(vec3(-0.45, 0.65, 0.75));
    float sphereDiffuse = max(dot(sphereNormal, sphereLightDirection), 0.0);
    float sphereHighlight = pow(
        max(
            dot(
                reflect(-sphereLightDirection, sphereNormal),
                vec3(0.0, 0.0, 1.0)
            ),
            0.0
        ),
        18.0
    );
    float sphereRim = pow(1.0 - sphereZ, 2.0);
    vec3 sphereBaseColor = mix(
        vec3(0.025, 0.07, 0.24),
        activeBeatColor,
        clamp(beatStrength, 0.0, 1.0)
    );
    vec3 sphereSurface = sphereBaseColor * (0.22 + sphereDiffuse * 0.9)
                       + vec3(1.0) * sphereHighlight * 1.1
                       + sphereBaseColor * sphereRim * 0.45;
    color += sphereSurface * sphereMask * (1.0 + sphereBeatStrength * 0.45);

    // Emision aditiva y halo alrededor de la esfera, tintados por el beat activo.
    float sphereHalo = exp(
        -dot(screen, screen) / (sphereRadius * sphereRadius * 5.0)
    );
    color += beatEmission * sphereHalo * 4.5;
    color += vec3(1.0) * sphereHalo * sphereBeatStrength * 0.8;

    // Campo de agujas. Cada indice recibe una posicion inicial estable dentro
    // de un tramo profundo del tunel; al restar el avance, se acerca a camara.
    float beatDrive = clamp(beat * 0.8 + midBeat * 0.65 + trebleBeat * 0.5, 0.0, 1.5);
    const float PARTICLE_DEPTH = 40.0;
    for (int particleIndex = 0; particleIndex < 28; particleIndex++)
    {
        float seed = particleHash(float(particleIndex) + 7.31);
        float particleAngle = TAU * fract(seed * 13.17);
        float particleRadius = 0.12 + fract(seed * 21.73) * 1.22;
        float particleStartZ = fract(seed * 37.17) * PARTICLE_DEPTH;
        float particleZ = 0.45
                        + mod(particleStartZ - forwardTravel * PARTICLE_SPEED, PARTICLE_DEPTH);

        // Proyeccion perspectiva: al acercarse a Z=0, las agujas se desplazan
        // hacia fuera y aumentan de tamano. Su posicion queda dentro del tunel.
        vec2 particlePosition = vec2(cos(particleAngle), sin(particleAngle))
                              * particleRadius
                              * (1.27 / max(particleZ, 0.12));

        // Tamano minimo en pixeles para que las particulas lejanas sigan siendo
        // visibles; los beats tambien las ensanchan y las hacen crecer.
        float particleSize = min(
            max(
                (0.010 + fract(seed * 9.71) * 0.008 + beatDrive * 0.010)
                    / max(particleZ, 0.4),
                2.4 / uResolution.y
            ),
            0.06
        );
        vec2 particleDelta = screen - particlePosition;
        vec2 travelDirection = normalize(particlePosition + vec2(0.00001, 0.0));
        vec2 sideDirection = vec2(-travelDirection.y, travelDirection.x);
        float alongNeedle = dot(particleDelta, travelDirection);
        float acrossNeedle = abs(dot(particleDelta, sideDirection));

        // La trayectoria aparente de avance va desde el centro hacia el borde:
        // la punta queda delante y la cola se afina hacia el punto de fuga.
        float needleLength = particleSize * (7.5 + beatDrive * 3.0);
        float needlePosition = clamp(-alongNeedle / needleLength, 0.0, 1.0);
        float needleWidth = particleSize * mix(0.45, 0.10, needlePosition);
        float tailFade = smoothstep(
            -needleLength - particleSize * 0.35,
            -needleLength,
            alongNeedle
        );
        float headFade = 1.0 - smoothstep(
            -particleSize * 0.15,
            particleSize * 0.2,
            alongNeedle
        );
        float needleMask = tailFade * headFade;

        // Tres capas de brillo: nucleo fino, halo cercano y bloom mas ancho;
        // una punta adicional hace que cada aguja destaque en los beats.
        float needleCore = exp(
            -acrossNeedle * acrossNeedle
                / max(needleWidth * needleWidth * 0.22, 0.000001)
        ) * needleMask;
        float needleGlow = exp(
            -acrossNeedle * acrossNeedle
                / max(needleWidth * needleWidth * 12.0, 0.000001)
        ) * needleMask;
        float needleBloom = exp(
            -acrossNeedle * acrossNeedle
                / max(needleWidth * needleWidth * 24.0, 0.000001)
        ) * needleMask;
        float needleHead = exp(
            -alongNeedle * alongNeedle
                / max(particleSize * particleSize * 0.18, 0.000001)
            -acrossNeedle * acrossNeedle
                / max(particleSize * particleSize * 0.12, 0.000001)
        );

        // Desvanecer al pasar junto a la camara y al reaparecer al fondo evita
        // saltos visibles cuando Z se envuelve al inicio del tramo.
        float nearFade = smoothstep(0.45, 1.15, particleZ);
        float farFade = 1.0 - smoothstep(36.0, 40.5, particleZ);
        float depthVisibility = 1.0 - smoothstep(24.0, 40.0, particleZ) * 0.35;

        // El agudo desplaza el matiz hacia tonos calidos; el beat blanquea la
        // aguja y eleva su energia para que destaque sobre la pared.
        vec3 particleColor = mix(
            cyan,
            warmLight,
            fract(seed * 5.37) * treble
        );
        particleColor = mix(
            particleColor,
            vec3(0.88, 0.96, 1.0),
            clamp(beatDrive * 0.65, 0.0, 0.95)
        );
        color += particleColor
               * (needleCore * 2.6 + needleGlow * 1.4
                  + needleBloom * 0.8 + needleHead * 3.2)
               * (0.35 + volume * 0.3 + beatDrive * 4.2)
               * nearFade
               * farFade
               * depthVisibility;
    }

    // Vigneta, tonemapping exponencial y correccion gamma para la salida final.
    float vignette = 1.0 - smoothstep(0.72, 1.75, screenRadius);
    color *= vignette;
    color = 1.0 - exp(-color * (1.25 + audioEnergy * 0.35));
    color = pow(max(color, 0.0), vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
}
