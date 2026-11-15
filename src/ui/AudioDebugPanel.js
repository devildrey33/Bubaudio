const LEVELS = [
    { key: "bass", label: "Graves" },
    { key: "beat", label: "Beat G" },
    { key: "mid", label: "Medios" },
    { key: "midBeat", label: "Beat M" },
    { key: "treble", label: "Agudos" },
    { key: "trebleBeat", label: "Beat A" },
    { key: "volume", label: "Volumen" }
];


export default class AudioDebugPanel {

    #audio;
    #container;
    #levels = new Map();
    #animationFrame = null;
    #fpsValue;
    #lastFrameTime = null;
    #fps = 0;

    constructor(audio) {

        this.#audio = audio;
        this.#container = document.createElement("section");
        this.#container.className = "audio-debug-panel";
        this.#container.setAttribute("aria-label", "Depuración de audio");

        const title = document.createElement("div");
        title.className = "audio-debug-title";
        title.textContent = "Niveles de audio";
        this.#container.appendChild(title);

        for (const level of LEVELS) {
            this.#container.appendChild(
                this.#createLevelRow(level)
            );
        }

        this.#container.appendChild(
            this.#createFpsRow()
        );

        document.body.appendChild(this.#container);
        this.#update();
    }


    destroy() {
        if (this.#animationFrame !== null) {
            cancelAnimationFrame(this.#animationFrame);
        }

        this.#container.remove();
    }


    #createLevelRow(level) {

        const row = document.createElement("div");
        row.className = "audio-debug-row";

        const label = document.createElement("span");
        label.className = "audio-debug-label";
        label.textContent = level.label;

        const meter = document.createElement("div");
        meter.className = "audio-debug-meter";
        meter.setAttribute("role", "meter");
        meter.setAttribute("aria-label", level.label);
        meter.setAttribute("aria-valuemin", "0");
        meter.setAttribute("aria-valuemax", "100");

        const fill = document.createElement("div");
        fill.className = "audio-debug-meter-fill";
        meter.appendChild(fill);

        const value = document.createElement("span");
        value.className = "audio-debug-value";
        value.textContent = "0%";

        row.append(label, meter, value);
        this.#levels.set(level.key, { fill, meter, value });

        return row;
    }

    #createFpsRow() {

        const row = document.createElement("div");
        row.className = "audio-debug-stat";

        const label = document.createElement("span");
        label.className = "audio-debug-label";
        label.textContent = "FPS";

        this.#fpsValue = document.createElement("span");
        this.#fpsValue.className = "audio-debug-value";
        this.#fpsValue.textContent = "--";

        row.append(label, this.#fpsValue);

        return row;
    }


    #update(time = performance.now()) {

        for (const level of LEVELS) {
            const value = Math.max(
                0,
                Math.min(1, this.#audio[level.key])
            );
            const percent = Math.round(value * 100);
            const elements = this.#levels.get(level.key);

            elements.fill.style.width = `${percent}%`;
            elements.value.textContent = `${percent}%`;
            elements.meter.setAttribute("aria-valuenow", String(percent));
        }

        if (this.#lastFrameTime !== null) {
            const frameDuration = time - this.#lastFrameTime;

            if (frameDuration > 0) {
                const currentFps = 1000 / frameDuration;
                this.#fps += (currentFps - this.#fps) * 0.2;
                this.#fpsValue.textContent = String(Math.round(this.#fps));
            }
        }

        this.#lastFrameTime = time;
        this.#animationFrame = requestAnimationFrame(
            (frameTime) => this.#update(frameTime)
        );
    }
}
