import { revealItemInDir } from "@tauri-apps/plugin-opener";

import ContextMenu from "./ContextMenu.js";


export default class LibraryPanel {

    #container;
    #library;
    #player;
    #queuePanel;
    #contextMenu;

    constructor(library, player, queuePanel, containerId = "library-tree") {

        this.#library = library;
        this.#player = player;
        this.#queuePanel = queuePanel;
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


    #createArtistNode(artist) {

        const artistNode = document.createElement("details");
        artistNode.className = "library-node library-artist";
        artistNode.dataset.libraryType = "artist";
        artistNode.dataset.libraryId = artist.id;

        const artistLabel = document.createElement("summary");
        artistLabel.className = "library-row";
        this.#appendRowContent(artistLabel, "🎤", artist.name);
        artistNode.appendChild(artistLabel);

        const albums = this.#library
            .getArtistAlbums(artist.id)
            .sort((a, b) => a.title.localeCompare(b.title, "es", {
                numeric: true,
                sensitivity: "base"
            }));

        const albumList = document.createElement("div");
        albumList.className = "library-children";

        for (const album of albums) {
            albumList.appendChild(
                this.#createAlbumNode(album)
            );
        }

        artistNode.appendChild(albumList);
        return artistNode;
    }


    #createAlbumNode(album) {

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
        const libraryItem = this.#findLibraryItem(type, id);

        if (!libraryItem) {
            return [];
        }

        const tracks = this.#getNodeTracks(type, libraryItem);

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
}