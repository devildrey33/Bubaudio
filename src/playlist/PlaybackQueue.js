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
 *
 * El orden normal se conserva en `items`. Cuando la mezcla está activa,
 * `shuffleOrder` representa el recorrido de queueId y `shuffleIndex` señala la
 * posición actual dentro de ese recorrido. La pista actual se identifica por
 * queueId, no por posición, para que las modificaciones de la cola no invaliden
 * su referencia.
 */
export default class PlaybackQueue {

    /**
     * Inicializa una cola vacía, sin pista seleccionada, con mezcla desactivada
     * y sin repetición. El historial conserva identificadores, no copias de las
     * pistas, y tiene un máximo para limitar su crecimiento.
     */
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

    /** Número de elementos actualmente en la cola. */
    get count() {
        return this.items.length;
    }

    /** Elemento seleccionado por currentQueueId, o null si no hay selección. */
    get currentItem() {
        return this.items.find(item => item.queueId === this.currentQueueId) || null;
    }

    /** Pista del elemento actual, o null cuando la cola está vacía. */
    get currentTrack() {
        return this.currentItem?.track || null;
    }

    /**
     * Devuelve los elementos en el orden que el usuario debe ver/reproducir:
     * items cuando la mezcla está desactivada y shuffleOrder cuando está activa.
     * En modo aleatorio construye un mapa por ID para recuperar los objetos y
     * omite cualquier ID que ya no tenga un elemento correspondiente.
     */
    get orderedItems() {
        if (!this.shuffle) {
            return this.items;
        }

        const itemsById = new Map(
            this.items.map(item => [item.queueId, item])
        );

        return this.shuffleOrder
            .map(queueId => itemsById.get(queueId))
            .filter(Boolean);
    }

    /**
     * Indica si el elemento actual ocupa el último lugar del recorrido vigente.
     * Una cola vacía o sin elemento seleccionado no se considera "al final".
     */
    get isAtEnd() {
        if (this.items.length === 0 || this.currentQueueId === null) {
            return false;
        }

        return this.shuffle
            ? this.shuffleIndex >= this.shuffleOrder.length - 1
            : this.#currentIndex() >= this.items.length - 1;
    }


    //==========================================================================
    // INICIALIZACIÓN
    //==========================================================================

