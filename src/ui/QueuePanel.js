export default class QueuePanel {

    #container;
    #queue;
    #currentQueueId = null;

    constructor(containerId = "queue-list") {

        this.#container = document.getElementById(containerId);

        if (!this.#container) {
            throw new Error(
                `QueuePanel: no se encontró el contenedor '${containerId}'`
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
            return;
        }

        this.#queue.items.forEach((queueItem, index) => {

            const element = document.createElement("div");

            element.className = "queue-item";
            element.dataset.queueId = queueItem.queueId;

            if (queueItem.queueId === this.#currentQueueId) {
                element.classList.add("active");
            }

            element.innerHTML = `
                <div class="queue-index">
                    ${index + 1}
                </div>

                <div class="queue-main">

                    <div class="queue-title">
                        ${queueItem.track.title ?? ""}
                    </div>

                    <div class="queue-subtitle">
                        ${queueItem.track.artist ?? ""}
                    </div>

                </div>
            `;

            element.addEventListener("click", () => {

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