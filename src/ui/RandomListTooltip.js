export default class RandomListTooltip {

    #element;
    #label;
    #hideTimer = null;

    constructor() {
        this.#element = document.getElementById("random-list-tooltip");
        this.#label = document.getElementById("random-list-tooltip-label");

        if (!this.#element || !this.#label) {
            throw new Error(
                "RandomListTooltip: no se encontró el elemento del tooltip"
            );
        }
    }

    show(label) {
        if (!label) {
            return;
        }

        clearTimeout(this.#hideTimer);
        this.#label.textContent = label;
        this.#element.classList.add("visible");
        this.#hideTimer = setTimeout(() => this.hide(), 5000);
    }

    hide() {
        clearTimeout(this.#hideTimer);
        this.#hideTimer = null;
        this.#element.classList.remove("visible");
    }
}
