import {
    BaseDirectory,
    mkdir,
    readDir,
    readTextFile,
    writeTextFile
} from "@tauri-apps/plugin-fs";

const PLAYLISTS_FILE = "playlists.json";
const PLAYLISTS_VERSION = 1;
const MAX_PLAYLIST_NAME_LENGTH = 100;

/**
 * Comprueba que un elemento de la cola tenga la información mínima necesaria
 * para guardarse y volver a localizarse: debe ser un objeto con una ruta no
 * vacía. No valida otros metadatos de la pista, que pueden variar según su
 * procedencia.
 *
 * @param {*} track Elemento que se quiere validar.
 * @returns {boolean} true si contiene una ruta de texto no vacía.
 */
function isValidTrack(track) {
    return track !== null &&
        typeof track === "object" &&
        typeof track.path === "string" &&
        track.path.length > 0;
}

/**
 * Valida la forma persistida de una lista de reproducción. Además de los
 * campos de identificación y fecha, exige al menos una pista y valida cada
 * pista con isValidTrack; así se evita cargar listas incompletas.
 *
 * @param {*} playlist Valor leído o recibido que se quiere validar.
 * @returns {boolean} true si cumple el esquema esperado por este almacén.
 */
function isValidPlaylist(playlist) {
    return playlist !== null &&
        typeof playlist === "object" &&
        typeof playlist.id === "string" &&
        typeof playlist.name === "string" &&
        playlist.name.trim().length > 0 &&
        typeof playlist.createdAt === "string" &&
        Array.isArray(playlist.tracks) &&
        playlist.tracks.length > 0 &&
        playlist.tracks.every(isValidTrack);
}

/**
 * Mantiene en memoria las listas guardadas y sincroniza los cambios con el
 * archivo playlists.json del directorio de datos de la aplicación (AppData).
 * La escritura en disco se completa antes de publicar los cambios en memoria,
 * de modo que un error de persistencia no deje ambas representaciones distintas.
 */
export default class PlaylistStore {

    // Estado privado: las modificaciones se realizan mediante los métodos
    // públicos, que también se encargan de persistirlas.
    #playlists = [];

    /**
     * Devuelve una copia profunda para que el consumidor no pueda modificar
     * accidentalmente el estado interno del almacén.
     */
    get playlists() {
        return structuredClone(this.#playlists);
    }

    /**
     * Busca una lista por su identificador y devuelve una copia independiente.
     *
     * @param {string} id Identificador único de la lista.
     * @returns {object|null} Copia de la lista encontrada o null si no existe.
     */
    getById(id) {
        const playlist = this.#playlists.find(item => item.id === id);
        return playlist ? structuredClone(playlist) : null;
    }

    /**
     * Inicializa el directorio de datos y carga las listas guardadas.
     * Si el archivo todavía no existe, comienza con una colección vacía.
     * Los errores de lectura, análisis JSON o validación se propagan para que
     * quien invoque el método pueda informar del problema.
     *
     * @returns {Promise<Array>} Copia de las listas cargadas.
     */
    async load() {
        // Asegura que AppData exista antes de consultar su contenido.
        await mkdir(".", {
            baseDir: BaseDirectory.AppData,
            recursive: true
        });

        const entries = await readDir(".", {
            baseDir: BaseDirectory.AppData
        });
        // readDir permite distinguir el primer uso (sin archivo) de un archivo
        // existente que esté vacío, dañado o tenga un formato incompatible.
        const fileExists = entries.some(entry =>
            entry.isFile && entry.name === PLAYLISTS_FILE
        );

        if (!fileExists) {
            this.#playlists = [];
            return this.playlists;
        }

        // JSON.parse puede lanzar un error si el contenido no es JSON válido.
        const data = JSON.parse(await readTextFile(
            PLAYLISTS_FILE,
            { baseDir: BaseDirectory.AppData }
        ));

        // La versión permite detectar cambios de esquema incompatibles; cada
        // lista y cada pista también deben satisfacer sus validadores.
        if (
            data?.version !== PLAYLISTS_VERSION ||
            !Array.isArray(data.playlists) ||
            !data.playlists.every(isValidPlaylist)
        ) {
            throw new Error(
                "PlaylistStore: el archivo de listas guardadas no es válido"
            );
        }

        // Solo se reemplaza el estado tras validar íntegramente el documento.
        this.#playlists = data.playlists;
        return this.playlists;
    }

    /**
     * Crea una lista, la añade al archivo y actualiza el estado en memoria.
     * El nombre se convierte a texto y se recortan sus espacios exteriores;
     * las pistas se copian para aislar los datos recibidos del llamador.
     *
     * @param {*} name Nombre solicitado para la nueva lista.
     * @param {*} tracks Pistas que se guardarán en la lista.
     * @returns {Promise<object>} Copia de la lista creada.
     * @throws {TypeError|RangeError} Si el nombre o las pistas no son válidos.
     */
    async create(name, tracks) {
        const normalizedName = String(name).trim();
        if (!normalizedName) {
            throw new TypeError("El nombre de la lista no puede estar vacío");
        }
        if (normalizedName.length > MAX_PLAYLIST_NAME_LENGTH) {
            throw new RangeError(
                `El nombre de la lista supera ${MAX_PLAYLIST_NAME_LENGTH} caracteres`
            );
        }
        if (!Array.isArray(tracks) || tracks.length === 0) {
            throw new TypeError("No hay canciones para guardar");
        }
        if (!tracks.every(isValidTrack)) {
            throw new TypeError(
                "La cola contiene canciones sin una ruta válida"
            );
        }

        // UUID evita depender del nombre, que puede repetirse o cambiar.
        const playlist = {
            id: crypto.randomUUID(),
            name: normalizedName,
            createdAt: new Date().toISOString(),
            tracks: structuredClone(tracks)
        };
        // Se prepara una nueva colección para no alterar el estado actual hasta
        // que la escritura se haya completado correctamente.
        const playlists = [...this.#playlists, playlist];

        await this.#write(playlists);
        this.#playlists = playlists;

        return structuredClone(playlist);
    }

    /**
     * Elimina la lista indicada. Si no hay ninguna coincidencia, no escribe el
     * archivo y devuelve false; si la eliminación se persiste, devuelve true.
     *
     * @param {string} id Identificador de la lista que se quiere eliminar.
     * @returns {Promise<boolean>} true si se eliminó una lista; false si no
     * existía una lista con ese identificador.
     */
    async remove(id) {
        const playlists = this.#playlists.filter(
            playlist => playlist.id !== id
        );

        if (playlists.length === this.#playlists.length) {
            return false;
        }

        // Igual que en create, primero persiste la nueva colección y después
        // actualiza el estado en memoria.
        await this.#write(playlists);
        this.#playlists = playlists;
        return true;
    }

    /**
     * Guarda la colección completa en el directorio AppData.
     * El formato JSON incluye una versión de esquema para que load pueda
     * rechazar explícitamente archivos incompatibles.
     *
     * @param {Array} playlists Colección completa que se escribirá en disco.
     * @returns {Promise<void>}
     * @private
     */
    async #write(playlists) {
        await mkdir(".", {
            baseDir: BaseDirectory.AppData,
            recursive: true
        });
        await writeTextFile(
            PLAYLISTS_FILE,
            JSON.stringify({
                version: PLAYLISTS_VERSION,
                playlists
            }, null, 4),
            { baseDir: BaseDirectory.AppData }
        );
    }
}
