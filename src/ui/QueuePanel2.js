import ContextMenu from "./ContextMenu.js";

export default class QueuePanel {

    #container;
    #queue;
    #player;
    #library;
    #currentQueueId = null;
    #selectedQueueIds = new Set();
    #focusedQueueId = null;
    #selectionAnchorQueueId = null;
    #draggedQueueIds = [];
    #dropTargetQueueId = null;
    #dropPosition = null;
    #dragPointer = null;
    #suppressNextClick = false;
    #generateButton;
    #generateMenu;
    #saveButton;
    #saveDialog;
    #saveForm;
    #saveNameInput;
    #saveStatus;
    #saveCancelButton;
    #onSavePlaylist;
    #artistSuggestions = [];
    #albumSuggestions = [];

    constructor(player, library, options = {}) {

        this.#player = player;
        this.#library = library;
        const config = typeof options === "string"
            ? { containerId: options }
            : options;
        this.#onSavePlaylist = config.onSavePlaylist ?? null;
        const containerId = config.containerId ?? "queue-list";
        this.#container = document.getElementById(containerId);

        if (!this.#container) {
            throw new Error(
                `QueuePanel: no se encontró el contenedor '${containerId}'`
            );
        }

        this.#generateButton = document.getElementById(
            "queue-generate-button"
        );
        this.#saveButton = document.getElementById(
            "queue-save-button"
        );
        this.#saveDialog = document.getElementById(
            "playlist-save-dialog"
        );
        this.#saveForm = document.getElementById(
            "playlist-save-form"
        );
        this.#saveNameInput = document.getElementById(
            "playlist-save-name"
        );
        this.#saveStatus = document.getElementById(
            "playlist-save-status"
        );
        this.#saveCancelButton = document.getElementById(
            "playlist-save-cancel"
        );

        if (!this.#generateButton) {
            throw new Error(
                "QueuePanel: no se encontró el botón para generar listas"
            );
        }
        if (
            !this.#saveButton ||
            !this.#saveDialog ||
            !this.#saveForm ||
            !this.#saveNameInput ||
            !this.#saveStatus ||
            !this.#saveCancelButton
        ) {
            throw new Error(
                "QueuePanel: no se encontró el formulario para guardar listas"
            );
        }

        this.#generateMenu = new ContextMenu();
        this.#generateButton.addEventListener("click", () => {
            this.#openGenerateMenu();
        });
        this.#saveButton.addEventListener("click", () => {
            this.#openSavePlaylistDialog();
        });
        this.#saveForm.addEventListener("submit", event => {
            this.#savePlaylist(event);
        });
        this.#saveCancelButton.addEventListener("click", () => {
            this.#saveDialog.close();
        });
        this.#container.addEventListener(
            "keydown",
            event => this.#onKeyDown(event)
        );
        this.#container.addEventListener("pointerdown", event => {
            this.#onPointerDown(event);
        });
        window.addEventListener("pointermove", event => {
            this.#onPointerMove(event);
        });
        window.addEventListener("pointerup", event => {
            this.#onPointerUp(event);
        });
        window.addEventListener("pointercancel", event => {
            this.#onPointerCancel(event);
        });

        this.setQueue(this.#player.queue);
    }

    #openSavePlaylistDialog() {
        if (
            !this.#onSavePlaylist ||
            this.#queue.items.length === 0
        ) {
            return;
        }

        this.#saveStatus.textContent = "";
        this.#saveNameInput.value = "";
        this.#saveDialog.showModal();
        this.#saveNameInput.focus();
    }

    async #savePlaylist(event) {
        event.preventDefault();
        const name = this.#saveNameInput.value.trim();

        if (!name) {
            this.#saveStatus.textContent =
                "Escribe un nombre para la lista.";
            this.#saveNameInput.focus();
            return;
        }

        const submitButton = this.#saveForm.querySelector(
            'button[type="submit"]'
        );
        submitButton.disabled = true;

        try {
            await this.#onSavePlaylist(name);
            this.#saveDialog.close();
            this.#saveNameInput.value = "";
        }
        catch (error) {
            console.error(
                "QueuePanel: no se pudo guardar la lista",
                error
            );
            this.#saveStatus.textContent =
                `No se pudo guardar la lista: ${String(error)}`;
        }
        finally {
            submitButton.disabled = false;
        }
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
        this.#currentQueueId = queue.currentQueueId;

        this.render();
    }

    render() {

        this.#container.innerHTML = "";

        if (!this.#queue?.items?.length) {
            this.#selectedQueueIds.clear();
            this.#focusedQueueId = null;
            this.#selectionAnchorQueueId = null;
            this.#currentQueueId = null;
            this.#container.removeAttribute("aria-activedescendant");
            this.#updateSaveButton();

            const emptyMessage = document.createElement("div");
            emptyMessage.className = "queue-empty";
            emptyMessage.textContent = "La cola está vacía";
            this.#container.appendChild(emptyMessage);
            return;
        }

        const orderedItems = this.#queue.orderedItems;
        const validQueueIds = new Set(
            orderedItems.map(item => item.queueId)
        );
        this.#selectedQueueIds = new Set(
            [...this.#selectedQueueIds].filter(queueId =>
                validQueueIds.has(queueId)
            )
        );

        if (!validQueueIds.has(this.#currentQueueId)) {
            this.#currentQueueId = null;
        }
        if (!validQueueIds.has(this.#focusedQueueId)) {
            this.#focusedQueueId = validQueueIds.has(this.#currentQueueId)
                ? this.#currentQueueId
                : orderedItems[0].queueId;
        }
        if (!validQueueIds.has(this.#selectionAnchorQueueId)) {
            this.#selectionAnchorQueueId = this.#focusedQueueId;
        }

        orderedItems.forEach((queueItem, index) => {

            const element = document.createElement("div");

            element.className = "queue-item";
            element.dataset.queueId = queueItem.queueId;
            element.id = `queue-item-${index}`;
            element.setAttribute("role", "option");

            if (queueItem.queueId === this.#currentQueueId) {
                element.classList.add("active");
            }
            if (this.#selectedQueueIds.has(queueItem.queueId)) {
                element.classList.add("selected");
                element.setAttribute("aria-selected", "true");
            }
            else {
                element.setAttribute("aria-selected", "false");
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

            element.addEventListener("click", event => {
                if (this.#suppressNextClick) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.#suppressNextClick = false;
                    return;
                }
                this.#selectQueueItem(queueItem.queueId, event);
            });
            element.addEventListener("dblclick", () => {
                this.#playQueueItem(queueItem.queueId);
            });

            this.#container.appendChild(element);
        });

        this.#updateFocusedItem();
        this.#updateSaveButton();
    }

    #selectQueueItem(queueId, event) {
        const isAdditive = event.ctrlKey || event.metaKey;

        this.#focusedQueueId = queueId;

        if (event.shiftKey) {
            this.#selectRange(
                queueId,
                isAdditive,
                this.#selectionAnchorQueueId ?? queueId
            );
        }
        else if (isAdditive) {
            if (this.#selectedQueueIds.has(queueId)) {
                this.#selectedQueueIds.delete(queueId);
            }
            else {
                this.#selectedQueueIds.add(queueId);
            }
            this.#selectionAnchorQueueId = queueId;
        }
        else {
            this.#selectedQueueIds = new Set([queueId]);
            this.#selectionAnchorQueueId = queueId;
        }

        this.#container.focus({ preventScroll: true });
        this.#updateFocusedItem();
    }

    #selectRange(queueId, isAdditive, anchorQueueId) {
        const queueIds = this.#getOrderedQueueIds();
        const targetIndex = queueIds.indexOf(queueId);
        let anchorIndex = queueIds.indexOf(anchorQueueId);

        if (targetIndex === -1) {
            return;
        }

        if (anchorIndex === -1) {
            anchorIndex = targetIndex;
        }
        if (!isAdditive) {
            this.#selectedQueueIds.clear();
        }

        const firstIndex = Math.min(anchorIndex, targetIndex);
        const lastIndex = Math.max(anchorIndex, targetIndex);
        for (let index = firstIndex; index <= lastIndex; index++) {
            this.#selectedQueueIds.add(queueIds[index]);
        }
    }

    #onKeyDown(event) {
        if (event.key === "Delete") {
            if (this.#selectedQueueIds.size > 0) {
                event.preventDefault();
                this.#removeSelectedQueueItems();
            }
            return;
        }

        const isAdditive = event.ctrlKey || event.metaKey;
        if (isAdditive && event.key.toLowerCase() === "a") {
            event.preventDefault();
            this.#selectedQueueIds = new Set(
                this.#getOrderedQueueIds()
            );
            this.#selectionAnchorQueueId =
                this.#focusedQueueId ?? this.#getOrderedQueueIds()[0] ?? null;
            this.#updateFocusedItem();
            return;
        }

        if (isAdditive && event.key === " ") {
            event.preventDefault();
            if (this.#focusedQueueId) {
                if (this.#selectedQueueIds.has(this.#focusedQueueId)) {
                    this.#selectedQueueIds.delete(this.#focusedQueueId);
                }
                else {
                    this.#selectedQueueIds.add(this.#focusedQueueId);
                }
                this.#selectionAnchorQueueId = this.#focusedQueueId;
                this.#updateFocusedItem();
            }
            return;
        }

        if (event.key === "Escape" && this.#selectedQueueIds.size > 0) {
            event.preventDefault();
            this.#selectedQueueIds.clear();
            this.#updateFocusedItem();
            return;
        }

        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
            return;
        }

        const queueIds = this.#getOrderedQueueIds();
        if (queueIds.length === 0) {
            return;
        }

        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const focusedIndex = queueIds.indexOf(this.#focusedQueueId);
        const startIndex = focusedIndex === -1
            ? (direction > 0 ? -1 : queueIds.length)
            : focusedIndex;
        const nextIndex = Math.max(
            0,
            Math.min(queueIds.length - 1, startIndex + direction)
        );
        this.#focusedQueueId = queueIds[nextIndex];

        if (event.shiftKey) {
            this.#selectRange(
                this.#focusedQueueId,
                isAdditive,
                this.#selectionAnchorQueueId ?? queueIds[nextIndex]
            );
        }
        else if (!isAdditive) {
            this.#selectedQueueIds = new Set([this.#focusedQueueId]);
            this.#selectionAnchorQueueId = this.#focusedQueueId;
        }

        this.#updateFocusedItem();
    }

    #getOrderedQueueIds() {
        return this.#queue.orderedItems.map(item => item.queueId);
    }

    #updateFocusedItem() {
        for (const element of this.#container.querySelectorAll(".queue-item")) {
            const queueId = element.dataset.queueId;
            const selected = this.#selectedQueueIds.has(queueId);

            element.classList.toggle("selected", selected);
            element.classList.toggle(
                "focused",
                queueId === this.#focusedQueueId
            );
            element.setAttribute("aria-selected", String(selected));
        }

        const focusedIndex = this.#getOrderedQueueIds().indexOf(
            this.#focusedQueueId
        );
        const focusedElement = focusedIndex === -1
            ? null
            : this.#container.querySelector(
                `#queue-item-${focusedIndex}`
            );

        if (!focusedElement) {
            this.#container.removeAttribute("aria-activedescendant");
            return;
        }

        this.#container.setAttribute(
            "aria-activedescendant",
            focusedElement.id
        );
        focusedElement.scrollIntoView({ block: "nearest" });
    }

    async #playQueueItem(queueId) {
        try {
            await this.#player.playQueueItem(queueId);
        }
        catch (error) {
            console.error(
                "QueuePanel: no se pudo reproducir la canción seleccionada",
                error
            );
            window.alert(
                `No se pudo reproducir la canción: ${String(error)}`
            );
        }
    }

    async #removeSelectedQueueItems() {
        try {
            await this.#player.removeQueueItems(
                [...this.#selectedQueueIds]
            );
        }
        catch (error) {
            console.error(
                "QueuePanel: no se pudieron eliminar las canciones seleccionadas",
                error
            );
            window.alert(
                `No se pudieron eliminar las canciones seleccionadas: ${String(error)}`
            );
        }
    }

    #updateSaveButton() {
        this.#saveButton.disabled = !this.#onSavePlaylist ||
            !this.#queue?.items?.length;
    }

    #onPointerDown(event) {
        if (event.button !== 0 || !event.isPrimary) {
            return;
        }

        const row = event.target instanceof Element
            ? event.target.closest(".queue-item")
            : null;
        const queueId = row?.dataset.queueId;

        if (!queueId) {
            return;
        }

        this.#dragPointer = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            sourceQueueId: queueId,
            started: false
        };
    }

    #onPointerMove(event) {
        const drag = this.#dragPointer;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }

        if (!drag.started) {
            const deltaX = event.clientX - drag.startX;
            const deltaY = event.clientY - drag.startY;
            if (deltaX * deltaX + deltaY * deltaY < 36) {
                return;
            }

            drag.started = true;
        }

        if (this.#draggedQueueIds.length === 0) {
            const queueId = drag.sourceQueueId;
            if (!this.#selectedQueueIds.has(queueId)) {
                this.#selectedQueueIds = new Set([queueId]);
                this.#focusedQueueId = queueId;
                this.#selectionAnchorQueueId = queueId;
                this.#updateFocusedItem();
            }

            this.#draggedQueueIds = this.#getOrderedQueueIds().filter(id =>
                this.#selectedQueueIds.has(id)
            );
            if (this.#draggedQueueIds.length === 0) {
                this.#dragPointer = null;
                return;
            }

            this.#container.focus({ preventScroll: true });
            this.#container.setPointerCapture(event.pointerId);
            this.#container.classList.add("is-dragging");
            for (const id of this.#draggedQueueIds) {
                this.findElement(id)?.classList.add("dragging");
            }
        }

        event.preventDefault();
        this.#updateDropTarget(event.clientX, event.clientY);
    }

    #onPointerUp(event) {
        const drag = this.#dragPointer;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }

        if (drag.started && this.#draggedQueueIds.length > 0) {
            event.preventDefault();
            this.#updateDropTarget(event.clientX, event.clientY);

            if (this.#dropPosition !== null) {
                const queueIds = this.#getOrderedQueueIds();
                const targetIndex = this.#dropTargetQueueId === null
                    ? queueIds.length
                    : queueIds.indexOf(this.#dropTargetQueueId);
                const destinationIndex = targetIndex +
                    (this.#dropPosition === "after" ? 1 : 0);

                if (targetIndex !== -1) {
                    this.#player.moveQueueItems(
                        this.#draggedQueueIds,
                        destinationIndex
                    );
                }
            }

            this.#suppressNextClick = true;
            setTimeout(() => {
                this.#suppressNextClick = false;
            }, 0);
            this.#clearDragState();
        }

        this.#dragPointer = null;
        if (this.#container.hasPointerCapture(event.pointerId)) {
            this.#container.releasePointerCapture(event.pointerId);
        }
    }

    #onPointerCancel(event) {
        if (this.#dragPointer?.pointerId !== event.pointerId) {
            return;
        }

        this.#dragPointer = null;
        this.#clearDragState();
        if (this.#container.hasPointerCapture(event.pointerId)) {
            this.#container.releasePointerCapture(event.pointerId);
        }
    }

    #updateDropTarget(clientX, clientY) {
        this.#clearDropIndicator();

        const element = document.elementFromPoint(clientX, clientY);
        const row = element instanceof Element
            ? element.closest(".queue-item")
            : null;
        const bounds = this.#container.getBoundingClientRect();
        const isInsideContainer = clientX >= bounds.left &&
            clientX <= bounds.right &&
            clientY >= bounds.top &&
            clientY <= bounds.bottom;

        if (!isInsideContainer) {
            return;
        }

        const targetQueueId = row?.dataset.queueId ?? null;
        if (
            targetQueueId !== null &&
            this.#draggedQueueIds.includes(targetQueueId)
        ) {
            return;
        }

        if (!row) {
            this.#dropPosition = "after";
            this.#container.classList.add("drop-at-end");
            return;
        }

        const rowBounds = row.getBoundingClientRect();
        this.#dropTargetQueueId = targetQueueId;
        this.#dropPosition = clientY < rowBounds.top + rowBounds.height / 2
            ? "before"
            : "after";
        row.classList.add(
            this.#dropPosition === "before"
                ? "drop-before"
                : "drop-after"
        );
    }

    #clearDropIndicator() {
        this.#container
            .querySelectorAll(".drop-before, .drop-after")
            .forEach(element => {
                element.classList.remove("drop-before", "drop-after");
            });
        this.#container.classList.remove("drop-at-end");
        this.#dropTargetQueueId = null;
        this.#dropPosition = null;
    }

    #clearDragState() {
        this.#clearDropIndicator();
        this.#container.classList.remove("is-dragging");
        this.#container
            .querySelectorAll(".dragging")
            .forEach(element => element.classList.remove("dragging"));
        this.#draggedQueueIds = [];
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