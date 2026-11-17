import { revealItemInDir } from "@tauri-apps/plugin-opener";

import ContextMenu from "./ContextMenu.js";


/**
 * Construye el árbol visual de artistas, carpetas, álbumes y canciones, y
 * conecta sus acciones con la biblioteca, el reproductor y las listas
 * guardadas. También conserva los índices que permiten actualizar con rapidez
 * las pistas y los indicadores de favoritos cuando cambia una canción.
 */
export default class LibraryPanel {

    // Elemento raíz donde se dibuja todo el árbol de biblioteca.
    #container;

    // Servicios que aportan los datos y ejecutan acciones solicitadas desde UI.
    #library;
    #player;
    #queuePanel;
    #playlistStore;

    // Menú contextual compartido por artistas, carpetas, álbumes y listas.
    #contextMenu;

    // Índice normalizado de carpeta -> pistas contenidas en esa carpeta y sus
    // descendientes. Se reconstruye cada vez que se renderiza el árbol.
    #directoryTrackIndex = new Map();

    // Índice de ID de pista -> control y modelo. Evita buscar la pista en toda
    // la biblioteca al actualizar una estrella individual.
    #favoriteControlsByTrackId = new Map();

    /**
     * Inicializa las dependencias, comprueba el contenedor, enlaza el menú
     * contextual y escucha cambios de favoritos antes del primer renderizado.
     *
     * @param {LibraryIndexer} library Índice de artistas, álbumes y pistas.
     * @param {Player} player Reproductor cuyas colas modifica el panel.
     * @param {QueuePanel} queuePanel Vista de cola que se debe refrescar.
     * @param {PlaylistStore} playlistStore Listas persistidas disponibles.
     * @param {string} [containerId="library-tree"] ID del contenedor del árbol.
     * @throws {Error} Si no existe el contenedor solicitado en el documento.
     */
    constructor(
        library,
        player,
        queuePanel,
        playlistStore,
        containerId = "library-tree"
    ) {

        this.#library = library;
        this.#player = player;
        this.#queuePanel = queuePanel;
        this.#playlistStore = playlistStore;
        this.#container = document.getElementById(containerId);

        if (!this.#container) {
            throw new Error(
                `LibraryPanel: no se encontró el contenedor '${containerId}'`
            );
        }


        this.#contextMenu = new ContextMenu();
        this.#contextMenu.attach(
            this.#container,
            event => this.#getContextMenuItems(event),
            {
                keepOpenElement: this.#container.closest("#library-panel")
            }
        );

