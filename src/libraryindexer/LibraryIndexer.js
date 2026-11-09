import {
    readDir
}
from "@tauri-apps/plugin-fs";


export default class LibraryIndexer {

    // Formatos de audio soportados.
    static SUPPORTED_FORMATS = [

        "mp3",

        "flac",

        "ogg",

        "opus",

        "wav",

        "m4a",

        "aac"
    ];


    // Ruta raíz de la biblioteca.
    #musicPath = "";

    // Índices internos.
    #artists = [];

    #albums = [];

    #tracks = [];


    /**
     * Constructor.
     */
    constructor() {
    }


    /**
     * Escanea una biblioteca musical.
     *
     * Estructura esperada:
     *
     * musicPath/
     * └── Grupo/
     *     └── Disco/
     *         └── ...
     *
     * @param {String} musicPath
     */
    async scan(musicPath) {

        this.#musicPath =
            musicPath;

        this.clear();

        await this.#scanArtists();
    }


    /**
     * Elimina todo el contenido indexado.
     */
    clear() {

        this.#artists = [];

        this.#albums = [];

        this.#tracks = [];
    }


    /**
     * Escaneo del primer nivel.
     *
     * Cada carpeta representa un grupo.
     */
    async #scanArtists() {

        const artists =
            await readDir(
                this.#musicPath
            );

        for (
            const artist
            of artists
        ) {

            if (
                !artist.isDirectory
            ) {
                continue;
            }

            const artistData = {

                id:
                    crypto.randomUUID(),

                name:
                    artist.name,

                path:
                    artist.path
            };

            this.addArtist(
                artistData
            );

            await this.#scanAlbums(
                artistData
            );
        }
    }


    /**
     * Escaneo del segundo nivel.
     *
     * Cada carpeta representa un disco.
     *
     * @param {Object} artist
     */
    async #scanAlbums(artist) {

        const albums =
            await readDir(
                artist.path
            );

        for (
            const album
            of albums
        ) {

            if (
                !album.isDirectory
            ) {
                continue;
            }

            const albumData = {

                id:
                    crypto.randomUUID(),

                artist:
                    artist.name,

                title:
                    album.name,

                path:
                    album.path,

                tracks: []
            };

            this.addAlbum(
                albumData
            );

            await this.#scanAlbumFiles(
                artist,
                albumData,
                album.path
            );
        }
    }


    /**
     * Escaneo recursivo dentro de un disco.
     *
     * Todo lo que exista por debajo del disco
     * también forma parte de ese disco.
     *
     * @param {Object} artist
     * @param {Object} album
     * @param {String} currentPath
     */
    async #scanAlbumFiles(
        artist,
        album,
        currentPath
    ) {

        const entries =
            await readDir(
                currentPath
            );

        for (
            const entry
            of entries
        ) {

            // Seguir descendiendo por las carpetas.
            if (
                entry.isDirectory
            ) {

                await this.#scanAlbumFiles(
                    artist,
                    album,
                    entry.path
                );

                continue;
            }

            // Ignorar formatos no soportados.
            if (
                !this.#isSupportedFile(
                    entry.name
                )
            ) {
                continue;
            }

            const track =
                this.#createTrack(
                    artist,
                    album,
                    entry
                );

            // Guardar referencia en el álbum.
            album.tracks.push(
                track.id
            );

            this.addTrack(
                track
            );
        }
    }


    /**
     * Construye una pista a partir de un fichero.
     *
     * @param {Object} artist
     * @param {Object} album
     * @param {Object} file
     *
     * @returns {Object}
     */
    #createTrack(
        artist,
        album,
        file
    ) {

        const extension =
            file.name
                .split(".")
                .pop()
                ?.toLowerCase();

        const title =
            file.name.replace(
                /\.[^.]+$/,
                ""
            );

        return {

            // Identificador único.
            id:
                crypto.randomUUID(),

            // Datos obtenidos de la estructura
            // de directorios.
            artist:
                artist.name,

            album:
                album.title,

            // De momento usamos el nombre
            // del fichero.
            title,

            // Futuro soporte para tags.
            genre:
                null,

            // Ruta completa.
            path:
                file.path,

            // Formato detectado.
            format:
                extension
        };
    }


    /**
     * Comprueba si un fichero contiene
     * un formato soportado.
     *
     * @param {String} fileName
     * @returns {Boolean}
     */
    #isSupportedFile(fileName) {

        const extension =
            fileName
                .split(".")
                .pop()
                ?.toLowerCase();

        return (
            LibraryIndexer
                .SUPPORTED_FORMATS
                .includes(
                    extension
                )
        );
    }


    /**
     * Añade un grupo.
     *
     * @param {Object} artist
     */
    addArtist(artist) {

        this.#artists.push(
            artist
        );
    }


    /**
     * Añade un disco.
     *
     * @param {Object} album
     */
    addAlbum(album) {

        this.#albums.push(
            album
        );
    }


    /**
     * Añade una canción.
     *
     * @param {Object} track
     */
    addTrack(track) {

        this.#tracks.push(
            track
        );
    }


    /**
     * Devuelve un grupo aleatorio.
     */
    randomArtist() {

        if (
            this.#artists.length === 0
        ) {
            return null;
        }

        return this.#artists[
            Math.floor(
                Math.random() *
                this.#artists.length
            )
        ];
    }


    /**
     * Devuelve un disco aleatorio.
     */
    randomAlbum() {

        if (
            this.#albums.length === 0
        ) {
            return null;
        }

        return this.#albums[
            Math.floor(
                Math.random() *
                this.#albums.length
            )
        ];
    }


    /**
     * Devuelve una canción aleatoria.
     */
    randomTrack() {

        if (
            this.#tracks.length === 0
        ) {
            return null;
        }

        return this.#tracks[
            Math.floor(
                Math.random() *
                this.#tracks.length
            )
        ];
    }


    /**
     * Lista de grupos.
     */
    get artists() {

        return this.#artists;
    }


    /**
     * Lista de discos.
     */
    get albums() {

        return this.#albums;
    }


    /**
     * Lista de canciones.
     */
    get tracks() {

        return this.#tracks;
    }


    /**
     * Número de grupos indexados.
     */
    get artistCount() {

        return this.#artists.length;
    }


    /**
     * Número de discos indexados.
     */
    get albumCount() {

        return this.#albums.length;
    }


    /**
     * Número de canciones indexadas.
     */
    get trackCount() {

        return this.#tracks.length;
    }
}