    /**
     * Reemplaza por completo los elementos de la cola y selecciona startIndex.
     * A cada pista se le asigna un queueId nuevo, por lo que las referencias de
     * la cola anterior dejan de ser válidas. Reinicia el historial y prepara el
     * orden aleatorio si la mezcla está activa.
     *
     * Si no hay pistas, deja la cola sin elemento actual y limpia el orden de
     * mezcla. Si el índice inicial está fuera del intervalo, lo limita al
     * primer o último elemento.
     *
     * @param {Array} tracks Pistas que se incorporarán a la cola.
     * @param {number} startIndex Índice de la pista que quedará seleccionada.
     */
    setTracks(tracks, startIndex = 0) {

        this.items = tracks.map(track => ({
            queueId : crypto.randomUUID(),
            track
        }));
        this.history = [];

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
     * Restaura pistas y selección como setTracks, y luego intenta restaurar el
     * orden aleatorio guardado. shuffleOrder contiene índices de `tracks`, no
     * queueIds, pues los ID se regeneran en cada restauración.
     *
     * Si la mezcla está desactivada, la cola vacía o el orden guardado no es una
     * permutación completa de índices válidos, conserva el orden que generó
     * setTracks (o el orden vacío si corresponde).
     *
     * @param {Array} tracks Pistas guardadas.
     * @param {number} startIndex Índice que debe quedar seleccionado.
     * @param {Array<number>} shuffleOrder Permutación guardada de índices.
     */
    restoreTracks(tracks, startIndex, shuffleOrder = []) {
        this.setTracks(tracks, startIndex);

        if (!this.shuffle || this.items.length === 0) {
            return;
        }

        const validOrder = Array.isArray(shuffleOrder) &&
            shuffleOrder.length === this.items.length &&
            new Set(shuffleOrder).size === this.items.length &&
            shuffleOrder.every(index =>
                Number.isInteger(index) &&
                index >= 0 &&
                index < this.items.length
            );

        if (!validOrder) {
            return;
        }

        this.shuffleOrder = shuffleOrder.map(
            index => this.items[index].queueId
        );
        this.shuffleIndex = this.shuffleOrder.indexOf(
            this.currentQueueId
        );
    }


    /**
     * Vacía los elementos, borra la selección y reinicia historial y estado
     * interno de mezcla. No cambia repeatMode ni el indicador shuffle.
     */
    clear() {

        this.items = [];
        this.currentQueueId = null;
        this.history = [];

        this.shuffleOrder = [];
        this.shuffleIndex = -1;
    }


    //==========================================================================
    // AÑADIR ELEMENTOS
    //==========================================================================

    /**
     * Añade una pista al final del orden normal y devuelve el nuevo elemento,
     * que incluye su queueId generado. Si la mezcla está activa, sincroniza el
     * recorrido aleatorio insertando la pista en una posición pendiente.
     *
     * @param {*} track Pista que se añadirá.
     * @returns {{queueId: string, track: *}} Elemento recién creado.
     */
    add(track) {

        const item = {
            queueId : crypto.randomUUID(),
            track
        };

        this.items.push(item);

        this.#syncShuffle();

        return item;
    }

    /**
     * Añade varias pistas al final del orden normal, asignando un queueId
     * distinto a cada una. Actualiza el orden mezclado una sola vez al terminar.
     *
     * @param {Array} tracks Pistas que se añadirán.
     */
    addMany(tracks) {

        for (const track of tracks) {
            this.items.push({
                queueId : crypto.randomUUID(),
                track
            });
        }

        this.#syncShuffle();
    }

    /**
     * Inserta una pista inmediatamente después de la actual en el orden normal
     * y, si hay mezcla, justo después de la actual en el recorrido aleatorio.
     * Si no hay elemento actual en el orden normal, la añade al final; si no se
     * encuentra la selección en el orden aleatorio, la inserta al principio.
     *
     * @param {*} track Pista que se reproducirá a continuación.
     * @returns {{queueId: string, track: *}} Elemento recién creado.
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

        if (this.shuffle) {
            const shuffleIndex = this.shuffleOrder.indexOf(
                this.currentQueueId
            );
            const insertIndex = shuffleIndex === -1
                ? 0
                : shuffleIndex + 1;

            this.shuffleOrder.splice(insertIndex, 0, item.queueId);
            this.shuffleIndex = this.shuffleOrder.indexOf(
                this.currentQueueId
            );
        }

        return item;
    }


    //==========================================================================
    // ELIMINAR ELEMENTOS
    //==========================================================================

    /**
     * Elimina el elemento identificado. Si era el actual, selecciona el que
     * queda en su posición (o el último si se borró el último). Si la cola
     * queda vacía, limpia también todos los índices e historial. En otros casos
     * actualiza el orden mezclado para retirar IDs eliminados.
     *
     * @param {string} queueId Identificador del elemento que se eliminará.
     * @returns {boolean} true si se encontró y eliminó el elemento.
     */
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

        this.#syncShuffle();

        return true;
    }


    //==========================================================================
    // REORDENACIÓN
    //==========================================================================

    /**
     * Mueve un único elemento en el orden normal. El destino se limita a las
     * posiciones existentes. En modo aleatorio la nueva posición normal no
     * cambia el recorrido aleatorio, aunque se sincroniza para mantener sus IDs
     * válidos.
     *
     * @param {string} queueId ID del elemento que se moverá.
     * @param {number} destinationIndex Índice de destino en items.
     * @returns {boolean} true si el ID pertenece a un elemento de la cola.
     */
    move(queueId, destinationIndex) {

        const sourceIndex = this.items.findIndex(item => item.queueId === queueId);

        if (sourceIndex === -1) {
            return false;
        }

        destinationIndex = Math.max(0, Math.min(destinationIndex, this.items.length - 1));

        const [item] = this.items.splice(sourceIndex, 1);

        this.items.splice(destinationIndex, 0, item);

        this.#syncShuffle();

        return true;
    }

