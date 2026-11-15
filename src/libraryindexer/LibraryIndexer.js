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
import {
    readDir,
    readTextFile,
    writeTextFile,
    mkdir,
    BaseDirectory
}
from "@tauri-apps/plugin-fs";


export default class LibraryIndexer extends EventTarget {

    // Nombre y versión del índice.
    static LIBRARY_FILE = "library.json";
    static INDEX_VERSION = 3;

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


    // Directorios raíz de la biblioteca.
    #musicPaths = [];

    // Índices internos.
    #artists = [];

    #albums = [];

    #tracks = [];


    /**
     * Constructor.
     */
    constructor() {
        super();
    }


    /**
     * Escanea una biblioteca musical.
     *
     * Estructura esperada:
     *
     * musicPaths[]/
     * └── Grupo/
     *     └── [carpetas de organización/]...
     *         └── Disco/
     *             └── canciones
     *
     * @param {String|Array<String>} musicPaths
     */
    async scan(musicPaths) {
        this.#musicPaths = (Array.isArray(musicPaths)
            ? musicPaths
            : [musicPaths]
        ).filter(path => typeof path === "string" && path.trim());

        if (this.#musicPaths.length === 0) {
            throw new Error("LibraryIndexer: no hay directorios de música");
        }

        this.clear();
        this.dispatchEvent(new CustomEvent("scanstart", {
            detail: {
                musicPaths: [...this.#musicPaths]
            }
        }));

        try {
            for (const musicPath of this.#musicPaths) {
                await this.#scanArtists(musicPath);
            }

            await this.save();
            this.dispatchEvent(new CustomEvent("scancomplete", {
                detail: {
                    artistCount: this.artistCount,
                    albumCount: this.albumCount,
                    trackCount: this.trackCount
                }
            }));
        }
        catch (error) {
            this.dispatchEvent(new CustomEvent("scanerror", {
                detail: {
                    error
                }
            }));
            throw error;
        }
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
    async #scanArtists(musicPath) {
        const artists = await readDir(musicPath);

        this.#reportProgress(musicPath, "", musicPath);

        for (const artist of artists) {

            if (!artist.isDirectory) {
                continue;
            }

            const artistData = {
                id   : crypto.randomUUID(),
                name : artist.name,
                path : `${musicPath}\\${artist.name}`,
                rootPath: musicPath
            };

            this.#reportProgress(
                artistData.path,
                artistData.name,
                musicPath
            );

            const albumCount = this.#albums.length;
            await this.#scanAlbums(
                artistData
            );

