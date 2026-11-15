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

## Pulsos de transitorios

`uBeat`, `uMidBeat` y `uTrebleBeat` son envolventes breves normalizadas al intervalo `[0, 1]`. Se activan cuando el nivel de su banda sube de forma significativa respecto a su nivel reciente y luego decaen gradualmente.

| Variable | Banda que detecta |
| --- | --- |
| `uBeat` | Graves. |
| `uMidBeat` | Medios. |
| `uTrebleBeat` | Agudos. |

Estos pulsos no representan un BPM ni cada beat musical: detectan subidas repentinas de energía en cada banda. Puedes usarlos para disparar destellos, escalas o cambios de color.

## Texturas de audio

Ambas texturas son de **1024 × 1 píxeles**. El dato de cada muestra está en el canal rojo (`.r`); la coordenada `x` recorre las muestras y `y` suele consultarse en `0.5`.

| Variable | Descripción |
| --- | --- |
| `uSpectrum` | Espectro FFT actual, con frecuencias desde las más bajas hasta las más altas a lo largo de `x`. Sus valores en el canal rojo están normalizados aproximadamente a `[0, 1]`. Ejemplo: `texture2D(uSpectrum, vec2(x, 0.5)).r`. |
| `uWaveform` | Muestras de la forma de onda en el dominio temporal. El silencio se encuentra aproximadamente en `0.5`; convierte la muestra a una señal centrada en cero con `texture2D(uWaveform, vec2(x, 0.5)).r * 2.0 - 1.0`. |

En las dos texturas, `x` se normaliza al intervalo `[0, 1]`: por ejemplo, `x = 0.5` consulta aproximadamente la mitad de las muestras.