    /**
     * Mueve un grupo de elementos manteniendo entre ellos su orden actual.
     * La posición de destino se interpreta respecto a orderedItems, es decir,
     * el orden visible/reproducible, y se ajusta para no contar dos veces los
     * elementos que ya están antes del punto de inserción.
     *
     * En modo aleatorio actualiza shuffleOrder; en modo normal actualiza items.
     * No modifica la selección actual. Devuelve false si no hay IDs válidos o
     * si el movimiento no cambia el orden; exige un índice entero.
     *
     * @param {Array<string>} queueIds IDs que se reordenarán.
     * @param {number} destinationIndex Índice de inserción en orderedItems.
     * @returns {boolean} true si el orden cambió.
     * @throws {RangeError} Si destinationIndex no es un entero.
     */
    moveMany(queueIds, destinationIndex) {
        if (!Number.isInteger(destinationIndex)) {
            throw new RangeError(
                `Índice de destino no válido: ${destinationIndex}`
            );
        }

        const selectedIds = new Set(queueIds);
        const orderedItems = this.orderedItems;
        const movingItems = orderedItems.filter(item =>
            selectedIds.has(item.queueId)
        );

        if (movingItems.length === 0) {
            return false;
        }

        const insertIndex = Math.max(
            0,
            Math.min(destinationIndex, orderedItems.length)
        );
        const movingIds = new Set(
            movingItems.map(item => item.queueId)
        );
        const movingBeforeIndex = orderedItems
            .slice(0, insertIndex)
            .filter(item => movingIds.has(item.queueId))
            .length;
        const remainingItems = orderedItems.filter(item =>
            !movingIds.has(item.queueId)
        );
        const adjustedIndex = insertIndex - movingBeforeIndex;

        remainingItems.splice(adjustedIndex, 0, ...movingItems);

        if (remainingItems.every(
            (item, index) => item.queueId === orderedItems[index].queueId
        )) {
            return false;
        }

        if (this.shuffle) {
            this.shuffleOrder = remainingItems.map(item => item.queueId);
            this.shuffleIndex = this.shuffleOrder.indexOf(
                this.currentQueueId
            );
        }
        else {
            this.items = remainingItems;
        }

        return true;
    }


    //==========================================================================
    // NAVEGACIÓN
    //==========================================================================

    /**
     * Indica si next() puede avanzar: repetir pista o cola siempre permite una
     * siguiente reproducción cuando hay elementos; sin repetición, depende de
     * que quede una posición posterior en el orden lineal o aleatorio.
     */
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


    /**
     * Indica si se puede retroceder. En mezcla, solo considera reproducibles
     * los IDs del historial que todavía estén en la cola. En modo lineal permite
     * retroceder si no estamos al principio, o si la cola se repite.
     */
    hasPrevious() {
        if (this.items.length === 0) {
            return false;
        }

        if (this.shuffle) {
            return this.history.some(
                queueId => this.#getItemByQueueId(queueId)
            );
        }

        return (
            this.#currentIndex() > 0 ||
            (this.repeatMode === "queue" && this.items.length > 0)
        );
    }


    /**
     * Avanza según las reglas vigentes. En repeatMode "track" devuelve la pista
     * actual sin cambiar la selección; de otro modo avanza de forma lineal o
     * aleatoria. Devuelve null si no hay pista siguiente.
     *
     * @returns {*} Pista seleccionada o null si no se pudo avanzar.
     */
    next() {

        if (this.items.length === 0) {
            return null;
        }

        if (this.repeatMode === "track") {
            return this.currentTrack;
        }

        return this.shuffle ? this.#nextShuffle() : this.#nextLinear();
    }


