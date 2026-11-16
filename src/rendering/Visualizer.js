/*
 * BubAudio
 * Copyright (c) 2026 devildrey33
 *
 * This Source Code Form is subject to the terms of the
 * Mozilla Public License, v. 2.0.
 *
 * If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/
 */

import * as THREE from "three";
import shaders from "../shaders";

/**
 * Renderiza un shader GLSL a pantalla completa y le proporciona muestras y
 * niveles del AudioAnalyzer. Three.js administra la escena WebGL; el bucle de
 * animación actualiza las texturas/uniforms y vuelve a dibujar cada frame.
 */
export default class Visualizer {

    // AudioAnalyzer asociado: proporciona los datos de audio en cada frame.
    #audio;

    // Escena con el quad de pantalla completa.
    #scene;

    // Cámara ortográfica que encuadra el quad de -1 a 1.
    #camera;

    // Renderer cuyo canvas se inserta en document.body.
    #renderer;

    // Valores compartidos con el shader actualmente seleccionado.
    #uniforms;

    // Plano de 2x2 unidades que cubre todo el encuadre ortográfico.
    #geometry;

    // Material que combina los uniforms con los shaders de vértices y fragmentos.
    #material;

    // Malla de pantalla completa añadida a la escena.
    #mesh;

    // Textura 1D (representada como 1024x1) con datos del espectro.
    #fftTexture;

    // Textura 1D con muestras de la forma de onda temporal.
    #waveformTexture;

    // Contador incremental enviado al shader; no es una medida de tiempo.
    #frame = 0;

    // Índice en shaders.shaders del fragment shader activo.
    #shaderIndex = 0;


    /**
     * Construye la escena, texturas, uniforms y material, e instala el listener
     * de redimensionamiento. El render loop se inicia por separado con start().
     *
     * @param {AudioAnalyzer} audio Analizador que alimentará el visualizador.
     */
    constructor(audio) {

        this.#audio = audio;

        this.#createScene();

        this.#createTextures();

        this.#createUniforms();

        this.#createMaterial();

        this.#registerEvents();
    }


    /**
     * Crea la escena, la cámara ortográfica y el renderer WebGL, y agrega el
     * canvas al documento. Las coordenadas de la cámara y el tamaño del plano
     * permiten dibujar un único quad sobre toda la ventana.
     *
     * @private
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

        // El renderer crea y posee este canvas; la clase lo expone mediante
        // canvas para que otras partes de la aplicación puedan consultarlo.
        document.body.appendChild(
            this.#renderer.domElement
        );
    }


    /**
     * Crea texturas de una fila con un canal rojo de 8 bits. Se reservan 1024
     * texeles; en cada frame #animate copia las muestras disponibles, hasta
     * un máximo de 1024.
     *
     * @private
     */
    #createTextures() {

        // DataTexture conserva un buffer CPU que puede actualizarse sin crear
        // una textura nueva en cada frame.
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
     * Inicializa los uniforms consumidos por los shaders del proyecto. Los
     * valores escalares parten de cero; las texturas y la resolución se
     * comparten como objetos de Three.js y se actualizan durante el render.
     *
     * @private
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

            uMidBeat : {
                value : 0
            },

            uTrebleBeat : {
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
     * Crea el plano de pantalla completa, el ShaderMaterial y la malla que se
     * renderizará. El vertex shader es común a los shaders del catálogo; el
     * fragment shader inicial corresponde al índice 0.
     *
     * @private
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
     * Registra el listener global que actualiza renderer y uniform de
     * resolución al cambiar el tamaño de la ventana.
     *
     * @private
     */
    #registerEvents() {

        window.addEventListener(
            "resize",
            () => this.#onResize()
        );
    }


    /**
     * Sincroniza las dimensiones de salida de Three.js y el uniform uResolution
     * con el tamaño CSS actual de la ventana.
     *
     * @private
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
     * Solicita el primer frame del bucle de renderizado. Cada llamada adicional
     * a start() inicia otro bucle independiente; este método no comprueba si ya
     * hay uno activo ni ofrece una operación de parada.
     */
    start() {

        requestAnimationFrame(
            this.#animate.bind(this)
        );
    }


    /**
     * Actualiza una muestra del AudioAnalyzer, copia hasta 1024 bytes de cada
     * buffer al contenido de las texturas, actualiza tiempo/frame/niveles y
     * dibuja la escena. Al final solicita el siguiente frame, manteniendo el
     * bucle activo.
     *
     * El timestamp recibido por requestAnimationFrame se convierte de
     * milisegundos a segundos para uTime; #frame avanza una unidad por dibujo.
     *
     * @param {number} time Timestamp de requestAnimationFrame en milisegundos.
     * @private
     */
    #animate(time) {

        // AudioAnalyzer reutiliza sus TypedArrays; se copian sus primeras 1024
        // muestras a buffers persistentes de DataTexture antes de subirlos a GPU.
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

        // Los uniforms escalares se actualizan en el mismo frame que las
        // texturas para que el shader lea una instantánea coherente del audio.
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

        this.#uniforms.uMidBeat.value =
            this.#audio.midBeat;

        this.#uniforms.uTrebleBeat.value =
            this.#audio.trebleBeat;

        this.#renderer.render(
            this.#scene,
            this.#camera
        );

        requestAnimationFrame(
            this.#animate.bind(this)
        );
    }


    /**
     * Selecciona un fragment shader del catálogo por índice. Los índices fuera
     * por debajo de cero o iguales/mayores al tamaño del catálogo se ignoran;
     * al cambiarlo se marca el material para que Three.js vuelva a compilar el
     * programa GLSL en el siguiente render.
     *
     * @param {number} index Índice del shader que se activará.
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
     * Activa el shader que sigue en el catálogo, volviendo al primero después
     * del último.
     */
    nextShader() {

        let index = this.#shaderIndex + 1;

        if (index >= shaders.shaders.length) {
            index = 0;
        }

        this.setShader(index);
    }


    /**
     * Activa el shader anterior en el catálogo, pasando al último desde el
     * primero.
     */
    previousShader() {

        let index = this.#shaderIndex - 1;

        if (index < 0) {
            index = shaders.shaders.length - 1;
        }

        this.setShader(index);
    }


    /**
     * Nombre descriptivo asociado al shader seleccionado.
     */
    get shaderName() {
        return shaders.shaders[this.#shaderIndex].name;
    }


    /**
     * Posición del shader seleccionado dentro de shaders.shaders.
     */
    get shaderIndex() {
        return this.#shaderIndex;
    }


    /**
     * Devuelve el objeto mutable de uniforms de Three.js. Puede utilizarse
     * para inspeccionar o ajustar valores, pero los valores ligados al audio y
     * la resolución se sobrescriben durante #animate o #onResize.
     */
    get uniforms() {
        return this.#uniforms;
    }


    /**
     * Canvas HTML creado por WebGLRenderer e insertado en document.body.
     */
    get canvas() {
        return this.#renderer.domElement;
    }
}