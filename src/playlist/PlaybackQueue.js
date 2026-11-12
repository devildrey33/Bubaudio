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

/**
 * Cola de reproducción.
 *
 * Cada elemento de la cola tiene un queueId único:
 *
 * {
 *     queueId : "...",
 *     track   : Track
 * }
 *
 * Esto permite:
 * - Eliminar canciones sin romper referencias.
 * - Mover canciones dentro de la cola.
 * - Guardar/restaurar la cola.
 * - Implementar "Play Next".
 * - Mantener referencias estables en la UI.
 */
export default class PlaybackQueue {

    constructor() {

        // Lista de elementos de la cola.
        this.items = [];

        // queueId del elemento actual.
        this.currentQueueId = null;

        // Modo aleatorio activado/desactivado.
        this.shuffle = false;

        // Orden mezclado de los queueId.
        this.shuffleOrder = [];

        // Posición actual dentro del shuffleOrder.
        this.shuffleIndex = -1;

        // none | track | queue
        this.repeatMode = "none";

        // Historial de reproducción.
        // Guarda queueIds ya reproducidos.
        this.history = [];

        // Límite de seguridad para evitar crecer indefinidamente.
        this.maxHistorySize = 1000;        
    }


    //==========================================================================
    // PROPIEDADES
    //==========================================================================

    get count() {
        return this.items.length;
    }


    get currentItem() {
        return this.items.find(item => item.queueId === this.currentQueueId) || null;
    }


    get currentTrack() {
        return this.currentItem?.track || null;
    }


    //==========================================================================
    // INICIALIZACIÓN
    //==========================================================================

    /**
     * Reemplaza completamente la cola.
     */
    setTracks(tracks, startIndex = 0) {

        this.items = tracks.map(track => ({
            queueId : crypto.randomUUID(),
            track
        }));

        if (this.items.length === 0) {
            this.currentQueueId = null;
            this.shuffleOrder = [];
            this.shuffleIndex = -1;
            return;
        }

        startIndex = Math.max(0, Math.min(startIndex, this.items.length - 1));

        this.currentQueueId = this.items[startIndex].queueId;

        this.#rebuildShuffle();
    }


    /**
     * Vacía completamente la cola.
     */
    clear() {

        this.items = [];
        this.currentQueueId = null;

        this.shuffleOrder = [];
        this.shuffleIndex = -1;
    }


    //==========================================================================
    // AÑADIR ELEMENTOS
    //==========================================================================

    add(track) {

        const item = {
            queueId : crypto.randomUUID(),
            track
        };

        this.items.push(item);

        this.#rebuildShuffle();

        return item;
    }


    addMany(tracks) {

        for (const track of tracks) {
            this.items.push({
                queueId : crypto.randomUUID(),
                track
            });
        }

        this.#rebuildShuffle();
    }


    /**
     * Añade una canción justo después de la actual.
     * Ideal para "Play Next".
     */
    insertNext(track) {

        const item = {
            queueId : crypto.randomUUID(),
            track
        };

        const currentIndex = this.#currentIndex();

        if (currentIndex === -1) {
            this.items.push(item);
        }
        else {
            this.items.splice(currentIndex + 1, 0, item);
        }

        this.#rebuildShuffle();

        return item;
    }


    //==========================================================================
    // ELIMINAR ELEMENTOS
    //==========================================================================

    remove(queueId) {

        const index = this.items.findIndex(item => item.queueId === queueId);

        if (index === -1) {
            return false;
        }

        const wasCurrent = (queueId === this.currentQueueId);

        this.items.splice(index, 1);

        if (this.items.length === 0) {
            this.clear();
            return true;
        }

        if (wasCurrent) {

            const newIndex = Math.min(index, this.items.length - 1);

            this.currentQueueId = this.items[newIndex].queueId;
        }

        this.#rebuildShuffle();

        return true;
    }


    //==========================================================================
    // REORDENACIÓN
    //==========================================================================

    move(queueId, destinationIndex) {

        const sourceIndex = this.items.findIndex(item => item.queueId === queueId);

        if (sourceIndex === -1) {
            return false;
        }

        destinationIndex = Math.max(0, Math.min(destinationIndex, this.items.length - 1));

        const [item] = this.items.splice(sourceIndex, 1);

        this.items.splice(destinationIndex, 0, item);

        this.#rebuildShuffle();

        return true;
    }


