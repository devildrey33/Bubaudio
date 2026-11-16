/*
 * BubAudio
 * Copyright (c) 2026 devildrey33
 *
 * This Source Code Form is subject to the terms of the
 * Mozilla Public License, v. 2.0.
 *
 * If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 */
import { readFile } from "@tauri-apps/plugin-fs";

/**
 * Reproduce audio local y expone muestras para el visualizador.
 *
 * El audio se reproduce con un HTMLAudioElement y se conecta a un
 * AnalyserNode. En cada llamada a update() se refrescan el espectro y la
 * forma de onda, además de calcular niveles suavizados para graves, medios,
 * agudos y volumen. También genera pulsos breves cuando detecta una subida
 * relativa e inesperada en graves, medios o agudos.
 *
 * Los valores de nivel se normalizan entre 0 y 1, pero representan los bytes
 * del analizador Web Audio; no son porcentajes de potencia acústica.
 */
export default class AudioAnalyzer {

    // Límites inclusivos en Hz de las bandas usadas para medidores y pulsos.
    // Se convierten a índices de FFT usando la frecuencia de muestreo actual.
    static BASS_MIN = 20;
    static BASS_MAX = 250;

    static MID_MIN = 250;
    static MID_MAX = 4000;

    static TREBLE_MIN = 4000;
    static TREBLE_MAX = 16000;

    // Peso de la muestra nueva al actualizar los niveles públicos. Corresponde
    // a un suavizado exponencial: valores mayores responden más rápido, pero
    // dejan pasar más variación entre frames.
    static SMOOTHING = 0.2;

    // El detector mantiene una referencia lenta del nivel habitual de cada banda.
    // Se actualiza una vez por frame; un valor bajo evita que esa referencia
    // siga rápidamente un transitorio y lo oculte.
    static TRANSIENT_BASELINE_SMOOTHING = 0.02;

    // Evita disparos causados por variaciones diminutas cuando la señal está baja.
    static TRANSIENT_MIN_DELTA = 0.025;

    // Además del mínimo anterior, exige que la subida tenga tamaño relativo
    // respecto al nivel habitual de la banda.
    static TRANSIENT_RELATIVE_THRESHOLD = 0.15;

    // El detector vuelve a quedar armado cuando la subida cae por debajo de
    // esta fracción del umbral. Esta histéresis evita repetir un pulso en cada frame.
    static TRANSIENT_REARM_RATIO = 0.5;


    // Contexto y nodos de Web Audio API:
    // HTMLAudioElement -> MediaElementAudioSourceNode -> AnalyserNode -> salida.
    #audioContext;

    // Elemento que carga y reproduce el archivo decodificado por el navegador.
    #audioElement;

    // Convierte el HTMLAudioElement en una fuente conectable al grafo de audio.
    #source;

    // Calcula los datos de frecuencia y de dominio temporal.
    #analyser;

    // Bytes de magnitud por bin de frecuencia; Web Audio los entrega en el rango 0-255.
    #fftData;

    // Bytes de la forma de onda en el tiempo; el silencio suele estar alrededor de 128.
    #timeData;

    // Número de muestras de la FFT. El analizador produce fftSize / 2 bins.
    #fftSize;

    // Niveles suavizados que consumen los medidores y los shaders.
    #bass = 0;

    #mid = 0;

    #treble = 0;

    #volume = 0;

    #beat = 0;

    #midBeat = 0;

    #trebleBeat = 0;

    // Referencias lentas usadas para medir subidas, no el volumen absoluto.
    #bassBaseline = 0;

    #midBaseline = 0;

    #trebleBaseline = 0;

    // Impide interpretar la primera muestra como una subida desde cero.
    #hasTransientBaseline = false;

    // Cada detector solo produce un pulso mientras la señal permanezca por
    // encima del umbral; se rearma cuando la subida se relaja.
    #bassTransientArmed = true;

    #midTransientArmed = true;

    #trebleTransientArmed = true;

    // URL temporal asociada al Blob del archivo actualmente cargado.
    #blobUrl = null;