        this.#library.addEventListener("favoritechange", event =>
            this.#refreshFavoriteDisplays(event)
        );

        this.render();
    }


    /**
     * Reconstruye el árbol completo usando el estado actual de la biblioteca.
     * Antes de crear los nodos reinicia el mapa de botones y el índice de rutas
     * para que los eventos posteriores apunten a los elementos recién creados.
     * Las listas guardadas se muestran incluso cuando la biblioteca no contiene
     * artistas.
     */
    render() {

        this.#favoriteControlsByTrackId.clear();
        this.#buildDirectoryTrackIndex();
        this.#container.replaceChildren();
        this.#container.appendChild(this.#createPlaylistsNode());

        if (this.#library.artistCount === 0) {
            const emptyMessage = document.createElement("div");
            emptyMessage.className = "library-empty";
            emptyMessage.textContent = "La biblioteca está vacía";
            this.#container.appendChild(emptyMessage);
            return;
        }

        const artists = [...this.#library.artists].sort((a, b) =>
            a.name.localeCompare(b.name, "es", {
                numeric: true,
                sensitivity: "base"
            })
        );

        for (const artist of artists) {
            this.#container.appendChild(
                this.#createArtistNode(artist)
            );
        }
    }

    /**
     * Crea el nodo desplegable de listas guardadas, ordena las listas por nombre
     * y añade selección por clic y reproducción por doble clic o teclado.
     *
     * @returns {HTMLDetailsElement} Nodo completo de listas guardadas.
     */
    #createPlaylistsNode() {
        const node = document.createElement("details");
        node.className = "library-node library-playlists";

        const label = document.createElement("summary");
        label.className = "library-row";
        this.#appendRowContent(label, "▤", "Listas guardadas");
        node.appendChild(label);

        const children = document.createElement("div");
        children.className = "library-children library-playlist-list";
        children.setAttribute("role", "listbox");
        children.setAttribute("aria-label", "Listas guardadas");
        const playlists = this.#playlistStore.playlists.sort((first, second) =>
            first.name.localeCompare(second.name, "es", {
                numeric: true,
                sensitivity: "base"
            })
        );
        node.open = playlists.length > 0;

        if (playlists.length === 0) {
            const emptyMessage = document.createElement("div");
            emptyMessage.className = "library-empty library-playlist-empty";
            emptyMessage.textContent = "No hay listas guardadas";
            children.appendChild(emptyMessage);
        }

        for (const playlist of playlists) {
            const row = document.createElement("div");
            row.className = "library-row library-playlist";
            row.dataset.libraryType = "playlist";
            row.dataset.libraryId = playlist.id;
            row.setAttribute("role", "option");
            row.setAttribute("aria-selected", "false");
            row.setAttribute("tabindex", "0");
            row.title =
                `Doble clic para reproducir · ${playlist.tracks.length} canciones`;
            this.#appendRowContent(row, "♫", playlist.name);

            const count = document.createElement("span");
            count.className = "library-playlist-count";
            count.textContent = String(playlist.tracks.length);
            row.appendChild(count);

            row.addEventListener("click", () => {
                for (const otherRow of children.querySelectorAll(
                    ".library-playlist"
                )) {
                    otherRow.classList.remove("selected");
                    otherRow.setAttribute("aria-selected", "false");
                }
                row.classList.add("selected");
                row.setAttribute("aria-selected", "true");
            });
            row.addEventListener("dblclick", () => {
                this.#playPlaylist(playlist);
            });
            row.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.#playPlaylist(playlist);
                }
            });
            children.appendChild(row);
        }

        node.appendChild(children);
        return node;
    }


    /**
     * Crea la sección desplegable de un artista. Su indicador resume los
     * favoritos de todas sus pistas y sus hijos se organizan según las rutas
     * de los álbumes.
     *
     * @param {object} artist Registro del artista del índice.
     * @returns {HTMLDetailsElement} Nodo del artista con sus álbumes y carpetas.
     */
    #createArtistNode(artist) {

        const artistNode = document.createElement("details");
        artistNode.className = "library-node library-artist";
        artistNode.dataset.libraryType = "artist";
        artistNode.dataset.libraryId = artist.id;

        const artistLabel = document.createElement("summary");
        artistLabel.className = "library-row";
        this.#appendRowContent(artistLabel, "👥", artist.name);
        this.#appendFavoriteIndicator(
            artistLabel,
            this.#library.getArtistTracks(artist.id)
        );
        artistNode.appendChild(artistLabel);

        const albumTree = this.#createAlbumTree(artist);
        const albumList = document.createElement("div");
        albumList.className = "library-children";
        this.#appendDirectoryChildren(albumList, albumTree);

        artistNode.appendChild(albumList);
        return artistNode;
    }

    /**
     * Construye una estructura de carpetas intermedia a partir de las rutas de
     * los álbumes del artista. Cada segmento de ruta se convierte en un nodo;
     * el nodo terminal conserva el álbum que se dibujará en esa ubicación.
     *
     * Si una ruta de álbum no está dentro de la ruta del artista, usa el título
     * del álbum como ubicación relativa para mantenerlo visible en el árbol.
     *
     * @param {object} artist Artista cuyos álbumes se agruparán.
     * @returns {object} Raíz con path y un Map de carpetas hijas.
     */
    #createAlbumTree(artist) {
        const root = {
            path: artist.path,
            children: new Map()
        };

        for (const album of this.#library.getArtistAlbums(artist.id)) {
            const path = String(album.path ?? "")
                .replace(/[\\/]/g, "\\");
            const artistPath = String(artist.path ?? "")
                .replace(/[\\/]/g, "\\")
                .replace(/\\+$/, "");
            const prefix = `${artistPath}\\`;
            const relativePath = path.toLowerCase().startsWith(
                prefix.toLowerCase()
            )
                ? path.slice(prefix.length)
                : album.title;
            const pathParts = relativePath.split("\\").filter(Boolean);

            let directory = root;
            for (const name of pathParts) {
                if (!directory.children.has(name)) {
                    directory.children.set(name, {
                        name,
                        path: `${directory.path}\\${name}`,
                        album: null,
                        children: new Map()
                    });
                }

                directory = directory.children.get(name);
            }

            directory.album = album;
        }

        return root;
    }


    /**
     * Ordena los hijos directos de una carpeta y los convierte en nodos de
     * carpeta o álbum según tengan asociado un álbum terminal.
     *
     * @param {HTMLElement} container Elemento al que se anexarán los hijos.
     * @param {object} directory Carpeta del árbol intermedio.
     */
    #appendDirectoryChildren(container, directory) {
        const children = [...directory.children.values()].sort((a, b) =>
            a.name.localeCompare(b.name, "es", {
                numeric: true,
                sensitivity: "base"
            })
        );

        for (const child of children) {
            container.appendChild(
                child.album
                    ? this.#createAlbumNode(child.album, child)
                    : this.#createFolderNode(child)
            );
        }
    }


    /**
     * Crea una carpeta organizativa sin álbum propio. Su indicador resume las
     * canciones de esa ruta y todas las subcarpetas; después añade sus hijos.
     *
     * @param {object} directory Carpeta del árbol intermedio.
     * @returns {HTMLDetailsElement} Nodo desplegable de carpeta.
     */
    #createFolderNode(directory) {
        const folderNode = document.createElement("details");
        folderNode.className = "library-node library-folder";
        folderNode.dataset.libraryType = "directory";
        folderNode.dataset.libraryId = directory.path;

        const folderLabel = document.createElement("summary");
        folderLabel.className = "library-row";
        this.#appendRowContent(folderLabel, "📁", directory.name);
        this.#appendFavoriteIndicator(
            folderLabel,
            this.#getDirectoryTracks(directory.path)
        );
        folderNode.appendChild(folderLabel);

        const children = document.createElement("div");
        children.className = "library-children";
        this.#appendDirectoryChildren(children, directory);
        folderNode.appendChild(children);

        return folderNode;
    }


    /**
     * Crea un álbum y sus pistas ordenadas por título. Si la carpeta del álbum
     * contiene otros álbumes anidados, también los coloca dentro de este nodo.
     * El indicador usa la carpeta completa, por lo que incluye las pistas de
     * los descendientes cuando los haya.
     *
     * @param {object} album Álbum del índice.
     * @param {object|null} directory Carpeta terminal asociada al álbum.
     * @returns {HTMLDetailsElement} Nodo desplegable del álbum.
     */
    #createAlbumNode(album, directory) {

        const albumNode = document.createElement("details");
        albumNode.className = "library-node library-album";
        albumNode.dataset.libraryType = "album";
        albumNode.dataset.libraryId = album.id;
        albumNode.dataset.libraryDirectory = directory?.path ?? album.path;

        const tracks = this.#library
            .getAlbumTracks(album.id)
            .sort((a, b) => a.title.localeCompare(b.title, "es", {
                numeric: true,
                sensitivity: "base"
            }));

        const albumLabel = document.createElement("summary");
        albumLabel.className = "library-row";
        this.#appendRowContent(albumLabel, "💿", album.title);
        this.#appendFavoriteIndicator(
            albumLabel,
            this.#getDirectoryTracks(albumNode.dataset.libraryDirectory)
        );
        albumNode.appendChild(albumLabel);

        const trackList = document.createElement("div");
        trackList.className = "library-children library-tracks";

        for (const track of tracks) {
            const trackRow = document.createElement("div");
            trackRow.className = "library-row library-track";
            trackRow.dataset.libraryType = "track";
            trackRow.dataset.libraryId = track.id;
            this.#appendRowContent(trackRow, "🎵", track.title);
            trackRow.appendChild(this.#createFavoriteButton(track));
            trackList.appendChild(trackRow);
        }

        if (directory) {
            this.#appendDirectoryChildren(trackList, directory);
        }

        albumNode.appendChild(trackList);
        return albumNode;
    }

    /**
     * Añade a una fila su icono decorativo y su etiqueta textual.
     *
     * @param {HTMLElement} row Fila que recibirá los elementos.
     * @param {string} iconText Contenido del icono.
     * @param {string} labelText Texto visible de la fila.
     */
    #appendRowContent(row, iconText, labelText) {
        const icon = document.createElement("span");
        icon.className = "library-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = iconText;

        const label = document.createElement("span");
        label.className = "library-label";
        label.textContent = labelText;

        row.append(icon, label);
    }


    /**
     * Crea el botón de favorito de una pista, enlaza sus eventos y registra la
     * relación botón/modelo por ID. Ese mapa permite actualizar solo esta
     * estrella cuando llega un evento favoritechange.
     *
     * @param {object} track Pista asociada al control.
     * @returns {HTMLButtonElement} Botón accesible de favorito.
     */
    #createFavoriteButton(track) {
        const button = document.createElement("button");
        button.className = "library-favorite-toggle";
        button.type = "button";
        button.dataset.libraryId = track.id;
        this.#updateFavoriteButton(button, track);
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.#toggleFavorite(track, button);
        });
        button.addEventListener("dblclick", event => {
            event.stopPropagation();
        });
        this.#favoriteControlsByTrackId.set(track.id, {
            button,
            track
        });
        return button;
    }


    /**
     * Refleja el estado favorito en el texto y los atributos accesibles del
     * botón, incluido aria-pressed, su etiqueta y su ayuda emergente.
     *
     * @param {HTMLButtonElement} button Botón que se actualizará.
     * @param {object} track Pista cuyo estado se representa.
     */
    #updateFavoriteButton(button, track) {
        const favorite = this.#library.isFavorite(track);
        button.textContent = "★";
        button.setAttribute("aria-pressed", String(favorite));
        button.setAttribute(
            "aria-label",
            favorite
                ? `Quitar ${track.title} de favoritos`
                : `Añadir ${track.title} a favoritos`
        );
        button.title = favorite
            ? "Quitar de favoritos"
            : "Añadir a favoritos";
    }


    /**
     * Ejecuta el cambio solicitado por el usuario. Deshabilita temporalmente el
     * botón, informa de los fallos de persistencia y siempre restablece su
     * estado visual al terminar la operación.
     *
     * @param {object} track Pista que cambiará de estado.
     * @param {HTMLButtonElement} button Botón desde el que se inició la acción.
     */
    async #toggleFavorite(track, button) {
        button.disabled = true;
        try {
            await this.#library.setFavorite(
                track,
                !this.#library.isFavorite(track)
            );
        }
        catch (error) {
            console.error(
                `LibraryPanel: no se pudo actualizar el favorito '${track.title}'`,
                error
            );
            window.alert(
                `No se pudo actualizar el favorito: ${String(error)}`
            );
        }
        finally {
            button.disabled = false;
            this.#updateFavoriteButton(button, track);
        }
    }


    /**
     * Crea el indicador de favoritos que aparece junto al nombre de un artista,
     * carpeta o álbum, y calcula su estado inicial a partir de sus pistas.
     *
     * @param {HTMLElement} row Fila que recibirá el indicador.
     * @param {object[]} tracks Pistas que representa esa fila.
     */
    #appendFavoriteIndicator(row, tracks) {
        const indicator = document.createElement("span");
        indicator.className = "library-favorite-indicator";
        indicator.textContent = "★";
        indicator.setAttribute("role", "img");
        indicator.setAttribute("aria-hidden", "false");
        this.#updateFavoriteIndicator(indicator, tracks);
        row.appendChild(indicator);
    }


    /**
     * Calcula el total inicial de favoritos del grupo. Se usa al renderizar;
     * los cambios siguientes ajustan ese total incrementalmente.
     *
     * @param {HTMLSpanElement} indicator Indicador que se actualizará.
     * @param {object[]} tracks Pistas incluidas en el grupo.
     */
    #updateFavoriteIndicator(indicator, tracks) {
        const total = tracks.length;
        const favoriteCount = tracks.filter(track =>
            this.#library.isFavorite(track)
        ).length;

        this.#setFavoriteIndicatorCount(
            indicator,
            favoriteCount,
            total
        );
    }


    /**
     * Guarda el total y el número de favoritos en data-* para poder aplicar
     * deltas sin volver a recorrer las pistas. También actualiza opacidad,
     * tooltip y etiqueta accesible del indicador.
     *
     * @param {HTMLSpanElement} indicator Indicador que se actualizará.
     * @param {number} favoriteCount Número actual de pistas favoritas.
     * @param {number} total Número total de pistas del grupo.
     */
    #setFavoriteIndicatorCount(indicator, favoriteCount, total) {
        indicator.dataset.favoriteCount = String(favoriteCount);
        indicator.dataset.trackCount = String(total);
        const ratio = total > 0 ? favoriteCount / total : 0;
        const opacity = 0.2 + ratio * 0.8;
        const description =
            `${favoriteCount} de ${total} canciones favoritas`;

        indicator.style.opacity = String(opacity);
        indicator.title = description;
        indicator.setAttribute("aria-label", description);
    }


    /**
     * Aplica un evento favoritechange sin recorrer toda la biblioteca: actualiza
     * el botón de la pista y suma o resta uno en los indicadores de sus nodos
     * antecesores (carpeta, álbum y artista). El delta es válido porque el
     * índice solo emite este evento cuando el favorito realmente cambia.
     *
     * @param {CustomEvent} event Evento con trackId y el estado favorito nuevo.
     */
    #refreshFavoriteDisplays(event) {
        const { trackId, favorite } = event.detail;
        const control = this.#favoriteControlsByTrackId.get(trackId);
        if (!control) {
            return;
        }

        this.#updateFavoriteButton(control.button, control.track);
        const favoriteCountDelta = favorite ? 1 : -1;
        let node = control.button.closest(".library-node");
        while (node) {
            const indicator = node.firstElementChild?.querySelector(
                ".library-favorite-indicator"
            );
            if (indicator) {
                this.#setFavoriteIndicatorCount(
                    indicator,
                    Number(indicator.dataset.favoriteCount) +
                        favoriteCountDelta,
                    Number(indicator.dataset.trackCount)
                );
            }
            node = node.parentElement?.closest(".library-node") ?? null;
        }
    }


    /**
     * Genera las acciones del menú contextual para el elemento bajo el puntero.
     * Las listas tienen acciones propias; artistas, carpetas y álbumes reciben
     * opciones para añadir sus pistas a la cola y revelar su ruta en el sistema.
     *
     * @param {MouseEvent} event Evento que identifica la fila seleccionada.
     * @returns {object[]} Acciones compatibles con ContextMenu.
     */
    #getContextMenuItems(event) {

        const node = event.target instanceof Element
            ? event.target.closest("[data-library-type]")
            : null;

        if (!node || !this.#container.contains(node)) {
            return [];
        }

        const type = node.dataset.libraryType;
        const id = node.dataset.libraryId;

        if (type === "playlist") {
            const playlist = this.#playlistStore.getById(id);
            if (!playlist) {
                return [];
            }

            return [
                {
                    label: "Reproducir lista",
                    icon: "▶",
                    action: () => this.#playPlaylist(playlist)
                },
                {
                    label: "Añadir a cola",
                    icon: "＋",
                    action: () => this.#addTracksToQueue(playlist.tracks)
                },
                {
                    label: "Eliminar lista",
                    icon: "🗑",
                    action: () => this.#removePlaylist(playlist)
                }
            ];
        }

        const libraryItem = type === "directory"
            ? { path: id }
            : this.#findLibraryItem(type, id);

        if (!libraryItem) {
            return [];
        }

        const tracks = type === "directory"
            ? this.#getDirectoryTracks(id)
            : this.#getNodeTracks(type, libraryItem);

        return [
            {
                label: "Añadir a cola",
                icon: "＋",
                disabled: tracks.length === 0,
                action: () => this.#addTracksToQueue(tracks)
            },
            {
                label: "Añadir a nueva cola",
                icon: "▤",
                disabled: tracks.length === 0,
                action: () => this.#replaceQueue(tracks)
            },
            {
                label: "Mostrar carpeta",
                icon: "📂",
                action: () => this.#showFolder(libraryItem.path)
            }
        ];
    }

    /**
     * Devuelve una copia de las pistas indexadas para una carpeta normalizada.
     * La copia evita que consumidores como los menús modifiquen el array interno.
     *
     * @param {string} path Ruta de la carpeta.
     * @returns {object[]} Pistas de esa carpeta y sus descendientes.
     */
    #getDirectoryTracks(path) {
        const directoryPath = String(path)
            .replace(/[\\/]/g, "\\")
            .replace(/\\+$/, "")
            .toLowerCase();
        return [...(this.#directoryTrackIndex.get(directoryPath) ?? [])];
    }


    /**
     * Construye el índice de rutas usado por los indicadores y acciones de
     * carpetas. Cada pista se agrega a su carpeta directa y a cada antecesora,
     * así cualquier carpeta puede consultar también el contenido descendiente.
     * Las rutas se normalizan para no distinguir mayúsculas ni separadores.
     */
    #buildDirectoryTrackIndex() {
        this.#directoryTrackIndex.clear();

        for (const track of this.#library.tracks) {
            const path = String(track.path ?? "")
                .replace(/[\\/]/g, "\\")
                .replace(/\\+$/, "")
                .toLowerCase();
            const lastSeparator = path.lastIndexOf("\\");
            if (lastSeparator === -1) {
                continue;
            }
            let directoryPath = path.slice(0, lastSeparator);

            while (directoryPath) {
                if (!this.#directoryTrackIndex.has(directoryPath)) {
                    this.#directoryTrackIndex.set(directoryPath, []);
                }
                this.#directoryTrackIndex.get(directoryPath).push(track);

                const separatorIndex = directoryPath.lastIndexOf("\\");
                if (separatorIndex === -1) {
                    break;
                }
                directoryPath = directoryPath.slice(0, separatorIndex);
            }
        }

        for (const tracks of this.#directoryTrackIndex.values()) {
            tracks.sort((a, b) => a.path.localeCompare(b.path, "es", {
                numeric: true,
                sensitivity: "base"
            }));
        }
    }


    /**
     * Busca un artista, álbum o pista por ID en la colección correspondiente.
     * Los directorios no forman parte de esas colecciones y se resuelven a partir
     * de su ruta en los métodos que los consumen.
     *
     * @param {"artist"|"album"|"track"} type Tipo de elemento.
     * @param {string} id Identificador del elemento.
     * @returns {object|null} Elemento encontrado o null.
     */
    #findLibraryItem(type, id) {

        const items = {
            artist: this.#library.artists,
            album: this.#library.albums,
            track: this.#library.tracks
        }[type];

        return items?.find(item => item.id === id) ?? null;
    }


    /**
     * Obtiene las pistas representadas por un nodo: una pista, las pistas de un
     * álbum o todas las pistas de los álbumes de un artista.
     *
     * @param {"artist"|"album"|"track"} type Tipo del nodo.
     * @param {object} item Registro del nodo.
     * @returns {object[]} Pistas asociadas, ordenadas por título cuando procede.
     */
    #getNodeTracks(type, item) {

        if (type === "track") {
            return [item];
        }

        if (type === "album") {
            return this.#sortTracks(
                this.#library.getAlbumTracks(item.id)
            );
        }

        if (type === "artist") {
            const albums = this.#library
                .getArtistAlbums(item.id)
                .sort((a, b) => a.title.localeCompare(b.title, "es", {
                    numeric: true,
                    sensitivity: "base"
                }));

            return albums.flatMap(album =>
                this.#sortTracks(this.#library.getAlbumTracks(album.id))
            );
        }

        return [];
    }


    /**
     * Ordena un array de pistas por título en español, ignorando mayúsculas y
     * comparando partes numéricas. El array recibido se ordena in situ.
     *
     * @param {object[]} tracks Pistas que se ordenarán.
     * @returns {object[]} El mismo array, ya ordenado.
     */
    #sortTracks(tracks) {
        return tracks.sort((a, b) =>
            a.title.localeCompare(b.title, "es", {
                numeric: true,
                sensitivity: "base"
            })
        );
    }


    /**
     * Añade pistas a la cola actual o la inicializa si está vacía; luego
     * sincroniza el panel de cola y notifica el cambio al resto de la aplicación.
     *
     * @param {object[]} tracks Pistas que se añadirán.
     */
    #addTracksToQueue(tracks) {

        const queue = this.#player.queue;

        if (queue.items.length === 0) {
            queue.setTracks(tracks);
        }
        else {
            queue.addMany(tracks);
        }

        this.#refreshQueuePanel(queue);
        this.#player.dispatchEvent(new Event("queuechanged"));
    }


    /**
     * Reemplaza la cola e inicia su reproducción. Si falla el inicio, registra
     * el error; en ambos casos vuelve a sincronizar el panel con la cola actual.
     *
     * @param {object[]} tracks Pistas de la nueva cola.
     */
    async #replaceQueue(tracks) {
        try {
            await this.#player.playQueue(tracks);
        }
        catch (error) {
            console.error(
                "LibraryPanel: no se pudo iniciar la nueva cola",
                error
            );
        }

        this.#refreshQueuePanel(this.#player.queue);
    }

    /**
     * Reproduce todas las pistas de una lista guardada mediante el reproductor.
     * Los fallos se registran y se presentan al usuario.
     *
     * @param {object} playlist Lista guardada que se reproducirá.
     */
    async #playPlaylist(playlist) {
        try {
            await this.#player.playQueue(playlist.tracks);
        }
        catch (error) {
            console.error(
                `LibraryPanel: no se pudo reproducir la lista '${playlist.name}'`,
                error
            );
            window.alert(
                `No se pudo reproducir la lista '${playlist.name}': ${String(error)}`
            );
        }
    }

    /**
     * Solicita confirmación antes de borrar una lista, la elimina del almacén y
     * vuelve a renderizar el panel. Si falla, conserva la vista y muestra el error.
     *
     * @param {object} playlist Lista que se quiere eliminar.
     */
    async #removePlaylist(playlist) {
        if (!window.confirm(`¿Eliminar la lista '${playlist.name}'?`)) {
            return;
        }

        try {
            await this.#playlistStore.remove(playlist.id);
            this.render();
        }
        catch (error) {
            console.error(
                `LibraryPanel: no se pudo eliminar la lista '${playlist.name}'`,
                error
            );
            window.alert(
                `No se pudo eliminar la lista '${playlist.name}': ${String(error)}`
            );
        }
    }


    /**
     * Copia la cola actual al panel y, si hay una pista seleccionada, la marca
     * como pista actual.
     *
     * @param {PlaybackQueue} queue Cola vigente del reproductor.
     */
    #refreshQueuePanel(queue) {

        this.#queuePanel.setQueue(queue);

        if (queue.currentQueueId !== null) {
            this.#queuePanel.setCurrentTrack(queue.currentQueueId);
        }
    }


    /**
     * Pide al sistema operativo que muestre la carpeta de una pista, álbum o
     * artista. Los errores se registran para facilitar el diagnóstico.
     *
     * @param {string} path Ruta que se mostrará en el explorador.
     */
    async #showFolder(path) {
        try {
            await revealItemInDir(path);
        }
        catch (error) {
            console.error(
                `LibraryPanel: no se pudo mostrar la ruta '${path}'`,
                error
            );
        }
    }

    /**
     * Actualiza el panel completo después de cambios estructurales, por ejemplo
     * al crear o eliminar una lista guardada.
     */
    refresh() {
        this.render();
    }
}