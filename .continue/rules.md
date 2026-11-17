# Critical Rules

Before generating code:

- Search the project.
- Read the current implementation.
- Read related classes.
- Search references.

Never invent APIs.

Never invent methods.

Never assume object properties.

If uncertain, inspect the project first.

Preserve existing architecture.

Avoid introducing external dependencies.

Generate complete implementations.

All generated code must contain comments.






# BubAudio Architecture Overview

## Project Goal

BubAudio is a local desktop music player built with Tauri and JavaScript.

The application focuses on:

- Local music library management.
- Audio playback.
- Playback queue management.
- Audio visualization using WebGL shaders.
- Performance and maintainability.
- Minimal external dependencies.

---

# Core Architecture

Application is the root coordinator.

Application owns and orchestrates:

- Player
- LibraryIndexer
- AudioAnalyzer
- QueuePanel
- Visualizer

Application should remain lightweight and should mainly coordinate communication between subsystems.

---

# Audio System

## AudioAnalyzer

AudioAnalyzer is the owner of:

- AudioContext
- Audio Element
- AnalyserNode

Important:

AudioAnalyzer is the single source of truth for audio processing.

Do NOT create additional AudioContext instances.

Do NOT create additional Audio elements outside AudioAnalyzer unless explicitly requested.

Audio playback must go through AudioAnalyzer.

---

## Player

Player controls playback.

Responsibilities:

- Play tracks.
- Pause tracks.
- Stop tracks.
- Navigate queue.
- Coordinate PlaybackQueue and AudioAnalyzer.

Player should not store library data.

Player should consume tracks provided by PlaybackQueue.

---

# Queue System

## PlaybackQueue

PlaybackQueue is the central playback state.

Responsibilities:

- Store tracks.
- Manage currentIndex.
- Manage queueId.
- Manage playback history.
- Support shuffle mode.
- Support repeat mode.
- Provide next and previous navigation.

Tracks stored in PlaybackQueue are full Track objects.

Avoid storing only IDs whenever possible.

PlaybackQueue should remain independent from UI code.

---

# Library System

## LibraryIndexer

LibraryIndexer is responsible for:

- Reading music files.
- Building the music database.
- Managing artists.
- Managing albums.
- Managing tracks.

Known helper methods may include:

- getTrack(...)
- getAlbumTracks(...)
- getArtistTracks(...)

LibraryIndexer should never control playback directly.

---

# User Interface

## QueuePanel

QueuePanel displays PlaybackQueue contents.

Responsibilities:

- Render queue entries.
- Highlight current track.
- Allow track selection.
- Notify Player when a user selects a track.

QueuePanel must never start playback directly.

QueuePanel communicates through Player.

---

## PlayerControls

PlayerControls manages playback interactions.

Responsibilities:

- Play
- Pause
- Previous
- Next
- Shuffle
- Repeat

PlayerControls must use Player APIs.

Avoid business logic inside the UI.

---

# Visualization System

## Visualizer

Visualizer is responsible for shader rendering.

Responsibilities:

- Render audio visualizations.
- Consume AudioAnalyzer data.
- Load shaders.
- Manage shader selection.

Important:

Shaders are loaded from the shader collection.

Avoid embedding shader source code directly into classes.

Shader selection may be persisted using localStorage.

---

# Shader System

## Overview

BubAudio supports audio-reactive fragment shaders.

Shaders are loaded dynamically and rendered by the Visualizer.

The Visualizer provides a standard set of uniforms to every shader.

When generating or modifying shaders, always assume these uniforms already exist.

Do not redefine them.

---

## Available Uniforms

All fragment shaders receive:

```glsl
varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;

uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;
```

---

## Coordinates

### vUv

Normalized UV coordinates.

```glsl
vUv.x
```

goes from:

```text
0.0 → left edge
1.0 → right edge
```

```glsl
vUv.y
```

goes from:

```text
0.0 → bottom edge
1.0 → top edge
```

Used for positioning and screen-space effects.

---

### uTime

Continuous application time in seconds.

Important:

- Does not restart when changing songs.
- Does not restart when changing shaders.

Typical usage:

```glsl
sin(uTime)
cos(uTime)
```

for animation.

---

