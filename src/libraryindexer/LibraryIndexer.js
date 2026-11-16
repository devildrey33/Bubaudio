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

/**
 * Normaliza una ruta para comparaciones: convierte separadores a formato
 * Windows, elimina separadores finales y compara sin distinguir mayúsculas.
 * No modifica la ruta almacenada ni valida que el archivo exista.
 *
 * @param {*} path Ruta que se desea normalizar.
 * @returns {string} Representación normalizada para comparar rutas.
 */
function normalizeTrackPath(path) {
    return String(path ?? "")
        .replace(/[\\/]/g, "\\")
        .replace(/\\+$/, "")
        .toLowerCase();
}

/**
 * Recorre directorios de música, construye índices de artistas, álbumes y
 * pistas, y los persiste en el área de datos de la aplicación. También ofrece
 * consultas sobre esos índices y permite actualizar el estado favorito de una
 * pista.
 *
 * Los objetos obtenidos mediante los getters de colección son referencias
 * internas; las modificaciones del índice deben realizarse preferentemente a
 * través de los métodos de esta clase para mantener coherentes el archivo y
 * los eventos emitidos.
 */
export default class LibraryIndexer extends EventTarget {

    // Archivo persistido en AppData y versión del esquema que escribe save().
    static LIBRARY_FILE = "library.json";
    static INDEX_VERSION = 4;

    // Extensiones reconocidas durante el escaneo, sin el punto inicial.
    static SUPPORTED_FORMATS = [
        "mp3",
        "flac",
        "ogg",
        "opus",
        "wav",
        "m4a",
        "aac"
    ];


    // Directorios raíz que se procesaron en el escaneo/carga más reciente.
    #musicPaths = [];

    // Colecciones que forman el índice en memoria.
    #artists = [];

    #albums = [];

    #tracks = [];


    /**
     * Inicializa el EventTarget. El índice empieza vacío y se llena mediante
     * scan() o load().
     */
    constructor() {
        super();
    }


    /**
     * Escanea una o varias raíces de música y reconstruye el índice.
     *
     * Para cada raíz, interpreta su primer nivel como artistas; recorre
     * recursivamente sus subdirectorios y considera cada carpeta que contiene
     * archivos de audio directamente como un álbum. Las carpetas de
     * organización sin pistas propias no se añaden como álbumes.
     *
     * Antes de limpiar el índice conserva los favoritos por ruta normalizada,
     * para restaurarlos en las pistas que vuelvan a encontrarse. Emite
     * scanstart, eventos scanprogress durante el recorrido y, al finalizar,
     * guarda el índice y emite scancomplete. Si ocurre un error, emite
     * scanerror y vuelve a propagarlo.
     *
     * @param {string|Array<string>} musicPaths Una raíz o varias raíces.
     * @returns {Promise<void>}
     * @throws {Error} Si no hay raíces válidas o falla el acceso/escritura.
     */
    async scan(musicPaths) {
        // Acepta una sola ruta o una lista; descarta valores que no sean
        // cadenas no vacías después de recortar espacios.
        this.#musicPaths = (Array.isArray(musicPaths)
            ? musicPaths
            : [musicPaths]
        ).filter(path => typeof path === "string" && path.trim());

        if (this.#musicPaths.length === 0) {
            throw new Error("LibraryIndexer: no hay directorios de música");
        }

        // Los IDs se regeneran en cada escaneo, así que la ruta es la clave
        // estable para conservar los favoritos entre reconstrucciones.
        const favoritesByPath = new Map(
            this.#tracks
                .filter(track => track.favorite === true)
                .map(track => [normalizeTrackPath(track.path), true])
        );

