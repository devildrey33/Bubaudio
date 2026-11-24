# Uniforms disponibles en los shaders

Los shaders fragment reciben las siguientes variables desde el reproductor. Los valores se actualizan en cada frame del visualizador.

```glsl
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
// ANALIZADOR
uniform float uVolume;

uniform float uBass;
uniform float uMid;
uniform float uTreble;

uniform float uBassPeak;
uniform float uMidPeak;
uniform float uTreblePeak;

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

uniform float uFlux;
uniform float uCentroid;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

uniform sampler2D uFFTHistory;
uniform float uFFTHistoryOffset;


// MOUSE
uniform vec2  uMouse;
uniform vec2  uMouseDelta;

uniform float uMouseMiddle;
uniform float uMouseRight;

uniform float uMouseButton4;
uniform float uMouseButton5;

```

## Coordenadas y tiempo

| Variable | Descripción |
|----------|-------------|
| `vUv` | Coordenadas UV interpoladas desde el vertex shader. En el quad a pantalla completa, `x` e `y` recorren normalmente el intervalo `[0, 1]`. Se usa para situar y calcular los efectos en pantalla. |
| `uTime` | Tiempo en segundos proporcionado por `requestAnimationFrame`. Avanza mientras se renderiza; no se reinicia al cambiar de canción o de shader. Úsalo para animaciones como `sin(uTime)`. |
| `uResolution` | Resolución del renderer en píxeles: `x` es el ancho e `y` el alto. Es útil para corregir la relación de aspecto o calcular tamaños de píxel. |

## Niveles de audio

Estos niveles se calculan a partir del espectro de frecuencias, se suavizan entre frames y se normalizan al intervalo `[0, 1]`. Son valores del analizador Web Audio, no porcentajes de potencia acústica.

| Variable | Descripción |
|----------|-------------|
| `uBass` | Nivel medio de las frecuencias graves, entre **20 y 250 Hz**. |
| `uMid` | Nivel medio de las frecuencias medias, entre **250 Hz y 4 kHz**. |
| `uTreble` | Nivel medio de las frecuencias agudas, entre **4 y 16 kHz**. |
| `uVolume` | Nivel medio de todos los bins del espectro. Representa la energía general observada por el analizador; no es el volumen de salida configurado en el reproductor. |

## Bandas musicales

Además de las bandas generales, el analizador expone varios detectores orientados a instrumentos y elementos musicales concretos.

Todos los valores están normalizados aproximadamente al intervalo `[0, 1]`.

| Variable | Descripción |
|----------|-------------|
| `uKick` | Energía asociada al bombo. Aproximadamente entre **40 y 100 Hz**. |
| `uSnare` | Energía asociada a la caja. Aproximadamente entre **150 y 300 Hz**. |
| `uVoice` | Energía asociada a voces e instrumentos predominantes de la zona media. Aproximadamente entre **500 y 3000 Hz**. |
| `uHiHat` | Energía asociada a platos, hi-hats y contenido brillante. Aproximadamente entre **6 y 12 kHz**. |

Estos valores son ideales para animaciones continuas como:

- Escalado de objetos.
- Desplazamientos.
- Intensidad de partículas.
- Brillo de materiales.
- Distorsiones suaves.

## Pulsos de transitorios

`uBeat`, `uMidBeat` y `uTrebleBeat` son envolventes breves normalizadas al intervalo `[0, 1]`. Se activan cuando el nivel de su banda sube de forma significativa respecto a su nivel reciente y luego decaen gradualmente.

| Variable | Banda que detecta |
|----------|-------------------|
| `uBeat` | Graves. |
| `uMidBeat` | Medios. |
| `uTrebleBeat` | Agudos. |

Estos pulsos no representan un BPM ni cada beat musical: detectan subidas repentinas de energía en cada banda.

Puedes usarlos para disparar:

- Destellos.
- Escalados.
- Sacudidas de cámara.
- Cambios bruscos de color.

## Picos musicales

