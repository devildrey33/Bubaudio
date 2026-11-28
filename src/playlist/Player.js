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

// Player
import PlaybackQueue from "./PlaybackQueue.js";

//const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

/**
 * Coordina la cola de reproducción con el elemento de audio proporcionado por
 * AudioAnalyzer. Expone operaciones de reproducción y navegación, y notifica
 * los cambios mediante eventos DOM para que la interfaz pueda mantenerse
 * sincronizada sin acceder directamente al estado privado del reproductor.
 */
export default class Player extends EventTarget {

    // AudioAnalyzer posee y controla el elemento HTMLAudioElement subyacente.
    #audioAnalyzer;

    // La fábrica y el modo describen una lista que se generará al llegar al
    // final de la cola. #queueFinished distingue ese final de una cola vacía
    // todavía no reproducida.
    #panelQueue;
    #queueEndFactory = null;
    #queueEndMode = null;
    #queueFinished = false;

    /**
     * Crea el reproductor, su cola y los manejadores que traducen eventos de
     * audio en eventos del reproductor.
     *
     * @param {object} audioAnalyzer Adaptador que gestiona el elemento de audio.
     */
    constructor(audioAnalyzer) {

        super();

        this.#audioAnalyzer = audioAnalyzer;

        this.queue = new PlaybackQueue();

        this.#setupEvents();
    }

    /** Devuelve el adaptador de audio asociado al reproductor. */
    get analyzer() {
        return this.#audioAnalyzer;
    }

    //==========================================================================
    // PROPIEDADES
    //==========================================================================

    /** Elemento de cola actualmente seleccionado, incluyendo sus datos de cola. */
    get currentItem() {
        return this.queue.currentItem;
    }

    /** Pista asociada al elemento actual, o el valor vacío de PlaybackQueue. */
    get currentTrack() {
        return this.queue.currentTrack;
    }

    /** Modo activo de generación automática al final de la cola, si lo hay. */
    get queueEndMode() {
        return this.#queueEndMode;
    }

    /** Posición actual de reproducción en segundos. */
    get currentTime() {
        return this.audio.currentTime;
    }

    /**
     * Indica si el botón de pista anterior debe estar habilitado: puede
     * reiniciar la pista actual si ya pasó el umbral, o navegar hacia atrás.
     */
    get canGoPrevious() {
        return (            
            this.queue.hasPrevious()
        );
    }

    /** Duración de la pista actual; devuelve 0 si el audio aún no la conoce. */
    get duration() {
        return this.audio.duration || 0;
    }

    /** Nivel de volumen del elemento de audio, entre 0 y 1. */
    get volume() {
        return this.audio.volume;
    }

    /** Indica si el elemento de audio está pausado. */
    get paused() {
        return this.audio.paused;
    }


    //==========================================================================
    // REPRODUCCIÓN
    //==========================================================================

    /**
     * Reemplaza la cola con las pistas recibidas y comienza la pista indicada.
     * Por omisión también desactiva cualquier generación automática pendiente;
     * preserveQueueEndMode permite a quien restaura o actualiza la cola
     * conservar ese comportamiento. Emite queuechanged después de modificarla.
     *
     * @param {Array} tracks Pistas que compondrán la nueva cola.
     * @param {number} startIndex Índice inicial dentro de las pistas recibidas.
     * @param {object} options Opciones de sustitución de la cola.
     * @param {boolean} options.preserveQueueEndMode Conserva el modo de
     * generación automática actual si es true.
     */
    async playQueue(
        tracks,
        startIndex = 0,
        { preserveQueueEndMode = false } = {}
    ) {
        if (!preserveQueueEndMode) {
            // Solo se notifica el cambio de repetición si había un modo de
            // generación que ahora se está cancelando.
            const wasGeneratingAtEnd = this.#queueEndMode !== null;

            this.#queueEndFactory = null;
            this.#queueEndMode = null;

            if (wasGeneratingAtEnd) {
                this.dispatchEvent(new CustomEvent("repeatchange", {
                    detail: {
                        repeatMode: this.queue.repeatMode,
                        queueEndMode: null
                    }
                }));
            }
        }

        this.#queueFinished = false;
        this.queue.setTracks(tracks, startIndex);
        this.dispatchEvent(new Event("queuechanged"));
        await this.playCurrent();
    }