        this.clear();
        // Notifica el comienzo después de reiniciar las colecciones para que
        // los observadores lean el nuevo estado vacío.
        this.dispatchEvent(new CustomEvent("scanstart", {
            detail: {
                musicPaths: [...this.#musicPaths]
            }
        }));

        try {
            for (const musicPath of this.#musicPaths) {
                await this.#scanArtists(musicPath);
            }

            // Una nueva pista no conserva el favorito por su ID; recupera el
            // valor usando la ruta del archivo o queda como no favorita.
            for (const track of this.#tracks) {
                track.favorite = favoritesByPath.get(
                    normalizeTrackPath(track.path)
                ) ?? false;
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
     * Vacía artistas, álbumes y pistas en memoria. No modifica las raíces
     * configuradas y no escribe el cambio en disco.
     */
    clear() {
        this.#artists = [];
        this.#albums = [];
        this.#tracks = [];
    }


    /**
     * Lee el primer nivel de una raíz y procesa cada subdirectorio como artista.
     *
     * Solo incorpora el artista al índice si el recorrido encuentra al menos
     * un álbum con pistas. Emite progreso para la raíz y para cada artista.
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
            // El artista temporal se pasa a la recursión para asociar sus
            // álbumes y pistas; solo se publica en #artists si tiene álbumes.
            await this.#scanAlbums(
                artistData
            );

            if (this.#albums.length > albumCount) {
                this.addArtist(artistData);
            }
        }
    }


    /**
     * Desciende por las carpetas bajo un artista e inicia el procesamiento de
     * cada subdirectorio. La recursión real continúa en #scanAlbumDirectory,
     * que también detecta pistas directamente dentro de cada carpeta.
     *
     * @param {object} artist Datos del artista al que se asociarán los álbumes.
     * @private
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
     * Procesa una carpeta como posible álbum y luego visita sus subdirectorios.
     * Los archivos de audio directos se asignan al álbum cuyo título es el
     * nombre de esa carpeta; los subdirectorios se consideran posibles álbumes
     * independientes. Solo añade el álbum si contiene al menos una pista.
     *
     * @param {object} artist Datos del artista asociado.
     * @param {string} currentPath Ruta de la carpeta actual.
     * @param {string} albumTitle Título inferido del nombre de la carpeta.
     * @private
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
                // Aunque la carpeta actual tenga pistas, sus subdirectorios se
                // indexan por separado y no se mezclan en este álbum.
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

            // Cada pista queda en el índice global; el álbum guarda además
            // sus IDs para consultas posteriores.
            const track = this.#createTrack(
                artist,
                album,
                entry,
                entryPath
            );

            album.tracks.push(track.id);
            this.addTrack(track);
        }

        // Evita representar como álbum una carpeta de organización vacía o que
        // solo contiene subcarpetas.
        if (album.tracks.length > 0) {
            this.addAlbum(album);
        }
    }


    /**
     * Emite el progreso actual del escaneo con rutas y contadores acumulados.
     * Los contadores reflejan únicamente los elementos ya agregados al índice.
     *
     * @param {string} currentPath Carpeta que se está procesando.
     * @param {string} artistName Nombre del artista actual, si se conoce.
     * @param {string} musicPath Raíz de biblioteca correspondiente.
     * @private
     */
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
     * Construye el objeto de pista usando la jerarquía de carpetas y el nombre
     * del archivo. Por ahora no lee metadatos embebidos: el título se obtiene
     * del nombre sin su última extensión, el género queda sin asignar y el
     * formato es la extensión en minúsculas.
     *
     * @param {object} artist Artista al que pertenece la pista.
     * @param {object} album Álbum al que pertenece la pista.
     * @param {object} file Entrada devuelta por readDir.
     * @param {string} path Ruta completa del archivo.
     *
     * @returns {object} Registro listo para añadir al índice.
     */
    #createTrack(artist, album, file, path) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const title = file.name.replace(/\.[^.]+$/, "");

        return {
            // El ID identifica esta instancia en el índice; puede cambiar en
            // un escaneo posterior, a diferencia de la ruta del archivo.
            id      : crypto.randomUUID(),
            artistId: artist.id,
            // Estos valores se infieren de los nombres de las carpetas.
            artist  : artist.name,
            album   : album.title,
            // El nombre del archivo es el título mientras no se lean tags.
            title,
            // Reservado para metadatos que puedan leerse en el futuro.
            genre   : null,
            // Ruta absoluta que usa el reproductor para abrir el archivo.
            path,
            // Se restaura en scan() si coincide la ruta de un favorito previo.
            favorite: false,
            // Extensión detectada a partir del nombre.
            format  : extension
        };
    }


    /**
     * Comprueba si la última extensión del nombre está incluida en la lista de
     * formatos admitidos. La comparación no distingue mayúsculas.
     *
     * @param {string} fileName Nombre del archivo.
     * @returns {boolean} true si la extensión está soportada.
     */
    #isSupportedFile(fileName) {
        const extension = fileName.split(".").pop()?.toLowerCase();
        return (LibraryIndexer.SUPPORTED_FORMATS.includes(extension));
    }


    /**
     * Añade un artista a la colección en memoria. No valida ni persiste el
     * objeto; el escaneo construye los datos y save() los guarda.
     *
     * @param {object} artist Registro del artista.
     */
    addArtist(artist) {
        this.#artists.push(
            artist
        );
    }