Además de los pulsos por banda, existen detectores específicos para instrumentos concretos y picos generales de energía para graves, medios y agudos.

Los valores están normalizados entre `[0, 1]` y responden principalmente a transitorios rápidos o máximos recientes de intensidad.

| Variable | Descripción |
|----------|-------------|
| `uBassPeak` | Pico reciente de energía en graves. Ideal para mantener brillo, escalado o efectos visuales incluso después de que el golpe principal haya desaparecido. |
| `uMidPeak` | Pico reciente de energía en medios. Útil para reforzar elementos reactivos relacionados con melodías, voces e instrumentos principales. |
| `uTreblePeak` | Pico reciente de energía en agudos. Perfecto para chispas, detalles luminiscentes y partículas persistentes. |
| `uKickPeak` | Pico de energía del bombo. Muy útil para pulsos globales, zooms y flashes. |
| `uSnarePeak` | Pico de energía de la caja. Ideal para destellos, explosiones y cambios bruscos. |
| `uVoicePeak` | Pico asociado a voces prominentes. Útil para generar actividad localizada o efectos orgánicos. |
| `uHiHatPeak` | Pico asociado a platos y hi-hats. Ideal para chispas, partículas y detalles finos. |

Los uniforms `uBassPeak`, `uMidPeak` y `uTreblePeak` funcionan como un sistema de *peak hold*: conservan temporalmente los máximos recientes y descienden gradualmente con el tiempo.

Estos uniforms suelen resultar más útiles para mantener efectos visuales persistentes, mientras que los pulsos (`uBeat`, `uMidBeat`, `uTrebleBeat`) son más adecuados para disparar eventos instantáneos.

Ejemplos:

```glsl
glow += uKickPeak;
flash += uSnarePeak;
synapse += uVoicePeak;
sparks += uHiHatPeak;
```

## Texturas de audio

### uSpectrum

Contiene la FFT actual.

Dimensiones:

```txt
2048 × 1
```

(Con FFTSize = 4096).

El dato de cada muestra está almacenado en el canal rojo (`.r`).

| Variable | Descripción |
|----------|-------------|
| `uSpectrum` | Espectro FFT actual, con frecuencias desde las más bajas hasta las más altas a lo largo de `x`. Sus valores están normalizados aproximadamente a `[0, 1]`. |

Lectura básica:

```glsl
float fft = texture2D(
    uSpectrum,
    vec2(x, 0.5)
).r;
```

---

### uWaveform

Contiene la forma de onda temporal actual.

Dimensiones:

```txt
2048 × 1
```

| Variable | Descripción |
|----------|-------------|
| `uWaveform` | Muestras de la forma de onda en el dominio temporal. El silencio se encuentra aproximadamente en `0.5`. |

Lectura básica:

```glsl
float wave =
    texture2D(
        uWaveform,
        vec2(x, 0.5)
    ).r * 2.0 - 1.0;
```

---

En ambas texturas:

```glsl
x = 0.0;  // Primera muestra
x = 0.5;  // Zona central
x = 1.0;  // Última muestra
```

## Historial FFT (Espectrograma)

Además de la FFT actual, BubAudio expone un histórico temporal completo del espectro mediante una textura 2D.

```glsl
uniform sampler2D uFFTHistory;
uniform float uFFTHistoryOffset;
```

Esta textura almacena las FFT capturadas durante los últimos frames.

Dimensiones actuales:

```txt
2048 × 256
```

donde:

```txt
X = frecuencia
Y = tiempo
```

Cada fila representa una FFT completa tomada en un instante concreto.

---

### Diferencia entre uSpectrum y uFFTHistory

```txt
uSpectrum
```

Contiene:

```txt
Una sola FFT
(el instante actual)
```

```txt
uFFTHistory
```

Contiene:

```txt
Las últimas 256 FFT
(memoria temporal del audio)
```

---

### Estructura conceptual

```txt
Tiempo reciente
       ↑
       |
       |
       |
       |
       +------------→ Frecuencia

    Graves      Agudos
```