    //==========================================================================
    // NAVEGACIÓN
    //==========================================================================

    hasNext() {

        if (this.items.length === 0) {
            return false;
        }

        if (this.repeatMode === "track" || this.repeatMode === "queue") {
            return true;
        }

        if (this.shuffle) {
            return this.shuffleIndex < this.shuffleOrder.length - 1;
        }

        return this.#currentIndex() < this.items.length - 1;
    }


    hasPrevious() {
        return this.history.length > 0;
    }


    next() {

        if (this.items.length === 0) {
            return null;
        }

        if (this.repeatMode === "track") {
            return this.currentTrack;
        }

        return this.shuffle ? this.#nextShuffle() : this.#nextLinear();
    }


    previous() {

        if (this.history.length === 0) {
            return null;
        }

        const previousQueueId = this.history.pop();

        const item = this.#getItemByQueueId(previousQueueId);

        if (!item) {
            return this.previous();
        }

        this.currentQueueId = previousQueueId;

        if (this.shuffle) {
            this.shuffleIndex = this.shuffleOrder.indexOf(previousQueueId);
        }

        return item.track;
    }


    //==========================================================================
    // SHUFFLE
    //==========================================================================

    setShuffle(enabled) {

        if (this.shuffle === enabled) {
            return;
        }

        this.shuffle = enabled;

        this.#rebuildShuffle();
    }


    //==========================================================================
    // MÉTODOS PRIVADOS
    //==========================================================================

    #currentIndex() {
        return this.items.findIndex(item => item.queueId === this.currentQueueId);
    }


    #nextLinear() {

        let index = this.#currentIndex();

        if (index < this.items.length - 1) {

            this.#pushHistory();

            index++;

            this.currentQueueId = this.items[index].queueId;

            return this.currentTrack;
        }

        if (this.repeatMode === "queue") {

            this.#pushHistory();

            this.currentQueueId = this.items[0].queueId;

            return this.currentTrack;
        }

        return null;
    }    


    #previousLinear() {

        let index = this.#currentIndex();

        if (index > 0) {

            index--;

            this.currentQueueId = this.items[index].queueId;

            return this.currentTrack;
        }

        if (this.repeatMode === "queue") {

            this.currentQueueId = this.items[this.items.length - 1].queueId;

            return this.currentTrack;
        }

        return null;
    }


    #nextShuffle() {

        if (this.shuffleIndex < this.shuffleOrder.length - 1) {

            this.#pushHistory();

            this.shuffleIndex++;

            this.currentQueueId = this.shuffleOrder[this.shuffleIndex];

            return this.currentTrack;
        }

        if (this.repeatMode === "queue") {

            this.#pushHistory();

            this.#rebuildShuffle();

            this.shuffleIndex = 0;

            this.currentQueueId = this.shuffleOrder[0];

            return this.currentTrack;
        }

        return null;
    }


    #previousShuffle() {

        if (this.shuffleIndex <= 0) {
            return null;
        }

        this.shuffleIndex--;

        this.currentQueueId = this.shuffleOrder[this.shuffleIndex];

        return this.currentTrack;
    }


    /**
     * Reconstruye el orden aleatorio manteniendo
     * la canción actual como primer elemento.
     */
    #rebuildShuffle() {

        if (this.items.length === 0) {

            this.shuffleOrder = [];
            this.shuffleIndex = -1;

            return;
        }

        const currentId = this.currentQueueId;

        this.shuffleOrder = this.items
            .map(item => item.queueId)
            .filter(id => id !== currentId);

        for (let i = this.shuffleOrder.length - 1; i > 0; i--) {

            const j = Math.floor(Math.random() * (i + 1));

            [this.shuffleOrder[i], this.shuffleOrder[j]] =
            [this.shuffleOrder[j], this.shuffleOrder[i]];
        }

        if (currentId !== null) {
            this.shuffleOrder.unshift(currentId);
        }

        this.shuffleIndex = this.shuffleOrder.indexOf(currentId);
    }


    /**
     * Añade la canción actual al historial.
     */
    #pushHistory() {

        if (this.currentQueueId === null) {
            return;
        }

        this.history.push(this.currentQueueId);

        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }


    /**
     * Obtiene un elemento a partir de un queueId.
     */
    #getItemByQueueId(queueId) {
        return this.items.find(item => item.queueId === queueId) || null;
    }    


    
}