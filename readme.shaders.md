# Uniforms disponibles en los shaders

Los shaders fragment reciben las siguientes variables desde el reproductor. Los valores se actualizan en cada frame del visualizador.

```glsl
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
```

## Coordenadas y tiempo

| Variable | Descripción |
| --- | --- |
| `vUv` | Coordenadas UV interpoladas desde el vertex shader. En el quad a pantalla completa, `x` e `y` recorren normalmente el intervalo `[0, 1]`. Se usa para situar y calcular los efectos en pantalla. |
| `uTime` | Tiempo en segundos proporcionado por `requestAnimationFrame`. Avanza mientras se renderiza; no se reinicia al cambiar de canción o de shader. Úsalo para animaciones como `sin(uTime)`. |
| `uResolution` | Resolución del renderer en píxeles: `x` es el ancho e `y` el alto. Es útil para corregir la relación de aspecto o calcular tamaños de píxel. |

## Niveles de audio

Estos niveles se calculan a partir del espectro de frecuencias, se suavizan entre frames y se normalizan al intervalo `[0, 1]`. Son valores del analizador Web Audio, no porcentajes de potencia acústica.

| Variable | Descripción |
| --- | --- |
| `uBass` | Nivel medio de las frecuencias graves, entre **20 y 250 Hz**. |
| `uMid` | Nivel medio de las frecuencias medias, entre **250 Hz y 4 kHz**. |
| `uTreble` | Nivel medio de las frecuencias agudas, entre **4 y 16 kHz**. |
| `uVolume` | Nivel medio de todos los bins del espectro. Representa la energía general observada por el analizador; no es el volumen de salida configurado en el reproductor. |

## Bandas musicales

Además de las bandas generales, el analizador expone varios detectores orientados a instrumentos y elementos musicales concretos.

Todos los valores están normalizados aproximadamente al intervalo `[0, 1]`.

| Variable | Descripción |
| --- | --- |
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
| --- | --- |
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

Además de los pulsos por banda, existen detectores específicos para instrumentos concretos.

Los valores están normalizados entre `[0, 1]` y responden principalmente a transitorios rápidos.

| Variable | Descripción |
| --- | --- |
| `uKickPeak` | Pico de energía del bombo. Muy útil para pulsos globales, zooms y flashes. |
| `uSnarePeak` | Pico de energía de la caja. Ideal para destellos, explosiones y cambios bruscos. |
| `uVoicePeak` | Pico asociado a voces prominentes. Útil para generar actividad localizada o efectos orgánicos. |
| `uHiHatPeak` | Pico asociado a platos y hi-hats. Ideal para chispas, partículas y detalles finos. |

Estos uniforms suelen resultar más útiles para disparar eventos instantáneos que los niveles continuos (`uKick`, `uSnare`, etc.).

Ejemplos:

```glsl
glow += uKickPeak;
flash += uSnarePeak;
synapse += uVoicePeak;
sparks += uHiHatPeak;
```

## Texturas de audio

Ambas texturas son de **1024 × 1 píxeles**.

El dato de cada muestra está en el canal rojo (`.r`) y la coordenada `x` recorre las muestras. Habitualmente la coordenada `y` se consulta en `0.5`.

| Variable | Descripción |
| --- | --- |
| `uSpectrum` | Espectro FFT actual, con frecuencias desde las más bajas hasta las más altas a lo largo de `x`. Sus valores en el canal rojo están normalizados aproximadamente a `[0, 1]`. |
| `uWaveform` | Muestras de la forma de onda en el dominio temporal. El silencio se encuentra aproximadamente en `0.5`. |

Ejemplos:

```glsl
float fft = texture2D(
    uSpectrum,
    vec2(x, 0.5)
).r;
```

```glsl
float wave =
    texture2D(
        uWaveform,
        vec2(x, 0.5)
    ).r * 2.0 - 1.0;
```

En ambas texturas, `x` se normaliza al intervalo `[0, 1]`.

Por ejemplo:

```glsl
x = 0.0;  // Primera muestra
x = 0.5;  // Zona central
x = 1.0;  // Última muestra
```

## Recomendaciones rápidas

| Necesidad | Uniform recomendado |
| --- | --- |
| Movimiento continuo | `uBass`, `uMid`, `uTreble`, `uKick`, `uVoice` |
| Latidos globales | `uBeat`, `uKickPeak` |
| Destellos | `uSnarePeak` |
| Actividad neuronal | `uVoice`, `uVoicePeak` |
| Chispas y detalles finos | `uHiHat`, `uHiHatPeak` |
| Osciloscopios | `uWaveform` |
| FFT / espectros | `uSpectrum` |

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