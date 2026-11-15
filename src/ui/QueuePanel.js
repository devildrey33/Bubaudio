import ContextMenu from "./ContextMenu.js";

export default class QueuePanel {

    #container;
    #queue;
    #player;
    #library;
    #currentQueueId = null;
    #generateButton;
    #generateMenu;
    #artistSuggestions = [];
    #albumSuggestions = [];

    constructor(player, library, containerId = "queue-list") {

        this.#player = player;
        this.#library = library;
        this.#container = document.getElementById(containerId);

        if (!this.#container) {
            throw new Error(
                `QueuePanel: no se encontró el contenedor '${containerId}'`
            );
        }

        this.#generateButton = document.getElementById(
            "queue-generate-button"
        );

        if (!this.#generateButton) {
            throw new Error(
                "QueuePanel: no se encontró el botón para generar listas"
            );
        }

        this.#generateMenu = new ContextMenu();
        this.#generateButton.addEventListener("click", () => {
            this.#openGenerateMenu();
        });

        this.setQueue(this.#player.queue);
    }

    #openGenerateMenu() {
        this.#refreshSuggestions();

        const bounds = this.#generateButton.getBoundingClientRect();

        this.#generateMenu.show({
            clientX: bounds.left,
            clientY: bounds.bottom
        }, this.#getGenerateMenuItems(),
        this.#container.closest("#queue-panel"));
    }

    #getGenerateMenuItems() {
        return [
            {
                label: "Grupo aleatorio",
                icon: "👥",
                disabled: this.#library.artistCount === 0,
                children: [
                    ...this.#artistSuggestions.map(artist => ({
                        label: artist.name,
                        icon: "👥",
                        action: () => this.#replaceWithRandomList(
                            "artist",
                            `Grupo: ${artist.name}`,
                            () => this.#library.getArtistTracks(artist.id)
                        )
                    })),
                    {
                        label: "Regenerar sugerencias",
                        icon: "↻",
                        action: () => this.#regenerateSuggestions("artist"),
                        keepOpenAfterAction: true
                    }
                ],
                action: () => this.#replaceWithRandomList(
                    "artist",
                    "Grupo aleatorio",
                    () => this.#getRandomArtistTracks()
                )
            },
            {
                label: "Disco aleatorio",
                icon: "💿",
                disabled: this.#library.albumCount === 0,
                children: [
                    ...this.#albumSuggestions.map(album => ({
                        label: album.artist
                            ? `${album.title} — ${album.artist}`
                            : album.title,
                        icon: "💿",
                        action: () => this.#replaceWithRandomList(
                            "album",
                            `Disco: ${album.title}`,
                            () => this.#library.getAlbumTracks(album.id)
                        )
                    })),
                    {
                        label: "Regenerar sugerencias",
                        icon: "↻",
                        action: () => this.#regenerateSuggestions("album"),
                        keepOpenAfterAction: true
                    }
                ],
                action: () => this.#replaceWithRandomList(
                    "album",
                    "Disco aleatorio",
                    () => this.#getRandomAlbumTracks()
                )
            },
            {
                label: "50 canciones aleatorias",
                icon: "🎵",
                disabled: this.#library.trackCount === 0,
                action: () => this.#replaceWithRandomList(
                    "tracks50",
                    "50 canciones aleatorias",
                    () => this.#getRandomTracks()
                )
            }
        ];
    }

    #refreshSuggestions() {
        this.#artistSuggestions = this.#pickSuggestions(
            this.#library.artists
        );
        this.#albumSuggestions = this.#pickSuggestions(
            this.#library.albums
        );
    }

    #pickSuggestions(items) {
        const shuffled = [...items];

        for (let index = shuffled.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[randomIndex]] =
                [shuffled[randomIndex], shuffled[index]];
        }

        return shuffled.slice(0, 5);
    }

    #regenerateSuggestions(type) {
        if (type === "artist") {
            this.#artistSuggestions = this.#pickSuggestions(
                this.#library.artists
            );
        }
        else {
            this.#albumSuggestions = this.#pickSuggestions(
                this.#library.albums
            );
        }

        this.#generateMenu.setItems(
            this.#getGenerateMenuItems(),
            type === "artist" ? 0 : 1
        );
    }

    #getRandomArtistTracks() {
        const artist = this.#library.randomArtist();

        return artist
            ? this.#library.getArtistTracks(artist.id)
            : [];
    }

    #getRandomAlbumTracks() {
        const album = this.#library.randomAlbum();

        return album
            ? this.#library.getAlbumTracks(album.id)
            : [];
    }

    #getRandomTracks() {
        const tracks = [...this.#library.tracks];

        for (let index = tracks.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [tracks[index], tracks[randomIndex]] =
                [tracks[randomIndex], tracks[index]];
        }

        return tracks.slice(0, 50);
    }

    async #replaceWithRandomList(mode, label, factory) {
        try {
            const tracks = await factory();

            if (!tracks.length) {
                throw new Error(
                    `No hay canciones para generar: ${label}.`
                );
            }

            await this.#player.playQueue(tracks);
            this.#player.dispatchEvent(new CustomEvent(
                "randomlistgenerated",
                { detail: { mode, label } }
            ));
        }
        catch (error) {
            console.error(
                `QueuePanel: no se pudo generar la lista de ${label}`,
                error
            );
            window.alert(
                `No se pudo generar la lista de ${label}: ${String(error)}`
            );
        }
    }

    setQueue(queue) {

        this.#queue = queue;

        this.render();
    }

    render() {

        this.#container.innerHTML = "";

        if (!this.#queue?.items?.length) {
            const emptyMessage = document.createElement("div");
            emptyMessage.className = "queue-empty";
            emptyMessage.textContent = "La cola está vacía";
            this.#container.appendChild(emptyMessage);
            return;
        }

        this.#queue.orderedItems.forEach((queueItem, index) => {

            const element = document.createElement("div");

            element.className = "queue-item";
            element.dataset.queueId = queueItem.queueId;

            if (queueItem.queueId === this.#currentQueueId) {
                element.classList.add("active");
            }

            const queueIndex = document.createElement("div");
            queueIndex.className = "queue-index";
            queueIndex.textContent = String(index + 1);

            const main = document.createElement("div");
            main.className = "queue-main";

            const title = document.createElement("div");
            title.className = "queue-title";
            title.textContent = queueItem.track.title ?? "";

            const subtitle = document.createElement("div");
            subtitle.className = "queue-subtitle";
            subtitle.textContent = queueItem.track.artist ?? "";

            main.append(title, subtitle);
            element.append(queueIndex, main);

            // Evento click del item de la lista
            element.addEventListener("click", async () => {
                await this.#player.playQueueItem(
                    queueItem.queueId
                );
                this.select(queueItem.queueId);
            });            

            this.#container.appendChild(element);
        });
    }

    refresh() {

        this.render();
    }

    clear() {

        this.#container.innerHTML = "";
    }

    select(queueId) {

        this.#container
            .querySelector(".queue-item.active")
            ?.classList.remove("active");

        const element =
            this.#container.querySelector(
                `[data-queue-id="${queueId}"]`
            );

        if (element) {
            element.classList.add("active");
        }

        this.#currentQueueId = queueId;
    }

    setCurrentTrack(queueId) {

        this.select(queueId);

        const element =
            this.#container.querySelector(
                `[data-queue-id="${queueId}"]`
            );

        if (element) {

            element.scrollIntoView({
                block: "nearest",
                behavior: "smooth"
            });
        }
    }

    findElement(queueId) {

        return this.#container.querySelector(
            `[data-queue-id="${queueId}"]`
        );
    }

    getCurrentQueueId() {

        return this.#currentQueueId;
    }
 
}