    /**
     * Retrocede. En modo lineal selecciona el elemento anterior (o el último si
     * repeatMode es "queue" y se estaba al principio). En mezcla consume el
     * historial hacia atrás, saltando IDs que ya no existen.
     *
     * @returns {*} Pista anterior o null si no hay historial/posición previa.
     */
    previous() {

        if (!this.shuffle) {
            return this.#previousLinear();
        }

        while (this.history.length > 0) {
            const previousQueueId = this.history.pop();
            const item = this.#getItemByQueueId(previousQueueId);

            if (!item) {
                continue;
            }

            this.currentQueueId = previousQueueId;
            this.shuffleIndex = this.shuffleOrder.indexOf(previousQueueId);

            return item.track;
        }

        return null;
    }


    //==========================================================================
    // SHUFFLE
    //==========================================================================

    /**
     * Cambia el estado de mezcla. No hace nada si el valor efectivo no cambia.
     * Al activar, genera un recorrido nuevo que comienza por la pista actual;
     * al desactivar, borra ese recorrido. Cambiar el modo también borra el
     * historial para evitar navegar con un recorrido anterior.
     *
     * @param {*} enabled Valor convertido a booleano.
     */
    setShuffle(enabled) {

        enabled = Boolean(enabled);

        if (this.shuffle === enabled) {
            return;
        }

        this.shuffle = enabled;
        this.history = [];

        if (enabled) {
            this.#rebuildShuffle();
        }
        else {
            this.shuffleOrder = [];
            this.shuffleIndex = -1;
        }
    }


    //==========================================================================
    // MÉTODOS PRIVADOS
    //==========================================================================

