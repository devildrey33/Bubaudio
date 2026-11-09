export default class PlaybackQueue {

    // Cola original.
    #tracks = [];

    // Cola utilizada durante la reproducción.
    // Cuando shuffle está activado contendrá
    // una copia mezclada de #tracks.
    #playbackList = [];

    // Índice actual dentro de playbackList.
    #currentIndex = -1;

    // Estado shuffle.
    #shuffle = false;

    // Estado repeat.
    #repeat = false;


    /**
     * Constructor.
     */
    constructor() {
    }


    /**
     * Elimina toda la cola.
     */
    clear() {
        this.#tracks = [];
        this.#playbackList = [];
        this.#currentIndex = -1;
    }


    /**
     * Añade una canción.
     *
     * Estructura esperada:
     *
     * {
     *     artist : "...",
     *     album  : "...",
     *     title  : "...",
     *     path   : "..."
     * }
     *
     * @param {Object} track
     */
    add(track) {
        this.#tracks.push(track);
        this.#rebuildPlaybackList();
    }


    /**
     * Añade varias canciones.
     *
     * @param {Array} tracks
     */
    addTracks(tracks) {
        this.#tracks.push(
            ...tracks
        );
        this.#rebuildPlaybackList();
    }


    /**
     * Obtiene la canción actual.
     */
    get current() {
        if (this.#currentIndex < 0 || this.#currentIndex >= this.#playbackList.length) {
            return null;
        }

        return this.#playbackList[
            this.#currentIndex
        ];
    }


    /**
     * Avanza a la siguiente canción.
     *
     * @returns {Object|null}
     */
    next() {
        if (this.#playbackList.length === 0) {
            return null;
        }

        // Última canción
        if (this.#currentIndex >= this.#playbackList.length - 1) {

            // Repeat activo
            if (this.#repeat) {
                if (this.#shuffle) {
                    // Generar una nueva mezcla
                    // cuando se complete la actual.
                    this.#shuffleTracks();
                }
                this.#currentIndex = 0;
                return this.current;
            }
            return null;
        }

        this.#currentIndex++;

        return this.current;
    }


    /**
     * Retrocede a la canción anterior.
     *
     * @returns {Object|null}
     */
    previous() {

        if (this.#playbackList.length === 0) {
            return null;
        }

        this.#currentIndex--;

        if (this.#currentIndex < 0) {
            this.#currentIndex = 0;
        }

        return this.current;
    }


    /**
     * Selecciona una pista concreta.
     *
     * @param {Number} index
     */
    select(index) {

        if (index < 0 || index >= this.#playbackList.length) {
            return null;
        }

        this.#currentIndex = index;

        return this.current;
    }


    /**
     * Activa o desactiva shuffle.
     *
     * Al activarlo se genera una lista mezclada.
     * Al desactivarlo se vuelve al orden original.
     */
    set shuffle(value) {
        this.#shuffle = Boolean(value);
        this.#rebuildPlaybackList();
    }


    get shuffle() {
        return this.#shuffle;
    }


    /**
     * Estado repeat.
     */
    set repeat(value) {
        this.#repeat = Boolean(value);
    }


    get repeat() {
        return this.#repeat;
    }


    /**
     * Número de canciones.
     */
    get count() {
        return this.#tracks.length;
    }


    /**
     * Reconstruye la lista de reproducción.
     */
    #rebuildPlaybackList() {
        const currentTrack = this.current;

        this.#playbackList = [...this.#tracks];

        if (this.#shuffle) {
            this.#shuffleTracks();
        }

        if (!currentTrack) {
            if (this.#playbackList.length > 0) {
                this.#currentIndex = 0;
            }

            return;
        }

        const newIndex = this.#playbackList.findIndex(track => track.path === currentTrack.path);
        this.#currentIndex = Math.max(0, newIndex);
    }


    /**
     * Mezcla la lista utilizando
     * Fisher-Yates Shuffle.
     */
    #shuffleTracks() {

        for (let i = this.#playbackList.length - 1; i > 0; i--){

            const j = Math.floor(Math.random() * (i + 1));

            [this.#playbackList[i], this.#playbackList[j]] = [this.#playbackList[j], this.#playbackList[i]];
        }
    }


    /**
     * Devuelve la lista utilizada actualmente
     * para reproducir.
     */
    get playbackList() {
        return [...this.#playbackList];
    }


    /**
     * Devuelve la lista original.
     */
    get tracks() {
        return [...this.#tracks];
    }

    /**
     * Indica si existe una canción anterior.
     *
     * @returns {Boolean}
     */
    hasPrevious() {
        if (this.#playbackList.length === 0) {
            return false;
        }
        return (this.#currentIndex > 0);
    }


    /**
     * Indica si existe una canción siguiente.
     *
     * Cuando repeat está activado siempre existirá
     * una siguiente canción porque la cola volverá
     * a empezar desde el principio.
     *
     * @returns {Boolean}
     */
    hasNext() {
        if (this.#playbackList.length === 0) {
            return false;
        }

        if (this.#repeat) {
            return true;
        }

        return (this.#currentIndex < this.#playbackList.length - 1);
    }    

    /**
     * Índice actual dentro de la cola.
     */
    get currentIndex() {
        return this.#currentIndex;
    }


    /**
     * Número total de elementos
     * en la cola de reproducción.
     */
    get length() {
        return this.#playbackList.length;
    }    
}
