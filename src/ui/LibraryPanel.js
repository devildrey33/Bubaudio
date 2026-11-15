import { revealItemInDir } from "@tauri-apps/plugin-opener";

import ContextMenu from "./ContextMenu.js";


export default class LibraryPanel {

    #container;
    #library;
    #player;
    #queuePanel;
    #playlistStore;
    #contextMenu;

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

        this.render();
    }


    render() {

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


    #createArtistNode(artist) {

        const artistNode = document.createElement("details");
        artistNode.className = "library-node library-artist";
        artistNode.dataset.libraryType = "artist";
        artistNode.dataset.libraryId = artist.id;

        const artistLabel = document.createElement("summary");
        artistLabel.className = "library-row";
        this.#appendRowContent(artistLabel, "👥", artist.name);
        artistNode.appendChild(artistLabel);

        const albumTree = this.#createAlbumTree(artist);
        const albumList = document.createElement("div");
        albumList.className = "library-children";
        this.#appendDirectoryChildren(albumList, albumTree);

        artistNode.appendChild(albumList);
        return artistNode;
    }

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


    #createFolderNode(directory) {
        const folderNode = document.createElement("details");
        folderNode.className = "library-node library-folder";
        folderNode.dataset.libraryType = "directory";
        folderNode.dataset.libraryId = directory.path;

        const folderLabel = document.createElement("summary");
        folderLabel.className = "library-row";
        this.#appendRowContent(folderLabel, "📁", directory.name);
        folderNode.appendChild(folderLabel);

        const children = document.createElement("div");
        children.className = "library-children";
        this.#appendDirectoryChildren(children, directory);
        folderNode.appendChild(children);

        return folderNode;
    }


    #createAlbumNode(album, directory) {

        const albumNode = document.createElement("details");
        albumNode.className = "library-node library-album";
        albumNode.dataset.libraryType = "album";
        albumNode.dataset.libraryId = album.id;

        const albumLabel = document.createElement("summary");
        albumLabel.className = "library-row";
        this.#appendRowContent(albumLabel, "💿", album.title);
        albumNode.appendChild(albumLabel);

        const tracks = this.#library
            .getAlbumTracks(album.id)
            .sort((a, b) => a.title.localeCompare(b.title, "es", {
                numeric: true,
                sensitivity: "base"
            }));

        const trackList = document.createElement("div");
        trackList.className = "library-children library-tracks";

        for (const track of tracks) {
            const trackRow = document.createElement("div");
            trackRow.className = "library-row library-track";
            trackRow.dataset.libraryType = "track";
            trackRow.dataset.libraryId = track.id;
            this.#appendRowContent(trackRow, "🎵", track.title);
            trackList.appendChild(trackRow);
        }

        if (directory) {
            this.#appendDirectoryChildren(trackList, directory);
        }

        albumNode.appendChild(trackList);
        return albumNode;
    }

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

    #getDirectoryTracks(path) {
        const directoryPath = String(path)
            .replace(/[\\/]/g, "\\")
            .replace(/\\+$/, "")
            .toLowerCase();
        const prefix = `${directoryPath}\\`;

        return this.#library.tracks
            .filter(track => String(track.path)
                .replace(/[\\/]/g, "\\")
                .toLowerCase()
                .startsWith(prefix)
            )
            .sort((a, b) => a.path.localeCompare(b.path, "es", {
                numeric: true,
                sensitivity: "base"
            }));
    }


    #findLibraryItem(type, id) {

        const items = {
            artist: this.#library.artists,
            album: this.#library.albums,
            track: this.#library.tracks
        }[type];

        return items?.find(item => item.id === id) ?? null;
    }


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


    #sortTracks(tracks) {
        return tracks.sort((a, b) =>
            a.title.localeCompare(b.title, "es", {
                numeric: true,
                sensitivity: "base"
            })
        );
    }


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


    #refreshQueuePanel(queue) {

        this.#queuePanel.setQueue(queue);

        if (queue.currentQueueId !== null) {
            this.#queuePanel.setCurrentTrack(queue.currentQueueId);
        }
    }


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

    refresh() {
        this.render();
    }
}