    /**
     * Crea el grafo de reproducción y los buffers del analizador.
     *
     * La fuente se conecta al AnalyserNode y este a la salida de audio, de modo
     * que el análisis no interrumpe la reproducción. El tamaño determina la
     * resolución de frecuencia y temporal del análisis; debe cumplir los
     * valores permitidos por AnalyserNode.
     *
     * @param {number} fftSize Tamaño de la FFT; por defecto, 2048 muestras.
     */
    constructor(fftSize = 2048) {

        this.#fftSize = fftSize;

        this.#audioContext = new AudioContext();

        this.#audioElement = new Audio();

        this.#source = this.#audioContext.createMediaElementSource(this.#audioElement);

        this.#analyser = this.#audioContext.createAnalyser();
        this.#analyser.fftSize = this.#fftSize;

        // El analizador está en la ruta de salida, así que observa el mismo
        // audio que se escucha, sin reemplazar la reproducción.
        this.#source.connect(this.#analyser);
        this.#analyser.connect(this.#audioContext.destination);

        // frequencyBinCount y el número de muestras temporales son fftSize / 2.
        this.#fftData = new Uint8Array(fftSize / 2);
        this.#timeData = new Uint8Array(fftSize / 2);
    }


    /**
     * Carga un archivo local en el elemento de audio.
     *
     * Tauri lee los bytes del archivo y se crea un Blob URL temporal. Esto
     * evita depender de que el WebView pueda resolver directamente rutas
     * locales o UNC. La URL anterior se revoca antes de reemplazarla para
     * liberar sus recursos.
     *
     * La extensión se usa para asignar el MIME type que espera el navegador;
     * si no se reconoce (incluido mp3), se conserva audio/mpeg como valor
     * predeterminado. La asignación de src y la llamada a load() inician la
     * carga multimedia, pero no esperan a que los metadatos estén disponibles
     * ni comienzan la reproducción.
     *
     * @param {string} path Ruta del archivo de audio que Tauri puede leer.
     * @returns {Promise<void>} Se resuelve al leer el archivo y configurar la
     * URL del elemento; no espera el evento canplay.
     */
    async load(path) {

        // Detener la pista anterior antes de reemplazar su origen.
        this.stop();

        // Liberar el Blob anterior para evitar fugas
        // de memoria cuando cambiamos de canción.
        if (this.#blobUrl !== null) {

            URL.revokeObjectURL(
                this.#blobUrl
            );

            this.#blobUrl = null;
        }

        // readFile devuelve los bytes que se usarán como contenido del Blob.
        const data = await readFile(path);

        // Obtener la extensión sin distinguir mayúsculas y minúsculas.
        const extension = path
            .split(".")
            .pop()
            ?.toLowerCase();

        let mimeType = "audio/mpeg";

        switch (extension) {

            case "flac" :
                mimeType = "audio/flac";
                break;

            case "ogg" :
                mimeType = "audio/ogg";
                break;

            case "opus" :
                mimeType = "audio/ogg";
                break;

            case "wav" :
                mimeType = "audio/wav";
                break;

            case "m4a" :
                mimeType = "audio/mp4";
                break;

            case "aac" :
                mimeType = "audio/aac";
                break;
        }

        // El Blob URL permite que HTMLAudioElement cargue los bytes locales
        // como si fueran un recurso reproducible por el navegador.
        const blob = new Blob(
            [data],
            { type : mimeType }
        );

        this.#blobUrl = URL.createObjectURL(
            blob
        );

        this.#audioElement.src = this.#blobUrl;