    /** Índice del elemento actual en el orden normal, o -1 si no existe. */
    #currentIndex() {
        return this.items.findIndex(item => item.queueId === this.currentQueueId);
    }


    /**
     * Avanza una posición en items. Al llegar al final, vuelve al primer
     * elemento únicamente cuando repeatMode es "queue".
     *
     * @returns {*} Pista seleccionada o null al final de la cola.
     * @private
     */
    #nextLinear() {

        let index = this.#currentIndex();

        if (index < this.items.length - 1) {

            index++;

            this.currentQueueId = this.items[index].queueId;

            return this.currentTrack;
        }

        if (this.repeatMode === "queue") {

            this.currentQueueId = this.items[0].queueId;

            return this.currentTrack;
        }

        return null;
    }    

    /**
     * Retrocede una posición en items. Si se encuentra al principio y la cola
     * se repite, selecciona el último elemento; de lo contrario no cambia nada.
     *
     * @returns {*} Pista seleccionada o null si no hay anterior.
     * @private
     */
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


    /**
     * Avanza en shuffleOrder y registra la pista actual en el historial antes
     * de cambiar. Si se llega al final, solo vuelve al inicio cuando la cola se
     * repite; ese retorno también queda registrado en el historial.
     *
     * @returns {*} Pista seleccionada o null si se alcanzó el final.
     * @private
     */
    #nextShuffle() {

        if (this.shuffleIndex < this.shuffleOrder.length - 1) {

            this.#pushHistory();

            this.shuffleIndex++;

            this.currentQueueId = this.shuffleOrder[this.shuffleIndex];

            return this.currentTrack;
        }

        if (this.repeatMode === "queue") {

            this.#pushHistory();

            this.shuffleIndex = 0;

            this.currentQueueId = this.shuffleOrder[0];

            return this.currentTrack;
        }

        return null;
    }


    /**
     * Retrocede una posición en el orden mezclado sin consultar el historial.
     * La navegación pública en mezcla usa previous() y su historial para
     * permitir volver sobre el recorrido efectivo, que puede no ser equivalente
     * a la posición inmediatamente anterior si se seleccionaron pistas a mano.
     *
     * @returns {*} Pista previa o null si ya se está al principio.
     * @private
     */
    #previousShuffle() {

        if (this.shuffleIndex <= 0) {
            return null;
        }

        this.shuffleIndex--;

        this.currentQueueId = this.shuffleOrder[this.shuffleIndex];

        return this.currentTrack;
    }


    /**
     * Reconstruye el recorrido aleatorio a partir de los queueId actuales.
     * Mantiene la pista seleccionada como primer elemento y baraja el resto
     * mediante Fisher-Yates. Actualiza shuffleIndex a la posición actual.
     */
    #rebuildShuffle() {

        if (!this.shuffle || this.items.length === 0) {

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
     * Sincroniza el recorrido aleatorio tras insertar o quitar elementos.
     * Elimina IDs que ya no están en items y añade los nuevos en posiciones
     * aleatorias que no preceden a la pista actual, para no volver a reproducir
     * por accidente canciones anteriores del recorrido.
     */
    #syncShuffle() {

        if (!this.shuffle) {
            return;
        }

        const validIds = new Set(
            this.items.map(item => item.queueId)
        );
        const order = this.shuffleOrder.filter(
            queueId => validIds.has(queueId)
        );
        const existingIds = new Set(order);
        const currentIndex = order.indexOf(this.currentQueueId);
        const minimumInsertIndex = currentIndex === -1
            ? 0
            : currentIndex + 1;

        for (const item of this.items) {
            if (existingIds.has(item.queueId)) {
                continue;
            }

            const insertIndex = minimumInsertIndex + Math.floor(
                Math.random() * (order.length - minimumInsertIndex + 1)
            );
            order.splice(insertIndex, 0, item.queueId);
            existingIds.add(item.queueId);
        }

        this.shuffleOrder = order;
        this.shuffleIndex = order.indexOf(this.currentQueueId);
    }


    /**
     * Registra el ID actual al final del historial, siempre que haya selección.
     * Si se supera maxHistorySize, descarta la entrada más antigua.
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
     * Busca un elemento por su identificador estable.
     *
     * @param {string} queueId Identificador de búsqueda.
     * @returns {object|null} Elemento encontrado o null si ya no está en la cola.
     */
    #getItemByQueueId(queueId) {
        return this.items.find(item => item.queueId === queueId) || null;
    }    



    /**
     * Selecciona una pista usando su índice en el orden normal `items`.
     * Cuando la mezcla está activa, actualiza shuffleIndex para que el próximo
     * avance continúe desde esa pista. Si recordHistory es true, registra la
     * pista previa al cambiar la selección; no se registra si el ID no cambia.
     *
     * @param {number} index Índice de la pista en items.
     * @param {object} options Opciones de selección.
     * @param {boolean} options.recordHistory Registra la selección previa en
     * el historial cuando la mezcla está activa.
     * @returns {boolean} true si el índice corresponde a un elemento válido.
     */
    setCurrentIndex(index, { recordHistory = true } = {}) {

        if (index < 0 || index >= this.items.length) {
            return false;
        }

        const nextQueueId = this.items[index].queueId;

        if (
            this.shuffle &&
            recordHistory &&
            this.currentQueueId !== null &&
            this.currentQueueId !== nextQueueId
        ) {
            this.#pushHistory();
        }

        this.currentQueueId = nextQueueId;

        if (this.shuffle) {
            this.shuffleIndex = this.shuffleOrder.indexOf(
                this.currentQueueId
            );
        }

        return true;
    }

    /**
     * Selecciona un elemento por queueId. Resuelve primero su índice normal y
     * delega la selección y el registro opcional del historial a setCurrentIndex.
     *
     * @param {string} queueId Identificador del elemento que se seleccionará.
     * @param {object} options Opciones que se pasan a setCurrentIndex.
     * @returns {boolean} true si el elemento existe y quedó seleccionado.
     */
    setCurrentQueueId(queueId, options) {

        const index = this.items.findIndex(
            item => item.queueId === queueId
        );

        if (index === -1) {
            return false;
        }

        return this.setCurrentIndex(index, options);
    }
    
}