### uResolution

Renderer size in pixels.

```glsl
uResolution.x
```

is width.

```glsl
uResolution.y
```

is height.

Useful for aspect ratio correction.

---

## Audio Band Analysis

The following values are normalized to:

```text
0.0 → 1.0
```

and smoothed between frames.

---

### uBass

Average energy between:

```text
20 Hz → 250 Hz
```

Useful for:

- kicks
- bass lines
- large scale motion

---

### uMid

Average energy between:

```text
250 Hz → 4000 Hz
```

Useful for:

- instruments
- guitars
- vocals

---

### uTreble

Average energy between:

```text
4000 Hz → 16000 Hz
```

Useful for:

- cymbals
- high frequency detail
- sparkle effects

---

### uVolume

Global spectral energy.

Important:

This is NOT the player volume control.

It is the overall audio energy detected by the analyzer.

---

## Beat Detection

The following uniforms are impulse envelopes.

Range:

```text
0.0 → 1.0
```

They are triggered when energy rises rapidly.

They are not BPM values.

They are not guaranteed to trigger on every musical beat.

---

### uBeat

Bass transient detector.

Useful for:

- flashes
- scaling
- explosions
- camera pulses

---

### uMidBeat

Mid-frequency transient detector.

Useful for:

- shape deformation
- color changes
- rotations

---

### uTrebleBeat

High-frequency transient detector.

Useful for:

- spark effects
- highlights
- glow pulses

---

## Audio Textures

Both textures are:

```text
1024 x 1
```

The useful value is stored in:

```glsl
.r
```

---

### uSpectrum

Current FFT spectrum.

Access example:

```glsl
float value = texture2D(
    uSpectrum,
    vec2(x, 0.5)
).r;
```

Properties:

- left = low frequencies
- right = high frequencies

Typical usage:

- radial spectrums
- bars
- frequency-driven geometry

---

### uWaveform

Current time-domain waveform.

Access example:

```glsl
float waveform =
    texture2D(
        uWaveform,
        vec2(x, 0.5)
    ).r * 2.0 - 1.0;
```

Properties:

- centered around 0.5
- convert to [-1,+1] for signal processing

Typical usage:

- oscilloscopes
- waveform trails
- line rendering

---

## Shader Development Rules

When generating shaders:

- Always use the uniforms already provided by the Visualizer.
- Never redefine existing uniforms.
- Prefer uBass, uMid and uTreble for broad audio reactions.
- Prefer uBeat, uMidBeat and uTrebleBeat for flashes and impulses.
- Use uSpectrum when spectral precision is required.
- Use uWaveform when temporal signal detail is required.

---

## Shader Coding Style

Preferred characteristics:

- Single self-contained fragment shader.
- No external resources.
- Procedural graphics.
- Audio-reactive visuals.
- Good performance on consumer GPUs.

Avoid:

- Expensive nested loops.
- Excessive texture sampling.
- Hardcoded resolutions.
- Shader-specific assumptions about music genre.

Shaders should work with any audio source.

---

# Track Model

Track objects should contain complete information whenever possible.

Expected properties:

- id
- title
- artist
- album
- duration
- path

PlaybackQueue should store complete Track objects.

---

# Development Rules

Before modifying any class:

1. Locate the file.
2. Read the complete implementation.
3. Identify dependencies.
4. Search for references.
5. Explain side effects before refactoring.

Do not assume APIs.

Do not invent methods.

If a method or property is not found, search the project first.

---

# Code Generation Rules

Generated code must:

- Be complete.
- Be production-ready.
- Include comments.
- Preserve existing architecture.
- Avoid placeholders.
- Avoid pseudocode.

Generate full implementations whenever possible.

---

# Preferred Coding Style

Use:

- Modern JavaScript.
- ES6 classes.
- Private fields (#field) when appropriate.
- Clear method names.
- Strong encapsulation.

Prefer maintainability over micro-optimizations.

Comments should explain intent, not obvious code behavior.

---

# Agent Workflow

When asked to implement a feature:

1. Search related classes.
2. Read relevant files.
3. Analyze architecture.
4. Explain proposed changes.
5. Generate code.

Never assume project structure.

Always inspect the repository before making architectural decisions.