Frecuencia:

```txt
x = 0.0 → Graves
x = 1.0 → Agudos
```

Tiempo:

```txt
y = 0.0 → Más antiguo
y = 1.0 → Más reciente
```

---

### Lectura básica

```glsl
float fft = texture2D(
    uFFTHistory,
    vec2(vUv.x, vUv.y)
).r;
```

Espectrograma de depuración:

```glsl
float fft = texture2D(
    uFFTHistory,
    vec2(vUv.x, vUv.y)
).r;

gl_FragColor =
    vec4(vec3(fft), 1.0);
```

---

### Ring Buffer

Internamente el histórico utiliza un ring buffer para evitar copiar o desplazar la memoria en cada frame.

```glsl
uniform float uFFTHistoryOffset;
```

indica la posición actual de escritura dentro del histórico.

Intervalo:

```txt
0.0 → inicio
1.0 → final
```

La mayoría de visualizaciones no necesitan utilizarlo.

Los shaders que quieran reconstruir correctamente el orden temporal pueden usar:

```glsl
float historyY = fract(vUv.y + uFFTHistoryOffset);

float fft = texture2D(uFFTHistory, vec2(vUv.x, historyY)).r;
```

---

### Modo espectrograma

Representación clásica:

```txt
X = frecuencia
Y = tiempo
```

```glsl
float fft = texture2D(uFFTHistory, vec2(vUv.x, vUv.y)).r;
```

Ideal para:

- Depuración.
- Análisis musical.
- Detección visual de patrones.
- Visualización de voces y armónicos.

---

### Modo cascada

Intercambiando los ejes:

```txt
X = tiempo
Y = frecuencia
```

```glsl
float fft = texture2D(uFFTHistory, vec2(vUv.y, vUv.x)).r;
```

Ideal para:

- Túneles.
- Paisajes reactivos.
- Energía fluida.
- Visualizaciones estilo Winamp / MilkDrop.

---

### Escala logarítmica

Las FFT distribuyen las frecuencias linealmente, mientras que la percepción humana es aproximadamente logarítmica.

Puede obtenerse una distribución visual más equilibrada comprimiendo las frecuencias altas:

```glsl
float freq = pow(vUv.x, 2.5);

float fft = texture2D(uFFTHistory, vec2(freq, vUv.y)).r;
```

Esto proporciona mucho más detalle visual en graves y medios.

---

### Usos recomendados

`uFFTHistory` es especialmente útil para:

- Espectrogramas.
- Cascadas de energía.
- Campos de partículas.
- Redes neuronales.
- Nebulosas musicales.
- Galaxias reactivas.
- Túneles.
- Efectos temporales.
- Visualizaciones tipo MilkDrop.

## Recomendaciones rápidas

| Necesidad | Uniform recomendado |
|------------|---------------------|
| Movimiento continuo | `uBass`, `uMid`, `uTreble`, `uKick`, `uVoice` |
| Latidos globales | `uBeat`, `uKickPeak` |
| Destellos | `uSnarePeak` |
| Actividad neuronal | `uVoice`, `uVoicePeak` |
| Chispas y detalles finos | `uHiHat`, `uHiHatPeak` |
| Osciloscopios | `uWaveform` |
| FFT actual | `uSpectrum` |
| Memoria temporal del audio | `uFFTHistory` |
| Espectrogramas | `uFFTHistory` |
| Efectos tipo MilkDrop | `uFFTHistory` |

## Ejemplos de uso

Pulso con el bombo:

```glsl
scale += uKickPeak * 0.2;
```

Actividad neuronal ligada a la voz:

```glsl
energy += uVoicePeak;
```

Generación de chispas:

```glsl
sparks += uHiHatPeak;
```

Brillo continuo con la caja:

```glsl
glow += uSnare * 0.5;
```

Espectrograma simple:

```glsl
float fft = texture2D(uFFTHistory, vec2(vUv.x, vUv.y)).r;
gl_FragColor = vec4(vec3(fft), 1.0);
```