    /**
     * Restaura la cola junto con el orden de mezcla previamente guardado.
     * Notifica el cambio y reproduce el elemento actual restaurado.
     *
     * @param {Array} tracks Pistas que se restaurarán.
     * @param {number} startIndex Índice actual dentro del orden restaurado.
     * @param {Array} shuffleOrder Orden de índices usado por el modo aleatorio.
     */
    async restoreQueue(tracks, startIndex, shuffleOrder) {
        this.#queueFinished = false;
        this.queue.restoreTracks(tracks, startIndex, shuffleOrder);
        this.dispatchEvent(new Event("queuechanged"));
        await this.playCurrent();
    }

    /**
     * Programa una fábrica asíncrona que proporcionará pistas cuando la cola
     * llegue a su fin. Los modos aceptados determinan la etiqueta del evento
     * randomlistgenerated; la selección concreta la realiza la fábrica.
     *
     * @param {"artist"|"album"|"tracks50"} mode Tipo de generación.
     * @param {Function} factory Función asíncrona que devuelve una lista de pistas.
     * @param {object} options Opciones para generar inmediatamente si no hay
     * pistas o la cola ya terminó.
     */
    async setQueueEndMode(mode, factory, { generateIfEmpty = true } = {}) {
        if (!["artist", "album", "tracks50"].includes(mode)) {
            throw new RangeError(`Modo de generación no válido: ${mode}`);
        }

        if (typeof factory !== "function") {
            throw new TypeError("Player: factory debe ser una función");
        }

        this.#queueEndMode = mode;
        this.#queueEndFactory = factory;

        this.dispatchEvent(new CustomEvent("repeatchange", {
            detail: {
                repeatMode: this.queue.repeatMode,
                queueEndMode: mode
            }
        }));

        if (
            generateIfEmpty &&
            (this.queue.count === 0 || this.#queueFinished)
        ) {
            await this.#playQueueEndFactory();
        }
    }

    /**
     * Ejecuta la fábrica actualmente registrada. Se detiene y vacía la cola
     * anterior antes de solicitar pistas. Si la fábrica falla o no devuelve
     * pistas, desactiva el modo correspondiente y propaga un error.
     *
     * Comprueba que modo y fábrica sigan siendo los mismos tras el await: una
     * configuración posterior invalida el resultado tardío y evita que
     * reemplace una cola más reciente.
     *
     * @private
     */
    async #playQueueEndFactory() {
        const factory = this.#queueEndFactory;
        const mode = this.#queueEndMode;

        if (!factory || !mode) {
            return;
        }

        this.#queueFinished = false;
        this.stop();
        this.queue.clear();
        this.dispatchEvent(new Event("queuechanged"));

        let tracks;
        try {
            tracks = await factory();
        }
        catch (error) {
            // No borrar una configuración nueva que haya reemplazado a esta
            // mientras la fábrica estaba pendiente.
            this.#clearQueueEndMode(mode, factory);
            throw error;
        }

        if (!Array.isArray(tracks) || tracks.length === 0) {
            this.#clearQueueEndMode(mode, factory);
            this.#queueFinished = true;
            throw new Error("La lista generada no contiene canciones.");
        }

        if (
            this.#queueEndMode !== mode ||
            this.#queueEndFactory !== factory
        ) {
            return;
        }

        // El modo y la fábrica no cambiaron durante la operación; ya es seguro
        // instalar las pistas generadas y comenzar su reproducción.
        this.queue.setTracks(tracks);
        this.dispatchEvent(new Event("queuechanged"));
        await this.playCurrent();

        const labels = {
            artist: "Grupo aleatorio",
            album: "Disco aleatorio",
            tracks50: "50 canciones aleatorias"
        };
        this.dispatchEvent(new CustomEvent("randomlistgenerated", {
            detail: {
                mode,
                label: labels[mode]
            }
        }));
    }

    /**
     * Desactiva el modo de generación únicamente si todavía coincide con la
     * operación que solicita la limpieza. Esta comprobación protege cualquier
     * modo nuevo configurado mientras la generación anterior estaba pendiente.
     *
     * @param {string} mode Modo cuya generación terminó o falló.
     * @param {Function} factory Fábrica asociada a esa generación.
     * @private
     */
    #clearQueueEndMode(mode, factory) {
        if (
            this.#queueEndMode !== mode ||
            this.#queueEndFactory !== factory
        ) {
            return;
        }

