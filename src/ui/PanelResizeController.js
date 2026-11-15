export default class PanelResizeController {

    #panel;
    #handle;
    #settings;
    #settingName;
    #cssVariable;
    #anchor;
    #minWidth;
    #maxWidth;
    #pointerId = null;
    #startX = 0;
    #startWidth = 0;
    #width = 0;

    constructor({
        panelId,
        handleId,
        settings,
        settingName,
        cssVariable,
        anchor,
        minWidth,
        maxWidth
    }) {
        this.#panel = document.getElementById(panelId);
        this.#handle = document.getElementById(handleId);
        this.#settings = settings;
        this.#settingName = settingName;
        this.#cssVariable = cssVariable;
        this.#anchor = anchor;
        this.#minWidth = minWidth;
        this.#maxWidth = maxWidth;

        if (
            !this.#panel ||
            !this.#handle ||
            !["left", "right"].includes(anchor) ||
            !Number.isInteger(settings[settingName])
        ) {
            throw new Error(
                `PanelResizeController: configuración no válida para '${panelId}'`
            );
        }

        this.#applyWidth(settings[settingName]);
        this.#handle.addEventListener(
            "pointerdown",
            event => this.#onPointerDown(event)
        );
        this.#handle.addEventListener(
            "pointermove",
            event => this.#onPointerMove(event)
        );
        this.#handle.addEventListener(
            "pointerup",
            event => this.#onPointerUp(event)
        );
        this.#handle.addEventListener(
            "pointercancel",
            event => this.#onPointerCancel(event)
        );
        this.#handle.addEventListener(
            "lostpointercapture",
            event => this.#onPointerCancel(event)
        );
        this.#handle.addEventListener(
            "keydown",
            event => this.#onKeyDown(event)
        );
    }

    #onPointerDown(event) {
        if (!event.isPrimary || event.button !== 0 || this.#pointerId !== null) {
            return;
        }

        event.preventDefault();
        this.#pointerId = event.pointerId;
        this.#startX = event.clientX;
        this.#startWidth = Math.round(
            this.#panel.getBoundingClientRect().width
        );
        this.#width = this.#startWidth;

        this.#panel.classList.add("is-resizing");
        document.documentElement.classList.add("panel-resizing");
        this.#handle.setPointerCapture(event.pointerId);
    }

    #onPointerMove(event) {
        if (event.pointerId !== this.#pointerId) {
            return;
        }

        const pointerDelta = this.#anchor === "right"
            ? event.clientX - this.#startX
            : this.#startX - event.clientX;
        this.#width = this.#clampWidth(
            this.#startWidth + pointerDelta
        );
        this.#applyWidth(this.#width);
    }

    #onPointerUp(event) {
        if (event.pointerId !== this.#pointerId) {
            return;
        }

        const width = this.#width;
        this.#stopResizing();

        if (width !== this.#settings[this.#settingName]) {
            try {
                this.#settings[this.#settingName] = width;
            }
            catch (error) {
                this.#applyWidth(this.#settings[this.#settingName]);
                console.error(
                    `No se pudo guardar el ancho del panel '${this.#panel.id}'`,
                    error
                );
            }
        }
    }

    #onPointerCancel(event) {
        if (event.pointerId !== this.#pointerId) {
            return;
        }

        this.#stopResizing();
        this.#applyWidth(this.#settings[this.#settingName]);
    }

    #onKeyDown(event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
        }

        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const anchorDirection = this.#anchor === "right" ? 1 : -1;
        const step = event.shiftKey ? 50 : 10;
        const width = this.#clampWidth(
            this.#panel.getBoundingClientRect().width +
            direction * anchorDirection * step
        );

        if (width === this.#settings[this.#settingName]) {
            return;
        }

        try {
            this.#settings[this.#settingName] = width;
            this.#applyWidth(width);
        }
        catch (error) {
            console.error(
                `No se pudo guardar el ancho del panel '${this.#panel.id}'`,
                error
            );
        }
    }

    #stopResizing() {
        const pointerId = this.#pointerId;
        this.#pointerId = null;
        this.#panel.classList.remove("is-resizing");
        document.documentElement.classList.remove("panel-resizing");

        if (this.#handle.hasPointerCapture(pointerId)) {
            this.#handle.releasePointerCapture(pointerId);
        }
    }

    #clampWidth(width) {
        const availableWidth = Math.max(
            this.#minWidth,
            window.innerWidth - 24
        );
        const maximum = Math.min(this.#maxWidth, availableWidth);

        return Math.max(
            this.#minWidth,
            Math.min(maximum, Math.round(width))
        );
    }

    #applyWidth(width) {
        this.#width = width;
        document.documentElement.style.setProperty(
            this.#cssVariable,
            `${width}px`
        );
        this.#handle.setAttribute("aria-valuenow", String(width));
    }
}