Uso combinado de memoria temporal y bombo:

```glsl
float fft = texture2D(uFFTHistory, vec2(vUv.x, vUv.y)).r;
float energy = fft * (1.0 + uKickPeak);
glow += energy;
```

## Análisis espectral avanzado

Además de los niveles de energía y los detectores de instrumentos, BubAudio expone varias métricas espectrales que describen cómo evoluciona el contenido sonoro.

Todos estos valores están normalizados aproximadamente al intervalo `[0, 1]`.

| Variable | Descripción |
|----------|-------------|
| `uFlux` | Spectral Flux. Mide cuánto ha cambiado el espectro respecto al frame anterior. |
| `uCentroid` | Spectral Centroid. Indica si el sonido global está dominado por frecuencias graves o agudas. |

---

### uFlux (Spectral Flux)

`uFlux` mide la cantidad de cambio producida en el espectro entre dos frames consecutivos.

No representa volumen, sino actividad musical.

Valores típicos:

```txt
Sonido sostenido        → Bajo
Pad atmosférico         → Bajo
Bajo continuo           → Bajo
Entrada de voz          → Alto
Caja                    → Alto
Bombo                   → Alto
Crash                   → Muy alto
```

Cuando aparecen nuevos sonidos o transitorios, `uFlux` aumenta rápidamente.

Ejemplos:

```glsl
glow += uFlux;
```

```glsl
particles += uFlux * 2.0;
```

```glsl
distortion += uFlux * 0.05;
```

Usos recomendados:

- Destellos.
- Explosiones.
- Partículas.
- Reacciones instantáneas.
- Detección de cambios musicales.
- Actividad neuronal.
- Sincronización visual avanzada.

---

### uCentroid (Spectral Centroid)

`uCentroid` representa el centro de gravedad del espectro.

Describe el equilibrio tonal general de la música.

```txt
0.0 ────────────── 1.0

Graves         Agudos
```

Valores orientativos:

```txt
Subgrave dominante     ≈ 0.10
Bombo + bajo           ≈ 0.20
Voz                    ≈ 0.40
Guitarras              ≈ 0.50
Hi-Hat                 ≈ 0.70
Crash brillante        ≈ 0.90
```

No identifica instrumentos concretos, sino el carácter tonal global del sonido.

Ejemplos:

Cambio dinámico de color:

```glsl
vec3 lowColor  = vec3(0.0, 0.3, 1.0);
vec3 highColor = vec3(1.0, 0.4, 0.0);

vec3 musicColor =
    mix(
        lowColor,
        highColor,
        uCentroid
    );
```

Control de complejidad:

```glsl
iterations += uCentroid * 8.0;
```

Control de brillo:

```glsl
glow += uCentroid * 0.5;
```

Usos recomendados:

- Cambios de color.
- Paletas dinámicas.
- Nebulosas reactivas.
- Fractales.
- Túneles.
- Variaciones de materiales.
- Transiciones entre estados graves y agudos.


## MOUSE

### `uMouse`
Posición actual del cursor del ratón, normalizada al área de renderizado.  
- **X** = posición horizontal.
- **Y** = posición vertical.

### `uMouseDelta`
Desplazamiento del ratón desde el último frame. Permite detectar movimiento, velocidad y dirección del cursor.
- **X** = movimiento horizontal.
- **Y** = movimiento vertical.

### `uMouseMiddle`
Estado del botón central (rueda) del ratón.
- `0.0` = sin pulsar.
- `1.0` = pulsado.

### `uMouseRight`
Estado del botón derecho del ratón.
- `0.0` = sin pulsar.
- `1.0` = pulsado.

### `uMouseButton4`
Estado del botón lateral 4 (normalmente "Atrás" en navegadores).
- `0.0` = sin pulsar.
- `1.0` = pulsado.

### `uMouseButton5`
Estado del botón lateral 5 (normalmente "Adelante" en navegadores).
- `0.0` = sin pulsar.
- `1.0` = pulsado.