        this.#queueEndMode = null;
        this.#queueEndFactory = null;
        this.dispatchEvent(new CustomEvent("repeatchange", {
            detail: {
                repeatMode: this.queue.repeatMode,
                queueEndMode: null
            }
        }));
    }


    /**
     * Carga la pista actual y, por omisión, la reproduce. Con autoplay false
     * solo carga la fuente de audio, útil por ejemplo al restaurar una pista
     * que estaba pausada. Si la cola no tiene pista actual, no modifica el audio.
     *
     * Emite trackchanged después de cargar y, cuando corresponde, iniciar la
     * reproducción.
     *
     * @param {object} options Opciones de carga y reproducción.
     * @param {boolean} options.autoplay Inicia el audio después de cargarlo.
     * @returns {Promise<boolean>} true si había una pista para cargar.
     */
    async playCurrent({ autoplay = true } = {}) {

        console.log("currentIndex =", this.queue.currentIndex);
        console.log("currentItem =", this.queue.currentItem);
        console.log("currentTrack =", this.queue.currentTrack);

        const track = this.queue.currentTrack;

        if (!track) {
            return false;
        }

        console.log("LOADING =", track.title);
        console.log("PATH =", track.path);        

        await this.#audioAnalyzer.load(track.path);
        if (autoplay) {
            // AudioAnalyzer separa la habilitación/reanudación del contexto de
            // audio de la orden de iniciar la reproducción del elemento.
            await this.#audioAnalyzer.resume();
            await this.#audioAnalyzer.play();
        }

        this.dispatchEvent(new CustomEvent("trackchanged", {
            detail : {
                track : track,
                item  : this.queue.currentItem
            }
        }));

        return true;
    }


    /**
     * Inicia o reanuda el audio ya cargado. No selecciona una pista de la cola;
     * para ello se usa playCurrent. Los errores del elemento se registran y no
     * se propagan, y el estado se notifica tras una reproducción exitosa.
     */
    async play() {

        if (!this.audio.src) {
            return;
        }

        try {

            await this.audio.play();
            this.#queueFinished = false;

            this.#emitStateChanged();
        }
        catch (error) {
            console.error("Play Error:", error);
        }
    }

    /** Pausa el audio y emite el estado actualizado del reproductor. */
    pause() {
        this.audio.pause();


        this.#emitStateChanged();
    }


    /** Alterna entre reproducción y pausa según el estado del elemento de audio. */
    togglePlayPause() {
        if (this.audio.paused) {
            this.play();
        }
        else {
            this.pause();
        }
    }


    /**
     * Pausa el audio y restablece su posición al inicio. No elimina ni cambia
     * la pista actual de la cola.
     */
    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.#emitStateChanged();
    }


    //==========================================================================
    // NAVEGACIÓN
    //==========================================================================

    /**
     * Avanza a la siguiente pista. Si hay una fábrica de fin de cola y la cola
     * está en su último elemento, genera y reproduce una nueva lista. En caso
     * contrario respeta el modo de repetición; mientras exista generación
     * automática desactiva temporalmente la repetición de pista para poder
     * alcanzar el final de la cola.
     *
     * Si no hay siguiente elemento, marca la cola como finalizada y detiene el
     * audio. Los errores de generación se notifican mediante
     * queuegenerationerror.
     */
    async next() {

        if (this.#queueEndFactory && this.queue.isAtEnd) {
            try {
                await this.#playQueueEndFactory();
            }
            catch (error) {
                console.error("Player: no se pudo generar la lista pendiente", error);
                this.dispatchEvent(new CustomEvent("queuegenerationerror", {
                    detail: { error }
                }));
            }

            return;
        }

        const repeatMode = this.queue.repeatMode;
        if (this.#queueEndFactory && repeatMode === "track") {
            this.queue.repeatMode = "none";
        }

        const item = this.queue.next();

        this.queue.repeatMode = repeatMode;

        if (!item) {
            this.#queueFinished = true;
            this.stop();
            return;
        }

        this.#queueFinished = false;
        await this.playCurrent();
    }


    /** Retrocede a la pista anterior si PlaybackQueue encuentra una. */
    async previous() {
        const item = this.queue.previous();
        if (!item) {
            return;
        }

        this.#queueFinished = false;
        await this.playCurrent();
    }


    /**
     * Aplica el comportamiento habitual del control "anterior": si la pista
     * lleva más de PREVIOUS_RESTART_THRESHOLD_SECONDS, la reinicia; si no,
     * solicita la pista previa de la cola.
     */
    async restartOrPrevious() {

/*        if (this.audio.currentTime > PREVIOUS_RESTART_THRESHOLD_SECONDS) {

            this.audio.currentTime = 0;

            return;
        }*/

        await this.previous();
    }


    //==========================================================================
    // POSICIÓN
    //==========================================================================

    /** Establece directamente la posición de reproducción en segundos. */
    seek(seconds) {
        this.audio.currentTime = seconds;
    }

    /**
     * Convierte un porcentaje (0-100) en una posición de audio. No hace nada
     * mientras la duración sea desconocida o cero.
     */
    seekPercent(percent) {
        if (!this.audio.duration) {
            return;
        }
        this.audio.currentTime = (percent / 100) * this.audio.duration;
    }


    //==========================================================================
    // VOLUMEN
    //==========================================================================

    /**
     * Establece el volumen, limitándolo al intervalo permitido por el elemento
     * de audio, y emite volumechanged con el valor final.
     */
    setVolume(value) {
        value = Math.max(0, Math.min(1, value));
        this.audio.volume = value;
        this.dispatchEvent(new CustomEvent("volumechanged", {
            detail : value
        }));
    }


    /** Silencia el elemento y notifica el cambio de silencio. */
    mute() {
        this.audio.muted = true;
        this.dispatchEvent(new Event("mutechanged"));
    }


    /** Quita el silencio del elemento y notifica el cambio. */
    unmute() {
        this.audio.muted = false;
        this.dispatchEvent(new Event("mutechanged"));
    }


    /** Invierte el estado de silencio y emite mutechanged. */
    toggleMute() {
        this.audio.muted = !this.audio.muted;
        this.dispatchEvent(new Event("mutechanged"));
    }


    //==========================================================================
    // SHUFFLE / REPEAT
    //==========================================================================

    /**
     * Activa o desactiva el orden aleatorio de PlaybackQueue y emite
     * shufflechange con el estado efectivo de la cola.
     */
    setShuffle(enabled) {
        enabled = Boolean(enabled);

        this.queue.setShuffle(enabled);
        this.dispatchEvent(new CustomEvent("shufflechange", {
            detail: {
                shuffle: this.queue.shuffle
            }
        }));
    }

    /**
     * Establece el modo de repetición: ninguno, pista actual o cola completa.
     * Al cambiarlo cancela cualquier generación automática al final de la cola
     * y emite repeatchange con ambos estados.
     *
     * @param {"none"|"track"|"queue"} mode Modo de repetición solicitado.
     * @throws {RangeError} Si el modo no está entre los valores admitidos.
     */
    setRepeatMode(mode) {
        if (!["none", "track", "queue"].includes(mode)) {
            throw new RangeError(`Modo de repetición no válido: ${mode}`);
        }

        this.#queueEndMode = null;
        this.#queueEndFactory = null;
        this.queue.repeatMode = mode;
        this.dispatchEvent(new CustomEvent("repeatchange", {
            detail: {
                repeatMode: mode,
                queueEndMode: null
            }
        }));
    }


    //==========================================================================
    // EVENTOS AUDIO
    //==========================================================================

    /**
     * Conecta los eventos nativos del elemento de audio con las acciones y
     * notificaciones del reproductor: al terminar avanza la cola; play/pause
     * actualizan el estado; timeupdate publica posición y duración.
     *
     * @private
     */
    #setupEvents() {

        const audio = this.#audioAnalyzer.audioElement;

        audio.addEventListener("ended", () => {
            this.next();
        });

        audio.addEventListener("play", () => {
            this.#emitStateChanged();
        });

        audio.addEventListener("pause", () => {
            this.#emitStateChanged();
        });

        audio.addEventListener("timeupdate", () => {

            this.dispatchEvent(new CustomEvent("timeupdate", {
                detail : {
                    currentTime : audio.currentTime,
                    duration    : audio.duration
                }
            }));
        });
    }


    //==========================================================================
    // EVENTOS PLAYER
    //==========================================================================

    /**
     * Emite trackchanged con la pista y el elemento de cola actuales.
     *
     * @private
     */
    #emitTrackChanged() {

        this.dispatchEvent(new CustomEvent("trackchanged", {
            detail : {
                item  : this.currentItem,
                track : this.currentTrack
            }
        }));
    }


    /**
     * Emite statechanged indicando si el elemento está reproduciéndose.
     *
     * @private
     */
    #emitStateChanged() {
        this.dispatchEvent(new CustomEvent("statechanged", {
            detail : {
                playing : !this.audio.paused
            }
        }));
    }

    /** Acceso interno al elemento de audio administrado por AudioAnalyzer. */
    get audio() {
       return this.#audioAnalyzer.audioElement;
    }

    /**
     * Selecciona un elemento mediante su identificador de cola y lo reproduce.
     * Devuelve false si el identificador no corresponde a un elemento vigente.
     *
     * @param {string} queueId Identificador único de la instancia en la cola.
     * @returns {Promise<boolean>} Resultado de la selección y carga.
     */
    async playQueueItem(queueId) {

        const ok = this.queue.setCurrentQueueId(queueId);

        if (!ok) {
            return false;
        }

        this.#queueFinished = false;

        console.log(
            "currentIndex",
            this.queue.currentIndex
        );

        return await this.playCurrent();
    }

    /**
     * Reordena varios elementos de la cola. Solo emite queuechanged cuando
     * PlaybackQueue confirma que el orden realmente cambió.
     *
     * @param {Array<string>} queueIds Identificadores que se moverán.
     * @param {number} destinationIndex Índice de destino en la cola ordenada.
     * @returns {boolean} true si se modificó el orden.
     */
    moveQueueItems(queueIds, destinationIndex) {
        const changed = this.queue.moveMany(queueIds, destinationIndex);

        if (changed) {
            this.dispatchEvent(new Event("queuechanged"));
        }

        return changed;
    }

    /**
     * Elimina en bloque los elementos identificados. Si se elimina la pista
     * actual, elige una sustituta antes de modificar la cola: primero la
     * siguiente pista que sobreviva; si no existe, la primera restante cuando
     * se repite la cola, o la anterior en los demás casos. Como alternativa,
     * selecciona la primera pista restante.
     *
     * La pista sustituta se selecciona sin registrar historial, se detiene el
     * audio de la pista eliminada y, si aún hay una pista, se carga respetando
     * si el reproductor estaba reproduciendo o pausado.
     *
     * @param {Array<string>} queueIds Identificadores de los elementos a quitar.
     * @returns {Promise<boolean>} true si se eliminó al menos un elemento.
     */
    async removeQueueItems(queueIds) {
        const queueIdsToRemove = new Set(queueIds);
        const currentQueueId = this.queue.currentQueueId;
        const currentWasRemoved = queueIdsToRemove.has(currentQueueId);
        const wasPlaying = !this.audio.paused;
        let nextQueueId = null;

        if (currentWasRemoved) {
            // Determina la sustituta antes de eliminar, ya que el orden y la
            // posición del elemento actual cambiarían durante las eliminaciones.
            const orderedQueueIds = this.queue.orderedItems.map(
                item => item.queueId
            );
            const currentIndex = orderedQueueIds.indexOf(currentQueueId);
            const remainingQueueIds = orderedQueueIds.filter(queueId =>
                !queueIdsToRemove.has(queueId)
            );
            const followingQueueId = orderedQueueIds
                .slice(currentIndex + 1)
                .find(queueId => !queueIdsToRemove.has(queueId));
            const previousQueueId = orderedQueueIds
                .slice(0, currentIndex)
                .reverse()
                .find(queueId => !queueIdsToRemove.has(queueId));

            nextQueueId = followingQueueId ??
                (
                    this.queue.repeatMode === "queue"
                        ? remainingQueueIds[0]
                        : previousQueueId
                ) ??
                remainingQueueIds[0] ??
                null;
        }

        let changed = false;
        for (const queueId of queueIdsToRemove) {
            changed = this.queue.remove(queueId) || changed;
        }

        if (!changed) {
            return false;
        }

        this.#queueFinished = false;
        if (
            currentWasRemoved &&
            nextQueueId !== null &&
            this.queue.currentQueueId !== nextQueueId
        ) {
            // Evita que la eliminación de la pista actual se registre como una
            // navegación normal en el historial de reproducción.
            this.queue.setCurrentQueueId(
                nextQueueId,
                { recordHistory: false }
            );
        }

        if (currentWasRemoved) {
            this.stop();
        }

        this.dispatchEvent(new Event("queuechanged"));

        if (currentWasRemoved && this.queue.currentTrack) {
            await this.playCurrent({ autoplay: wasPlaying });
        }

        return true;
    }
}