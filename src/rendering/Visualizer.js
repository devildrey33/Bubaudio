import * as THREE from "three";

export default class Visualizer {

    // AudioAnalyzer asociado
    #audio;

    // Escena principal
    #scene;

    // Cámara ortográfica fullscreen
    #camera;

    // Renderer WebGL
    #renderer;

    // Uniforms globales
    #uniforms;

    // Geometría fullscreen
    #geometry;

    // Material GLSL
    #material;

    // Quad fullscreen
    #mesh;

    // Textura FFT
    #fftTexture;

    // Textura Waveform
    #waveformTexture;

    // Contador de frames
    #frame = 0;


    constructor(audio, fragmentShader, vertexShader) {

        this.#audio = audio;

        this.#createScene();

        this.#createTextures();

        this.#createUniforms();

        this.#createMaterial(
            fragmentShader,
            vertexShader
        );

        this.#registerEvents();
    }


    /**
     * Inicializa escena y renderer.
     */
    #createScene() {

        this.#scene =
            new THREE.Scene();

        this.#camera =
            new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.#renderer = new THREE.WebGLRenderer({ antialias: true});

        this.#renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

        document.body.appendChild(
            this.#renderer.domElement
        );
    }


    /**
     * Crea las texturas de audio.
     */
    #createTextures() {

        this.#waveformTexture =
            new THREE.DataTexture(
                new Uint8Array(512),
                512,
                1,
                THREE.RedFormat
            );

        this.#waveformTexture.needsUpdate =
            true;

        this.#fftTexture =
            new THREE.DataTexture(
                new Uint8Array(512),
                512,
                1,
                THREE.RedFormat
            );

        this.#fftTexture.needsUpdate =
            true;
    }


    /**
     * Uniforms globales.
     */
    #createUniforms() {

        this.#uniforms = {

            uTime: {
                value: 0
            },

            uFrame: {
                value: 0
            },

            uBass: {
                value: 0
            },

            uMid: {
                value: 0
            },

            uTreble: {
                value: 0
            },

            uVolume: {
                value: 0
            },

            uBeat: {
                value: 0
            },

            uWaveform: {
                value:
                    this.#waveformTexture
            },

            uSpectrum: {
                value:
                    this.#fftTexture
            },

            uResolution: {
                value:
                    new THREE.Vector2(
                        window.innerWidth,
                        window.innerHeight
                    )
            }
        };
    }


    /**
     * Crea material y quad.
     */
    #createMaterial(
        fragmentShader,
        vertexShader
    ) {

        this.#geometry =
            new THREE.PlaneGeometry(
                2,
                2
            );

        this.#material =
            new THREE.ShaderMaterial({

                uniforms:
                    this.#uniforms,

                vertexShader,

                fragmentShader
            });

        this.#mesh =
            new THREE.Mesh(
                this.#geometry,
                this.#material
            );

        this.#scene.add(
            this.#mesh
        );
    }


    /**
     * Eventos globales.
     */
    #registerEvents() {

        window.addEventListener(
            "resize",
            () => this.#onResize()
        );
    }


    /**
     * Ajusta la resolución.
     */
    #onResize() {

        this.#renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

        this.#uniforms.uResolution.value.set(
            window.innerWidth,
            window.innerHeight
        );
    }


    /**
     * Arranca el render loop.
     */
    start() {

        requestAnimationFrame(
            this.#animate.bind(this)
        );
    }


    /**
     * Render loop principal.
     */
    #animate(time) {

        this.#audio.update();

        // Waveform completa
        this.#waveformTexture.image.data.set(
            this.#audio.waveform.subarray(
                0,
                512
            )
        );

        this.#waveformTexture.needsUpdate =
            true;

        // FFT completa
        this.#fftTexture.image.data.set(
            this.#audio.spectrum.subarray(
                0,
                512
            )
        );

        this.#fftTexture.needsUpdate =
            true;

        this.#uniforms.uTime.value =
            time * 0.001;

        this.#uniforms.uFrame.value =
            this.#frame++;

        this.#uniforms.uBass.value =
            this.#audio.bass;

        this.#uniforms.uMid.value =
            this.#audio.mid;

        this.#uniforms.uTreble.value =
            this.#audio.treble;

        this.#uniforms.uVolume.value =
            this.#audio.volume;

        this.#uniforms.uBeat.value =
            this.#audio.beat;

        this.#renderer.render(
            this.#scene,
            this.#camera
        );

        requestAnimationFrame(
            this.#animate.bind(this)
        );
    }


    /**
     * Cambia el fragment shader.
     */
    setShader(fragmentShader) {

        this.#material.fragmentShader =            fragmentShader;

        this.#material.needsUpdate =            true;
    }


    /**
     * Devuelve los uniforms.
     */
    get uniforms() {
        return this.#uniforms;
    }
}