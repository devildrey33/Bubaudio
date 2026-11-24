const LEVELS = [

    // Bandas generales
    { key: "volume",    label: "Volumen" },
    { key: "bass",      label: "Graves" },
    { key: "mid",       label: "Medios" },
    { key: "treble",    label: "Agudos" },
    // Detector de transitorios original
    { key: "beat",      label: "▼ Graves" },
    { key: "midBeat",   label: "▼ Medios" },
    { key: "trebleBeat",label: "▼ Agudos" },
    // Picos
    { key: "bassPeak",  label: "▲ Graves" },
    { key: "midPeak",   label: "▲ Medios" },
    { key: "treblePeak",label: "▲ Agudos" },


    // Bandas musicales
    { key: "kick",      label: "Bombo" },
    { key: "snare",     label: "Caja" },
    { key: "voice",     label: "Voz" },
    { key: "hihat",     label: "Charles" },

    // Picos instantáneos
    { key: "kickPeak",  label: "▲ Bombo" },
    { key: "snarePeak", label: "▲ Caja" },
    { key: "voicePeak", label: "▲ Voz" },
    { key: "hihatPeak", label: "▲ Charles" },

    { key: "flux"    , label: "Flux" },
    { key: "centroid", label: "Centroid" }
];


export default class AudioDebugPanel {

    #audio;
    #container;
    #levels = new Map();
    #animationFrame = null;
    #fpsValue;
    #bpmValue;
    #lastFrameTime = null;
    #fps = 0;
    #collapsed = false
    #toggleButton;
    #content;

    constructor(audio) {

        this.#audio = audio;
        this.#container = document.createElement("section");
        this.#container.className = "audio-debug-panel";
        this.#container.setAttribute("aria-label", "Depuración de audio");

        const title = document.createElement("div");
        title.className = "audio-debug-title";

        const leftSide = document.createElement("div");
        leftSide.className = "audio-debug-header-left";

        this.#toggleButton = document.createElement("button");
        this.#toggleButton.className = "audio-debug-toggle";
        this.#toggleButton.textContent = "▼";

        this.#toggleButton.addEventListener("click", () => this.#toggle());

        const titleText = document.createElement("span");
        titleText.textContent = "Niveles de audio";

        this.#bpmValue = document.createElement("span");
        this.#bpmValue.className = "audio-debug-fps-value";
        this.#bpmValue.textContent = "--";

        const bpmLabel = document.createElement("span");
        bpmLabel.className = "audio-debug-fps-label";
        bpmLabel.textContent = " BPM";


        leftSide.append(
            this.#toggleButton,
            titleText,
            this.#bpmValue,
            bpmLabel
        );

/*        leftSide.append(
            this.#toggleButton,
            titleText
        );*/

        const fpsContainer = document.createElement("span");
        fpsContainer.className = "audio-debug-fps";

        this.#fpsValue = document.createElement("span");
        this.#fpsValue.className = "audio-debug-fps-value";
        this.#fpsValue.textContent = "--";

        const fpsLabel = document.createElement("span");
        fpsLabel.className = "audio-debug-fps-label";
        fpsLabel.textContent = " fps";

        fpsContainer.append(
            this.#fpsValue,
            fpsLabel
        );

        title.append(
            leftSide,
            fpsContainer
        );

        this.#container.appendChild(title);

        this.#content = document.createElement("div");
        this.#content.className = "audio-debug-content";

        for (const level of LEVELS) {
            this.#content.appendChild(
                this.#createLevelRow(level)
            );
        }

        this.#container.appendChild(this.#content);
        

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

    #toggle() {
        this.#collapsed = !this.#collapsed;
        this.#toggleButton.textContent = this.#collapsed ? "►" : "▼";
        this.#content.classList.toggle("collapsed", this.#collapsed);
    }

    #update(time = performance.now()) {
        for (const level of LEVELS) {
            const value = Math.max(0, Math.min(1, this.#audio[level.key]));
            const percent = Math.round(value * 100);
            const elements = this.#levels.get(level.key);

            elements.fill.style.width = `${percent}%`;
            elements.value.textContent = `${percent}%`;
            elements.meter.setAttribute("aria-valuenow", String(percent));
            if (level.key === "centroid") {
                const hue = 240 - (value * 240);
                elements.fill.style.background = `hsl(${hue}deg 100% 50%)`;
            }
        }

        // BPM
        const bpm = Math.round(this.#audio.bpm);
        this.#bpmValue.textContent = bpm > 0 ? bpm : "--";
        // Mismo degradado que los FPS
        const bpmNormalized = Math.max(0, Math.min(1, (bpm - 60) / 140));
        const bpmHue = bpmNormalized * 120;
        this.#bpmValue.style.color = `hsl(${bpmHue}deg 100% 50%)`;

        // FPS
        if (this.#lastFrameTime !== null) {
            const frameDuration = time - this.#lastFrameTime;
            if (frameDuration > 0) {
                const currentFps = 1000 / frameDuration;
                this.#fps += (currentFps - this.#fps) * 0.2;
                const fps = Math.round(this.#fps);

                this.#fpsValue.textContent = fps;

                const fpsNormalized = Math.max(0, Math.min(1, (fps - 10) / 50));
                const hue = fpsNormalized * 120;

                this.#fpsValue.style.color = `hsl(${hue}deg 100% 50%)`;
            }
        }

        this.#lastFrameTime = time;
        this.#animationFrame = requestAnimationFrame((frameTime) => this.#update(frameTime));
    }
}
