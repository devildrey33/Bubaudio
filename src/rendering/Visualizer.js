import * as THREE from "three";
import shaders from "../shaders";

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

    // Shader actual
    #shaderIndex = 0;


    constructor(audio) {

        this.#audio = audio;

        this.#createScene();

        this.#createTextures();

        this.#createUniforms();

        this.#createMaterial();

        this.#registerEvents();
    }


    /**
     * Inicializa escena y renderer.
     */
    #createScene() {

        this.#scene = new THREE.Scene();

        this.#camera = new THREE.OrthographicCamera(
            -1,
            1,
            1,
            -1,
            0,
            1
        );

        this.#renderer = new THREE.WebGLRenderer({
            antialias : true
        });

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

        this.#waveformTexture = new THREE.DataTexture(
            new Uint8Array(1024),
            1024,
            1,
            THREE.RedFormat
        );

        this.#waveformTexture.needsUpdate = true;

        this.#fftTexture = new THREE.DataTexture(
            new Uint8Array(1024),
            1024,
            1,
            THREE.RedFormat
        );

        this.#fftTexture.needsUpdate = true;
    }


    /**
     * Uniforms globales.
     */
    #createUniforms() {

        this.#uniforms = {

            uTime : {
                value : 0
            },

            uFrame : {
                value : 0
            },

            uBass : {
                value : 0
            },

            uMid : {
                value : 0
            },

            uTreble : {
                value : 0
            },

            uVolume : {
                value : 0
            },

            uBeat : {
                value : 0
            },

            uWaveform : {
                value : this.#waveformTexture
            },

            uSpectrum : {
                value : this.#fftTexture
            },

            uResolution : {
                value : new THREE.Vector2(
                    window.innerWidth,
                    window.innerHeight
                )
            }
        };
    }


    /**
     * Crea material y quad.
     */
    #createMaterial() {

        this.#geometry = new THREE.PlaneGeometry(
            2,
            2
        );

        this.#material = new THREE.ShaderMaterial({

            uniforms : this.#uniforms,

            vertexShader :
                shaders.fullscreen,

            fragmentShader :
                shaders.shaders[this.#shaderIndex].fragment
        });

        this.#mesh = new THREE.Mesh(
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

        this.#waveformTexture.image.data.set(
            this.#audio.waveform.subarray(
                0,
                1024
            )
        );

        this.#waveformTexture.needsUpdate = true;

        this.#fftTexture.image.data.set(
            this.#audio.spectrum.subarray(
                0,
                1024
            )
        );

        this.#fftTexture.needsUpdate = true;

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
     * Cambia el shader por índice.
     */
    setShader(index = 0) {

        if (
            index < 0 ||
            index >= shaders.shaders.length
        ) {
            return;
        }

        this.#shaderIndex = index;

        this.#material.fragmentShader =
            shaders.shaders[index].fragment;

        this.#material.needsUpdate = true;

        console.log(
            "Shader:",
            shaders.shaders[index].name
        );
    }


    /**
     * Cambia al siguiente shader.
     */
    nextShader() {

        let index = this.#shaderIndex + 1;

        if (index >= shaders.shaders.length) {
            index = 0;
        }

        this.setShader(index);
    }


    /**
     * Cambia al shader anterior.
     */
    previousShader() {

        let index = this.#shaderIndex - 1;

        if (index < 0) {
            index = shaders.shaders.length - 1;
        }

        this.setShader(index);
    }


    /**
     * Nombre del shader actual.
     */
    get shaderName() {
        return shaders.shaders[this.#shaderIndex].name;
    }


    /**
     * Índice del shader actual.
     */
    get shaderIndex() {
        return this.#shaderIndex;
    }


    /**
     * Devuelve los uniforms.
     */
    get uniforms() {
        return this.#uniforms;
    }
}