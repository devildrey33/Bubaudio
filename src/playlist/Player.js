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

const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

export default class Player extends EventTarget {

    #audioAnalyzer;

    #panelQueue;
    #queueEndFactory = null;
    #queueEndMode = null;
    #queueFinished = false;

    constructor(audioAnalyzer) {

        super();

        this.#audioAnalyzer = audioAnalyzer;

        this.queue = new PlaybackQueue();

        this.#setupEvents();
    }

    get analyzer() {
        return this.#audioAnalyzer;
    }

    //==========================================================================
    // PROPIEDADES
    //==========================================================================

    get currentItem() {
        return this.queue.currentItem;
    }


    get currentTrack() {
        return this.queue.currentTrack;
    }

    get queueEndMode() {
        return this.#queueEndMode;
    }


    get currentTime() {
        return this.audio.currentTime;
    }

    get canGoPrevious() {
        return (
            this.currentTime > PREVIOUS_RESTART_THRESHOLD_SECONDS ||
            this.queue.hasPrevious()
        );
    }


    get duration() {
        return this.audio.duration || 0;
    }


    get volume() {
        return this.audio.volume;
    }


    get paused() {
        return this.audio.paused;
    }


    //==========================================================================
    // REPRODUCCIÓN
    //==========================================================================

    /**
     * Crea una cola nueva y comienza a reproducir.
     */
    async playQueue(
        tracks,
        startIndex = 0,
        { preserveQueueEndMode = false } = {}
    ) {
        if (!preserveQueueEndMode) {
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

    async restoreQueue(tracks, startIndex, shuffleOrder) {
        this.#queueFinished = false;
        this.queue.restoreTracks(tracks, startIndex, shuffleOrder);
        this.dispatchEvent(new Event("queuechanged"));
        await this.playCurrent();
    }

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
     * Reproduce la canción actual de la cola.
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
     * Reproduce una canción concreta.
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


    pause() {
        this.audio.pause();


        this.#emitStateChanged();
    }


    togglePlayPause() {
        if (this.audio.paused) {
            this.play();
        }
        else {
            this.pause();
        }
    }


    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.#emitStateChanged();
    }


    //==========================================================================
    // NAVEGACIÓN
    //==========================================================================

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


    async previous() {
        const item = this.queue.previous();
        if (!item) {
            return;
        }

        this.#queueFinished = false;
        await this.playCurrent();
    }


    /**
     * Comportamiento típico de reproductores:
     * Si llevas más de 3 segundos, vuelve al inicio.
     * Si llevas menos, va a la canción anterior.
     */
    async restartOrPrevious() {

        if (this.audio.currentTime > PREVIOUS_RESTART_THRESHOLD_SECONDS) {

            this.audio.currentTime = 0;

            return;
        }

        await this.previous();
    }


    //==========================================================================
    // POSICIÓN
    //==========================================================================

    seek(seconds) {
        this.audio.currentTime = seconds;
    }


    seekPercent(percent) {
        if (!this.audio.duration) {
            return;
        }
        this.audio.currentTime = (percent / 100) * this.audio.duration;
    }


    //==========================================================================
    // VOLUMEN
    //==========================================================================

    setVolume(value) {
        value = Math.max(0, Math.min(1, value));
        this.audio.volume = value;
        this.dispatchEvent(new CustomEvent("volumechanged", {
            detail : value
        }));
    }


    mute() {
        this.audio.muted = true;
        this.dispatchEvent(new Event("mutechanged"));
    }


    unmute() {
        this.audio.muted = false;
        this.dispatchEvent(new Event("mutechanged"));
    }


    toggleMute() {
        this.audio.muted = !this.audio.muted;
        this.dispatchEvent(new Event("mutechanged"));
    }


    //==========================================================================
    // SHUFFLE / REPEAT
    //==========================================================================

    setShuffle(enabled) {
        enabled = Boolean(enabled);

        this.queue.setShuffle(enabled);
        this.dispatchEvent(new CustomEvent("shufflechange", {
            detail: {
                shuffle: this.queue.shuffle
            }
        }));
    }


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

    #emitTrackChanged() {

        this.dispatchEvent(new CustomEvent("trackchanged", {
            detail : {
                item  : this.currentItem,
                track : this.currentTrack
            }
        }));
    }


    #emitStateChanged() {
        this.dispatchEvent(new CustomEvent("statechanged", {
            detail : {
                playing : !this.audio.paused
            }
        }));
    }

    get audio() {
       return this.#audioAnalyzer.audioElement;
    }


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

    moveQueueItems(queueIds, destinationIndex) {
        const changed = this.queue.moveMany(queueIds, destinationIndex);

        if (changed) {
            this.dispatchEvent(new Event("queuechanged"));
        }

        return changed;
    }

    async removeQueueItems(queueIds) {
        const queueIdsToRemove = new Set(queueIds);
        const currentQueueId = this.queue.currentQueueId;
        const currentWasRemoved = queueIdsToRemove.has(currentQueueId);
        const wasPlaying = !this.audio.paused;
        let nextQueueId = null;

        if (currentWasRemoved) {
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