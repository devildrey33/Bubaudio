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

export default class Player extends EventTarget {

    #audioAnalyzer;

    #panelQueue;

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


    get currentTime() {
        return this.audio.currentTime;
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
    async playQueue(tracks, startIndex = 0) {
        this.queue.setTracks(tracks, startIndex);
        await this.playCurrent();
    }


    /**
     * Reproduce la canción actual de la cola.
     */
    async playCurrent() {

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
        await this.#audioAnalyzer.resume();
        await this.#audioAnalyzer.play();

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
        const item = this.queue.next();
        if (!item) {
            this.stop();
            return;
        }
        await this.playCurrent();
    }


    async previous() {
        const item = this.queue.previous();
        if (!item) {
            return;
        }

        await this.playCurrent();
    }


    /**
     * Comportamiento típico de reproductores:
     * Si llevas más de 3 segundos, vuelve al inicio.
     * Si llevas menos, va a la canción anterior.
     */
    async restartOrPrevious() {

        if (this.audio.currentTime > 3) {

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
        this.queue.setShuffle(enabled);
    }


    setRepeatMode(mode) {
        this.queue.repeatMode = mode;
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
        console.log(
            "currentIndex",
            this.queue.currentIndex
        );

        return await this.playCurrent();
    }
}