        this.#audioElement.load();
    }


    /**
     * Inicia o reanuda la reproducción del archivo cargado.
     *
     * Se devuelve la Promise de HTMLMediaElement.play() para que el llamador
     * pueda esperar el inicio o gestionar errores del navegador, por ejemplo
     * cuando el navegador bloquea la reproducción automática.
     *
     * @returns {Promise<void>} Promesa nativa de inicio de reproducción.
     */
    play() {
        return this.#audioElement.play();
    }


    /**
     * Pausa el elemento de audio sin reiniciar su posición.
     * Para detenerlo y volver al comienzo se usa stop().
     */
    pause() {
        this.#audioElement.pause();
    }


    /**
     * Reactiva el contexto de Web Audio si el sistema o el navegador lo
     * dejaron suspendido. Esto es independiente de iniciar la pista:
     * play() controla el elemento y este método el grafo de análisis/salida.
     * Si el contexto ya está activo, no realiza ninguna operación.
     *
     * @returns {Promise<void>}
     */
    async resume() {
        if (this.#audioContext && this.#audioContext.state === "suspended") {
            await this.#audioContext.resume();
        }
    }


    /**
     * Lee una nueva muestra de audio y actualiza todos los valores públicos.
     *
     * Debe llamarse una vez por frame desde el bucle del visualizador. Primero
     * actualiza los buffers de frecuencia y forma de onda, luego suaviza los
     * niveles para su presentación y, por separado, compara las bandas sin
     * suavizar con una referencia lenta para encontrar transitorios.
     * No agenda el siguiente frame: el bucle visualizador debe invocarlo.
     */
    update() {

        // Permite que la actualización sea inocua si el analizador no existe.
        if (!this.#analyser) {
            return;
        }

        // Estos métodos escriben en los TypedArrays proporcionados.
        this.#analyser.getByteFrequencyData(this.#fftData);
        this.#analyser.getByteTimeDomainData(this.#timeData);

        // Medias normalizadas de los bins que corresponden a cada intervalo Hz.
        const bass = this.#averageBand(AudioAnalyzer.BASS_MIN, AudioAnalyzer.BASS_MAX);

        const mid = this.#averageBand(AudioAnalyzer.MID_MIN, AudioAnalyzer.MID_MAX);
        const treble = this.#averageBand(AudioAnalyzer.TREBLE_MIN, AudioAnalyzer.TREBLE_MAX);
        const volume = this.#computeVolume();

        // Suavizado exponencial: cada nivel retiene el 80% del valor anterior
        // y añade el 20% de la muestra nueva. Así se reducen vibraciones en UI
        // sin imponer el mismo retardo al detector de transitorios.
        this.#bass += (bass - this.#bass) * AudioAnalyzer.SMOOTHING;

        this.#mid += (mid - this.#mid) * AudioAnalyzer.SMOOTHING;

        this.#treble += (treble - this.#treble) * AudioAnalyzer.SMOOTHING;

        this.#volume += (volume - this.#volume) * AudioAnalyzer.SMOOTHING;

        // La referencia lenta permite detectar cambios respecto al nivel
        // reciente: una banda alta pero estable deja de producir pulsos.
        if (!this.#hasTransientBaseline) {
            this.#bassBaseline = bass;
            this.#midBaseline = mid;
            this.#trebleBaseline = treble;
            this.#hasTransientBaseline = true;
        }

        // Solo interesan subidas; las bajadas se usan para permitir que el
        // detector vuelva a armarse.
        const bassChange = Math.max(0, bass - this.#bassBaseline);
        const midChange = Math.max(0, mid - this.#midBaseline);
        const trebleChange = Math.max(0, treble - this.#trebleBaseline);

        // El umbral es el mayor entre un suelo absoluto de ruido y una fracción
        // del nivel habitual. Por eso no hay un corte fijo de "50%" para todos
        // los fragmentos musicales.
        const bassThreshold = Math.max(
            AudioAnalyzer.TRANSIENT_MIN_DELTA,
            this.#bassBaseline * AudioAnalyzer.TRANSIENT_RELATIVE_THRESHOLD
        );
        const midThreshold = Math.max(
            AudioAnalyzer.TRANSIENT_MIN_DELTA,
            this.#midBaseline * AudioAnalyzer.TRANSIENT_RELATIVE_THRESHOLD
        );
        const trebleThreshold = Math.max(
            AudioAnalyzer.TRANSIENT_MIN_DELTA,
            this.#trebleBaseline * AudioAnalyzer.TRANSIENT_RELATIVE_THRESHOLD
        );

        // Histéresis: tras un pulso, no se permite otro hasta que el exceso
        // caiga claramente por debajo del umbral completo.
        if (bassChange < bassThreshold * AudioAnalyzer.TRANSIENT_REARM_RATIO) {
            this.#bassTransientArmed = true;
        }

        if (midChange < midThreshold * AudioAnalyzer.TRANSIENT_REARM_RATIO) {
            this.#midTransientArmed = true;
        }

        if (trebleChange < trebleThreshold * AudioAnalyzer.TRANSIENT_REARM_RATIO) {
            this.#trebleTransientArmed = true;
        }

        // Cada banda genera su propio pulso para poder reaccionar por separado.
        if (this.#bassTransientArmed && bassChange > bassThreshold) {
            const strength = this.#transientStrength(bassChange, bassThreshold);
            this.#beat = Math.max(this.#beat, strength);
            this.#bassTransientArmed = false;
        }

        if (this.#midTransientArmed && midChange > midThreshold) {
            const strength = this.#transientStrength(midChange, midThreshold);
            this.#midBeat = Math.max(this.#midBeat, strength);
            this.#midTransientArmed = false;
        }

        if (this.#trebleTransientArmed && trebleChange > trebleThreshold) {
            const strength = this.#transientStrength(trebleChange, trebleThreshold);
            this.#trebleBeat = Math.max(this.#trebleBeat, strength);
            this.#trebleTransientArmed = false;
        }

        // La referencia sigue la señal despacio: así se adapta a canciones
        // más suaves o más fuertes, pero no absorbe de inmediato cada subida.
        this.#bassBaseline +=
            (bass - this.#bassBaseline) * AudioAnalyzer.TRANSIENT_BASELINE_SMOOTHING;
        this.#midBaseline +=
            (mid - this.#midBaseline) * AudioAnalyzer.TRANSIENT_BASELINE_SMOOTHING;
        this.#trebleBaseline +=
            (treble - this.#trebleBaseline) * AudioAnalyzer.TRANSIENT_BASELINE_SMOOTHING;

        // Atenúa los pulsos en cada frame hasta que regresan a cero.
        this.#beat *= 0.92;
        this.#midBeat *= 0.92;
        this.#trebleBeat *= 0.92;
    }

    /**
     * Convierte el exceso sobre el umbral en la amplitud del pulso.
     *
     * Una subida apenas superior al umbral empieza en 0.35; al crecer el
     * exceso, la intensidad sube linealmente hasta 1. El shader recibe así
     * una envolvente suave en lugar de un simple valor booleano.
     *
     * @param {Number} change Subida actual por encima de la referencia lenta.
     * @param {Number} threshold Umbral que debe superar esa subida.
     * @returns {Number} Intensidad limitada al intervalo 0-1.
     */
    #transientStrength(change, threshold) {
        return Math.min(
            1,
            0.35 + (change - threshold) / (threshold * 2) * 0.65
        );
    }


    /**
     * Calcula el promedio de todos los bins del espectro.
     *
     * El resultado se normaliza al rango 0-1 a partir de los bytes de
     * getByteFrequencyData. Incluye todos los bins, no es una medición
     * calibrada en sonoridad ni un porcentaje de potencia acústica.
     * Si los bytes son todos cero, el resultado también es cero.
     */
    #computeVolume() {
        let total = 0;
        for (let i = 0; i < this.#fftData.length; i++) {
            total += this.#fftData[i];
        }

        return (total / this.#fftData.length / 255);
    }


    /**
     * Calcula el promedio normalizado de los bins entre dos frecuencias.
     *
     * La separación de bins se obtiene a partir de Nyquist (la mitad de la
     * frecuencia de muestreo) y del tamaño del buffer. El límite superior es
     * inclusivo. Se promedian los bytes y se dividen entre 255 para devolver
     * un valor entre 0 y 1 comparable entre bandas.
     * Los rangos solicitados deben corresponder a bins existentes en el
     * analizador; este método no limita índices fuera del buffer.
     *
     * @param {number} minFreq Frecuencia inferior en Hz.
     * @param {number} maxFreq Frecuencia superior en Hz.
     * @returns {number} Media de la banda normalizada.
     */
    #averageBand(minFreq, maxFreq) {
        const nyquist = this.#audioContext.sampleRate * 0.5;
        const minIndex = Math.floor(minFreq / nyquist * this.#fftData.length);
        const maxIndex = Math.floor(maxFreq / nyquist * this.#fftData.length);

        let total = 0;
        let count = 0;

        for (let i = minIndex; i <= maxIndex; i++) {
            total += this.#fftData[i];
            count++;
        }

        if (count === 0) {
            return 0;
        }

        return (
            total / count / 255
        );
    }


    /** Nivel suavizado de graves, normalizado de 0 a 1. */
    get bass() {
        return this.#bass;
    }

    /** Nivel suavizado de medios, normalizado de 0 a 1. */
    get mid() {
        return this.#mid;
    }

    /** Nivel suavizado de agudos, normalizado de 0 a 1. */
    get treble() {
        return this.#treble;
    }

    /** Promedio normalizado de todo el espectro de frecuencias. */
    get volume() {
        return this.#volume;
    }

    /** Envolvente decreciente del último transitorio detectado en graves. */
    get beat() {
        return this.#beat;
    }

    /** Envolvente decreciente del último transitorio detectado en medios. */
    get midBeat() {
        return this.#midBeat;
    }

    /** Envolvente decreciente del último transitorio detectado en agudos. */
    get trebleBeat() {
        return this.#trebleBeat;
    }

    /**
     * Buffer de frecuencia actual. Se reutiliza cada frame para evitar
     * reservar memoria; quien lo lea no debe conservarlo como una instantánea.
     */
    get spectrum() {
        return this.#fftData;
    }

    /**
     * Buffer de forma de onda actual, también reutilizado cada frame.
     */
    get waveform() {
        return this.#timeData;
    }

    /**
     * Libera los recursos del analizador y la URL del Blob.
     *
     * Pausa el elemento, revoca la URL temporal y cierra AudioContext. Después
     * de destruir la instancia, debe crearse otra para volver a usar el grafo.
     *
     * @returns {Promise<void>}
     */
    async destroy() {
        this.pause();

        if (this.#blobUrl !== null) {

            URL.revokeObjectURL(
                this.#blobUrl
            );

            this.#blobUrl = null;
        }

        if (this.#audioContext) {
            await this.#audioContext.close();
        }
    }

    /**
     * Detiene la reproducción y devuelve la posición de la pista al inicio.
     * No descarga el origen ni libera la URL temporal, por lo que la pista
     * puede volver a reproducirse sin volver a leer el archivo.
     */
    stop() {
        if (!this.#audioElement) {
            return;
        }

        this.#audioElement.pause();
        this.#audioElement.currentTime = 0;
    }


    /**
     * Posición actual del elemento de audio, en segundos.
     */
    get currentTime() {
        return this.#audioElement ? this.#audioElement.currentTime : 0;
    }


    /**
     * Duración total de la pista, en segundos.
     */
    get duration() {
        return this.#audioElement ? this.#audioElement.duration || 0 : 0;
    }


    /**
     * Volumen de salida del HTMLAudioElement, en el rango 0-1.
     */
    get volumeLevel() {
        return this.#audioElement.volume;
    }


    /**
     * Ajusta el volumen de salida y limita el valor al rango admitido.
     * El cambio afecta al elemento de audio, no a las muestras normalizadas
     * que ya se obtuvieron en buffers previos del analizador.
     *
     * @param {number} value Volumen solicitado; se limita a 0-1.
     */
    set volumeLevel(value) {
        this.#audioElement.volume = Math.min(1, Math.max(0, value));
    }


    /**
     * Busca una posición de la pista, expresada en segundos.
     * La validez de la posición depende de los metadatos y del medio cargado;
     * el elemento HTMLAudioElement gestiona el ajuste/error correspondiente.
     *
     * @param {number} seconds Posición solicitada en segundos.
     */
    seek(seconds) {
        if (!this.#audioElement) {
            return;
        }
        this.#audioElement.currentTime = seconds;
    }


    /**
     * Indica si el elemento está reproduciendo en este momento.
     * Devuelve true si está reproduciendo y false si está pausado.
     */
    get isPlaying() {
        return (this.#audioElement && !this.#audioElement.paused);
    }    

    /**
     * Expone el HTMLAudioElement para que Player pueda consultar su estado y
     * conectar sus propios manejadores de eventos.
     */
    get audioElement() {
        return this.#audioElement;
    }    
}