    /**
     * Añade un álbum a la colección en memoria.
     *
     * @param {object} album Registro del álbum.
     */
    addAlbum(album) {
        this.#albums.push(
            album
        );
    }


    /**
     * Añade una pista a la colección en memoria.
     *
     * @param {object} track Registro de la pista.
     */
    addTrack(track) {
        this.#tracks.push(track);
    }


    /**
     * Devuelve un artista elegido con probabilidad uniforme, o null si el índice
     * no contiene artistas.
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
     * Devuelve un álbum elegido con probabilidad uniforme, o null si no hay
     * álbumes indexados.
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
     * Devuelve una pista elegida con probabilidad uniforme, o null si el índice
     * no contiene pistas.
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
     * Devuelve la colección interna de artistas. Es una referencia mutable,
     * no una copia.
     */
    get artists() {
        return this.#artists;
    }


    /**
     * Devuelve la colección interna de álbumes. Es una referencia mutable,
     * no una copia.
     */
    get albums() {
        return this.#albums;
    }


    /**
     * Devuelve la colección interna de pistas. Es una referencia mutable,
     * no una copia.
     */
    get tracks() {
        return this.#tracks;
    }

    /** Devuelve una copia superficial de las rutas raíz configuradas. */
    get musicPaths() {
        return [...this.#musicPaths];
    }


    /**
     * Número de artistas almacenados.
     */
    get artistCount() {
        return this.#artists.length;
    }


    /**
     * Número de álbumes almacenados.
     */
    get albumCount() {
        return this.#albums.length;
    }


    /**
     * Número de pistas almacenadas.
     */
    get trackCount() {
        return this.#tracks.length;
    }


    /**
     * Serializa el estado actual en library.json dentro de AppData. El
     * documento incluye versión de esquema, raíces de escaneo, fecha y las
     * tres colecciones. Crea AppData si aún no existe.
     *
     * @returns {Promise<void>}
     */
    async save() {
        // scanDate se actualiza en cada escritura, no solo al escanear; por
        // tanto también refleja cambios de favoritos.
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
     * Indica si una pista está marcada como favorita. Acepta el objeto/ID de
     * una pista o su ruta; si no se encuentra en el índice, devuelve false.
     *
     * @param {object|string} trackOrId Pista, ID o ruta que se consultará.
     * @returns {boolean} true solo si la pista encontrada tiene favorite=true.
     */
    isFavorite(trackOrId) {
        return this.#findTrack(trackOrId)?.favorite === true;
    }

    /**
     * Cambia el estado favorito y persiste el índice. Rechaza valores que no
     * sean booleanos y pistas no encontradas. Si save() falla, restaura en
     * memoria el valor anterior y propaga el error. Emite favoritechange solo
     * después de guardar correctamente y solo cuando el valor realmente cambió.
     *
     * @param {object|string} trackOrId Pista, ID o ruta a actualizar.
     * @param {boolean} favorite Nuevo estado favorito.
     * @returns {Promise<boolean>} true si se modificó; false si ya tenía ese
     * estado.
     */
    async setFavorite(trackOrId, favorite) {
        if (typeof favorite !== "boolean") {
            throw new TypeError(
                "LibraryIndexer: el estado favorito debe ser true o false"
            );
        }

        const track = this.#findTrack(trackOrId);
        if (!track) {
            throw new Error(
                "LibraryIndexer: no se encontró la canción para actualizar"
            );
        }

        const previousFavorite = track.favorite === true;
        if (previousFavorite === favorite) {
            return false;
        }

        // Actualización optimista local con reversión si la persistencia falla.
        track.favorite = favorite;
        try {
            await this.save();
        }
        catch (error) {
            track.favorite = previousFavorite;
            throw error;
        }

        this.dispatchEvent(new CustomEvent("favoritechange", {
            detail: {
                trackId: track.id,
                favorite,
                path: track.path
            }
        }));
        return true;
    }


    /**
     * Resuelve una pista aceptando su ID, una ruta o un objeto que contenga id
     * y/o path. Prioriza el ID; si no encuentra coincidencia, compara rutas
     * normalizadas para admitir diferencias de mayúsculas o separadores.
     *
     * @param {object|string} trackOrId Valor usado para identificar la pista.
     * @returns {object|null} Registro interno encontrado o null.
     * @private
     */
    #findTrack(trackOrId) {
        // Primero intenta el ID estable dentro de la biblioteca cargada.
        const id = typeof trackOrId === "string"
            ? trackOrId
            : trackOrId?.id;
        const track = id
            ? this.#tracks.find(item => item.id === id)
            : null;

        if (track) {
            return track;
        }

        // Una cadena también se interpreta como posible ruta; un objeto puede
        // proporcionar path aunque su ID no exista en el índice actual.
        const path = typeof trackOrId === "string"
            ? trackOrId
            : trackOrId?.path;
        if (!path) {
            return null;
        }

        const normalizedPath = normalizeTrackPath(path);
        return this.#tracks.find(item =>
            normalizeTrackPath(item.path) === normalizedPath
        ) ?? null;
    }


    /**
     * Lee y analiza library.json desde AppData, reconstruye las colecciones y
     * aplica compatibilidad con esquemas antiguos. Versiones anteriores a 3
     * requieren volver a escanear las raíces guardadas; esquemas anteriores a
     * la versión actual migran el campo favorite. También filtra álbumes sin
     * pistas presentes y artistas que no tengan álbumes asociados.
     *
     * Si la migración o la limpieza cambia el índice, lo guarda en el formato
     * actual antes de retornar el documento originalmente leído.
     *
     * @returns {Promise<object>} Documento JSON leído antes de una eventual
     * migración/persistencia.
     * @throws {Error} Si falla la lectura/análisis o no se pueden reconstruir
     * los datos de un índice antiguo.
     */
    async load() {

        // Los fallos de lectura y JSON se propagan para que el llamador pueda
        // decidir cómo informar o recuperarse.
        const json = await readTextFile(
            LibraryIndexer.LIBRARY_FILE, {
                baseDir : BaseDirectory.AppData
            }
        );

        const library = JSON.parse(json);

        // Admite el formato histórico singular musicPath además de la lista
        // actual musicPaths.
        this.#musicPaths = Array.isArray(library.musicPaths)
            ? library.musicPaths
            : library.musicPath
                ? [library.musicPath]
                : [];

        if (!Number.isInteger(library.version) || library.version < 3) {
            if (this.#musicPaths.length === 0) {
                throw new Error(
                    "LibraryIndexer: el índice antiguo no contiene directorios de música"
                );
            }

            // El esquema antiguo no proporciona un índice suficientemente
            // actualizado, por lo que se reconstruye desde los archivos.
            await this.scan(this.#musicPaths);
            return library;
        }

        // Normaliza el campo favorite de registros que carezcan de él o tengan
        // un valor distinto de true.
        const storedTracks = Array.isArray(library.tracks)
            ? library.tracks
            : [];
        const needsFavoriteMigration =
            library.version < LibraryIndexer.INDEX_VERSION ||
            storedTracks.some(track =>
                typeof track.favorite !== "boolean"
            );
        this.#tracks = storedTracks.map(track => ({
            ...track,
            favorite: track.favorite === true
        }));

        // Elimina álbumes cuyo listado de pistas no enlaza con ninguna pista
        // cargada; evita mantener entidades huérfanas en el índice.
        const artists = library.artists ?? [];
        const albums = library.albums ?? [];
        const trackIds = new Set(this.#tracks.map(track => track.id));

        this.#albums = albums.filter(album =>
            Array.isArray(album.tracks) &&
            album.tracks.some(trackId => trackIds.has(trackId))
        );

        // Reconstruye artistas usados por los álbumes conservados. La
        // comparación por nombre permite compatibilidad con registros sin
        // artistId.
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

        // Persistir si hubo limpieza de referencias o migración de esquema/
        // favoritos garantiza que la siguiente carga use el formato vigente.
        if (
            this.#albums.length !== albums.length ||
            this.#artists.length !== artists.length ||
            needsFavoriteMigration
        ) {
            await this.save();
        }

        return library;
    }

        
    /**
     * Devuelve las pistas cuyos IDs están enumerados por el álbum solicitado.
     * Si no existe el álbum, retorna una lista vacía. El orden corresponde al
     * de #tracks, no necesariamente al orden de los IDs dentro del álbum.
     *
     * @param {string} albumId ID del álbum.
     * @returns {Array} Pistas asociadas.
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
     * Devuelve las pistas del artista. Usa artistId cuando la pista lo tiene;
     * para datos antiguos sin ese campo, recurre al nombre del artista.
     *
     * @param {string} artistId ID del artista.
     * @returns {Array} Pistas asociadas o una lista vacía si no existe.
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
     * Devuelve los álbumes del artista. Usa artistId cuando está disponible y
     * compara el nombre como alternativa para registros antiguos.
     *
     * @param {string} artistId ID del artista.
     * @returns {Array} Álbumes asociados o una lista vacía si no existe.
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