            if (this.#albums.length > albumCount) {
                this.addArtist(artistData);
            }
        }
    }


    /**
     * Escaneo recursivo de las carpetas del artista.
     *
     * Cada carpeta que contiene canciones directamente representa un disco.
     *
     * @param {Object} artist
     */
    async #scanAlbums(artist) {

        const albums = await readDir(artist.path);

        for (const album of albums) {

            if (!album.isDirectory) {
                continue;
            }

            const albumPath = `${artist.path}\\${album.name}`;
            await this.#scanAlbumDirectory(
                artist,
                albumPath,
                album.name
            );
        }
    }

    /**
     * Indexa las canciones directas de cada carpeta como un disco
     * independiente y sigue buscando discos en sus subdirectorios.
     *
     * @param {Object} artist
     * @param {String} currentPath
     * @param {String} albumTitle
     */
    async #scanAlbumDirectory(artist, currentPath, albumTitle) {

        this.#reportProgress(
            currentPath,
            artist.name,
            artist.rootPath
        );
        const entries = await readDir(currentPath);
        const album = {
            id     : crypto.randomUUID(),
            artistId: artist.id,
            artist : artist.name,
            title  : albumTitle,
            path   : currentPath,
            tracks : []
        };

        for (const entry of entries) {

            const entryPath = `${currentPath}\\${entry.name}`;

            if (entry.isDirectory) {
                await this.#scanAlbumDirectory(
                    artist,
                    entryPath,
                    entry.name
                );
                continue;
            }

            if (!this.#isSupportedFile(entry.name)) {
                continue;
            }

            const track = this.#createTrack(
                artist,
                album,
                entry,
                entryPath
            );

            album.tracks.push(track.id);
            this.addTrack(track);
        }

        if (album.tracks.length > 0) {
            this.addAlbum(album);
        }
    }


    #reportProgress(currentPath, artistName, musicPath) {
        this.dispatchEvent(new CustomEvent("scanprogress", {
            detail: {
                currentPath,
                artistName,
                musicPath,
                artistCount: this.artistCount,
                albumCount: this.albumCount,
                trackCount: this.trackCount
            }
        }));
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
    #createTrack(artist, album, file, path) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const title = file.name.replace(/\.[^.]+$/, "");

        return {
            // Identificador único.
            id      : crypto.randomUUID(),
            artistId: artist.id,
            // Datos obtenidos de la estructura
            // de directorios.
            artist  : artist.name,
            album   : album.title,
            // De momento usamos el nombre
            // del fichero.
            title,
            // Futuro soporte para tags.
            genre   : null,
            // Ruta completa.
            path,
            // Formato detectado.
            format  : extension
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
        const extension = fileName.split(".").pop()?.toLowerCase();
        return (LibraryIndexer.SUPPORTED_FORMATS.includes(extension));
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
        this.#tracks.push(track);
    }


    /**
     * Devuelve un grupo aleatorio.
     */
    randomArtist() {
        if (this.#artists.length === 0) {
            return null;
        }

        return this.#artists[
            Math.floor(Math.random() * this.#artists.length)
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

        if (this.#tracks.length === 0) {
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

    get musicPaths() {
        return [...this.#musicPaths];
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


    /**
     * Guarda la biblioteca indexada en AppData.
     */
    async save() {
        const library = {
            version     : LibraryIndexer.INDEX_VERSION,
            musicPaths  : this.#musicPaths,
            scanDate    : new Date().toISOString(),

            artists     : this.#artists,
            albums      : this.#albums,
            tracks      : this.#tracks
        };

        await mkdir(".", {
            baseDir  : BaseDirectory.AppData,
            recursive: true
        }
    );        
        await writeTextFile(
            LibraryIndexer.LIBRARY_FILE,
            JSON.stringify(library, null, 4), {
                baseDir : BaseDirectory.AppData
            }
        );
    }


    /**
     * Carga la biblioteca desde AppData.
     */
    async load() {

        const json = await readTextFile(
            LibraryIndexer.LIBRARY_FILE, {
                baseDir : BaseDirectory.AppData
            }
        );

        const library = JSON.parse(json);

        this.#musicPaths = Array.isArray(library.musicPaths)
            ? library.musicPaths
            : library.musicPath
                ? [library.musicPath]
                : [];

        if (
            !Number.isInteger(library.version) ||
            library.version < LibraryIndexer.INDEX_VERSION
        ) {
            if (this.#musicPaths.length === 0) {
                throw new Error(
                    "LibraryIndexer: el índice antiguo no contiene directorios de música"
                );
            }

            await this.scan(this.#musicPaths);
            return library;
        }

        this.#tracks   = library.tracks ?? [];

        const artists = library.artists ?? [];
        const albums = library.albums ?? [];
        const trackIds = new Set(this.#tracks.map(track => track.id));

        this.#albums = albums.filter(album =>
            Array.isArray(album.tracks) &&
            album.tracks.some(trackId => trackIds.has(trackId))
        );

        const artistIds = new Set(
            this.#albums
                .map(album => album.artistId)
                .filter(Boolean)
        );
        const artistNames = new Set(
            this.#albums.map(album => album.artist)
        );

        this.#artists = artists.filter(artist =>
            artistIds.size > 0
                ? artistIds.has(artist.id)
                : artistNames.has(artist.name)
        );

        if (
            this.#albums.length !== albums.length ||
            this.#artists.length !== artists.length
        ) {
            await this.save();
        }

        return library;
    }

        
    /**
     * Devuelve todas las canciones de un disco.
     *
     * @param {String} albumId
     * @returns {Array}
     */
    getAlbumTracks(albumId) {
        const album = this.#albums.find(
            album => album.id === albumId
        );

        if (!album) {
            return [];
        }

        return this.#tracks.filter(track => album.tracks.includes(track.id));
    }


    /**
     * Devuelve todas las canciones de un artista.
     *
     * @param {String} artistId
     * @returns {Array}
     */
    getArtistTracks(artistId) {

        const artist = this.#artists.find(
            artist => artist.id === artistId
        );

        if (!artist) {
            return [];
        }

        return this.#tracks.filter(
            track => track.artistId
                ? track.artistId === artist.id
                : track.artist === artist.name
        );
    }    


    /**
     * Devuelve todos los álbumes de un artista.
     *
     * @param {String} artistId
     * @returns {Array}
     */
    getArtistAlbums(artistId) {

        const artist = this.#artists.find(
            artist => artist.id === artistId
        );

        if (!artist) {
            return [];
        }

        return this.#albums.filter(
            album => album.artistId
                ? album.artistId === artist.id
                : album.artist === artist.name
        );
    }    
}